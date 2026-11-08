// No-Claude test of the engine's pipeline logic: node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as E from '../plugin/hooks/engine.js'

const P = JSON.parse(readFileSync(new URL('../plugin/pipelines/hello.json', import.meta.url), 'utf8'))
const at = (finished, extra = {}) => ({ ...E.freshState('hello'), finished, ...extra })

test('the pipeline file is well formed', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  assert.match(E.checkPipeline({ steps: [{ id: 'a', kind: 'talk', needs: ['zzz'] }] })[0], /needs zzz/)
})

test('steps run in order; a step never starts before its needs', () => {
  assert.equal(E.nextStep(P, at([])).id, 'name')
  assert.equal(E.nextStep(P, at(['name'])).id, 'approve')
  assert.equal(E.nextStep(P, at(['name', 'approve', 'plan'])).id, 'hello')
  assert.equal(E.nextStep(P, at(['name', 'approve', 'plan', 'hello', 'review'])), null)
})

test('check 1: a tool from a later step is refused (out of order)', () => {
  const s = E.begin(at([]), E.stepById(P, 'name'), 1)
  assert.equal(E.judgeTool(P, s, { tool: 'Write' }).allow, false)
  assert.equal(E.judgeTool(P, s, { tool: 'Workflow' }).allow, false)
  assert.equal(E.judgeTool(P, s, { tool: 'AskUserQuestion' }).allow, true)
  assert.equal(E.judgeTool(P, s, { tool: E.ENGINE_TOOL }).allow, true)
})

test('check 12: the review step may read but not edit', () => {
  const s = E.begin(at(['name', 'approve', 'plan', 'hello']), E.stepById(P, 'review'), 1)
  assert.equal(E.judgeTool(P, s, { tool: 'Read' }).allow, true)
  for (const t of ['Edit', 'Write', 'Bash', 'PowerShell', 'NotebookEdit']) assert.equal(E.judgeTool(P, s, { tool: t }).allow, false, t)
})

test('a gate allows only the question; helpers only their own tools', () => {
  const g = E.begin(at(['name']), E.stepById(P, 'approve'), 1)
  assert.equal(g.status, 'waiting')
  assert.equal(E.judgeTool(P, g, { tool: 'Read' }).allow, false)
  assert.equal(E.judgeTool(P, g, { tool: 'AskUserQuestion' }).allow, true)
  const f = E.begin(at(['name', 'approve', 'plan']), E.stepById(P, 'hello'), 1)
  assert.equal(E.judgeTool(P, f, { tool: 'Write', agentId: 'a1' }).allow, true)
  assert.equal(E.judgeTool(P, f, { tool: 'Bash', agentId: 'a1' }).allow, false)
  assert.equal(E.judgeTool(P, f, { tool: 'Workflow' }).rewriteWorkflow, true)
})

test('gate answers: approve moves on, the other option goes back to the named step', () => {
  const gate = E.stepById(P, 'approve')
  const s = E.begin(at(['name']), gate, 1)
  assert.deepEqual(E.answerGate(P, s, gate, 'Approve').state.finished, ['name', 'approve'])
  const back = E.answerGate(P, s, gate, 'Change the name')
  assert.equal(back.approved, false)
  assert.equal(E.nextStep(P, back.state).id, 'name')
})

test('check 13: a failed done-check retries twice, then BLOCKS', () => {
  const step = E.stepById(P, 'plan')
  let s = E.begin(at(['name', 'approve']), step, 1)
  const r1 = E.onFail(s, step, 'x'); assert.equal(r1.action, 'retry'); assert.equal(r1.attempt, 2)
  const r2 = E.onFail(r1.state, step, 'x'); assert.equal(r2.action, 'retry'); assert.equal(r2.attempt, 3)
  const r3 = E.onFail(r2.state, step, 'x'); assert.equal(r3.action, 'block')
  assert.equal(r3.state.status, 'blocked')
  assert.equal(E.judgeTool(P, r3.state, { tool: 'Read' }).allow, false)
})

test('done-checks read results and files', () => {
  const v = { name: 'Moon Goat' }
  assert.equal(E.doneCheck(E.stepById(P, 'name'), v, { result: { name: 'Moon Goat' } }).ok, true)
  assert.equal(E.doneCheck(E.stepById(P, 'name'), v, { result: {} }).ok, false)
  const hello = E.stepById(P, 'hello')
  assert.equal(E.doneCheck(hello, v, { files: { 'hello.html': '<h1>Hello Moon Goat</h1>' } }).ok, true)
  assert.equal(E.doneCheck(hello, v, { files: { 'hello.html': '<h1>Hello</h1>' } }).ok, false)
  assert.equal(E.doneCheck(hello, v, { files: { 'hello.html': null } }).ok, false)
  assert.equal(E.doneCheck(E.stepById(P, 'plan'), v, { files: { 'plan.json': '{"pages":[]}' } }).ok, false)
})

test('check 4: the watchdog sees a step past its limit', () => {
  const s = E.begin(at(['name', 'approve', 'plan']), E.stepById(P, 'hello'), 1000)
  assert.equal(E.isStalled(P, s, 1000 + 60_000, 1_200_000), false)
  assert.equal(E.isStalled(P, s, 1000 + 1_200_001, 1_200_000), true)
  assert.equal(E.isStalled(P, E.begin(at(['name']), E.stepById(P, 'approve'), 0), 9e12, 1), false, 'a gate never stalls')
})

test('check 5: band words for working / waiting / done', () => {
  assert.match(E.bandText(P, E.begin(at([]), E.stepById(P, 'name'), 0), 65_000), /step 1 of 5 · name · working · 01:05/)
  assert.match(E.bandText(P, E.begin(at(['name']), E.stepById(P, 'approve'), 0), 0), /waiting for you/)
  assert.match(E.bandText(P, { ...at([]), status: 'done' }, 0), /all 5 steps done/)
})

test('check 3 / doctor: state rebuilt from the journal alone lands on the right step', () => {
  const lines = readFileSync(new URL('../evidence/run3-full-pipeline.journal.jsonl', import.meta.url), 'utf8').split('\n')
  const cut = lines.findIndex(l => l.includes('"ev":"gate.pending"'))
  const mid = E.rebuildFromJournal('hello', lines.slice(0, cut + 1))
  assert.equal(mid.current, 'approve'); assert.equal(mid.status, 'waiting'); assert.equal(mid.results.name, 'Moon Goat')
  assert.equal(E.rebuildFromJournal('hello', lines).status, 'done')
})

test('flow results are read out of a task notification', () => {
  const n = E.parseTaskNotification('<task-notification>\n<task-id>w1</task-id>\n<tool-use-id>toolu_9</tool-use-id>\n<status>completed</status>\n<result>{"wrote":"hello.html"}</result>\n</task-notification>')
  assert.deepEqual(n, { taskId: 'w1', toolUseId: 'toolu_9', status: 'completed', result: { wrote: 'hello.html' } })
  assert.equal(E.parseTaskNotification('hi'), null)
})
