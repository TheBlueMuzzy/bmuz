// No-Claude tests of Define's two workflows (F218): the fit check and the concept review run with fake
// helpers, so their rules (choose nothing, read project files only, findings become questions) are checked
// without a session. Also the engine's test-answers stand-in (bmuz.json "testAnswers", BMUZ_TEST=1 only).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as E from '../plugin/hooks/engine.js'

const body = f => readFileSync(new URL(`../plugin/workflows/${f}`, import.meta.url), 'utf8').replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')

// Runs a flow body. answer(prompt, opts) plays every helper; returns { result, written, prompts, logs }.
async function runFlow(file, args, answer) {
  const prompts = []
  const logs = []
  let written = null
  const agent = async (prompt, opts = {}) => {
    prompts.push({ prompt, opts })
    if (/Use the Write tool/.test(prompt)) {
      written = { path: prompt.match(/create the file (\S+)/)[1], text: prompt.split('=====\n')[1].replace(/\n$/, '') }
      return 'written'
    }
    return answer(prompt, opts)
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const run = new Function('args', 'agent', 'parallel', 'log', 'phase', `return (async () => {\n${body(file)}\n})()`)
  const result = await run(args, agent, parallel, m => logs.push(m), () => {})
  return { result, written, prompts, logs }
}

const CHOICES = {
  primaries: [{ text: 'quiet care', his: true }],
  pillars: [{ pillar: 'Every moment is quiet care', kind: 'feeling', settles: 'no rush' }],
  coreVerbs: [{ verb: 'trim', outcome: 'keep a resource from running down' }],
  story: null, // a step skipped by a wrap-up arrives as null
}

test('fit flow: three checks alone, reading project files only; repeats folded with who saw them; nothing chosen', async () => {
  const seen = { tensions: [{ a: 'no rush', b: 'boats in fog', why: 'a boat in fog is a clock' }], against: [], onIceFits: [{ idea: 'a radio to talk to ships', brick: 'OI1', why: 'fits quiet care' }], gaps: [{ text: 'nothing delivers the dream' }], checked: 'read both files' }
  const r = await runFlow('fit-flow.js', { choices: CHOICES, digest: '.planning/research/define-digest.md', discover: '.planning/DISCOVER.md', out: '.planning/research/define-fit.md' }, (p, o) => (o.label === 'check: unity' ? null : seen))
  assert.equal(r.prompts.filter(p => p.opts.phase === 'Check').length, 3)
  for (const p of r.prompts.filter(x => x.opts.phase === 'Check')) {
    assert.match(p.prompt, /Find, never choose: no recommendation, no ranking/)
    assert.match(p.prompt, /Use only Read, Glob and Grep\. Change no file\./)
    assert.match(p.prompt, /- primaries: quiet care/)
    assert.doesNotMatch(p.prompt, /- story:/) // a null choice is left out
  }
  assert.equal(r.written.path, '.planning/research/define-fit.md')
  assert.match(r.written.text, /## Tensions\n- no rush ↔ boats in fog: a boat in fog is a clock \(seen by: Decisions & pillars, The shelves\)/)
  assert.match(r.written.text, /## On-ice ideas that fit now\n- a radio to talk to ships \[OI1\]: fits quiet care/)
  assert.match(r.written.text, /## Bricks against a pillar\n- none found/)
  assert.match(r.written.text, /- Unity: no answer from this helper/)
  assert.deepEqual(r.logs, ['no answer from: unity'])
  assert.equal(r.result.tensions, 1)
})

test('fit flow: a report path outside the project falls back to the default', async () => {
  const r = await runFlow('fit-flow.js', { choices: CHOICES, out: '../escape.md' }, () => ({ tensions: [], against: [], onIceFits: [], gaps: [], checked: 'x' }))
  assert.equal(r.written.path, '.planning/research/define-fit.md')
})

test('fit flow: nothing chosen yet (an auto run chooses nothing): no helper runs, the report says so, the step does not fail', async () => {
  const r = await runFlow('fit-flow.js', { choices: { story: [], pillars: null, product: {} } }, () => assert.fail('no helper should run'))
  assert.equal(r.prompts.filter(p => p.opts.phase === 'Check').length, 0)
  assert.match(r.written.text, /## Tensions\n- none found/)
  assert.match(r.written.text, /## What was checked\n- nothing: no choices yet/)
  assert.equal(r.result.tensions, 0)
})

test('concept review: two reviewers who did not write it; each finding becomes a card question (taste / want / choice, never engineering)', async () => {
  const answer = (p, o) => (o.label === 'review: traces'
    ? { findings: [{ check: 2, part: 'Pillars', finding: 'no pillar for "quiet care"', key: 'Concept Pillar Care!', q: 'Which pillar carries quiet care', kind: 'choice', options: ['pillar 1'] }], agrees: [{ check: 1, note: 'the story uses trim' }], notChecked: ['Scope per release: open'] }
    : { findings: [{ check: 2, part: 'Made of', finding: 'the theme could be swapped', key: 'concept-theme', q: 'Does trimming feel like a keeper?', kind: 'taste', options: [] }, { check: 1, part: 'x', finding: 'dup', key: 'concept-theme', q: 'again?', kind: 'want', options: [] }], agrees: [], notChecked: [] })
  const r = await runFlow('concept-check-flow.js', { gdd: '.planning/GDD.md', discover: '.planning/DISCOVER.md', decisions: '.bmuz/decisions.md', out: '.planning/research/define-check.md' }, answer)
  const reviews = r.prompts.filter(p => p.opts.phase === 'Review')
  assert.equal(reviews.length, 2)
  for (const p of reviews) {
    assert.match(p.prompt, /You review it; you did not write it\./)
    assert.match(p.prompt, /You choose nothing and change no file\./)
    assert.match(p.prompt, /Never an engineering question/)
  }
  assert.match(reviews[1].prompt, /contradicts a decision already recorded in \.bmuz\/decisions\.md/)
  // a choice with fewer than 2 options becomes a want; a question gets its "?"; the key becomes a slug; a repeat key is dropped
  assert.deepEqual(r.result.questions, [
    { key: 'concept-pillar-care', q: 'Which pillar carries quiet care?', kind: 'want', options: ['pillar 1'] },
    { key: 'concept-theme', q: 'Does trimming feel like a keeper?', kind: 'taste', options: [] },
  ])
  for (const q of r.result.questions) assert.equal(E.checkCard({ title: 't', done: 'd', see: 's', try: 't', proof: ['p'], todos: 'none', next: 'n', questions: [q] }).ok, true)
  assert.match(r.written.text, /## Findings\n- Pillars: no pillar for "quiet care" \(Traces: every pillar traces to a primary feeling/)
  assert.match(r.written.text, /→ question `concept-pillar-care` \(want\): Which pillar carries quiet care\? Options: pillar 1/)
  assert.match(r.written.text, /## Not checked \(open parts\)\n- Scope per release: open/)
})

test('concept review: the report never goes into .bmuz, even when asked', async () => {
  const r = await runFlow('concept-check-flow.js', { out: '.bmuz/check.md' }, () => ({ findings: [], agrees: [], notChecked: [] }))
  assert.equal(r.written.path, '.planning/research/define-check.md')
  assert.match(r.written.text, /## Findings\n- none: every check that could run agrees/)
})

test('test answers: refused without BMUZ_TEST=1; with it, the talk step\'s prompt carries them as the creative\'s words', () => {
  assert.equal(E.testAnswersProblem({ pipeline: 'define' }, ''), null)
  assert.match(E.testAnswersProblem({ testAnswers: { direction: 'calm' } }, ''), /for BMUZ's own tests only .* only when BMUZ_TEST=1/)
  assert.match(E.testAnswersProblem({ testAnswers: ['x'] }, '1'), /must be an object of talk step ids/)
  assert.equal(E.testAnswersProblem({ testAnswers: { direction: 'calm' } }, '1'), null)
  const step = { id: 'direction', kind: 'talk', results: ['primaries'] }
  const p = E.talkPrompt(step, 'CRAFT', '', true, [], { answers: { 'Which feeling?': 'quiet care' } })
  assert.match(p, /Test run: these are the creative's own answers to this step's questions, as if they had typed them in the chat: \{"Which feeling\?":"quiet care"\}/)
  assert.ok(p.indexOf('Test run:') < p.indexOf('CRAFT'))
  assert.doesNotMatch(E.talkPrompt(step, 'CRAFT', '', true, [], {}), /Test run:/)
})
