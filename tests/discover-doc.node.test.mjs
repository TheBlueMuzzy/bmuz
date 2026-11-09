// No-Claude test of the project's one Discover document (F217, plugin/scripts/discover-doc.mjs):
// shelves only grow, the creative's words are kept verbatim and marked, one section per run (newest first).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHELVES, collectRun, mergeDoc, parseReport } from '../plugin/scripts/discover-doc.mjs'

const STEPS = [
  { id: 'spark', kind: 'talk' },
  { id: 'experience', kind: 'talk' },
  { id: 'theme-dig', kind: 'flow', description: 'Theme dig: the subject itself', args: { out: '.planning/research/discover-{slug}-theme.md' } },
  { id: 'simulation', kind: 'talk' },
  { id: 'save', kind: 'script' },
]
const REPORT = [
  '# Discover (theme dig): a lighthouse',
  '## Findings by question',
  '### 1. What does a keeper do?',
  '- Keepers trimmed the wick every few hours [1][2] (several sources)',
  '- Fog meant sounding a horn [1] (one source)',
  '## Bricks',
  '### Nouns',
  '- the lamp · states: lit / out / sooty [1][2] (several sources)',
  '### Theme',
  '- Keepers kept a daily log of weather and ships [2] (one source)',
  '## Contradictions',
  '- none found',
  '## Assumption scoreboard',
  '0 supported · 1 contradicted · 0 no evidence',
  '- Contradicted: "it will feel boring" (desirable, a fear) — storms break the routine [1]',
  '## Surprises',
  '- Some keepers were women who ran the light alone [2]',
  '## Open questions → probes',
  '- Is trimming a wick fun to do with a thumb? → sketch (timebox: 1 hour)',
  '## On ice',
  '- a day-night cycle (from the creative)',
  '- a radio to talk to ships (came up in research)',
  '## Sources',
  '1. Keeper life (Lighthouse Society) — https://keepers.example/life',
  '2. Women keepers — https://history.example/women',
  '',
].join('\n')

const state = over => ({
  finished: ['spark', 'experience', 'theme-dig', 'simulation'],
  skipped: [],
  results: { slug: 'lighthouse' },
  resultsBy: {
    spark: { brief: 'a cosy game about running a lighthouse', slug: 'lighthouse', youAre: [{ text: 'You are the last keeper of a lighthouse', his: true }], spark: [{ text: 'the light sweeping over the water at night', his: true }, 'routine as comfort'], fears: [{ text: 'it will feel boring', his: true }], onIce: [{ text: 'a day-night cycle', his: true }] },
    experience: { experiences: ['keeping the light lit through a storm'], aesthetics: ['Submission', 'Fantasy'] },
    simulation: { nouns: [{ thing: 'the lamp', states: ['lit', 'out', 'sooty'], acts: 'acted on by the keeper' }], verbs: [{ theme: 'trim', outcome: 'keep a resource from running down', combines: 'climb' }], grid: [{ verb: 'trim', noun: 'the fog', does: '', flag: 'empty' }] },
  },
  ...over,
})
const run = (over = {}, key = 'k1', date = '2026-11-09') => collectRun({ steps: STEPS, state: state(over), reports: [{ step: 'theme-dig', label: 'Theme dig', path: '.planning/research/discover-lighthouse-theme.md', text: REPORT }], date, key })

test('discover doc: a report\'s bricks, probes, on-ice ideas and sources are read back', () => {
  const r = parseReport(REPORT)
  assert.deepEqual(r.bricks.map(b => [b.shelf, b.text, b.cites, b.strength]), [
    ['Nouns', 'the lamp · states: lit / out / sooty', [1, 2], 'several sources'],
    ['Theme', 'Keepers kept a daily log of weather and ships', [2], 'one source'],
  ])
  assert.deepEqual(r.sources.get(2), { title: 'Women keepers', url: 'https://history.example/women' })
})

test('discover doc: a first run makes every shelf, marks the creative\'s words, and logs the run', () => {
  const { text, n, added } = mergeDoc(null, run(), { reportLink: p => p.replace('.planning/', '') })
  assert.equal(n, 1)
  for (const [name] of SHELVES) assert.match(text, new RegExp(`\\n### ${name.replace(/[&×]/g, '.')} — `), name)
  assert.match(text, /^# Discover\nSeed: You are the last keeper of a lighthouse · "a cosy game about running a lighthouse" \(the creative's words\) · last run 2026-11-09\n/)
  // the creative's words verbatim, in quotes, marked; Claude's own suggestions marked as such
  assert.match(text, /\n- "the light sweeping over the water at night" — run 1 · the creative's words\n- routine as comfort — run 1 · Claude's suggestion\n/)
  assert.match(text, /\n- the lamp · states: lit \/ out \/ sooty · acts \/ acted on: acted on by the keeper — run 1 · Claude's suggestion\n/)
  assert.match(text, /\n- trim → keep a resource from running down · combines with: climb — run 1/)
  assert.match(text, /\n- trim × the fog: nothing yet \(empty\) — run 1/)
  // a research brick carries its links and strength
  assert.match(text, /\n- Keepers kept a daily log of weather and ships — run 1 · \[Women keepers\]\(https:\/\/history\.example\/women\) · one source\n/)
  assert.match(text, /### Open questions — .*\n- Is trimming a wick fun to do with a thumb\? → sketch \(timebox: 1 hour\) · status: open — run 1 · Theme dig research\n/)
  assert.match(text, /### On ice — .*\n- "a day-night cycle" — run 1 · the creative's words\n- a radio to talk to ships — run 1 · Theme dig research\n/)
  assert.match(text, /- Fear: "it will feel boring" — run 1 · the creative's words\n- Fear "it will feel boring": contradicted by the Theme dig research — storms break the routine \(\[Keeper life \(Lighthouse Society\)\]\(https:\/\/keepers\.example\/life\)\)/)
  // the run section: brief, steps, the report linked, the strong findings with their links, surprises
  assert.match(text, /## Runs \(newest first\)\n\n### Run 1 — 2026-11-09 — a cosy game about running a lighthouse\n<!-- bmuz run key: k1 -->\n- Brief, in the creative's words: "a cosy game about running a lighthouse"\n/)
  assert.match(text, /- Theme dig research: \[the full report\]\(research\/discover-lighthouse-theme\.md\) · 2 findings, 1 backed by several sources\n {2}- Keepers trimmed the wick every few hours \(\[Keeper life/)
  assert.match(text, /Surprises:\n {2}- Some keepers were women who ran the light alone \(\[Women keepers\]/)
  assert.ok(added.Nouns >= 2)
})

test('discover doc: shelves only grow — hand edits kept, a repeat brick annotated, a second run on top', () => {
  const first = mergeDoc(null, run()).text
  // the creative edits the document: rewrites a brick, adds their own line and a shelf of their own
  const edited = first
    .replace('- routine as comfort — run 1 · Claude\'s suggestion', '- routine as COMFORT, yes! — run 1 · Claude\'s suggestion')
    .replace(/(### Twists — .*\n)/, '$1- my own twist: the sea rises every year\n')
    .replace('## Runs (newest first)', '### My notes\n- ask my dad about boats\n\n## Runs (newest first)')
  const second = run({ resultsBy: { ...state({}).resultsBy, spark: { ...state({}).resultsBy.spark, spark: [{ text: 'the light sweeping over the water at night', his: true }, 'ships as visitors'] } } }, 'k2', '2026-11-10')
  const { text, n, again } = mergeDoc(edited, second)
  assert.equal(n, 2)
  for (const line of edited.split('\n').filter(l => /^- /.test(l))) {
    const kept = text.split('\n').some(l => l === line || l.startsWith(line + ' · again in run 2'))
    assert.ok(kept, `a line was lost or rewritten: ${line}`)
  }
  assert.match(text, /- routine as COMFORT, yes! — run 1 · Claude's suggestion\n/)
  assert.match(text, /- my own twist: the sea rises every year\n/)
  assert.match(text, /### My notes\n- ask my dad about boats\n/)
  assert.match(text, /- "the light sweeping over the water at night" — run 1 · the creative's words · again in run 2\n/)
  assert.match(text, /- ships as visitors — run 2 · Claude's suggestion\n/)
  assert.ok(again > 0)
  assert.match(text, /## Runs \(newest first\)\n\n### Run 2 — 2026-11-10 — [^\n]*\n[\s\S]*### Run 1 — 2026-11-09/)
  assert.match(text, /^# Discover\nSeed: You are the last keeper .* · last run 2026-11-10\n/)
  assert.ok(text.length > edited.length)
})

test('discover doc: the same run saved twice (a crash before the engine\'s record) adds nothing twice', () => {
  const once = mergeDoc(null, run()).text
  const twice = mergeDoc(once, run())
  assert.equal(twice.already, true)
  assert.equal(twice.text, once)
})

test('discover doc: a wrapped-up run lists what it skipped; skipped steps\' results make no bricks', () => {
  const r = run({ finished: ['spark', 'experience', 'theme-dig', 'simulation'], skipped: ['simulation'] })
  const { text } = mergeDoc(null, r)
  assert.match(text, /- Steps run: spark, experience, theme-dig · skipped \(wrapped up early\): simulation\n/)
  assert.doesNotMatch(text, /trim → keep a resource/)
})

test('discover doc: the command reads the engine\'s files in the project and writes .planning/DISCOVER.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-doc-'))
  try {
    mkdirSync(join(dir, '.bmuz'))
    mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'discover' }))
    const pipeline = JSON.parse(readFileSync(new URL('../plugin/pipelines/discover.json', import.meta.url), 'utf8'))
    const flows = pipeline.steps.filter(s => s.kind === 'flow')
    const talk = pipeline.steps.filter(s => s.kind === 'talk' && !s.handoff)
    const resultsBy = { [talk[0].id]: state({}).resultsBy.spark }
    writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify({ finished: [talk[0].id, flows[0].id], skipped: [], results: { slug: 'lighthouse' }, resultsBy }))
    writeFileSync(join(dir, '.bmuz', 'journal.jsonl'), JSON.stringify({ ev: 'step.start', step: pipeline.steps[0].id, t: 42 }) + '\n')
    writeFileSync(join(dir, flows[0].args.out.replace('{slug}', 'lighthouse')), REPORT)
    const script = fileURLToPath(new URL('../plugin/scripts/discover-doc.mjs', import.meta.url))
    const said = execFileSync('node', [script], { cwd: dir, encoding: 'utf8' })
    assert.match(said, /✔ \.planning\/DISCOVER\.md: run 1 saved/)
    const doc = readFileSync(join(dir, '.planning', 'DISCOVER.md'), 'utf8')
    assert.match(doc, /<!-- bmuz run key: 42 -->/)
    assert.match(doc, /\[the full report\]\(research\/discover-lighthouse-theme\.md\)/)
    assert.match(execFileSync('node', [script], { cwd: dir, encoding: 'utf8' }), /already in it/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
