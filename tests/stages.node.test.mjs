// No-Claude test of the stages (F225, docs/pipeline-format.md "Stages"): a pipeline's "next", starting a pipeline
// at a named step with the intake's material, the stage intros (once per run), and the journal rebuild across a switch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const P = {
  id: 'ideate',
  version: 1,
  next: { pipeline: 'define' },
  steps: [
    { id: 'spark', kind: 'talk', tools: ['Read'], craft: 'craft/a.md', results: ['brief', 'slug', 'youAre'] },
    { id: 'feel', kind: 'talk', needs: ['spark'], tools: ['Read'], craft: 'craft/a.md', results: ['experiences', 'fantasies'] },
    { id: 'dig', kind: 'flow', needs: ['feel'], always: true, workflow: 'bmuz:research-flow', args: { brief: '{brief}', experiences: '{experiences}', fantasies: '{fantasies}', out: 'r/{slug}.md' } },
    { id: 'verbs', kind: 'talk', needs: ['dig'], tools: ['Read'], craft: 'craft/a.md', results: ['verbs'] },
  ],
}
const GIVEN = { brief: 'a lighthouse', slug: 'lighthouse', youAre: [{ text: 'You are a keeper', his: true }], experiences: [{ text: 'tea in a storm', his: true }], verbs: [{ text: 'tend the lamp', his: true }] }

test('a pipeline\'s "next" is checked: a stage, or one hole a talk step hands back; carry is a project .json file', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  const bad = next => E.checkPipeline({ ...P, next })
  assert.match(bad({ pipeline: 'designn' }).join(), /"next" pipeline "designn" isn't a stage/)
  assert.match(bad({ pipeline: '{stage}' }).join(), /\{stage\} isn't a result any talk step hands back/)
  assert.match(bad({ pipeline: 'define', carry: '../x.json' }).join(), /"carry" must be a .json file inside the project/)
  assert.match(bad({ pipeline: 'define', ask: 'no' }).join(), /"ask" must be true or false/)
  assert.match(bad({ pipeline: 'define', then: 1 }).join(), /unknown setting "then"/)
  assert.deepEqual(E.checkPipeline({ ...P, next: { pipeline: '{brief}', at: '{slug}', carry: '.planning/research/intake.json', ask: false } }), [])
})

test('nextOf fills the holes from the results; "later" and a hole left empty mean no next; "first" means the first step', () => {
  assert.deepEqual(E.nextOf(P, {}), { pipeline: 'define', at: null, carry: null, ask: true })
  const S = { ...P, next: { pipeline: '{stage}', at: '{at}', ask: false } }
  assert.deepEqual(E.nextOf(S, { stage: 'discover', at: 'feel' }), { pipeline: 'discover', at: 'feel', carry: null, ask: false })
  assert.equal(E.nextOf(S, { stage: 'discover', at: 'first' }).at, null)
  assert.equal(E.nextOf(S, { stage: 'later', at: 'first' }), null)
  assert.equal(E.nextOf(S, { stage: null }), null)
  assert.equal(E.nextOf({ ...P, next: undefined }, {}), null)
})

test('enterAt: steps above the entry are done by material, their keys filled from the intake or null; an "always" step still runs', () => {
  const out = E.enterAt(P, E.freshState('ideate'), 'verbs', GIVEN)
  assert.deepEqual(out.skipped, ['spark', 'feel'])
  const s = out.state
  assert.deepEqual(s.finished, ['spark', 'feel'])
  assert.deepEqual(s.entered, { at: 'verbs', skipped: ['spark', 'feel'] })
  assert.deepEqual(s.results, { brief: 'a lighthouse', slug: 'lighthouse', youAre: GIVEN.youAre, experiences: GIVEN.experiences, fantasies: null })
  // the "always" research runs first, and its args never carry "{fantasies}"
  assert.equal(E.nextStep(P, s).id, 'dig')
  const args = E.fillArgs(E.stepById(P, 'dig').args, s.results)
  assert.deepEqual(args, { brief: 'a lighthouse', experiences: GIVEN.experiences, fantasies: null, out: 'r/lighthouse.md' })
  // the entry step's own keys are shown as already chosen; empty ones are left out
  assert.deepEqual(E.givenFor(E.stepById(P, 'verbs'), s.given), { verbs: GIVEN.verbs })
  assert.deepEqual(E.givenFor(E.stepById(P, 'feel'), { experiences: [], fantasies: '' }), {})
  assert.match(E.enterAt(P, E.freshState('ideate'), 'nope', {}).error, /"nope" isn't a step of ideate/)
  // no step named: the first step, nothing skipped, the material still carried
  const plain = E.enterAt(P, E.freshState('ideate'), null, GIVEN).state
  assert.deepEqual([plain.finished, plain.given.brief], [[], 'a lighthouse'])
})

test('the undo list marks steps the material answered; going back before one runs it for real', () => {
  const s = E.enterAt(P, E.freshState('ideate'), 'verbs', GIVEN).state
  const list = E.undoList(P, s)
  assert.match(list.find(u => u.step === 'spark').line, /\(answered by your material when this stage started\)/)
  const back = E.undoTo(P, s, 'feel')
  assert.deepEqual([back.state.finished, back.state.skipped], [['spark'], ['spark']])
})

test('the stage intro: the first talk step of a stage pipeline shows it above its line, once; the start has none', () => {
  const intro = E.introFor(P, E.freshState('ideate'))
  assert.match(intro, /^We're in Ideate: gathering the material — your loose idea, captured\./)
  assert.equal(E.introFor(P, { ...E.freshState('ideate'), introShown: true }), null)
  assert.equal(E.introFor({ id: 'start' }, E.freshState('start')), null)
  const text = E.talkHeadline(E.stepById(P, 'spark'), intro)
  assert.ok(text.startsWith(intro + '\n\nBMUZ step "spark"'))
  assert.ok(E.isTalkHeadline(text))
  assert.ok(E.isTalkHeadline(E.talkHeadline(E.stepById(P, 'spark'))))
  assert.ok(!E.isTalkHeadline('BMUZ step "spark" (from the BMUZ engine; its instructions for this step are attached)\nand then something'))
  for (const s of E.STAGES) assert.ok(s.intro.split(/(?<=[.!?])\s/).length <= 3, `${s.id}'s intro is 3 sentences at most`)
  assert.match(E.talkPrompt(E.stepById(P, 'spark'), 'craft', '', false, [], { intro: true }), /already showed the creative this stage's short intro/)
})

test('a finished stage\'s band says where "bmuz go" goes next (only for a stage on the engine)', () => {
  assert.equal(E.bandText(P, { ...E.freshState('ideate'), status: 'done' }, 0), 'BMUZ · ideate · all 4 steps done · bmuz go: on to Define')
  assert.equal(E.bandText({ ...P, id: 'define', next: { pipeline: 'design' } }, { ...E.freshState('define'), status: 'done' }, 0), 'BMUZ · define · all 4 steps done')
})

test('a stage not on the engine says what to use for now; a word that is no stage says so', () => {
  assert.match(E.notOnEngineLine('design'), /^Design isn't on the BMUZ engine yet \(it comes with F227 — Design pipeline\)\. For now use today's \/define skill/)
  assert.match(E.notOnEngineLine('develop'), /^Develop isn't on the BMUZ engine yet\. For now use today's \/develop/)
  assert.match(E.notOnEngineLine('deliver'), /^Deliver isn't on the BMUZ engine yet \(it comes with F219 — Deliver pipeline\)\. For now use today's \/deliver skill \(nothing is renamed until F226\)/)
  assert.match(E.notOnEngineLine('release'), /^Release isn't on the BMUZ engine yet \(it comes with F230 — Release pipeline\)\. For now use today's \/deliver skill/)
  // F228: Discover is no longer a stage (its pipeline file stays on disk for the research flow)
  assert.deepEqual(E.STAGES.map(x => x.id), ['ideate', 'define', 'design', 'develop', 'deliver', 'release'])
  assert.match(E.notOnEngineLine('discover'), /"discover" isn't a stage/)
  assert.match(E.notOnEngineLine('designn'), /"designn" isn't a stage/)
})

test('the journal rebuild after a switch: "stage.enter" is the new stage\'s starting point, and the intro is remembered', () => {
  const first = E.enterAt(P, E.freshState('ideate'), 'verbs', GIVEN).state
  const lines = [
    JSON.stringify({ ev: 'stage.enter', from: 'start', to: 'ideate', state: first }),
    JSON.stringify({ ev: 'step.start', step: 'dig', kind: 'flow' }),
    JSON.stringify({ ev: 'step.done', step: 'dig', result: null }),
    JSON.stringify({ ev: 'step.start', step: 'verbs', kind: 'talk' }),
    JSON.stringify({ ev: 'intro', step: 'verbs', stage: 'ideate' }),
  ]
  const s = E.rebuildFromJournal('ideate', lines)
  assert.deepEqual([s.finished, s.current, s.status, s.introShown], [['spark', 'feel', 'dig'], 'verbs', 'working', true])
  assert.deepEqual(s.entered, first.entered)
  const kept = JSON.stringify({ ...s })
  const report = E.doctor(P, kept, lines, null, 'x', 0)
  assert.equal(report.fixed, false)
  assert.match(report.lines.join('\n'), /All good/)
})
