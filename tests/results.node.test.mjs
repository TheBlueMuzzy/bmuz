// No-Claude test of a talk step's "results" list (F217): several result keys a step must hand back,
// each usable as a {hole} later; a key that names a file must be a slug.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const P = {
  id: 'x',
  version: 1,
  steps: [
    { id: 'frame', kind: 'talk', tools: ['Read'], craft: 'craft/f.md', results: ['brief', 'slug', 'assumptions'] },
    { id: 'research', kind: 'flow', needs: ['frame'], workflow: 'bmuz:research-flow', args: { brief: '{brief}', assumptions: '{assumptions}', out: 'r/d-{slug}.md' }, writes: ['r/d-{slug}.md'] },
  ],
}
const frame = P.steps[0]

test('results: the pipeline check knows the keys as holes', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  const bad = structuredClone(P)
  bad.steps[0].results = ['ok', 'not a key']
  assert.ok(E.checkPipeline(bad).some(x => /"results" must be a list of result keys/.test(x)))
  bad.steps[0].results = ['brief']
  assert.ok(E.checkPipeline(bad).some(x => /\{slug\} isn't/.test(x)))
})

test('results: every key must come back; an empty list counts, an empty text does not', () => {
  assert.equal(E.resultProblems(P, frame, { brief: 'shake', slug: 'shake', assumptions: [] }), null)
  assert.match(E.resultProblems(P, frame, { brief: ' ', slug: 'shake' }), /no "brief", "assumptions"/)
  assert.equal(E.resultProblems(P, { id: 'y', kind: 'talk' }, {}), null) // no list, nothing to check
})

test('results: a key that names a file must be a slug', () => {
  for (const slug of ['../x', 'Screen Shake', 'a/b', 'x'.repeat(61)]) {
    assert.match(E.resultProblems(P, frame, { brief: 'b', slug, assumptions: [] }), /"slug" names a file, so it must be a short slug/, slug)
  }
})

test('writesOf fills the slug; a path whose hole is not a slug is left out', () => {
  assert.deepEqual(E.writesOf(P.steps[1], { slug: 'screen-shake' }), ['r/d-screen-shake.md'])
  assert.deepEqual(E.writesOf(P.steps[1], { slug: '../../x' }), [])
  assert.deepEqual(E.writesOf(P.steps[1], {}), [])
  assert.deepEqual(E.writesOf({ writes: ['plan.json'] }, {}), ['plan.json'])
})

test('fillArgs: a whole-hole arg gets the list itself; text holes fill as text', () => {
  const v = { brief: 'shake', slug: 'shake', assumptions: [{ text: 'more is better', important: true }] }
  const args = E.fillArgs(P.steps[1].args, v)
  assert.deepEqual(args, { brief: 'shake', assumptions: [{ text: 'more is better', important: true }], out: 'r/d-shake.md' })
  args.assumptions[0].text = 'changed'
  assert.equal(v.assumptions[0].text, 'more is better') // a copy, not the state's own object
})

test('talkPrompt asks for every results key', () => {
  const words = E.talkPrompt(frame, 'craft', '', false)
  assert.match(words, /result \{"brief":"\.\.\.","slug":"\.\.\.","assumptions":"\.\.\."\}/)
})

test('the undo list names a slugged file as it was written', () => {
  const state = { ...E.freshState('x'), finished: ['frame', 'research'], results: { slug: 'shake' } }
  assert.match(E.undoList(P, state)[0].line, /puts back r\/d-shake\.md/)
})
