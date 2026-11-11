// Define on the script (F232 task 4; framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stage 2).
//   node define.mjs lock-show   2.8 Concept Lock: the concept, one page, composed from the script word for word with
//                               what Define chose (the ✓ lines) and what's still open, then shown
//   node define.mjs locked      after "Lock it": the lock logged in the GDD's Decisions and Changes
//   (run in the project folder)
// Each Define step writes its own chapter as "chosen" (gdd.mjs step <id> chosen); this script only reads them back.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'

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

export function lockShow(project, state, script = loadScript()) {
  const doc = G.readFileIn(project, G.GDD) || G.newGdd()
  const by = state.resultsBy || {}
  const r = k => by[k] || {}
  const first = n => (String((G.readGdd(doc)[n] || {}).text || '').split('\n')[0] || '').replace(/^- /, '').replace(/^\*\*[^*]+\*\*:?\s*/, '')
  const open = stillOpen(doc)
  const slots = {
    link: G.pageLink(project),
    feelings: words(r('feelings').feelings).join(' · ') || first(1),
    pillars: words(r('pillars').pillars).join(' · ') || first(2),
    oneliner: clean(r('pitch').oneliner) || first(3),
    loop: clean(r('loop').loop) || first(4),
    platform: clean(r('platform').platform) || first(5),
    musts: String(listOf(r('scope').musts).length),
    open: open.length ? open.join('; ') : 'the rest of the game, in Design',
  }
  const out = E.renderLine(script, 'define.lock', slots)
  if (out.error) throw new Error(out.error)
  mkdirSync(dirname(join(project, LOCK_MD)), { recursive: true })
  writeFileSync(join(project, LOCK_MD), out.text + '\n')
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
      console.log('✘ use: node define.mjs lock-show | locked')
      process.exit(1)
    }
  } catch (err) {
    console.log(`✘ ${String(err && err.message ? err.message : err).slice(0, 300)}`)
    process.exit(1)
  }
}
