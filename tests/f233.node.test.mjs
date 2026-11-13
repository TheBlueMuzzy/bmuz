// F233 — Finished games come in as fixed. No-Claude tests: a finished, played game (written rules + "played it")
// takes the conversion path, decided from what Ideate read, never asked; its rules go into the GDD as fixed with
// their source; the game so far never says "Nothing here is decided yet" for it; flavour text is never "your ideas".
// The fixture's rulebook (tests/fixtures/finished-game/rules.md) is a short made-up game, Moonmarket.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'
import * as I from '../plugin/scripts/ideate.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
const RULES = readFileSync(join(here, 'fixtures', 'finished-game', 'rules.md'), 'utf8')
export const MOON_IDEA = "It's Moonmarket, a board game I finished years ago: we've played it loads. I want to turn it into a digital version."

export function moonProject(read, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-f233-'))
  mkdirSync(join(dir, '.bmuz'))
  mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
  const state = { pipeline: 'ideate', resultsBy: { idea: { idea: MOON_IDEA, spark: '', unsure: false, name: '' }, read, ...extra } }
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify(state))
  writeFileSync(join(dir, '.bmuz/journal.jsonl'), JSON.stringify({ ev: 'answer', step: 'idea', line: 'ideate.idea', via: 'typed', text: MOON_IDEA }) + '\n')
  writeFileSync(join(dir, '.planning/research/shared.json'), JSON.stringify({ version: 1, sources: [{ name: 'your one-breath answer', text: MOON_IDEA }, { name: 'rules.md', text: RULES }], listed: [{ what: 'art/board.psd', kind: 'a Photoshop file (art)' }], unread: [] }))
  return { dir, state }
}

const SRC = 'rules.md'
export const MOON_READ = {
  name: 'Moonmarket',
  stands: 'a finished game: written rules, played',
  finished: true,
  sofar: {
    3: { fixed: [{ text: 'Welcome to the Moonmarket, where the stalls open only while the moon is up.', his: true, source: SRC }], ideas: [], open: [] },
    8: {
      fixed: [
        { text: 'Each player puts their cart on any stall and draws 3 goods cards.', his: true, source: SRC },
        { text: 'Move your cart one or two stalls around the ring.', his: true, source: SRC },
        { text: 'When it reaches space 8 the market closes and the game ends.', his: true, source: SRC },
        { text: 'The most points wins. A tie is a shared win.', his: true, source: SRC },
      ],
      ideas: [],
      open: ["Your rules say you refill an empty stall from the deck. What happens when the deck runs out?"],
    },
    5: { fixed: [], ideas: [], open: ['Where is the digital version played: phone, computer, or both?'] },
  },
}

test('a finished game takes the conversion path: its rules go in as fixed with their source, never "Nothing here is decided yet"', () => {
  const { dir, state } = moonProject(MOON_READ)
  const r = I.soFar(dir, state, script)
  assert.equal(r.finished, true)
  const gdd = readFileSync(join(dir, '.planning/GDD.md'), 'utf8')
  const ch = G.readGdd(gdd)
  assert.match(ch[8].text, /^- Fixed: "Each player puts their cart on any stall and draws 3 goods cards\." \(from rules\.md\)$/m)
  assert.match(ch[8].text, /^- Open: Your rules say you refill an empty stall from the deck\. What happens when the deck runs out\?$/m)
  assert.doesNotMatch(ch[8].text, /Clear:/)
  assert.equal(ch[2].level, 'empty', 'the pillars still stay empty in Ideate')
  const msg = readFileSync(join(dir, I.SO_FAR), 'utf8')
  assert.doesNotMatch(msg, /Nothing here is decided yet/)
  assert.ok(msg.includes("It's a finished game, so what your rules say is fixed: I won't ask you to decide it again."))
  assert.match(msg, /\*\*Fixed by your rules\*\*\n· "Each player puts their cart on any stall and draws 3 goods cards\." \(from rules\.md\)\n/)
  // flavour is fixed (the setting), never an idea; with no ideas of their own there is no "Your ideas" heading
  assert.ok(msg.includes('"Welcome to the Moonmarket, where the stalls open only while the moon is up." (from rules.md)'))
  assert.doesNotMatch(msg, /Your ideas/)
  // (hardest to change first: where it's played, then the rules)
  assert.match(msg, /\*\*What your rules leave open\*\*\n· Where is the digital version played: phone, computer, or both\? \(Platform & Play Structure\)\n· Your rules say you refill an empty stall from the deck\. What happens when the deck runs out\? \(Rulebook\)\n/)
  assert.doesNotMatch(msg, /nothing yet \(The Feelings\)/)
  assert.equal(JSON.parse(readFileSync(join(dir, I.SO_FAR_JSON), 'utf8')).path, 'convert')
  // the line is the script's, word for word (every fixed part of it is in the message)
  for (const part of script.lines['ideate.sofar.rules'].text.replace(/\[\[[\s\S]*?\]\]/g, '{x}').split(/\{\w+\}/).map(p => p.trim()).filter(p => p.length > 12)) assert.ok(msg.includes(part), part)
})

test('the path is decided from what was read, never asked: a "finished" reading with almost no rules, or none at all, stays on the new-idea path', () => {
  const thin = JSON.parse(JSON.stringify(MOON_READ))
  thin.sofar[8].fixed = thin.sofar[8].fixed.slice(0, 2)
  assert.equal(I.isFinished(thin, I.checkReading(thin.sofar, { material: RULES, answers: '' }).chapters), false, 'two rules are not a rulebook')
  const notSaid = { ...MOON_READ, finished: false }
  const { dir, state } = moonProject(notSaid)
  const r = I.soFar(dir, state, script)
  assert.equal(r.finished, false)
  const msg = readFileSync(join(dir, I.SO_FAR), 'utf8')
  assert.match(msg, /Nothing here is decided yet\./)
  assert.match(readFileSync(join(dir, '.planning/GDD.md'), 'utf8'), /- Clear: "Each player puts their cart/)
  assert.equal(I.isFinished({ finished: 'yes' }, I.checkReading(MOON_READ.sofar, { material: RULES, answers: '' }).chapters), true)
})

test('the so-far step hands the path back for the steps that run only on it ({convert} / {fresh})', () => {
  const run = read => {
    const { dir } = moonProject(read)
    const r = spawnSync('node', [join(plugin, 'scripts', 'ideate.mjs'), 'so-far'], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const step = JSON.parse(readFileSync(join(plugin, 'pipelines', 'ideate.json'), 'utf8')).steps.find(s => s.id === 'so-far')
    return E.scriptResults(step, r.stdout)
  }
  assert.deepEqual(run(MOON_READ).result, { convert: 'yes', fresh: 'no' })
  assert.deepEqual(run({ ...MOON_READ, finished: false }).result, { convert: 'no', fresh: 'yes' })
})

test('Ideate on the conversion path: "What Your Rules Leave Open" runs in place of Feelings & Hopes and Open Ideas; the new-idea path is unchanged', () => {
  const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'ideate.json'), 'utf8'))
  const step = id => P.steps.find(s => s.id === id)
  const convert = { convert: 'yes', fresh: 'no' }
  const fresh = { convert: 'no', fresh: 'yes' }
  assert.ok(E.isWanted(step('rules-open'), convert) && !E.isWanted(step('feelings'), convert) && !E.isWanted(step('open-ideas'), convert))
  assert.ok(!E.isWanted(step('rules-open'), fresh) && E.isWanted(step('feelings'), fresh) && E.isWanted(step('open-ideas'), fresh))
  assert.ok(E.isWanted(step('sketches'), convert) && E.isWanted(step('sketches'), fresh), 'the sketch list is on both paths')
  assert.deepEqual(step('sketches').needs, ['rules-gdd'])
  // its questions: each names what the rules DO say first; never the feelings, hopes or "ideas for it, even half-formed"
  const r = E.renderLine(script, 'ideate.open.ask', { questions: [
    { line: 'ideate.rules.gap', slots: { says: 'you refill an empty stall from the deck', asks: 'What happens when the deck runs out?' } },
    { line: 'ideate.pool.where' },
    { line: 'ideate.digital.who', slots: { players: '2 to 4 players' } },
    { line: 'ideate.digital.computer', slots: { chores: 'shuffle, deal, refill the stalls and count the points' } },
  ] })
  assert.equal(r.text, [
    '1. Your rules say you refill an empty stall from the deck. What happens when the deck runs out?',
    '2. Where do you picture people playing it: on a phone, a computer, both?',
    '3. Your rules are for 2 to 4 players around a table. On a screen, who plays: people online (at the same time, or taking turns), friends on one screen, the computer, or a mix?',
    '4. At the table, players shuffle, deal, refill the stalls and count the points themselves. The computer can do all of that now. Anything it shouldn\'t do, or anything extra you\'d like (a tutorial, hints, replays)?',
    'Answer in one message, in any order.',
  ].join('\n'))
  const lines = step('rules-open').lines
  for (const id of ['ideate.feelings', 'ideate.open', 'ideate.pool.mentioned', 'ideate.pool.remember', 'ideate.pool.decided', 'ideate.round']) assert.ok(!lines.includes(id), id)
  assert.match(readFileSync(join(plugin, step('rules-open').craft), 'utf8'), /never ask what they already say/)
})

test('Define on the conversion path: one "What your rulebook decides" page, then only Platform & Play, scope, the slice and the risks', async () => {
  const D = await import('../plugin/scripts/define.mjs')
  const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'define.json'), 'utf8'))
  assert.deepEqual(E.checkPipeline(P), [])
  assert.deepEqual(E.checkLines(P, script), [])
  const convert = { convert: 'yes', fresh: 'no' }
  const fresh = { convert: 'no', fresh: 'yes' }
  const runs = vars => P.steps.filter(s => s.kind === 'talk' || s.kind === 'flow' || s.kind === 'gate').filter(s => E.isWanted(s, { ...vars, research: 'no' }) && !s.onBack).map(s => s.id)
  assert.deepEqual(runs(convert), ['welcome-rules', 'decides', 'platform-rules', 'scope', 'slice', 'lock'])
  assert.deepEqual(runs(fresh), ['welcome', 'feelings', 'pillars', 'pitch-ask', 'pitch', 'loop', 'platform', 'clash', 'clash-review', 'clashes', 'scope', 'slice', 'lock'], 'the new-idea path is unchanged')
  assert.equal(P.steps[0].id, 'path')
  // the path is worked out from Ideate's reading (or a GDD with its rules fixed), never asked
  const { dir } = moonProject(MOON_READ)
  const path = () => {
    const r = spawnSync('node', [join(plugin, 'scripts', 'define.mjs'), 'path'], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout)
    return E.scriptResults(P.steps[0], r.stdout).result
  }
  assert.deepEqual(path(), fresh, 'nothing read yet: a new idea')
  I.soFar(dir, JSON.parse(readFileSync(join(dir, '.bmuz/state.json'), 'utf8')), script)
  assert.deepEqual(path(), convert)
  writeFileSync(join(dir, I.SO_FAR_JSON), '{}')
  assert.deepEqual(path(), convert, 'a GDD whose Rulebook has its rules fixed')
  // the page: the four drafted from the rules, word for word, then one box (confirm / change some)
  const page = E.renderLine(script, 'define.rules', { feelings: 'challenge: racing the moon to fill orders before the market closes', know: 'they groan when someone fills the order they were building', pillars: ['**Race the moon**: every turn counts down', '**Read the market**: what others are collecting', '**Small hands**: three goods, hard choices'], oneliner: 'Fill the night market\'s orders before the moon sets.', lines: ['You push your cart around a ring of stalls.', 'You swap goods to match an order before anyone else.'], loop: 'You move, then take or swap a good, so you can fill an order.' })
  assert.match(page.text, /^\*\*What Your Rulebook Decides\*\*\nHere's what your rules already decide, as I read them:\n\n\*\*The Feelings:\*\* challenge: racing the moon/)
  assert.match(page.text, /\*\*The 3 Pillars:\*\*\n· \*\*Race the moon\*\*: every turn counts down\n/)
  const box = E.renderLine(script, 'define.rules.ok', {})
  assert.deepEqual(box.box.options.map(o => o.label), ['Yes, that\'s it', 'Change some'])
  // the lock still writes GDD Part 1 the same way: chapters 1–4 chosen from one step, the ✓ lines filled from it
  const state = JSON.parse(readFileSync(join(dir, '.bmuz/state.json'), 'utf8'))
  state.pipeline = 'define'
  // (the skipped new-idea steps' results are there but empty: headless ideate-finished, "define.lock needs {loop}")
  state.resultsBy = { ...state.resultsBy, feelings: {}, pillars: {}, pitch: {}, loop: {}, platform: { platform: null },
    decides: { chapters: { 1: '**The feeling:** racing the moon — challenge', 2: '- **Race the moon**: every turn counts down.\n- **Read the market**: watch the others.\n- **Small hands**: hard choices.', 3: 'You push your cart around a ring of stalls.\n**One line:** Fill the night market\'s orders before the moon sets.', 4: '**move → take or swap → fill an order**' }, feelings: ['racing the moon'], feeling: 'racing the moon', pillars: [{ name: 'Race the moon' }, { name: 'Read the market' }, { name: 'Small hands' }], oneliner: 'Fill the night market\'s orders before the moon sets.', loop: 'move → take or swap → fill an order' },
    'platform-rules': { chapters: { 5: '- **First:** the web' }, platform: 'computer first; online against people or the computer' },
    scope: { musts: ['the board', 'orders', 'the moon'] } }
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify(state))
  for (const id of ['decides', 'platform-rules']) assert.equal(spawnSync('node', [join(plugin, 'scripts', 'gdd.mjs'), 'step', id, 'chosen'], { cwd: dir, encoding: 'utf8' }).status, 0)
  const ch = G.readGdd(readFileSync(join(dir, '.planning/GDD.md'), 'utf8'))
  for (const n of [1, 2, 3, 4, 5]) assert.equal(ch[n].level, 'chosen', `chapter ${n}`)
  const lock = D.lockShow(dir, state, script)
  assert.equal(lock.slots.feelings, 'racing the moon')
  assert.equal(lock.slots.pillars, 'Race the moon · Read the market · Small hands')
  assert.equal(lock.slots.oneliner, 'Fill the night market\'s orders before the moon sets.')
  assert.equal(lock.slots.platform, 'computer first; online against people or the computer')
  assert.equal(lock.slots.musts, '3')
})

test('6c: the "couldn\'t read" line has its plurals right and says reasons as reasons (the live look\'s Drive folder, exactly)', () => {
  const live = {
    listed: [
      ...Array(17).fill({ kind: 'a Photoshop file (art)' }), ...Array(170).fill({ kind: 'an image' }), ...Array(8).fill({ kind: 'an Illustrator file (art)' }),
      { kind: 'a PDF (paste its text to have it read)' }, { kind: "a file I can't read as text" }, { kind: "a file I can't read as text" },
    ],
    unread: [1, 2, 3].map(i => ({ what: `Drive · SiriusSmugglers/${i}/…`, why: "more than 200 files: the rest weren't looked at" })),
  }
  assert.equal(I.unreadLine(live), "17 Photoshop files, 170 images, 8 Illustrator files, 1 PDF, 2 files I can't read as text and the rest of 3 folders with more than 200 files")
  assert.equal(I.unreadLine({ listed: [{ kind: 'a program or build' }, { kind: 'a program or build' }, { kind: 'a slide deck file (share it as Google Slides)' }] }), '2 programs or builds and 1 slide deck file')
  assert.equal(I.unreadLine({ unread: [{ what: 'notes.txt', why: 'over the reading limit for one pass' }] }), 'notes.txt (over the reading limit for one pass)')
  assert.equal(I.unreadLine({ unread: [{ what: 'a', why: 'not found' }, { what: 'b', why: 'not found' }], listed: [{ kind: 'a sound' }] }), '1 sound and 2 links or files (not found)')
  assert.equal(I.plural('Google Sheet', 3), 'Google Sheets')
  assert.equal(I.plural("text file too big to read in one pass", 2), 'text files too big to read in one pass')
  assert.equal(I.unreadLine({}), '')
})

test('6b: Open Ideas\' vague questions are gone; the smallest-version question says what it means, with an example from the game', () => {
  const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'ideate.json'), 'utf8'))
  const lines = P.steps.find(s => s.id === 'open-ideas').lines
  assert.ok(!lines.includes('ideate.pool.smallest') && !lines.includes('ideate.pool.decided'))
  assert.ok(lines.includes('ideate.pool.first'))
  assert.equal(E.renderLine(script, 'ideate.pool.first', { example: 'two players, one seed deck, no online yet' }).text, "What's the smallest version you'd want to play first: which part of the game, and what can wait? For example: two players, one seed deck, no online yet.")
  assert.match(E.renderLine(script, 'ideate.pool.first', {}).error, /needs \{example\}/)
  assert.match(readFileSync(join(plugin, 'craft', 'ideate-open.md'), 'utf8'), /only when the material leaves that need open/)
})

test('6d: a free question ends with "Type your answer below."; the nudge writes an open question again, last', () => {
  assert.equal(script.lines[E.TYPE_LINE].text, 'Type your answer below.')
  const step = { id: 'feelings' }
  const missing = [{ id: 'define.feelings.match', text: 'That sounds closest to **challenge**.' }]
  const ask = { id: 'define.feelings.know', text: 'How would we know a player feels it?\n\nType your answer below.' }
  const fix = E.unsaidNudge(step, [...missing, ask], 0, { ask: true, again: 1 })
  assert.match(fix, /The script line "define\.feelings\.match" was not written word for word\. Write exactly this, nothing changed, your open question last \(it must be the last thing they see\), as your whole reply, then end your turn/)
  assert.ok(fix.endsWith('That sounds closest to **challenge**.\n\nHow would we know a player feels it?\n\nType your answer below.'))
  // with no question open, as before
  assert.match(E.unsaidNudge(step, missing, 0), /Write exactly this, nothing changed, then carry on:\n\nThat sounds/)
  assert.equal(E.unsaidNudge(step, missing, 2), null)
})
