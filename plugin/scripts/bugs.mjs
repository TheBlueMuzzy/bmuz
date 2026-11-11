// The bug list (F215 task 2): .planning/BUGS.md in BMUZ's format (~/.claude/config/bmuz/PROJECT-FILES.md, "BUGS.md"):
//
//   # <Name> — Bugs
//   Open: 5 (P0 0 · P1 1 · P2 3 · P3 1)
//   ## Open
//   ### B014 · P1 · open · found 2026-11-11 in Design · The Rulebook
//   <title, steps, expected, actual, how often: BMUZ's text between its marks>
//   ## Fixed (newest first)
//   ### B009 · P2 · fixed 2026-11-11 · fixed in a1b2c3d · Guarded by: tests/score.test.mjs
//
// Hand edits are kept. Each entry is its "### B…" header line, then BMUZ's text between fingerprinted marks
// (marks.mjs), then anything the creative wrote below it. The header is read back every time, so a level or status
// changed there by hand counts; BMUZ only rewrites it in the same shape. Text the creative changed inside the marks
// moves out of them and is kept for good. An entry moving from Open to Fixed takes everything under its header along.
// Statuses: open → fixing → fixed → verified, and watching · can't reproduce · won't fix. "Guarded by:" is refused
// unless that file exists in the project.
//
//   node bugs.mjs add '<report json>'   log a bug: prints {"ok":true,"id":"B004","bug":"B004 · … · P2 — …"}
//   node bugs.mjs next [B004]           the bug a fix run would take (that one, or the first open P0 → P1 → P2 → P3)
//   node bugs.mjs status B004 <status> [guarded-by-file]
//   node bugs.mjs list                  the open bugs, counted
//   (run in the project folder)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as M from './marks.mjs'

export const BUGS = '.planning/BUGS.md'
export const ARCHIVE = '.planning/archive/bugs.md'
export const LEVELS = ['P0', 'P1', 'P2', 'P3']
// What each level means (the /bug skill's P-levels; P2's words are the approved script's own, "Any time").
export const LEVEL_WORDS = { P0: 'blocks play', P1: "a feature doesn't work", P2: 'annoying, not blocking', P3: 'cosmetic' }
export const STATUSES = ['open', 'fixing', 'fixed', 'verified', 'watching', "can't reproduce", "won't fix"]
// Statuses that sit under "## Fixed" (the rest are open business and are counted on the Open line).
const CLOSED = ['fixed', 'verified', "won't fix"]
const OPEN_HEAD = '## Open'
const FIXED_HEAD = '## Fixed (newest first)'

const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const HEADER_RE = /^### (B\d{3,}) · (P[0-3]) · (open|fixing|fixed|verified|watching|can't reproduce|won't fix)\b(.*)$/

export function newBugs(name = '') {
  return [`# ${clean(name) || 'Your game'} — Bugs`, 'Open: 0 (P0 0 · P1 0 · P2 0 · P3 0)', '', OPEN_HEAD, '', FIXED_HEAD, ''].join('\n')
}

// The header line's parts: { id, level, status, date, fields: [other " · " parts, in order] }.
export function parseHeader(line) {
  const m = String(line).match(HEADER_RE)
  if (!m) return null
  const rest = m[4].split(' · ').map(s => s.trim()).filter(Boolean)
  // ("fixed 2026-11-11" / "verified 2026-11-12": the date belongs to the status)
  let date = null
  if (rest.length && /^\d{4}-\d{2}-\d{2}$/.test(rest[0])) date = rest.shift()
  return { id: m[1], level: m[2], status: m[3], date, fields: rest }
}

export function headerLine(h) {
  return [`### ${h.id}`, h.level, h.date ? `${h.status} ${h.date}` : h.status, ...h.fields].join(' · ')
}

// Every entry: { id, header, start, end } (start = its header line, end = the line before the next header or section).
export function readEntries(text) {
  const lines = nl(text).split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const h = parseHeader(lines[i])
    if (!h) continue
    let end = i + 1
    while (end < lines.length && !/^#{2,3} /.test(lines[end])) end++
    out.push({ ...h, start: i, end: end - 1 })
  }
  return out
}

export function counts(text) {
  const open = readEntries(text).filter(e => !CLOSED.includes(e.status))
  const by = Object.fromEntries(LEVELS.map(l => [l, open.filter(e => e.level === l).length]))
  return { open: open.length, by }
}
export const openLine = text => {
  const c = counts(text)
  return `Open: ${c.open} (${LEVELS.map(l => `${l} ${c.by[l]}`).join(' · ')})`
}

// The doc with its "Open:" line counted again and both sections there (a hand-made file may lack them).
function tidy(text) {
  const lines = nl(text).split('\n')
  if (!lines.some(l => l.trim() === OPEN_HEAD)) {
    const at = lines.findIndex(l => /^## /.test(l))
    lines.splice(at < 0 ? lines.length : at, 0, OPEN_HEAD, '')
  }
  if (!lines.some(l => l.trim() === FIXED_HEAD || /^## Fixed\b/.test(l.trim()))) lines.push('', FIXED_HEAD, '')
  const doc = lines.join('\n')
  const line = openLine(doc)
  const out = doc.split('\n')
  const at = out.findIndex(l => /^Open: \d+/.test(l))
  if (at >= 0) out[at] = line
  else out.splice(out.findIndex(l => /^# /.test(l)) + 1, 0, line)
  const t = out.join('\n').replace(/\n{3,}/g, '\n\n')
  return t.endsWith('\n') ? t : t + '\n'
}

// The next free number, counting the archive too (an archived B012 is never handed out again).
export function nextId(text, archive = '') {
  const n = [...`${nl(text)}\n${nl(archive)}`.matchAll(/^### B(\d{3,})\b/gm)].map(m => Number(m[1]))
  return `B${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`
}

// A report's text, as BMUZ writes it between its marks.
export function reportBody(r) {
  const out = [clean(r.title)]
  const steps = Array.isArray(r.steps) ? r.steps.map(clean).filter(Boolean).map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`).join(' ') : clean(r.steps)
  const parts = [steps && `Steps: ${steps}`, clean(r.expected) && `Expected: ${clean(r.expected)}`, clean(r.actual) && `Actual: ${clean(r.actual)}`, clean(r.often) && `How often: ${clean(r.often)}`].filter(Boolean)
  if (parts.length) out.push(parts.join(' · '))
  if (clean(r.evidence)) out.push(`Evidence: ${clean(r.evidence)}`)
  return out.join('\n')
}

// What's wrong with a report (null = fine).
export function reportProblem(r) {
  if (!r || typeof r !== 'object') return 'the report must be an object: {"title": "...", "level": "P2", "steps": [...], "expected": "...", "actual": "..."}'
  if (!clean(r.title)) return 'the report needs a "title": the bug in a few words, like "Score cut off on phone"'
  if (clean(r.title).length > 90) return 'the "title" is too long: a few words (90 characters at most); the detail goes in steps / expected / actual'
  if (!LEVELS.includes(r.level)) return `"level" must be one of ${LEVELS.join(', ')} (P0 ${LEVEL_WORDS.P0} · P1 ${LEVEL_WORDS.P1} · P2 ${LEVEL_WORDS.P2} · P3 ${LEVEL_WORDS.P3})`
  return null
}

// Logs a bug at the end of the Open section. by = { day, where, version }. Returns { text, id, header }.
export function addBug(text, r, by = {}, archive = '') {
  const why = reportProblem(r)
  if (why) throw new Error(why)
  let doc = tidy(nl(text).trim() ? text : newBugs(by.name))
  const id = nextId(doc, archive)
  const fields = [`found ${by.day || ''}${clean(by.where) ? ` in ${clean(by.where)}` : ''}`.trim()]
  if (clean(by.version)) fields.push(clean(by.version))
  if (clean(r.device)) fields.push(clean(r.device))
  const head = headerLine({ id, level: r.level, status: 'open', date: null, fields })
  const lines = doc.split('\n')
  const open = lines.findIndex(l => l.trim() === OPEN_HEAD)
  let at = open + 1
  while (at < lines.length && !/^## /.test(lines[at])) at++
  while (at > open + 1 && lines[at - 1].trim() === '') at--
  lines.splice(at, 0, ...(at > open + 1 ? [''] : []), head, ...M.block(`bug:${id.toLowerCase()}`, reportBody(r)).split('\n'))
  doc = tidy(lines.join('\n'))
  return { text: doc, id, header: head }
}

// One entry's text under its header (marks taken out), for a title or the page.
export function entryText(text, id) {
  const e = readEntries(text).find(x => x.id === id)
  if (!e) return null
  return M.unmarked(nl(text).split('\n').slice(e.start + 1, e.end + 1).join('\n')).trim()
}
export const titleOf = (text, id) => (entryText(text, id) || '').split('\n').find(l => l.trim() && !/^BMUZ, /.test(l)) || ''

// "B004 · Score cut off on phone · P2 — annoying, not blocking": a bug as the script's lines name it.
export function bugWords(text, id) {
  const e = readEntries(text).find(x => x.id === id)
  if (!e) return id
  return `${id} · ${clean(titleOf(text, id))} · ${e.level} — ${LEVEL_WORDS[e.level]}`
}

// Sets a bug's status. Moving to fixed / verified / won't fix takes the whole entry to the top of Fixed; back to an open
// status takes it to the end of Open. extra = { day, guardedBy, commit, dir }: "Guarded by:" must name a project file.
export function setStatus(text, id, status, extra = {}) {
  if (!STATUSES.includes(status)) throw new Error(`"${status}" isn't a status (${STATUSES.join(', ')})`)
  const doc = tidy(text)
  const e = readEntries(doc).find(x => x.id === id)
  if (!e) throw new Error(`there is no ${id} in ${BUGS}`)
  const h = { id: e.id, level: e.level, status, date: e.date, fields: [...e.fields] }
  const setField = (re, value) => {
    const i = h.fields.findIndex(f => re.test(f))
    if (value === null) { if (i >= 0) h.fields.splice(i, 1); return }
    if (i >= 0) h.fields[i] = value
    else h.fields.push(value)
  }
  if (status === 'fixed' || status === 'verified') h.date = extra.day || h.date
  else if (!CLOSED.includes(status)) h.date = null
  if (extra.commit) setField(/^fixed in /, `fixed in ${clean(extra.commit)}`)
  if (extra.guardedBy !== undefined) {
    const g = clean(extra.guardedBy)
    if (!E.isSafePath(g)) throw new Error(`"Guarded by:" must be a file inside the project, like tests/score.test.mjs (not ${JSON.stringify(g)})`)
    if (!existsSync(join(extra.dir || process.cwd(), g))) throw new Error(`"Guarded by: ${g}" is refused: there is no such file in the project`)
    setField(/^Guarded by: /, `Guarded by: ${g}`)
  }
  // (a P0 / P1 can't be closed as fixed without the test that guards it: PROJECT-FILES' rule)
  if ((status === 'fixed' || status === 'verified') && ['P0', 'P1'].includes(h.level) && !h.fields.some(f => /^Guarded by: /.test(f))) throw new Error(`${id} is a ${h.level}: it needs "Guarded by: <test file>" to be ${status}`)
  const lines = doc.split('\n')
  const chunk = lines.slice(e.start, e.end + 1)
  chunk[0] = headerLine(h)
  while (chunk.length > 1 && chunk[chunk.length - 1].trim() === '') chunk.pop()
  lines.splice(e.start, e.end - e.start + 1)
  const wasClosed = CLOSED.includes(e.status)
  const nowClosed = CLOSED.includes(status)
  if (wasClosed === nowClosed) {
    lines.splice(e.start, 0, ...chunk, '')
    return tidy(lines.join('\n'))
  }
  if (nowClosed) {
    const at = lines.findIndex(l => l.trim() === FIXED_HEAD || /^## Fixed\b/.test(l.trim()))
    lines.splice(at + 1, 0, ...chunk, '')
  } else {
    const open = lines.findIndex(l => l.trim() === OPEN_HEAD)
    let at = open + 1
    while (at < lines.length && !/^## /.test(lines[at])) at++
    lines.splice(at, 0, ...chunk, '')
  }
  return tidy(lines.join('\n'))
}

// Adds lines to a bug's BMUZ text ("Cause: …", "Don't re-break: …"); a line with the same label is replaced.
// A hand edit inside the marks is kept (writeBlock moves it out and dates BMUZ's text below it).
export function noteBug(text, id, notes, by = {}) {
  const doc = tidy(text)
  const key = `bug:${id.toLowerCase()}`
  const have = M.readBlocks(doc)[key]
  const e = readEntries(doc).find(x => x.id === id)
  if (!e) throw new Error(`there is no ${id} in ${BUGS}`)
  if (!have) {
    // (an entry written by hand has no marks: BMUZ's notes go in a block of their own at the end of the entry)
    const lines = doc.split('\n')
    const body = Object.entries(notes).filter(([, v]) => clean(v)).map(([k, v]) => `${k}: ${clean(v)}`).join('\n')
    if (!body) return doc
    let at = e.end
    while (at > e.start && lines[at].trim() === '') at--
    lines.splice(at + 1, 0, ...M.block(key, body).split('\n'))
    return tidy(lines.join('\n'))
  }
  let body = have.edited ? have.text.split('\n').filter(l => !/^BMUZ, /.test(l)) : have.text.split('\n')
  for (const [k, v] of Object.entries(notes)) {
    if (!clean(v)) continue
    const line = `${k}: ${clean(v)}`
    const i = body.findIndex(l => l.startsWith(`${k}: `))
    if (i >= 0) body[i] = line
    else body.push(line)
  }
  return tidy(M.writeBlock(doc, key, body.join('\n'), { by }).text)
}

// The bug a fix run takes: the one named (if it is still open), else the first open by level P0 → P3, then number.
export function pickBug(text, id = null) {
  const open = readEntries(text).filter(e => !CLOSED.includes(e.status) && e.status !== "can't reproduce")
  if (id) {
    const e = readEntries(text).find(x => x.id === id)
    if (!e) return { error: `there is no ${id} in ${BUGS}` }
    if (CLOSED.includes(e.status)) return { error: `${id} is already ${e.status}` }
    return { bug: e }
  }
  const sorted = open.slice().sort((a, b) => a.level.localeCompare(b.level) || Number(a.id.slice(1)) - Number(b.id.slice(1)))
  return sorted.length ? { bug: sorted[0] } : { none: true }
}

// The list, as the /bug skill shows it.
export function listText(text) {
  const c = counts(text)
  const open = readEntries(text).filter(e => !CLOSED.includes(e.status)).sort((a, b) => a.level.localeCompare(b.level))
  const waiting = readEntries(text).filter(e => e.status === 'fixed')
  const out = [`Open bugs: ${c.open} — ${LEVELS.map(l => `${l} ${c.by[l]}`).join(' · ')}`]
  for (const e of open) out.push(`  ${e.id} ${e.level} ${clean(titleOf(text, e.id))}${e.status !== 'open' ? ` (${e.status})` : ''}`)
  if (waiting.length) out.push(`Fixed, waiting for your check: ${waiting.map(e => e.id).join(', ')}`)
  return out.join('\n')
}

// ---- Files ----
export const readIn = (dir, rel) => G.readFileIn(dir, rel)
export function writeIn(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
// The project page gets its Bugs tab again, when there is a page (a project without one isn't given one here).
export function refreshPage(dir) {
  if (existsSync(join(dir, G.PAGE)) || existsSync(join(dir, G.GDD))) G.writePage(dir)
}
const gameName = dir => G.gameName(readIn(dir, G.GDD) || '') || ''
const today = () => new Date().toISOString().slice(0, 10)

export function addIn(dir, r, by = {}) {
  const out = addBug(readIn(dir, BUGS) || newBugs(gameName(dir)), r, { day: today(), name: gameName(dir), ...by }, readIn(dir, ARCHIVE) || '')
  writeIn(dir, BUGS, out.text)
  refreshPage(dir)
  // (the /bug skill commits a report on its own: "Bug B014: <title>", only BUGS.md, whatever else is staged)
  const c = commitFiles(dir, [BUGS], `Bug ${out.id}: ${clean(r.title)}`)
  return { ok: true, id: out.id, header: out.header, bug: bugWords(out.text, out.id), commit: c.hash || null, nogit: c.nogit || null }
}

// ---- git ----
const git = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 60000 })
export const isGitRepo = dir => git(dir, ['rev-parse', '--is-inside-work-tree']).stdout?.trim() === 'true'
// Commits exactly these project files (nothing else that happens to be staged). Returns { hash } or { nogit } or
// { nothing: true } when they didn't change. Every path is checked to stay inside the project.
export function commitFiles(dir, files, message) {
  if (!isGitRepo(dir)) return { nogit: "this folder isn't a git repository" }
  const safe = [...new Set(files.filter(f => E.isSafePath(f) && existsSync(join(dir, f))))]
  if (!safe.length) return { nothing: true }
  const add = git(dir, ['add', '--', ...safe])
  if (add.status !== 0) throw new Error(`git add failed: ${(add.stderr || add.stdout || '').trim().slice(0, 200)}`)
  if (git(dir, ['diff', '--cached', '--quiet', '--', ...safe]).status === 0) return { nothing: true }
  const c = git(dir, ['commit', '-q', '-m', message, '--', ...safe])
  if (c.status !== 0) throw new Error(`git commit failed: ${(c.stderr || c.stdout || '').trim().slice(0, 200)}`)
  return { hash: git(dir, ['rev-parse', '--short', 'HEAD']).stdout.trim() }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [cmd, a, b, c] = process.argv.slice(2)
  const dir = process.cwd()
  const say = (x, ok = true) => { console.log(typeof x === 'string' ? x : JSON.stringify(x)); process.exit(ok ? 0 : 1) }
  try {
    if (cmd === 'add') {
      const r = JSON.parse(a || '{}')
      say(addIn(dir, r.report || r, { where: r.where, version: r.version }))
    } else if (cmd === 'next') {
      const text = readIn(dir, BUGS) || ''
      const p = pickBug(text, a || null)
      if (p.error) say({ ok: false, say: p.error })
      if (p.none) say({ ok: false, none: true })
      say({ ok: true, id: p.bug.id, level: p.bug.level, bug: bugWords(text, p.bug.id) })
    } else if (cmd === 'status') {
      const text = setStatus(readIn(dir, BUGS) || '', a, b, { day: today(), dir, ...(c ? { guardedBy: c } : {}) })
      writeIn(dir, BUGS, text)
      refreshPage(dir)
      say({ ok: true, id: a, status: b, bug: bugWords(text, a) })
    } else if (cmd === 'list') {
      say(listText(readIn(dir, BUGS) || newBugs()))
    } else {
      say('✘ use: node bugs.mjs add <json> | next [B###] | status B### <status> [guarded-by] | list', false)
    }
  } catch (err) {
    say({ ok: false, say: String(err && err.message ? err.message : err).slice(0, 300) }, false)
  }
}
