// The start's intake (pipeline "start", step "intake"; F225): what the creative shared at the start goes onto
// DISCOVER.md's shelves, and the engine works out where they really are and where to start them.
// node intake.mjs        (run in the project folder)
//
// The design: framework .planning/research/bmuz-vision/entry-research.md (rules 4 and 5, the proposal screen).
// Claude READS the material in the "opening" talk step and hands back quotes sorted by key; this script does the
// writing and the judging, the same way every time:
// - Every quote is checked against the material itself (the pasted text, the files named): found = the
//   creative's own words, marked "from your material"; not found = Claude's reading, marked as that. Never
//   reworded here, never trimmed later (DISCOVER.md's shelves only grow).
// - Discover's material goes onto DISCOVER.md's shelves as a run of its own; Define's blocks (feelings, story,
//   pillars, scope…) go into intake.json's "given", which the engine carries into the chosen stage: each step
//   shows them first, "Keep" one tap.
// - The gap map (each stage: covered / partly / not yet) and the proposal (stage, step, one line why, a catch-up
//   when the goal is later than the material supports) come from fixed rules below, not from Claude's opinion.
// Writes .planning/research/intake.json (the engine reads its "given") and .planning/research/intake.md (the
// proposal screen the "propose" step shows word for word).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import { TALK_KEYS, itemText, mergeDoc } from './discover-doc.mjs'

export const INTAKE_JSON = '.planning/research/intake.json'
export const INTAKE_MD = '.planning/research/intake.md'
export const INTAKE_SCREEN = '.planning/research/intake-proposal.md'
const DISCOVER = '.planning/DISCOVER.md'

// Design-stage facts a rulebook or a prototype brings (no Discover shelf, no Define field).
export const DESIGN_KEYS = ['rules', 'playtests', 'built', 'released']

// Discover's material, grouped the way the gap map counts it: a group counts when any of its keys has an item.
// The first four are Discover's own talk steps, in order: the first one the material doesn't cover is where
// Discover starts (the steps above it are answered by the material).
export const DISCOVER_GROUPS = [
  ['spark', ['youAre', 'spark'], 'all'],
  ['experience', ['experiences', 'stories', 'fantasies', 'aesthetics', 'players', 'curiosity', 'toy'], 'any'],
  ['theme', ['senses', 'known', 'life', 'outside', 'tone'], 'any'],
  ['simulation', ['nouns', 'verbs', 'grid', 'choices', 'problems', 'skills'], 'any'],
  ['mechanisms', ['feelsRight', 'pastedOn', 'genres'], 'any'],
  ['prior art', ['reminds', 'missed', 'hooks', 'anchors', 'twists', 'extremes'], 'any'],
]
export const DISCOVER_COVERED_ITEMS = 20
// Define's must-haves before Design (define-doc.mjs CORE, by result key) and their plain words.
export const DEFINE_CORE = [['primaries', 'the primary feelings'], ['story', 'the 3–5 line story'], ['pillars', 'the pillars'], ['musts', 'the first-release musts']]

// The stages in order (F228: Ideate replaced Discover as the first stage; Deliver and Release are two stages).
// The material groups and the shelves keep Discover's names (DISCOVER.md still carries what the start read, so a
// project entering Define straight away has shelves to build on); the gap map calls their stage Ideate.
const ORDER = ['ideate', 'define', 'design', 'develop', 'deliver', 'release']
const GOALS = { open: 'ideate', pin: 'define', work: 'design', build: 'develop' }
const GAP_NAMES = { ideate: 'Ideate (the material)', define: 'Define (the blocks)', design: 'Design (assembling them)', develop: 'Develop (the production model)', deliver: 'Deliver (ready to hand over)', release: 'Release (the public)' }

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const has = (m, k) => listOf(m[k]).some(x => clean(typeof x === 'string' ? x : x && x.text))

// Text as compared for "is this a quote?": case, quote marks, dashes, markdown marks and spacing ignored.
export function normalise(s) {
  return String(s || '').toLowerCase()
    .replace(/[‘’`´]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—−]/g, '-')
    .replace(/[*_#>|]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Is `text` the creative's own words, found in `sources` (normalised)? A quote cut with "…" counts when every
// part is there; the quote's own end punctuation doesn't have to match.
export function isVerbatim(text, sources) {
  const parts = normalise(text).replace(/^["']|["']$/g, '').split(/\s*(?:\.\.\.|…)\s*/).map(p => p.replace(/[.,;:!?"']+$/, '').trim()).filter(Boolean)
  return parts.length > 0 && parts.every(p => p.length >= 3 && sources.includes(p))
}

// Sorts and checks the opening's material. defineKeys = Define's talk result keys.
// Returns { items: { key: [{ text, his }] }, unknown: [keys], notVerbatim }.
export function checkMaterial(material, sourceText, defineKeys) {
  const known = new Set([...Object.keys(TALK_KEYS), ...defineKeys, ...DESIGN_KEYS])
  const src = normalise(sourceText)
  const items = {}
  const unknown = []
  let notVerbatim = 0
  for (const [k, v] of Object.entries(material && typeof material === 'object' ? material : {})) {
    if (!known.has(k)) { unknown.push(k); continue }
    for (const x of listOf(v)) {
      const text = typeof x === 'string' ? clean(x) : x && typeof x === 'object' ? itemText(k, x) : ''
      if (!text) continue
      const his = isVerbatim(text, src)
      if (!his) notVerbatim++
      ;(items[k] = items[k] || []).push(his ? { text, his: true } : { text })
    }
  }
  return { items, unknown, notVerbatim }
}

// The gap map: each stage covered / partly / not yet, with what it rests on.
// (the map counts a group with any of its keys; `entryGot` = the groups whose step the material fully answers,
// where Spark needs both its "You are" line and the spark itself)
export function gapMap(items) {
  const got = DISCOVER_GROUPS.filter(([, keys]) => keys.some(k => has(items, k))).map(([n]) => n)
  const entryGot = DISCOVER_GROUPS.filter(([, keys, need]) => (need === 'all' ? keys.every(k => has(items, k)) : keys.some(k => has(items, k)))).map(([n]) => n)
  const core = DEFINE_CORE.filter(([k]) => has(items, k))
  const anyDefine = core.length > 0 || ['pitch', 'coreVerbs', 'mechanisms', 'wont', 'notThis', 'fantasy'].some(k => has(items, k))
  // Discover is "covered" only with real breadth AND depth: one paragraph touches many groups with a line each
  // (headless entry-concept 2026-11-09: a six-sentence concept read as "covered"), a Discover run leaves dozens.
  const discoverItems = DISCOVER_GROUPS.flatMap(([, keys]) => keys).reduce((n, k) => n + listOf(items[k]).length, 0)
  const g = {
    ideate: got.length >= 4 && discoverItems >= DISCOVER_COVERED_ITEMS ? 'covered' : got.length ? 'partly' : 'not yet',
    define: core.length === DEFINE_CORE.length ? 'covered' : anyDefine ? 'partly' : 'not yet',
    design: has(items, 'rules') && has(items, 'playtests') ? 'covered' : has(items, 'rules') || has(items, 'playtests') ? 'partly' : 'not yet',
    develop: has(items, 'released') ? 'covered' : has(items, 'built') ? 'partly' : 'not yet',
    deliver: has(items, 'released') ? 'covered' : 'not yet',
    release: has(items, 'released') ? 'partly' : 'not yet',
  }
  const why = {
    ideate: got.length ? `${discoverItems} piece${discoverItems === 1 ? '' : 's'} of material, touching ${got.join(', ')} (${got.length} of ${DISCOVER_GROUPS.length})` : 'no material yet',
    define: core.length ? `has ${core.map(([, w]) => w).join(', ')}${core.length < DEFINE_CORE.length ? `; still open: ${DEFINE_CORE.filter(c => !core.includes(c)).map(([, w]) => w).join(', ')}` : ''}` : anyDefine ? `some blocks, none of ${DEFINE_CORE.map(([, w]) => w).join(', ')}` : 'no blocks chosen yet',
    design: g.design === 'not yet' ? 'no rules or playtests yet' : [has(items, 'rules') && 'rules written', has(items, 'playtests') && 'playtested'].filter(Boolean).join(', '),
    develop: has(items, 'built') ? 'a prototype exists' : 'nothing built yet',
    deliver: has(items, 'released') ? 'a version is out' : 'nothing ready to hand over yet',
    release: has(items, 'released') ? 'something is out' : 'not released',
  }
  return { gaps: g, why, discoverGot: entryGot }
}

// What a stage needs from the ones before it (rule 4: a later start never blocks, it catches up first).
const ready = (stage, g) => ({
  ideate: true,
  define: g.ideate !== 'not yet' || g.define !== 'not yet',
  design: g.define === 'covered',
  develop: g.define === 'covered' && g.design === 'covered',
  deliver: g.develop === 'covered',
  release: g.develop === 'covered',
}[stage])
const missingFor = (stage, items, g) => {
  if (stage === 'define') return 'some material to choose from'
  const core = DEFINE_CORE.filter(([k]) => !has(items, k)).map(([, w]) => w)
  if (stage === 'design') return core.join(', ')
  return [core.length ? core.join(', ') : '', g.design !== 'covered' ? 'the rules, tested on paper (Design)' : ''].filter(Boolean).join(' and ')
}

// Where to start: { stage, at, why, catchUp, earlier }. where = Question 1's answer; goal = Question 2's.
// Ideate always starts at its first step ("show me what you have"): it shows what the start read and asks for the
// rest (a Drive folder, more files), so nothing the material answered is asked again there either.
export function propose({ where, goal, items, g, discoverGot }) {
  const asked = where === 'nothing' || where === 'spark' ? 'ideate' : GOALS[goal] || 'ideate'
  let stage = asked
  while (stage !== 'ideate' && !ready(stage, g)) stage = ORDER[ORDER.indexOf(stage) - 1]
  const name = s => E.stageOf(s).name
  const at = stage === 'define' ? 'digest' : 'first'
  const catchUp = stage !== asked ? `${name(asked)} needs ${missingFor(asked, items, g)}; I'll start you in ${name(stage)} to make ${stage === 'ideate' ? 'that' : 'those'} first, with everything your material already chose kept in one tap.` : null
  let why
  if (where === 'nothing') why = "Nothing to read yet, so we start where every game starts: Ideate — the idea in your own words, or finding one together."
  else if (where === 'spark') why = 'A spark is the first piece of material: Ideate starts from your words and writes back the game so far, then asks only about the gaps.'
  else if (catchUp) why = catchUp
  else if (stage === 'ideate') why = `You asked to open it up: Ideate reads all of your material${discoverGot.length ? ` (it already touches ${discoverGot.join(', ')})` : ''}, writes back the game so far — fixed, ideas, open — and asks only about the gaps.`
  else if (stage === 'define') why = 'You asked to pin it down, and your material gives Define enough to choose from; whatever it already chose is one tap to keep.'
  else why = `Your material covers what ${name(stage)} needs.`
  const before = ORDER[ORDER.indexOf(stage) - 1]
  const earlier = before ? { stage: before, at: before === 'define' ? 'digest' : 'first' } : null
  return { stage, at, why, catchUp, earlier, asked }
}

// The 2–3 lines "What I read", in the creative's words: the brief, then their first quotes.
function readLines(brief, items) {
  const quotes = Object.values(items).flat().filter(x => x.his).map(x => x.text)
  return [...new Set([clean(brief), ...quotes].filter(Boolean))].slice(0, 3)
}

// Everything the intake writes, from the opening's result. sources = [{ name, text }] (the pasted text and the
// files read); unreadable = [{ path, why }]. Returns { json, md, run } (run = DISCOVER.md's new section, or null).
export function buildIntake({ result, sources, unreadable = [], defineKeys, date, key }) {
  const where = ['nothing', 'spark', 'concept', 'written', 'prototype'].includes(result.where) ? result.where : 'concept'
  const goal = where === 'nothing' || where === 'spark' ? 'open' : GOALS[result.goal] ? result.goal : 'open'
  const { items, unknown, notVerbatim } = checkMaterial(result.material, sources.map(s => s.text).join('\n\n'), defineKeys)
  const { gaps, why, discoverGot } = gapMap(items)
  const proposal = propose({ where, goal, items, g: gaps, discoverGot })
  const brief = clean(result.brief) || clean((items.spark || [])[0] && items.spark[0].text)
  const slug = typeof result.slug === 'string' && E.NAME_RE.test(result.slug) && result.slug.length <= 60 ? result.slug : ''
  const given = { ...items }
  if (brief) given.brief = brief
  if (slug) given.slug = slug
  const read = readLines(brief, items)
  // (F228: the pasted text itself is kept, so Ideate's reading step reads it whole, not only the quotes taken from it)
  const pasted = listOf(result.pasted).map(t => String(t == null ? '' : t)).filter(t => clean(t))
  const json = { version: 1, date, where, goal, brief, slug, sources: sources.map(s => ({ name: s.name, chars: s.text.length })), pasted, unreadable, read, gaps, gapWhy: why, proposal, given, notVerbatim, unknownKeys: unknown }

  const stageLine = (s, at) => `${E.stageOf(s).name}${at && at !== 'first' ? ` · ${at}` : ''}`
  const md = [
    `# Where you're starting${brief ? ` — ${brief}` : ''}`,
    `Read ${date}${sources.length ? ` from: ${sources.map(s => s.name).join(' · ')}` : ': nothing shared yet'}${unreadable.length ? ` · not readable yet: ${unreadable.map(u => `${u.path} (${u.why})`).join(', ')}` : ''}`,
    '',
    '## Proposal',
    '**What I read:**',
    ...(read.length ? read.map(r => `- "${r}"`) : ['- nothing yet']),
    '',
    '**What it already covers:**',
    ...ORDER.map(s => `- ${GAP_NAMES[s]}: ${gaps[s]} — ${why[s]}`),
    '',
    `**Where I'd start you:** ${stageLine(proposal.stage, proposal.at)} — ${proposal.why}`,
    ...(E.STAGES.find(s => s.id === proposal.stage).forNow ? [`(${E.notOnEngineLine(proposal.stage)}.)`] : []),
    '',
    '## Options',
    `- Start there: ${stageLine(proposal.stage, proposal.at)}`,
    ...(proposal.earlier ? [`- Start earlier: ${stageLine(proposal.earlier.stage, null)}`] : []),
    '- Somewhere else',
    '',
    '## The material, as read',
    `${Object.values(items).flat().length} items: ${Object.values(items).flat().filter(x => x.his).length} in their own words (found in the material), ${notVerbatim} in Claude's words (no quote found: marked "Claude's reading of your material").`,
    ...Object.entries(items).map(([k, list]) => `- ${k}: ${list.map(x => (x.his ? `"${x.text}"` : `${x.text} (Claude's reading)`)).join(' · ')}`),
    ...(unknown.length ? [`- not used (no such shelf or field): ${unknown.join(', ')}`] : []),
    '',
  ].join('\n')

  // DISCOVER.md: a run of its own, every item of Discover's keys on its shelf, marked where it came from.
  const bricks = []
  for (const [k, [shelf, label]] of Object.entries(TALK_KEYS)) {
    for (const x of items[k] || []) {
      const words = x.his ? `"${x.text}"` : x.text
      bricks.push({ shelf, text: label ? `${label}: ${words}` : words, by: x.his ? 'from your material' : "Claude's reading of your material" })
    }
  }
  const youAre = (items.youAre || [])[0]
  const run = where === 'nothing' ? null : {
    key: key || `${date}-intake`, date, brief,
    youAre: youAre ? youAre.text : '',
    steps: ['intake'], skipped: [], questions: [], bricks, reports: [],
    material: sources.map(s => s.name),
  }
  // The proposal screen the engine shows in a turn of its own (the intake step's "show"), before the "Start there?"
  // box: shown inside or beside the box it was hidden behind (live review #20b). Empty when nothing is proposed to
  // confirm (nothing yet or a spark goes straight in): the engine then shows nothing.
  const screen = where === 'nothing' || where === 'spark' ? '' : md.slice(md.indexOf('## Proposal'), md.indexOf('## Options')).replace(/^## Proposal\n/, `## Where you're starting${brief ? ` — ${brief}` : ''}\n`).trimEnd() + '\n'
  return { json, md, run, screen }
}

function main() {
  const project = process.cwd()
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const state = JSON.parse(readFileSync(join(project, '.bmuz/state.json'), 'utf8'))
  const result = (state.resultsBy && state.resultsBy.opening) || state.results || {}
  const define = JSON.parse(readFileSync(join(root, 'pipelines', 'define.json'), 'utf8'))
  const defineKeys = define.steps.filter(s => s.kind === 'talk').flatMap(s => s.results || [])
  // The material: what they pasted (their exact text), and the files they pointed at (read here, inside the
  // project only, text files only: PDFs and Drive links are out of scope for now and said so).
  const sources = []
  const unreadable = []
  listOf(result.pasted).forEach((t, i, all) => { if (clean(t)) sources.push({ name: all.length > 1 ? `pasted text ${i + 1}` : 'pasted text', text: String(t) }) })
  for (const f of listOf(result.files)) {
    const path = String(f).replace(/\\/g, '/').replace(/^\.\//, '')
    if (/^https?:\/\//i.test(path)) { unreadable.push({ path, why: 'a link: Ideate reads it (Google Drive folders and docs), or paste its text' }); continue }
    if (!E.isSafePath(path)) { unreadable.push({ path, why: 'outside this folder' }); continue }
    if (/\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|zip)$/i.test(path)) { unreadable.push({ path, why: 'not a text file yet: paste its text instead' }); continue }
    if (!existsSync(join(project, path))) { unreadable.push({ path, why: 'not found' }); continue }
    sources.push({ name: path, text: readFileSync(join(project, path), 'utf8') })
  }
  const journal = existsSync(join(project, '.bmuz/journal.jsonl')) ? readFileSync(join(project, '.bmuz/journal.jsonl'), 'utf8').split('\n') : []
  const opened = journal.map(l => { try { return JSON.parse(l) } catch (e) { return null } }).filter(j => j && j.ev === 'step.start' && j.step === 'opening').pop()
  const date = new Date().toLocaleDateString('en-CA')
  const out = buildIntake({ result, sources, unreadable, defineKeys, date, key: opened ? `intake-${opened.t}` : '' })
  mkdirSync(join(project, dirname(INTAKE_JSON)), { recursive: true })
  writeFileSync(join(project, INTAKE_JSON), JSON.stringify(out.json, null, 2) + '\n')
  writeFileSync(join(project, INTAKE_MD), out.md)
  writeFileSync(join(project, INTAKE_SCREEN), out.screen)
  let saved = 'nothing shared, so DISCOVER.md is left alone'
  if (out.run) {
    const old = existsSync(join(project, DISCOVER)) ? readFileSync(join(project, DISCOVER), 'utf8') : null
    const merged = mergeDoc(old, out.run)
    if (!merged.already) writeFileSync(join(project, DISCOVER), merged.text)
    saved = merged.already ? 'DISCOVER.md already has this intake' : `DISCOVER.md run ${merged.n}: ${out.run.bricks.length} items on the shelves`
  }
  const p = out.json.proposal
  console.log(`✔ intake: ${out.json.sources.length} sources, ${Object.values(out.json.given).flat().length} items (${out.json.notVerbatim} not quoted); ${saved}; proposal ${p.stage}${p.at !== 'first' ? ` · ${p.at}` : ''}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
