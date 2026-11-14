// Define on the script (F232 task 4; framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stage 2).
//   node define.mjs lock-show   2.8 Concept Lock: the concept, one page, composed from the script word for word with
//                               what Define chose (the ✓ lines) and what's still open, then shown
//   node define.mjs locked      after "Lock it": the lock logged in the GDD's Decisions and Changes
//   node define.mjs path        (F233) a finished game or a new idea: {"results": {"convert", "fresh"}}
//   (run in the project folder)
// Each Define step writes its own chapter as "chosen" (gdd.mjs step <id> chosen); this script only reads them back.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as F from './fields.mjs'

export const LOCK_MD = '.planning/research/define-lock.md'
const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const words = v => listOf(v).map(x => clean(x && typeof x === 'object' ? x.name ?? x.text ?? '' : x)).filter(Boolean)

// What's still open after Define: the first open question of each chapter of the game and the digital game
// (Rulebook on), as "<chapter>: <what>" — Design fills these.
export function stillOpen(doc, max = 3) {
  const ch = G.readGdd(doc)
  const out = []
  for (const [n, name] of G.CHAPTERS) {
    if (n < 8 || out.length >= max) continue
    const open = String((ch[n] && ch[n].text) || '').split('\n').map(l => l.replace(/^- /, '')).find(l => /^Open:\s*/.test(l))
    if (open) out.push(`${name}: ${open.replace(/^Open:\s*/, '').replace(/\?$/, '')}`)
  }
  return out
}

// F235 task 2 (finding 11, Sirius Smugglers 2026-11-14): the lock lists every open question by when it's needed, and
// asks only the ones needed now. Muzzy: "even if things carried over between games, is solving that now part of the
// vertical slice? i don't think it is." now = an open line in a chapter Define decides (1–6: the concept itself isn't settled);
// later = one the slice step named as not needed for the slice ("later", matched loosely); design = every other open
// line (the risks, and the Rulebook on). Returns { now, design, later }, each a list of "<chapter>: <question>" (no repeats).
const looseKey = t => clean(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
export function openByWhen(doc, later = []) {
  const ch = G.readGdd(doc)
  const laterKeys = listOf(later).map(x => looseKey(x && typeof x === 'object' ? x.text ?? x.question ?? '' : x)).filter(k => k.length >= 8)
  const isLater = q => { const k = looseKey(q); return laterKeys.some(l => k.includes(l) || l.includes(k)) }
  const out = { now: [], design: [], later: [] }
  const seen = new Set()
  for (const [n, name] of G.CHAPTERS) {
    const lines = String((ch[n] && ch[n].text) || '').split('\n').map(l => l.replace(/^- /, '')).filter(l => /^Open:\s*/.test(l))
    for (const l of lines) {
      const q = clean(l.replace(/^Open:\s*/, ''))
      if (!q || seen.has(looseKey(q))) continue
      seen.add(looseKey(q))
      const item = `${name}: ${q}`
      if (isLater(q)) out.later.push(item)
      else if (n <= 6) out.now.push(item)
      else out.design.push(item)
    }
  }
  return out
}

// (F233) Which path Define takes: a finished, played game (Ideate's so-far found its rules: "path": "convert" in
// ideate-so-far.json), else, for a project brought straight to Define, a GDD whose Rulebook already has at least 3
// "Fixed:" rules. Worked out, never asked. Returns "convert" or "new".
export const SO_FAR_JSON = '.planning/research/ideate-so-far.json'
export const MIN_FIXED = 3
export function pathOf(project) {
  let j = null
  try { j = JSON.parse(G.readFileIn(project, SO_FAR_JSON) || 'null') } catch (e) { j = null }
  if (j && (j.path === 'convert' || j.path === 'new')) return j.path
  const rules = String((G.readGdd(G.readFileIn(project, G.GDD) || '')[8] || {}).text || '').split('\n').filter(l => /^(- )?Fixed:\s/.test(l))
  return rules.length >= MIN_FIXED ? 'convert' : 'new'
}

export function lockShow(project, state, script = loadScript()) {
  const doc = G.readFileIn(project, G.GDD) || G.newGdd()
  const by = state.resultsBy || {}
  // (F233: a finished game's feelings, pillars, pitch and loop come from one step, "decides"; its platform from
  // "platform-rules")
  // (a skipped step's result is there but empty — headless ideate-finished 12:2x: "define.lock needs {loop}" — so the
  // first result that holds the key wins)
  const alt = k => (['feelings', 'pillars', 'pitch', 'loop'].includes(k) ? by.decides : k === 'platform' ? by['platform-rules'] : null)
  const KEY = { feelings: 'feelings', pillars: 'pillars', pitch: 'oneliner', loop: 'loop', platform: 'platform', scope: 'musts' }
  const has = (x, k) => x && typeof x === 'object' && x[KEY[k] || k] != null && x[KEY[k] || k] !== '' && !(Array.isArray(x[KEY[k] || k]) && !x[KEY[k] || k].length)
  const r = k => [by[k], alt(k)].find(x => has(x, k)) || by[k] || {}
  const first = n => (String((G.readGdd(doc)[n] || {}).text || '').split('\n')[0] || '').replace(/^- /, '').replace(/^\*\*[^*]+\*\*:?\s*/, '')
  // (F235 task 2: the open questions by when they're needed; the slice step names the ones the slice doesn't need)
  const when = openByWhen(doc, (by.slice || {}).later)
  const slots = {
    link: G.pageLink(project),
    feelings: words(r('feelings').feelings).join(' · ') || first(1),
    pillars: words(r('pillars').pillars).join(' · ') || first(2),
    oneliner: clean(r('pitch').oneliner) || first(3),
    loop: clean(r('loop').loop) || first(4),
    // (F235 task 3: a list in a line is never a semicolon run)
    platform: (clean(r('platform').platform) || first(5)).split(/;\s+/).join(' · '),
    musts: String(listOf(r('scope').musts).length),
    now: when.now,
    design: when.design,
    later: when.later,
  }
  const out = E.renderLine(script, 'define.lock.when', slots)
  if (out.error) throw new Error(out.error)
  out.text = out.text.replace(/\n{3,}/g, '\n\n')
  // (F234 rule 4: what Define didn't ask, each reopenable with one word, before the lock)
  const skipped = F.skipList(state, script)
  mkdirSync(dirname(join(project, LOCK_MD)), { recursive: true })
  writeFileSync(join(project, LOCK_MD), out.text + (skipped ? `\n\n${skipped}` : '') + '\n')
  G.writePage(project)
  return { text: out.text, slots }
}

export function locked(project, now = new Date()) {
  const doc = G.readFileIn(project, G.GDD)
  if (!doc) throw new Error(`there is no ${G.GDD} to lock`)
  const day = now.toISOString().slice(0, 10)
  const out = G.applyResult(doc, { decisions: [`${day} · The concept (Part 1: The Feelings to Risks & Unknowns) locked in Define; Design builds on it, and every change is logged under Changes`] }, null, { step: 'lock', stage: 'Define', day })
  writeFileSync(join(project, G.GDD), out.text)
  G.writePage(project, now)
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = process.argv[2]
  const project = process.cwd()
  if (mode === 'path') {
    const path = pathOf(project)
    console.log(`✔ ${path === 'convert' ? 'a finished game: Define drafts what its rules decide, then asks only what they leave open' : 'a new idea: Define decides it step by step'}`)
    console.log(JSON.stringify({ results: { convert: path === 'convert' ? 'yes' : 'no', fresh: path === 'convert' ? 'no' : 'yes' } }))
    process.exit(0)
  }
  let state = null
  try { state = JSON.parse(readFileSync(join(project, '.bmuz/state.json'), 'utf8')) } catch (e) { state = null }
  if (!state) { console.log('✘ no .bmuz/state.json: this runs inside a define run'); process.exit(1) }
  try {
    if (mode === 'lock-show') {
      const r = lockShow(project, state)
      console.log(`✔ ${LOCK_MD}: the concept, one page (${r.slots.musts} musts)`)
    } else if (mode === 'locked') {
      locked(project)
      console.log(`✔ ${G.GDD}: the concept locked (Decisions, Changes)`)
    } else {
      console.log('✘ use: node define.mjs path | lock-show | locked')
      process.exit(1)
    }
  } catch (err) {
    console.log(`✘ ${String(err && err.message ? err.message : err).slice(0, 300)}`)
    process.exit(1)
  }
}
