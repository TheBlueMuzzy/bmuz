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
  assert.match(r.box.question, /It starts on the web\. Now that the features are sorted/)
  assert.match(r.box.question, /For example: phones once the web version plays well · Steam with online play\./)
  assert.match(readFileSync(join(plugin, 'craft', 'define-scope.md'), 'utf8'), /"define\.scope\.someday"/)
})

test('task 2: saving and leaving are engineering calls with the framework\'s defaults — told, never asked; leaving online is one box, its default first', () => {
  const players = E.stepById(DESIGN, 'players')
  assert.ok(!players.lines.includes('design.players.online') && !players.lines.includes('design.players.length'))
  const leave = E.renderLine(script, 'design.players.leave', {})
  assert.equal(leave.kind, 'box')
  assert.match(leave.box.options[0].label, /The computer plays their seat/)
  assert.match(leave.box.options[0].description, /BMUZ's usual way/)
  assert.doesNotMatch(E.renderLine(script, 'design.players.long', { example: 'about 20 minutes' }).box.question, /sav/i)
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
  assert.ok(r.box.question.endsWith("what's the main feeling? For example: the sly glee of steering the Space Force onto a rival."), r.box.question)
  // the vertical slice is explained in the question itself, not only in an earlier list (finding 6)
  const first = E.renderLine(script, 'define.scope.first', { feeling: 'cat-and-mouse tension', example: 'you against one computer smuggler, no card abilities yet' }).box.question
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
  const chat = E.renderLine(script, 'define.scope.chart.here', { chart: ['Quick wins (do first): Traps', 'Avoid: Undercover Agent'], link: 'file:///x (open in your browser now)' }).box.question
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

// ---- task 5: bookkeeping (findings 1, 2, 3 + the stall) ----
test('task 5 (the stall): a command that ran past its time is said as that, for a failed try that is retried at once', () => {
  assert.match(E.scriptRunFailure('HooksError: bmuz: $.process.run(node) aborted: still running after 60000ms', 480000), /^the script ran out of time \(480 s\): HooksError/)
  assert.match(E.scriptRunFailure('ENOENT node', 60000), /^the script couldn't run: ENOENT/)
})

test('task 5 (finding 2): their words for the quote checks include every message they typed, and words typed at a gate', async () => {
  const { answersFrom } = await import('../plugin/scripts/ideate.mjs')
  const { isVerbatim, normalise } = await import('../plugin/scripts/material.mjs')
  const lines = [
    JSON.stringify({ ev: 'answer', step: 'rules-open', line: 'ideate.open.ask', via: 'typed', text: '1 shared win - OR - most number of boosters (rockets)' }),
    JSON.stringify({ ev: 'answer', step: 'rules-open', via: 'chat', text: 'you pick their card to take, and they pick a random one from you.' }),
    JSON.stringify({ ev: 'gate.answer', step: 'lock', answer: 'first player is chosen randomly', typed: true }),
    JSON.stringify({ ev: 'gate.answer', step: 'lock', answer: 'Lock it: on to Design' }),
  ]
  const src = normalise(answersFrom(lines).join('\n'))
  assert.ok(isVerbatim('you pick their card to take, and they pick a random one from you.', src))
  assert.ok(isVerbatim('first player is chosen randomly', src))
  assert.ok(!answersFrom(lines).includes('Lock it: on to Design'))
})

test('task 5 (finding 1): a cut said in passing goes on Won\'t and Decisions, its Fixed rule is struck, and the open question about it is cleared', () => {
  let doc = G.newGdd('Sirius Smugglers')
  doc = G.writeChapter(doc, 8, ['Fixed: "Undercover Agent: one player secretly works for the Space Force." (from Sirius Smugglers - Rules)', 'Fixed: "Pick 2 of your 3 actions each turn." (from Sirius Smugglers - Rules)'], 'loose', {}).text
  doc = G.writeChapter(doc, 6, ['Open: Is the optional Undercover Agent mode part of the digital game, later, or out?'], 'loose', {}).text
  doc = G.addToList(doc, 'Open Questions', ['Is the optional Undercover Agent mode part of the digital game, later, or out? (Scope)', 'Who goes first in the digital game? (Rulebook)']).text
  const out = G.applyResult(doc, { cuts: [{ what: 'The Undercover Agent (secret saboteur) mode', said: "it just doesn't work. i'm abandoning it", rule: 'Undercover Agent: one player secretly works for the Space Force.' }] }, null, { step: 'sketches', stage: 'Ideate', day: '2026-11-14' })
  const ch = G.readGdd(out.text)
  assert.match(ch[8].text, /Cut: ~~"Undercover Agent: one player secretly works for the Space Force\." \(from Sirius Smugglers - Rules\)~~ \(you said: "it just doesn't work\. i'm abandoning it"\)/)
  assert.match(ch[8].text, /Fixed: "Pick 2 of your 3 actions each turn\."/)
  assert.match(ch[6].text, /\*\*Won't:\*\* The Undercover Agent \(secret saboteur\) mode \(you said: "it just doesn't work\. i'm abandoning it"\)/)
  assert.doesNotMatch(ch[6].text, /Open: Is the optional Undercover Agent/)
  assert.deepEqual(G.readList(out.text, 'Open Questions'), ['Who goes first in the digital game? (Rulebook)'])
  assert.match(G.readList(out.text, 'Decisions').join('\n'), /2026-11-14 · Cut: The Undercover Agent/)
  // an answered question said in passing leaves the list too
  const ans = G.applyResult(out.text, { answered: ['Who goes first in the digital game?'] }, null, {})
  assert.deepEqual(G.readList(ans.text, 'Open Questions'), [])
  // a short word never strikes anything
  assert.equal(G.answerOpen(doc, ['mode']).removed.length, 0)
})

test('task 5 (finding 1): the decision step-in is told to every talk step with script lines, and its line is the script\'s', () => {
  assert.match(E.PASSING_RULE, /mcp__bmuz__decision/)
  assert.equal(E.renderLine(script, 'any.noted', { decision: 'the Undercover Agent mode is cut' }).text, 'Noted in your design document: the Undercover Agent mode is cut.')
  assert.equal(E.judgeTool(DEFINE, { current: 'lock', status: 'waiting', finished: [], results: {}, retries: {} }, { tool: E.DECISION_TOOL }, {}).allow, true)
})

test('review fix: a short open question is never filed as "later" because a later phrase contains its word (it stays "now" and the lock asks it)', () => {
  let doc = G.newGdd('Sirius Smugglers')
  doc = G.writeChapter(doc, 6, ['Open: Name?'], 'loose', {}).text
  const when = D.openByWhen(doc, ['A name for each player profile, carried over between games'])
  assert.deepEqual(when.now, ['Scope: Name?'])
  assert.deepEqual(when.later, [])
})

// ---- task 10: a half-typed message ended with a slash command is never an answer ----
test('task 10: a message that is or ends with a Claude Code command is not an answer; a slash inside words is', () => {
  for (const t of ['I think whenever you /exit', '/exit', '  /clear  ', 'hmm /config', 'wait /bmuz:define', 'ok then\n/compact'])
    assert.ok(E.endsWithCommand(t), t)
  for (const t of ['phones and/or tablets', 'Steam / phones', 'it lives in C:/Users/Muzzy/notes', 'see /c/Users/Muzzy/notes', 'none', '1/2 of the deck', 'a 50/50 split', 'https://example.com/exit'])
    assert.equal(E.endsWithCommand(t), null, t)
  assert.equal(E.endsWithCommand('I think whenever you /exit'), '/exit')
})

test('task 10: a journaled answer that ends with a command (sirius-live4, 11:20) never counts as their words on resume', async () => {
  const { answersFrom } = await import('../plugin/scripts/ideate.mjs')
  const lines = [
    JSON.stringify({ ev: 'answer', step: 'scope', line: 'define.scope.someday', via: 'typed', text: 'I think whenever you /exit' }),
    JSON.stringify({ ev: 'answer', step: 'scope', line: 'define.scope.someday', via: 'typed', text: 'phones once the web version plays well' }),
  ]
  assert.deepEqual(answersFrom(lines), ['phones once the web version plays well'])
})

// ---- task 9: each scope box's tab is named after its feature ----
test('task 9: define.scope.need\'s tab is its idea, whole words cut to 12 characters (live look 4: four tabs all "Scope")', () => {
  const tab = idea => E.renderLine(script, 'define.scope.need', { idea }).box.header
  assert.equal(tab('Online play with friends'), 'Online play')
  assert.equal(tab('Tutorial with progressive hints'), 'Tutorial')
  assert.equal(tab('Traps variant (face-down Trap cards)'), 'Traps')
  assert.equal(tab('Asymmetrical smuggler powers'), 'Asymmetrical')
  assert.equal(tab('Hyperspacejumping'), 'Hyperspaceju')
  assert.equal(tab('AI'), 'AI')
  for (const idea of ['Online play with friends', 'Tutorial with progressive hints', 'a very long name with many words']) assert.ok(tab(idea).length <= E.HEADER_MAX)
  // every box in the script still fits its tab
  for (const [id, l] of Object.entries(script.lines)) if (l.kind === 'box' && !/\{/.test(l.box.header)) assert.ok(l.box.header.length <= 12, id)
})

// ---- task 8: every question is a question box — a building block for the whole process ----
const PIPES = ['ideate', 'define', 'design', 'develop', 'feature', 'deliver', 'release', 'bug', 'discover', 'start'].filter(id => existsSync(join(plugin, 'pipelines', `${id}.json`))).map(pipe)

test('task 8 (a): THE RULE — a line asks something when BMUZ waits for the reply: free lines, and say lines ending with a question, asking for an example or telling them to type or say something', () => {
  const say = text => ({ kind: 'say', text })
  assert.equal(E.asksSomething({ kind: 'free', text: 'Anything else?' }), true)
  assert.equal(E.asksSomething({ kind: 'box', box: { question: 'x?' } }), true)
  for (const t of ['How does a game end?', 'It starts on {first}. Anywhere else someday? Or say "none".', 'Step {n} of {total}: {what}. Say "done" when you\'re in.', 'What did I get wrong? Tell me in your next message.', 'Type your answer below.', 'Name one. For example: {example}.', 'Is that the moment?**'])
    assert.equal(E.asksSomething(say(t)), true, t)
  for (const t of ['Reading {what}…', 'Noted in your design document: {decision}.', '**The 3 Pillars**\nLater, whenever we wonder "does this idea belong?", the pillars decide.\nTwo real examples:', 'Back to Develop to {what}.', '[[ Is it {x}?]]'])
    assert.equal(E.asksSomething(say(t)), false, t)
})

test('task 8 (b): enforced — the pipeline check refuses a question written as a free line (define.scope.someday came back that way), and every real pipeline passes', () => {
  const lines = { 'x.ask': { id: 'x.ask', kind: 'free', text: 'Anywhere else someday? Or say "none".' }, 'x.tell': { id: 'x.tell', kind: 'say', text: 'Noted.' }, 'x.q': { id: 'x.q', kind: 'say', text: 'How long is one game?' } }
  const P = { id: 't', steps: [{ id: 'a', kind: 'talk', lines: ['x.tell', 'x.ask', 'x.q'] }] }
  const out = E.freeQuestionProblems(P, { lines })
  assert.equal(out.length, 2)
  assert.match(out[0], /step "a": the line "x\.ask" asks something but is a "free" line: every question is a box/)
  assert.match(out[1], /"x\.q" asks something but is a "say" line/)
  // a question list's items are asked inside their box
  const pool = { ...lines, 'x.list': { id: 'x.list', kind: 'box', box: { question: '{questions#}\nAnswer in one message.', header: 'Open', options: [] } } }
  assert.deepEqual(E.freeQuestionProblems({ id: 't', steps: [{ id: 'a', kind: 'talk', lines: ['x.list', 'x.q'] }] }, { lines: pool }), [])
  for (const p of PIPES) assert.deepEqual(E.freeQuestionProblems(p, script), [], p.id)
  const ran = spawnSync(process.execPath, [join(plugin, 'scripts', 'check-pipeline.mjs')], { encoding: 'utf8' })
  assert.equal(ran.status, 0, ran.stdout + ran.stderr)
})

test('task 8 (b): the script keeps no free question but the retired ones and the engine\'s two follow-ups — a new free line fails here', () => {
  // retired: said by no step (their words stay for the approved-script check); any.decided.what / .which: the engine's
  // follow-up to "already decided" (which of up to six answers, or what was decided), after the step's own box; deliver.
  // notready: said inside Build & Share's composed message, right before its own box asks it
  const LEFT = ['define.platform.someday', 'define.scope.smallest', 'define.scope.chart', 'design.players.online', 'design.players.length', 'deliver.notready', 'any.decided.what', 'any.decided.which']
  assert.deepEqual(Object.values(script.lines).filter(l => l.kind === 'free').map(l => l.id).sort(), LEFT.sort())
  for (const p of PIPES) for (const s of p.steps) for (const id of s.lines || []) assert.notEqual(script.lines[id].kind, 'free', `${p.id}.${s.id}: ${id}`)
})

test('task 8 (c): every converted question keeps the script\'s words in its box, 2–4 options, a tab of 12 at most; "Chat about this" is told, never an option', () => {
  const converted = ['ideate.idea', 'ideate.material', 'define.scope.someday', 'design.time', 'develop.setup.step', 'deliver.notes', 'release.walk.link', 'release.lookback']
  for (const id of converted) {
    const l = script.lines[id]
    assert.equal(l.kind, 'box', id)
    assert.ok(l.added, id)
    assert.ok(l.box.options.length >= 2 && l.box.options.length <= 4, id)
    assert.ok(l.box.header.length <= 12, id)
    assert.ok(!l.box.options.some(o => /chat about this|type something/i.test(o.label)), id)
  }
  // the words are the free line's, a heading and its lines kept in the box's question
  assert.equal(E.renderLine(script, 'ideate.idea', {}).box.question, "**Your Idea**\nTell me about your game in your own words: what it is, what you love about it, anything you remember. Half an idea is fine. If you're not sure yet, just say so.")
  assert.match(E.renderLine(script, 'design.time', {}).box.question, /\*\*Change Over Time\*\*\nWhat changes during a game[^\n]*\n\n1\. What's different at the end/)
  // a box's {example} is still required
  assert.ok(E.needsExample(script, 'define.scope.someday', { first: 'the web' }))
  // every added box has no fake typing option (the approved "I'll write my own — next, in your own words" boxes are
  // followed by their own question box, so the engine lets the script's boxes through as written)
  for (const id of Object.keys(script.lines).filter(id => script.lines[id].kind === 'box' && script.lines[id].added)) {
    const b = script.lines[id].box
    assert.equal(E.fakeTypeOptionProblem([{ question: b.question, options: b.options.map(o => ({ label: o.label, description: o.description })) }]), null, id)
  }
  // the rule every script step is told
  assert.match(E.SCRIPT_RULE, /Every question is a question box/)
  assert.match(E.SCRIPT_RULE, /"Chat about this" for a long or pasted one/)
})

test('task 8: "Chat about this" is read from Claude Code\'s answer; Claude is told what to write and the next message is the answer', () => {
  const res = { isError: true, result: 'The user wants to clarify these questions.\n    This means they may have additional information, context or questions for you.\n    Start by asking them what they would like to clarify.\n\n    Questions asked:\n- "Anything else?"\n  (No answer provided)' }
  assert.equal(E.isChatInstead(res), true)
  assert.equal(E.isChatInstead({ isError: true, result: "The user doesn't want to proceed with this tool use." }), false)
  assert.equal(E.isPersonDeclining(res), false)
  assert.equal(E.isNobodyToAsk(res), false)
  const words = E.renderLine(script, E.CHAT_LINE, {}).text
  assert.equal(words, 'Go ahead: type or paste your answer as your next message.')
  assert.match(E.chatNote('ideate.material', words), /their answer to "ideate\.material" comes as their next chat message.*Don't ask what they want to clarify.*write exactly this line as your whole reply — Go ahead/)
})

// ---- task 11: the research's two questions are boxes too (research.found "Does it change anything?", research.lost
// "Ask again?") — the engine says them itself when the creative steps in, so no pipeline step lists them ----
test('task 11: the engine\'s own step-in lines that ask something are boxes — research.found and research.lost included; the check refuses one written as a plain line', () => {
  for (const id of ['research.found', 'research.lost', 'bug.often']) assert.ok(E.STEP_IN_LINES.includes(id), id)
  // every step-in line is in the script
  for (const id of E.STEP_IN_LINES) assert.ok(script.lines[id], id)
  assert.deepEqual(E.stepInQuestionProblems(script), [])
  const plain = { lines: { ...script.lines, 'research.lost': { id: 'research.lost', kind: 'say', text: 'Your research on "{question}" stopped {why}. Ask again?' } } }
  assert.match(E.stepInQuestionProblems(plain).join(' '), /"research\.lost" asks something but is a "say" line: every question is a box/)
  // check-pipeline runs it (one red line would fail every check:pipelines)
  assert.match(readFileSync(join(plugin, 'scripts', 'check-pipeline.mjs'), 'utf8'), /stepInQuestionProblems/)
})

test('task 11: research.found keeps the script\'s words in its box, "No, carry on" first (the safe default); research.lost "Not now" first', () => {
  const found = E.renderLine(script, 'research.found', { found: ['Most games do X', 'Some fail at Y'] })
  assert.equal(found.kind, 'box')
  assert.equal(found.box.question, "Here's what I found:\n· Most games do X\n· Some fail at Y\nSources are on your project page. Does it change anything?")
  assert.deepEqual(found.box.options.map(o => o.label), ['No, carry on', 'Yes'])
  assert.match(found.box.options[1].description, /^next, tell me what changes$/)
  assert.ok(script.lines['research.found'].added)
  const lost = E.renderLine(script, 'research.lost', { question: 'how do co-op games end?', why: 'when the window closed' })
  assert.equal(lost.kind, 'box')
  assert.equal(lost.box.question, 'Your research on "how do co-op games end?" stopped when the window closed. Ask again?')
  assert.deepEqual(lost.box.options.map(o => o.label), ['Not now', 'Ask again'])
  for (const l of [found, lost]) {
    assert.ok(l.box.header.length <= 12)
    assert.equal(E.fakeTypeOptionProblem([l.box]), null)
  }
})

test('task 11: the box\'s answer is read after its question — the option picked, or what they typed', () => {
  const box = E.renderLine(script, 'research.found', { found: ['A "quoted" finding'] }).box
  const res = a => ({ result: `User has answered your questions: "${box.question}"="${a}". You can now continue with the user's answers in mind.` })
  assert.deepEqual(E.boxPick(box, res('No, carry on')), { option: 0, text: 'No, carry on' })
  assert.deepEqual(E.boxPick(box, res('Yes')), { option: 1, text: 'Yes' })
  assert.deepEqual(E.boxPick(box, res('make the weather help "both" gardens')), { option: -1, text: 'make the weather help "both" gardens' })
})
