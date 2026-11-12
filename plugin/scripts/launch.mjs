// Release (F230; the approved script's Stage 6, framework .planning/research/bmuz-vision/bmuz-design-doc.html): 1.0
// goes public, one platform at a time, then first reactions and the look back.
// Platforms (the script's table): the web · itch.io · Steam · the phone app stores. Each one's requirements are
// researched fresh, with sources (the research flow + check-sources.mjs), never written from memory. The web and
// itch.io go live through their release recipes (~/.claude/config/bmuz/release/), and only after the creative's own
// "Release it" at that platform's gate. Steam and the phone stores need the creative's own accounts, money and art:
// BMUZ drafts the store page, walks them through it one step at a time, and marks it live only on their word and a
// link that checks out. BMUZ never submits to a store itself.
// The 1.0 release itself (merge, version, tag, push; the web's deploy, live check and rollback) is Deliver's
// (deliver.mjs publish), done once, by the first platform launched.
// The run's record is .bmuz/release/run.json (written only here); the lines BMUZ says are composed from the script and
// shown (.bmuz/release/say-*.md).
//
//   node launch.mjs where '<platforms>' <auto|live>   6.0's done-check: the picks, exactly the box's labels
//   node launch.mjs next                     the next platform ({"results": {platform, game, topic, fresh, page}})
//   node launch.mjs store                    6.1 Store & Launch: the requirements (sourced), done / needs you, the
//                                            store page drafted from the pitch (shown)
//   node launch.mjs page-check '<page>'      the store page's done-check: "keep" or the new page
//   node launch.mjs page-save                the creative's changes to the store page, saved
//   node launch.mjs not-yet '<what>'         "Not yet": what's missing on the roadmap; the platform waits
//   node launch.mjs launch                   "Release it": only with the creative's own journaled answer — the web and
//                                            itch.io go live and are checked; Steam / phone → the walk-through
//   node launch.mjs live-link '<link>' <auto|live>   the walk-through's done-check: their word, a link that answers
//   node launch.mjs marked-live              Steam / phone marked live (shown)
//   node launch.mjs more                     another platform to go? ({"results": {last, onward, at}})
//   node launch.mjs reactions-check '<r>'    6.2's done-check: every feeling of GDD chapter 1, the fixes sorted
//   node launch.mjs reactions-write          6.2 the fixes into an Update milestone, the bugs into BUGS.md (shown)
//   node launch.mjs lookback-check '<l>'     6.3's done-check: both lists
//   node launch.mjs lookback-write           6.3 the lessons kept; Develop when there's an update, else "it's out"
//   (run in the project folder)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as M from './marks.mjs'
import * as B from './bugs.mjs'
import * as S from './sprint.mjs'
import * as D from './deliver.mjs'
import { checkSources } from './check-sources.mjs'

export const DIR = '.bmuz/release'
export const RECORD = `${DIR}/run.json`
export const PAGE_NOW = `${DIR}/page.md`
export const SAY = { store: `${DIR}/say-store.md`, notyet: `${DIR}/say-notyet.md`, live: `${DIR}/say-live.md`, reactions: `${DIR}/say-reactions.md`, end: `${DIR}/say-end.md` }
export const RESEARCH_NOW = '.planning/research/release-now.md'
export const SUGGESTIONS = '.planning/bmuz-suggestions.md'
const ROADMAP = S.ROADMAP
const STATE_MD = D.STATE_MD

// The platforms, in the script's order. label: the box's option, word for word. topic: what the research looks up.
// page: it has a store page BMUZ drafts. walk: the creative does it on the store (BMUZ walks them through).
// recipe: the release recipe in ~/.claude/config/bmuz/release/ when one exists.
export const PLATFORMS = [
  { key: 'web', label: 'The web', name: 'the web', topic: 'a web game on its own public link (static hosting, like GitHub Pages)', page: false, walk: false, recipe: 'github-pages.md' },
  { key: 'itch', label: 'itch.io', name: 'itch.io', topic: 'itch.io (an HTML5 game played in the browser)', page: true, walk: false, recipe: 'itch.md' },
  { key: 'steam', label: 'Steam', name: 'Steam', topic: 'Steam (Steamworks)', page: true, walk: true, recipe: 'steam.md' },
  { key: 'phone', label: 'Phone app stores', name: 'the phone app stores', topic: 'the Apple App Store and Google Play', page: true, walk: true, recipe: 'phone-stores.md' },
]
export const platformOf = k => PLATFORMS.find(p => p.key === k || p.label === k) || null

const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const day = (now = new Date()) => now.toISOString().slice(0, 10)
const readIn = (dir, rel) => G.readFileIn(dir, rel)
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const readJson = (dir, rel) => { try { return JSON.parse(readIn(dir, rel) || 'null') } catch (e) { return null } }
const yes = b => (b ? 'yes' : 'no')
const isTest = () => process.env.BMUZ_TEST === '1'
const testAnswered = (dir, step) => isTest() && !!(readJson(dir, 'bmuz.json') || {}).testAnswers?.[step]
const journalOf = dir => (readIn(dir, '.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
const resultOf = (dir, step) => (((readJson(dir, '.bmuz/state.json') || {}).resultsBy || {})[step]) || {}

function line(id, slots, script = loadScript()) {
  const r = E.renderLine(script, id, slots)
  if (r.error) throw new Error(r.error)
  return r.text.replace(/\n+$/, '')
}
export const readRecord = dir => readJson(dir, RECORD)
const saveRecord = (dir, rec) => write(dir, RECORD, JSON.stringify(rec, null, 2) + '\n')
function recordOf(dir) {
  const rec = readRecord(dir)
  if (!rec || !Array.isArray(rec.platforms)) throw new Error(`there is no release yet (${RECORD} is missing): "Where should it go?" comes first`)
  return rec
}
const current = rec => {
  const p = platformOf(rec.current)
  if (!p) throw new Error('no platform is being released right now: "next" comes first')
  return p
}
// Files launch.mjs writes in the project (the research, the store pages, the plan files), committed as it writes them,
// so the 1.0 release never finds them as somebody's unsaved changes — unless the creative has unsaved changes there.
function commitOwn(dir, files, message) {
  if (!B.isGitRepo(dir)) return
  try { B.commitFiles(dir, files, message) } catch (e) { /* a failed commit never stops the run */ }
}
function writeOwn(dir, rel, text, message) {
  const theirs = B.isGitRepo(dir) && B.dirtyFiles(dir).includes(rel)
  write(dir, rel, text)
  if (!theirs) commitOwn(dir, [rel], message)
}
const gameOf = dir => G.gameName(readIn(dir, G.GDD) || '') || (readJson(dir, 'version.json') || {}).name || 'the game'

// ---- 6.0 Where should it go? ----
// The picks: exactly the box's labels (pick any). Live, they must be what the creative picked in this try's box, as the
// journal has it. An auto run may pick (nothing goes public before a gate it stops at), but says so in its asks.
export function picksOf(words) {
  let list = words
  if (typeof list === 'string') { try { list = JSON.parse(list) } catch (e) { list = list.split(/\s*,\s*/) } }
  return listOf(list).map(x => clean(x && typeof x === 'object' ? x.label ?? x.text : x)).filter(Boolean)
}
// The labels the creative picked in the where box, from the journal (the question as asked, its answer after it).
export function wherePicked(dir) {
  const js = journalOf(dir)
  let from = -1
  js.forEach((j, i) => { if (j.ev === 'step.start' && j.step === 'where') from = i })
  if (from < 0) return null
  const rest = js.slice(from)
  const box = rest.filter(j => j.ev === 'line' && j.line === 'release.where' && j.box && j.box.question).pop()
  if (!box) return null
  const asked = `"${box.box.question}"="`
  const t = rest.filter(j => j.ev === 'answer' && j.step === 'where').map(j => String(j.text || '')).filter(x => x.includes(asked)).pop()
  if (!t) return null
  const said = t.slice(t.lastIndexOf(asked) + asked.length)
  return PLATFORMS.map(p => p.label).filter(l => said.startsWith(l) || said.includes(`, ${l}`) || said.includes(`,${l}`))
}
export function whereProblem(dir, words, mode) {
  const picks = picksOf(words)
  if (!picks.length) return 'pick at least one place: "The web", "itch.io", "Steam" or "Phone app stores"'
  const unknown = picks.filter(x => !platformOf(x))
  if (unknown.length) return `"${unknown.join('", "')}" isn't one of the box's options (The web, itch.io, Steam, Phone app stores)`
  if (mode !== 'auto') {
    const picked = wherePicked(dir)
    if (!picked) return 'there is no answer to "Where should it go? (pick any)" in this try: ask the box, and hand back the options the creative picked'
    if (picked.slice().sort().join('|') !== picks.slice().sort().join('|')) return `the creative picked ${picked.join(', ')}, not ${picks.join(', ')}`
  }
  return null
}

// ---- The loop: the next platform ----
// The 1.0 build Deliver made, or a 1.0 already released: Release starts from it.
export function readyFor(dir) {
  const d = D.readRecord(dir)
  if (d && d.stage === '1.0' && d.build) return d
  throw new Error('Release starts once Deliver has made the 1.0 build (its Build & Share card): finish 1.0 in Develop, then Deliver')
}
// A research report is fresh when it was written today: stores change their rules, so an older one is researched again.
export const researchFile = key => `.planning/research/release-${key}.md`
export function isFresh(dir, rel, now = new Date()) {
  const p = join(dir, rel)
  return existsSync(p) && day(statSync(p).mtime) === day(now)
}
export function next(dir, now = new Date()) {
  readyFor(dir)
  let rec = readRecord(dir)
  const picks = picksOf(resultOf(dir, 'where').platforms).map(x => platformOf(x)).filter(Boolean).map(p => p.key)
  // (the creative answered "Where should it go?" in this run: those platforms, the ones already live kept as they are)
  if (picks.length) {
    const per = (rec && rec.per) || {}
    for (const k of picks) if (per[k] && per[k].status !== 'live') per[k] = { status: 'to do' }
    rec = { game: gameOf(dir), started: (rec && rec.started) || day(now), platforms: picks, per: Object.fromEntries(picks.map(k => [k, per[k] || { status: 'to do' }])), current: null }
  }
  if (!rec || !Array.isArray(rec.platforms) || !rec.platforms.length) throw new Error('no platforms picked yet: "Where should it go?" comes first (say "bmuz stage release")')
  let todo = rec.platforms.filter(k => rec.per[k].status === 'to do')
  // (back after a "Not yet": the platforms that waited are taken up again)
  if (!todo.length) {
    for (const k of rec.platforms) if (rec.per[k].status === 'waiting') rec.per[k] = { ...rec.per[k], status: 'to do' }
    todo = rec.platforms.filter(k => rec.per[k].status === 'to do')
  }
  if (!todo.length) throw new Error(`every platform picked is live already (${rec.platforms.map(k => platformOf(k).name).join(', ')}): say "bmuz stage release" to pick another`)
  const p = platformOf(todo[0])
  rec.current = p.key
  rec.game = gameOf(dir)
  saveRecord(dir, rec)
  // (a research report from an earlier platform's run is never read as this one's)
  rmSync(join(dir, RESEARCH_NOW), { force: true })
  return { platform: p.name, game: rec.game, topic: p.topic, fresh: yes(!isFresh(dir, researchFile(p.key), now)), page: yes(p.page) }
}

// ---- 6.1 Store & Launch ----
// The requirements: the research report's "Requirements" bricks, each one sourced ("- <need> · <details> [2] (one
// source)"), without the source marks.
export function requirementsOf(text) {
  const lines = nl(text).split('\n')
  const at = lines.findIndex(l => /^###\s+Requirements\s*$/.test(l))
  if (at < 0) return []
  const out = []
  for (let i = at + 1; i < lines.length && !/^#{2,3}\s/.test(lines[i]); i++) {
    const m = lines[i].match(/^- (.+)$/)
    if (!m || /^none found/i.test(m[1])) continue
    out.push(clean(m[1].replace(/\s*\[\d+\]/g, '').replace(/\s*\((several sources|one source|interpretation only)\)\s*$/i, '')))
  }
  return out
}
// Done or needs you: what the project already has (the 1.0 build, a host, the store page drafted, screenshots, Deliver's
// privacy page and store forms); everything else — accounts, fees, art, a trailer, the store's review — needs the
// creative. A requirement this can't place needs the creative: never claimed done on a guess.
export function sortNeeds(dir, needs, p, deliver = D.readRecord(dir) || {}) {
  const shots = (() => { try { return readdirSync(join(dir, '.planning', 'screens')).filter(f => /\.png$/i.test(f)).length } catch (e) { return 0 } })()
  const host = D.hostOf(dir)
  const open = listOf(deliver.safety && deliver.safety.open)
  const rules = [
    [/\b(account|fee|pay|tax|bank|developer program|steamworks|sign up|register)\b/i, false],
    [/\b(capsule|cover|icon|key art|header image|banner|trailer|video|logo)\b/i, false],
    [/\b(review|approval|submit|release date|coming soon|wishlist)\b/i, false],
    [/\b(store page|page text|description|tagline|short description|about|listing)\b/i, p.page],
    [/\bscreenshots?\b/i, shots >= 3],
    [/\bprivacy\b/i, deliver.stage === '1.0' && !open.includes('a privacy page')],
    [/\b(age rating|rating|questionnaire|data safety|data form|content descriptors?)\b/i, deliver.stage === '1.0' && !open.includes('the store age and data forms')],
    [/\b(build|upload|html|zip|bundle|deploy|files?|version)\b/i, !!deliver.build],
    [/\b(host|hosting|https|domain|public link|live check)\b/i, !!host.live],
  ]
  const done = []
  const you = []
  for (const n of needs) {
    const rule = rules.find(([re]) => re.test(n))
    ;(rule && rule[1] ? done : you).push(n)
  }
  return { done, you }
}
// The store page, written from the pitch (GDD chapters 1–5), in the player's words. A page already there is kept (the
// creative may have changed it).
export const pageFile = key => `.planning/release/${key}-page.md`
export function draftPage(dir, p) {
  const gdd = G.readGdd(readIn(dir, G.GDD) || '')
  const ch = n => clean((gdd[n] || {}).text || '').replace(/\*\*/g, '')
  const game = gameOf(dir)
  const feeling = (ch(1).match(/The feeling:\s*(.+?)(?: — |The moment:|$)/) || [])[1] || ''
  return [
    `# ${game} — ${p.name} page`,
    '',
    `**${game}**`,
    ch(3),
    '',
    ...(ch(4) ? [`**How it plays:** ${ch(4)}`] : []),
    ...(feeling ? [`**What it feels like:** ${clean(feeling)}`] : []),
    ...(ch(5) ? [`**Where you play:** ${ch(5)}`] : []),
    '',
  ].join('\n')
}
// The release recipe's "Every release" steps, when one exists (read where it lives, never copied).
export const recipesDir = () => process.env.BMUZ_RECIPES || join(homedir(), '.claude', 'config', 'bmuz', 'release')
export function recipeOf(p) {
  const f = p.recipe ? join(recipesDir(), p.recipe) : null
  if (!f || !existsSync(f)) return null
  const text = nl(readFileSync(f, 'utf8'))
  const body = (text.split(/^## Every release\s*$/m)[1] || '').split(/^## /m)[0]
  return { file: f, steps: body.split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => clean(l.replace(/^\d+\.\s*/, ''))) }
}
// The walk-through for a store BMUZ never submits to: one step per thing that needs the creative, the recipe's steps
// when there is one, then the store's own review and the release.
export const stepsFile = key => `.planning/release/${key}-steps.md`
export function walkSteps(p, you, recipe) {
  return [...you.map(n => `Get this ready: ${n}`), ...(recipe ? recipe.steps : []), `Submit ${p.name === 'the phone app stores' ? 'the game to each store' : 'the game'} for review, and wait for the OK`, `When it is approved, release it on ${p.name}`]
}

export async function store(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const p = current(rec)
  // (a fresh report from this run's research: kept under the platform's own name)
  const now_ = readIn(dir, RESEARCH_NOW)
  if (now_ !== null) {
    const title = (nl(now_).match(/^# .+$/m) || [''])[0]
    if (!title.includes(p.topic)) throw new Error(`${RESEARCH_NOW} is about "${title.replace(/^# /, '')}", not ${p.topic}`)
    write(dir, researchFile(p.key), now_)
    rmSync(join(dir, RESEARCH_NOW), { force: true })
  }
  const text = readIn(dir, researchFile(p.key))
  if (!text) throw new Error(`there is no research on ${p.name} (${researchFile(p.key)}): its requirements are researched fresh, never written from memory`)
  if (!isFresh(dir, researchFile(p.key), now)) throw new Error(`the research on ${p.name} (${researchFile(p.key)}) is from before today: stores change their rules, so it is researched again`)
  const problems = await checkSources(text, { offline: process.env.BMUZ_SOURCES_OFFLINE === '1' })
  if (problems.length) throw new Error(`the research on ${p.name} isn't sourced well enough: ${problems.slice(0, 4).join('; ')}`)
  const needs = requirementsOf(text)
  if (!needs.length) throw new Error(`the research on ${p.name} found no requirements (${researchFile(p.key)}, "Requirements"): it is researched again`)
  const own = [researchFile(p.key)]
  if (p.page && !readIn(dir, pageFile(p.key))) { write(dir, pageFile(p.key), draftPage(dir, p)); own.push(pageFile(p.key)) }
  const { done, you } = sortNeeds(dir, needs, p)
  const recipe = recipeOf(p)
  if (p.walk) { write(dir, stepsFile(p.key), [`# ${rec.game} on ${p.name}: the steps`, '', ...walkSteps(p, you, recipe).map((s, i) => `${i + 1}. ${s}`), ''].join('\n')); own.push(stepsFile(p.key)) }
  commitOwn(dir, own, `Release: ${p.name}'s requirements researched (${day(now)})`)
  if (p.page) write(dir, PAGE_NOW, readIn(dir, pageFile(p.key)))
  rec.per[p.key] = { ...rec.per[p.key], status: 'to do', needs, done, you, research: researchFile(p.key), recipe: recipe ? recipe.file : null, page: p.page ? pageFile(p.key) : null }
  saveRecord(dir, rec)
  write(dir, SAY.store, line('release.store', { platform: p.name, needs: needs.join('; '), done: done.length ? done.join(' · ') : 'nothing yet', you: you.length ? you.join(' · ') : 'nothing' }, script) + '\n')
  return { go: 'yes', page: yes(p.page) }
}

// The store page's answer: "keep" (as drafted) or the page as the creative wants it.
export function pageProblem(page) {
  if (!clean(page)) return 'hand back "keep" when the creative is happy with the draft, else the whole page as they want it'
  return null
}
export function pageSave(dir) {
  const rec = recordOf(dir)
  const p = current(rec)
  const page = String(resultOf(dir, 'page').page ?? '')
  if (/^keep\.?$/i.test(clean(page)) || !clean(page)) return { changed: false }
  writeOwn(dir, pageFile(p.key), nl(page).replace(/\n*$/, '\n'), `Release: the ${p.name} page, as the creative wants it`)
  return { changed: true }
}

// "Not yet": what's missing goes on the roadmap (in the creative's words, under the milestone being released); the
// platform waits, and the run goes on to the next one.
export function notYet(dir, words, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const p = current(rec)
  const what = clean(words).replace(/[.!?]+$/, '')
  if (!what) throw new Error('what\'s missing is empty: the creative\'s own words go on the roadmap')
  const rm = readIn(dir, ROADMAP) || ''
  const m = D.deliveredMilestone(rm) || S.currentMilestone(rm)
  if (m) S.writePlan(dir, ROADMAP, D.addFeature(rm, m.name, { type: '✨', name: `Release on ${p.name}: ${what.split(' ').slice(0, 6).join(' ')}`, description: what, scope: 'must:1.0' }).text, `${p.name} waits: ${what}`)
  rec.per[p.key] = { ...rec.per[p.key], status: 'waiting', what, since: day(now) }
  saveRecord(dir, rec)
  write(dir, SAY.notyet, line('release.notyet', { platform: p.name, what }, script) + '\n')
  return rec.per[p.key]
}

// ---- "Release it" ----
// The creative's own "Release it": the latest answer to this platform's gate in this run's journal, after its Store &
// Launch card. Nothing else counts (an auto run never answers a gate; a test's answers are never a gate's).
export function releaseAnswer(dir) {
  const js = journalOf(dir)
  let from = -1
  js.forEach((j, i) => { if (j.ev === 'step.done' && j.step === 'store') from = i })
  if (from < 0) return null
  const answers = js.slice(from).filter(j => j.ev === 'gate.answer' && j.step === 'gate')
  return answers.length ? answers[answers.length - 1].answer : null
}
// A link that answers from outside: an HTTP 200 whose page names the game (or the version). In a test run, only a page
// on this machine: nothing real is ever reached.
const isLocalLink = url => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)
export async function linkCheck(url, want = []) {
  if (!/^https?:\/\/\S+$/i.test(String(url || ''))) return `"${clean(url)}" isn't a link (https://…)`
  if (isTest() && !isLocalLink(url)) return `a test run checks only pages on this machine, not ${url}`
  let res
  let last = ''
  // (3 tries: a dropped connection is no answer yet)
  for (let i = 0; i < 3 && !res; i++) {
    try { res = await fetch(url, { redirect: 'follow', headers: { connection: 'close' }, signal: AbortSignal.timeout(20000) }) } catch (e) { last = String(e && e.cause ? e.cause.code || e.cause.message : e.message).slice(0, 80) }
  }
  if (!res) return `${url} doesn't answer (${last})`
  if (res.status !== 200) return `${url} answers ${res.status}, not 200`
  const body = await res.text()
  const missing = want.filter(Boolean).filter(w => !body.toLowerCase().includes(String(w).toLowerCase()))
  if (want.length && missing.length === want.filter(Boolean).length) return `${url} answers, but the page doesn't show ${want.filter(Boolean).map(w => `"${w}"`).join(' or ')}`
  return null
}
// STATE.md's Key facts: "Live on <platform>: <link> (v1.0.0, <day>)", changed in place or added.
function markLive(dir, p, link, version, now) {
  const text = nl(readIn(dir, STATE_MD) || '')
  const key = `Live on ${p.name}`
  const lineText = `- ${key}: ${link} (v${version}, ${day(now)})`
  const re = new RegExp(`^- ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:.*$`, 'm')
  let out = re.test(text) ? text.replace(re, lineText) : /^## Key facts[^\n]*\n/m.test(text) ? text.replace(/^(## Key facts[^\n]*\n)/m, `$1${lineText}\n`) : `${text.replace(/\n*$/, '\n')}\n## Key facts\n${lineText}\n`
  writeOwn(dir, STATE_MD, out, `Release: live on ${p.name} (v${version})`)
}
// itch.io through its recipe: butler pushes the build folder to the page's channel. The page, the butler target and the
// link are STATE's "Itch:" line ("Itch: https://<user>.itch.io/<game> · butler <user>/<game>:html5"), set up once by
// hand (the recipe's one-time setup). butler is itch's own upload tool; BMUZ_BUTLER names a stand-in (tests only).
export function itchOf(dir) {
  const m = (readIn(dir, STATE_MD) || '').match(/\bItch:\*{0,2}[ \t]*(https?:\/\/\S+)[ \t]*·[ \t]*butler[ \t]+(\S+)/)
  return m ? { link: m[1], target: m[2] } : null
}
function butler(dir, args) {
  const stand = process.env.BMUZ_BUTLER
  if (isTest() && !stand) return { ok: false, out: 'a test run uploads only to the stand-in (BMUZ_BUTLER), never to itch.io' }
  const argv = stand ? [process.execPath, stand, ...args] : ['butler', ...args]
  const r = spawnSync(argv[0], argv.slice(1), { cwd: dir, encoding: 'utf8', timeout: 540000, shell: !stand && process.platform === 'win32' })
  if (r.error && r.error.code === 'ENOENT') return { ok: false, out: 'butler (itch.io\'s upload tool) isn\'t installed: the itch.io recipe says how (download it from https://itchio.itch.io/butler, then "butler login" once)' }
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() }
}

export async function launch(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const p = current(rec)
  const answer = releaseAnswer(dir)
  if (answer !== 'Release it') throw new Error(`nothing goes public without the creative's own "Release it" at "Release ${rec.game} on ${p.name}?" (${answer ? `they answered "${answer}"` : 'no answer in this run'})`)
  readyFor(dir)
  const per = rec.per[p.key]
  if (p.key === 'web') {
    // the web: Deliver's release for 1.0 — merged, versioned, tagged, pushed, deployed, live-checked (rolled back if not)
    const r = D.publish(dir, script, now, { approved: true })
    const why = await linkCheck(r.link, [rec.game])
    if (why) throw new Error(`the live check passed, but from outside: ${why}`)
    per.link = r.link
    per.version = D.readRecord(dir).publish.version
  } else {
    // the 1.0 release itself (once, by the first platform): merged, versioned, tagged, pushed — no web deploy here
    const r = D.publish(dir, script, now, { approved: true, deploy: false })
    per.version = r.version
    if (p.key === 'itch') {
      const itch = itchOf(dir)
      if (!itch) throw new Error('itch.io isn\'t set up for this game yet: make its page once by hand (itch.io → Dashboard → Create new project, Kind of project: HTML), then add "Itch: <the page\'s link> · butler <user>/<game>:html5" to the Key facts in .planning/STATE.md (the itch.io recipe\'s one-time setup) and say "bmuz retry"')
      if (isTest() && !isLocalLink(itch.link)) throw new Error(`a test run uploads only to a page on this machine, and the Itch line says ${itch.link}`)
      const out = D.shipDir(dir)
      if (!out) throw new Error('there is no build folder to upload (dist/, build/…): the 1.0 build is Deliver\'s')
      if (!per.uploaded) {
        const up = butler(dir, ['push', out, itch.target, '--userversion', r.version])
        if (!up.ok) { saveRecord(dir, rec); throw new Error(`the itch.io upload failed: ${up.out.slice(-600)}`) }
        per.uploaded = r.version
        saveRecord(dir, rec)
      }
      const why = await linkCheck(itch.link, [rec.game])
      if (why) { saveRecord(dir, rec); throw new Error(`uploaded, but the itch.io page doesn't check out from outside yet: ${why}. itch.io takes about a minute to process an upload; say "bmuz retry"`) }
      per.link = itch.link
    } else {
      // Steam, the phone stores: BMUZ walks the creative through; it's live only on their word and a link that checks out
      per.walk = true
      saveRecord(dir, rec)
      return { walk: 'yes' }
    }
  }
  per.status = 'live'
  per.live = day(now)
  saveRecord(dir, rec)
  markLive(dir, p, per.link, per.version, now)
  write(dir, SAY.live, line('release.live', { game: rec.game, link: per.link }, script) + '\n')
  return { walk: 'no', link: per.link }
}

// The walk-through's end: the creative's own words carry the link (their answer in this step, journaled), and the link
// answers from outside, naming the game. An auto run never marks a store live.
export async function liveLinkProblem(dir, link, mode) {
  const rec = recordOf(dir)
  const url = clean(link)
  if (mode === 'auto' && !testAnswered(dir, 'walk')) return 'only the creative can say it is live on the store: an auto run never marks it released'
  if (mode !== 'auto') {
    const js = journalOf(dir)
    let from = -1
    js.forEach((j, i) => { if (j.ev === 'step.start' && j.step === 'walk') from = i })
    const said = js.slice(Math.max(from, 0)).filter(j => j.ev === 'answer' && j.step === 'walk').map(j => String(j.text || '')).join('\n')
    if (from < 0 || !said.includes(url)) return `the link must be the creative's own, as they pasted it in this step (${url} isn't in their answers)`
  } else {
    const ta = JSON.stringify((readJson(dir, 'bmuz.json') || {}).testAnswers?.walk || '')
    if (!ta.includes(url)) return `the link must be the one the test's answers give, not ${url}`
  }
  return linkCheck(url, [rec.game])
}
export function markedLive(dir, link, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const p = current(rec)
  const url = clean(link || resultOf(dir, 'walk').link)
  const per = rec.per[p.key]
  per.link = url
  per.status = 'live'
  per.live = day(now)
  saveRecord(dir, rec)
  markLive(dir, p, url, per.version || (readJson(dir, 'version.json') || {}).version, now)
  write(dir, SAY.live, line('release.live', { game: rec.game, link: url }, script) + '\n')
  return per
}

// Another platform to go? → Release again from "platform" (each platform its own kept run, like Develop's sprints),
// else on to First Reactions.
export function more(dir) {
  const rec = recordOf(dir)
  const left = rec.platforms.filter(k => rec.per[k].status === 'to do' && k !== rec.current)
  if (left.length) return { last: 'no', onward: 'release', at: 'platform' }
  return { last: 'yes', onward: 'later', at: 'first' }
}

// ---- 6.2 First Reactions ----
// Each feeling of GDD chapter 1 checked against what players say (as Deliver's playtest notes are), the fixes worth an
// update, the bugs as reports.
export function reactionsProblem(dir, r) {
  if (!r || typeof r !== 'object') return 'the reactions must be an object: {"feelings": [{"feeling", "seen", "why"}], "fixes": ["…"], "bugs": [{…}]}'
  if (r.fixes !== undefined && !Array.isArray(r.fixes)) return '"fixes" must be a list'
  return D.notesProblem(dir, { feelings: r.feelings, bugs: r.bugs })
}
// The update milestone: the open one marked "(→ update)", else a new "Update 1.1" after the last milestone, current.
export function updateMilestone(text, version) {
  const before = nl(text)
  const rm = S.readRoadmap(before)
  const open = rm.milestones.find(m => m.stage === 'update' && !m.done)
  if (open) return { text: before, name: open.name }
  // (the update after 1.0.0 is 1.1; after 1.1.0, 1.2 — an earlier version than 1.0 counts as 1.0)
  const [maj, min] = String(version || '1.0.0').split('.').map(Number)
  const v = maj >= 1 ? `${maj}.${(min || 0) + 1}` : '1.1'
  const name = `Update ${v}`
  const lines = rm.lines
  for (const m of rm.milestones) lines[m.line] = lines[m.line].replace(/\s{2}←\s*current/, '')
  const last = rm.milestones[rm.milestones.length - 1]
  let at = lines.length
  if (last) { at = last.line + 1; while (at < lines.length && !/^## /.test(lines[at]) && !/^<!-- \/bmuz /.test(lines[at])) at++ }
  lines.splice(at, 0, `## v${v} — ${name}  ← current  (→ update)`, 'Goal: what players asked for after 1.0')
  return { text: M.refreshMarks(before, lines.join('\n')), name }
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
export function reactionsWrite(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const r = resultOf(dir, 'reactions').reactions
  const why = reactionsProblem(dir, r)
  if (why) throw new Error(why)
  const fixes = listOf(r.fixes).map(clean).filter(Boolean)
  const bugs = listOf(r.bugs).map(b => B.addIn(dir, b, { where: 'Release · First Reactions' }))
  let update = ''
  if (fixes.length || bugs.length) {
    const u = updateMilestone(readIn(dir, ROADMAP) || '', (readJson(dir, 'version.json') || {}).version)
    let text = u.text
    // (a feature's name: the fix's first sentence, or its first 8 words when that runs long)
    const nameOf = f => { const w = f.split(/[.;:]/)[0].split(' '); return w.length <= 10 ? w.join(' ') : `${w.slice(0, 8).join(' ')}…` }
    for (const f of fixes) text = D.addFeature(text, u.name, { type: '✨', name: nameOf(f), description: f, scope: 'must:update' }).text
    if (!fixes.length) text = D.addFeature(text, u.name, { type: '✨', name: 'Fix what players found', description: `the bugs from the first reactions: ${bugs.map(b => b.id).join(', ')}`, scope: 'must:update' }).text
    S.writePlan(dir, ROADMAP, text, `${u.name}: what players asked for after 1.0`)
    update = u.name
  }
  G.writePage(dir, now)
  const feelings = listOf(r.feelings).map(f => `"${clean(f.feeling)}": ${clean(f.seen)} — ${clean(f.why)}`)
  const fixWords = [...fixes, ...bugs.map(b => `${b.id} (a bug)`)]
  write(dir, SAY.reactions, line('release.reactions.read', { feelings: feelings.join('; '), fixes: fixWords.length ? fixWords.join('; ') : 'nothing yet', update }, script) + '\n')
  rec.reactions = { fixes, bugs: bugs.map(b => b.id), update: update || null, day: day(now) }
  saveRecord(dir, rec)
  return rec.reactions
}

// ---- 6.3 Look Back ----
export function lookbackProblem(l) {
  if (!l || typeof l !== 'object') return 'the look back must be an object: {"forgame": ["…"], "forbmuz": ["…"]}'
  for (const k of ['forgame', 'forbmuz']) if (!Array.isArray(l[k]) || !l[k].map(clean).filter(Boolean).length) return `"${k}" needs at least one lesson, in the words the creative agreed to`
  return null
}
export function lookbackWrite(dir, script = loadScript(), now = new Date()) {
  const rec = recordOf(dir)
  const l = resultOf(dir, 'lookback').lessons
  const why = lookbackProblem(l)
  if (why) throw new Error(why)
  const forGame = l.forgame.map(clean).filter(Boolean)
  const forBmuz = l.forbmuz.map(clean).filter(Boolean)
  // for this game: its STATE Key facts; for BMUZ: .planning/bmuz-suggestions.md (for Muzzy to read)
  let state = nl(readIn(dir, STATE_MD) || '')
  const add = forGame.filter(x => !state.includes(`- Lesson: ${x}`)).map(x => `- Lesson: ${x}`).join('\n')
  if (add) state = /^## Key facts[^\n]*\n/m.test(state) ? state.replace(/^(## Key facts[^\n]*\n)/m, `$1${add}\n`) : `${state.replace(/\n*$/, '\n')}\n## Key facts\n${add}\n`
  writeOwn(dir, STATE_MD, state, `Release: the lessons ${rec.game} taught`)
  const sug = nl(readIn(dir, SUGGESTIONS) || '# Suggestions for BMUZ\nWhat each game taught about BMUZ itself, from its Look Back, for Muzzy to read.\n')
  const head = `## ${day(now)} · ${rec.game}`
  if (!sug.includes(head)) writeOwn(dir, SUGGESTIONS, `${sug.replace(/\n*$/, '\n')}\n${head}\n${forBmuz.map(x => `- ${x}`).join('\n')}\n`, `Release: suggestions for BMUZ from ${rec.game}`)
  const update = rec.reactions && rec.reactions.update
  write(dir, SAY.end, (update ? line('deliver.back', { what: `build ${update}` }, script) : line('release.out', { game: rec.game }, script)) + '\n')
  rec.lessons = { forGame, forBmuz, day: day(now) }
  saveRecord(dir, rec)
  return update ? { onward: 'develop', at: 'plan' } : { onward: 'later', at: 'first' }
}

// ---- The command line ----
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const [mode, a, b] = process.argv.slice(2)
  const dir = process.cwd()
  const say = (ok, text) => { console.log(text); process.exit(ok ? 0 : 1) }
  const results = r => JSON.stringify({ results: r })
  const json = t => { try { return JSON.parse(t || 'null') } catch (e) { return null } }
  try {
    if (mode === 'where') {
      const p = whereProblem(dir, a, b)
      say(!p, p ? `✘ ${p}` : `✔ ${picksOf(a).join(', ')}`)
    } else if (mode === 'next') {
      const r = next(dir)
      say(true, `✔ next: ${r.platform}${r.fresh === 'yes' ? ' (its requirements researched fresh first)' : ' (researched today already)'}\n${results(r)}`)
    } else if (mode === 'store') {
      const r = await store(dir)
      say(true, `✔ ${SAY.store}\n${results(r)}`)
    } else if (mode === 'page-check') {
      const p = pageProblem(a)
      say(!p, p ? `✘ ${p}` : '✔ the store page')
    } else if (mode === 'page-save') {
      const r = pageSave(dir)
      say(true, `✔ ${r.changed ? 'the store page saved as the creative wants it' : 'the store page kept as drafted'}`)
    } else if (mode === 'not-yet') {
      write(dir, SAY.notyet, '')
      if (!clean(a)) say(true, `✔ nothing missing said\n${results({ go: 'yes' })}`)
      const r = notYet(dir, a)
      say(true, `✔ waiting: ${r.what}\n${results({ go: 'no' })}`)
    } else if (mode === 'launch') {
      write(dir, SAY.live, '')
      const r = await launch(dir)
      say(true, `✔ ${r.walk === 'yes' ? 'released as 1.0; the store is the creative\'s, step by step' : `live: ${r.link}`}\n${results({ walk: r.walk })}`)
    } else if (mode === 'live-link') {
      const p = await liveLinkProblem(dir, a, b)
      say(!p, p ? `✘ ${p}` : `✔ ${a} answers from outside`)
    } else if (mode === 'marked-live') {
      const r = markedLive(dir)
      say(true, `✔ live: ${r.link}`)
    } else if (mode === 'more') {
      const r = more(dir)
      say(true, `✔ ${r.last === 'yes' ? 'every platform done for now: on to First Reactions' : 'on to the next platform'}\n${results(r)}`)
    } else if (mode === 'reactions-check') {
      const p = reactionsProblem(dir, json(a))
      say(!p, p ? `✘ ${p}` : '✔ the reactions are sorted')
    } else if (mode === 'reactions-write') {
      const r = reactionsWrite(dir)
      say(true, `✔ ${r.update ? `${plural(r.fixes.length, 'fix', 'fixes')} and ${plural(r.bugs.length, 'bug', 'bugs')} in ${r.update}` : 'nothing to fix yet'}`)
    } else if (mode === 'lookback-check') {
      const p = lookbackProblem(json(a))
      say(!p, p ? `✘ ${p}` : '✔ both lists')
    } else if (mode === 'lookback-write') {
      const r = lookbackWrite(dir)
      say(true, `✔ the lessons kept\n${results(r)}`)
    } else {
      say(false, '✘ use: node launch.mjs where <picks> <auto|live> | next | store | page-check <page> | page-save | not-yet <what> | launch | live-link <link> <auto|live> | marked-live | more | reactions-check <r> | reactions-write | lookback-check <l> | lookback-write')
    }
  } catch (err) {
    say(false, `✘ ${String(err && err.message ? err.message : err).slice(0, 900)}`)
  }
}
