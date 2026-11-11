// Develop's sprints (F216 task 2; the approved script's Stage 4, framework .planning/research/bmuz-vision/
// bmuz-design-doc.html). The sprint as a record BMUZ keeps (.bmuz/develop/sprint.json, written only by this script) and
// the plan files the creative reads and may edit (~/.claude/config/bmuz/PROJECT-FILES.md's formats):
//   .planning/SPRINT.md    # Sprint 01 — <goal>, then one section per feature: the plan card (You'll see · Done when ·
//                          Not doing yet · Needs from you), its tasks 🤖/🙋, Check:, Checked:, Notes:, and the Retro
//   .planning/ROADMAP.md   each feature's state ⏳ → 🟢 → 🔨 → 🎛️ → ✅, the milestone's musts counted, Ideas
// Hand edits are kept (marks.mjs): each feature's section is BMUZ's between fingerprinted marks; a section the
// creative changed is theirs and is never rewritten (a tick or a state mark is changed in place, nothing else).
//
//   node sprint.mjs propose                the next sprint: the current milestone's ready features (every need ✅),
//                                          at most 3, in roadmap order (.bmuz/develop/propose.json)
//   node sprint.mjs plan-check '<features>' the plan step's cards: proposed features only, every card field, 3–8 tasks
//   node sprint.mjs plan-write             SPRINT.md + the record, a work branch, the 4.3 plan card composed (shown)
//   node sprint.mjs next <auto|live>       the loop: which feature runs next ({"start": …} · {"wait": …} · {"done"})
//   node sprint.mjs feature-start          a feature run starts: 🔨, the builder's brief, the 4.4 progress line (shown)
//   node sprint.mjs prove                  the build's done-check: the builder's tests for each rule run and pass, the
//                                          suite is green, screenshots when there's a UI; fingerprinted under .bmuz/
//   node sprint.mjs ready                  4.5's ready-to-check card (shown), 🎛️, tasks ticked, Checked:, committed
//   node sprint.mjs approval <answer> <auto|live>   the approve step's done-check: an answer needs the creative's own
//   node sprint.mjs tuned <rule> '<rulebook>'   the tune step's done-check: exactly one setting changed (or the rule route)
//   node sprint.mjs feature-end            the run's outcome: ✅ approved · 🎛️ tuning · waiting · rebuild, committed
//   node sprint.mjs idea '<words>'         a new idea under the roadmap's Ideas (and the GDD's Ideas for Later)
//   node sprint.mjs lookback-prep          4.7's numbers: the sprint, the milestone's %, the notes for the draft
//   node sprint.mjs lookback-check <onward> <playtested> '<retro>'   the look-back's done-check
//   node sprint.mjs lookback-write         the Retro, the sprint archived, the GDD / rulebook / TDD updated, committed,
//                                          4.7's second line composed (shown)
//   node sprint.mjs teaching-write         4.8: the tutorial into GDD chapter 14 and a roadmap feature
//   (run in the project folder)
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as M from './marks.mjs'
import * as B from './bugs.mjs'
import * as R from './rulebook.mjs'
import * as D from './design.mjs'

export const SPRINT = '.planning/SPRINT.md'
export const ROADMAP = '.planning/ROADMAP.md'
export const ARCHIVE = '.planning/archive/sprints'
export const DEV = '.bmuz/develop'
export const RECORD = `${DEV}/sprint.json`
export const PROPOSE = `${DEV}/propose.json`
export const BRIEF = `${DEV}/brief.md`
export const TRIES = `${DEV}/tries.md`
export const LOOKBACK = `${DEV}/lookback.json`
// the lines a step shows (composed from the script here, so they are word for word)
export const SAY = { plan: `${DEV}/say-plan.md`, progress: `${DEV}/say-progress.md`, stuck: `${DEV}/say-stuck.md`, ready: `${DEV}/say-ready.md`, lookback: `${DEV}/say-lookback.md` }
export const STATES = ['⏳', '🟢', '🔨', '🎛️', '✅']
// a feature's status in the record, and the roadmap state it shows as
export const STATUS_MARK = { planned: '🟢', building: '🔨', built: '🎛️', tuning: '🎛️', approved: '✅', blocked: '🔨', parked: '🟢' }

const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const sha = text => createHash('sha1').update(String(text)).digest('hex').slice(0, 12)
const day = (now = new Date()) => now.toISOString().slice(0, 10)
const readIn = (dir, rel) => G.readFileIn(dir, rel)
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const readJson = (dir, rel) => { try { return JSON.parse(readIn(dir, rel) || 'null') } catch (e) { return null } }
const readState = dir => readJson(dir, '.bmuz/state.json')
const resultOf = (state, id) => (state && state.resultsBy && state.resultsBy[id]) || {}
const pad = n => String(n).padStart(2, '0')
const named = f => `${f.id} — ${f.name}`

function line(id, slots, script = loadScript()) {
  const r = E.renderLine(script, id, slots)
  if (r.error) throw new Error(r.error)
  return r.text
}

// ---- The roadmap ----
// A feature line: "- 🟢 F01 🎮 Seed cards — plant a seed in a row — must:playable · needs: F02" (PROJECT-FILES).
const FEATURE_RE = /^- (⏳|🟢|🔨|🎛️|🎛|✅) (F\d+) (\S+) (.+)$/u
export function parseFeature(l) {
  const m = String(l).match(FEATURE_RE)
  if (!m) return null
  const parts = m[4].split(' — ')
  const tail = parts.length >= 3 ? parts.pop() : ''
  const name = clean(parts.shift())
  const description = clean(parts.join(' — '))
  const scope = (tail.match(/^(must:\S+|must|should|could)/) || [])[1] || ''
  const needs = ((tail.match(/· needs: ([^·]+)/) || [])[1] || '').split(/[,\s]+/).map(x => x.replace(/^~/, '')).filter(x => /^F\d+$/.test(x))
  return { state: m[1] === '🎛' ? '🎛️' : m[1], id: m[2], type: m[3], name, description, scope, needs }
}

// The roadmap as milestones: [{ name, stage, current, line, features: [...] }], the "Release target" line's index.
export function readRoadmap(text) {
  const lines = nl(text).split('\n')
  const milestones = []
  let target = -1
  for (const [i, l] of lines.entries()) {
    if (/^Release target:/.test(l) && target < 0) target = i
    const h = l.match(/^## (v[\d.]+ — .+?)(\s{2}←\s*current)?\s*(?:\(→ ([^)]+)\))?\s*(✅.*)?$/u)
    if (h) { milestones.push({ name: clean(h[1].replace(/^v[\d.]+ — /, '')), title: clean(h[1]), stage: clean(h[3] || ''), current: !!h[2], done: !!h[4], line: i, features: [] }); continue }
    if (/^## /.test(l)) { milestones.push({ name: null, line: i, features: [] }); continue }
    const f = parseFeature(l)
    if (f && milestones.length) milestones[milestones.length - 1].features.push({ ...f, line: i })
  }
  return { milestones: milestones.filter(m => m.name), target, lines }
}
export const allFeatures = text => readRoadmap(text).milestones.flatMap(m => m.features)
export const currentMilestone = text => {
  const ms = readRoadmap(text).milestones
  return ms.find(m => m.current) || ms.find(m => m.features.some(f => f.state !== '✅')) || ms[0] || null
}
const isMust = f => /^must/.test(f.scope) || !f.scope

// The musts of a milestone, done / all ("60%").
export function milestonePct(m) {
  const musts = m.features.filter(f => f.type !== '❓' && isMust(f))
  const all = musts.length ? musts : m.features
  if (!all.length) return { done: 0, all: 0, pct: '0%' }
  const done = all.filter(f => f.state === '✅').length
  return { done, all: all.length, pct: `${Math.round((done / all.length) * 100)}%` }
}

// Sets features' states in place ({ F01: '🔨' }), the graph's nodes too, and the "Release target" count; BMUZ's blocks
// keep their marks (refreshMarks). Returns the new text.
export function setStates(text, states) {
  const before = nl(text)
  const lines = before.split('\n')
  for (const [i, l] of lines.entries()) {
    const f = parseFeature(l)
    if (f && states[f.id] && f.state !== states[f.id]) lines[i] = l.replace(/^- (⏳|🟢|🔨|🎛️|🎛|✅) /u, `- ${states[f.id]} `)
    // (the graph: "  F01[🟢 F01 Seed cards]")
    const g = l.match(/^(\s+)(F\d+)\[(⏳|🟢|🔨|🎛️|🎛|✅) /u)
    if (g && states[g[2]]) lines[i] = l.replace(/\[(⏳|🟢|🔨|🎛️|🎛|✅) /u, `[${states[g[2]]} `)
  }
  let out = lines.join('\n')
  // a feature whose needs are all ✅ now is ready: ⏳ → 🟢 (PROJECT-FILES' ready rule)
  const feats = allFeatures(out)
  const done = new Set(feats.filter(f => f.state === '✅').map(f => f.id))
  const ready = Object.fromEntries(feats.filter(f => f.state === '⏳' && f.needs.every(n => done.has(n))).map(f => [f.id, '🟢']))
  if (Object.keys(ready).length) return setStates(M.refreshMarks(before, out), ready)
  out = countMusts(out)
  return M.refreshMarks(before, out)
}
function countMusts(text) {
  const rm = readRoadmap(text)
  if (rm.target < 0) return text
  const musts = rm.milestones.flatMap(m => m.features).filter(f => f.type !== '❓' && isMust(f))
  const lines = rm.lines
  lines[rm.target] = lines[rm.target].replace(/musts \d+\/\d+ done/, `musts ${musts.filter(f => f.state === '✅').length}/${musts.length} done`)
  return lines.join('\n')
}

// A new idea under "## Ideas" ("- 2026-11-11 — <idea>"), once. Returns { text, added }.
export function addIdea(text, idea, when = day()) {
  const words = clean(idea)
  const before = nl(text)
  const lines = before.split('\n')
  if (!words) return { text: before, added: null }
  if (lines.some(l => /^- \d{4}-\d\d-\d\d — /.test(l) && clean(l.replace(/^- \d{4}-\d\d-\d\d — /, '')).toLowerCase() === words.toLowerCase())) return { text: before, added: null }
  let at = lines.findIndex(l => l.trim() === '## Ideas')
  if (at < 0) {
    // (inside BMUZ's roadmap block when there is one, so the plan tools read it where they expect it)
    const end = lines.findIndex(l => /^<!-- \/bmuz rm:plan -->$/.test(l))
    if (end >= 0) { lines.splice(end, 0, '## Ideas'); at = end } else { lines.push('## Ideas'); at = lines.length - 1 }
  }
  let end = at + 1
  while (end < lines.length && /^- /.test(lines[end])) end++
  const add = `- ${when} — ${words}`
  // (an empty line right under the heading stays below the list)
  if (end === at + 1 && lines[end] !== undefined && lines[end].trim() === '') lines.splice(end, 0, add)
  else lines.splice(end, 0, add)
  return { text: M.refreshMarks(before, lines.join('\n')), added: add }
}

// The current milestone done: "✅ ready to deliver" on its heading, "← current" moves to the next one.
export function moveCurrent(text) {
  const before = nl(text)
  const rm = readRoadmap(before)
  const i = rm.milestones.findIndex(m => m.current)
  if (i < 0 || milestonePct(rm.milestones[i]).done < milestonePct(rm.milestones[i]).all) return before
  const lines = rm.lines
  const m = rm.milestones[i]
  lines[m.line] = lines[m.line].replace(/\s{2}←\s*current/, '').replace(/\s*$/, `  ✅ ready to deliver ${day()}`)
  const next = rm.milestones[i + 1]
  if (next) lines[next.line] = lines[next.line].replace(/^(## v[\d.]+ — .+?)(\s*\(→ [^)]+\))?$/u, (all, a, b) => `${a}  ← current${b || ''}`)
  return M.refreshMarks(before, lines.join('\n'))
}

// ---- The record: .bmuz/develop/sprint.json ----
// { n, milestone, stage, goal, started, features: [{ id, name, type, see, done, notYet, needs, tasks: [{ who, text }],
//   check, status, runs, tries }] }
export const readRecord = dir => readJson(dir, RECORD)
const saveRecord = (dir, rec) => write(dir, RECORD, JSON.stringify(rec, null, 2) + '\n')
function recordOf(dir) {
  const rec = readRecord(dir)
  if (!rec || !Array.isArray(rec.features)) throw new Error(`there is no sprint yet (${RECORD} is missing): Plan the Sprint comes first`)
  return rec
}
function featureOf(dir, rec = recordOf(dir)) {
  const st = readState(dir)
  const id = st && st.given && st.given.feature
  const f = rec.features.find(x => x.id === id)
  if (!f) throw new Error(`no feature is being built (the feature run was given ${JSON.stringify(id ?? null)})`)
  return f
}
export const sprintNumber = dir => {
  const d = join(dir, ARCHIVE)
  const done = existsSync(d) ? readdirSync(d).filter(f => /^sprint-\d+\.md$/.test(f)).length : 0
  return done + 1
}

// ---- 4.3 Plan the Sprint ----
export function propose(dir) {
  const rm = readIn(dir, ROADMAP)
  if (!rm) throw new Error(`there is no ${ROADMAP}: Design's Build Plan writes it`)
  const m = currentMilestone(rm)
  if (!m) throw new Error(`${ROADMAP} has no milestones`)
  const done = new Set(allFeatures(rm).filter(f => f.state === '✅').map(f => f.id))
  const ready = m.features.filter(f => f.state !== '✅' && f.needs.every(n => done.has(n))).slice(0, 3)
  const out = { sprint: sprintNumber(dir), milestone: m.name, stage: m.stage, pct: milestonePct(m).pct, ready: ready.map(({ line, ...f }) => f), page: G.PAGE }
  write(dir, PROPOSE, JSON.stringify(out, null, 2) + '\n')
  return out
}

const CARD = ['see', 'done', 'notYet', 'needs']
// The plan step's features: [{ id, see, done, notYet, needs, tasks: [{ who: "🤖"|"🙋", text }], check }]. Problems.
export function planProblems(dir, features) {
  const p = readJson(dir, PROPOSE)
  if (!p) return [`${PROPOSE} is missing: the propose step comes first`]
  const list = listOf(features)
  const out = []
  if (!list.length) out.push(p.ready.length ? `the sprint has no features; the ready ones are ${p.ready.map(named).join(', ')}` : 'nothing is ready to build in this milestone')
  for (const f of list) {
    const id = clean(f && f.id)
    const known = p.ready.find(r => r.id === id)
    if (!known) { out.push(`${id || '(no id)'} isn't one of the ready features (${p.ready.map(named).join(', ') || 'none'})`); continue }
    for (const k of CARD) if (!clean(f[k])) out.push(`${id}: the card's "${k}" is empty ("nothing" is fine for needs)`)
    const tasks = listOf(f.tasks)
    if (tasks.length < 3 || tasks.length > 8) out.push(`${id}: ${tasks.length} tasks; a feature has 3 to 8`)
    if (tasks.some(t => !clean(t && (t.text ?? t)))) out.push(`${id}: a task has no words`)
    if (!clean(f.check)) out.push(`${id}: no "check" (the test plan: what proves it works)`)
  }
  if (new Set(list.map(f => clean(f && f.id))).size !== list.length) out.push('a feature is in the sprint twice')
  return out
}

export function sprintMd(rec) {
  const out = [`# Sprint ${pad(rec.n)} — ${rec.goal}`, `Started ${rec.started} · Milestone ${rec.milestone} · Features: ${rec.features.map(f => f.id).join(', ')} (in this order)`, '']
  for (const f of rec.features) {
    out.push(M.block(`sp:${f.id.toLowerCase()}`, featureMd(f)), '')
  }
  return out.join('\n')
}
function featureMd(f) {
  return [
    `## ${f.id} ${f.type} ${f.name}`,
    `You'll see: ${f.see}`,
    `Done when: ${f.done}`,
    `Not doing yet: ${f.notYet}`,
    `Needs from you: ${f.needs}`,
    ...f.tasks.map((t, i) => `- [ ] ${t.who} ${i + 1}. ${t.text}`),
    `Check: ${f.check}`,
  ].join('\n')
}

// The work branch (one per delivery): on main / master, dev/<milestone> is made and switched to.
export function workBranch(dir, milestone) {
  if (!B.isGitRepo(dir)) return null
  const git = args => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 60000 })
  const cur = (git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout || '').trim()
  if (!['main', 'master'].includes(cur)) return cur
  const name = `dev/${clean(milestone).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'next'}`
  const made = git(['checkout', '-q', '-b', name])
  if (made.status !== 0) git(['checkout', '-q', name])
  return name
}

export function planWrite(dir, script = loadScript(), now = new Date()) {
  const st = readState(dir)
  const plan = resultOf(st, 'plan')
  const problems = planProblems(dir, plan.features)
  if (problems.length) throw new Error(problems.join('; '))
  const p = readJson(dir, PROPOSE)
  const old = readRecord(dir)
  const features = listOf(plan.features).map(f => {
    const r = p.ready.find(x => x.id === clean(f.id))
    const prev = old && old.n === p.sprint ? (old.features || []).find(x => x.id === r.id) : null
    return {
      id: r.id, name: r.name, type: r.type, see: clean(f.see), done: clean(f.done), notYet: clean(f.notYet), needs: clean(f.needs),
      tasks: listOf(f.tasks).map(t => ({ who: /🙋/.test(t && t.who) ? '🙋' : '🤖', text: clean(t && (t.text ?? t)) })),
      check: clean(f.check), status: prev ? prev.status : 'planned', runs: prev ? prev.runs : 0, tries: [],
    }
  })
  const rec = { n: p.sprint, milestone: p.milestone, stage: p.stage, goal: clean(plan.goal) || features.map(f => f.name).join(', '), started: day(now), features }
  saveRecord(dir, rec)
  // (an earlier SPRINT.md of this same sprint, hand-edited, keeps their sections; a new sprint starts a new file)
  const have = readIn(dir, SPRINT)
  let text = sprintMd(rec)
  if (have && new RegExp(`^# Sprint ${pad(rec.n)} — `, 'm').test(have)) {
    text = have
    for (const f of features) text = M.writeBlock(text, `sp:${f.id.toLowerCase()}`, featureMd(f), { by: { step: 'plan', stage: 'Develop', day: day(now) } }).text
  }
  write(dir, SPRINT, text.endsWith('\n') ? text : text + '\n')
  const branch = workBranch(dir, p.milestone)
  const say = [line('develop.plan', { n: String(rec.n), milestone: rec.milestone, count: String(features.length) }, script),
    ...features.map(f => line('develop.plan.feature', { feature: named(f), see: f.see, done: f.done, notyet: f.notYet, needs: f.needs }, script))].join('\n\n')
  write(dir, SAY.plan, say + '\n')
  G.writePage(dir, now)
  return { rec, branch, say }
}

// ---- The loop: which feature runs next ----
// auto: an auto run only builds (an approval waits for the creative; a blocked or parked feature waits too). live: in
// sprint order, a feature built and waiting for their OK is shown again ("ready"), one tuned is asked again
// ("approve"), one blocked by an auto run is built again. Returns { start: { feature, at } } · { wait: [ids] } · { done }.
export function next(dir, mode = 'live') {
  const rec = recordOf(dir)
  const auto = mode === 'auto'
  for (const f of rec.features) {
    if (f.status === 'planned' || f.status === 'building') return { start: { feature: f.id, at: null } }
    if (!auto && f.status === 'blocked') return { start: { feature: f.id, at: null } }
    if (!auto && f.status === 'built') return { start: { feature: f.id, at: 'ready' } }
    if (!auto && f.status === 'tuning') return { start: { feature: f.id, at: 'approve' } }
  }
  const wait = rec.features.filter(f => !['approved', 'parked'].includes(f.status))
  if (wait.length) return { wait: wait.map(f => f.id), features: wait.map(named) }
  return { done: true }
}

// ---- A feature run (plugin/pipelines/feature.json) ----
export function featureStart(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const f = featureOf(dir, rec)
  f.status = 'building'
  f.runs = (f.runs || 0) + 1
  f.tries = []
  // (files the creative already had changed are left out of this feature's commits)
  f.dirty = B.dirtyFiles(dir)
  saveRecord(dir, rec)
  write(dir, ROADMAP, setStates(readIn(dir, ROADMAP) || '', { [f.id]: '🔨' }))
  write(dir, BRIEF, briefMd(dir, rec, f))
  write(dir, TRIES, '')
  const i = rec.features.indexOf(f)
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  write(dir, SAY.progress, line('develop.progress', { time, feature: named(f), n: String(i + 1), total: String(rec.features.length) }, script) + '\n')
  G.writePage(dir, now)
  return f
}
function briefMd(dir, rec, f) {
  return [
    `# Build ${named(f)} (Sprint ${pad(rec.n)} · ${rec.milestone})`,
    '',
    `You'll see: ${f.see}`, `Done when: ${f.done}`, `Not doing yet: ${f.notYet}`, `Needs from you: ${f.needs}`,
    '', '## Tasks', ...f.tasks.map((t, i) => `${i + 1}. ${t.who} ${t.text}`),
    '', `## Check`, f.check,
    '', '## Read first', `- ${R.RULEBOOK} (the rules: the single truth; every rule this feature builds gets a test)`, `- ${G.GDD} and ${D.TDD} (what the game is, how it is built)`, '- content/ (the settings and tables the game reads; values live there, never in code)',
    '', `## Earlier tries`, `If ${TRIES} has anything in it, an earlier try failed its check: read why, and after two failed tries take a simpler way.`,
  ].join('\n') + '\n'
}

// The builder's report, as the build flow handed it back (the journal's last "flow.result" of the build step).
export function buildResult(dir) {
  const lines = (readIn(dir, '.bmuz/journal.jsonl') || '').split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    let j
    try { j = JSON.parse(lines[i]) } catch (e) { continue }
    if (j.ev === 'flow.result' && j.step === 'build') return j.result && typeof j.result === 'object' ? j.result : null
  }
  return null
}
// A project with a UI (an index.html, or a "dev" script): every screen size gets a screenshot.
export const hasUi = dir => existsSync(join(dir, 'index.html')) || !!((readJson(dir, 'package.json') || {}).scripts || {}).dev
const isPng = (dir, f) => E.isSafePath(f) && existsSync(join(dir, f)) && statSync(join(dir, f)).isFile() && readFileSync(join(dir, f)).subarray(0, 4).toString('hex') === '89504e47'

// Why the build isn't proven (null = it is). Runs the tests; never trusts the builder's word that they pass.
export function proofProblem(dir, built) {
  const tests = listOf(built && built.tests).filter(t => t && clean(t.file) && clean(t.name))
  if (!tests.length) return 'the builder handed back no tests: every rule this feature builds needs a test, given as {"rule", "file", "name"}'
  const files = [...new Set(tests.map(t => clean(t.file)))]
  const ran = {}
  for (const file of files) {
    let argv
    try { argv = B.testCommand(dir, file) } catch (e) { return e.message }
    const r = B.runIn(dir, argv, B.testLimitMs())
    if (r.timedOut) return `${file} didn't finish in ${Math.round(B.testLimitMs() / 1000)} s`
    if (r.exitCode !== 0) return `${file} fails (${r.cmd}): ${r.out.slice(-400)}`
    ran[file] = { sha: sha(readIn(dir, file) || ''), passed: B.passedTests(argv, r) }
  }
  for (const t of tests) {
    const passed = ran[clean(t.file)].passed
    if (!passed.some(p => p === clean(t.name) || p.includes(clean(t.name)))) return `the test "${clean(t.name)}" (for ${clean(t.rule) || 'a rule'}) didn't run in ${clean(t.file)}: the runner reported ${passed.length ? passed.map(p => `"${p}"`).join(', ') : 'no passing tests'}`
  }
  for (const s of B.suite(dir)) if (s.exitCode !== 0) return `"${s.cmd}" fails: ${s.out.slice(-400)}`
  if (hasUi(dir)) {
    const shots = listOf(built.screens)
    for (const size of ['phone', 'desktop']) {
      const s = shots.find(x => x && clean(x.size).toLowerCase() === size)
      if (!s || !isPng(dir, clean(s.file))) return `no ${size} screenshot: the game has a UI, so every screen size gets one (a .png in the project, given as {"size": "${size}", "file"})`
    }
  }
  return { tests: tests.map(t => ({ rule: clean(t.rule), file: clean(t.file), name: clean(t.name), sha: ran[clean(t.file)].sha })), passed: Object.values(ran).reduce((n, r) => n + r.passed.length, 0) }
}

export function prove(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const f = featureOf(dir, rec)
  const built = buildResult(dir)
  const p = proofProblem(dir, built || {})
  if (typeof p === 'string') {
    f.tries = [...listOf(f.tries), { at: now.toISOString(), why: p }]
    saveRecord(dir, rec)
    write(dir, TRIES, f.tries.map((t, i) => `Try ${i + 1} failed its check: ${t.why}`).join('\n') + '\n')
    // (stuck twice: the script's line, said before the last try; the last try takes a simpler way)
    if (f.tries.length >= 2) write(dir, SAY.stuck, line('develop.stuck', { piece: named(f), know: p.length > 220 ? p.slice(0, 220) + '…' : p, plan: 'try a simpler way' }, script) + '\n')
    throw new Error(p)
  }
  const proof = { feature: f.id, at: now.toISOString(), tests: p.tests, passed: p.passed, screens: hasUi(dir) ? listOf(built.screens) : [], ui: hasUi(dir) }
  write(dir, `${DEV}/${f.id}.json`, JSON.stringify(proof, null, 2) + '\n')
  return proof
}

// 4.5's card. The links: the builder's, else the project's own way to play it.
function tryLinks(dir, built) {
  const s = (readJson(dir, 'package.json') || {}).scripts || {}
  const pc = clean(built && built.pc) || (s.dev ? 'npm run dev' : s.play ? 'npm run play' : 'npm test')
  const phone = clean(built && built.phone) || (s.dev ? 'npm run dev -- --host, then the network link on your phone' : 'no phone build yet')
  return { pc, phone }
}
export function ready(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const f = featureOf(dir, rec)
  const proof = readJson(dir, `${DEV}/${f.id}.json`)
  if (!proof) throw new Error(`${f.id} has no proof on record: Build & Prove comes first`)
  // (a waiting feature shown again: the card it had)
  const built = buildResult(dir) || proof.built || {}
  const links = tryLinks(dir, built)
  const changed = listOf(built.changed).map(clean).filter(Boolean)
  const checked = `${proof.passed} ${proof.passed === 1 ? 'test passes' : 'tests pass'}${proof.ui ? '; screenshots taken on phone and desktop' : ''}`
  const say = line('develop.ready', { feature: named(f), changed: changed.length ? changed.join('; ') : f.see, pc: links.pc, phone: links.phone, try: clean(built.try) || f.done, checked }, script)
  write(dir, SAY.ready, say + '\n')
  if (!proof.built) { proof.built = { changed, try: clean(built.try), pc: links.pc, phone: links.phone }; write(dir, `${DEV}/${f.id}.json`, JSON.stringify(proof, null, 2) + '\n') }
  if (f.status === 'building') {
    f.status = 'built'
    saveRecord(dir, rec)
    write(dir, ROADMAP, setStates(readIn(dir, ROADMAP) || '', { [f.id]: '🎛️' }))
    write(dir, SPRINT, sprintEdit(readIn(dir, SPRINT) || sprintMd(rec), f.id, { tick: '🤖', checked: `${checked} (${day(now)})` }))
    commitFeature(dir, f, `${f.id}: built — ${f.name} (${checked})`)
  }
  G.writePage(dir, now)
  return { say, proof }
}

// One feature's section of SPRINT.md, changed in place: 🤖 tasks ticked, a "Checked:" line, a "Notes:" line added.
export function sprintEdit(text, id, { tick = null, checked = null, note = null } = {}) {
  const before = nl(text)
  const lines = before.split('\n')
  const start = lines.findIndex(l => new RegExp(`^## ${id}\\b`).test(l))
  if (start < 0) return before
  let end = start + 1
  while (end < lines.length && !/^## /.test(lines[end]) && !/^<!-- \/bmuz sp:/.test(lines[end]) && !/^Retro:/.test(lines[end])) end++
  for (let i = start + 1; i < end; i++) if (tick && lines[i].startsWith(`- [ ] ${tick} `)) lines[i] = lines[i].replace('- [ ] ', '- [x] ')
  const add = []
  if (checked) {
    const at = lines.slice(start, end).findIndex(l => /^Checked: /.test(l))
    if (at >= 0) lines[start + at] = `Checked: ${checked}`
    else add.push(`Checked: ${checked}`)
  }
  if (note) add.push(`Notes: ${note}`)
  lines.splice(end, 0, ...add)
  return M.refreshMarks(before, lines.join('\n'))
}

// The feature's files this run changed (not the ones the creative had changed before it), committed.
function commitFeature(dir, f, message, extra = []) {
  const files = [...B.dirtyFiles(dir).filter(x => !listOf(f.dirty).includes(x)), ...extra]
  try { return B.commitFiles(dir, files, message, listOf(f.dirty)) } catch (e) { return { error: e.message } }
}

// ---- 4.5 Play & Approve: nothing is done without the creative's OK ----
export const ANSWERS = { approved: 'Yes, approve it', tune: 'Close, needs tuning', 'not-right': 'Not right' }
export function answerOf(words) {
  const w = clean(words).toLowerCase()
  if (/^wait/.test(w)) return 'waiting'
  if (/not right/.test(w)) return 'not-right'
  if (/tun|close/.test(w)) return 'tune'
  if (/approv|^yes/.test(w)) return 'approved'
  return null
}
// The creative's own answer to this try's approve box, from the journal (the engine writes what the box returned).
export function boxAnswer(dir, step = 'approve') {
  const lines = (readIn(dir, '.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
  let from = -1
  lines.forEach((j, i) => { if (j.ev === 'step.start' && j.step === step) from = i })
  if (from < 0) return null
  const said = lines.slice(from).filter(j => j.ev === 'answer' && j.step === step).map(j => String(j.text || ''))
  for (const t of said.reverse()) for (const [k, label] of Object.entries(ANSWERS)) if (t.includes(label)) return k
  return null
}
const testAnswered = (dir, step) => process.env.BMUZ_TEST === '1' && !!(readJson(dir, 'bmuz.json') || {}).testAnswers?.[step]
// Why the answer can't stand (null = it can).
export function approvalProblem(dir, answer, mode) {
  const a = answerOf(answer)
  if (!a) return `"${clean(answer)}" isn't an answer: give "approved", "tune", "not right" or (an auto run) "waiting"`
  if (testAnswered(dir, 'approve')) return a === 'waiting' ? 'a test answer stands in for the creative here: take it' : null
  if (mode === 'auto') return a === 'waiting' ? null : 'an auto run never answers for the creative: the answer is "waiting" (their OK stays a question)'
  if (a === 'waiting') return 'the creative is here: ask them with the script\'s box (develop.approve.box)'
  const theirs = boxAnswer(dir)
  if (!theirs) return 'there is no answer from the creative to the approve box yet: ask it with the script\'s box (develop.approve.box)'
  if (theirs !== a) return `the creative answered "${ANSWERS[theirs]}", not "${ANSWERS[a]}"`
  return null
}

// ---- 4.6 Tune & Revise: one setting at a time ----
const leafs = (v, at = '') => (v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => leafs(x, at ? `${at}.${k}` : k)) : [[at, JSON.stringify(v)]])
// The settings that changed since the tune step began (its checkpoint): [{ file, key, from, to }].
export function changedValues(dir, step = 'tune') {
  const cp = readJson(dir, `.bmuz/checkpoint-${step}.json`) || {}
  const out = []
  const files = new Set(Object.keys(cp).filter(f => /^content\/.+\.json$/.test(f)))
  // (a "writes" pattern, content/tuning/*.json: the files it matches now, so one the step made counts as changed)
  for (const [k, v] of Object.entries(cp)) {
    if (!(v && typeof v === 'object' && Array.isArray(v.pattern))) continue
    const folder = k.replace(/\/\*\.json$/, '')
    if (existsSync(join(dir, folder))) for (const f of readdirSync(join(dir, folder))) if (f.endsWith('.json')) files.add(`${folder}/${f}`)
  }
  for (const f of files) {
    let was = {}, now = {}
    try { was = JSON.parse(typeof cp[f] === 'string' ? cp[f] : 'null') ?? {} } catch (e) { was = {} }
    try { now = JSON.parse(readIn(dir, f) ?? 'null') ?? {} } catch (e) { now = {} }
    const a = new Map(leafs(was)), b = new Map(leafs(now))
    for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) out.push({ file: f, key: k, from: a.has(k) ? JSON.parse(a.get(k)) : null, to: b.has(k) ? JSON.parse(b.get(k)) : null })
  }
  return out
}
// rulebook: the tune step's own "rulebook" (its done-check runs before the result is kept)
export function tunedProblem(dir, rule, rulebook = null) {
  const ch = changedValues(dir)
  if (/^(yes|true)$/i.test(clean(rule))) {
    if (ch.length) return `the rule route changes no setting, but ${ch.map(c => `${c.file} ${c.key}`).join(', ')} changed`
    const rb = rulebook
    if (!rb || typeof rb !== 'object' || !clean(rb.log)) return 'the rule route goes back to the rulebook with a dev log entry: give "rulebook" with its "log" (what changes and why)'
    return null
  }
  if (ch.length !== 1) return ch.length ? `one setting at a time: ${ch.length} changed (${ch.map(c => `${c.file} ${c.key}`).join(', ')})` : 'no setting changed: change the one setting you named, in its content/ file'
  for (const s of B.suite(dir)) if (s.exitCode !== 0) return `"${s.cmd}" fails after the change: ${s.out.slice(-300)}`
  return null
}

export function featureEnd(dir, now = new Date()) {
  const rec = recordOf(dir)
  const f = featureOf(dir, rec)
  const st = readState(dir)
  const a = answerOf(resultOf(st, 'approve').answer) || 'waiting'
  const tune = resultOf(st, 'tune')
  let states = {}
  let commit = null
  if (a === 'approved') {
    f.status = 'approved'
    states = { [f.id]: '✅' }
    write(dir, SPRINT, sprintEdit(readIn(dir, SPRINT) || '', f.id, { note: `approved by you ${day(now)}` }))
    commit = `${f.id}: done — ${f.name} (approved)`
  } else if (a === 'tune' || a === 'not-right') {
    const rule = /^(yes|true)$/i.test(clean(tune.rule))
    const ch = changedValues(dir)[0]
    f.status = rule ? 'planned' : 'tuning'
    states = { [f.id]: rule ? '🟢' : '🎛️' }
    const note = rule
      ? `the rule itself, back to the rulebook: ${clean(tune.rulebook && tune.rulebook.log)} (built again)`
      : `Tuning: ${clean(tune.setting) || (ch ? ch.key : 'a setting')} ${ch ? `${JSON.stringify(ch.from)}→${JSON.stringify(ch.to)}` : ''} — ${clean(tune.cause)} — expect ${clean(tune.expect)}`
    write(dir, SPRINT, sprintEdit(readIn(dir, SPRINT) || '', f.id, { note }))
    commit = `${f.id}: ${rule ? 'rule changed' : 'tuned'} — ${f.name}${ch ? ` (${ch.key} ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)})` : ''}`
  }
  saveRecord(dir, rec)
  if (Object.keys(states).length) write(dir, ROADMAP, setStates(readIn(dir, ROADMAP) || '', states))
  G.writePage(dir, now)
  const c = commit ? commitFeature(dir, f, commit, [SPRINT, ROADMAP]) : null
  return { feature: f.id, status: f.status, commit: c }
}

// A feature run that ended early: "blocked" (an auto run moved past a block; a live "bmuz go" builds it again) or
// "parked" (the creative set it aside: a later sprint takes it up again). The block's reason is the run's own.
export function setStatus(dir, id, status, now = new Date()) {
  if (!['blocked', 'parked'].includes(status)) throw new Error(`"${status}" isn't blocked or parked`)
  const rec = recordOf(dir)
  const f = rec.features.find(x => x.id === id)
  if (!f) throw new Error(`${id} isn't in this sprint`)
  f.status = status
  saveRecord(dir, rec)
  const runs = readJson(dir, '.bmuz/feature-runs.json') || []
  const last = [...runs].reverse().find(r => r.feature === id)
  const st = last ? readJson(dir, `${last.record}/state.json`) : null
  const why = clean(st && st.blocked && st.blocked.why).slice(0, 300)
  write(dir, SPRINT, sprintEdit(readIn(dir, SPRINT) || '', id, { note: status === 'blocked' ? `BLOCKED ${day(now)} in an auto run${why ? `: ${why}` : ''}` : `parked by you ${day(now)}: a later sprint takes it up again` }))
  if (status === 'parked') write(dir, ROADMAP, setStates(readIn(dir, ROADMAP) || '', { [id]: '🟢' }))
  G.writePage(dir, now)
  return f
}

// ---- A new idea, any time ----
export function idea(dir, words, now = new Date()) {
  const rm = readIn(dir, ROADMAP)
  if (!rm) throw new Error(`there is no ${ROADMAP} to note it in`)
  const out = addIdea(rm, words, day(now))
  if (out.added) write(dir, ROADMAP, out.text)
  const gdd = readIn(dir, G.GDD)
  if (gdd) write(dir, G.GDD, G.applyResult(gdd, { ideas: [clean(words)] }, null, { step: 'idea', stage: 'Develop', day: day(now) }).text)
  G.writePage(dir, now)
  return { added: out.added, idea: clean(words) }
}

// ---- 4.7 Sprint Look-Back ----
const playtests = dir => { const t = readJson(dir, 'content/data/playtesting.json'); return t && Array.isArray(t.rows) ? t.rows.length : 0 }
export function lookbackPrep(dir) {
  const rec = recordOf(dir)
  const rm = readIn(dir, ROADMAP) || ''
  const m = currentMilestone(rm)
  const pct = m ? milestonePct(m) : { pct: '0%', done: 0, all: 0 }
  const sprint = readIn(dir, SPRINT) || ''
  const notes = sprint.split('\n').filter(l => /^(Notes|Checked): /.test(l))
  const onward = m && pct.all && pct.done >= pct.all ? 'deliver' : 'develop'
  const out = { n: rec.n, milestone: rec.milestone, pct: pct.pct, onward, playtested: playtests(dir) ? 'yes' : 'no', notes, features: rec.features.map(f => ({ feature: named(f), status: f.status, tries: listOf(f.tries).length, runs: f.runs })) }
  write(dir, LOOKBACK, JSON.stringify(out, null, 2) + '\n')
  return out
}
export function lookbackProblem(dir, onward, playtested) {
  const p = readJson(dir, LOOKBACK)
  if (!p) return `${LOOKBACK} is missing: the look-back's numbers come first`
  if (clean(onward) !== p.onward) return `"onward" is "${p.onward}" (${p.onward === 'deliver' ? `every must of ${p.milestone} is done` : `${p.milestone} has musts left`}), not "${clean(onward)}"`
  if (clean(playtested).toLowerCase().replace(/^(yes|no).*/, '$1') !== p.playtested) return `"playtested" is "${p.playtested}" (${p.playtested === 'yes' ? 'the Playtesting table has games in it' : 'the Playtesting table is empty'})`
  return null
}
export function retroProblem(retro) {
  const r = retro && typeof retro === 'object' ? retro : {}
  const left = ['well', 'wrong', 'change'].filter(k => !clean(r[k]))
  return left.length ? `the retro's ${left.map(k => `"${k}"`).join(', ')} ${left.length > 1 ? 'are' : 'is'} empty: three lines, the creative's words winning` : null
}
export function lookbackWrite(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const st = readState(dir)
  const lb = resultOf(st, 'lookback')
  const bad = retroProblem(lb.retro)
  if (bad) throw new Error(bad)
  const by = { step: 'lookback', stage: 'Develop', day: day(now) }
  // 1. the Retro, then the sprint archived (PROJECT-FILES: archive/sprints/sprint-NN.md)
  const sprint = (readIn(dir, SPRINT) || sprintMd(rec)).replace(/\n*$/, '\n')
  const text = `${sprint.replace(/\nRetro:[\s\S]*$/, '\n')}\nRetro:\n- went well: ${clean(lb.retro.well)}\n- went wrong: ${clean(lb.retro.wrong)}\n- change: ${clean(lb.retro.change)}\n`
  write(dir, `${ARCHIVE}/sprint-${pad(rec.n)}.md`, text)
  B.writeIn(dir, SPRINT, text)
  // 2. the GDD (chapters as built), the rulebook, the TDD: "to match what we built"
  const gdd = readIn(dir, G.GDD)
  const wrote = []
  if (gdd) {
    let doc = G.applyResult(gdd, { chapters: lb.gdd && lb.gdd.chapters ? lb.gdd.chapters : (lb.gdd || {}) }, 'worked out', by).text
    for (const n of listOf(lb.built).map(Number).filter(n => G.chapterName(n))) doc = G.writeChapter(doc, n, null, 'built', by).text
    write(dir, G.GDD, doc)
    wrote.push('the GDD')
  }
  if (lb.rulebook && typeof lb.rulebook === 'object' && Object.keys(lb.rulebook).length) {
    const out = R.applyRulebook(readIn(dir, R.RULEBOOK) || R.newRulebook(G.gameName(gdd || '')), lb.rulebook, by)
    write(dir, R.RULEBOOK, out.text)
    wrote.push('the rulebook')
  }
  if (lb.tdd && typeof lb.tdd === 'object' && Object.keys(lb.tdd).length && readIn(dir, D.TDD)) {
    D.tddWrite(dir, Object.fromEntries(Object.entries(lb.tdd).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => `- ${clean(x)}`).join('\n') : String(v ?? '')])), by)
    wrote.push('the TDD')
  }
  // 3. the milestone: all its musts done → "ready to deliver", the next one current
  write(dir, ROADMAP, moveCurrent(readIn(dir, ROADMAP) || ''))
  // 4. the next sprint, as it would be proposed now
  const p = propose(dir)
  const nextWords = p.ready.length ? p.ready.map(named).join(', ') : 'none ready yet'
  write(dir, SAY.lookback, line('develop.lookback.updated', { next: nextWords }, script) + '\n')
  G.writePage(dir, now)
  const files = [`${ARCHIVE}/sprint-${pad(rec.n)}.md`, SPRINT, ROADMAP, G.GDD, R.RULEBOOK, D.TDD]
  let commit = null
  try { commit = B.commitFiles(dir, files, `Sprint ${pad(rec.n)} done`) } catch (e) { commit = { error: e.message } }
  return { wrote, next: nextWords, commit }
}

// ---- 4.8 Teaching (only after playtests) ----
export function teachingWrite(dir, now = new Date()) {
  const st = readState(dir)
  const t = resultOf(st, 'teaching')
  const steps = listOf(t.steps).map(x => clean(x && typeof x === 'object' ? x.text ?? x.name : x)).filter(Boolean)
  if (!steps.length) throw new Error('the tutorial has no steps')
  const by = { step: 'teaching', stage: 'Develop', day: day(now) }
  const gdd = readIn(dir, G.GDD)
  if (gdd) write(dir, G.GDD, G.applyResult(gdd, { chapters: { 14: [clean(t.learn) ? `**What a new player must learn:** ${clean(t.learn)}` : null, '**The tutorial:**', ...steps.map((s, i) => `${i + 1}. ${s}`)].filter(Boolean).join('\n') } }, 'worked out', by).text)
  // the tutorial becomes a feature of the current milestone (its next number)
  const rm = readIn(dir, ROADMAP) || ''
  const ids = allFeatures(rm).map(f => Number(f.id.slice(1)))
  const id = `F${pad((ids.length ? Math.max(...ids) : 0) + 1)}`
  const m = currentMilestone(rm)
  if (m && !allFeatures(rm).some(f => /tutorial/i.test(f.name))) {
    const before = nl(rm)
    const lines = before.split('\n')
    const last = m.features.length ? m.features[m.features.length - 1].line : m.line
    lines.splice(last + 1, 0, `- 🟢 ${id} 🎮 Tutorial — ${steps.length} short steps, each teaching one thing in the order players meet it — must:${m.stage || 'playable'}`)
    write(dir, ROADMAP, countMusts(M.refreshMarks(before, lines.join('\n'))))
  }
  G.writePage(dir, now)
  return { steps, id }
}

// ---- The command line ----
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const [mode, a, b] = process.argv.slice(2)
  const dir = process.cwd()
  const say = (ok, text) => { console.log(text); process.exit(ok ? 0 : 1) }
  try {
    if (mode === 'propose') {
      const p = propose(dir)
      say(true, `✔ ${PROPOSE}: sprint ${p.sprint} · ${p.milestone} (${p.pct}) · ready: ${p.ready.map(named).join(', ') || 'none'}`)
    } else if (mode === 'plan-check') {
      let f
      try { f = JSON.parse(a || '[]') } catch (e) { f = null }
      const p = f === null ? ['"features" must be a list'] : planProblems(dir, f)
      say(!p.length, p.length ? `✘ ${p.join('; ')}` : '✔ the plan card is whole')
    } else if (mode === 'plan-write') {
      const r = planWrite(dir)
      say(true, `✔ ${SPRINT}: Sprint ${pad(r.rec.n)} · ${r.rec.features.map(named).join(', ')}${r.branch ? ` · branch ${r.branch}` : ''}`)
    } else if (mode === 'next') {
      console.log(JSON.stringify(next(dir, a === 'auto' ? 'auto' : 'live')))
    } else if (mode === 'feature-start') {
      const f = featureStart(dir)
      say(true, `✔ building ${named(f)} (run ${f.runs})`)
    } else if (mode === 'prove') {
      const p = prove(dir)
      say(true, `✔ ${p.feature}: ${p.tests.length} tests for its rules pass, ${p.passed} in all; the suite is green${p.ui ? '; phone and desktop screenshots' : ''}`)
    } else if (mode === 'ready') {
      ready(dir)
      say(true, `✔ ${SAY.ready}`)
    } else if (mode === 'approval') {
      const p = approvalProblem(dir, a, b)
      say(!p, p ? `✘ ${p}` : `✔ ${answerOf(a)}`)
    } else if (mode === 'tuned') {
      let rb = null
      try { rb = JSON.parse(b || 'null') } catch (e) { rb = null }
      const p = tunedProblem(dir, a, rb)
      say(!p, p ? `✘ ${p}` : '✔ one setting changed; the suite is green')
    } else if (mode === 'feature-end') {
      const r = featureEnd(dir)
      say(true, `✔ ${r.feature}: ${r.status}${r.commit && r.commit.hash ? ` · committed ${r.commit.hash}` : ''}`)
    } else if (mode === 'status') {
      const f = setStatus(dir, a, b)
      say(true, `✔ ${named(f)}: ${f.status}`)
    } else if (mode === 'idea') {
      const r = idea(dir, a)
      say(true, r.added ? `✔ ${ROADMAP}: ${r.added}` : `✔ already on the roadmap's Ideas: ${r.idea}`)
    } else if (mode === 'lookback-prep') {
      const p = lookbackPrep(dir)
      say(true, `✔ ${LOOKBACK}: sprint ${p.n} · ${p.milestone} is ${p.pct} done · onward: ${p.onward}`)
    } else if (mode === 'lookback-check') {
      let retro = null
      try { retro = JSON.parse(process.argv[5] || 'null') } catch (e) { retro = null }
      const p = lookbackProblem(dir, a, b) || retroProblem(retro)
      say(!p, p ? `✘ ${p}` : '✔ the look-back is whole')
    } else if (mode === 'lookback-write') {
      const r = lookbackWrite(dir)
      say(true, `✔ Sprint archived · ${r.wrote.join(', ') || 'nothing else'} updated · next: ${r.next}`)
    } else if (mode === 'teaching-write') {
      const r = teachingWrite(dir)
      say(true, `✔ the tutorial (${r.steps.length} steps) in GDD chapter 14 and the roadmap`)
    } else {
      say(false, '✘ use: node sprint.mjs propose | plan-check <features> | plan-write | next <auto|live> | feature-start | prove | ready | approval <answer> <auto|live> | tuned [rule] | feature-end | idea <words> | lookback-prep | lookback-check <onward> <playtested> | lookback-write | teaching-write')
    }
  } catch (err) {
    say(false, `✘ ${String(err && err.message ? err.message : err).slice(0, 600)}`)
  }
}
