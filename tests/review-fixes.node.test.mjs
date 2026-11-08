// No-Claude tests for the F211 code review's findings (fresh-eyes review of a8b5c98..aebcf01, 2026-11-08).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as E from '../plugin/hooks/engine.js'

const P = JSON.parse(readFileSync(new URL('../plugin/pipelines/hello.json', import.meta.url), 'utf8'))
const j = (ev, more = {}) => JSON.stringify({ t: 1, ev, ...more })

test('review 4: between steps (idle mid-pipeline) every tool is refused; only before the start and after the end is all open', () => {
  const fresh = E.freshState('hello')
  assert.equal(E.judgeTool(P, fresh, { tool: 'Write' }).allow, true)
  assert.equal(E.judgeTool(P, { ...fresh, status: 'done', finished: ['name'] }, { tool: 'Write' }).allow, true)
  const between = { ...fresh, finished: ['name', 'approve'] } // after a step_done, an undo or a gate going back
  assert.equal(E.judgeTool(P, between, { tool: 'Write' }).allow, false)
  assert.match(E.judgeTool(P, between, { tool: 'Bash', agentId: 'a1' }).why, /between steps/) // helpers too
  const retrying = { ...fresh, current: 'hello', finished: ['name', 'approve', 'plan'] } // a flow retry about to start
  assert.equal(E.judgeTool(P, retrying, { tool: 'Write' }).allow, false)
})

test('review 2: a retry count the state file lost in a crash is taken from the journal (no free try)', () => {
  const lines = [j('step.start', { step: 'name', kind: 'talk' }), j('retry', { step: 'name' })]
  const lagging = { ...E.rebuildFromJournal('hello', lines.slice(0, 1)) } // state written before the retry line
  const r = E.doctor(P, JSON.stringify(lagging), lines, null, 's', 0)
  assert.equal(r.fixed, true)
  assert.equal(r.state.retries.name, 1)
})

test('review 6: a finished step drops the flow record, so a "late" mark never follows the next step', () => {
  const s = { ...E.begin(E.freshState('hello'), E.stepById(P, 'hello'), 0), flow: { taskId: 'w1', late: 5 } }
  assert.equal(E.finish(s, E.stepById(P, 'hello'), null).flow, null)
})

test('review 8: Windows spellings of the engine folder are refused (case, trailing dot or space)', () => {
  for (const bad of ['.BMUZ/state.json', '.Bmuz/journal.jsonl', '.bmuz./x', '.bmuz /x', 'notes./x.md', 'x.json.', 'x.json ']) assert.equal(E.isSafePath(bad), false, bad)
  for (const good of ['plan.json', 'my.bmuz/x', 'docs/a.b.md']) assert.equal(E.isSafePath(good), true, good)
})

test('review 9: a gate going back drops every step that needs it, through other steps too', () => {
  const p = {
    id: 'chain', version: 1,
    steps: [
      { id: 'a', kind: 'talk', tools: ['Read'], craft: 'craft/a.md' },
      { id: 'b', kind: 'talk', needs: ['a'], tools: ['Read'], craft: 'craft/b.md' },
      { id: 'c', kind: 'talk', needs: ['b'], tools: ['Read'], craft: 'craft/c.md' },
      { id: 'g', kind: 'gate', needs: ['c'], question: 'OK?', options: ['Redo', 'Yes'], approve: 'Yes', backTo: 'a' },
    ],
  }
  const s = E.begin({ ...E.freshState('chain'), finished: ['a', 'b', 'c'] }, p.steps[3], 0)
  assert.deepEqual(E.answerGate(p, s, p.steps[3], 'Redo').state.finished, [])
})

test('review 11: plan-mode moves are refused in an auto run (leaving plan mode waits for a person)', () => {
  const s = E.begin({ ...E.freshState('hello'), finished: ['name', 'approve', 'plan', 'hello'] }, E.stepById(P, 'review'), 0)
  assert.equal(E.judgeTool(P, s, { tool: 'ExitPlanMode' }, { auto: true }).allow, false)
  assert.equal(E.judgeTool(P, s, { tool: 'ExitPlanMode' }, { auto: false }).allow, true)
})
