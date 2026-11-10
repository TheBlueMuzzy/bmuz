// Ideate's documents (pipeline "ideate", F228): "the game so far", per need — what's fixed, the ideas, what's open.
// node ideate-doc.mjs so-far     (step "so-far": version 1, from what was shared; the screen file only)
// node ideate-doc.mjs save       (step "save": version 2, with the gap answers; .planning/IDEATE.md + the screen file)
// (run in the project folder)
//
// The design: framework .planning/research/bmuz-vision/stages.md (Ideate gathers the material: "show me what you
// have", then per need what's fixed · what ideas you have · what's open; never "which one?") and the two evidence
// reports (discover-live-review-2026-11-09.md: his first free answer held nearly everything, his own words read back
// as options wasted his time; design-gaps-evidence.md: frame first).
// - Claude READS (talk steps "read" and "gaps") and hands back items sorted by need; this script writes, the same way
//   every time. Every quote is checked against the actual text (intake.mjs's isVerbatim): the shared material
//   (.planning/research/shared.json, written by ideate-fetch.mjs) and the creative's own answers in this stage (the
//   engine journals each answer to the question box). A quote not found there is kept as Claude's reading, never as
//   theirs.
// - IDEATE.md is DISCOVER.md's successor: the same layout (shelves only grow, hand edits kept, a run section each
//   time), one shelf per need, each line labelled Fixed / Idea / Open. Define's digest reads it first (define-doc.mjs
//   sourceDoc), so the brick ids ([FR2]) and "→ chosen" marks work the same way. Old DISCOVER.md files stay readable.
// - The screen file (.planning/research/ideate-so-far.md) is the short version the engine shows the creative (the
//   step's "show"), version 1 after the reading, version 2 at the end with the open questions that matter most.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import { mergeDoc } from './discover-doc.mjs'
import { isVerbatim, normalise } from './intake.mjs'

export const IDEATE = '.planning/IDEATE.md'
export const SO_FAR = '.planning/research/ideate-so-far.md'
export const SHARED_JSON = '.planning/research/shared.json'

// The needs (stages.md: the spine of Ideate, Define and Design), frame first (the costliest gap in the rework
// evidence: it got more expensive with every screen built on it). [key, shelf name, what it holds]
export const NEEDS = [
  ['frame', 'Frame', 'platform, which way up, players, online (leaving and joining too), session length, controls'],
  ['loop', 'Core loop', 'what the player does, in verbs, over and over'],
  ['things', 'Things in play', 'the pieces and the states they can be in'],
  ['rules', 'Rules', 'how a turn or a moment goes, how it scores, how it ends'],
  ['decisions', 'Decisions', 'the choices players make, why they are hard: the real skill'],
  ['feel', 'Feel', 'the feeling it is after, and how we will know'],
  ['change', 'Change over time', 'what changes during a game and from game to game'],
  ['smallest', 'Smallest version', 'the smallest version worth playing'],
  ['look', 'Look & sound', 'the look and sound direction'],
  ['also', 'Also noted', 'opponents, who sees what, screens, names, teaching: anything else they said'],
]
export const NEED_KEYS = NEEDS.map(n => n[0])
// The labels each line carries on its shelf (define-doc.mjs reads them as a brick's label).
export const PARTS = [['fixed', 'Fixed'], ['ideas', 'Idea'], ['open', 'Open']]
// A line's source, as DISCOVER.md writes them (define-doc.mjs readShelves knows these words).
export const BY = { material: 'from your material', answer: "the creative's words", claude: "Claude's reading of your material", open: 'open question' }

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const itemOf = x => (typeof x === 'string' ? { text: clean(x) } : x && typeof x === 'object' ? { text: clean(x.text !== undefined ? x.text : x.q || x.question || ''), his: x.his === true } : { text: '' })

// The creative's answers in the question box, as the engine journaled them (ev "answer"): the text after each "=".
export function answersFrom(journalLines, steps = null) {
  const out = []
  for (const l of journalLines) {
    let j
    try { j = JSON.parse(l) } catch (e) { continue }
    if (!j || j.ev !== 'answer' || (steps && !steps.includes(j.step))) continue
    const t = String(j.text || '')
    // Claude Code's wording: ... "question"="answer", "question"="answer" ...: only the answers are theirs
    const picked = [...t.matchAll(/"[^"]*"="([^"]*)"/g)].map(m => m[1])
    out.push(...(picked.length ? picked : [t]))
  }
  return out.filter(x => clean(x))
}

// Sorts one result (sofar / added) into checked items: { need: { fixed: [{text, by}], ideas: [...], open: [...] } }.
// material = the shared text, answers = the creative's answers (both raw). Unknown needs go to "also".
export function checkSoFar(result, material, answers) {
  const src = { material: normalise(material), answers: normalise(answers.join('\n\n')) }
  const out = {}
  let notQuoted = 0
  const r = result && typeof result === 'object' && !Array.isArray(result) ? result : {}
  for (const [needRaw, parts] of Object.entries(r)) {
    const need = NEED_KEYS.includes(needRaw) ? needRaw : 'also'
    if (!parts || typeof parts !== 'object') continue
    for (const [part] of PARTS) {
      for (const x of listOf(parts[part])) {
        const it = itemOf(x)
        if (!it.text) continue
        let by
        if (part === 'open') by = BY.open
        else if (it.his && isVerbatim(it.text, src.material)) by = BY.material
        else if (it.his && isVerbatim(it.text, src.answers)) by = BY.answer
        else {
          by = BY.claude
          if (it.his) notQuoted++
        }
        const bucket = ((out[need] = out[need] || { fixed: [], ideas: [], open: [] })[part])
        if (!bucket.some(b => normalise(b.text) === normalise(it.text))) bucket.push({ text: it.text.replace(/^["“]|["”]$/g, ''), by })
      }
    }
  }
  return { needs: out, notQuoted }
}

// Version 2: version 1 plus what the gap answers added, without the open questions they answered.
export function mergeSoFar(v1, added, answered = []) {
  const done = listOf(answered).map(a => normalise(typeof a === 'string' ? a : a && a.text)).filter(Boolean)
  const isAnswered = t => done.some(d => normalise(t) === d || normalise(t).includes(d) || d.includes(normalise(t)))
  const out = {}
  for (const need of NEED_KEYS) {
    const a = v1[need] || { fixed: [], ideas: [], open: [] }
    const b = added[need] || { fixed: [], ideas: [], open: [] }
    const joined = {}
    for (const [part] of PARTS) {
      const list = [...a[part], ...b[part]]
      joined[part] = list.filter((x, i) => list.findIndex(y => normalise(y.text) === normalise(x.text)) === i)
    }
    joined.open = joined.open.filter(x => !isAnswered(x.text))
    if (PARTS.some(([p]) => joined[p].length)) out[need] = joined
  }
  return out
}

const shown = x => (x.by === BY.material || x.by === BY.answer ? `“${x.text}”` : x.by === BY.open ? x.text : `${x.text} (my reading)`)

// The short version the creative sees. version 1 | 2; read = the "Read" line; matter = the open questions that
// matter most (version 2); added = how many items the gap answers added.
export function screen({ needs, brief, version, read = '', matter = [], added = 0 }) {
  const out = [`## The game so far${brief ? ` — ${brief}` : ''} (version ${version}${version === 1 ? ': what you shared' : ': with your answers'})`, '']
  out.push(version === 1
    ? 'Your words are in “quotes”; anything marked (my reading) is how I read your material, so correct me there. Fixed = facts and limits you brought; Ideas = yours, half-formed welcome; Open = not said yet.'
    : `Your words are in “quotes”. ${added ? `${added} new from your answers.` : 'Nothing new from the questions.'} Nothing here is chosen yet: Define does that.`, '')
  for (const [key, name, what] of NEEDS) {
    const n = needs[key]
    if (key === 'also' && !n) continue
    out.push(`**${name}** — ${what}`)
    if (!n || !PARTS.some(([p]) => n[p].length)) { out.push('- Open: nothing yet', ''); continue }
    for (const [part, label] of PARTS) if (n[part].length) out.push(`- ${part === 'ideas' ? 'Ideas' : label}: ${n[part].map(shown).join(' · ')}`)
    out.push('')
  }
  if (version === 2) {
    const m = listOf(matter).map(q => clean(typeof q === 'string' ? q : q && (q.q || q.text))).filter(Boolean).slice(0, 3)
    out.push('**The open questions that matter most**', ...(m.length ? m.map((q, i) => `${i + 1}. ${q}`) : ['- none: the game so far covers every need']), '')
  }
  if (read) out.push(`**Read:** ${read}`, '')
  out.push(version === 1 ? 'Next: a few questions about the gaps only, frame first.' : 'Saved in .planning/IDEATE.md. Next: Define, where you choose — which one is it, for each part.')
  return out.join('\n') + '\n'
}

// A new IDEATE.md (the same layout as DISCOVER.md, so define-doc.mjs reads it with the same parser).
export const freshIdeate = () => [
  '# The game so far',
  'Seed: (none yet)',
  '',
  'BMUZ gathers the material for the game here (Ideate): for each thing a game needs, what\'s fixed, the ideas, and what\'s open. Nothing in this file is chosen; Define chooses. Lines are only ever added or annotated, never removed: edit anything you like, your edits are kept.',
  '',
  '## Shelves (cumulative — every Ideate run adds; nothing is chosen here)',
  ...NEEDS.flatMap(([, n, d]) => [`### ${n} — ${d}`, '']),
  '## Runs (newest first)',
  '',
].join('\n')

// The run IDEATE.md gets: every item on its need's shelf, labelled, with its source.
export function ideateRun({ needs, brief, date, key, read, matter, steps }) {
  const bricks = []
  for (const [k, name] of NEEDS) {
    const n = needs[k]
    if (!n) continue
    for (const [part, label] of PARTS) for (const x of n[part]) bricks.push({ shelf: name, text: `${label}: ${x.by === BY.material || x.by === BY.answer ? `"${x.text}"` : x.text}`, by: x.by })
  }
  const m = listOf(matter).map(q => clean(typeof q === 'string' ? q : q && (q.q || q.text))).filter(Boolean).slice(0, 3)
  return {
    key, date, brief, youAre: '', steps, skipped: [], questions: [], bricks, reports: [], noResearch: true,
    extra: [...(read ? [`- Read: ${read}`] : []), ...(m.length ? ['- Open questions that matter most:', ...m.map((q, i) => `  ${i + 1}. ${q}`)] : [])],
  }
}

// An open line on a shelf that a later run answered gets " · answered in run N" (never removed).
export function markAnswered(text, answered, n) {
  const done = listOf(answered).map(a => normalise(typeof a === 'string' ? a : a && a.text)).filter(Boolean)
  if (!done.length) return { text, marked: 0 }
  let marked = 0
  const out = String(text).split('\n').map(l => {
    const m = l.match(/^- Open: (.*?) — run (\d+) · /)
    if (!m || Number(m[2]) >= n || /answered in run/.test(l)) return l
    const t = normalise(m[1])
    if (!done.some(d => t === d || t.includes(d) || d.includes(t))) return l
    marked++
    return `${l} · answered in run ${n}`
  })
  return { text: out.join('\n'), marked }
}

// The "Read" line, from shared.json: what was read, what was listed only, what couldn't be read.
export function readLine(shared) {
  if (!shared) return ''
  const parts = []
  const names = listOf(shared.sources).map(s => s.name)
  if (names.length) parts.push(names.join(' · '))
  if (listOf(shared.listed).length) parts.push(`listed, not read: ${shared.listed.map(l => `${l.name} (${l.kind})`).join(', ')}`)
  if (listOf(shared.unread).length) parts.push(`couldn't read: ${shared.unread.map(u => `${u.what} (${u.why})`).join(', ')}`)
  return parts.join(' · ') || 'nothing shared yet'
}

function main() {
  const mode = process.argv[2]
  if (mode !== 'so-far' && mode !== 'save') { console.log('✘ say "so-far" or "save"'); process.exit(1) }
  const project = process.cwd()
  const read = f => (existsSync(join(project, f)) ? readFileSync(join(project, f), 'utf8') : null)
  const state = JSON.parse(read('.bmuz/state.json') || 'null')
  if (!state) { console.log('✘ no .bmuz/state.json: this runs inside an ideate run'); process.exit(1) }
  const by = state.resultsBy || {}
  let shared = null
  try { shared = JSON.parse(read(SHARED_JSON) || 'null') } catch (e) { shared = null }
  const material = listOf(shared && shared.sources).map(s => String(s.text || '')).join('\n\n')
  const journal = (read('.bmuz/journal.jsonl') || '').split('\n')
  const answers = answersFrom(journal)
  // A test run's stand-in answers count as the creative's words (bmuz.json "testAnswers", only with BMUZ_TEST=1).
  if (process.env.BMUZ_TEST === '1') {
    try {
      const cfg = JSON.parse(read('bmuz.json') || '{}')
      for (const v of Object.values(cfg.testAnswers || {})) answers.push(...Object.values(v && typeof v === 'object' ? v : { a: v }).map(String))
    } catch (e) { /* no test answers */ }
  }
  // (the breath answer from the show step is the creative's own words too)
  for (const x of listOf(by.show && by.show.breath)) answers.push(typeof x === 'string' ? x : String((x && x.text) || ''))
  const v1 = checkSoFar(by.read && by.read.sofar, material, answers)
  const brief = clean((by.read && by.read.brief) || (state.given && state.given.brief) || '')
  const date = new Date().toLocaleDateString('en-CA')
  mkdirSync(join(project, dirname(SO_FAR)), { recursive: true })
  if (mode === 'so-far') {
    writeFileSync(join(project, SO_FAR), screen({ needs: v1.needs, brief, version: 1, read: readLine(shared) }))
    const count = Object.values(v1.needs).flatMap(n => PARTS.flatMap(([p]) => n[p])).length
    console.log(`✔ ${SO_FAR}: version 1 — ${count} items on ${Object.keys(v1.needs).length} needs${v1.notQuoted ? ` (${v1.notQuoted} given as quotes but not found in the material: kept as Claude's reading)` : ''}`)
    return
  }
  const gaps = by.gaps || {}
  const add = checkSoFar(gaps.added, material, answers)
  const final = mergeSoFar(v1.needs, add.needs, gaps.answered)
  const addedCount = Object.values(add.needs).flatMap(n => PARTS.flatMap(([p]) => n[p])).length
  writeFileSync(join(project, SO_FAR), screen({ needs: final, brief, version: 2, read: readLine(shared), matter: gaps.matter, added: addedCount }))
  // The run key: when this stage's first step last started, so a save that runs twice adds nothing twice.
  const evs = journal.map(l => { try { return JSON.parse(l) } catch (e) { return null } }).filter(Boolean)
  const first = evs.filter(j => j.ev === 'step.start' && j.step === 'show').pop() || evs.find(j => j.ev === 'stage.enter')
  const run = ideateRun({ needs: final, brief, date, key: first ? `ideate-${first.t}` : `${date}-ideate`, read: readLine(shared), matter: gaps.matter, steps: (state.finished || []).filter(id => !(state.skipped || []).includes(id)) })
  const old = read(IDEATE)
  const merged = mergeDoc(old, run, { shelves: NEEDS.map(([, n, d]) => [n, d]), fresh: freshIdeate })
  if (merged.already) { console.log(`✔ ${IDEATE}: this run is already in it (nothing added twice); ${SO_FAR} version 2 written`); return }
  const ans = markAnswered(merged.text, gaps.answered, merged.n)
  writeFileSync(join(project, IDEATE), ans.text)
  const total = Object.values(merged.added).reduce((a, b) => a + b, 0)
  console.log(`✔ ${IDEATE}: run ${merged.n} saved — ${total} items on ${Object.keys(merged.added).length} needs (${addedCount} from the gap answers)${ans.marked ? `, ${ans.marked} earlier open questions marked answered` : ''}; ${SO_FAR} version 2 written`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
