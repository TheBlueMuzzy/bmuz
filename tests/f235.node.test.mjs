// F235 — Fixes from the Sirius Smugglers live look (2026-11-14). No-Claude tests, one block per task; the motor's side
// (the gate's box and the chat, the bug tool) is in plugin/tests/engine.test.tsx, "F235".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
const pipe = id => JSON.parse(readFileSync(join(plugin, 'pipelines', `${id}.json`), 'utf8'))
const DEFINE = pipe('define')
const NL = String.fromCharCode(10)

// ---- task 1: the lock gate (finding 12) and BMUZ's own bugs (finding 13) ----
const LOCK = E.stepById(DEFINE, 'lock')
const LOCK_OPTIONS = E.gateWords(LOCK, script, {}).options

test('task 1: Define\'s lock box — "lock it" typed is the lock, "not yet" the change; a bare yes is no answer; anything else is what to change', () => {
  assert.deepEqual(LOCK_OPTIONS, ['Not yet: change something', 'Lock it: on to Design'])
  for (const t of ['lock it', 'Lock it', 'lock it.', 'LOCK IT!', 'yes lock it', 'lock it please', '"lock it"', 'Lock it: on to Design'])
    assert.deepEqual(E.gateTyped(t, LOCK_OPTIONS), { option: 'Lock it: on to Design' }, t)
  assert.deepEqual(E.gateTyped('not yet', LOCK_OPTIONS), { option: 'Not yet: change something' })
  for (const t of ['yes', 'ok', 'Okay.', 'sure', 'sounds good']) assert.deepEqual(E.gateTyped(t, LOCK_OPTIONS), { ack: true }, t)
  // Muzzy's own answer at the live lock (2026-11-14), shortened: what to change, never a yes
  const his = "It's not a clickable link and should be. first player is chosen randomly."
  assert.deepEqual(E.gateTyped(his, LOCK_OPTIONS), { words: his })
  assert.equal(E.gateTyped('', LOCK_OPTIONS), null)
  assert.equal(E.gateTyped('   ', LOCK_OPTIONS), null)
  // "lock it" is never read into a sentence that only contains it
  assert.deepEqual(E.gateTyped("don't lock it yet, the pitch is wrong", LOCK_OPTIONS), { words: "don't lock it yet, the pitch is wrong" })
})

test('task 1: typed words at the gate go back to "change" as the change itself (never asked for again); the gate is never approved by them', () => {
  const state = { pipeline: 'define', current: 'lock', status: 'waiting', results: {}, retries: {}, finished: DEFINE.steps.filter(s => s.id !== 'lock' && s.id !== 'locked').map(s => s.id), blocked: null }
  const out = E.answerGate(DEFINE, state, LOCK, 'first player is random', { typed: true })
  assert.equal(out.approved, false)
  assert.deepEqual(out.state.back, { step: 'change', gate: 'lock', answer: 'first player is random', question: 'define.lock.box', typed: true })
  assert.ok(!out.state.finished.includes('change') && !out.state.finished.includes('lock-show'))
  const change = E.stepById(DEFINE, 'change')
  const prompt = E.talkPrompt(change, 'craft', '', false, [], { back: out.state.back, script })
  assert.match(prompt, /typed this instead of picking an option: "first player is random"/)
  assert.match(prompt, /don't ask what to change/)
  assert.doesNotMatch(prompt, /ask what they want changed \(their next message\)/)
  // a picked "Not yet" still asks what
  const picked = E.answerGate(DEFINE, state, LOCK, 'Not yet: change something')
  assert.equal(picked.state.back.typed, undefined)
  assert.match(E.talkPrompt(change, 'craft', '', false, [], { back: picked.state.back, script }), /ask what they want changed \(their next message\)/)
  // the craft note skips its "tell me what" when the words already came
  assert.match(readFileSync(join(plugin, 'craft', 'define-change.md'), 'utf8'), /Skip this when the engine says they already typed what to change/)
})

test('task 1 (finding 13): before the game has code every bug is BMUZ\'s; later only when Claude says so', () => {
  for (const p of ['ideate', 'discover', 'define']) assert.equal(E.isEngineBug(p, undefined), true, p)
  for (const p of ['design', 'develop', 'deliver', 'bug']) assert.equal(E.isEngineBug(p, undefined), false, p)
  assert.equal(E.isEngineBug('develop', true), true)
  assert.ok(script.lines['bug.engine'] && script.lines['bug.engine'].added)
})

test('task 1 (finding 13): bugs.mjs add with "engine" writes BMUZ\'s list (with the game and the place), and never the game\'s BUGS.md', () => {
  const game = mkdtempSync(join(tmpdir(), 'f235-game-'))
  const engine = mkdtempSync(join(tmpdir(), 'f235-engine-'))
  mkdirSync(join(game, '.planning'), { recursive: true })
  writeFileSync(join(game, '.planning', 'GDD.md'), G.newGdd('Sirius Smugglers'))
  const report = { title: 'Concept lock gate ignores lock it', level: 'P1', steps: ['Finish Scope', 'Type lock it'], expected: 'it locks', actual: 'nothing', often: 'every time' }
  const ran = spawnSync('node', [join(plugin, 'scripts', 'bugs.mjs'), 'add', JSON.stringify({ report, where: 'Define · 8 of 8 · Concept Lock', engine: true })], { cwd: game, encoding: 'utf8', env: { ...process.env, BMUZ_ENGINE_DIR: engine } })
  assert.equal(ran.status, 0, ran.stdout + ran.stderr)
  const out = JSON.parse(ran.stdout.trim().split(NL).pop())
  assert.equal(out.ok, true)
  assert.equal(out.engine, true)
  assert.equal(existsSync(join(game, '.planning', 'BUGS.md')), false)
  const list = readFileSync(join(engine, '.planning', 'BUGS.md'), 'utf8')
  assert.match(list, /^# BMUZ — Bugs/)
  assert.match(list, /### B001 · P1 · open · found \d{4}-\d{2}-\d{2} in Sirius Smugglers, Define · 8 of 8 · Concept Lock/)
  assert.match(list, /Concept lock gate ignores lock it/)
})
