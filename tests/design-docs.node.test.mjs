// F227 task 2: the rulebook and the content tables as project files, with their writer scripts keeping hand edits
// (like the GDD), each a tab on the project page. No Claude: the script's own made-up example, the garden race
// (bmuz-design-doc.html "Example · Design, filled in").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'
import * as M from '../plugin/scripts/marks.mjs'
import * as R from '../plugin/scripts/rulebook.mjs'
import * as T from '../plugin/scripts/tables.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const script = E.parseScript(readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8'))
const by = { step: 'sections', stage: 'Design', day: '2026-11-12' }

// The garden race's first pass (the script's example: the Flow, Rule A / Rule B for hail).
const FIRST = {
  overview: 'Two friends race to grow the best garden in about three minutes.',
  components: ['36 seed cards', '12 weather cards', 'X garden rows per player (TBD)'],
  win: 'The most blooming flowers when the seed deck runs out wins.',
  setup: ['Shuffle the seed and weather cards together.', 'Deal each player 3 cards.'],
  flow: ['Draw two cards.', 'Play one card: plant a seed in one of your rows, or send weather to one of your friend\'s rows.', 'Any row with three blooms scores and is cleared.', 'Your friend\'s turn.'],
  actions: [{ name: 'Plant', text: 'Put a seed card in one of your rows. You can\'t plant in a row with hail on it.' }, { name: 'Send weather', text: 'Rule A / Rule B, to test: hail destroys one bloom (A) or the whole row (B).' }],
  end: 'The game ends when the seed deck runs out; finish the round.',
  scoring: 'Each bloom scores 1; a full row bonus is TBD.',
  keywords: [{ term: 'Bloom', meaning: 'a seed card that has finished growing' }, { term: 'Row', meaning: 'TBD: how many cards a row holds' }],
  log: 'First pass written from the concept. To test: Rule A vs Rule B for hail.',
}

test('the rulebook: Muzzy\'s structure in order; the Flow numbered; each action under Gameplay; TBD and Rule A / Rule B counted; the log dated and numbered', () => {
  const out = R.applyRulebook(R.newRulebook('Garden Race'), FIRST, by)
  const t = out.text
  const heads = t.split('\n').filter(l => /^##+ /.test(l)).map(l => l.replace(/^#+ /, ''))
  assert.deepEqual(heads, ['Overview', 'Components', 'How to Win', 'Setup', 'Gameplay', 'The Flow', 'Plant', 'Send weather', 'Game End', 'Scoring', 'Keywords', 'Development Log'])
  assert.deepEqual(R.flowSteps(t), FIRST.flow)
  assert.match(t, /\n1\. Draw two cards\.\n2\. Play one card/)
  assert.match(t, /- \*\*Bloom\*\*: a seed card that has finished growing/)
  assert.deepEqual(R.logEntries(t), ['v0.1 · 2026-11-12 · First pass written from the concept. To test: Rule A vs Rule B for hail.'])
  const c = R.counts(t)
  assert.equal(c.tbd, 3)
  assert.equal(c.ab, 1)
  assert.deepEqual(c.actions, ['Plant', 'Send weather'])
  // the same log entry twice isn't logged twice; a new one is v0.2
  const again = R.applyRulebook(t, { log: FIRST.log }, by)
  assert.equal(R.logEntries(again.text).length, 1)
  const next = R.applyRulebook(t, { log: 'Hail tested: Rule B felt mean, Rule A kept.' }, { ...by, day: '2026-11-20' })
  assert.equal(R.logEntries(next.text)[1], 'v0.2 · 2026-11-20 · Hail tested: Rule B felt mean, Rule A kept.')
})

test('the rulebook keeps hand edits: a part they changed moves out of the marks, kept for good; BMUZ\'s new text is dated below; text outside the marks is never touched', () => {
  let t = R.applyRulebook(R.newRulebook('Garden Race'), FIRST, by).text
  t = t.replace('Deal each player 3 cards.', 'Deal each player 4 cards.').replace('## Scoring', 'My own note about scoring.\n\n## Scoring')
  const out = R.applyRulebook(t, { setup: ['Shuffle the seed and weather cards together.', 'Deal each player 3 cards.', 'The youngest player goes first.'] }, { ...by, day: '2026-11-13', step: 'change' })
  assert.deepEqual(out.kept, ['setup'])
  assert.match(out.text, /- Deal each player 4 cards\.\n\n<!-- bmuz rb:setup · [0-9a-f]{8} -->\nBMUZ, 2026-11-13 \(Design · change\):\n/)
  assert.match(out.text, /My own note about scoring\./)
  // a third write: theirs stays above, BMUZ's block (now unedited) is simply replaced
  const third = R.applyRulebook(out.text, { setup: 'Shuffle; deal 3; youngest first.' }, by)
  assert.match(third.text, /Deal each player 4 cards\./)
  assert.equal(M.readBlocks(third.text)['rb:setup'].text, 'Shuffle; deal 3; youngest first.')
})

test('marks: unchanged text written again changes nothing; a new block goes after its heading', () => {
  const doc = '# X\n\n## A\n\n## B\n'
  const one = M.writeBlock(doc, 'k:a', 'hello', { after: '## A' })
  assert.equal(one.changed, true)
  assert.match(one.text, /## A\n<!-- bmuz k:a · [0-9a-f]{8} -->\nhello\n<!-- \/bmuz k:a -->/)
  assert.equal(M.writeBlock(one.text, 'k:a', 'hello').changed, false)
  assert.equal(M.unmarked(one.text).includes('bmuz'), false)
})

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-design-'))
  mkdirSync(join(dir, '.bmuz'))
  mkdirSync(join(dir, '.planning'), { recursive: true })
  writeFileSync(join(dir, G.GDD), G.newGdd('Garden Race'))
  return dir
}
const state = (dir, resultsBy) => writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ pipeline: 'design', resultsBy }))

test('rulebook.mjs step: the file, GDD chapter 8\'s summary (at the level given), the page\'s Rulebook tab; done-show counts from the file, in the script\'s words', () => {
  const dir = project()
  state(dir, { sections: { rulebook: FIRST } })
  const r = R.stepWrite(dir, 'sections', 'worked out', new Date('2026-11-12T10:00:00Z'))
  assert.equal(r.ok, true, r.say)
  const gdd = readFileSync(join(dir, G.GDD), 'utf8')
  const ch8 = G.readGdd(gdd)[8]
  assert.equal(ch8.level, 'worked out')
  assert.match(ch8.text, /^The rulebook: \.planning\/design\/RULEBOOK\.md/)
  assert.match(ch8.text, /\*\*Still rough:\*\* 3 TBD · 1 Rule A \/ Rule B to test/)
  const page = readFileSync(join(dir, G.PAGE), 'utf8')
  assert.match(page, /<a href="#rulebook">Rulebook<\/a>/)
  assert.match(page, /<h2 id="rulebook">Rulebook<\/h2>/)
  assert.match(page, /Draw two cards\./)
  assert.match(page, /<h2 id="ui-styles">UI styles<\/h2>/)
  assert.equal((page.match(/class="style"/g) || []).length, 7)
  const d = R.doneShow(dir, script)
  assert.equal(d.text, 'First pass done. 3 rules are marked TBD and 1 is a Rule A / Rule B to test. I\'ve added a first Development Log entry:\nv0.1 · 2026-11-12 · First pass written from the concept. To test: Rule A vs Rule B for hail.\nYou can read and edit it any time, on your project page or in Obsidian. I keep your edits.')
  assert.equal(readFileSync(join(dir, R.DONE_MD), 'utf8'), d.text + '\n')
})

// The script's example table: Seed cards (first rows).
const SEEDS = { name: 'Seed cards', columns: ['Name', 'Type', 'Cost', 'Effect', 'Quantity', 'Balance value', 'Flavour'], rows: [
  { Name: 'Sunflower', Type: 'Seed', Cost: '1', Effect: 'Blooms in 1 turn', Quantity: 6, 'Balance value': '2.0' },
  ['Rose', 'Seed', 2, 'Blooms in 2 turns, scores double', 4, 2.5, ''],
] }

test('content tables: one JSON file per kind of thing, numbers as numbers, the Playtesting table made with the script\'s columns', () => {
  const dir = project()
  const report = T.writeTables(dir, [SEEDS])
  assert.deepEqual(report, ['Seed cards: 2 rows', 'Playtesting: 0 rows'])
  const t = T.readTable(dir, 'seed-cards')
  assert.deepEqual(t.columns, SEEDS.columns)
  assert.deepEqual(t.rows[0], { Name: 'Sunflower', Type: 'Seed', Cost: 1, Effect: 'Blooms in 1 turn', Quantity: 6, 'Balance value': 2, Flavour: '' })
  assert.equal(t.rows[1].Effect, 'Blooms in 2 turns, scores double')
  assert.deepEqual(T.readTable(dir, 'playtesting').columns, ['Date', 'Players', 'Start', 'End', 'Length', 'Scores'])
  assert.equal(T.normalise({ name: 'x' }), null)
})

test('content tables keep hand edits cell by cell: an edited cell, a row they added, a row they deleted all stay as they left them', () => {
  const dir = project()
  T.writeTables(dir, [SEEDS])
  const f = join(dir, T.fileOf('seed-cards'))
  const t = JSON.parse(readFileSync(f, 'utf8'))
  t.rows[0].Cost = 3 // their edit
  t.rows = t.rows.filter(r => r.Name !== 'Rose') // deleted by hand
  t.rows.push({ Name: 'Tulip', Type: 'Seed', Cost: 1, Effect: 'their own card', Quantity: 2, 'Balance value': '', Flavour: '' })
  writeFileSync(f, JSON.stringify(t))
  const next = { ...SEEDS, rows: [{ ...SEEDS.rows[0], Cost: 1, Quantity: 8 }, SEEDS.rows[1], ['Daisy', 'Seed', 1, 'Blooms in 1 turn', 5, 1.5, '']] }
  const report = T.writeTables(dir, [next])
  assert.match(report[0], /your \d+ edited cells kept/)
  const after = T.readTable(dir, 'seed-cards')
  const by = n => after.rows.find(r => r.Name === n)
  assert.equal(by('Sunflower').Cost, 3) // theirs
  assert.equal(by('Sunflower').Quantity, 8) // BMUZ's update to a cell they didn't touch
  assert.equal(by('Rose'), undefined) // they deleted it: not put back
  assert.equal(by('Tulip').Effect, 'their own card')
  assert.equal(by('Daisy').Cost, 1) // new from BMUZ
})

test('tables.mjs step: GDD chapter 9 is a summary and link to the tables; the page has a Content tab with each table', () => {
  const dir = project()
  state(dir, { 'content-fill': { tables: [SEEDS] } })
  const r = T.stepWrite(dir, 'content-fill', 'worked out', new Date('2026-11-12T10:00:00Z'))
  assert.equal(r.ok, true, r.say)
  const ch9 = G.readGdd(readFileSync(join(dir, G.GDD), 'utf8'))[9]
  assert.equal(ch9.level, 'worked out')
  assert.match(ch9.text, /- \*\*Seed cards\*\* \(content\/data\/seed-cards\.json\): 2 rows · Name · Type · Cost/)
  assert.match(ch9.text, /- \*\*Playtesting\*\* \(content\/data\/playtesting\.json\): 0 test games so far/)
  const page = readFileSync(join(dir, G.PAGE), 'utf8')
  assert.match(page, /<h2 id="content">Content<\/h2>/)
  assert.match(page, /<td>Sunflower<\/td>/)
})

test('the page: sketch pages listed with links; the TDD tab and the roadmap in Plan once they exist', () => {
  const dir = project()
  mkdirSync(join(dir, '.planning/research/sketches'), { recursive: true })
  writeFileSync(join(dir, '.planning/research/sketches/S01-ball-speed-feel.html'), '<!doctype html>')
  writeFileSync(join(dir, '.planning/TDD.md'), '# Garden Race — Technical Design Document (TDD)\n\n## 1. At a glance\n- **Platforms:** web\n')
  writeFileSync(join(dir, '.planning/ROADMAP.md'), '# Garden Race — Roadmap\n\n## v0.1 — Vertical slice  ← current\n- ⏳ F01 🧱 Turn engine — draw, play, score — must:prototype\n')
  G.writePage(dir)
  const page = readFileSync(join(dir, G.PAGE), 'utf8')
  assert.match(page, /<a href="research\/sketches\/S01-ball-speed-feel\.html">S01-ball-speed-feel<\/a>/)
  assert.match(page, /<h2 id="tdd">TDD<\/h2>/)
  assert.match(page, /F01 🧱 Turn engine/)
  assert.ok(!existsSync(join(dir, R.RULEBOOK)))
  assert.ok(!/id="ui-styles"/.test(page)) // (the styles come with the rulebook, in Design)
})
