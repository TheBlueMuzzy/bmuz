// Ideate on the script (F232 task 3; framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stage 1).
//   node ideate.mjs so-far        1.3 The Game So Far: the reading checked, written into the GDD (version 1, every chapter
//                                 loose or plainly open), and the 1.3 message composed from the script word for word
//   node ideate.mjs add <step>    1.4–1.7: what a step gathered, added to its chapters (loose; nothing replaced)
//   node ideate.mjs page          1.7 Your Project Page: opens the page and composes the 1.7 message
//   (run in the project folder)
//
// Claude READS and sorts (talk steps); this script WRITES, the same way every time. Every quote Claude hands back as the
// creative's own words ({"text", "his": true}) is checked against what they actually wrote — the shared material
// (.planning/research/shared.json, from ideate-fetch.mjs) and their answers (the engine journals each one; a test
// run's stand-in answers count when BMUZ_TEST=1). A quote not found there is kept as "my reading", never as theirs.
// Nothing is chosen in Ideate, and the pillars stay empty on purpose (script, "How the GDD grows").
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as F from './fields.mjs'
import { isVerbatim, normalise } from './material.mjs'

// The creative's answers as the engine journaled them (ev "answer": a typed answer to a free line, or a question box's
// answer — of a box, only the answers count, not the questions: Claude Code writes "question"="answer").
export function answersFrom(journalLines, steps = null) {
  const out = []
  for (const l of journalLines) {
    let j
    try { j = JSON.parse(l) } catch (e) { continue }
    // (F235 task 5: words typed at a gate in place of an option are their words too)
    const gateTyped = j && j.ev === 'gate.answer' && j.typed
    if (!j || (j.ev !== 'answer' && !gateTyped) || (steps && !steps.includes(j.step))) continue
    if (gateTyped) { out.push(String(j.answer || '')); continue }
    const t = String(j.text || '')
    const picked = [...t.matchAll(/"[^"]*"="([^"]*)"/g)].map(m => m[1])
    out.push(...(picked.length ? picked : [t]))
  }
  return out.filter(x => String(x).trim())
}

export const SO_FAR = '.planning/research/ideate-so-far.md'
export const SO_FAR_JSON = '.planning/research/ideate-so-far.json'
export const PAGE_MD = '.planning/research/ideate-page.md'
const SHARED_JSON = '.planning/research/shared.json'
// The order gaps are raised in: what's hardest to change later first (script 1.5: how and where a game is played, and
// the shape of its rules, caused the most rework), then the concept's chapters.
export const GAP_ORDER = [5, 8, 4, 1, 3, 6, 10, 11, 12, 7, 9, 13, 14]
// Never written in Ideate: "Pillars stay empty in Ideate on purpose: they're made once the ideas exist."
export const NOT_IN_IDEATE = [2]

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))

// One item as the creative will read it: their words in quotes (checked), else marked "my reading". (F233) An item
// with a "source" (the shared file a finished game's rule came from) says where: "…" (from Rules v3).
function checkItem(x, src) {
  const it = typeof x === 'string' ? { text: clean(x), his: false } : x && typeof x === 'object' ? { text: clean(x.text ?? ''), his: x.his === true, source: clean(x.source ?? '') } : { text: '' }
  const text = it.text.replace(/^["“]|["”]$/g, '')
  if (!text) return null
  const theirs = it.his && (isVerbatim(text, src.material) || isVerbatim(text, src.answers))
  const from = it.source ? ` (from ${it.source})` : ''
  // (F234: the field an item answers, when the step said: the engine reads it before a later step asks the same)
  const field = x && typeof x === 'object' && E.FIELD_RE.test(clean(x.field)) ? clean(x.field) : ''
  return { text, theirs, shown: theirs ? `"${text}"${from}` : `${text} (my reading${it.source ? `, from ${it.source}` : ''})`, claimed: it.his, source: it.source || '', field }
}

// A reading by chapter ({ "5": { fixed, ideas, open } }), checked. Returns { chapters: { n: { fixed, ideas, open } },
// notQuoted }. A chapter that isn't 1–14 is left out; the pillars are never written here.
export function checkReading(reading, src) {
  const out = {}
  let notQuoted = 0
  const r = reading && typeof reading === 'object' && !Array.isArray(reading) ? reading : {}
  for (const [k, parts] of Object.entries(r)) {
    const n = Number(k)
    if (!G.chapterName(n) || NOT_IN_IDEATE.includes(n) || !parts || typeof parts !== 'object') continue
    const c = { fixed: [], ideas: [], open: [] }
    for (const part of ['fixed', 'ideas']) {
      for (const x of listOf(parts[part])) {
        const it = checkItem(x, src)
        if (!it) continue
        if (it.claimed && !it.theirs) notQuoted++
        if (!c[part].some(y => normalise(y.text) === normalise(it.text))) c[part].push(it)
      }
    }
    for (const q of listOf(parts.open)) {
      const t = clean(typeof q === 'string' ? q : q && (q.text || q.q))
      if (t && !c.open.includes(t)) c.open.push(t)
    }
    if (c.fixed.length || c.ideas.length || c.open.length) out[n] = c
  }
  return { chapters: out, notQuoted }
}

// A chapter's lines in the GDD: Clear (facts they brought) · Idea · Open. (F233) A finished game's rules are "Fixed:".
export function chapterLines(c, finished = false) {
  return [
    ...c.fixed.map(x => `${finished ? 'Fixed' : 'Clear'}: ${x.shown}`),
    ...c.ideas.map(x => `Idea: ${x.shown}`),
    ...c.open.map(q => `Open: ${q}`),
  ]
}

// Adds lines to a chapter's own text (Ideate only gathers: nothing replaced, nothing twice).
export function addLines(doc, n, lines, by) {
  const ch = G.readGdd(doc)[n]
  const have = ch && ch.text && ch.text.trim() !== G.NOTHING ? ch.text.split('\n').map(l => l.replace(/^- /, '')) : []
  const norm = s => normalise(s)
  const merged = [...have]
  for (const l of lines) if (!merged.some(m => norm(m) === norm(l))) merged.push(l)
  if (merged.length === have.length) return doc
  return G.writeChapter(doc, n, merged, 'loose', by).text
}

// (F233) A finished game: the reading says so ("finished": true, worked out from the material, never asked) and its
// rules really are written down (at least MIN_RULES rules read as fixed in the Rulebook chapter). Then the conversion
// path: the rules are fixed, and Ideate and Define ask only what they leave open and what digital adds.
export const MIN_RULES = 3
export function isFinished(read, chapters) {
  const f = read && read.finished
  const said = f === true || (typeof f === 'string' && /^\s*(yes|true)\b/i.test(f))
  return said && !!chapters[8] && chapters[8].fixed.length >= MIN_RULES
}

// Where the game stands, worked out from it (script 1.1: never asked).
export function standsFrom(chapters, shared, said = '') {
  const s = clean(said)
  if (s && s.length <= 80) return s.replace(/\.$/, '')
  const listed = listOf(shared && shared.listed).map(l => String(l.kind || ''))
  if (listed.some(k => /code|unity|godot|project|script/i.test(k))) return 'a prototype'
  const rules = chapters[8] ? chapters[8].fixed.length : 0
  const any = Object.values(chapters).some(c => c.fixed.length || c.ideas.length)
  if (!any) return 'nothing yet'
  return rules >= 2 ? 'a concept with some rules written down' : 'a concept'
}

// What the shared material couldn't give as text, by what it appears to be ("2 Photoshop files (pictures, not text)").
// (F233 task 5, 6c: the live look read "2 file I can't read as texts, 3 more than 200 files: the rest weren't looked
// ats" — the plural went on the last word, and a reason was counted as if it were a kind of file.) The kinds are
// counted with their own noun made plural ("2 files I can't read as text"); what couldn't be read is said by its
// reason ("the rest of 3 folders with more than 200 files"; one item by its name), and the last part joins with "and".
const NOUNS = /\b(file|scene|prefab|package|image|model|sound|video|PDF|archive|program|build|font|Doc|Sheet|link)\b/
export function plural(kind, n) {
  if (n === 1) return kind
  const pair = kind.match(/^(\w+) or (\w+)$/)
  if (pair) return `${pair[1]}s or ${pair[2]}s`
  // (F234 task 6, review fix from F233 task 9: "214 Unity bookkeepings", "2 Google files that has no text form" — a word
  // with no plural gets "files", and the verb after "that" agrees)
  const many = NOUNS.test(kind) ? kind.replace(NOUNS, w => `${w}s`) : MASS.test(kind) ? `${kind} files` : /s$/.test(kind) ? kind : `${kind}s`
  return many.replace(/\bthat (has|is|was)\b/, (m, v) => `that ${{ has: 'have', is: 'are', was: 'were' }[v]}`)
}
const MASS = /\b(bookkeeping|art|text|data|code|music|audio|information)$/i
export function unreadLine(shared) {
  const kinds = {}
  for (const l of listOf(shared && shared.listed)) {
    const k = clean(String(l.kind || 'a file').replace(/^an? /, '').replace(/\s*\(.*$/, ''))
    kinds[k] = (kinds[k] || 0) + 1
  }
  const parts = Object.entries(kinds).map(([k, n]) => `${n} ${plural(k, n)}`)
  const why = {}
  for (const u of listOf(shared && shared.unread)) {
    const w = clean(u.why || "couldn't be opened")
    ;(why[w] = why[w] || []).push(clean(u.what || ''))
  }
  for (const [w, whats] of Object.entries(why)) {
    const n = whats.length
    const big = w.match(/^more than (\d+) files/)
    if (big) parts.push(`the rest of ${n === 1 ? 'a folder' : `${n} folders`} with more than ${big[1]} files`)
    else parts.push(n === 1 && whats[0] ? `${whats[0]} (${w})` : `${n} links or files (${w})`)
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('')
}

// The sources: the shared text and every answer of the creative's (journaled, the idea itself, a test run's stand-ins).
function sources(project, state) {
  const read = f => (existsSync(join(project, f)) ? readFileSync(join(project, f), 'utf8') : null)
  let shared = null
  try { shared = JSON.parse(read(SHARED_JSON) || 'null') } catch (e) { shared = null }
  const material = listOf(shared && shared.sources).map(s => String(s.text || '')).join('\n\n')
  const answers = answersFrom((read('.bmuz/journal.jsonl') || '').split('\n'))
  if (process.env.BMUZ_TEST === '1') {
    try {
      const cfg = JSON.parse(read('bmuz.json') || '{}')
      for (const v of Object.values(cfg.testAnswers || {})) answers.push(...Object.values(v && typeof v === 'object' ? v : { a: v }).map(String))
    } catch (e) { /* no test answers */ }
  }
  const by = state.resultsBy || {}
  for (const x of [...listOf(by.idea && by.idea.idea), ...listOf(by.idea && by.idea.spark)]) answers.push(typeof x === 'string' ? x : String((x && x.text) || ''))
  return { shared, src: { material: normalise(material), answers: normalise(answers.join('\n\n')) } }
}

function by(state, step) {
  return { step, stage: 'Ideate', day: new Date().toISOString().slice(0, 10) }
}

// ---- 1.3 The Game So Far ----
// (F234, from F233 task 11) The creative says it's finished or played ("played" from the reading), but no rules were
// read: Ideate asks once for them (rules-ask), before carrying on. Only after the first reading, never twice.
export function wantsRules(read, finished, readStep) {
  const p = read && read.played
  const said = p === true || (typeof p === 'string' && /^\s*(yes|true)\b/i.test(p))
  return readStep === 'read' && said && !finished
}

export function soFar(project, state, script = loadScript(), readStep = 'read') {
  const { shared, src } = sources(project, state)
  const read = (state.resultsBy || {})[readStep] || {}
  const { chapters, notQuoted } = checkReading(read.sofar, src)
  const finished = isFinished(read, chapters)
  let doc = G.readFileIn(project, G.GDD) || G.newGdd(read.name)
  if (read.name && !G.gameName(doc)) doc = G.setName(doc, read.name)
  const b = by(state, readStep)
  for (const [n, c] of Object.entries(chapters)) doc = addLines(doc, Number(n), chapterLines(c, finished), b)
  // (F234: a finished game's rules that answer a question a later step asks are recorded for the engine; only on that
  // path, so a new idea's notes never stand in for a question)
  if (finished) {
    const recs = []
    for (const [n, c] of Object.entries(chapters)) for (const x of c.fixed) if (x.field) recs.push({ field: x.field, chapter: Number(n), line: `Fixed: ${x.shown}`, kind: F.kindOf('Fixed', x.theirs), step: readStep })
    F.addRecords(project, recs)
  }
  // The open questions go on the GDD's running list, each with its chapter.
  const open = GAP_ORDER.flatMap(n => (chapters[n] ? chapters[n].open.map(q => ({ n, q })) : []))
  doc = G.addToList(doc, 'Open Questions', open.map(o => `${o.q} (${G.chapterName(o.n)})`)).text
  writeFile(project, G.GDD, doc)
  G.writePage(project)
  // The message, from the script, word for word.
  const all = Object.values(chapters)
  const fixed = all.flatMap(c => c.fixed)
  // (F233: a finished game shows more of its rules, the Rulebook's first)
  const ordered = finished ? [...(chapters[8] ? chapters[8].fixed : []), ...all.filter(c => c !== chapters[8]).flatMap(c => c.fixed)] : fixed
  const clear = [...ordered.filter(x => x.theirs), ...ordered.filter(x => !x.theirs)].slice(0, finished ? 6 : 4).map(x => x.shown)
  const ideas = all.flatMap(c => c.ideas).slice(0, 4).map(x => x.shown)
  const gaps = GAP_ORDER.filter(n => chapters[n] && chapters[n].open.length).map(n => `${chapters[n].open[0]} (${G.chapterName(n)})`)
  const emptyGaps = GAP_ORDER.filter(n => !chapters[n] && !NOT_IN_IDEATE.includes(n)).map(n => `nothing yet (${G.chapterName(n)})`)
  const files = listOf(shared && shared.sources).filter(s => !/^(your |pasted text)/.test(String(s.name || ''))).length
  const slots = {
    files: files ? `${files} file${files > 1 ? 's' : ''}` : '',
    clear: clear.length ? clear : ['nothing yet'],
    // (F233: a finished game's own notes only, and no heading when there are none; its open list is what the rules
    // leave open, never "nothing yet (The Feelings)": Define reads those from the rules)
    ideas: ideas.length ? ideas : finished ? '' : ['nothing yet'],
    open: finished
      ? (gaps.length ? GAP_ORDER.flatMap(n => (chapters[n] ? chapters[n].open.map(q => `${q} (${G.chapterName(n)})`) : [])).slice(0, 6) : ['nothing: your rules cover it'])
      : [...gaps, ...emptyGaps].slice(0, Math.max(3, Math.min(5, gaps.length))),
    stands: standsFrom(chapters, shared, read.stands),
    unread: unreadLine(shared),
    link: G.pageLink(project),
  }
  // (F233) A finished game's version says its rules are fixed; it never says "Nothing here is decided yet".
  const r = E.renderLine(script, finished ? 'ideate.sofar.rules' : 'ideate.sofar', slots)
  if (r.error) throw new Error(r.error)
  writeFile(project, SO_FAR, r.text + '\n')
  // "Jump to Define" is offered only when the material already covers the feelings, pitch and core loop.
  // (their own words, checked: my reading of their notes doesn't count as their notes covering it)
  const covered = [1, 3, 4].filter(n => chapters[n] && chapters[n].fixed.some(x => x.theirs))
  const jump = covered.length === 3
  const rulesAsk = wantsRules(read, finished, readStep)
  writeFile(project, SO_FAR_JSON, JSON.stringify({ jump, covers: jump ? 'your notes already cover the feelings, pitch and core loop' : '', stands: slots.stands, path: finished ? 'convert' : 'new', chapters: Object.keys(chapters).map(Number), notQuoted, ...(rulesAsk ? { rulesAsk } : {}) }, null, 2) + '\n')
  return { chapters, notQuoted, jump, finished, rulesAsk, text: r.text }
}

// ---- 1.4–1.7: what a step gathered, added to its chapters ----
// The step's result: chapters { n: [items] } (an item: text, or { text, his }), sketches [{ name, question }],
// questions [text] (still open, for the GDD's list), ideas [text] (Ideas for Later), name.
export function addStep(project, state, step) {
  const { src } = sources(project, state)
  const r = (state.resultsBy || {})[step] || {}
  let doc = G.readFileIn(project, G.GDD) || G.newGdd(r.name)
  const b = by(state, step)
  let notQuoted = 0
  const touched = []
  const recs = []
  // (F234: on the conversion path only — a new idea's answers stay ideas for Define to choose between)
  const convert = E.isWanted({ when: '{convert}' }, state.results || {})
  const chapters = r.chapters && typeof r.chapters === 'object' && !Array.isArray(r.chapters) ? r.chapters : {}
  for (const [k, v] of Object.entries(chapters)) {
    const n = Number(k)
    if (!G.chapterName(n) || NOT_IN_IDEATE.includes(n)) continue
    const lines = []
    for (const x of listOf(v)) {
      const raw = typeof x === 'string' ? x : x && x.text
      const label = /^(Clear|Fixed|Idea|Open):\s*/i.exec(clean(raw))
      const it = checkItem(label ? (typeof x === 'string' ? clean(x).slice(label[0].length) : { ...x, text: clean(raw).slice(label[0].length) }) : x, src)
      if (!it) continue
      if (it.claimed && !it.theirs) notQuoted++
      const kind = label ? label[1][0].toUpperCase() + label[1].slice(1).toLowerCase() : 'Idea'
      lines.push(kind === 'Open' ? `Open: ${it.text}` : `${kind}: ${it.shown}`)
      // (an answer is "said", to confirm, never "fixed": only a rule read from their material is)
      if (convert && it.field && kind !== 'Open') recs.push({ field: it.field, chapter: n, line: `${kind}: ${it.shown}`, kind: F.kindOf('Clear', it.theirs), step })
    }
    const before = doc
    doc = addLines(doc, n, lines, b)
    if (doc !== before) touched.push(n)
  }
  F.addRecords(project, recs)
  const out = G.applyResult(doc, { sketches: r.sketches, questions: r.questions, ideas: r.ideas, name: r.name }, null, b)
  writeFile(project, G.GDD, out.text)
  G.writePage(project)
  return { touched, notQuoted, added: out.added }
}

// ---- 1.7 Your Project Page ----
export function page(project, state, script = loadScript(), env = process.env) {
  const doc = G.readFileIn(project, G.GDD) || G.newGdd()
  const ch = G.readGdd(doc)
  const loose = Object.values(ch).filter(c => c.level === 'loose').length
  const sketches = G.readList(doc, 'Sketches').length
  // The three questions that matter most for Define: the open ones in Define's chapters first (1–7, in its order).
  const qs = G.readList(doc, 'Open Questions')
  const rank = q => { const m = q.match(/\(([^()]+)\)\s*$/); const c = m ? G.CHAPTERS.find(x => x[1] === m[1]) : null; return c ? c[0] : 99 }
  const top = [...qs].sort((a, b) => rank(a) - rank(b)).slice(0, 3)
  G.writePage(project)
  const opened = G.openPage(project, env)
  const r = E.renderLine(script, 'ideate.page', { loose: String(loose), sketches: String(sketches), top: top.length ? top : ['none: the game so far covers what Define needs first'] })
  if (r.error) throw new Error(r.error)
  // (F234 rule 4: never a silent skip — what this stage didn't ask, each reopenable with one word)
  const skipped = F.skipList(state, script)
  writeFile(project, PAGE_MD, r.text + (skipped ? `\n\n${skipped}` : '') + '\n')
  return { loose, sketches, top, opened, text: r.text, skipped }
}

function writeFile(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mode, step] = process.argv.slice(2)
  const project = process.cwd()
  let state = null
  try { state = JSON.parse(readFileSync(join(project, '.bmuz/state.json'), 'utf8')) } catch (e) { state = null }
  if (!state) { console.log('✘ no .bmuz/state.json: this runs inside an ideate run'); process.exit(1) }
  try {
    if (mode === 'so-far') {
      // (F234: "so-far rules-read" is the second reading, after the rules were asked for)
      const readStep = /^[a-z][a-z0-9-]*$/.test(String(step || '')) ? step : 'read'
      const r = soFar(project, state, loadScript(), readStep)
      console.log(`✔ ${G.GDD}: version 1 — chapters ${Object.keys(r.chapters).join(', ') || 'none'} loose${r.notQuoted ? ` (${r.notQuoted} given as quotes but not found in their words: kept as my reading)` : ''}; ${SO_FAR}${r.jump ? ' · Jump to Define offered' : ''}${r.finished ? ' · a finished game: its rules are fixed' : ''}${r.rulesAsk ? ' · played, but no rules read: asking for them once' : ''}`)
      // (F233: the path, for the steps that run only on it: "when": "{convert}" / "{fresh}"; F234: rulesask)
      console.log(JSON.stringify({ results: { convert: r.finished ? 'yes' : 'no', fresh: r.finished ? 'no' : 'yes', rulesask: r.rulesAsk ? 'yes' : 'no' } }))
    } else if (mode === 'add' && /^[a-z][a-z0-9-]*$/.test(String(step || ''))) {
      const r = addStep(project, state, step)
      console.log(`✔ ${G.GDD}: ${step} — chapters ${r.touched.join(', ') || 'none'}${Object.entries(r.added).map(([l, a]) => `; ${a.length} on ${l}`).join('')}${r.notQuoted ? ` (${r.notQuoted} quotes not found in their words: kept as my reading)` : ''}`)
    } else if (mode === 'page') {
      const r = page(project, state)
      console.log(`✔ ${PAGE_MD}: ${r.loose} chapters loose, ${r.sketches} sketches · ${r.opened}`)
    } else {
      console.log('✘ use: node ideate.mjs so-far | add <step> | page')
      process.exit(1)
    }
  } catch (err) {
    console.log(`✘ ${String(err && err.message ? err.message : err).slice(0, 300)}`)
    process.exit(1)
  }
}
