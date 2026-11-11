// F215 task 3: stepping in with a bug, the engine's pure part (engine.js). No Claude: the commands, the hint, where
// "fix it after …" comes from, the tool limits (the bug tool at any moment; writes only inside the project).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const P = { id: 'design', version: 1, steps: [
  { id: 'welcome', kind: 'talk', no: '3.0', title: 'Welcome to Design', tools: ['Read'], craft: 'c.md' },
  { id: 'flow', kind: 'talk', no: '3.2', title: 'The Rulebook', tools: ['Read', 'Write'], craft: 'c.md' },
  { id: 'review', kind: 'gate', question: 'Ready?', options: ['Not yet', 'Approve'], approve: 'Approve' },
] }
const at = (current, status = 'working') => ({ ...E.freshState('design'), current, status, finished: ['welcome'] })

test('"bmuz bug …": no words / an id / fix = a fix run, sweep, list, stop, verified B004; anything else is a report in their words', () => {
  assert.deepEqual(E.bugCommand('bmuz bug'), { kind: 'fix', id: null })
  assert.deepEqual(E.bugCommand('  bmuz bug b004 '), { kind: 'fix', id: 'B004' })
  assert.deepEqual(E.bugCommand('bmuz bug fix B012'), { kind: 'fix', id: 'B012' })
  assert.deepEqual(E.bugCommand('bmuz bug sweep'), { kind: 'sweep' })
  assert.deepEqual(E.bugCommand('bmuz bug list'), { kind: 'list' })
  assert.deepEqual(E.bugCommand('bmuz bug stop'), { kind: 'stop' })
  assert.deepEqual(E.bugCommand('bmuz bug verified b004'), { kind: 'verified', id: 'B004' })
  assert.deepEqual(E.bugCommand('bmuz bug the score text is cut off on my phone'), { kind: 'report', words: 'the score text is cut off on my phone' })
  assert.equal(E.bugCommand('bmuz go'), null)
  assert.equal(E.bugCommand('bmuz bugs'), null)
})

test('the step-in hint: a message that sounds broken carries it (Claude judges); bmuz commands and ordinary answers don\'t', () => {
  for (const t of ['the score text is cut off on my phone', "the button doesn't work", 'it crashed when I rolled', 'the total is off by one', 'found a bug']) assert.equal(E.soundsBroken(t), true, t)
  for (const t of ['bmuz bug the score', 'Yes, keep it', 'Plant. You draw, then plant or play weather.', 'two players on one phone']) assert.equal(E.soundsBroken(t), false, t)
})

test('"fix it after …": the open sprint feature from SPRINT.md first, else the step we are on, else the next fix run', () => {
  const sprint = '# Sprint 3\n## F06 Seeds\n- [x] 🤖 1. seeds\n## F07 🔧 Weather cards\n- [ ] 🤖 1. the hail card\n## F08 Scoring\n- [ ] 1. x'
  assert.equal(E.sprintFeature(sprint), 'F07')
  assert.equal(E.sprintFeature('# nothing'), null)
  assert.equal(E.bugWhen(P, at('flow'), 'F07'), 'after F07')
  assert.equal(E.bugWhen(P, at('flow')), 'after The Rulebook')
  assert.equal(E.bugWhen(P, { ...E.freshState('design') }), 'in the next bug fix run')
  assert.equal(E.placeWords(P, at('flow')), 'Design · 1 of 1 · The Rulebook')
})

test('fix now: a P0 always; "blocks" or "quick" by the focus rule; anything else is logged and fixed in order', () => {
  assert.equal(E.isFixNow({ level: 'P0' }), true)
  assert.equal(E.isFixNow({ level: 'P2', now: 'blocks' }), true)
  assert.equal(E.isFixNow({ level: 'P3', now: 'quick' }), true)
  assert.equal(E.isFixNow({ level: 'P1' }), false)
  assert.equal(E.isFixNow({ level: 'P1', now: 'yes please' }), false)
})

test('the bug tool is allowed at any moment (a step, between steps, a gate, BLOCKED), never to a helper', () => {
  const call = { tool: E.BUG_TOOL }
  for (const s of [at('flow'), at(null, 'idle'), at('review', 'waiting'), { ...at('flow', 'blocked'), blocked: { step: 'flow', why: 'x' } }, { ...at(null, 'done') }]) assert.equal(E.judgeTool(P, s, call).allow, true, s.status)
  assert.equal(E.judgeTool(P, at('flow'), { ...call, agentId: 'a1' }).allow, false)
  assert.match(E.talkPrompt(P.steps[1], 'craft', '', false), /Stepping in: if the creative says something is broken/)
  assert.match(E.talkPrompt(P.steps[1], 'craft', '', true), /Stepping in:/)
})

test('while a pipeline runs, Write and Edit stay inside the project and out of .bmuz, whatever the step allows', () => {
  const dir = 'C:/Users/Muzzy/game'
  const w = path => E.judgeTool(P, at('flow'), { tool: 'Write', input: { file_path: path } }, { dir })
  assert.equal(w('C:\\Users\\Muzzy\\game\\src\\score.js').allow, true)
  assert.equal(w('c:/users/muzzy/game/tests/b001.test.mjs').allow, true)
  assert.equal(w('src/score.js').allow, true)
  assert.match(w('C:\\Users\\Muzzy\\other\\x.js').why, /only change files inside this project/)
  assert.equal(w('C:\\Users\\Muzzy\\game\\.bmuz\\state.json').allow, false)
  assert.equal(w('C:/Users/Muzzy/game/../x.js').allow, false)
  assert.equal(E.projectPath('/home/a/game', '/home/a/game/src/x.js'), 'src/x.js')
  assert.equal(E.projectPath('/home/a/game', '/home/a/gamex/src/x.js'), null)
  // before a pipeline starts and after it ends, nothing is limited (as before)
  assert.equal(E.judgeTool(P, { ...E.freshState('design'), status: 'done' }, { tool: 'Write', input: { file_path: 'D:/x.js' } }, { dir }).allow, true)
})

test('the side trip record is checked before it is used', () => {
  assert.equal(E.sideProblem({ pipeline: 'bug', bug: 'B004', from: 'design', n: 1, phase: 'on' }), null)
  assert.match(E.sideProblem({ pipeline: '../x', bug: 'B004', from: 'design', n: 1, phase: 'on' }), /pipeline name/)
  assert.match(E.sideProblem({ pipeline: 'bug', bug: 'x', from: 'design', n: 1, phase: 'on' }), /bug number/)
  assert.match(E.sideProblem({ pipeline: 'bug', bug: 'B004', from: 'design', n: 1, phase: 'later' }), /phase/)
})
