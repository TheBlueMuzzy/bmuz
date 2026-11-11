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
//   the fix run's steps (plugin/pipelines/bug.json; see "The fix run" below): pick · repro <test> · say-repro · verify ·
//   hits-fail '<hits json>' · hits-pass · record
//   (run in the project folder)
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  // (one blank line before each section heading, never more than one anywhere)
  const t = out.join('\n').replace(/([^\n])\n(## )/g, '$1\n\n$2').replace(/\n{3,}/g, '\n\n')
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
  // (PROJECT-FILES' order: … · fixed in a1b2c3d · Guarded by: tests/…, last)
  const rank = f => (/^fixed in /.test(f) ? 1 : /^Guarded by: /.test(f) ? 2 : 0)
  h.fields = h.fields.map((f, i) => [f, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0])
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

// ---- The fix run (F215 task 4: plugin/pipelines/bug.json) ----
// The same way every time: the bug picked → a test that fails because of it (run here, the failing exit recorded;
// refused if it passes) → the root cause written down → the fix → the same test passing, unchanged, with the suite and
// check:fast green → the same mistake looked for in matching places (each one fixed with its own test, proven failing
// first, or logged as a new bug) → BUGS.md fixed + "Guarded by:", a "Don't re-break" line, committed "Fix B###: …".
// The proof (each test's fingerprint and run results) and the current-bug pointer live in .bmuz/bug/, written only by
// these scripts: Claude's Write / Edit are refused in .bmuz/ (review fix 1: a proof Claude could edit could be faked).
// The lines BMUZ says come from the script, composed here and shown.
export const FIX_RUN = ['pick', 'repro', 'say-repro', 'verify', 'hits-fail', 'hits-pass', 'record']
export const BUG_DIR = '.bmuz/bug'
export const CURRENT = `${BUG_DIR}/current.json`
export const STATE_MD = '.planning/STATE.md'
// (review fix 8: the lines a step shows are written here too, so nothing of the run is left in the project)
export const SAY = { start: `${BUG_DIR}/say-start.md`, repro: `${BUG_DIR}/say-repro.md`, done: `${BUG_DIR}/say-done.md` }
const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
const proofPath = id => `${BUG_DIR}/${id}.json`
const sha = text => createHash('sha1').update(String(text)).digest('hex').slice(0, 12)
const readJsonIn = (dir, rel) => { try { return JSON.parse(readIn(dir, rel) || 'null') } catch (e) { return null } }

function line(id, slots, script = loadScript()) {
  const r = E.renderLine(script, id, slots)
  if (r.error) throw new Error(r.error)
  return r.text
}

// The engine's state (results by step, and what the fix run was given), read like the other scripts read it.
function runState(dir) {
  const st = readJsonIn(dir, '.bmuz/state.json')
  if (!st) throw new Error('no .bmuz/state.json: this runs inside the bug pipeline')
  return st
}
function current(dir) {
  const c = readJsonIn(dir, CURRENT)
  if (!c || !/^B\d{3,}$/.test(String(c.id))) throw new Error(`no bug is being fixed (${CURRENT} is missing): the "pick" step comes first`)
  return c
}

// How one test file runs here: the project's test runner if package.json names one, else node's own.
export function testCommand(dir, file) {
  if (!E.isSafePath(file) || !/^[\w@./-]+$/.test(file)) throw new Error(`"${file}" isn't a test file path inside the project (letters, digits, - _ . / only)`)
  if (!existsSync(join(dir, file))) throw new Error(`there is no test file ${file} in the project`)
  const pkg = readJsonIn(dir, 'package.json') || {}
  const t = String((pkg.scripts && pkg.scripts.test) || '')
  // (--no-install: a runner that isn't there says so at once, never downloads; node's TAP names each test it ran)
  if (/\bvitest\b/.test(t)) return ['npx', '--no-install', 'vitest', 'run', file]
  if (/\bjest\b/.test(t)) return ['npx', '--no-install', 'jest', file]
  return [process.execPath, '--test', '--test-reporter=tap', file]
}

// How long one test file may run (BMUZ_BUG_TEST_MS: the tests' own short limit).
export const testLimitMs = () => Number(process.env.BMUZ_BUG_TEST_MS) > 0 ? Number(process.env.BMUZ_BUG_TEST_MS) : 300000

// The tests the runner itself reported as failing (review fix 4): node's TAP "not ok N - <name>" (a whole file failing to
// load or throwing at the top is reported under the file's own name, which isn't a test), vitest's and jest's summary
// counts ("No test files found" is none). A run that timed out or never started reports none.
export function failedTests(argv, ran) {
  const all = String(ran.all ?? ran.out ?? '')
  if (ran.exitCode === -1 || ran.timedOut) return []
  if (argv[0] === process.execPath || argv.includes('--test')) {
    return [...all.matchAll(/^\s*not ok \d+ - (.+?)\s*(#.*)?$/gm)].map(m => m[1]).filter(n => !/\.(m|c)?[jt]sx?$/.test(n) && !/[\\/]/.test(n))
  }
  if (/No test files found/i.test(all)) return []
  const m = all.match(/Tests:?\s+(\d+) failed/)
  return m ? Array.from({ length: Number(m[1]) }, (_, i) => `test ${i + 1}`) : []
}
// The tests the runner reported as passing (node: "ok N - <name>", the file itself left out; others: their summary).
export function passedTests(argv, ran) {
  const all = String(ran.all ?? ran.out ?? '')
  if (ran.exitCode !== 0) return []
  if (argv[0] === process.execPath || argv.includes('--test')) return [...all.matchAll(/^\s*ok \d+ - (.+?)\s*(#.*)?$/gm)].map(m => m[1]).filter(n => !/\.(m|c)?[jt]sx?$/.test(n) && !/[\\/]/.test(n))
  const m = all.match(/Tests:?\s+(\d+) passed/)
  return m ? Array.from({ length: Number(m[1]) }, (_, i) => `test ${i + 1}`) : []
}
// Why a test run doesn't prove the bug (null = it does: the runner ran a named test and reported it failing).
export function reproProblem(test, argv, ran) {
  if (ran.timedOut) return `${test} didn't finish in ${Math.round(testLimitMs() / 1000)} s, so it proves nothing: a test must end with a failure, not hang`
  if (ran.exitCode === -1) return `${test} couldn't run (${ran.cmd}): ${String(ran.out).slice(-300)}`
  if (ran.exitCode === 0) return null
  if (crashedBeforeTesting(ran.all)) return `${test} crashed before testing anything, which proves nothing: ${String(ran.out).slice(-300)}`
  if (!failedTests(argv, ran).length) return `no test in ${test} ran and failed (${ran.cmd}): the runner ended with an error before or around the tests, which proves nothing. ${String(ran.out).slice(-300)}`
  return null
}

// Runs a command in the project: { exitCode, out } (out = the last 1500 characters, for the proof and the reason).
export function runIn(dir, argv, timeout = 300000) {
  const win = process.platform === 'win32' && argv[0] !== process.execPath
  // (NODE_TEST_CONTEXT out: inherited from a node test run around this one, it makes the project's own node --test
  // report to that run and exit 0 even when its test fails)
  const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(argv[0], argv.slice(1), { cwd: dir, encoding: 'utf8', timeout, shell: win, env })
  const out = `${r.stdout || ''}${r.stderr || ''}${r.error && r.error.code !== 'ETIMEDOUT' ? `\n${r.error.message}` : ''}`.trim()
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT') || (r.status === null && !!r.signal)
  return { exitCode: r.status === null ? -1 : r.status, timedOut, out: out.slice(-1500), all: out, cmd: argv.map(a => (a === process.execPath ? 'node' : a)).join(' ') }
}
// One test file, run with its limit.
const runTest = (dir, test) => {
  const argv = testCommand(dir, test)
  return { argv, ran: runIn(dir, argv, testLimitMs()) }
}

// A test run that failed before testing anything (a typo, a missing file) proves nothing about the bug.
// (a load error names itself; a real failure shows an assertion)
export function crashedBeforeTesting(out) {
  return /SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find module|does not provide an export named/.test(out) && !/AssertionError|ERR_ASSERTION/.test(out)
}

// The suite: npm test and npm run check:fast, the ones package.json has. Returns [{ cmd, exitCode, out }].
export function suite(dir) {
  const pkg = readJsonIn(dir, 'package.json') || {}
  const s = pkg.scripts || {}
  const out = []
  if (s.test) out.push(runIn(dir, ['npm', 'test']))
  if (s['check:fast']) out.push(runIn(dir, ['npm', 'run', 'check:fast'], 900000))
  return out
}

export function pick(dir, now = new Date()) {
  const st = runState(dir)
  const text = readIn(dir, BUGS) || ''
  const p = pickBug(text, (st.given && st.given.bug) || null)
  if (p.error) throw new Error(p.error)
  if (p.none) throw new Error('there are no open bugs to fix')
  const id = p.bug.id
  const t = p.bug.status === 'fixing' ? text : setStatus(text, id, 'fixing', { day: now.toISOString().slice(0, 10), dir })
  writeIn(dir, BUGS, t)
  const words = bugWords(t, id)
  writeIn(dir, CURRENT, JSON.stringify({ id, level: p.bug.level, title: clean(titleOf(t, id)), bug: words }, null, 2) + '\n')
  writeIn(dir, SAY.start, line('bug.fix.start', { bug: words }) + '\n')
  refreshPage(dir)
  return { id, bug: words }
}

// The reproduce step's done-check: the new test must FAIL now, because of the bug. Recorded with the test's fingerprint.
export function repro(dir, test) {
  const c = current(dir)
  const { argv, ran } = runTest(dir, test)
  if (ran.exitCode === 0) throw new Error(`${test} passes, so it doesn't show ${c.id} yet. Change the test so it fails because of the bug (it checks what should happen), then finish again. (${ran.cmd})`)
  const why = reproProblem(test, argv, ran)
  if (why) throw new Error(`${why} Make a test that runs and fails because of ${c.id}, then finish again.`)
  const proof = readJsonIn(dir, proofPath(c.id)) || { id: c.id }
  proof.repro = { test, cmd: ran.cmd, exitCode: ran.exitCode, sha: sha(readIn(dir, test)), at: new Date().toISOString(), out: ran.out.slice(-600) }
  writeIn(dir, proofPath(c.id), JSON.stringify(proof, null, 2) + '\n')
  return proof.repro
}

export function sayRepro(dir) {
  const c = current(dir)
  const proof = readJsonIn(dir, proofPath(c.id))
  if (!proof || !proof.repro) throw new Error(`${c.id} has no failing test on record yet`)
  writeIn(dir, SAY.repro, line('bug.fix.reproduced', { test: proof.repro.test }) + '\n')
}

// One proven test, checked again: its fingerprint worked out from the file on disk now, against the one recorded when it
// was shown failing (in .bmuz/bug/, out of Claude's reach); then passing now.
function passesNow(dir, t) {
  if (!t || !t.sha || sha(readIn(dir, t.test) ?? '') !== t.sha) return `${t && t.test}: the test changed after it was shown failing. Fix the code, not the test: put the test back as it was when it failed`
  const { argv, ran } = runTest(dir, t.test)
  if (ran.timedOut) return `${t.test} didn't finish in ${Math.round(testLimitMs() / 1000)} s`
  if (ran.exitCode !== 0) return `${t.test} still fails (${ran.cmd}): ${ran.out.slice(-400)}`
  return passedTests(argv, ran).length ? null : `${t.test} ran no test at all (${ran.cmd}), so it shows nothing passing`
}
function suiteProblem(dir) {
  for (const s of suite(dir)) if (s.exitCode !== 0) return `"${s.cmd}" fails: ${s.out.slice(-400)}`
  return null
}

// The fix step's done-check: the new test passes (unchanged), and the suite and check:fast are green.
export function verify(dir) {
  const c = current(dir)
  const proof = readJsonIn(dir, proofPath(c.id))
  if (!proof || !proof.repro) throw new Error(`${c.id} has no failing test on record: the reproduce step comes first`)
  const why = passesNow(dir, proof.repro)
  if (why) throw new Error(why)
  const runs = suite(dir)
  const bad = runs.find(s => s.exitCode !== 0)
  if (bad) throw new Error(`"${bad.cmd}" fails: ${bad.out.slice(-400)}`)
  proof.verify = { at: new Date().toISOString(), test: proof.repro.test, suite: runs.map(s => ({ cmd: s.cmd, exitCode: s.exitCode })) }
  writeIn(dir, proofPath(c.id), JSON.stringify(proof, null, 2) + '\n')
  return proof.verify
}

// The matching places, as the step hands them back: [{ where, what, action: "fix" | "log", test, title, level }].
export function hitsProblem(hits) {
  if (!Array.isArray(hits)) return '"hits" must be a list (empty when the same mistake is nowhere else)'
  for (const [i, h] of hits.entries()) {
    const at = `hit ${i + 1}`
    if (!h || typeof h !== 'object' || !clean(h.where)) return `${at} needs "where": the file and line, like src/score.js:12`
    if (!['fix', 'log'].includes(h.action)) return `${at} needs "action": "fix" (fixed now, with its own test) or "log" (logged as a new bug)`
    if (h.action === 'fix' && !clean(h.test)) return `${at} is fixed, so it needs its own "test" file`
    if (h.action === 'log' && !clean(h.title || h.what)) return `${at} is logged, so it needs a "title"`
    if (h.level !== undefined && !LEVELS.includes(h.level)) return `${at}: "level" must be one of ${LEVELS.join(', ')}`
  }
  return null
}

// The matching step's done-check: every hit to fix has its own new test, and it FAILS now (before the fix).
export function hitsFail(dir, hits) {
  const why = hitsProblem(hits)
  if (why) throw new Error(why)
  const c = current(dir)
  const proof = readJsonIn(dir, proofPath(c.id)) || { id: c.id }
  const out = []
  for (const h of hits.filter(x => x.action === 'fix')) {
    if (proof.repro && h.test === proof.repro.test) throw new Error(`${h.where}: give it a test of its own, not ${h.test} (that one guards ${c.id})`)
    const { argv, ran } = runTest(dir, h.test)
    if (ran.exitCode === 0) throw new Error(`${h.test} passes, so it doesn't show the mistake at ${h.where}. Make it fail because of it (fix that place only after), then finish again`)
    const why = reproProblem(h.test, argv, ran)
    if (why) throw new Error(`${why} (the matching place ${h.where})`)
    out.push({ where: clean(h.where), what: clean(h.what), test: h.test, sha: sha(readIn(dir, h.test)), exitCode: ran.exitCode })
  }
  proof.hits = hits.map(h => ({ ...h, ...(out.find(o => o.test === h.test && h.action === 'fix') || {}) }))
  writeIn(dir, proofPath(c.id), JSON.stringify(proof, null, 2) + '\n')
  return proof.hits
}

// The matching fix step's done-check: each hit's test passes now (unchanged), the bug's own test too, the suite green.
export function hitsPass(dir) {
  const c = current(dir)
  const proof = readJsonIn(dir, proofPath(c.id))
  if (!proof || !proof.repro) throw new Error(`${c.id} has no failing test on record`)
  for (const h of (proof.hits || []).filter(x => x.action === 'fix')) {
    const why = passesNow(dir, h)
    if (why) throw new Error(why)
  }
  const why = passesNow(dir, proof.repro) || suiteProblem(dir)
  if (why) throw new Error(why)
}

// Appends a "Don't re-break" line to .planning/STATE.md (its own section, made when missing; their text kept).
export function dontRebreak(text, entry) {
  const head = "## Don't re-break"
  const lines = nl(text).split('\n')
  const e = `- ${clean(entry)}`
  if (lines.some(l => l.trim() === e)) return nl(text)
  let at = lines.findIndex(l => l.trim() === head)
  if (at < 0) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', head)
    at = lines.length - 1
  }
  let end = at + 1
  while (end < lines.length && !/^#{1,2} /.test(lines[end])) end++
  while (end > at + 1 && lines[end - 1].trim() === '') end--
  lines.splice(end, 0, e)
  return lines.join('\n').replace(/^\n+/, '') + (lines[lines.length - 1] === '' ? '' : '\n')
}

// The record step: BUGS.md (cause, the matching places, the new bugs, fixed + Guarded by), the Don't re-break line, the
// commit, and the closing line. Safe to run again after a failed try (nothing is added twice).
export function record(dir, now = new Date()) {
  const day = now.toISOString().slice(0, 10)
  const c = current(dir)
  const st = runState(dir)
  const r = st.resultsBy || {}
  const proof = readJsonIn(dir, proofPath(c.id))
  if (!proof || !proof.repro || !proof.verify) throw new Error(`${c.id} isn't proven fixed yet (no failing test on record, or it never passed)`)
  const cause = clean((r.cause || {}).cause)
  if (!cause) throw new Error(`${c.id} has no root cause written down (the cause step)`)
  const repeat = clean((r.cause || {}).repeat)
  const rule = clean((r.cause || {}).rule)
  // (review fix 2b: nothing after the matching step is trusted. Right before the commit, every proof runs again: the
  // bug's own test, each matching place to fix — the step's own hits, each with a test shown failing first, unchanged —
  // and the suite. Any red refuses the step, and nothing is written or committed.)
  const claimed = r.matching && Array.isArray(r.matching.hits) ? r.matching.hits : (proof.hits || [])
  const hits = claimed.map(h => (h && h.action === 'fix' ? { ...h, ...((proof.hits || []).find(p => p.action === 'fix' && p.test === h.test && p.where === clean(h.where) && p.sha) || {}) } : h))
  for (const h of hits.filter(x => x && x.action === 'fix')) {
    if (!h.sha || !(h.exitCode > 0)) throw new Error(`${clean(h.where)} has no test shown failing first (${h.test}): the matching step's check runs it before the fix`)
    const why = passesNow(dir, h)
    if (why) throw new Error(why)
  }
  const again = passesNow(dir, proof.repro) || suiteProblem(dir)
  if (again) throw new Error(again)
  let text = readIn(dir, BUGS) || ''
  // the matching places to log become bugs of their own (once)
  const logged = []
  for (const h of hits.filter(x => x.action === 'log')) {
    const title = clean(h.title || h.what).slice(0, 90)
    const have = readEntries(text).find(e => clean(titleOf(text, e.id)) === title)
    if (have) { logged.push(`${have.id} · ${title}`); continue }
    const out = addBug(text, { title, level: h.level || c.level, steps: [`See ${clean(h.where)}`], expected: 'as fixed in ' + c.id, actual: clean(h.what) || `the same mistake as ${c.id}` }, { day, where: `${c.id}'s matching places` }, readIn(dir, ARCHIVE) || '')
    text = out.text
    logged.push(`${out.id} · ${title}`)
  }
  const fixedHits = hits.filter(x => x.action === 'fix')
  const also = fixedHits.map(h => `${clean(h.where)} (Guarded by: ${h.test})`)
  text = noteBug(text, c.id, {
    Cause: cause,
    ...(repeat && !/^(none|no)\b/i.test(repeat) ? { 'Came back from': repeat } : {}),
    ...(also.length ? { 'Also fixed': also.join('; ') } : {}),
    ...(logged.length ? { 'Logged from its matching places': logged.join('; ') } : {}),
    ...(rule ? { "Don't re-break": rule } : {}),
  }, { day, step: 'record', stage: 'Bug' })
  text = setStatus(text, c.id, 'fixed', { day, dir, guardedBy: proof.repro.test })
  writeIn(dir, BUGS, text)
  if (rule) writeIn(dir, STATE_MD, dontRebreak(readIn(dir, STATE_MD) || '# State\n', `${c.id}: ${rule}`))
  // the commit: the tests, the fixed files, BUGS.md, STATE.md and the proof, nothing else
  const changed = [...new Set([...(r.fix && Array.isArray(r.fix.files) ? r.fix.files : []), ...(r['matching-fix'] && Array.isArray(r['matching-fix'].alsoFiles) ? r['matching-fix'].alsoFiles : [])].map(f => String(f).replace(/\\/g, '/')))]
  const message = `Fix ${c.id}: ${c.title}`
  const files = [proof.repro.test, ...fixedHits.map(h => h.test), ...changed, BUGS, STATE_MD]
  const done = commitFiles(dir, files, message)
  let commit = null
  if (done.hash) {
    commit = message
    text = setStatus(readIn(dir, BUGS), c.id, 'fixed', { day, dir, commit: done.hash })
    writeIn(dir, BUGS, text)
    commitFiles(dir, [BUGS], `Bug ${c.id}: fixed in ${done.hash}`)
  } else if (done.nothing && isGitRepo(dir)) commit = message
  const side = readJsonIn(dir, '.bmuz/side.json') || {}
  const say = line('bug.fix.done', {
    bug: bugWords(text, c.id), cause, test: proof.repro.test, also: also.join('; '), logged: logged.join('; '),
    commit, nogit: done.nogit || null, check: ['P0', 'P1'].includes(c.level) ? c.id : null,
    back: side.place || 'what we were doing',
  })
  // (a [[ … ]] part left out leaves its empty line behind: the closing line has no blank lines of its own)
  writeIn(dir, SAY.done, say.replace(/\n{2,}/g, '\n') + '\n')
  refreshPage(dir)
  return { commit: done.hash || null, logged, also }
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
    } else if (FIX_RUN.includes(cmd)) {
      // (the fix run's steps: plain words for the engine, which takes a refusal's words as the failed try's reason)
      try {
        if (cmd === 'pick') say(`✔ fixing ${pick(dir).bug}`)
        if (cmd === 'repro') say(`✔ ${repro(dir, a).test} fails, as it should while the bug is there`)
        if (cmd === 'say-repro') { sayRepro(dir); say(`✔ ${SAY.repro}`) }
        if (cmd === 'verify') say(`✔ the test passes now${verify(dir).suite.length ? ', and the suite too' : ''}`)
        if (cmd === 'hits-fail') say(`✔ ${hitsFail(dir, JSON.parse(a || '[]')).filter(h => h.action === 'fix').length} matching place(s) to fix, each test failing first`)
        if (cmd === 'hits-pass') { hitsPass(dir); say('✔ every matching place\'s test passes now, and the suite too') }
        if (cmd === 'record') { const r = record(dir); say(`✔ ${BUGS} updated${r.commit ? `, committed ${r.commit}` : ''}`) }
      } catch (err) {
        say(`✘ ${String(err && err.message ? err.message : err).slice(0, 700)}`, false)
      }
    } else {
      say('✘ use: node bugs.mjs add <json> | next [B###] | status B### <status> [guarded-by] | list | pick | repro <test> | say-repro | verify | hits-fail <json> | hits-pass | record', false)
    }
  } catch (err) {
    say({ ok: false, say: String(err && err.message ? err.message : err).slice(0, 300) }, false)
  }
}
