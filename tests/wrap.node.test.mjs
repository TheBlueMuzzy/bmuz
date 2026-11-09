// No-Claude test of wrapping up early (F217, docs/pipeline-format.md "Wrapping up early"): a talk step's
// "wrapTo" skips the steps up to it, an "always" step still runs, and the journal rebuild ends the same.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const P = {
  id: 'w',
  version: 1,
  steps: [
    { id: 'spark', kind: 'talk', tools: ['Read'], craft: 'craft/a.md', results: ['brief', 'slug'], wrapTo: 'board' },
    { id: 'feel', kind: 'talk', needs: ['spark'], tools: ['Read'], craft: 'craft/a.md', results: ['experiences'], wrapTo: 'board', recap: ['brief'] },
    { id: 'dig', kind: 'flow', needs: ['feel'], always: true, workflow: 'bmuz:research-flow', args: { brief: '{brief}', experiences: '{experiences}', note: 'feel: {experiences}' } },
    { id: 'verbs', kind: 'talk', needs: ['dig'], tools: ['Read'], craft: 'craft/a.md', results: ['verbs'], wrapTo: 'board' },
    { id: 'save', kind: 'script', needs: ['verbs'], always: true, run: ['node', 'x.mjs'] },
    { id: 'board', kind: 'talk', needs: ['save'], tools: ['Read'], craft: 'craft/a.md', handoff: true },
  ],
}
const step = id => E.stepById(P, id)
const after = (state, id, result) => E.finish({ ...state, current: id, status: 'working' }, step(id), result)

test('wrap: the pipeline check knows wrapTo, always and recap', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  const back = structuredClone(P)
  back.steps[3].wrapTo = 'spark'
  assert.ok(E.checkPipeline(back).some(x => /"wrapTo" "spark" is not a later step/.test(x)))
  back.steps[3].wrapTo = 'nowhere'
  assert.ok(E.checkPipeline(back).some(x => /"wrapTo" "nowhere" is not a later step/.test(x)))
  const bad = structuredClone(P)
  bad.steps[2].always = 'yes'
  bad.steps[1].recap = ['slugg']
  bad.steps[4].wrapTo = 'board' // a script step can't offer a wrap-up: only talk steps ask
  const problems = E.checkPipeline(bad)
  assert.ok(problems.some(x => /"always" must be true or false/.test(x)))
  assert.ok(problems.some(x => /"recap" key "slugg" isn't a result/.test(x)))
  assert.ok(problems.some(x => /\(script\) has an unknown setting "wrapTo"/.test(x)))
})

test('wrap: wrapping up after spark skips the talk steps, keeps the "always" ones, and goes on to them', () => {
  let s = after(E.freshState('w'), 'spark', { brief: 'a lighthouse', slug: 'lighthouse' })
  const skipped = E.wrapSkips(P, s, step('spark'))
  assert.deepEqual(skipped, ['feel', 'verbs'])
  s = E.applyWrap(s, skipped, E.wrapEmpties(P, s, skipped))
  assert.deepEqual(s.skipped, ['feel', 'verbs'])
  assert.equal(E.nextStep(P, s).id, 'dig') // the always-step runs
  // a hole from a skipped step: a whole-hole flow arg gets null, a hole inside text fills as nothing
  assert.deepEqual(E.fillArgs(step('dig').args, s.results), { brief: 'a lighthouse', experiences: null, note: 'feel: ' })
  s = after(s, 'dig', null)
  assert.equal(E.nextStep(P, s).id, 'save') // "verbs" was skipped, "save" needs it: it counts as finished
  s = after(s, 'save', null)
  assert.equal(E.nextStep(P, s).id, 'board')
})

test('wrap: a skipped step never blanks a result an earlier step gave', () => {
  let s = after(E.freshState('w'), 'spark', { brief: 'a lighthouse', slug: 'lighthouse' })
  s = after(s, 'feel', { experiences: ['a storm night'] })
  s = after(s, 'dig', null)
  const skipped = E.wrapSkips(P, s, step('feel')) // (a later wrap: only "verbs" is left to skip)
  assert.deepEqual(skipped, ['verbs'])
  s = E.applyWrap(s, skipped, E.wrapEmpties(P, s, skipped))
  assert.deepEqual(s.results.experiences, ['a storm night'])
  assert.equal(s.results.verbs, null)
})

test('wrap: the journal rebuild ends where the motor did; undo runs a skipped step for real', () => {
  const lines = [
    { ev: 'step.start', step: 'spark', kind: 'talk', t: 1 },
    { ev: 'step.done', step: 'spark', result: { brief: 'a lighthouse', slug: 'lighthouse' } },
    { ev: 'wrap', step: 'spark', to: 'board', skipped: ['feel', 'verbs'], empties: { feel: { experiences: null }, verbs: { verbs: null } } },
  ].map(x => JSON.stringify(x))
  const s = E.rebuildFromJournal('w', lines)
  assert.deepEqual(s.finished, ['spark', 'feel', 'verbs'])
  assert.deepEqual(s.skipped, ['feel', 'verbs'])
  assert.equal(s.results.experiences, null)
  const list = E.undoList(P, s)
  assert.match(list.find(u => u.step === 'feel').line, /\(skipped when you wrapped up\)/)
  const back = E.undoTo(P, s, 'feel')
  assert.deepEqual(back.state.skipped, [])
  assert.equal(E.nextStep(P, back.state).id, 'feel')
})

test('wrap: the talk prompt offers the wrap-up with "Keep going" first; an auto run keeps going; recap shows earlier results', () => {
  const words = E.talkPrompt(step('feel'), 'craft', '', false, [], { recap: { brief: 'a lighthouse', none: null }, wrap: { next: 'theme dig', to: 'the brick board' } })
  assert.match(words, /Collected so far by earlier steps \(build on it; don't ask it again\): \{"brief":"a lighthouse"\}/)
  assert.match(words, /"Keep going \(next: theme dig\), or wrap up now \(what's collected is saved, then the brick board\)\?" with the options "Keep going" first and "Wrap up"/)
  assert.match(words, /add "wrap": true to the result/)
  const auto = E.talkPrompt(step('feel'), 'craft', '', true, [], { wrap: { next: 'x', to: 'y' } })
  assert.match(auto, /in an auto run keep going/)
  assert.doesNotMatch(auto, /Collected so far/)
  assert.doesNotMatch(E.talkPrompt(step('board'), 'craft', '', false), /Wrap-up/)
})
