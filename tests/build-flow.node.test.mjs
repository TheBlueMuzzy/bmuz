// F216 task 4: bmuz:build-flow, run with fake helpers (no session): one fresh builder per feature; a separate reviewer
// whose findings are each confirmed by another reader; only confirmed findings reach the builder that fixes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const body = readFileSync(new URL('../plugin/workflows/build-flow.js', import.meta.url), 'utf8').replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')
async function runFlow(args, answer) {
  const prompts = []
  const logs = []
  const agent = async (prompt, opts = {}) => { prompts.push({ prompt, opts }); return answer(prompt, opts) }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const run = new Function('args', 'agent', 'parallel', 'log', 'phase', `return (async () => {\n${body}\n})()`)
  const result = await run(args, agent, parallel, m => logs.push(m), () => {})
  return { result, prompts, logs }
}
const REPORT = { tests: [{ rule: 'the turn passes', file: 'tests/turn.test.mjs', name: 'F01 the turn passes' }], changed: ['you can take a turn'], try: 'take a turn' }

test('build: one builder, briefed from the brief and earlier tries; every rule a test, values in content/, never commit or touch .bmuz', async () => {
  const r = await runFlow({ mode: 'build' }, () => REPORT)
  assert.equal(r.prompts.length, 1)
  const p = r.prompts[0]
  assert.equal(p.opts.label, 'build the feature')
  assert.ok(p.opts.schema && p.opts.schema.required.includes('tests'))
  assert.match(p.prompt, /Read \.bmuz\/develop\/brief\.md first/)
  assert.match(p.prompt, /If \.bmuz\/develop\/tries\.md has anything in it, an earlier try failed/)
  assert.match(p.prompt, /Every rule this feature builds gets a test/)
  assert.match(p.prompt, /lives in content\/ JSON/)
  assert.match(p.prompt, /never commit or push/)
  assert.match(p.prompt, /in the foreground with a timeout/)
  assert.match(p.prompt, /phone size \(390×844\) and desktop size \(1280×800\)/)
  assert.deepEqual(r.result, REPORT)
  await assert.rejects(runFlow({ mode: 'build' }, () => null), /the builder did not come back/)
})

test('review: a reviewer who did not build it; each finding confirmed by another reader; unconfirmed ones dropped', async () => {
  const r = await runFlow({ mode: 'review' }, (prompt, opts) => {
    if (opts.label === 'review') return { findings: [{ file: 'src/garden.js', what: 'hand size written as 3', why: 'not tunable' }, { file: 'src/x.js', what: 'odd name', why: 'style' }] }
    return { real: /hand size/.test(prompt), why: '' }
  })
  assert.match(r.prompts[0].prompt, /You did not build it/)
  assert.match(r.prompts[0].prompt, /Use only Read, Glob and Grep/)
  assert.equal(r.prompts.filter(p => /^confirm/.test(p.opts.label)).length, 2)
  assert.deepEqual(r.result, { findings: [{ file: 'src/garden.js', what: 'hand size written as 3', why: 'not tunable' }], found: 2, weakened: [] })
  // (review fix 2c: the changed existing tests are a must-check)
  assert.match(r.prompts[0].prompt, /A must-check .*read \.bmuz\/develop\/changed-tests\.md/)
  assert.deepEqual(r.logs, ['1 finding(s) not confirmed, dropped'])
})

test('fix: the builder reads the confirmed findings (none = change nothing) and reports the tests as they are', async () => {
  const r = await runFlow({ mode: 'fix' }, () => REPORT)
  assert.match(r.prompts[0].prompt, /Read \.bmuz\/develop\/review\.md: its confirmed findings\. If it says there are none, change nothing/)
  assert.deepEqual(r.result, REPORT)
})
