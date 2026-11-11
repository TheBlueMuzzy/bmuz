// F227 task 3: content tables storage (framework research/bmuz-vision/content-tables-research.md, Recommendation):
// JSON in content/ is the one source; a Google Sheet is an optional linked mirror per table — pull (Sheet → JSON,
// checked, shown as a diff, committed), push (values only: never a formula cell, a notes column or a column the table
// doesn't know), refused when both sides changed since the last sync. gws is a fake here (tests/fixtures/fake-gws-sheets.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as T from '../plugin/scripts/tables.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const FAKE = join(here, 'fixtures', 'fake-gws-sheets.mjs')
const SHEET = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'
const ACCOUNTS = [{ name: 'personal', env: {} }, { name: 'muzzymade', env: { GOOGLE_WORKSPACE_CLI_CONFIG_DIR: 'fake-gws-muzzy' } }]

function setup({ owner = 'muzzymade' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-sheet-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: dir })
  spawnSync('git', ['config', 'user.email', 't@t'], { cwd: dir })
  spawnSync('git', ['config', 'user.name', 't'], { cwd: dir })
  mkdirSync(join(dir, '.planning'), { recursive: true })
  T.writeTables(dir, [{ name: 'Seed cards', columns: ['Name', 'Cost', 'Quantity', 'Value'], rows: [
    { Name: 'Sunflower', Cost: 1, Quantity: 6, Value: 2 }, { Name: 'Rose', Cost: 2, Quantity: 4, Value: 4 }] }])
  const data = join(dir, 'fake-world.json')
  const log = join(dir, 'fake-gws.log')
  // The Sheet: the same rows, a Notes column the table doesn't know, and Value as a formula (=Cost*2)
  writeFileSync(data, JSON.stringify({ sheets: { [SHEET]: { owner, tabs: { 'Seed cards': {
    values: [['Name', 'Cost', 'Quantity', 'Value', 'Notes'], ['Sunflower', 1, 6, 2, 'early game'], ['Rose', 2, 4, 4, '']],
    formulas: [[], ['', '', '', '=B2*2', ''], ['', '', '', '=B3*2', '']],
  } } } } }))
  process.env.FAKE_GWS_DATA = data
  process.env.FAKE_GWS_LOG = log
  const sheets = T.sheetsRunner([process.execPath, FAKE], ACCOUNTS)
  const world = () => JSON.parse(readFileSync(data, 'utf8')).sheets[SHEET].tabs['Seed cards']
  const editWorld = f => { const w = JSON.parse(readFileSync(data, 'utf8')); f(w.sheets[SHEET].tabs['Seed cards']); writeFileSync(data, JSON.stringify(w)) }
  const calls = () => readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l))
  return { dir, sheets, world, editWorld, calls }
}
const editJson = (dir, f) => { const p = join(dir, T.fileOf('seed-cards')); const t = JSON.parse(readFileSync(p, 'utf8')); f(t); writeFileSync(p, JSON.stringify(t, null, 2)) }

test('link: a Sheet link or id, the tab read with the account that can see it, both sides\' fingerprints kept in the link', () => {
  const { dir, sheets } = setup()
  assert.equal(T.sheetIdOf(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`), SHEET)
  assert.equal(T.sheetIdOf('not a sheet'), null)
  const r = T.link(dir, 'seed-cards', `https://docs.google.com/spreadsheets/d/${SHEET}/edit`, '', sheets)
  assert.equal(r.ok, true, r.say)
  assert.match(r.say, /linked to the Sheet's "Seed cards" tab \(muzzymade\)\. They match\./)
  const link = T.readSync(dir).tables['seed-cards'].sheet
  assert.equal(link.id, SHEET)
  assert.equal(link.account, 'muzzymade')
  assert.match(link.json, /^[0-9a-f]{12}$/)
  assert.match(T.link(dir, 'nope', SHEET, '', sheets).say, /there is no table "nope"/)
  assert.deepEqual(T.status(dir, sheets), ['Playtesting: 0 rows (JSON only)', 'Seed cards: linked to "Seed cards" · in sync'])
})

test('pull: the Sheet\'s values, only the table\'s own columns (the Notes column is left out), shown as a diff and committed', () => {
  const { dir, sheets, editWorld } = setup()
  T.link(dir, 'seed-cards', SHEET, '', sheets)
  editWorld(t => { t.values[1][1] = 3; t.values[1][3] = 6; t.values.push(['Daisy', 1, 5, 2, 'new']) })
  assert.deepEqual(T.status(dir, sheets).pop(), 'Seed cards: linked to "Seed cards" · the Sheet changed: pull')
  const r = T.pull(dir, 'seed-cards', { sheets })
  assert.equal(r.ok, true, r.say)
  assert.deepEqual(r.diff, ['+ Daisy', 'Sunflower · Cost: 1 → 3', 'Sunflower · Value: 2 → 6'])
  const t = T.readTable(dir, 'seed-cards')
  assert.deepEqual(t.columns, ['Name', 'Cost', 'Quantity', 'Value'])
  assert.deepEqual(t.rows[2], { Name: 'Daisy', Cost: 1, Quantity: 5, Value: 2 })
  assert.match(r.say, /committed$/)
  const log = spawnSync('git', ['log', '-1', '--format=%B'], { cwd: dir, encoding: 'utf8' }).stdout
  assert.match(log, /^content: Seed cards pulled from the Google Sheet "Seed cards" \(3 changes\)\n\n\+ Daisy\nSunflower · Cost: 1 → 3/)
  assert.match(T.pull(dir, 'seed-cards', { sheets }).say, /hasn't changed since the last sync; nothing to pull/)
})

test('push: only the changed value cells of the table\'s columns, as raw values; a formula cell and the Notes column are never written; a new row goes at the bottom', () => {
  const { dir, sheets, world, calls } = setup()
  T.link(dir, 'seed-cards', SHEET, '', sheets)
  editJson(dir, t => { t.rows[0].Quantity = 8; t.rows[0].Value = 99; t.rows.push({ Name: 'Tulip', Cost: 2, Quantity: 3, Value: 4 }) })
  const r = T.push(dir, 'seed-cards', { sheets })
  assert.equal(r.ok, true, r.say)
  assert.deepEqual(r.cells.map(c => c.range), ["'Seed cards'!C2", "'Seed cards'!A4", "'Seed cards'!B4", "'Seed cards'!C4", "'Seed cards'!D4"])
  const w = world()
  assert.deepEqual(w.values[1], ['Sunflower', 1, 8, 2, 'early game']) // Value (a formula) untouched, Notes untouched
  assert.match(r.say, /Not written, the Sheet works these out with a formula: Sunflower · Value \(pull to take the Sheet's values\)/)
  assert.deepEqual(w.values[3], ['Tulip', 2, 3, 4])
  const writes = calls().filter(c => c.args.includes('batchUpdate'))
  assert.equal(writes.length, 1)
  assert.equal(JSON.parse(writes[0].args[writes[0].args.indexOf('--json') + 1]).valueInputOption, 'RAW')
  assert.ok(calls().every(c => c.args[0] === 'sheets' && c.account === 'muzzymade' || c.account === 'personal'))
  assert.match(T.push(dir, 'seed-cards', { sheets }).say, /the JSON hasn't changed since the last sync; nothing to push/)
})

test('both sides changed since the last sync: pull and push both refuse, with each side\'s changes, and write nothing until a side is picked', () => {
  const { dir, sheets, world, editWorld } = setup()
  T.link(dir, 'seed-cards', SHEET, '', sheets)
  editWorld(t => { t.values[2][2] = 10 })
  editJson(dir, t => { t.rows[1].Quantity = 1 })
  const before = { sheet: JSON.stringify(world()), json: JSON.stringify(T.readTable(dir, 'seed-cards')) }
  const p = T.pull(dir, 'seed-cards', { sheets })
  assert.equal(p.ok, false)
  assert.match(p.say, /both changed since the last sync, so nothing was pulled\. Your JSON: Rose · Quantity: 4 → 1\. The Sheet: Rose · Quantity: 4 → 10\. Say which side wins/)
  assert.equal(T.push(dir, 'seed-cards', { sheets }).ok, false)
  assert.equal(JSON.stringify(world()), before.sheet)
  assert.equal(JSON.stringify(T.readTable(dir, 'seed-cards')), before.json)
  assert.deepEqual(T.status(dir, sheets).pop(), 'Seed cards: linked to "Seed cards" · both changed since the last sync: pick a side')
  // the creative picks the Sheet
  const forced = T.pull(dir, 'seed-cards', { sheets, force: true })
  assert.equal(forced.ok, true, forced.say)
  assert.equal(T.readTable(dir, 'seed-cards').rows[1].Quantity, 10)
  assert.deepEqual(T.status(dir, sheets).pop(), 'Seed cards: linked to "Seed cards" · in sync')
})

test('plain refusals: a table not linked, a Sheet nobody can read, a tab without the key column', () => {
  const { dir, sheets, editWorld } = setup({ owner: 'someone-else' })
  assert.match(T.pull(dir, 'seed-cards', { sheets }).say, /isn't linked to a Google Sheet \(link it first/)
  assert.match(T.link(dir, 'seed-cards', SHEET, '', sheets).say, /couldn't read the tab "Seed cards" of that Sheet: Requested entity was not found/)
  const other = setup()
  other.editWorld(t => { t.values[0][0] = 'Card' })
  assert.match(T.link(other.dir, 'seed-cards', SHEET, '', other.sheets).say, /the Sheet's first row has no "Name" column \(it has: Card, Cost, Quantity, Value, Notes\)/)
  void editWorld
})
