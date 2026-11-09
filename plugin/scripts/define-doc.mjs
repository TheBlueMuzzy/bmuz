// Define's documents (pipeline "define"): reads DISCOVER.md's shelves and writes the concept, GDD Part 1.
// node define-doc.mjs            (step "write"; run in the project folder)
//
// The design: framework .planning/research/bmuz-vision/define-research.md, section 5(c) and section 6
// "Muzzy's answers" (Define writes GDD Part 1 only; Design writes Part 2, the TDD and the feature map).
// - GDD.md: Part 1 (the concept) is written field by field. A field changes only when this run chose it;
//   every other line of the file (Part 2, the creative's hand edits, anything else) is kept exactly.
//   A file without the layout gets it: Part 1 at the top, Part 2 / Open questions / Changes added.
// - DISCOVER.md: bricks chosen in this run are annotated ("· → chosen (Define run 1: story)"), never trimmed.
// - Every change to a field already written is logged under GDD "## Changes" (date · what · why · stage).
// It reads what the run chose from the engine's own files (.bmuz/state.json), like discover-doc.mjs, and runs
// as a script step, so the engine checkpoints both files first and undo puts them back.
// This file also holds the parsing the digest, the lint and the stage scripts share.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import { SHELVES, TALK_KEYS } from './discover-doc.mjs'

export const GDD = '.planning/GDD.md'
export const DISCOVER = '.planning/DISCOVER.md'
export const DIGEST = '.planning/research/define-digest.md'
export const OPEN = 'open — not chosen yet'

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const lines = text => String(text).replace(/\r\n/g, '\n').split('\n')

// ---- DISCOVER.md: the shelves, every brick with a short id ([EX3] = the 3rd brick on Experience goals) ----
export const SHELF_CODES = {
  'Spark': 'SP', 'Experience goals': 'EX', 'Theme': 'TH', 'Nouns': 'NO', 'Verbs': 'VE', 'Verb × noun grid': 'GR',
  'Decisions': 'DE', 'Mechanism shelf': 'ME', 'Prior art': 'PA', 'Hooks & anchors': 'HA', 'Twists': 'TW',
  'On ice': 'OI', 'Open questions': 'OQ', 'Hopes & fears': 'HF',
}
export const BRICK_ID = /^[A-Z]{2}\d{1,4}$/
const KNOWN_LABELS = new Set(Object.values(TALK_KEYS).map(([, label]) => label).filter(Boolean))
const PROVENANCE = / — run (\d+)((?: · .*)?)$/

// Reads DISCOVER.md. Returns { lines, shelves: [{ name, code, bricks }], discoverRuns, seed } or null when the
// file has no "## Shelves". A brick: { id, at (its line index), text, label, by, source, run, defineNotes }.
export function readShelves(text) {
  const all = lines(text)
  const shelvesAt = all.findIndex(l => /^## Shelves\b/.test(l))
  if (shelvesAt < 0) return null
  let end = all.findIndex((l, i) => i > shelvesAt && /^## /.test(l))
  if (end < 0) end = all.length
  const shelves = []
  let extra = 0
  for (let i = shelvesAt + 1; i < end; i++) {
    const h = all[i].match(/^### (.+?)\s*(?:—.*)?$/)
    if (h) {
      const name = h[1].trim()
      const code = SHELF_CODES[name] || `X${String.fromCharCode(65 + (extra++ % 26))}`
      shelves.push({ name, code, bricks: [] })
      continue
    }
    const shelf = shelves[shelves.length - 1]
    if (!shelf || !/^- /.test(all[i])) continue
    const body = all[i].slice(2).trimEnd()
    const p = body.match(PROVENANCE)
    const text = clean(p ? body.slice(0, p.index) : body)
    const tail = p ? p[2].split(' · ').map(clean).filter(Boolean) : []
    const by = tail[0] || ''
    const source = !p ? 'hand-added' : by === "the creative's words" ? 'creative' : by === 'picked by the creative' ? 'picked' : by === "Claude's suggestion" ? 'Claude' : 'research'
    const lab = text.match(/^([^:]{2,48}): /)
    const label = lab && KNOWN_LABELS.has(lab[1]) ? lab[1] : ''
    shelf.bricks.push({
      id: `${shelf.code}${shelf.bricks.length + 1}`, at: i, text, label, by, source,
      run: p ? Number(p[1]) : 0,
      defineNotes: tail.filter(t => /Define run \d+/.test(t)),
    })
  }
  const discoverRuns = all.reduce((m, l) => Math.max(m, Number((l.match(/^### Run (\d+)\b/) || [])[1] || 0)), 0)
  const seed = (all.find(l => /^Seed:/.test(l)) || '').replace(/^Seed:\s*/, '').replace(/ · last run \d{4}-\d\d-\d\d$/, '')
  const brief = (seed.match(/"([^"]+)" \(the creative's words\)/) || [])[1] || ''
  return { lines: all, shelves, discoverRuns, seed, brief }
}

export const allBricks = doc => doc.shelves.flatMap(s => s.bricks.map(b => ({ ...b, shelf: s.name })))

// ---- GDD Part 1: the concept, as labelled fields under eight headings ----
// [heading, [[result key, field label, list?]]]. The key is the talk step's result key (scope's "product" is
// split into its four fields). Lists are written one "- " line each (pillars numbered).
export const PART1 = [
  ['The story', [['story', 'Story', true], ['pitch', 'Pitch'], ['youAre', 'You are']]],
  ['Experience targets', [['primaries', 'Primary feelings', true], ['knowWhen', "We'll know when"], ['notThis', 'Not this game'], ['audience', "Who it's for"], ['fantasy', 'The dream']]],
  ['Pillars', [['pillars', 'Pillars', true]]],
  ['Made of', [['coreVerbs', 'Core verbs', true], ['mechanisms', 'Mechanisms', true], ['interactables', 'Players act on'], ['theme', 'Theme'], ['tone', 'Tone'], ['hook', 'Hook'], ['anchor', 'Anchor']]],
  ['Scope per release', [['musts', 'First release (musts)', true], ['later', 'Later releases', true], ['should', 'Should', true], ['could', 'Could', true], ['wont', "Won't", true], ['size', 'Size read (rough, from Claude)']]],
  ['Product', [['platform', 'Platform'], ['played', 'Played'], ['session', 'Session length'], ['players', 'Players']]],
  ['Risks & probes', [['risks', 'Risks', true]]],
  ['Not this game, for now', [['parked', 'Parked ideas', true]]],
]
export const PART1_HEADING = '## Part 1 — The concept'
export const SHELVES_LABEL = 'From the shelves'
// The parts that must be chosen before Design starts (stage refuses while they are open), with the step that chooses each.
// (in pipeline order, so the first one open names the earliest step to go back to)
export const CORE = [['Experience targets', 'Primary feelings', 'direction'], ['The story', 'Story', 'story'], ['Pillars', 'Pillars', 'pillars'], ['Scope per release', 'First release (musts)', 'scope']]

// One chosen item as text. An item is text, or an object: {text, his?, picked?, brick?} or a field's own shape.
export function itemText(x, bricks = new Map()) {
  if (typeof x === 'string') return clean(x)
  if (!x || typeof x !== 'object') return ''
  const brickText = () => {
    const b = typeof x.brick === 'string' ? bricks.get(x.brick) : null
    return b ? clean(b.label ? b.text.slice(b.label.length + 1) : b.text) : ''
  }
  if (x.pillar) return `${clean(x.pillar)}${x.kind ? ` (${clean(x.kind)})` : ''} — settles: ${clean(x.settles) || 'not said yet'}`
  // (a backup is offered, never required: it shows only when there is one)
  if (x.verb && (x.lead !== undefined || x.backup !== undefined)) return `${clean(x.verb)} — lead: ${clean(x.lead) || 'open'}${clean(x.backup) ? ` · backup: ${clean(x.backup)}` : ''}`
  if (x.verb) return `${clean(x.verb)}${x.outcome ? ` → ${clean(x.outcome)}` : ''}${x.fun ? ` (fun because: ${clean(x.fun)})` : ''}`
  if (x.risk) return `${clean(x.risk)} → test: ${clean(x.test) || 'not named'} → we'd rethink if: ${clean(x.rethink) || 'not said'} → status: ${clean(x.status) || 'open'}`
  if (x.what) return `${clean(x.what)} — why: ${clean(x.why)}`
  if (x.idea) return `${clean(x.idea)} → ${clean(x.where) || 'kept on ice'}`
  return clean(x.text) || brickText()
}

// A field's markdown lines from its items (none = open).
export function fieldLines(label, items, list, bricks) {
  const texts = items.map(x => itemText(x, bricks)).filter(Boolean)
  if (!texts.length) return [`**${label}:** ${OPEN}`]
  if (!list) return [`**${label}:** ${texts.join(' / ')}`]
  return [`**${label}:**`, ...texts.map((t, i) => (label === 'Pillars' ? `${i + 1}. ${t}` : `- ${t}`))]
}

// Splits a GDD into: head (before Part 1), Part 1's subsections ({ name, lines }), and the rest after Part 1.
export function readGdd(text) {
  const all = lines(text)
  const at = all.findIndex(l => l.startsWith(PART1_HEADING))
  if (at < 0) return { all, at: -1 }
  let end = all.findIndex((l, i) => i > at && /^## /.test(l))
  if (end < 0) end = all.length
  const intro = []
  const subs = []
  for (const l of all.slice(at + 1, end)) {
    const h = l.match(/^### (.+?)\s*$/)
    if (h) subs.push({ name: h[1], lines: [l] })
    else if (subs.length) subs[subs.length - 1].lines.push(l)
    else intro.push(l)
  }
  return { all, at, end, head: all.slice(0, at), heading: all[at], intro, subs, rest: all.slice(end) }
}

// The fields of one subsection: [{ label, start, end }] (line indexes into sub.lines; end is exclusive).
export function fieldsOf(subLines) {
  const out = []
  subLines.forEach((l, i) => {
    const m = l.match(/^\*\*(.+?):\*\*/)
    if (m) {
      if (out.length) out[out.length - 1].end = i
      out.push({ label: m[1], start: i, end: subLines.length })
    }
  })
  return out
}

// A field's text (its lines, trailing blank lines left out), or null when it isn't there.
export function fieldText(sub, label) {
  const f = fieldsOf(sub.lines).find(x => x.label === label)
  if (!f) return null
  const body = sub.lines.slice(f.start, f.end)
  while (body.length > 1 && !body[body.length - 1].trim()) body.pop()
  return body.join('\n')
}

export const isOpen = t => t === null || new RegExp(`^\\*\\*[^*]+:\\*\\*\\s*(${OPEN}|open)?\\s*$`).test(String(t).trim())

// The items under a list field ("- x" / "1. x" lines).
export const fieldItems = t => (t === null ? [] : lines(t).slice(1).map(l => l.match(/^\s*(?:- |\d+\.\s+)(.*)$/)).filter(Boolean).map(m => m[1].trim()))

// The "Define run N" / "Discover run K" the GDD's phase line names (0 = none).
export function gddRuns(text) {
  const phase = lines(text || '').find(l => /^Current phase:/.test(l)) || ''
  const define = Math.max(0, ...[...String(text || '').matchAll(/Define run (\d+)/g)].map(m => Number(m[1])))
  return { define, discover: Number((phase.match(/through Discover run (\d+)/) || [])[1] || 0), phase }
}

// ---- What this run chose (from the engine's .bmuz/state.json) ----
// The results of the talk steps that really ran (not skipped by a wrap-up), later steps over earlier ones
// (the tensions step may hand back a changed pillar, say). Returns { results, by: key → step id }.
export function chosen(steps, state) {
  const skipped = state.skipped || []
  const results = {}
  const by = {}
  for (const s of steps) {
    if (s.kind !== 'talk' || !state.finished.includes(s.id) || skipped.includes(s.id)) continue
    for (const [k, v] of Object.entries((state.resultsBy || {})[s.id] || {})) {
      if (v === null || v === undefined) continue
      results[k] = v
      by[k] = s.id
    }
  }
  // scope's product: one object, written as four fields
  const p = results.product
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    for (const k of ['platform', 'played', 'session', 'players']) if (p[k] !== undefined && results[k] === undefined) { results[k] = p[k]; by[k] = by.product }
  }
  return { results, by }
}

const given = v => listOf(v).some(x => (typeof x === 'string' ? x.trim() : x && typeof x === 'object' && Object.keys(x).length))

// Every brick id this run's results point at: id → { parts: [step ids], kind: 'chosen' | 'brought in' | 'parked', where }.
export function brickRefs(results, by) {
  const refs = new Map()
  const note = (id, part, kind, where) => {
    if (typeof id !== 'string' || !BRICK_ID.test(id)) return
    const had = refs.get(id) || { parts: [], kind, where }
    if (!had.parts.includes(part)) had.parts.push(part)
    // parked wins over chosen only when nothing else chose it
    if (kind !== 'parked') had.kind = kind
    refs.set(id, had)
  }
  for (const [k, v] of Object.entries(results)) {
    for (const x of listOf(v)) {
      if (!x || typeof x !== 'object') continue
      const kind = k === 'parked' ? 'parked' : k === 'broughtIn' ? 'brought in' : 'chosen'
      for (const id of listOf(x.brick)) note(id, by[k] || k, kind, x.where)
      if (x.lead && typeof x.leadBrick === 'string') note(x.leadBrick, by[k] || k, kind)
      if (x.backup && typeof x.backupBrick === 'string') note(x.backupBrick, by[k] || k, kind)
    }
  }
  return refs
}

// ---- Merging the run into GDD.md ----
export function newGdd(brief) {
  return [
    '# Game Design Document',
    `Idea: ${brief ? `"${brief}" (from DISCOVER.md)` : '(see DISCOVER.md)'}`,
    'Current phase: Define',
    '',
    PART1_HEADING,
    '',
    '## Part 2 — The game',
    'Design writes this: how it plays, systems, look & sound.',
    '',
    '## Open questions',
    '',
    '## Changes',
    'Date · what changed · why · which stage.',
    '',
  ].join('\n')
}

const PART1_INTRO = 'Written by /define: about one page. Hand edits are kept: a field changes only when a Define run chooses it again, and every change is logged under Changes. "open — not chosen yet" marks what is still to choose.'

// Merges this run's choices into the GDD text. Returns { text, changed: [labels], chosenNow: [labels], open: [labels] }.
// run = { n, discoverRuns, date, results, by, bricks (Map id → brick), refs (brickRefs), unmatched: n, brief }.
export function mergeGdd(oldText, run) {
  let text = oldText && oldText.trim() ? String(oldText).replace(/\r\n/g, '\n') : newGdd(run.brief)
  let g = readGdd(text)
  if (g.at < 0) {
    // An older GDD without the layout: Part 1 goes above its first section, which becomes Part 2.
    const all = g.all
    let first = all.findIndex(l => /^## /.test(l))
    if (first < 0) first = all.length
    text = [...all.slice(0, first), PART1_HEADING, '', '## Part 2 — The game', 'Design writes this. The sections below were here before Define wrote Part 1.', '', ...all.slice(first)].join('\n')
    g = readGdd(text)
  }
  const first = !g.subs.length
  const changed = []
  const chosenNow = []
  const open = []
  const subs = []
  for (const [name, fields] of PART1) {
    const sub = g.subs.find(s => s.name === name) || { name, lines: [`### ${name}`, ''] }
    for (const [key, label, list] of fields) {
      const fresh = given(run.results[key]) ? fieldLines(label, listOf(run.results[key]), list, run.bricks) : null
      const old = fieldText(sub, label)
      if (fresh === null) {
        // Not chosen this run: the field stays exactly as it is (a missing one comes back as open).
        if (old === null) insertField(sub, [`**${label}:** ${OPEN}`])
        if (isOpen(old)) open.push(`${name}: ${label}`)
        continue
      }
      const now = fresh.join('\n')
      if (old !== null && old.trim() === now.trim()) continue
      if (old === null) insertField(sub, fresh)
      else replaceField(sub, label, fresh)
      if (!first && !isOpen(old)) changed.push({ name, label, step: run.by[key] })
      else chosenNow.push(label)
    }
    subs.push(sub)
  }
  // Subsections the creative added inside Part 1 are kept, after the eight.
  for (const s of g.subs) if (!PART1.some(([n]) => n === s.name)) subs.push(s)

  // The line that ties Part 1 to the shelves: how many bricks this run chose (the lint counts DISCOVER.md's marks).
  const marked = [...run.refs.values()].filter(r => r.kind !== 'parked').length
  const shelvesLine = `**${SHELVES_LABEL}:** Define run ${run.n} chose ${marked} brick${marked === 1 ? '' : 's'} from DISCOVER.md's shelves (marked there "→ chosen" / "→ brought in")${run.unmatched ? ` · ${run.unmatched} brick id${run.unmatched === 1 ? '' : 's'} not found on a shelf, written as new` : ''}`
  let intro = g.intro.filter(l => !l.startsWith(`**${SHELVES_LABEL}:**`))
  if (!intro.some(l => l.trim())) intro = ['', PART1_INTRO, '']
  while (intro.length && !intro[intro.length - 1].trim()) intro.pop()
  intro.push('', shelvesLine, '')
  const part1 = [g.heading, ...intro, ...subs.flatMap(s => tidy(s.lines))]

  // The phase line: a Define run (re)opens the concept; the stage script moves it to Design when locked.
  const head = g.head.slice()
  const phase = `Current phase: Define · Define run ${run.n} · read DISCOVER.md through Discover run ${run.discoverRuns}`
  const pAt = head.findIndex(l => /^Current phase:/.test(l))
  if (pAt >= 0) head[pAt] = phase
  else head.splice(Math.min(1, head.length), 0, phase) // under the title

  let rest = g.rest.slice()
  rest = ensureSection(rest, 'Open questions', [])
  rest = ensureSection(rest, 'Changes', ['Date · what changed · why · which stage.'])
  // The risks' cheapest tests become open questions (Design runs them).
  const probes = listOf(run.results.risks).filter(r => r && typeof r === 'object' && clean(r.test)).map(r => `- ${clean(r.risk)}: ${clean(r.test)} (a probe from Define run ${run.n}) · status: open`)
  rest = addUnder(rest, 'Open questions', probes)
  const logs = []
  const why = clean(run.results.whyChanged) || 'the creative chose it again'
  if (first) logs.push(`- ${run.date} · Concept written (Part 1): ${chosenNow.length} fields chosen; still open: ${!open.length ? 'none' : chosenNow.length ? open.map(o => o.split(': ')[1]).join(', ') : 'every field'} · from DISCOVER.md's shelves · Define run ${run.n}`)
  else {
    for (const c of changed) logs.push(`- ${run.date} · ${c.name}: "${c.label}" changed · why: ${why} (step ${c.step}) · Define run ${run.n}`)
    if (chosenNow.length) logs.push(`- ${run.date} · Chosen: ${chosenNow.join(', ')} · were open · Define run ${run.n}`)
  }
  for (const t of listOf(run.results.resolved)) {
    const tx = t && typeof t === 'object' ? `${clean(t.tension)} → ${clean(t.choice)}${t.note ? `: ${clean(t.note)}` : ''}` : clean(t)
    if (tx) logs.push(`- ${run.date} · Tension: ${tx} · the fit check found it · Define run ${run.n}`)
  }
  rest = addUnder(rest, 'Changes', logs)

  const out = [...head, ...part1, ...rest].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n')
  return { text: out, changed: changed.map(c => c.label), chosenNow, open }
}

function tidy(subLines) {
  const out = subLines.slice()
  while (out.length > 1 && !out[out.length - 1].trim()) out.pop()
  out.push('')
  return out
}

function insertField(sub, fresh) {
  let at = sub.lines.length
  while (at > 1 && !sub.lines[at - 1].trim()) at--
  // A blank line between fields: without it a markdown viewer runs them together into one paragraph.
  sub.lines.splice(at, 0, ...(at > 1 ? ['', ...fresh] : fresh))
}

function replaceField(sub, label, fresh) {
  const f = fieldsOf(sub.lines).find(x => x.label === label)
  let end = f.end
  while (end > f.start + 1 && !sub.lines[end - 1].trim()) end--
  sub.lines.splice(f.start, end - f.start, ...fresh)
}

const sectionAt = (rest, name) => rest.findIndex(l => new RegExp(`^## ${name}\\b`, 'i').test(l))

function ensureSection(rest, name, body) {
  if (sectionAt(rest, name) >= 0) return rest
  const out = rest.slice()
  while (out.length && !out[out.length - 1].trim()) out.pop()
  return [...out, '', `## ${name}`, ...body, '']
}

// Adds lines at the end of a section, each only once (a run saved twice adds nothing twice).
function addUnder(rest, name, add) {
  const at = sectionAt(rest, name)
  let end = rest.findIndex((l, i) => i > at && /^## /.test(l))
  if (end < 0) end = rest.length
  const have = new Set(rest.slice(at, end).map(l => l.trim()))
  const fresh = add.filter(l => !have.has(l.trim()))
  if (!fresh.length) return rest
  let ins = end
  while (ins > at + 1 && !rest[ins - 1].trim()) ins--
  return [...rest.slice(0, ins), ...fresh, ...rest.slice(ins)]
}

// ---- Annotating DISCOVER.md: chosen bricks get a mark; no line is removed or rewritten ----
export function annotateDiscover(text, doc, refs, n) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n'
  const all = lines(text)
  let marked = 0
  for (const b of allBricks(doc)) {
    const r = refs.get(b.id)
    if (!r) continue
    if (new RegExp(`Define run ${n}\\b`).test(all[b.at])) continue // already marked in this run
    const mark = r.kind === 'parked'
      ? `parked (Define run ${n}: ${clean(r.where) || r.parts.join(', ')})`
      : r.kind === 'brought in' ? `→ brought in (Define run ${n})` : `→ chosen (Define run ${n}: ${r.parts.join(', ')})`
    all[b.at] = `${all[b.at].trimEnd()} · ${mark}`
    marked++
  }
  return { text: all.join(eol), marked }
}

// How many bricks DISCOVER.md marks as chosen or brought in by Define run n (the lint's cross-check).
export const markedIn = (text, n) => lines(text).filter(l => /^- /.test(l) && new RegExp(`→ (chosen|brought in) \\(Define run ${n}\\b`).test(l)).length

// The Define run number the digest wrote (a hand-editable file: re-checked as a plain number).
export function digestRun(text) {
  const m = String(text || '').match(/^Define run: (\d{1,3})\b/m)
  return m ? Number(m[1]) : 0
}

// ---- The command ----
function main() {
  const project = process.cwd()
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const read = f => (existsSync(join(project, f)) ? readFileSync(join(project, f), 'utf8') : null)
  // bmuz.json is hand-editable: the pipeline name must be a plain name before it goes into a path.
  const cfg = JSON.parse(read('bmuz.json') || '{}')
  if (typeof cfg.pipeline !== 'string' || !E.NAME_RE.test(cfg.pipeline)) { console.log('✘ bmuz.json "pipeline" isn\'t a plain pipeline name'); process.exit(1) }
  const pipeline = JSON.parse(readFileSync(join(root, 'pipelines', `${cfg.pipeline}.json`), 'utf8'))
  const state = JSON.parse(read('.bmuz/state.json') || 'null')
  if (!state) { console.log('✘ no .bmuz/state.json: the write step runs inside a define run'); process.exit(1) }
  const discoverText = read(DISCOVER)
  const doc = discoverText && readShelves(discoverText)
  if (!doc) { console.log(`✘ ${DISCOVER} is missing or has no "## Shelves": Define builds on Discover's shelves. Run discover first.`); process.exit(1) }
  const gddText = read(GDD)
  const n = digestRun(read(DIGEST)) || gddRuns(gddText).define + 1
  const { results, by } = chosen(pipeline.steps, state)
  const bricks = new Map(allBricks(doc).map(b => [b.id, b]))
  const refs = brickRefs(results, by)
  let unmatched = 0
  for (const id of [...refs.keys()]) if (!bricks.has(id)) { refs.delete(id); unmatched++ }
  const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, the local day
  const merged = mergeGdd(gddText, { n, discoverRuns: doc.discoverRuns, date, results, by, bricks, refs, unmatched, brief: doc.brief })
  const ann = annotateDiscover(discoverText, doc, refs, n)
  mkdirSync(join(project, '.planning'), { recursive: true })
  writeFileSync(join(project, GDD), merged.text)
  if (ann.marked) writeFileSync(join(project, DISCOVER), ann.text)
  console.log(`✔ ${GDD}: Define run ${n} — chosen now: ${merged.chosenNow.length}, changed: ${merged.changed.length}, still open: ${merged.open.length} · ${DISCOVER}: ${ann.marked} bricks marked${unmatched ? ` · ${unmatched} brick ids not on a shelf` : ''}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
