// Writes or grows the project's one Discover document, .planning/DISCOVER.md (pipeline "discover", step "save").
// node discover-doc.mjs [path]      (default .planning/DISCOVER.md; run in the project folder)
//
// The layout: framework .planning/research/bmuz-vision/discover-creative-research.md, section 6(d).
// - Shelves only ever grow: every line already there is kept exactly as it is (the creative's own edits
//   too), new bricks are added under their shelf, and a brick that is already there gets "· again in run N".
// - Each brick carries its run number and its source: the creative's words (kept verbatim, in quotes),
//   Claude's suggestion, or the research links it rests on, with its strength mark.
// - One section per run, newest first, linking the run's research reports.
// It reads what the run collected from the engine's own files (.bmuz/state.json: each talk step's result,
// the steps skipped by a wrap-up) and the research reports the run's flow steps wrote. It runs as a script
// step, so the engine checkpoints the file first and undo puts it back.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'

// The shelves, in order, with the one-line description under each heading (section 6(d)).
export const SHELVES = [
  ['Spark', 'what excites, why (quotes from the creative, dated)'],
  ['Experience goals', 'candidate situations (not features) · MDA aesthetics in play · candidate fantasies'],
  ['Theme', 'subject notes, references in/out of games, tone words, what players already know'],
  ['Nouns', 'thing · attributes/states · acts or acted on · motivation/conflict (living things)'],
  ['Verbs', 'theme word → outcome form · combines with → skill'],
  ['Verb × noun grid', 'what each verb does to each noun; empty/surprising cells flagged'],
  ['Decisions', 'candidate choices and their tradeoffs'],
  ['Mechanism shelf', 'outcome verb → candidate mechanisms → example games → skill it teaches'],
  ['Prior art', 'game · shares which bricks · praised for · complaints/missed · its hook/anchor'],
  ['Hooks & anchors', 'candidates only'],
  ['Twists', 'constraints, SCAMPER moves, strip-downs, mashups, extremes'],
  ['On ice', 'ready-made solutions and ideas held for Define (credited, dated)'],
  ['Open questions', 'each with its probe (/sketch toy, /proto sim, ask the creative) and status'],
  ['Hopes & fears', 'fears carried as assumptions with evidence status'],
]
const SHELF_NAMES = SHELVES.map(s => s[0])

// A talk step's result key → the shelf it fills and the label its bricks start with ('' = none).
// Keys not listed here (brief and slug go in the seed line, questions in the run section) make no bricks.
export const TALK_KEYS = {
  spark: ['Spark', ''],
  youAre: ['Spark', ''], // (its words already start "You are…")
  constraints: ['Spark', 'Must fit / off the table'],
  hopes: ['Hopes & fears', 'Hope'],
  fears: ['Hopes & fears', 'Fear'],
  onIce: ['On ice', ''],
  experiences: ['Experience goals', 'Situation'],
  stories: ['Experience goals', 'Story a player tells'],
  aesthetics: ['Experience goals', 'Aesthetic (MDA)'],
  fantasies: ['Experience goals', 'Fantasy'],
  curiosity: ['Experience goals', "Question in the player's head"],
  toy: ['Experience goals', 'Toy'],
  players: ['Experience goals', 'Player'],
  senses: ['Theme', 'Seen, heard, touched'],
  known: ['Theme', 'Everyone already knows'],
  life: ['Theme', "From the creative's life"],
  outside: ['Theme', 'Outside games'],
  tone: ['Theme', 'Tone'],
  nouns: ['Nouns', ''],
  verbs: ['Verbs', ''],
  skills: ['Verbs', 'Skill'],
  grid: ['Verb × noun grid', ''],
  choices: ['Decisions', 'Choice'],
  problems: ['Decisions', 'Problem the player solves'],
  // (labels stay neutral: each line's own marker says whether the creative or Claude said it)
  reminds: ['Prior art', 'Reminds of'],
  feelsRight: ['Mechanism shelf', 'Feels like the verb'],
  pastedOn: ['Mechanism shelf', 'Feels pasted on'],
  genres: ['Mechanism shelf', 'Genre that already covers some verbs'],
  missed: ['Prior art', 'What they missed'],
  anchors: ['Hooks & anchors', 'Anchor'],
  hooks: ['Hooks & anchors', 'Hook'],
  twists: ['Twists', ''],
  extremes: ['Twists', 'Extreme'],
}

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const joined = v => listOf(v).map(clean).filter(Boolean).join(' / ')

// One talk-result item as text. An item is text, or an object: {text, his} or a shelf's own fields
// (a noun's thing/states/acts/wants/stops, a verb's theme/outcome/combines, a grid cell's verb/noun/does/flag).
// A "who said it" note written inside the text ("(Claude's suggestion from the shelf)") is taken out: the
// line's marker says it, and two markers could disagree (headless run 2026-11-09: haiku added them anyway).
const WHO_NOTE = /\s*\((?:Claude's|Claude|Muzzy's|the creative's)\b[^()]*(?:suggestion|note|default|view|pick)[^()]*\)/gi
const unNoted = s => clean(s).replace(WHO_NOTE, '').trim()

export function itemText(key, x) {
  if (typeof x === 'string') return unNoted(x)
  if (!x || typeof x !== 'object') return ''
  if (x.text) return unNoted(x.text)
  const parts = []
  if (key === 'nouns') {
    parts.push(clean(x.thing))
    if (x.states) parts.push(`states: ${joined(x.states)}`)
    if (x.acts) parts.push(`acts / acted on: ${joined(x.acts)}`)
    if (x.wants) parts.push(`wants: ${joined(x.wants)}`)
    if (x.stops) parts.push(`stopped by: ${joined(x.stops)}`)
    return parts.filter(Boolean).join(' · ')
  }
  if (key === 'verbs') return [`${clean(x.theme)} → ${clean(x.outcome)}`, x.combines ? `combines with: ${joined(x.combines)}` : ''].filter(Boolean).join(' · ')
  if (key === 'skills') return `${clean(x.skill)} = ${joined(x.verbs)}`
  if (key === 'grid') return `${clean(x.verb)} × ${clean(x.noun)}: ${clean(x.does) || 'nothing yet'}${x.flag ? ` (${clean(x.flag)})` : ''}`
  if (key === 'choices') return `${clean(x.choice)}${x.cost ? ` — costs: ${joined(x.cost)}` : ''}`
  return Object.entries(x).filter(([k]) => k !== 'his' && k !== 'picked').map(([k, v]) => `${k}: ${joined(v)}`).join(' · ')
}

// ---- Reading a research report (the research flow's format, checked by check-sources.mjs) ----
// Returns { sources: Map n → {title, url}, sections: { name → lines }, bricks: [{shelf, text, cites, strength}] }.
export function parseReport(text) {
  const sections = {}
  const bricks = []
  let section = null
  let shelf = null
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2) { section = h2[1]; shelf = null; sections[section] = []; continue }
    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h3) { shelf = h3[1]; continue }
    if (!section || !line) continue
    sections[section].push(line)
    if (section === 'Bricks' && shelf && /^- /.test(line) && !/^- none\b/i.test(line)) {
      const strength = (line.match(/\((several sources|one source|interpretation only)\)\s*$/i) || [])[1] || ''
      const cites = [...line.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
      const body = line.slice(2).replace(/\s*\((several sources|one source|interpretation only)\)\s*$/i, '').replace(/\s*\[\d+\]/g, '').trim()
      bricks.push({ shelf, text: body, cites, strength })
    }
  }
  const sources = new Map()
  for (const line of sections.Sources || []) {
    const m = line.match(/^(\d+)[.)]\s+(.*?)\s+—\s+(https?:\/\/\S+)\s*$/)
    if (m) sources.set(Number(m[1]), { title: m[2].replace(/[\[\]]/g, ''), url: m[3] })
  }
  return { sources, sections, bricks }
}

// "[2][5]" in a report line → markdown links to the sources, so a brick or a finding stands alone in DISCOVER.md.
const linkCites = (line, sources) => line.replace(/((?:\s*\[\d+\])+)/g, m => {
  const links = [...m.matchAll(/\[(\d+)\]/g)].map(x => sources.get(Number(x[1]))).filter(Boolean).map(s => `[${s.title}](${s.url})`)
  return links.length ? ` (${links.join(', ')})` : ''
})

// ---- One run: everything it collected, as bricks ----
// steps = the pipeline's steps; state = .bmuz/state.json; reports = [{ step, label, path, text }].
export function collectRun({ steps, state, reports, date, key }) {
  const skipped = state.skipped || []
  const ran = steps.filter(s => state.finished.includes(s.id) && !skipped.includes(s.id))
  const results = Object.assign({}, ...ran.filter(s => s.kind === 'talk').map(s => (state.resultsBy || {})[s.id] || {}))
  const bricks = []
  for (const [k, [shelf, label]] of Object.entries(TALK_KEYS)) {
    for (const x of listOf(results[k])) {
      const text = itemText(k, x)
      if (!text) continue
      // Typed by the creative = their words verbatim, in quotes; an option they picked; else Claude's own.
      const his = !!(x && typeof x === 'object' && x.his === true)
      const picked = !his && !!(x && typeof x === 'object' && x.picked === true)
      const words = his ? `"${text}"` : text
      bricks.push({ shelf, text: label ? `${label}: ${words}` : words, by: his ? "the creative's words" : picked ? 'picked by the creative' : "Claude's suggestion" })
    }
  }
  const read = reports.map(r => ({ ...r, parsed: parseReport(r.text) }))
  for (const r of read) {
    const { sources } = r.parsed
    for (const b of r.parsed.bricks) {
      const shelf = SHELF_NAMES.find(n => n.toLowerCase() === b.shelf.toLowerCase()) || b.shelf
      const links = b.cites.map(n => sources.get(n)).filter(Boolean).map(s => `[${s.title}](${s.url})`)
      bricks.push({ shelf, text: b.text, by: [links.join(', '), b.strength].filter(Boolean).join(' · ') || r.label })
    }
    // Probes the reading couldn't answer join the Open questions shelf, status open.
    for (const line of r.parsed.sections['Open questions → probes'] || []) {
      if (/^- /.test(line) && !/^- none\b/i.test(line)) bricks.push({ shelf: 'Open questions', text: `${line.slice(2)} · status: open`, by: `${r.label} research` })
    }
    // Ideas that came up in research go on ice (the creative's own are already there from the spark).
    for (const line of r.parsed.sections['On ice'] || []) {
      const m = line.match(/^- (.*) \(came up in research\)$/)
      if (m) bricks.push({ shelf: 'On ice', text: m[1], by: `${r.label} research` })
    }
    // A fear's evidence status, from the scoreboard (H25): fears are carried as assumptions.
    for (const line of r.parsed.sections['Assumption scoreboard'] || []) {
      const m = line.match(/^- (Supported|Contradicted|No evidence): "(.+?)" \(([^)]*a fear[^)]*)\)(?: — (.*))?$/)
      if (m) bricks.push({ shelf: 'Hopes & fears', text: `Fear "${m[2]}": ${m[1].toLowerCase()} by the ${r.label} research${m[4] ? ` — ${linkCites(m[4], r.parsed.sources).trim()}` : ''}`, by: `${r.label} research` })
    }
  }
  return {
    key, date,
    brief: clean(results.brief),
    youAre: itemText('youAre', listOf(results.youAre)[0]),
    steps: ran.map(s => s.id),
    skipped,
    questions: listOf(results.questions).map(q => itemText('questions', q)).filter(Boolean),
    bricks,
    reports: read.map(r => {
      const findings = (r.parsed.sections['Findings by question'] || []).filter(l => /^- /.test(l) && !/^- none\b/i.test(l))
      return {
        label: r.label, path: r.path,
        findings: findings.length,
        strong: findings.filter(l => /\(several sources\)/.test(l)).map(l => linkCites(l, r.parsed.sources)),
        contradictions: (r.parsed.sections.Contradictions || []).filter(l => /^- /.test(l) && !/^- none\b/i.test(l)).map(l => linkCites(l, r.parsed.sources)),
        surprises: (r.parsed.sections.Surprises || []).filter(l => /^- /.test(l) && !/^- none\b/i.test(l)).map(l => linkCites(l, r.parsed.sources)),
      }
    }),
  }
}

// ---- The document ----
const PROVENANCE = / — run (\d+)( · .*)?$/
// A brick's identity: its words without the run tag, case and spacing ignored, so the same brick twice is one.
const brickKey = line => line.replace(/^- /, '').replace(PROVENANCE, '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

// Splits the document into its parts. Every line is kept; the shelves are found by their "### " headings.
function parseDoc(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n')
  const shelvesAt = lines.findIndex(l => /^## Shelves\b/.test(l))
  const runsAt = lines.findIndex(l => /^## Runs\b/.test(l))
  if (shelvesAt < 0 || runsAt < shelvesAt) return null
  const head = lines.slice(0, shelvesAt)
  const shelfLines = lines.slice(shelvesAt + 1, runsAt)
  const shelves = [] // [{ name, lines }]; lines before the first shelf heading are kept as "intro"
  const intro = []
  for (const l of shelfLines) {
    const h = l.match(/^### (.+?)\s*(?:—.*)?$/)
    if (h) shelves.push({ name: h[1].trim(), lines: [l] })
    else if (shelves.length) shelves[shelves.length - 1].lines.push(l)
    else intro.push(l)
  }
  return { head, shelvesHeading: lines[shelvesAt], intro, shelves, runsHeading: lines[runsAt], runs: lines.slice(runsAt + 1) }
}

const newDoc = () => [
  '# Discover',
  'Seed: (none yet)',
  '',
  'BMUZ collects the bricks here; nothing in this file is chosen. Choosing which bricks to build with is /define\'s. Lines are only ever added or annotated, never removed: edit anything you like, your edits are kept.',
  '',
  '## Shelves (cumulative — every run adds; nothing is chosen here)',
  ...SHELVES.flatMap(([n, d]) => [`### ${n} — ${d}`, '']),
  '## Runs (newest first)',
  '',
].join('\n')

// The run number: one more than the highest "### Run N" so far.
const runNumber = runs => runs.reduce((m, l) => Math.max(m, Number((l.match(/^### Run (\d+)\b/) || [])[1] || 0)), 0) + 1
const KEY_MARK = key => `<!-- bmuz run key: ${key} -->`

// Merges one run into the document text (null/'' = a new document). Returns { text, n, added, again },
// or { text, n, already: true } when this run (its key) is already in the document.
export function mergeDoc(oldText, run, { reportLink = p => p } = {}) {
  const doc = parseDoc(oldText && oldText.trim() ? oldText : newDoc()) || parseDoc(`${String(oldText).trimEnd()}\n\n${newDoc().split('\n').slice(5).join('\n')}`)
  if (run.key && doc.runs.some(l => l.includes(KEY_MARK(run.key)))) return { text: oldText, n: null, already: true }
  const n = runNumber(doc.runs)
  const added = {}
  let again = 0
  for (const b of run.bricks) {
    let shelf = doc.shelves.find(s => s.name.toLowerCase() === b.shelf.toLowerCase())
    if (!shelf) {
      // A shelf the creative removed (or a new one) comes back at the end of the shelves when it has a brick.
      const d = (SHELVES.find(s => s[0] === b.shelf) || [b.shelf, ''])[1]
      shelf = { name: b.shelf, lines: [`### ${b.shelf}${d ? ` — ${d}` : ''}`, ''] }
      doc.shelves.push(shelf)
    }
    const k = brickKey(b.text)
    const i = shelf.lines.findIndex((l, j) => j > 0 && /^- /.test(l) && brickKey(l) === k)
    if (i > 0) {
      // Already on the shelf: annotated with this run, once (never rewritten otherwise).
      const runs = [...shelf.lines[i].matchAll(/\brun (\d+)\b/g)].map(m => Number(m[1]))
      if (!runs.includes(n)) { shelf.lines[i] = `${shelf.lines[i]} · again in run ${n}`; again++ }
      continue
    }
    // New bricks go after the shelf's last brick line, before its trailing blank lines.
    let at = shelf.lines.length
    while (at > 1 && shelf.lines[at - 1].trim() === '') at--
    shelf.lines.splice(at, 0, `- ${b.text} — run ${n} · ${b.by}`)
    added[shelf.name] = (added[shelf.name] || 0) + 1
  }
  for (const s of doc.shelves) if (s.lines[s.lines.length - 1].trim() !== '') s.lines.push('')

  const anchor = name => `#${name.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/\s+/g, '-')}`
  const section = [
    `### Run ${n} — ${run.date} — ${run.brief || 'untitled'}`,
    KEY_MARK(run.key || `${run.date}-${n}`),
    `- Brief, in the creative's words: ${run.brief ? `"${run.brief}"` : 'not given'}`,
    ...(run.youAre ? [`- You are: ${run.youAre}`] : []),
    `- Steps run: ${run.steps.join(', ') || 'none'}${run.skipped.length ? ` · skipped (wrapped up early): ${run.skipped.join(', ')}` : ''}`,
    ...(run.questions.length ? ['- Research questions:', ...run.questions.map((q, i) => `  ${i + 1}. ${q}`)] : []),
    `- Bricks added: ${Object.keys(added).length ? Object.entries(added).map(([s, c]) => `[${s}](${anchor(s)}) ${c}`).join(' · ') : 'none new'}${again ? ` · ${again} already on the shelves, marked "again in run ${n}"` : ''}`,
  ]
  for (const r of run.reports) {
    section.push(`- ${r.label} research: [the full report](${reportLink(r.path)}) · ${r.findings} findings, ${r.strong.length} backed by several sources`)
    for (const f of r.strong) section.push(`  ${f}`)
    if (r.contradictions.length) section.push('  Contradictions kept:', ...r.contradictions.map(c => `  ${c}`))
    if (r.surprises.length) section.push('  Surprises:', ...r.surprises.map(c => `  ${c}`))
  }
  if (!run.reports.length) section.push('- Research: none ran in this run')
  section.push('')

  // The seed line says the first "You are" and idea, and when the last run was; a seed line the creative
  // rewrote (it no longer starts "Seed:") is left alone.
  const seedAt = doc.head.findIndex(l => /^Seed:/.test(l))
  if (seedAt >= 0) {
    const had = doc.head[seedAt]
    const first = /^Seed: \(none yet\)/.test(had)
      ? `Seed: ${run.youAre ? `${run.youAre} · ` : ''}${run.brief ? `"${run.brief}" (the creative's words)` : ''}`
      : had.replace(/ · last run \d{4}-\d\d-\d\d$/, '')
    doc.head[seedAt] = `${first} · last run ${run.date}`
  }

  const runs = doc.runs.slice()
  while (runs.length && runs[0].trim() === '') runs.shift()
  const text = [
    ...doc.head,
    doc.shelvesHeading,
    ...doc.intro,
    ...doc.shelves.flatMap(s => s.lines),
    doc.runsHeading,
    '',
    ...section,
    ...runs,
  ].join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n')
  return { text, n, added, again }
}

// ---- The command: read the run from the engine's files, merge, write ----
function main() {
  const project = process.cwd()
  const out = process.argv[2] || '.planning/DISCOVER.md'
  if (!E.isSafePath(out)) { console.log(`✘ ${out} isn't a path inside the project`); process.exit(1) }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const readJson = f => JSON.parse(readFileSync(join(project, f), 'utf8'))
  const cfg = readJson('bmuz.json')
  // bmuz.json is hand-editable: the pipeline name must be a plain name before it goes into a path.
  if (typeof cfg.pipeline !== 'string' || !E.NAME_RE.test(cfg.pipeline)) { console.log(`✘ bmuz.json "pipeline" isn't a plain pipeline name`); process.exit(1) }
  const pipeline = JSON.parse(readFileSync(join(root, 'pipelines', `${cfg.pipeline}.json`), 'utf8'))
  const state = readJson('.bmuz/state.json')
  // The run's key: when its first step last started (from the journal). A save step that runs again for
  // the same run (a crash between writing and the engine's record) finds its key and adds nothing twice.
  const journal = existsSync(join(project, '.bmuz/journal.jsonl')) ? readFileSync(join(project, '.bmuz/journal.jsonl'), 'utf8').split('\n') : []
  const first = pipeline.steps[0].id
  const starts = journal.map(l => { try { return JSON.parse(l) } catch (e) { return null } }).filter(j => j && j.ev === 'step.start' && j.step === first)
  const key = starts.length ? String(starts[starts.length - 1].t) : ''
  const vars = { ...state.results }
  const reports = []
  for (const s of pipeline.steps) {
    if (s.kind !== 'flow' || !state.finished.includes(s.id) || (state.skipped || []).includes(s.id)) continue
    const path = s.args && typeof s.args.out === 'string' ? E.fill(s.args.out, vars) : null
    if (!path || !E.isSafePath(path) || !existsSync(join(project, path))) continue
    reports.push({ step: s.id, label: s.description ? s.description.split(':')[0].trim() : s.id, path, text: readFileSync(join(project, path), 'utf8') })
  }
  const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, the local day
  const run = collectRun({ steps: pipeline.steps, state, reports, date, key })
  const old = existsSync(join(project, out)) ? readFileSync(join(project, out), 'utf8') : null
  const merged = mergeDoc(old, run, { reportLink: p => relative(dirname(join(project, out)), join(project, p)).split('\\').join('/') })
  if (merged.already) { console.log(`✔ ${out}: this run is already in it (nothing added twice)`); return }
  mkdirSync(dirname(join(project, out)), { recursive: true })
  writeFileSync(join(project, out), merged.text)
  const total = Object.values(merged.added).reduce((a, b) => a + b, 0)
  console.log(`✔ ${out}: run ${merged.n} saved — ${total} new bricks on ${Object.keys(merged.added).length} shelves, ${merged.again} marked again, ${run.reports.length} reports linked`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
