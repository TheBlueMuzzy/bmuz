// No-Claude test of the engine's memory and safety: undo list, undo, retry after BLOCKED, the doctor,
// and the journal rebuilding everything it decides (retries, undo, unblock).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as E from '../plugin/hooks/engine.js'

const P = JSON.parse(readFileSync(new URL('../plugin/pipelines/hello.json', import.meta.url), 'utf8'))
const step = id => E.stepById(P, id)
const j = (ev, more = {}) => JSON.stringify({ t: 1, session: 's1', ev, ...more })

// Runs the hello pipeline's steps to the end the way the engine does, with results.
function ranToEnd() {
  let s = E.freshState('hello')
  s = E.finish(E.begin(s, step('name'), 0), step('name'), { name: 'Moon Goat' })
  s = E.answerGate(P, E.begin(s, step('approve'), 0), step('approve'), 'Approve').state
  s = E.finish(E.begin(s, step('plan'), 0), step('plan'), null)
  s = E.finish(E.begin(s, step('hello'), 0), step('hello'), null)
  s = E.finish(E.begin(s, step('review'), 0), step('review'), { verdict: 'ok' })
  return { ...s, status: 'done' }
}

test('undo list: one plain line per finished step, newest first, naming the files it puts back', () => {
  const list = E.undoList(P, ranToEnd())
  assert.deepEqual(list.map(u => u.step), ['review', 'hello', 'plan', 'approve', 'name'])
  assert.match(list[0].line, /go back to before "review": no files to put back; runs that step again/)
  assert.match(list[2].line, /go back to before "plan": puts back plan.json, hello.html; runs 3 steps again/)
  assert.deepEqual(list[4].redo, ['name', 'approve', 'plan', 'hello', 'review'])
  assert.deepEqual(E.undoList(P, E.freshState('hello')), [])
})

test('undo list warns when a later step changed things outside its files', () => {
  const p = structuredClone(P)
  delete p.steps.find(s => s.id === 'plan').writes
  const s = { ...ranToEnd(), finished: ['name', 'approve', 'plan'] }
  assert.match(E.undoList(p, s).find(u => u.step === 'approve').line, /anything plan changed outside its files stays as it is/)
})

test('undo: back to before a step drops it, every later step and their results; retries start over', () => {
  const done = { ...ranToEnd(), retries: { hello: 1 } }
  const out = E.undoTo(P, done, 'plan')
  assert.deepEqual(out.redo, ['review', 'hello', 'plan'])
  assert.deepEqual(out.state.finished, ['name', 'approve'])
  assert.equal(out.state.status, 'idle')
  assert.deepEqual(out.state.results, { name: 'Moon Goat' })
  assert.deepEqual(out.state.retries, {})
  assert.equal(E.nextStep(P, out.state).id, 'plan')
  // back past the talk step: its result goes too
  assert.deepEqual(E.undoTo(P, done, 'name').state.results, {})
})

test('undo refuses while a step is running, and names the steps it can go back to', () => {
  const working = E.begin({ ...E.freshState('hello'), finished: ['name', 'approve'] }, step('plan'), 0)
  assert.match(E.undoTo(P, working, 'name').error, /still running/)
  assert.match(E.undoTo(P, ranToEnd(), 'nope').error, /pick one of: name, approve, plan, hello, review/)
  // BLOCKED or waiting at a gate is fine
  assert.ok(E.undoTo(P, { ...ranToEnd(), status: 'blocked', blocked: { step: 'x', why: 'y' } }, 'hello').state)
})

test('retry after BLOCKED: the block lifts and the step gets 2 fresh retries', () => {
  let s = E.begin({ ...E.freshState('hello'), finished: ['name', 'approve'] }, step('plan'), 0)
  for (let i = 0; i < 3; i++) s = E.onFail(s, step('plan'), 'no plan.json').state
  assert.equal(s.status, 'blocked')
  const out = E.unblock(s)
  assert.equal(out.step, 'plan')
  assert.equal(out.state.status, 'idle')
  assert.equal(out.state.blocked, null)
  assert.equal(out.state.retries.plan, undefined)
  assert.equal(E.nextStep(P, out.state).id, 'plan')
  assert.match(E.unblock(out.state).error, /nothing is BLOCKED/)
})

test('a finished step forgets its retries, so a later re-run gets its own 2 retries (and checkpoint)', () => {
  let s = E.begin({ ...E.freshState('hello'), finished: ['name', 'approve'] }, step('plan'), 0)
  s = E.onFail(s, step('plan'), 'x').state
  assert.equal(s.retries.plan, 1)
  s = E.finish(s, step('plan'), null)
  assert.equal(s.retries.plan, undefined)
})

test('the journal rebuilds retries, BLOCKED, retry and undo (a crash never resets the retry count)', () => {
  const lines = [
    j('step.start', { step: 'name', kind: 'talk' }), j('step.done', { step: 'name', result: { name: 'Moon Goat' } }),
    j('step.start', { step: 'approve', kind: 'gate' }), j('step.done', { step: 'approve', result: null }),
    j('step.start', { step: 'plan', kind: 'script' }), j('retry', { step: 'plan' }),
  ]
  let s = E.rebuildFromJournal('hello', lines)
  assert.equal(s.retries.plan, 1)
  assert.equal(s.current, 'plan')
  lines.push(j('retry', { step: 'plan' }), j('blocked', { step: 'plan', why: 'no plan.json' }))
  s = E.rebuildFromJournal('hello', lines)
  assert.equal(s.status, 'blocked')
  lines.push(j('unblock', { step: 'plan' }))
  s = E.rebuildFromJournal('hello', lines)
  assert.equal(s.status, 'idle')
  assert.equal(s.retries.plan, undefined)
  lines.push(j('step.start', { step: 'plan', kind: 'script' }), j('step.done', { step: 'plan', result: null }), j('undo', { to: 'approve', redo: ['plan', 'approve'] }))
  s = E.rebuildFromJournal('hello', lines)
  assert.deepEqual(s.finished, ['name'])
  assert.deepEqual(s.results, { name: 'Moon Goat' })
  // a gate sending the creative back drops the step's result too
  s = E.rebuildFromJournal('hello', [...lines.slice(0, 2), j('gate.back', { step: 'approve', dropped: ['name'] })])
  assert.deepEqual(s.results, {})
})

test('doctor: all good when the state file matches the journal', () => {
  const lines = [j('step.start', { step: 'name', kind: 'talk' }), j('step.done', { step: 'name', result: { name: 'Moon Goat' } })]
  const state = E.rebuildFromJournal('hello', lines)
  const r = E.doctor(P, JSON.stringify(state), lines, null, 's1', 0)
  assert.equal(r.fixed, false)
  assert.match(r.lines[0], /^BMUZ doctor · /)
  assert.match(r.lines[1], /All good/)
})

test('doctor: a missing, damaged or lagging state file is rebuilt from the journal', () => {
  const lines = [j('step.start', { step: 'name', kind: 'talk' }), j('step.done', { step: 'name', result: { name: 'Moon Goat' } }), j('step.start', { step: 'approve', kind: 'gate' })]
  let r = E.doctor(P, null, lines, null, 's1', 0)
  assert.equal(r.fixed, true)
  assert.match(r.lines.join('\n'), /state file was missing/)
  assert.equal(r.state.current, 'approve')
  r = E.doctor(P, '{"pipeline": "hel', lines, null, 's1', 0)
  assert.equal(r.fixed, true)
  assert.match(r.lines.join('\n'), /damaged/)
  // a crash between the journal line and the state write: the state still says "name, working"
  const lagging = E.rebuildFromJournal('hello', lines.slice(0, 1))
  r = E.doctor(P, JSON.stringify(lagging), lines, null, 's1', 0)
  assert.equal(r.fixed, true)
  assert.match(r.lines.join('\n'), /disagreed with the journal .* went with the journal/)
  assert.equal(r.state.status, 'waiting')
})

test('doctor: an empty journal never wipes a state file with progress in it', () => {
  const state = ranToEnd()
  const r = E.doctor(P, JSON.stringify(state), [''], null, 's1', 0)
  assert.equal(r.fixed, false)
  assert.equal(r.state.status, 'done')
  assert.match(r.lines.join('\n'), /journal is empty: kept the state file/)
})

test('doctor: says what went wrong — unclosed session, BLOCKED, retries, refused actions, torn lines', () => {
  const lines = [
    j('step.start', { step: 'name', kind: 'talk' }),
    j('deviation', { step: 'name', tool: 'Write' }), j('deviation', { step: 'name', tool: 'Bash', agentId: 'a1' }),
    j('step.done', { step: 'name', result: { name: 'Moon Goat' } }),
    j('step.start', { step: 'approve', kind: 'gate' }), j('step.done', { step: 'approve' }),
    j('step.start', { step: 'plan', kind: 'script' }), j('retry', { step: 'plan' }), j('retry', { step: 'plan' }),
    j('blocked', { step: 'plan', why: 'plan.json does not exist' }),
    '{"t":1,"ev":"step.st',
  ]
  const state = E.rebuildFromJournal('hello', lines)
  const lock = { step: 'plan', status: 'working', session: 'old-session-id', closed: false }
  const text = E.doctor(P, JSON.stringify(state), lines, lock, 's2', 0).lines.join('\n')
  assert.match(text, /1 journal line was unreadable and skipped/)
  assert.match(text, /ended without closing, during step "plan"/)
  assert.match(text, /Step "plan" is BLOCKED: plan.json does not exist. Say "bmuz retry"/)
  assert.match(text, /2 out-of-order actions were refused/)
  assert.match(text, /in step "name": Bash \(a helper\)/)
})

test('a BLOCKED step tells Claude how the creative unblocks it', () => {
  const s = { ...E.freshState('hello'), current: 'plan', status: 'blocked', blocked: { step: 'plan', why: 'x' } }
  assert.match(E.judgeTool(P, s, { tool: 'Read' }).why, /bmuz retry.*bmuz undo/)
})
