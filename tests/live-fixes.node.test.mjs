// No-Claude tests of the 7 fixes from the live checks with Muzzy (proof-results.md, 2026-11-08).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as E from '../plugin/hooks/engine.js'

const P = JSON.parse(readFileSync(new URL('../plugin/pipelines/hello.json', import.meta.url), 'utf8'))
const atName = E.begin(E.freshState('hello'), E.stepById(P, 'name'), 0)

test('fix 1: an auto run refuses AskUserQuestion and says to take the default and list it in "asks"', () => {
  const v = E.judgeTool(P, atName, { tool: 'AskUserQuestion' }, { auto: true })
  assert.equal(v.allow, false)
  assert.match(v.why, /auto run, nobody is here to answer.*"asks"/)
  assert.equal(E.judgeTool(P, atName, { tool: 'AskUserQuestion' }, { auto: false }).allow, true)
})

test('fix 1: the talk prompt of an auto run forbids asking, in the tool and in plain text', () => {
  const step = E.stepById(P, 'name')
  assert.match(E.talkPrompt(step, 'Ask the name.', '', true), /Auto run: the creative is away. Never ask and never wait for an answer, with AskUserQuestion or in plain text/)
  assert.doesNotMatch(E.talkPrompt(step, 'Ask the name.', '', false), /Auto run/)
})

test('fix 1: auto-run questions become lines with the default taken', () => {
  assert.deepEqual(E.askLines('name', [{ question: 'Red or blue?', picked: 'blue' }, 'Bigger font?', { picked: 'x' }, null], '2026-11-08'), [
    '- [ ] 2026-11-08 · step name: Red or blue? — went with: blue',
    '- [ ] 2026-11-08 · step name: Bigger font?',
  ])
  assert.deepEqual(E.askLines('name', undefined, 'd'), [])
})

test('fix 4: a talk prompt says it comes from the engine and not to comment on it', () => {
  assert.match(E.talkPrompt(E.stepById(P, 'review'), 'Review.', '', false), /comes from the BMUZ engine, not the creative; do the step without commenting on the engine/)
})

test('fix 6: plan mode can hand in its plan; the work itself stays refused', () => {
  const atReview = E.begin({ ...E.freshState('hello'), finished: ['name', 'approve', 'plan', 'hello'] }, E.stepById(P, 'review'), 0)
  const ok = c => E.judgeTool(P, atReview, c).allow
  assert.equal(ok({ tool: 'ExitPlanMode' }), true)
  assert.equal(ok({ tool: 'ToolSearch', input: { query: 'select:ExitPlanMode' } }), true)
  assert.equal(ok({ tool: 'Write', input: { file_path: 'C:\\Users\\Muzzy\\.claude\\plans\\sun-goat.md' } }), true)
  assert.equal(ok({ tool: 'Write', input: { file_path: '/home/x/.claude/plans/p.md' } }), true)
  // not the project, not another tool, not a helper
  assert.equal(ok({ tool: 'Write', input: { file_path: 'C:/proj/hello.html' } }), false)
  assert.equal(ok({ tool: 'Write', input: { file_path: 'C:/proj/.claude/plans/../../hello.html' } }), false)
  assert.equal(ok({ tool: 'ToolSearch', input: { query: 'select:ExitPlanMode,Bash' } }), false)
  assert.equal(ok({ tool: 'ExitPlanMode', agentId: 'a1' }), false)
})

test('fix 7: a closed window (or a kill) at a gate is a crash; only a clean end is not', () => {
  const lock = r => ({ step: 'approve', status: 'waiting', session: 'old', closed: r !== 'killed', endReason: r === 'killed' ? undefined : r })
  assert.equal(E.diedLastTime(lock('other'), 'new'), true) // the window's X
  assert.equal(E.diedLastTime(lock('killed'), 'new'), true)
  assert.equal(E.diedLastTime({ ...lock('other'), endReason: undefined }, 'new'), true) // an old lock with no reason
  assert.equal(E.diedLastTime(lock('prompt_input_exit'), 'new'), false) // /exit
  assert.equal(E.diedLastTime(lock('other'), 'old'), false) // same session
  assert.equal(E.diedLastTime({ step: null, status: 'done', session: 'old' }, 'new'), false) // nothing under way
  assert.equal(E.diedLastTime(null, 'new'), false)
})

test('watchdog race (proof run 9): TaskStop saying the task already ended is not a stall', () => {
  assert.equal(E.taskAlreadyEnded('Task wfa14su1h is not running (completed)'), true)
  assert.equal(E.taskAlreadyEnded('Task already finished'), true)
  assert.equal(E.taskAlreadyEnded('Successfully stopped task wfa14su1h'), false)
  assert.equal(E.taskAlreadyEnded(undefined), false)
})

test('fix 3: the shipped gate puts the safe choice first', () => {
  const gate = E.stepById(P, 'approve')
  assert.notEqual(gate.options[0], gate.approve)
  assert.equal(E.answerGate(P, E.begin({ ...E.freshState('hello'), finished: ['name'] }, gate, 0), gate, gate.options[0]).approved, false)
})
