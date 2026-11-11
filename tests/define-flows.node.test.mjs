// No-Claude tests of Define's clash check workflow (F232, the script's 2.6; it replaced F218's fit check and concept review): run with fake
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


test('clash check (2.6): two reviewers who did not write the concept, each alone, reading project files only; each clash as A, B and why; nothing chosen', async () => {
  const seen = []
  const r = await runFlow('clash-flow.js', {}, (prompt, opts) => {
    seen.push(opts)
    assert.match(prompt, /You review it; you did not write it/)
    assert.match(prompt, /Read \.planning\/GDD\.md \(its "Part 1 · The concept" chapters/)
    assert.match(prompt, /You choose nothing and change no file/)
    if (opts.label === 'review: pulls') return { clashes: [{ check: 1, a: '"Quick games"', b: 'the pillar "Big comebacks"', why: 'a comeback needs time to build, and a 3-minute game may not have it.' }], holds: 'the weather keeps every game close' }
    assert.match(prompt, /pasted-on theme \(Juul\)[\s\S]*real trade-offs \(Meier\)[\s\S]*only because it's cool \(Thornton\)/)
    return { clashes: [{ check: 1, a: '"Quick games"', b: 'the pillar "Big comebacks"', why: 'same' }, { check: 3, a: 'the hailstorm card art', b: 'the core loop', why: 'nothing in the loop asks for it' }], holds: 'x' }
  })
  assert.deepEqual(seen.filter(o => o.schema).map(o => o.label), ['review: pulls', 'review: inside'])
  assert.equal(r.written.path, '.planning/research/define-clash.md')
  assert.match(r.written.text, /## Clashes\nEach line: number :: A :: B :: why\n1 :: "Quick games" :: the pillar "Big comebacks" :: a comeback needs time to build, and a 3-minute game may not have it \(Pulls\)\n2 :: the hailstorm card art :: the core loop :: nothing in the loop asks for it \(Inside view\)\n/)
  assert.match(r.written.text, /## Holds together\nthe weather keeps every game close\n/)
  assert.equal(r.result.clashes, 2)
})

test('clash check: none found says so; the report never goes into .bmuz, even when asked; no reviewer back is a failure', async () => {
  const r = await runFlow('clash-flow.js', { out: '.bmuz/clash.md' }, () => ({ clashes: [], holds: 'every part serves the close race' }))
  assert.equal(r.written.path, '.planning/research/define-clash.md')
  assert.match(r.written.text, /## Clashes\nEach line: number :: A :: B :: why\n- none\n/)
  await assert.rejects(runFlow('clash-flow.js', {}, () => { throw new Error('down') }), /no clash reviewer came back/)
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
