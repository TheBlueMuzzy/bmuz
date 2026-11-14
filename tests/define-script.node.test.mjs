// F232 task 4: Define rebuilt to the approved script's 2.0–2.8. No-Claude tests of the pipeline's shape and of
// define.mjs (2.8 Concept Lock), on the script's own made-up example: the garden race.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'
import * as D from '../plugin/scripts/define.mjs'
import { answersFrom } from '../plugin/scripts/ideate.mjs'
import { isVerbatim, normalise } from '../plugin/scripts/material.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'define.json'), 'utf8'))
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
const step = id => P.steps.find(s => s.id === id)

test('the pipeline is the script\'s Stage 2: the welcome, then 2.1–2.8 high to low, every Define line said by a step, each chapter written as chosen', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  assert.deepEqual(E.checkLines(P, script), [])
  const titled = [...new Map(P.steps.filter(s => s.no).map(s => [s.no, s.title])).entries()]
  assert.deepEqual(titled, [['2.0', 'Welcome to Define'], ['2.1', 'The Feelings'], ['2.2', 'The 3 Pillars'], ['2.3', 'The Pitch'], ['2.4', 'The Core Loop'], ['2.5', 'Platform & Play'], ['2.6', 'Clash Check'], ['2.7', 'Scope, First Pass'], ['2.8', 'Concept Lock']])
  const said = new Set([...P.steps.flatMap(s => s.lines || []), ...P.steps.filter(s => s.line).map(s => s.line)])
  // define.lock.when is composed by the lock-show script (shown word for word), not said by Claude; (F235 task 2) the
  // approved define.lock, define.platform and define.platform.someday are kept in the script, said by no step (the
  // lock lists open questions by when they're needed; Platform & Play's heading no longer lists Design's questions;
  // someday platforms are asked in Scope, once the features are sorted)
  const RETIRED = ['define.lock', 'define.platform', 'define.platform.someday', 'define.scope', 'define.scope.smallest', 'define.scope.idea', 'define.scope.slice']
  for (const id of Object.keys(script.lines).filter(id => id.startsWith('define.') && id !== 'define.lock.when' && !RETIRED.includes(id))) assert.ok(said.has(id), id)
  for (const id of RETIRED) assert.ok(!said.has(id), id)
  // every talk step that decides writes its chapter as chosen right after it
  for (const id of ['feelings', 'pillars', 'pitch', 'loop', 'platform', 'clashes', 'scope', 'slice', 'change']) {
    const g = P.steps.find(s => s.id === `${id}-gdd`)
    assert.deepEqual(g && g.run.slice(2), ['step', id, 'chosen'], id)
  }
  assert.equal(E.stepPlace(P, step('pitch')), 'Define · 3 of 8 · The Pitch')
  assert.equal(E.stepPlace(P, step('welcome')), 'Define · Welcome to Define')
})

test('research is offered first, never forced: the prior-art flow runs only on a yes; the clash check is separate reviewers', () => {
  assert.equal(step('prior-art').when, '{research}')
  assert.equal(step('prior-art').workflow, 'bmuz:research-flow')
  assert.equal(E.isWanted(step('prior-art'), { research: 'no' }), false)
  assert.equal(E.isWanted(step('prior-art'), { research: 'yes' }), true)
  assert.equal(step('clash-review').workflow, 'bmuz:clash-flow')
  assert.deepEqual(step('clash-review').agentTools.filter(t => /Write|Read/.test(t)), ['Read', 'Write'])
})

test('Concept Lock: the script\'s box as an engine gate ("Not yet" first, the safe choice); "Not yet" goes back to a step that runs only then', () => {
  const lock = step('lock')
  assert.equal(lock.kind, 'gate')
  assert.deepEqual(E.gateWords(lock, script), { question: 'Lock the concept?', options: ['Not yet: change something', 'Lock it: on to Design'] })
  assert.equal(lock.approve, 'Lock it: on to Design')
  assert.equal(lock.backTo, 'change')
  assert.equal(step('change').onBack, true)
  const st = { ...E.freshState('define'), finished: P.steps.slice(0, P.steps.indexOf(lock)).map(s => s.id), current: 'lock', status: 'waiting', results: {} }
  assert.equal(E.onBackSkips(step('change'), st), true)
  const back = E.answerGate(P, st, lock, 'Not yet: change something')
  assert.equal(back.approved, false)
  assert.equal(E.onBackSkips(step('change'), back.state), false)
  assert.equal(E.nextStep(P, back.state).id, 'change')
  assert.deepEqual(P.next, { pipeline: 'design', ask: false })
})

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-define-'))
  mkdirSync(join(dir, '.bmuz'))
  let gdd = G.newGdd('Garden Race')
  const by = { step: 'x', stage: 'Define', day: '2026-11-11' }
  gdd = G.applyResult(gdd, { chapters: {
    1: '**The feeling:** "the thrill of a close race"', 2: '- **Quick rivalry**: a short, close race', 3: 'You and a friend…\n**One line:** a three-minute garden race where the weather is your weapon',
    4: '**You draw → you plant or play weather → you score blooming rows → (again)**', 5: '- **First:** The web', 6: '**Must:** planting · weather', 7: '- weather may feel mean',
  } }, 'chosen', by).text
  gdd = G.applyResult(gdd, { chapters: { 8: ['Open: How does a game end and who wins?', 'Idea: "weather cards"'], 12: ['Idea: "bright hand-drawn flowers"'] } }, 'loose', by).text
  mkdirSync(join(dir, '.planning'), { recursive: true })
  writeFileSync(join(dir, G.GDD), gdd)
  const state = { pipeline: 'define', resultsBy: {
    feelings: { feelings: ['the thrill of a close race'], feeling: 'a close race' },
    pillars: { pillars: [{ name: 'Quick rivalry' }, { name: 'Grow, then guard' }, { name: 'Weather is fair' }] },
    pitch: { oneliner: 'a three-minute garden race where the weather is your weapon' },
    loop: { loop: 'You draw → you plant or play weather → you score blooming rows → (again)' },
    platform: { platform: 'phone first; friends on the same screen and online, at the same time' },
    scope: { musts: ['planting', 'weather cards', 'scoring rows'] },
  } }
  return { dir, state }
}

test('2.8 the lock page: the script\'s words with what Define chose (✓ lines), the link, and what\'s still open for Design', () => {
  const { dir, state } = project()
  const r = D.lockShow(dir, state, script)
  const msg = readFileSync(join(dir, D.LOCK_MD), 'utf8')
  assert.ok(msg.startsWith('**Concept Lock**\nHere\'s the concept, one page, on your project page now: file:///'))
  assert.match(msg, /\n✓ The Feelings: the thrill of a close race\n✓ The 3 Pillars: Quick rivalry · Grow, then guard · Weather is fair\n✓ The Pitch: a three-minute garden race where the weather is your weapon\n✓ The Core Loop: You draw → you plant or play weather → you score blooming rows → \(again\)\n✓ Platform & Play: phone first · friends on the same screen and online, at the same time\n✓ Scope, first pass: 3 musts, slice chosen\n/)
  // (F235 task 2: the open questions by when they're needed; nothing here is asked now)
  assert.match(msg, /\n\n\*\*For Design\*\*, nothing to answer now:\n· Rulebook: How does a game end and who wins\?\n\nLocking means Design builds on this page\. You can still change it later; every change is logged\.\n$/)
  assert.doesNotMatch(msg, /Needed before you lock|\*\*Later\*\*/)
  assert.deepEqual(D.stillOpen(readFileSync(join(dir, G.GDD), 'utf8')), ['Rulebook: How does a game end and who wins'])
  assert.equal(r.slots.musts, '3')
})

test('after "Lock it": the lock is logged in the GDD\'s Decisions and Changes; the chapters keep their levels', () => {
  const { dir } = project()
  D.locked(dir, new Date('2026-11-11T09:00:00Z'))
  const gdd = readFileSync(join(dir, G.GDD), 'utf8')
  assert.match(G.readList(gdd, 'Decisions')[0], /^2026-11-11 · The concept \(Part 1: The Feelings to Risks & Unknowns\) locked in Define/)
  assert.match(G.readList(gdd, 'Changes').pop(), /Define · lock: 1 on Decisions/)
  const ch = G.readGdd(gdd)
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.equal(ch[n].level, 'chosen', `chapter ${n}`)
  assert.equal(ch[8].level, 'loose')
})

test('their own words: the journal\'s answers (a box\'s answers only, not its questions), checked word for word', () => {
  const lines = [
    JSON.stringify({ ev: 'answer', step: 'feelings', line: 'define.feelings.own', via: 'typed', text: 'The thrill of a close race.' }),
    JSON.stringify({ ev: 'answer', step: 'pillars', text: 'User has answered your questions: "Want to see my take first?"="Show me your take". You can now continue.' }),
    'not json',
  ]
  assert.deepEqual(answersFrom(lines), ['The thrill of a close race.', 'Show me your take'])
  const src = normalise(answersFrom(lines).join('\n'))
  assert.equal(isVerbatim('“the thrill of a close race”', src), true)
  assert.equal(isVerbatim('the thrill … close race', src), true)
  assert.equal(isVerbatim('the joy of a close race', src), false)
})
