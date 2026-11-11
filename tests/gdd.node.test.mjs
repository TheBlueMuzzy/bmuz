// F232 task 1: the GDD's 14 chapters as one document — the template, a level line per chapter, and one script that
// writes a step's result into its chapters, keeping hand edits. Runs without Claude.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as G from '../plugin/scripts/gdd.mjs'

const script = new URL('../plugin/scripts/gdd.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const by = { step: 'read', stage: 'Ideate', day: '2026-11-11' }

test('the template: 14 chapters in three parts, each with the script\'s name, a level line (empty) and "open: nothing yet"; the running lists at the back', () => {
  const t = G.newGdd('Garden Race')
  assert.match(t, /^# Garden Race — Game Design Document$/m)
  for (const [, title] of G.PARTS) assert.ok(t.includes(`## ${title}`), title)
  const ch = G.readGdd(t)
  assert.equal(Object.keys(ch).length, 14)
  for (const [n, name] of G.CHAPTERS) {
    assert.ok(t.includes(`### ${n} · ${name}`), name)
    assert.equal(ch[n].level, 'empty')
    assert.equal(ch[n].text, G.NOTHING)
    assert.equal(ch[n].edited, false)
  }
  // the script's chapter table, word for word (bmuz-design-doc.html "The GDD's chapters")
  assert.deepEqual(G.CHAPTERS.map(c => c[1]), ['The Feelings', 'The 3 Pillars', 'The Pitch', 'The Core Loop', 'Platform & Play Structure', 'Scope', 'Risks & Unknowns', 'Rulebook', 'Content & Balance', 'Change Over Time', 'Players & Opponents', 'Look & Sound', 'Screens & Menus', 'Teaching'])
  for (const l of ['Sketches', 'Open Questions', 'Decisions', 'Ideas for Later', 'Changes']) assert.ok(t.includes(`## ${l}`), l)
})

test('a step\'s result goes into its chapters at its level; a level only goes up; lists only grow, sketches numbered S01…', () => {
  let t = G.newGdd('Garden Race')
  let r = G.applyResult(t, { chapters: { 3: '"two friends race to grow the best garden"', 5: ['"on phones, quick games"'] }, sketches: [{ name: 'Weather sting', question: 'Does wrecking a row feel fun or mean?' }], questions: ['How does a game end?'] }, 'loose', by)
  t = r.text
  let ch = G.readGdd(t)
  assert.equal(ch[3].level, 'loose')
  assert.equal(ch[5].text, '- "on phones, quick games"')
  assert.equal(ch[1].level, 'empty')
  r = G.applyResult(t, { chapters: { 3: 'You and a friend race gardens.' }, sketches: [{ name: 'Weather sting' }, { name: 'Two layouts', question: 'Which reads better?' }] }, 'chosen', { ...by, stage: 'Define', step: 'pitch' })
  t = r.text
  ch = G.readGdd(t)
  assert.equal(ch[3].level, 'chosen')
  assert.equal(ch[3].text, 'You and a friend race gardens.')
  r = G.applyResult(t, { chapters: { 3: 'Later loose text.' } }, 'loose', by)
  assert.equal(G.readGdd(r.text)[3].level, 'chosen', 'never lowered')
  assert.deepEqual(G.readList(t, 'Sketches'), ['S01 Weather sting — answers: Does wrecking a row feel fun or mean?', 'S02 Two layouts — answers: Which reads better?'])
  assert.deepEqual(G.readList(t, 'Open Questions'), ['How does a game end?'])
  assert.equal(G.readList(t, 'Changes').length, 2)
})

test('hand edits are kept: text outside the marks is never touched; an edit inside them moves above the marks and BMUZ\'s new text goes below, dated', () => {
  let t = G.applyResult(G.newGdd('Garden Race'), { chapters: { 4: 'You draw, you plant.' } }, 'loose', by).text
  // the creative adds a line of their own after the marks, and edits BMUZ's text
  t = t.replace('<!-- /bmuz 4 -->', '<!-- /bmuz 4 -->\nMy own note: rows of five.').replace('You draw, you plant.', 'You draw, you plant, you water.')
  assert.equal(G.readGdd(t)[4].edited, true)
  const r = G.applyResult(t, { chapters: { 4: 'You draw → you plant → you score.' } }, 'chosen', { ...by, stage: 'Define', step: 'loop' })
  assert.match(r.report.join(' '), /your own edit kept/)
  t = r.text
  const sec = t.split('### 4 · The Core Loop')[1].split('### 5')[0]
  assert.ok(sec.includes('You draw, you plant, you water.'), 'their edit kept')
  assert.ok(sec.includes('My own note: rows of five.'), 'their own line kept')
  assert.ok(sec.indexOf('You draw, you plant, you water.') < sec.indexOf('<!-- bmuz 4'), 'their edit now sits outside the marks')
  assert.match(sec, /BMUZ, 2026-11-11 \(Define · loop\):\nYou draw → you plant → you score\./)
  // a third write replaces only BMUZ's own text: theirs is still there
  t = G.applyResult(t, { chapters: { 4: 'Third.' } }, 'chosen', by).text
  const sec3 = t.split('### 4 · The Core Loop')[1].split('### 5')[0]
  assert.ok(sec3.includes('You draw, you plant, you water.') && sec3.includes('My own note: rows of five.') && sec3.includes('Third.'))
  assert.equal(G.readGdd(t)[4].edited, false)
})

test('the project page: every chapter with its level chip, the lists, and it reloads itself', () => {
  const t = G.applyResult(G.newGdd('Garden Race'), { chapters: { 1: 'The thrill of a close race.' }, ideas: ['A seasons mode'] }, 'loose', by).text
  const html = G.pageHtml(t, 'now')
  assert.match(html, /<meta http-equiv="refresh"/)
  assert.match(html, /1 · The Feelings <span class="chip loose">loose<\/span>/)
  assert.match(html, /2 · The 3 Pillars <span class="chip empty">empty<\/span>/)
  assert.match(html, /The game: 13 empty · 1 loose · 0 chosen/)
  assert.match(html, /<li>A seasons mode<\/li>/)
  assert.ok(!/<script/.test(html), 'no scripts in the page')
})

test('the script: "step <id> <level>" reads that step\'s result from .bmuz/state.json and writes GDD.md + the page; "page --open" never opens a browser in a test run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-gdd-'))
  mkdirSync(join(dir, '.bmuz'))
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ pipeline: 'ideate', resultsBy: { feelings: { chapters: { 1: ['"the thrill when your row survives"'], 7: ['fear: "it turns mean"'] }, name: 'Garden Race' } } }))
  const r = spawnSync('node', [script, 'step', 'feelings', 'loose'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const gdd = readFileSync(join(dir, '.planning/GDD.md'), 'utf8')
  assert.equal(G.readGdd(gdd)[1].level, 'loose')
  assert.equal(G.gameName(gdd), 'Garden Race')
  assert.ok(existsSync(join(dir, '.planning/project-page.html')))
  const bad = spawnSync('node', [script, 'step', 'feelings', 'great'], { cwd: dir, encoding: 'utf8' })
  assert.equal(bad.status, 1)
  const open = spawnSync('node', [script, 'page', '--open'], { cwd: dir, encoding: 'utf8', env: { ...process.env, BMUZ_TEST: '1' } })
  assert.match(open.stdout, /test run: would open file:\/\//)
})
