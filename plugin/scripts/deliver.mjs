// Deliver (F219; the approved script's Stage 5, framework .planning/research/bmuz-vision/bmuz-design-doc.html): each
// time a milestone is ready it becomes a build the creative can play and share, then it's back to Develop.
// Release stages (the script's table): Playable (each vertical slice) · Alpha · Beta · 1.0 — a milestone's "(→ stage)".
// The checks grow with the stage. The release itself (merge, version, tag, push, live check, rollback) is done by the
// release scripts BMUZ already has, through release-tools.mjs, and only after the creative's own "Share it".
// The run's record is .bmuz/deliver/run.json (written only here); the lines BMUZ says are composed from the script and
// shown (.bmuz/deliver/say-*.md).
//
//   node deliver.mjs prep                    which milestone, which stage; first time? ({"results": {"first": …}})
//   node deliver.mjs welcome                 5.0's welcome, composed (shown), first time only
//   node deliver.mjs check                   5.1 the Release Check: musts · blocking bugs · every check (shown);
//                                            {"results": {"missing": yes|no}}; "Not ready yet: …" when something is
//   node deliver.mjs choice <choice> <auto|live>   the not-ready answer's done-check: finish | move
//   node deliver.mjs not-ready <choice>      finish → back to Develop · move → the musts move to the next stage
//   node deliver.mjs decide                  go on? and the stand-ins to ask about ({"results": {"go", "polish"}})
//   node deliver.mjs polish '<picked>'       5.2's answer: polish some first (back to Develop) or ship as it is
//   node deliver.mjs safety                  5.3 Safety & Legal, for the stage (shown); refuses a key or an unlicensed file
//   node deliver.mjs build                   5.4 the build and its card: a link for you, one to share (shown)
//   node deliver.mjs not-yet '<missing>'     5.4 "Not yet": what's missing goes on the roadmap, back to Develop
//   node deliver.mjs publish                 5.4 "Share it": only with the creative's own journaled answer — merge,
//                                            version + tag, smoke pass, push, deploy, live check (rollback if it fails)
//   node deliver.mjs notes-check '<notes>'   5.5's done-check: every feeling of GDD chapter 1, each item sorted
//   node deliver.mjs notes-write             5.5 the notes into the roadmap (tuning, bugs, rulebook questions, ideas)
//   (run in the project folder)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as M from './marks.mjs'
import * as B from './bugs.mjs'
import * as S from './sprint.mjs'
import { runTool, loadTool } from './release-tools.mjs'

export const DIR = '.bmuz/deliver'
export const RECORD = `${DIR}/run.json`
export const HISTORY = `${DIR}/history.json`
export const SAY = { welcome: `${DIR}/say-welcome.md`, check: `${DIR}/say-check.md`, back: `${DIR}/say-back.md`, notyet: `${DIR}/say-notyet.md`, safety: `${DIR}/say-safety.md`, build: `${DIR}/say-build.md`, live: `${DIR}/say-live.md`, notes: `${DIR}/say-notes.md` }
export const STATE_MD = '.planning/STATE.md'
const ROADMAP = S.ROADMAP

// The release stages, in order (the script's table). rank: how much the checks grow.
export const STAGES = [
  { key: 'playable', name: 'Playable', kind: 'milestone' },
  { key: 'alpha', name: 'Alpha', kind: 'stage' },
  { key: 'beta', name: 'Beta', kind: 'stage' },
  { key: '1.0', name: '1.0', kind: 'major' },
]
// (review fix 9: a stage BMUZ doesn't know, or none, is null — never guessed; prep refuses it with the heading to fix)
export const stageOf = word => {
  const w = String(word || '').toLowerCase().trim()
  const i = STAGES.findIndex(s => s.key === w)
  return i < 0 ? null : { ...STAGES[i], rank: i }
}

const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const day = (now = new Date()) => now.toISOString().slice(0, 10)
const readIn = (dir, rel) => G.readFileIn(dir, rel)
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const readJson = (dir, rel) => { try { return JSON.parse(readIn(dir, rel) || 'null') } catch (e) { return null } }
const git = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 120000 })
const gitOut = (dir, args) => { const r = git(dir, args); return r.status === 0 ? (r.stdout || '').trim() : null }
const named = f => `${f.id} — ${f.name}`
const isMust = f => f.type !== '❓' && (/^must/.test(f.scope) || !f.scope)
const yes = b => (b ? 'yes' : 'no')

function line(id, slots, script = loadScript()) {
  const r = E.renderLine(script, id, slots)
  if (r.error) throw new Error(r.error)
  return r.text.replace(/\n+$/, '')
}
export const readRecord = dir => readJson(dir, RECORD)
const saveRecord = (dir, rec) => write(dir, RECORD, JSON.stringify(rec, null, 2) + '\n')
function recordOf(dir) {
  const rec = readRecord(dir)
  if (!rec || !rec.milestone) throw new Error(`there is no delivery yet (${RECORD} is missing): "prep" comes first`)
  return rec
}
const testAnswered = (dir, step) => process.env.BMUZ_TEST === '1' && !!(readJson(dir, 'bmuz.json') || {}).testAnswers?.[step]

// ---- The roadmap ----
// The milestone being delivered: the first one marked "✅ ready to deliver" (Develop's look-back marks it) and not
// released yet; else the current one (Deliver started by hand).
export function deliveredMilestone(text) {
  const rm = S.readRoadmap(text)
  const ready = rm.milestones.find(m => /✅ ready to deliver/.test(rm.lines[m.line]) && !/released/.test(rm.lines[m.line]))
  return ready || S.currentMilestone(text)
}
const milestoneByName = (text, name) => S.readRoadmap(text).milestones.find(m => m.name === name) || null

// Back to Develop with this milestone: "← current" on it again (off the next one), its "✅ ready to deliver" gone.
export function reopen(text, name) {
  const before = nl(text)
  const rm = S.readRoadmap(before)
  const m = rm.milestones.find(x => x.name === name)
  if (!m) return before
  const lines = rm.lines
  for (const x of rm.milestones) if (x !== m) lines[x.line] = lines[x.line].replace(/\s{2}←\s*current/, '')
  // (review fix 3: every Deliver mark goes — "✅ ready to deliver …" and "✅ released …" — or the milestone would be
  // skipped for good)
  let h = lines[m.line].replace(/\s+✅ (ready to deliver|released)[^\n]*$/u, '')
  if (!/←\s*current/.test(h)) h = h.replace(/^(## v[\d.]+ — .+?)(\s*\(→ [^)]+\))?$/u, (all, a, b) => `${a}  ← current${b || ''}`)
  lines[m.line] = h
  return M.refreshMarks(before, lines.join('\n'))
}

// A new feature at the end of a milestone's list (its next number): { text, id }.
export function addFeature(text, name, f) {
  const before = nl(text)
  const rm = S.readRoadmap(before)
  const m = rm.milestones.find(x => x.name === name)
  if (!m) throw new Error(`the roadmap has no milestone "${name}"`)
  const ids = S.allFeatures(before).map(x => Number(x.id.slice(1)))
  const id = `F${String((ids.length ? Math.max(...ids) : 0) + 1).padStart(2, '0')}`
  const lines = rm.lines
  const at = m.features.length ? m.features[m.features.length - 1].line + 1 : m.line + 1 + (/^Goal:/.test(lines[m.line + 1] || '') ? 1 : 0)
  lines.splice(at, 0, `- 🟢 ${id} ${f.type} ${clean(f.name)} — ${clean(f.description)} — ${f.scope}`)
  return { text: S.setStates(M.refreshMarks(before, lines.join('\n')), {}), id }
}

// "Move it to the next stage": the feature goes to the next milestone, its must tag to that stage, and its line says so.
export function moveToNext(text, id, from, when = day()) {
  const before = nl(text)
  const rm = S.readRoadmap(before)
  const i = rm.milestones.findIndex(m => m.name === from)
  const to = rm.milestones.slice(i + 1).find(m => m.stage) || rm.milestones[i + 1]
  if (i < 0 || !to) throw new Error(`there is no stage after ${from} on the roadmap to move ${id} to`)
  const lines = rm.lines
  const f = rm.milestones[i].features.find(x => x.id === id)
  if (!f) throw new Error(`${id} isn't in ${from}`)
  const stage = to.stage || 'later'
  let moved = lines[f.line].replace(/ — must(:\S+)?/, ` — must:${stage}`) + ` · moved from ${rm.milestones[i].stage || from} ${when}`
  // (the graph: the feature's node and its arrows move with it, into the next milestone's graph)
  const node = new RegExp(`^\\s+${id}\\[|^\\s+F\\d+ --> ${id}$|^\\s+${id} --> F\\d+$`)
  const graphLines = []
  const m0 = rm.milestones[i]
  const end0 = rm.milestones[i + 1] ? rm.milestones[i + 1].line : lines.length
  for (let n = end0 - 1; n > m0.line; n--) if (node.test(lines[n])) graphLines.unshift(...lines.splice(n, 1))
  lines.splice(f.line, 1)
  // (positions after the removals: read the roadmap again)
  const after = S.readRoadmap(lines.join('\n'))
  const t = after.milestones.find(m => m.name === to.name)
  const out = after.lines
  const lastFeature = t.features.length ? t.features[t.features.length - 1].line : t.line + (/^Goal:/.test(out[t.line + 1] || '') ? 1 : 0)
  out.splice(lastFeature + 1, 0, moved)
  if (graphLines.length) {
    const tEnd = (S.readRoadmap(out.join('\n')).milestones.find(m => m.name === to.name))
    const next = S.readRoadmap(out.join('\n')).milestones.find(m => m.line > tEnd.line)
    const stop = next ? next.line : out.length
    let close = -1
    for (let n = tEnd.line; n < stop; n++) if (/^```\s*$/.test(out[n])) close = n
    if (close > 0) out.splice(close, 0, ...graphLines)
    else out.splice(lastFeature + 2, 0, '```mermaid', 'flowchart LR', ...graphLines, '```')
  }
  // (setStates with the feature's own state: its graph node says the same as its line)
  return S.setStates(M.refreshMarks(before, out.join('\n')), { [id]: f.state })
}

// The milestone released: its heading "✅ released <day> (v0.1.0)", the Release target on to the next stage.
export function markReleased(text, name, tag, when = day()) {
  const before = nl(text)
  const rm = S.readRoadmap(before)
  const i = rm.milestones.findIndex(m => m.name === name)
  if (i < 0) return before
  const lines = rm.lines
  const m = rm.milestones[i]
  lines[m.line] = lines[m.line].replace(/\s{2}←\s*current/, '').replace(/\s+✅[^\n]*$/u, '') + `  ✅ released ${when} (${tag})`
  const next = rm.milestones.slice(i + 1).find(x => x.stage)
  if (rm.target >= 0 && next) lines[rm.target] = lines[rm.target].replace(/^Release target:\s*\S+/, `Release target: ${next.stage}`)
  return M.refreshMarks(before, lines.join('\n'))
}

// ---- 5.0 / prep ----
const tags = dir => (gitOut(dir, ['tag', '-l', 'v[0-9]*']) || '').split('\n').filter(Boolean)
const branchNow = dir => gitOut(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
const mainOf = dir => ['main', 'master'].find(b => gitOut(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]) !== null) || null

export function prep(dir, now = new Date()) {
  const rm = readIn(dir, ROADMAP)
  if (!rm) throw new Error(`there is no ${ROADMAP}: Design's Build Plan writes it`)
  const m = deliveredMilestone(rm)
  if (!m) throw new Error(`${ROADMAP} has no milestones`)
  const stage = stageOf(m.stage)
  if (!stage) throw new Error(`The milestone heading "${S.readRoadmap(rm).lines[m.line].trim()}" has no release stage I know: add "(→ playable)", "(→ alpha)", "(→ beta)" or "(→ 1.0)" to it in ${ROADMAP}, then say "bmuz retry"`)
  const hist = readJson(dir, HISTORY) || {}
  const first = !hist.welcomed && !tags(dir).length
  const branch = branchNow(dir)
  const rec = { milestone: m.name, title: m.title, stage: stage.key, started: day(now), branch: branch && /^dev\//.test(branch) ? branch : null, go: false, publish: {} }
  saveRecord(dir, rec)
  return { rec, first }
}

export function welcome(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  write(dir, SAY.welcome, line('deliver.welcome', { milestone: rec.milestone }, script) + '\n')
  const hist = readJson(dir, HISTORY) || {}
  write(dir, HISTORY, JSON.stringify({ ...hist, welcomed: hist.welcomed || day(now) }, null, 2) + '\n')
}

// ---- 5.1 Release Check ----
const OPEN_BUG = e => !['fixed', 'verified', "won't fix", "can't reproduce"].includes(e.status)
export function blockingBugs(dir, rank) {
  const text = readIn(dir, B.BUGS) || ''
  const levels = rank >= 2 ? ['P0', 'P1'] : ['P0']
  return B.readEntries(text).filter(e => OPEN_BUG(e) && levels.includes(e.level)).map(e => ({ id: e.id, level: e.level, title: B.titleOf(text, e.id) }))
}
// The project's checks: its tests and check:fast (bugs.mjs suite), its build; from Alpha on, the stage's release
// checklist (release-check.mjs, the one /deliver uses). [{ name, ok, why }]
export async function runChecks(dir, stage) {
  const out = []
  for (const s of B.suite(dir)) out.push({ name: s.cmd, ok: s.exitCode === 0 && !s.timedOut, why: s.exitCode === 0 ? '' : B.suiteWhy(s) })
  const scripts = (readJson(dir, 'package.json') || {}).scripts || {}
  if (scripts.build) {
    const b = B.runIn(dir, ['npm', 'run', 'build'], B.testLimitMs(dir))
    out.push({ name: 'npm run build', ok: b.exitCode === 0 && !b.timedOut, why: b.exitCode === 0 ? '' : B.suiteWhy(b) })
  }
  if (stage.rank >= 1) {
    runTool(dir, 'release-check', [stage.key])
    const rc = await loadTool('release-check')
    const open = rc.releaseCheckProblems(dir, stage.key)
    out.push({ name: `the ${stage.name} release checklist`, ok: !open.length, why: open.map(([t]) => t.split('\n')[0]).join('; ') })
  }
  return out
}

export async function check(dir, script = loadScript()) {
  const rec = recordOf(dir)
  const stage = stageOf(rec.stage)
  const m = milestoneByName(readIn(dir, ROADMAP) || '', rec.milestone)
  if (!m) throw new Error(`${ROADMAP} has no milestone "${rec.milestone}" any more`)
  const musts = m.features.filter(isMust)
  const undone = musts.filter(f => f.state !== '✅')
  const bugs = blockingBugs(dir, stage.rank)
  const checks = await runChecks(dir, stage)
  const failing = checks.filter(c => !c.ok)
  const lines = [
    undone.length ? `✗ ${musts.length - undone.length} of ${musts.length} musts for this stage are done` : `✓ every must for this stage is done (${musts.length} of ${musts.length})`,
    bugs.length ? `✗ blocking bugs: ${bugs.map(b => `${b.id} (${b.level})`).join(', ')}` : '✓ no blocking bugs',
    failing.length ? `✗ a check fails: ${failing.map(c => c.name).join(', ')}` : '✓ every check passes',
  ]
  const missing = [...undone.map(named), ...bugs.map(b => `${b.id} — ${clean(b.title)}`), ...failing.map(c => c.name)]
  let say = line('deliver.check', { stage: stage.name, checks: lines.join('\n') }, script)
  if (missing.length) say += `\n\n${line('deliver.notready', { missing: missing.join(', ') }, script)}`
  write(dir, SAY.check, say + '\n')
  rec.check = { musts: { done: musts.length - undone.length, all: musts.length, open: undone.map(f => f.id) }, bugs: bugs.map(b => b.id), checks: failing.map(c => ({ name: c.name, why: c.why.slice(0, 400) })), missing }
  rec.go = !missing.length
  saveRecord(dir, rec)
  return rec
}

// The not-ready answer: the option picked in the script's box, matched exactly (review fix 8; F216's fix 1 for the
// approve box): "Finish it first" (back to Develop) or "Move it to the next stage" (the open musts move on). Words
// that only mention one ("don't move it, finish it first") are neither. An auto run can only finish: moving a must
// changes the plan, the creative's call.
export const CHOICES = { 'Finish it first': 'finish', 'Move it to the next stage': 'move' }
export const choiceOf = words => CHOICES[clean(words)] || null
// The creative's own pick in this try's not-ready box, from the journal (the question as handed out, the label exact).
export function boxPick(dir, step, lineId, labels) {
  const js = (readIn(dir, '.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
  let from = -1
  js.forEach((j, i) => { if (j.ev === 'step.start' && j.step === step) from = i })
  if (from < 0) return null
  const rest = js.slice(from)
  const box = rest.filter(j => j.ev === 'line' && j.line === lineId && j.box && j.box.question).pop()
  if (!box) return null
  const asked = `"${box.box.question}"="`
  for (const t of rest.filter(j => j.ev === 'answer' && j.step === step).map(j => String(j.text || '')).filter(t => t.includes(asked)).reverse()) {
    const picked = t.slice(t.lastIndexOf(asked) + asked.length)
    for (const label of labels) if (picked.startsWith(`${label}"`)) return label
  }
  return null
}
export function choiceProblem(dir, words, mode) {
  const c = choiceOf(words)
  if (!c) return `the answer must be exactly "Finish it first" or "Move it to the next stage" (the option picked in the box), not "${clean(words)}"`
  if (mode !== 'auto') {
    const picked = boxPick(dir, 'notready', 'deliver.notready.box', Object.keys(CHOICES))
    if (!picked) return 'there is no answer to the box "Finish it first, or move it to the next stage?" in this try: ask it, and hand back the option the creative picked'
    if (picked !== clean(words)) return `the creative picked "${picked}", not "${clean(words)}"`
  }
  if (c === 'move' && mode === 'auto' && !testAnswered(dir, 'notready')) return 'moving a must to the next stage changes the plan: that is the creative\'s call, so an auto run can only answer "Finish it first"'
  const rec = readRecord(dir)
  if (c === 'move' && rec && rec.check && !rec.check.musts.open.length) return 'nothing to move: every must for this stage is done (what is missing is a bug or a check, so it is "finish")'
  return null
}

function back(dir, rec, words, script, now) {
  const what = clean(words).replace(/[.!?]+$/, '')
  write(dir, ROADMAP, reopen(readIn(dir, ROADMAP) || '', rec.milestone))
  S.writePlan(dir, ROADMAP, readIn(dir, ROADMAP), `back to Develop to ${what}`)
  G.writePage(dir, now)
  write(dir, SAY.back, line('deliver.back', { what }, script) + '\n')
  rec.go = false
  rec.back = what
  saveRecord(dir, rec)
}

export function notReady(dir, words, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const c = choiceOf(words)
  write(dir, SAY.back, '')
  if (c === 'move') {
    let text = readIn(dir, ROADMAP) || ''
    for (const id of rec.check.musts.open) text = moveToNext(text, id, rec.milestone, day(now))
    S.writePlan(dir, ROADMAP, text, `${rec.check.musts.open.join(', ')} moved to the next stage`)
    G.writePage(dir, now)
    const moved = rec.check.musts.open
    rec.check.moved = moved
    rec.check.missing = rec.check.missing.filter(x => !moved.some(id => x.startsWith(`${id} — `)))
    rec.check.musts = { ...rec.check.musts, all: rec.check.musts.all - moved.length, open: [] }
    rec.go = !rec.check.missing.length
    saveRecord(dir, rec)
    if (!rec.go) back(dir, rec, `fix ${rec.check.missing.join(', ')}`, script, now)
  } else {
    back(dir, rec, `finish ${rec.check.missing.join(', ')}`, script, now)
  }
  return rec
}

// ---- 5.2 Polish & Stand-ins ----
// What's still a placeholder: release-check.mjs's own finder (credits.json "stand-in", placeholder file names, open
// "(stand-in)" tasks), named the way the creative knows them (a credits entry's "name" when it has one).
export async function standInsOf(dir) {
  const rc = await loadTool('release-check')
  let credits = []
  try { credits = JSON.parse(readIn(dir, 'content/credits.json') || '[]') } catch (e) { credits = [] }
  const entries = Array.isArray(credits) ? credits : Array.isArray(credits && credits.entries) ? credits.entries : []
  const names = rc.standIns(dir).map(s => {
    const c = s.match(/^credits\.json: (.+?) — /)
    if (c) { const e = entries.find(x => x && [].concat(x.paths || []).join(', ') === c[1] || (x && x.source === c[1])); return clean((e && (e.name || e.what)) || c[1]) }
    return clean(s.replace(/^(file|SPRINT\.md): /, ''))
  })
  return [...new Set(names)].filter(Boolean)
}
export async function decide(dir) {
  const rec = recordOf(dir)
  // (a box holds 4 options at most: 3 stand-ins and "None, ship it as it is")
  rec.standins = rec.go ? (await standInsOf(dir)).slice(0, 3) : []
  saveRecord(dir, rec)
  return { go: yes(rec.go), polish: yes(rec.go && rec.standins.length > 0) }
}
export function polish(dir, picked, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  let list = picked
  if (typeof list === 'string') { try { list = JSON.parse(list) } catch (e) { list = list.split(/\s*[,;]\s*/) } }
  list = listOf(list).map(x => clean(x && typeof x === 'object' ? x.label ?? x.text : x)).filter(Boolean)
  write(dir, SAY.back, '')
  if (!list.length || list.some(x => /^none\b/i.test(x))) return { go: 'yes', picked: [] }
  const unknown = list.filter(x => !rec.standins.includes(x))
  if (unknown.length) throw new Error(`"${unknown.join('", "')}" isn't one of the placeholders (${rec.standins.join(', ')})`)
  let text = readIn(dir, ROADMAP) || ''
  const stage = stageOf(rec.stage)
  for (const x of list) text = addFeature(text, rec.milestone, { type: '✨', name: `Polish: ${x}`, description: `${x}, made final instead of a placeholder`, scope: `must:${stage.key}` }).text
  write(dir, ROADMAP, text)
  back(dir, rec, `polish ${list.join(', ')}`, script, now)
  return { go: 'no', picked: list }
}

// ---- 5.3 Safety & Legal ----
const SECRETS = [
  [/AKIA[0-9A-Z]{16}/, 'an AWS access key'],
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, 'a private key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, 'a GitHub token'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/, 'an API secret key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\b(?:password|passwd|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, 'a password or key written in the code'],
]
const TEXT_FILE = /\.(m?[jt]sx?|cjs|json|html?|css|md|txt|ya?ml|toml|env|ini|cfg|sh|ps1|py|cs)$|(^|\/)\.env(\.[\w-]+)?$/i
const ASSET = /\.(png|jpe?g|webp|gif|svg|avif|mp3|ogg|wav|m4a|flac|woff2?|ttf|otf|glb|gltf|fbx|obj)$/i
function* walk(root, rel = '') {
  let entries = []
  try { entries = readdirSync(join(root, rel), { withFileTypes: true }) } catch (e) { return }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.bmuz') continue
    const p = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) yield* walk(root, p)
    else yield p
  }
}
// Keys and passwords in what the game is made of (the files git keeps) and in the build (dist/): [{ file, what }].
export function secretsIn(dir) {
  const tracked = B.isGitRepo(dir) ? (gitOut(dir, ['ls-files']) || '').split('\n').filter(Boolean) : [...walk(dir)]
  const built = existsSync(join(dir, 'dist')) ? [...walk(dir, 'dist')] : []
  const found = []
  for (const f of [...new Set([...tracked, ...built])]) {
    if (/(^|\/)\.env(\.[\w-]+)?$/.test(f) && !/\.example$|\.sample$/.test(f)) { found.push({ file: f, what: 'an .env file (secrets belong outside the repo)' }); continue }
    if (!TEXT_FILE.test(f) || /^(tests?|e2e)\//.test(f)) continue
    let text = ''
    try { if (statSync(join(dir, f)).size > 2_000_000) continue; text = readFileSync(join(dir, f), 'utf8') } catch (e) { continue }
    for (const [re, what] of SECRETS) if (re.test(text)) { found.push({ file: f, what }); break }
  }
  return found
}
// Every font, sound and picture in the game has a credits.json entry with a licence (stand-ins too: what they are).
export function unlicensed(dir) {
  let credits = []
  try { credits = JSON.parse(readIn(dir, 'content/credits.json') || '[]') } catch (e) { return ['content/credits.json can\'t be read'] }
  const entries = (Array.isArray(credits) ? credits : Array.isArray(credits && credits.entries) ? credits.entries : []).filter(e => e && typeof e === 'object')
  const files = ['public', 'src', 'assets', 'content'].flatMap(top => [...walk(dir, top)]).filter(f => ASSET.test(f))
  return files.filter(f => !entries.some(e => clean(e.licence || e.license) && [].concat(e.paths || []).some(p => p && (f === p || f.startsWith(String(p).replace(/\/?$/, '/'))))))
}
export async function safety(dir, script = loadScript()) {
  const rec = recordOf(dir)
  const stage = stageOf(rec.stage)
  const secrets = secretsIn(dir)
  const files = unlicensed(dir)
  let deps = []
  if (existsSync(join(dir, 'package-lock.json'))) {
    const d = (await loadTool('deps-check')).checkDeps(dir)
    deps = (d.refusals || []).map(([t]) => t.split('\n')[0])
  }
  const lines = [
    secrets.length ? `✗ passwords or keys in the build: ${secrets.map(s => `${s.what} in ${s.file}`).join('; ')}` : '✓ no passwords or keys in the build',
    files.length || deps.length ? `✗ not licensed for this use yet: ${[...files.slice(0, 6), ...deps].join(', ')}${files.length > 6 ? ` and ${files.length - 6} more` : ''}` : '✓ every font, sound and picture is licensed for this use',
  ]
  let later = ''
  const open = []
  if (stage.rank >= 2) {
    // Beta and 1.0: the privacy page, the store's age and data forms and a full security review are lines of the stage's
    // release checklist (release-check.mjs), each ticked by the creative
    const rc = await loadTool('release-check')
    const list = rc.readChecklist(readIn(dir, rc.checkFile(stage.key)) || '')
    for (const [what, re] of [['a privacy page', /privacy/i], ['the store age and data forms', /age|data|rating/i], ['a full security review', /security/i]]) {
      const l = list.find(x => re.test(x.label))
      const ok = l && l.ticked && l.filled
      if (!ok) open.push(what)
      lines.push(`${ok ? '✓' : '✗'} ${what}`)
    }
  } else later = 'Beta and 1.0 add: a privacy page, store age and data forms, a full security review'
  write(dir, SAY.safety, line('deliver.safety', { stage: stage.name, checks: lines.join('\n'), later }, script) + '\n')
  const problems = [...secrets.map(s => `${s.what} in ${s.file}: take it out (a secret belongs in the host's settings, never in the game)`), ...files.map(f => `${f} has no licence in content/credits.json`), ...deps, ...open.map(x => `${x} isn't done (${`.planning/archive/release-checks/${stage.key}.md`})`)]
  rec.safety = { secrets, unlicensed: files, deps, open }
  saveRecord(dir, rec)
  return problems
}

// ---- 5.4 Build & Share ----
// The host on record: STATE.md's "Release:" line and "Live:" URL (the same lines /deliver and live-check.mjs read).
export function hostOf(dir) {
  const text = readIn(dir, STATE_MD) || ''
  const release = ((text.match(/^[-\s]*\*{0,2}Release:\*{0,2}[ \t]*([^\n]*)/m) || [])[1] || '').trim()
  const live = ((text.match(/\bLive:\*{0,2}[ \t]*(https?:\/\/[^\s)>,`]+)/) || [])[1] || '').replace(/[*.,;:'"\]]+$/, '')
  return { release, live, none: !release || /^(none|not set up)\b/i.test(release) || /blocked\s*:/i.test(release) }
}
const shots = dir => { try { return readdirSync(join(dir, '.planning', 'screens')).filter(f => /\.png$/i.test(f)) } catch (e) { return [] } }
export function localLink(dir) {
  for (const f of ['dist/index.html', 'index.html']) if (existsSync(join(dir, f))) return pathToFileURL(resolve(dir, f)).href
  const scripts = (readJson(dir, 'package.json') || {}).scripts || {}
  return scripts.dev ? '"npm run dev" in the project folder' : scripts.play ? '"npm run play" in the project folder' : 'the project folder'
}
export function build(dir, script = loadScript()) {
  const rec = recordOf(dir)
  const stage = stageOf(rec.stage)
  const scripts = (readJson(dir, 'package.json') || {}).scripts || {}
  if (scripts.build) {
    const b = B.runIn(dir, ['npm', 'run', 'build'], B.testLimitMs(dir))
    if (b.exitCode !== 0 || b.timedOut) throw new Error(`the build fails: ${B.suiteWhy(b)}`)
  }
  const host = hostOf(dir)
  const s = shots(dir)
  const tested = s.some(f => /phone/i.test(f)) && s.some(f => /desktop/i.test(f)) ? 'phone and desktop' : 'desktop'
  const share = host.none || !host.live ? `no place to share it yet (${host.release ? `Release: ${host.release}` : 'no "Release:" line in .planning/STATE.md'})` : host.live
  rec.build = { local: localLink(dir), share, tested, host }
  saveRecord(dir, rec)
  write(dir, SAY.build, line('deliver.build', { stage: stage.key, tested, local: rec.build.local, share }, script) + '\n')
  return rec.build
}
// "Not yet": what's missing goes on the roadmap (in the creative's words), and it's back to Develop.
export function notYet(dir, words, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const what = clean(words)
  if (!what) throw new Error('what\'s missing is empty: the creative\'s own words go on the roadmap')
  const name = what.split(/[.!?;]/)[0].split(' ').slice(0, 7).join(' ')
  const out = addFeature(readIn(dir, ROADMAP) || '', rec.milestone, { type: '✨', name, description: what, scope: `must:${stageOf(rec.stage).key}` })
  write(dir, ROADMAP, out.text)
  rec.notYet = { what, id: out.id }
  back(dir, rec, `add what's missing: ${what}`, script, now)
  return out.id
}

// The creative's own "Share it": the latest answer to the share gate in this stage's journal, given after this run's
// build card. Nothing else counts (a test answer, an auto run carrying on, an answer from an earlier delivery).
export function shareAnswer(dir) {
  const js = (readIn(dir, '.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
  let from = -1
  js.forEach((j, i) => { if (j.ev === 'step.done' && j.step === 'build') from = i })
  if (from < 0) return null
  const answers = js.slice(from).filter(j => j.ev === 'gate.answer' && j.step === 'share')
  return answers.length ? answers[answers.length - 1].answer : null
}

// In a BMUZ test run, a push may only go to a folder on this machine: nothing real is ever reached.
const isLocalRemote = url => !!url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url.replace(/^file:\/\//i, '')) && !/^[\w.-]+@[\w.-]+:/.test(url)

// STATE.md's lines a release needs (release.mjs reads them): the Log line, ▶ RESUME HERE naming the tag, Stage,
// and what was checked. Hand edits elsewhere are kept; a line is changed in place or added to its section.
export function stateFor(text, { game, tag, stage, milestone, head, when = day() }) {
  let t = nl(text).trim() ? nl(text) : `# ${game || 'The game'} — State\n\n## ▶ RESUME HERE\n\n## Where we are\n\n## Key facts\n\n## Log\n`
  const section = (name, body) => {
    const re = new RegExp(`(^## ${name}[^\\n]*\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm')
    if (re.test(t)) t = t.replace(re, (all, h, b) => h + body(b))
    else t = `${t.replace(/\n*$/, '\n')}\n## ${name}\n${body('')}`
  }
  const setKey = (b, key, value) => {
    const re = new RegExp(`^([-\\s]*\\*{0,2}${key}:\\*{0,2})[ \\t]*[^\\n]*$`, 'm')
    return re.test(b) ? b.replace(re, `$1 ${value}`) : `- ${key}: ${value}\n${b.replace(/^\n+/, '')}`
  }
  section('▶ RESUME HERE', () => `Released ${tag} (${stage}: ${milestone}) — next: playtest notes, then Develop (Plan the Sprint)\n\n`)
  section('Where we are', b => setKey(b, 'Stage', 'deliver'))
  // (what Deliver checked: Develop's separate reviewer read every feature; 5.3 checked keys and licences. The full
  // security review is a Beta / 1.0 checklist line, ticked by the creative.)
  section('Key facts', b => setKey(setKey(b, 'Reviewed through', `${head} — BMUZ Develop: every feature read by a separate reviewer`), 'Security reviewed', `${head} — BMUZ Deliver 5.3 (${stage}): no keys in the build, every asset licensed`))
  // (review fix 3: one Log line per release, however many tries it takes)
  section('Log', b => (b.includes(`Released ${tag}:`) ? b : `- ${when} — Released ${tag}: ${milestone} (${stage})\n${b.replace(/^\n+/, '')}`))
  return t.replace(/\n{3,}/g, '\n\n')
}
// The patch notes (release.mjs wants them finished, with Highlights, in the player's words): the milestone's goal and
// the features it delivers, as the roadmap and the sprint's plan cards say them.
export function notesFor(dir, rec, version) {
  const rm = readIn(dir, ROADMAP) || ''
  const m = milestoneByName(rm, rec.milestone)
  const goal = ((S.readRoadmap(rm).lines[(m ? m.line : -2) + 1] || '').match(/^Goal:\s*(.+)$/) || [])[1]
  const feats = (m ? m.features : []).filter(f => f.state === '✅' && f.type !== '❓')
  const say = t => clean(t).replace(/\b[FB]\d{2,3}\b:?\s*/g, '').replace(/\b[\w-]+\.(?:tsx?|jsx?|mjs|cjs|json|css|html)\b/g, '').trim()
  const high = `${rec.milestone}${goal ? `: ${say(goal)}` : ''}.`.replace(/\.\.$/, '.')
  return [`# v${version}`, '', '## Highlights', high, '', '## New', ...feats.map(f => `- ${say(f.name)}${f.description ? `: ${say(f.description)}` : ''}`), ''].join('\n')
}
const nextVersion = (v, kind) => {
  const p = String(v || '0.0.0').split('.').map(Number)
  const at = { update: 2, milestone: 1, stage: 1, major: 0 }[kind]
  p[at] += 1
  for (let i = at + 1; i < 3; i++) p[i] = 0
  return p.join('.')
}

// The release scripts refuse to go on while git shows files nobody committed. The engine's own files are such files in
// a project that doesn't ignore them: its record (.bmuz/) and, before it was ever committed, bmuz.json. While the
// scripts run they are hidden from git on this machine only (.git/info/exclude, put back as it was after), never by
// changing the project's .gitignore. A bmuz.json git already keeps is committed as the engine left it (a stage move
// rewrites it).
function withBmuzHidden(dir, fn) {
  const gitDir = gitOut(dir, ['rev-parse', '--git-dir'])
  const file = gitDir ? join(resolve(dir, gitDir), 'info', 'exclude') : null
  const before = file && existsSync(file) ? readFileSync(file, 'utf8') : null
  const tracked = gitOut(dir, ['ls-files', '--', 'bmuz.json']) === 'bmuz.json'
  if (tracked && B.dirtyFiles(dir).includes('bmuz.json')) B.commitFiles(dir, ['bmuz.json'], 'BMUZ: the stage as the engine left it')
  const have = (before || '').split('\n').map(l => l.trim())
  const hide = ['/.bmuz/', ...(tracked ? [] : ['/bmuz.json'])].filter(p => !have.includes(p))
  if (file && hide.length) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${(before || '').replace(/\n*$/, '\n')}${hide.join('\n')}\n`) }
  try { return fn() } finally { if (file) { if (before === null) writeFileSync(file, ''); else writeFileSync(file, before) } }
}

// 5.4 "Share it": merge the work branch (merge.mjs), the records, version + tag (release.mjs), the smoke pass, push,
// the platform's deploy, the live check (live-check.mjs; rollback.mjs to the last good tag when it fails). Each phase is
// recorded, so a try after a failure carries on where the last one stopped.
export function publish(dir, script = loadScript(), now = new Date()) {
  return withBmuzHidden(dir, () => publishNow(dir, script, now))
}
function publishNow(dir, script, now) {
  const rec = recordOf(dir)
  const answer = shareAnswer(dir)
  if (answer !== 'Share it') throw new Error(`nothing is shared without the creative's own "Share it" at Build & Share (${answer ? `they answered "${answer}"` : 'no answer in this run'})`)
  if (!B.isGitRepo(dir)) throw new Error('the project isn\'t a git repository, so there is nothing to merge, version or push')
  const host = hostOf(dir)
  if (host.none || !host.live) throw new Error(`there is no place to share it yet: .planning/STATE.md needs a "Release: <platform>" line and a "Live: https://…" link (the platform's release recipe sets them up the first time)`)
  const remote = gitOut(dir, ['remote', 'get-url', 'origin'])
  if (process.env.BMUZ_TEST === '1' && remote && !isLocalRemote(remote)) throw new Error(`a test run pushes only to a folder on this machine, and origin is ${remote}`)
  const stage = stageOf(rec.stage)
  const main = mainOf(dir)
  const p = rec.publish || (rec.publish = {})
  // (review fix 1: once the new build failed its live check and the last good version was put back, this run never
  // says the new build is live — a later live check would only find the old version, live again)
  const rolledBackLine = () => `The new build (${p.tag}) failed its live check, so I put ${p.rolledBack} back; that's what's live now.`
  if (p.rolledBack) throw new Error(`${rolledBackLine()} Fix what the check found in Develop, then deliver again.`)
  const step = (name, r) => { if (!r.ok) { saveRecord(dir, rec); throw new Error(`${name}: ${r.out.slice(-900)}`) } return r }
  const scripts = (readJson(dir, 'package.json') || {}).scripts || {}
  // 1. the work branch into main
  if (!p.merged) {
    const branch = rec.branch || (/^dev\//.test(branchNow(dir) || '') ? branchNow(dir) : null)
    if (branch && branch !== main && gitOut(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) !== null) step(`merging ${branch}`, runTool(dir, 'merge', [branch]))
    p.merged = true
    saveRecord(dir, rec)
  }
  // 2. the records and 3. version + tag
  if (!p.tag) {
    const version = (readJson(dir, 'version.json') || {}).version
    if (!version) write(dir, 'version.json', JSON.stringify({ name: G.gameName(readIn(dir, G.GDD) || '') || 'game', version: '0.0.0', build: 0, history: [] }, null, 2) + '\n')
    const next = nextVersion((readJson(dir, 'version.json') || {}).version, stage.kind)
    const tag = `v${next}`
    const head = gitOut(dir, ['rev-parse', '--short', 'HEAD'])
    if (!version) B.commitFiles(dir, ['version.json'], 'version.json for the first release')
    // (review fix 3: release.mjs reads the release's marks — STATE's Log line, ▶ RESUME HERE, the milestone ✅ released,
    // the notes — before it changes anything, so they are written for it; when it refuses, every one is put back as it
    // was, and nothing says "released")
    const notes = `.planning/archive/releases/${tag}.md`
    const planFiles = [STATE_MD, ROADMAP, S.SPRINT, notes, G.PAGE]
    const kept = Object.fromEntries(planFiles.map(f => [f, readIn(dir, f)]))
    const putBack = () => { for (const [f, t] of Object.entries(kept)) { if (t === null) rmSync(join(dir, f), { force: true }); else write(dir, f, t) } }
    write(dir, STATE_MD, stateFor(readIn(dir, STATE_MD) || '', { game: G.gameName(readIn(dir, G.GDD) || ''), tag, stage: stage.name, milestone: rec.milestone, head, when: day(now) }))
    if (!readIn(dir, notes)) write(dir, notes, notesFor(dir, rec, next))
    write(dir, ROADMAP, markReleased(readIn(dir, ROADMAP) || '', rec.milestone, tag, day(now)))
    // (the finished sprint is archived already — Develop's look-back did it — so SPRINT.md holds no running sprint)
    const sprint = readIn(dir, S.SPRINT)
    const archived = sprint && existsSync(join(dir, S.ARCHIVE)) && readdirSync(join(dir, S.ARCHIVE)).some(f => readIn(dir, `${S.ARCHIVE}/${f}`) === sprint)
    if (archived) write(dir, S.SPRINT, `# No sprint running\nThe last sprint is archived in ${S.ARCHIVE}/. Develop plans the next one.\n`)
    G.writePage(dir, now)
    const args = [stage.kind, `${rec.milestone}: the ${stage.key} build`, ...(stage.kind === 'stage' ? [`--stage=${stage.key}`] : [])]
    const made = runTool(dir, 'release', args)
    if (!made.ok) { putBack(); step(`version ${tag}`, made) }
    p.tag = tag
    p.version = next
    saveRecord(dir, rec)
  }
  // 4. the smoke pass, when the project has one (the game loads, one turn plays, the console is clean)
  if (!p.smoke && (scripts.smoke || scripts['e2e:smoke'])) {
    step('the smoke pass', runTool(dir, 'smoke-pass'))
    B.commitFiles(dir, ['.planning/smoke-pass'], `Smoke pass for ${p.tag}`)
    p.smoke = true
    saveRecord(dir, rec)
  }
  // 5. push (the deploy for a host that builds from the repo) and 6. the platform's own deploy step
  const pushIt = () => {
    if (!remote) return
    const r = git(dir, ['push', '-q', '--follow-tags', 'origin', main])
    if (r.status !== 0) { saveRecord(dir, rec); throw new Error(`pushing ${main}: ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`) }
  }
  const deployIt = () => { if (scripts.deploy) step('the deploy', (({ exitCode, out }) => ({ ok: exitCode === 0, out }))(B.runIn(dir, ['npm', 'run', 'deploy'], 540000))) }
  if (!p.pushed) { pushIt(); p.pushed = true; saveRecord(dir, rec) }
  if (!p.deployed) { deployIt(); p.deployed = true; saveRecord(dir, rec) }
  // 7. is it really live? A failed check puts the last good version back (rollback.mjs), live again, and says so.
  if (!p.live) {
    const lc = runTool(dir, 'live-check')
    if (!lc.ok) {
      const good = tags(dir).filter(t => t !== p.tag).sort((a, b) => cmpVersion(b, a))[0]
      if (good) {
        const rb = runTool(dir, 'rollback', [good, `the live check of ${p.tag} failed`])
        if (rb.ok) { pushIt(); deployIt() }
        p.rolledBack = rb.ok ? good : null
        saveRecord(dir, rec)
        if (rb.ok) throw new Error(`${rolledBackLine()} What the check found: ${lc.out.slice(-500)}`)
        throw new Error(`the live check failed for ${p.tag}: ${lc.out.slice(-500)}. Rolling back to ${good} failed too: ${rb.out.slice(-300)}`)
      }
      saveRecord(dir, rec)
      throw new Error(`the live check failed for ${p.tag}: ${lc.out.slice(-600)}. This is the first release, so there is no earlier version to put back`)
    }
    B.commitFiles(dir, ['.planning/live-pass', STATE_MD], `Live check for ${p.tag}`)
    pushIt()
    p.live = true
    saveRecord(dir, rec)
  }
  const link = hostOf(dir).live
  write(dir, SAY.live, line('deliver.live', { link, version: p.version }, script) + '\n')
  const hist = readJson(dir, HISTORY) || {}
  if (!listOf(hist.builds).some(b => b.tag === p.tag)) write(dir, HISTORY, JSON.stringify({ ...hist, builds: [...listOf(hist.builds), { tag: p.tag, stage: stage.key, milestone: rec.milestone, day: day(now), link }] }, null, 2) + '\n')
  return { tag: p.tag, link }
}
const cmpVersion = (a, b) => { const x = a.slice(1).split('.').map(Number); const y = b.slice(1).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0 }

// ---- 5.5 Playtest Notes ----
// The feelings the creative chose: GDD chapter 1's "The feeling:" lines.
export function feelingsOf(dir) {
  const text = M.unmarked ? M.unmarked(readIn(dir, G.GDD) || '') : readIn(dir, G.GDD) || ''
  return [...nl(text).matchAll(/^\*\*The feeling:\*\*\s*(.+)$/gm)].map(m => clean(m[1].split(' — ')[0]))
}
export const SEEN = ['seen ✓', 'partly', 'not seen']
const seenOf = w => { const s = clean(w).toLowerCase(); return /^not/.test(s) ? 'not seen' : /^partly/.test(s) ? 'partly' : /^seen/.test(s) ? 'seen ✓' : null }
export function notesProblem(dir, notes) {
  const n = notes && typeof notes === 'object' ? notes : null
  if (!n) return 'the notes must be an object: {"feelings": [{"feeling", "seen", "why"}], "tuning": [...], "bugs": [...], "questions": [...], "ideas": [...]}'
  const want = feelingsOf(dir)
  const got = listOf(n.feelings)
  const missing = want.filter(w => !got.some(g => clean(g && g.feeling).toLowerCase() === w.toLowerCase()))
  if (missing.length) return `each feeling from GDD chapter 1 is checked against the notes; missing: "${missing.join('", "')}"`
  const bad = got.filter(g => !seenOf(g && g.seen) || !clean(g && g.why))
  if (bad.length) return `each feeling needs "seen" (${SEEN.join(' / ')}) and "why" (what in the notes shows it): ${bad.map(g => clean(g && g.feeling)).join(', ')}`
  for (const k of ['tuning', 'questions', 'ideas']) if (n[k] !== undefined && !Array.isArray(n[k])) return `"${k}" must be a list`
  for (const b of listOf(n.bugs)) { const why = B.reportProblem(b); if (why) return `a bug: ${why}` }
  return null
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
export function notesWrite(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const st = readJson(dir, '.bmuz/state.json') || {}
  const n = ((st.resultsBy || {}).notes || {}).notes
  const why = notesProblem(dir, n)
  if (why) throw new Error(why)
  let text = readIn(dir, ROADMAP) || ''
  const m = S.currentMilestone(text)
  const stage = m && m.stage ? m.stage : stageOf(rec.stage).key
  const tuning = listOf(n.tuning).map(clean).filter(Boolean)
  const questions = listOf(n.questions).map(clean).filter(Boolean)
  const ideas = listOf(n.ideas).map(clean).filter(Boolean)
  for (const t of tuning) text = addFeature(text, m.name, { type: '✨', name: `Tuning: ${t.split(' ').slice(0, 6).join(' ')}`, description: t, scope: `should:${stage}` }).text
  for (const q of questions) text = addFeature(text, m.name, { type: '❓', name: `Rule question: ${q.split(' ').slice(0, 6).join(' ')}`, description: q, scope: `should:${stage}` }).text
  for (const i of ideas) text = S.addIdea(text, i, day(now)).text
  S.writePlan(dir, ROADMAP, text, `playtest notes for ${rec.publish && rec.publish.tag ? rec.publish.tag : rec.milestone}`)
  const bugs = listOf(n.bugs).map(b => B.addIn(dir, b, { where: `Deliver · Playtest Notes${rec.publish && rec.publish.tag ? ` (${rec.publish.tag})` : ''}` }))
  G.writePage(dir, now)
  const added = [tuning.length && plural(tuning.length, 'tuning task', 'tuning tasks'), bugs.length && plural(bugs.length, 'bug', 'bugs'), questions.length && plural(questions.length, 'rulebook question', 'rulebook questions'), ideas.length && plural(ideas.length, 'idea', 'ideas')].filter(Boolean)
  const addedWords = added.length ? (added.length > 1 ? `${added.slice(0, -1).join(', ')} and ${added[added.length - 1]}` : added[0]) : 'nothing new'
  const feelings = listOf(n.feelings).map(f => `"${clean(f.feeling)}": ${seenOf(f.seen)} — ${clean(f.why)}`)
  write(dir, SAY.notes, `${line('deliver.notes.feelings', { feelings }, script)}\n\n${line('deliver.notes.added', { added: addedWords }, script)}\n`)
  rec.notes = { tuning, bugs: bugs.map(b => b.id), questions, ideas }
  saveRecord(dir, rec)
  return { added: addedWords, bugs: bugs.map(b => b.id) }
}

// ---- The command line ----
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const [mode, a, b] = process.argv.slice(2)
  const dir = process.cwd()
  const say = (ok, text) => { console.log(text); process.exit(ok ? 0 : 1) }
  const results = r => JSON.stringify({ results: r })
  try {
    if (mode === 'prep') {
      const r = prep(dir)
      say(true, `✔ delivering ${r.rec.title} as a ${stageOf(r.rec.stage).name} build${r.first ? ' (the first time)' : ''}\n${results({ first: yes(r.first) })}`)
    } else if (mode === 'welcome') {
      welcome(dir)
      say(true, `✔ ${SAY.welcome}`)
    } else if (mode === 'check') {
      const r = await check(dir)
      say(true, `✔ ${SAY.check}: ${r.go ? 'ready' : `not ready: ${r.check.missing.join(', ')}`}\n${results({ missing: yes(!r.go) })}`)
    } else if (mode === 'choice') {
      const p = choiceProblem(dir, a, b)
      say(!p, p ? `✘ ${p}` : `✔ ${choiceOf(a)}`)
    } else if (mode === 'not-ready') {
      const r = notReady(dir, a)
      say(true, `✔ ${r.go ? 'moved to the next stage; ready now' : `back to Develop to ${r.back}`}`)
    } else if (mode === 'decide') {
      const r = await decide(dir)
      say(true, `✔ go: ${r.go} · placeholders to ask about: ${r.polish}\n${results(r)}`)
    } else if (mode === 'polish') {
      const r = polish(dir, a)
      say(true, `✔ ${r.go === 'yes' ? 'shipping it as it is' : `back to Develop to polish ${r.picked.join(', ')}`}\n${results({ go: r.go })}`)
    } else if (mode === 'safety') {
      const p = await safety(dir)
      say(!p.length, p.length ? `✘ Not safe to share yet: ${p.join('; ')}` : `✔ ${SAY.safety}`)
    } else if (mode === 'build') {
      const r = build(dir)
      say(true, `✔ ${SAY.build}: for you ${r.local} · to share ${r.share}`)
    } else if (mode === 'not-yet') {
      // (nothing said yet — the step runs only after "Not yet" — leaves the run as it is)
      write(dir, SAY.notyet, '')
      if (!clean(a)) say(true, `✔ nothing missing said\n${results({ go: yes(recordOf(dir).go) })}`)
      const id = notYet(dir, a)
      write(dir, SAY.notyet, readIn(dir, SAY.back) || '')
      say(true, `✔ ${id} on the roadmap; back to Develop\n${results({ go: 'no' })}`)
    } else if (mode === 'publish') {
      const r = publish(dir)
      say(true, `✔ ${r.tag} is live: ${r.link}`)
    } else if (mode === 'notes-check') {
      let n = null
      try { n = JSON.parse(a || 'null') } catch (e) { n = null }
      const p = notesProblem(dir, n)
      say(!p, p ? `✘ ${p}` : '✔ the notes are sorted')
    } else if (mode === 'notes-write') {
      const r = notesWrite(dir)
      say(true, `✔ added ${r.added} to the roadmap`)
    } else {
      say(false, '✘ use: node deliver.mjs prep | welcome | check | choice <answer> <auto|live> | not-ready <answer> | decide | polish <picked> | safety | build | not-yet <missing> | publish | notes-check <notes> | notes-write')
    }
  } catch (err) {
    say(false, `✘ ${String(err && err.message ? err.message : err).slice(0, 900)}`)
  }
}
