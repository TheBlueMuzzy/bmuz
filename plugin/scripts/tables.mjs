// The content tables (F227 tasks 2–3; the approved script's 3.3 Content & Balance): every card, unit, ability, level
// and number, one table per kind of thing, one row each — the files the finished game reads.
//
// Where they live (the call, framework .planning/research/bmuz-vision/content-tables-research.md "Recommendation"):
// JSON in content/data/<table>.json is the ONE source. A Google Sheet can be linked to a table as a mirror, for a
// game whose tables started in Sheets:
//   pull  Sheet → JSON: the values read, checked against the table's columns, shown as a plain diff, committed
//   push  JSON → Sheet: only the value cells of the table's own columns, as raw values; never a formula cell, a notes
//         column or any column the table doesn't know
//   both changed since the last sync → refused, with both sides' changes, until the creative picks a side
// The link and the fingerprints of both sides at the last sync live in .planning/design/tables.json.
//
//   node tables.mjs step <step-id> [level]   write that step's "tables" result into content/data/, the summary into
//                                            GDD chapter 9 (default loose), the project page
//   node tables.mjs list | status            the tables (and, for linked ones, which side changed since the sync)
//   node tables.mjs link <table> <sheet-id-or-link> [tab]
//   node tables.mjs pull <table> [--sheet]   (--sheet: when both changed, the Sheet wins: the creative's pick)
//   node tables.mjs push <table> [--json]    (--json: when both changed, the JSON wins)
//   (run in the project folder; Sheets through the gws CLI, both accounts tried, as Ideate's reading does)
//
// Hand edits to a table's JSON are kept cell by cell: BMUZ remembers what it last wrote; a cell that differs from
// that was changed by the creative and is never overwritten; a row they added stays, a row they deleted isn't put back.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as G from './gdd.mjs'
import { gwsAccounts, gwsCommand } from './ideate-fetch.mjs'

export const DIR = 'content/data'
export const SYNC = '.planning/design/tables.json'
export const PLAYTESTING = { name: 'Playtesting', columns: ['Date', 'Players', 'Start', 'End', 'Length', 'Scores'], rows: [] }
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
export const tableId = name => clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const fp = v => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12)
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// A cell as the table keeps it: a number stays a number ("2" → 2, "2.5" → 2.5), the rest is text.
export function cell(v) {
  if (v == null) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return v
  const t = clean(v)
  return /^-?\d+(\.\d+)?$/.test(t) && !/^0\d/.test(t) ? Number(t) : t
}

// A table from a step's result: { name, columns: [...], rows: [ {col: value} | [values in column order] ] }.
export function normalise(t) {
  if (!t || typeof t !== 'object') return null
  const name = clean(t.name || t.table)
  const columns = (Array.isArray(t.columns) ? t.columns : []).map(clean).filter(Boolean)
  if (!name || !columns.length) return null
  const rows = []
  for (const r of Array.isArray(t.rows) ? t.rows : []) {
    const obj = Array.isArray(r) ? Object.fromEntries(columns.map((c, i) => [c, r[i]])) : r && typeof r === 'object' ? r : null
    if (!obj) continue
    const row = Object.fromEntries(columns.map(c => [c, cell(obj[c])]))
    if (clean(row[columns[0]]) === '') continue
    rows.push(row)
  }
  return { name, columns, rows }
}

const keyOf = (t, row) => clean(row[t.columns[0]]).toLowerCase()

// Merges BMUZ's new version of a table into the file as it is now, keeping every hand edit (see the top).
// cur: the file now (null: none) · last: what BMUZ last wrote (null: never) · next: BMUZ's new version.
// Returns { table, kept: n cells kept, added: n rows added }.
export function merge(cur, last, next) {
  if (!cur) return { table: next, kept: 0, added: next.rows.length }
  if (last && same(cur, last)) return { table: next, kept: 0, added: Math.max(0, next.rows.length - cur.rows.length) }
  // (F227 review: no record of what BMUZ last wrote → everything in the file is theirs; it was replaced whole)
  if (!last) last = { columns: [], rows: [] }
  const removedCols = last.columns.filter(c => !cur.columns.includes(c))
  const columns = [...cur.columns, ...next.columns.filter(c => !cur.columns.includes(c) && !removedCols.includes(c))]
  const lastBy = new Map(last.rows.map(r => [keyOf(last, r), r]))
  const nextBy = new Map(next.rows.map(r => [keyOf(next, r), r]))
  let kept = 0
  const rows = cur.rows.map(r => {
    const k = keyOf(cur, r)
    const was = lastBy.get(k)
    const want = nextBy.get(k)
    const out = {}
    for (const c of columns) {
      const mine = c in r ? r[c] : undefined
      const bmuz = was ? was[c] : undefined
      if (mine !== undefined && was && !same(mine, bmuz)) { kept += 1; out[c] = mine } // the creative's
      // a row BMUZ never wrote is theirs (F227 review: their values were overwritten): only a cell they left empty is filled
      else if (!was && mine !== undefined && mine !== '') { if (want && c in want && !same(mine, want[c])) kept += 1; out[c] = mine }
      else if (want && c in want) out[c] = want[c]
      else out[c] = mine === undefined ? '' : mine
    }
    return out
  })
  let added = 0
  for (const r of next.rows) {
    const k = keyOf(next, r)
    if (rows.some(x => keyOf({ columns }, x) === k) || lastBy.has(k)) continue // there already, or deleted by hand
    rows.push(Object.fromEntries(columns.map(c => [c, c in r ? r[c] : ''])))
    added += 1
  }
  return { table: { name: cur.name || next.name, columns, rows }, kept, added }
}

// ---- files ----
const readJson = (dir, rel) => { try { return JSON.parse(readFileSync(join(dir, rel), 'utf8')) } catch (e) { return null } }
const writeJson = (dir, rel, v) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), JSON.stringify(v, null, 2) + '\n') }
export const readSync = dir => readJson(dir, SYNC) || { tables: {} }
export const fileOf = id => `${DIR}/${id}.json`
export const readTable = (dir, id) => { const t = readJson(dir, fileOf(id)); return t && Array.isArray(t.columns) && Array.isArray(t.rows) ? t : null }
export function listTables(dir) {
  const sync = readSync(dir)
  const ids = new Set(Object.keys(sync.tables))
  if (existsSync(join(dir, DIR))) for (const f of readdirSync(join(dir, DIR))) if (f.endsWith('.json')) ids.add(f.slice(0, -5))
  return [...ids].sort().map(id => ({ id, table: readTable(dir, id), link: (sync.tables[id] || {}).sheet || null }))
}

// Writes tables (a step's result) with their hand edits kept, plus the Playtesting table when it's missing.
export function writeTables(dir, tables) {
  const sync = readSync(dir)
  const report = []
  const list = (Array.isArray(tables) ? tables : []).map(normalise).filter(Boolean)
  if (!list.some(t => tableId(t.name) === 'playtesting') && !readTable(dir, 'playtesting')) list.push(PLAYTESTING)
  for (const next of list) {
    const id = tableId(next.name)
    const entry = sync.tables[id] || {}
    const m = merge(readTable(dir, id), entry.last || null, next)
    writeJson(dir, fileOf(id), m.table)
    sync.tables[id] = { ...entry, name: next.name, file: fileOf(id), last: next }
    report.push(`${next.name}: ${m.table.rows.length} rows${m.kept ? `, your ${m.kept} edited cells kept` : ''}`)
  }
  writeJson(dir, SYNC, sync)
  return report
}

// GDD chapter 9's text: a summary and link to the tables (the chapter table's own words).
export function summary(dir) {
  const lines = listTables(dir).filter(t => t.table).map(({ id, table }) =>
    `- **${table.name}** (${fileOf(id)}): ${id === 'playtesting' ? `${table.rows.length} test games so far` : `${table.rows.length} rows · ${table.columns.join(' · ')}`}${table.link ? ' · linked to a Google Sheet' : ''}`)
  return lines.length ? [`The content tables, in ${DIR}/ (the files the game reads; the Content tab on the project page):`, ...lines].join('\n') : null
}

export function stepWrite(dir, stepId, level = 'loose', now = new Date()) {
  let state
  try { state = JSON.parse(G.readFileIn(dir, '.bmuz/state.json') || 'null') } catch (e) { state = null }
  if (!state) return { ok: false, say: '✘ no .bmuz/state.json: this runs inside a BMUZ stage' }
  const result = (state.resultsBy && state.resultsBy[stepId]) || {}
  const report = writeTables(dir, result.tables)
  const by = { step: stepId, stage: G.STAGE_NAMES[state.pipeline] || state.pipeline, day: now.toISOString().slice(0, 10) }
  const s = summary(dir)
  const g = G.applyResult(G.readFileIn(dir, G.GDD) || G.newGdd(), { chapters: s ? { 9: s } : {} }, level, by)
  writeFileSync(join(dir, G.GDD), g.text)
  G.writePage(dir, now)
  return { ok: true, say: `✔ ${DIR}/: ${report.join(' · ')} · GDD chapter 9 · page` }
}

// ---- The Google Sheet mirror (task 3) ----
export const sheetIdOf = s => { const t = clean(s); const m = t.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/); return m ? m[1] : /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null }
const quoteTab = tab => `'${String(tab).replace(/'/g, "''")}'`
const colName = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }

// gws, as Ideate's reading runs it (tests stand in a fake with BMUZ_GWS + BMUZ_TEST=1). One account at a time.
export function sheetsRunner(cmd = gwsCommand(), accounts = gwsAccounts()) {
  const run = (account, args) => {
    const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], { encoding: 'utf8', env: { ...process.env, ...account.env }, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
    if (r.error) return { ok: false, why: String(r.error.message || r.error) }
    const out = String(r.stdout || '')
    let json = null
    try { json = JSON.parse(out.slice(out.indexOf('{'))) } catch (e) { json = null }
    if (r.status === 0 && json && !json.error) return { ok: true, json }
    return { ok: false, why: clean(`${(json && json.error && (json.error.message || json.error)) || ''} ${String(r.stderr || '').replace(/Using keyring backend: \w+/g, '')}`).slice(0, 200) || `gws exited ${r.status}` }
  }
  const pick = name => accounts.find(a => a.name === name) || null
  return {
    // The tab's values (the first account that can read it, unless one is named): rows of cells, formulas too.
    read(sheetId, tab, accountName = null) {
      let last = null
      for (const a of accountName ? [pick(accountName)].filter(Boolean) : accounts) {
        const params = { spreadsheetId: sheetId, ranges: [quoteTab(tab)], valueRenderOption: 'UNFORMATTED_VALUE' }
        const v = run(a, ['sheets', 'spreadsheets', 'values', 'batchGet', '--params', JSON.stringify(params)])
        if (!v.ok) { last = v; continue }
        const f = run(a, ['sheets', 'spreadsheets', 'values', 'batchGet', '--params', JSON.stringify({ ...params, valueRenderOption: 'FORMULA' })])
        if (!f.ok) { last = f; continue }
        const vals = ((v.json.valueRanges || [])[0] || {}).values || []
        const forms = ((f.json.valueRanges || [])[0] || {}).values || []
        return { ok: true, account: a.name, values: vals, formulas: forms }
      }
      return { ok: false, why: last ? last.why : 'no account to try' }
    },
    write(sheetId, accountName, data) {
      const a = pick(accountName) || accounts[0]
      return run(a, ['sheets', 'spreadsheets', 'values', 'batchUpdate', '--params', JSON.stringify({ spreadsheetId: sheetId }), '--json', JSON.stringify({ valueInputOption: 'RAW', data })])
    },
  }
}

// The Sheet's rows read as the table: the header row names the columns; only the table's own columns are taken (a
// notes column or one it doesn't know is left alone). Refused when the key column (the first) isn't there.
export function fromSheet(table, values) {
  const head = (values[0] || []).map(clean)
  const idx = table.columns.map(c => head.findIndex(h => h.toLowerCase() === c.toLowerCase()))
  if (idx[0] < 0) return { ok: false, why: `the Sheet's first row has no "${table.columns[0]}" column (it has: ${head.join(', ') || 'nothing'})` }
  const missing = table.columns.filter((c, i) => idx[i] < 0)
  const rows = values.slice(1).map(r => Object.fromEntries(table.columns.map((c, i) => [c, idx[i] < 0 ? '' : cell(r[idx[i]])]))).filter(r => clean(r[table.columns[0]]) !== '')
  return { ok: true, table: { name: table.name, columns: table.columns, rows }, idx, missing }
}
const jsonPrint = table => fp({ columns: table.columns, rows: table.rows })
// What the link remembers of a sync: both sides' fingerprints and rows (the rows tell each side's changes later).
const synced = (json, sheet) => ({ json: jsonPrint(json), sheet: fp(sheet.rows), jsonRows: json.rows, sheetRows: sheet.rows })

// A plain diff between two versions of a table: "+ Rose", "- Tulip", "Sunflower · Cost: 1 → 2".
export function diff(a, b) {
  const out = []
  const by = t => new Map(t.rows.map(r => [keyOf(t, r), r]))
  const A = by(a)
  const B = by(b)
  for (const [k, r] of B) if (!A.has(k)) out.push(`+ ${r[b.columns[0]]}`)
  for (const [k, r] of A) if (!B.has(k)) out.push(`- ${r[a.columns[0]]}`)
  for (const [k, r] of B) {
    const was = A.get(k)
    if (!was) continue
    for (const c of b.columns) if (!same(was[c] ?? '', r[c] ?? '')) out.push(`${r[b.columns[0]]} · ${c}: ${was[c] ?? ''} → ${r[c] ?? ''}`)
  }
  return out
}

export function link(dir, id, sheet, tab, sheets = sheetsRunner()) {
  const table = readTable(dir, id)
  if (!table) return { ok: false, say: `✘ there is no table "${id}" (the tables: ${listTables(dir).map(t => t.id).join(', ') || 'none yet'})` }
  const sheetId = sheetIdOf(sheet)
  if (!sheetId) return { ok: false, say: `✘ "${sheet}" isn't a Google Sheet link or id` }
  const name = clean(tab) || table.name
  const r = sheets.read(sheetId, name)
  if (!r.ok) return { ok: false, say: `✘ couldn't read the tab "${name}" of that Sheet: ${r.why}` }
  const s = fromSheet(table, r.values)
  if (!s.ok) return { ok: false, say: `✘ ${s.why}` }
  const sync = readSync(dir)
  sync.tables[id] = { ...(sync.tables[id] || { name: table.name, file: fileOf(id) }), sheet: { id: sheetId, tab: name, account: r.account, ...synced(table, s.table) } }
  writeJson(dir, SYNC, sync)
  const d = diff(table, s.table)
  return { ok: true, say: `✔ ${table.name} linked to the Sheet's "${name}" tab (${r.account}).${d.length ? ` They differ in ${d.length} places; pull or push to make them match.` : ' They match.'}`, diff: d }
}

// Which side changed since the last sync: { json, sheet } (true = changed), with the Sheet's values.
function sides(dir, id, sheets) {
  const table = readTable(dir, id)
  const entry = readSync(dir).tables[id]
  if (!table) return { ok: false, say: `✘ there is no table "${id}"` }
  if (!entry || !entry.sheet) return { ok: false, say: `✘ ${table.name} isn't linked to a Google Sheet (link it first: node tables.mjs link ${id} <sheet link>)` }
  const r = sheets.read(entry.sheet.id, entry.sheet.tab, entry.sheet.account)
  if (!r.ok) return { ok: false, say: `✘ couldn't read the Sheet: ${r.why}` }
  const s = fromSheet(table, r.values)
  if (!s.ok) return { ok: false, say: `✘ ${s.why}` }
  return { ok: true, table, entry, read: r, sheet: s, json: jsonPrint(table) !== entry.sheet.json, sheetChanged: fp(s.table.rows) !== entry.sheet.sheet }
}

// (each side's changes are told against that side as it was at the last sync)
const both = (x, from) => {
  const was = rows => ({ columns: x.table.columns, rows: Array.isArray(rows) ? rows : [] })
  return `✘ both changed since the last sync, so nothing was ${from}. Your JSON: ${diff(was(x.entry.sheet.jsonRows), x.table).join('; ') || 'changed'}. The Sheet: ${diff(was(x.entry.sheet.sheetRows), x.sheet.table).join('; ') || 'changed'}. Say which side wins (pull --sheet, or push --json).`
}

export function pull(dir, id, { force = false, sheets = sheetsRunner(), commit = true } = {}) {
  const x = sides(dir, id, sheets)
  if (!x.ok) return x
  if (!x.sheetChanged) return { ok: true, say: `✔ ${x.table.name}: the Sheet hasn't changed since the last sync; nothing to pull` }
  if (x.json && !force) return { ok: false, say: both(x, 'pulled') }
  // Only the columns the Sheet has are taken; a column it lacks keeps the JSON's value (F227 review: it was blanked).
  const { idx, missing } = x.sheet
  const jsonBy = new Map(x.table.rows.map(r => [keyOf(x.table, r), r]))
  const rows = x.sheet.table.rows.map(r => {
    const mine = jsonBy.get(keyOf(x.table, r)) || {}
    return Object.fromEntries(x.table.columns.map((c, i) => [c, idx[i] < 0 ? (c in mine ? mine[c] : '') : r[c]]))
  })
  const pulled = { name: x.table.name, columns: x.table.columns, rows }
  const d = diff(x.table, pulled)
  writeJson(dir, fileOf(id), pulled)
  const sync = readSync(dir)
  sync.tables[id].sheet = { ...x.entry.sheet, ...synced(pulled, x.sheet.table) }
  writeJson(dir, SYNC, sync)
  let committed = ''
  if (commit && d.length) {
    const msg = `content: ${x.table.name} pulled from the Google Sheet "${x.entry.sheet.tab}" (${d.length} changes)\n\n${d.join('\n')}`
    const add = spawnSync('git', ['add', '--', fileOf(id), SYNC], { cwd: dir, encoding: 'utf8' })
    const c = add.status === 0 ? spawnSync('git', ['commit', '-q', '-m', msg, '--', fileOf(id), SYNC], { cwd: dir, encoding: 'utf8' }) : add
    committed = c.status === 0 ? ' · committed' : ' · not committed (not a git repository?)'
  }
  const lacks = missing.length ? ` · the Sheet has no ${missing.map(c => `"${c}"`).join(', ')} column${missing.length > 1 ? 's' : ''}, so ${missing.length > 1 ? 'those were' : 'that was'} kept from the JSON` : ''
  return { ok: true, say: `✔ ${x.table.name} pulled from the Sheet: ${d.length ? d.join('; ') : 'no changes in the table\'s columns'}${lacks}${committed}`, diff: d }
}

export function push(dir, id, { force = false, sheets = sheetsRunner() } = {}) {
  const x = sides(dir, id, sheets)
  if (!x.ok) return x
  if (!x.json) return { ok: true, say: `✔ ${x.table.name}: the JSON hasn't changed since the last sync; nothing to push` }
  if (x.sheetChanged && !force) return { ok: false, say: both(x, 'pushed') }
  const { idx } = x.sheet
  const values = x.read.values
  const formulas = x.read.formulas
  const keyCol = idx[0]
  const rowOf = new Map(values.slice(1).map((r, i) => [clean(r[keyCol]).toLowerCase(), i + 1]))
  const data = []
  const formulaKept = []
  let next = values.length
  for (const row of x.table.rows) {
    const k = keyOf(x.table, row)
    let at = rowOf.get(k)
    if (at === undefined) { at = next++; rowOf.set(k, at) }
    x.table.columns.forEach((c, i) => {
      if (idx[i] < 0) return // a column the Sheet doesn't have: left alone
      const f = (formulas[at] || [])[idx[i]]
      if (typeof f === 'string' && f.startsWith('=')) { if (!same(cell((values[at] || [])[idx[i]]), row[c])) formulaKept.push(`${row[x.table.columns[0]]} · ${c}`); return } // a formula cell: never written
      const now = (values[at] || [])[idx[i]]
      if (same(cell(now), row[c]) && at < values.length) return
      data.push({ range: `${quoteTab(x.entry.sheet.tab)}!${colName(idx[i])}${at + 1}`, values: [[row[c]]] })
    })
  }
  if (data.length) {
    const w = sheets.write(x.entry.sheet.id, x.entry.sheet.account, data)
    if (!w.ok) return { ok: false, say: `✘ couldn't write the Sheet: ${w.why}` }
  }
  // The Sheet's side is recorded as the Sheet now holds it (kept formula cells, rows only it has), read back; recorded
  // from the JSON, status said "the Sheet changed" right after a push and the next push was refused (F227 review).
  const back = sheets.read(x.entry.sheet.id, x.entry.sheet.tab, x.entry.sheet.account)
  const backT = back.ok ? fromSheet(x.table, back.values) : null
  const sync = readSync(dir)
  sync.tables[id].sheet = { ...x.entry.sheet, ...synced(x.table, backT && backT.ok ? backT.table : x.table) }
  writeJson(dir, SYNC, sync)
  return { ok: true, say: `✔ ${x.table.name} pushed to the Sheet: ${data.length} cells written (values only; formulas and other columns left alone)${formulaKept.length ? `. Not written, the Sheet works these out with a formula: ${formulaKept.join(', ')} (pull to take the Sheet's values)` : ''}${backT && backT.ok ? '' : '. (The Sheet couldn\'t be read back, so status may say it changed)'}`, cells: data, formulaKept }
}

export function status(dir, sheets = sheetsRunner()) {
  return listTables(dir).map(({ id, table, link: l }) => {
    if (!table) return `${id}: the file is missing`
    if (!l) return `${table.name}: ${table.rows.length} rows (JSON only)`
    const x = sides(dir, id, sheets)
    if (!x.ok) return `${table.name}: ${x.say.replace(/^✘ /, '')}`
    return `${table.name}: linked to "${l.tab}" · ${x.json && x.sheetChanged ? 'both changed since the last sync: pick a side' : x.json ? 'the JSON changed: push' : x.sheetChanged ? 'the Sheet changed: pull' : 'in sync'}`
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [cmd, a, b, c] = process.argv.slice(2)
  const dir = process.cwd()
  const flags = process.argv.slice(2)
  let r
  try {
    if (cmd === 'step') r = stepWrite(dir, a, [b, c].filter(Boolean).join(' ') || 'loose')
    else if (cmd === 'list') r = { ok: true, say: listTables(dir).map(t => `${t.id}: ${t.table ? `${t.table.rows.length} rows` : 'missing'}${t.link ? ' · linked' : ''}`).join('\n') || 'no tables yet' }
    else if (cmd === 'status') r = { ok: true, say: status(dir).join('\n') || 'no tables yet' }
    else if (cmd === 'link') r = link(dir, a, b, c)
    else if (cmd === 'pull') r = pull(dir, a, { force: flags.includes('--sheet') })
    else if (cmd === 'push') r = push(dir, a, { force: flags.includes('--json') })
    else r = { ok: false, say: '✘ use: node tables.mjs step <step-id> [level] | list | status | link <table> <sheet> [tab] | pull <table> [--sheet] | push <table> [--json]' }
  } catch (err) {
    r = { ok: false, say: `✘ ${String(err && err.message ? err.message : err).slice(0, 300)}` }
  }
  console.log(r.say)
  process.exit(r.ok ? 0 : 1)
}
