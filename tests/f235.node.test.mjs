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
import * as D from '../plugin/scripts/define.mjs'

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

// ---- task 2: ask once, where it's used (findings 4, 5, 11) ----
const IDEATE = pipe('ideate')
const DESIGN = pipe('design')

test('task 2: where it\'s played and who plays are asked only in Define\'s Platform & Play — never in Ideate, on either path', () => {
  const ideateLines = IDEATE.steps.flatMap(s => s.lines || [])
  for (const id of ['ideate.pool.where', 'ideate.digital.who']) assert.ok(!ideateLines.includes(id), id)
  for (const s of IDEATE.steps) for (const c of s.collects || []) assert.ok(!['platform.where', 'players.who'].includes(c.field), `${s.id} ${c.field}`)
  for (const id of ['platform', 'platform-rules']) {
    const st = E.stepById(DEFINE, id)
    assert.ok(st.lines.includes('define.platform.where') && st.lines.includes('define.platform.who'), id)
    // its heading no longer lists Design's questions (length, saving, leaving) as if they were coming
    assert.deepEqual(st.opening, ['define.platform.now'])
    assert.doesNotMatch(script.lines['define.platform.now'].text, /saving|leaves/)
    assert.ok(!st.lines.includes('define.platform.someday'), id)
  }
  for (const f of ['ideate-rules.md', 'ideate-open.md']) {
    const note = readFileSync(join(plugin, 'craft', f), 'utf8')
    assert.doesNotMatch(note, /ideate\.pool\.where|ideate\.digital\.who/, f)
    assert.match(note, /Platform & Play asks (those|them) once, where they're used/, f)
  }
})

test('task 2: the someday platforms are asked in Scope, after the features are sorted, with the game\'s own example', () => {
  const scope = E.stepById(DEFINE, 'scope')
  assert.ok(scope.lines.indexOf('define.scope.someday') > scope.lines.indexOf('define.scope.need'))
  assert.ok(scope.must.includes('define.scope.someday'))
  assert.deepEqual(scope.collects.find(c => c.field === 'platform.someday').neededBy, ['store'])
  const r = E.renderLine(script, 'define.scope.someday', { first: 'the web', example: 'phones once the web version plays well · Steam with online play' })
  assert.match(r.text, /It starts on the web\. Now that the features are sorted/)
  assert.match(r.text, /For example: phones once the web version plays well · Steam with online play\./)
  assert.match(readFileSync(join(plugin, 'craft', 'define-scope.md'), 'utf8'), /"define\.scope\.someday"/)
})

test('task 2: saving and leaving are engineering calls with the framework\'s defaults — told, never asked; leaving online is one box, its default first', () => {
  const players = E.stepById(DESIGN, 'players')
  assert.ok(!players.lines.includes('design.players.online') && !players.lines.includes('design.players.length'))
  const leave = E.renderLine(script, 'design.players.leave', {})
  assert.equal(leave.kind, 'box')
  assert.match(leave.box.options[0].label, /The computer plays their seat/)
  assert.match(leave.box.options[0].description, /BMUZ's usual way/)
  assert.doesNotMatch(E.renderLine(script, 'design.players.long', { example: 'about 20 minutes' }).text, /sav/i)
  const note = readFileSync(join(plugin, 'craft', 'design-players.md'), 'utf8')
  assert.match(note, /"design\.players\.leave" \(a box\): only when people play online/)
  assert.match(note, /Saving and leaving are engineering calls, never questions/)
  assert.match(note, /saves kit/)
  assert.match(note, /rooms kit/)
})

test('task 2: the lock lists open questions by when they\'re needed — now (asked), Design, later (the slice doesn\'t need them)', () => {
  let doc = G.newGdd('Sirius Smugglers')
  doc = G.writeChapter(doc, 8, ['Open: Your rules say the first player is whoever most recently stole something. Who goes first in the digital game?'], 'loose', {}).text
  doc = G.writeChapter(doc, 10, ['Open: Does anything carry over between games (stats, unlocks), or is each game on its own?'], 'loose', {}).text
  doc = G.writeChapter(doc, 6, ['Open: Which release does the tutorial belong to?'], 'loose', {}).text
  const when = D.openByWhen(doc, ['Does anything carry over between games (stats, unlocks), or is each game on its own'])
  assert.deepEqual(when.now, ['Scope: Which release does the tutorial belong to?'])
  assert.deepEqual(when.design, ['Rulebook: Your rules say the first player is whoever most recently stole something. Who goes first in the digital game?'])
  assert.deepEqual(when.later, ['Change Over Time: Does anything carry over between games (stats, unlocks), or is each game on its own?'])
  const r = E.renderLine(script, 'define.lock.when', { link: 'L', feelings: 'f', pillars: 'p', oneliner: 'o', loop: 'l', platform: 'pl', musts: '3', now: when.now, design: when.design, later: when.later })
  const text = r.text.replace(/\n{3,}/g, '\n\n')
  assert.match(text, /\*\*Needed before you lock\*\*: type your answers in the box below, in its own field\.\n1\. Scope: Which release/)
  assert.match(text, /\*\*For Design\*\*, nothing to answer now:\n· Rulebook: /)
  assert.match(text, /\*\*Later\*\*, not needed for the slice:\n· Change Over Time: /)
  // lists are bullets, never a semicolon run (finding 9)
  assert.doesNotMatch(text, /\?; /)
  // nothing open now: no "Needed" part at all
  const none = E.renderLine(script, 'define.lock.when', { link: 'L', feelings: 'f', pillars: 'p', oneliner: 'o', loop: 'l', platform: 'pl', musts: '3', now: [], design: when.design, later: [] })
  assert.doesNotMatch(none.text, /Needed before you lock|\*\*Later\*\*/)
  // the slice step names the later ones
  assert.ok(E.stepById(DEFINE, 'slice').results.includes('later'))
})

// ---- task 3: question craft (findings 6, 7, 9) ----
test('task 3: every Define question that asks them to make something carries an example from the game, right above where they type', () => {
  for (const id of ['define.feelings.own', 'define.pillars.own', 'define.pitch.different', 'define.loop.steps', 'define.loop.time', 'define.loop.verbs', 'define.scope.first', 'define.scope.someday', 'design.rulebook.win', 'design.rulebook.setup', 'design.rulebook.action', 'design.rulebook.edge', 'design.players.long']) {
    assert.ok(E.needsExample(script, id, {}), id)
    assert.equal(E.needsExample(script, id, { example: 'two players, one seed deck' }), false, id)
  }
  const r = E.renderLine(script, 'define.feelings.own', { example: 'the sly glee of steering the Space Force onto a rival' })
  assert.ok(r.text.endsWith("what's the main feeling? For example: the sly glee of steering the Space Force onto a rival."), r.text)
  // the vertical slice is explained in the question itself, not only in an earlier list (finding 6)
  const first = E.renderLine(script, 'define.scope.first', { feeling: 'cat-and-mouse tension', example: 'you against one computer smuggler, no card abilities yet' }).text
  assert.match(first, /a vertical slice, with a bit of everything that matters, at close to final quality\. What's the smallest version that still gives "cat-and-mouse tension"\? For example: you against one computer smuggler, no card abilities yet\.$/)
  assert.doesNotMatch(E.renderLine(script, 'define.scope.intro', {}).text, /if it were missing, would the game be pointless/)
})

test('task 3: a finished game gets a proposed slice to confirm (never "what\'s the smallest version?"); a new idea is asked', () => {
  const scope = E.stepById(DEFINE, 'scope')
  assert.ok(!scope.must.includes('define.scope.first'))
  const note = readFileSync(join(plugin, 'craft', 'define-scope.md'), 'utf8')
  assert.match(note, /A finished game \(its Rulebook chapter has "Fixed:" rules\): don't ask it\. The next step proposes the slice from the rules/)
  assert.match(readFileSync(join(plugin, 'craft', 'define-slice.md'), 'utf8'), /A finished game \(F235\): build it from the rules/)
})

test('task 3: Scope\'s box asks what its answers answer — "<idea>: how much does the game need it?" — each answer described', () => {
  const box = E.renderLine(script, 'define.scope.need', { idea: 'A computer opponent' }).box
  assert.equal(box.question, 'A computer opponent: how much does the game need it?')
  assert.deepEqual(box.options.map(o => o.label), ['Must', 'Should', 'Could', "Won't"])
  for (const o of box.options) assert.ok(o.description.length > 10, o.label)
  assert.ok(E.stepById(DEFINE, 'scope').lines.includes('define.scope.need'))
  assert.ok(E.stepById(DESIGN, 'scope2').lines.includes('define.scope.need'))
})

test('task 3: lists are bullets, never semicolon runs — the slice shows one part per line; a semicolon run is refused', () => {
  const slice = E.renderLine(script, 'define.scope.slice.list', { slice: ['You against one simple computer smuggler', 'The rondel, Shuttle, Hypergate and Barter', 'No Contraband abilities yet'] }).text
  assert.equal(slice, "Here's the vertical slice I'd build first:" + NL + '· You against one simple computer smuggler' + NL + '· The rondel, Shuttle, Hypergate and Barter' + NL + '· No Contraband abilities yet')
  assert.deepEqual(E.semicolonRun({ slice: 'rondel action selection; all 3 actions; spending boosters' }), { slot: 'slice', value: 'rondel action selection; all 3 actions; spending boosters' })
  assert.equal(E.semicolonRun({ x: 'one clause; then another' }), null)
  assert.equal(E.semicolonRun({ x: ['a; b; c'] }), null)
})

// ---- task 4: pages and links (findings 8, 10) ----
const SIRIUS_TABLE = ['**Must:** The rules as written', '', '| Idea | MoSCoW | Effort | Impact | Box |', '|---|---|---|---|---|',
  '| Traps | Must | Low (reuses the Barter flow) | High | Quick win |',
  '| Computer opponent, good | Must | High | High | Big project |',
  '| Tutorial with progressive hints | Should | High | Medium | Big project, later |',
  '| Online play with friends | Could | High (server, rooms) | Low for now | Avoid for now: build so it can be added later |',
  '| Undercover Agent | Won\'t | High | Low | Avoid |',
  '| A replay button | Could | Low | Low | |'].join(NL)

test('task 4: the Scope chapter\'s table is drawn on the page as real MoSCoW columns and an effort vs impact 2×2', () => {
  const rows = G.scopeRows(SIRIUS_TABLE)
  assert.deepEqual(rows.map(r => [r.idea, r.moscow, r.box]), [
    ['Traps', 'Must', 'quick'], ['Computer opponent, good', 'Must', 'big'], ['Tutorial with progressive hints', 'Should', 'big'],
    ['Online play with friends', 'Could', 'avoid'], ['Undercover Agent', "Won't", 'avoid'], ['A replay button', 'Could', 'fill'],
  ])
  const html = G.scopeChartHtml(SIRIUS_TABLE)
  for (const m of ['Must', 'Should', 'Could', "Won&#39;t|Won't"]) assert.match(html, new RegExp(`<h5>(${m})</h5>`))
  assert.match(html, /<div class="quad quick"><h5>Quick wins<\/h5>.*Traps/)
  assert.match(html, /<div class="quad avoid"><h5>Avoid<\/h5>.*Online play with friends.*Undercover Agent/)
  assert.equal(G.scopeChartHtml('no table here'), '')
  // on the page, inside chapter 6
  const doc = G.writeChapter(G.newGdd('Sirius Smugglers'), 6, SIRIUS_TABLE.split(NL), 'chosen', {}).text
  assert.match(G.pageHtml(doc), /6 · Scope[\s\S]*id="scope-chart"/)
})

test('task 4: a line that points at the project page is known, and the page\'s link is a proper file link', () => {
  for (const id of ['define.scope.chart.here', 'define.lock.when', 'ideate.page']) assert.ok(E.pointsAtPage(script, id), id)
  assert.equal(E.pointsAtPage(script, 'define.scope.need'), false)
  assert.equal(E.fileLink('C:/Users/Muzzy/My Games/x/.planning/project-page.html'), 'file:///C:/Users/Muzzy/My%20Games/x/.planning/project-page.html')
  assert.equal(E.fileLink('/home/a/b.html'), 'file:///home/a/b.html')
  const chat = E.renderLine(script, 'define.scope.chart.here', { chart: ['Quick wins (do first): Traps', 'Avoid: Undercover Agent'], link: 'file:///x (open in your browser now)' }).text
  assert.match(chat, /\*\*Effort vs impact\*\*\n· Quick wins \(do first\): Traps\n· Avoid: Undercover Agent\n\nIt's drawn on your project page too, as a real chart: file:\/\/\/x \(open in your browser now\)\./)
})

test('task 4: the lock card opens the page first (a test run says it would) and says so beside its link', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f235-lock-'))
  mkdirSync(join(dir, '.planning'), { recursive: true })
  writeFileSync(join(dir, '.planning', 'GDD.md'), G.newGdd('Sirius Smugglers'))
  const state = { resultsBy: { slice: { later: [] } } }
  const shown = D.lockShow(dir, state, script, { BMUZ_TEST: '1' })
  assert.match(shown.slots.link, /^file:\/\/\/.*project-page\.html \(open in your browser now\)$/)
  // no env (a test calling it directly): never opens a browser, no claim
  assert.doesNotMatch(D.lockShow(dir, state, script).slots.link, /open in your browser/)
})
