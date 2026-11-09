// Define's first step ("digest"): DISCOVER.md's shelves, grouped, so the talk steps can offer them a few at a time.
// node define-digest.mjs        (run in the project folder; writes .planning/research/define-digest.md)
//
// The design: framework .planning/research/bmuz-vision/define-research.md, section 5(a) step 1 and 5(e).
// No AI: every brick is grouped by its shelf, then by the label Discover gave it ("Situation", "Fantasy"…),
// then research bricks together, each with a short id ([EX3]) the talk steps hand back so the write step can
// mark the brick in DISCOVER.md. Nothing is chosen, ranked or trimmed here; DISCOVER.md is only read.
// A second run (GDD Part 1 already written) is marked a revision: it lists what is locked and what is new.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DIGEST, DISCOVER, GDD, PART1, allBricks, fieldText, gddRuns, readGdd, readShelves } from './define-doc.mjs'

const SOURCE_WORDS = { creative: "the creative's words", material: 'from their material', picked: 'picked by the creative', Claude: "Claude's suggestion", research: 'research', 'hand-added': 'added by hand' }
const tag = b => `(${b.source === 'research' ? 'research' : b.source === 'hand-added' ? 'added by hand' : b.source === 'creative' ? 'their words' : b.source === 'material' ? 'their words, from their material' : b.source === 'picked' ? 'they picked it' : 'Claude'}${b.defineNotes.length ? ` · ${b.defineNotes.join(' · ')}` : ''})`

// The digest's text. doc = readShelves(DISCOVER.md); gddText = GDD.md or null.
export function digest(doc, gddText, date) {
  const g = gddText ? readGdd(gddText) : null
  const revision = !!(g && g.at >= 0 && g.subs.length)
  const runs = gddRuns(gddText)
  const n = runs.define + 1
  const bricks = allBricks(doc)
  const out = [
    `# Define digest${doc.brief ? `: ${doc.brief}` : ''}`,
    `Define run: ${n}${revision ? ' (a revision: GDD Part 1 is already written; each step shows the locked version first, so "keep" is one tap)' : ' (the first Define run)'}`,
    `Read: ${DISCOVER} through Discover run ${doc.discoverRuns} · ${date} · ${bricks.length} bricks on ${doc.shelves.filter(s => s.bricks.length).length} shelves`,
    '',
    'Made by the define-digest script (no AI): DISCOVER.md\'s shelves grouped by shelf, then by the label Discover gave each brick, then research. Nothing here is chosen or ranked; shelf order is DISCOVER.md\'s order. Each brick has an id like [EX3]: hand it back as "brick" with any item chosen from a shelf, so the write step marks it in DISCOVER.md.',
    `Seed: ${doc.seed || 'not given'}`,
    '',
    '## Counts',
    ...doc.shelves.map(s => {
      const by = k => s.bricks.filter(b => b.source === k).length
      const parts = Object.keys(SOURCE_WORDS).map(k => [k, by(k)]).filter(([, c]) => c).map(([k, c]) => `${SOURCE_WORDS[k]} ${c}`)
      return `- ${s.name} [${s.code}]: ${s.bricks.length}${parts.length ? ` (${parts.join(' · ')})` : ''}`
    }),
    '',
  ]
  if (revision) {
    out.push('## Already locked (GDD Part 1, as it stands)')
    for (const [name, fields] of PART1) {
      const sub = g.subs.find(s => s.name === name)
      out.push(`### ${name}`)
      for (const [, label] of fields) out.push(sub && fieldText(sub, label) !== null ? fieldText(sub, label) : `**${label}:** (missing)`)
    }
    const fresh = bricks.filter(b => b.run > runs.discover)
    out.push('', `## New since the last Define run (Discover runs after ${runs.discover})`, ...(fresh.length ? fresh.map(b => `- [${b.id}] ${b.shelf}: ${b.text} ${tag(b)}`) : ['- none']), '')
  }
  out.push('## Shelves')
  for (const s of doc.shelves) {
    out.push(`### ${s.name} [${s.code}] (${s.bricks.length})`)
    if (!s.bricks.length) { out.push('- none yet'); continue }
    // Groups: each Discover label in order of first appearance, then unlabelled bricks, then research.
    const groups = new Map()
    for (const b of s.bricks) {
      const k = b.source === 'research' ? 'From research' : b.label || 'Collected'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(b)
    }
    const order = [...groups.keys()].sort((a, b) => (a === 'From research') - (b === 'From research'))
    for (const k of order) {
      const list = groups.get(k)
      out.push(`#### ${k} (${list.length})`)
      for (const b of list) out.push(`- [${b.id}] ${k !== 'From research' && b.label ? b.text.slice(b.label.length + 1).trim() : b.text} ${tag(b)}`)
    }
  }
  // What Discover flagged as pulling against the idea: mechanisms that felt pasted on, and fears the research backed.
  const flagged = bricks.filter(b => /^Feels pasted on: /.test(b.text) || /^Fear ".*": supported\b/.test(b.text) || /^Fear ".*": contradicted\b/.test(b.text))
  out.push('', '## Tensions Discover flagged', ...(flagged.length ? flagged.map(b => `- [${b.id}] ${b.text}`) : ['- none']), '')
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', n, revision, count: bricks.length }
}

function main() {
  const project = process.cwd()
  const read = f => (existsSync(join(project, f)) ? readFileSync(join(project, f), 'utf8') : null)
  const text = read(DISCOVER)
  const doc = text && readShelves(text)
  if (!doc) { console.log(`✘ ${DISCOVER} is missing or has no "## Shelves": Define builds on Discover's shelves. Run discover first.`); process.exit(1) }
  const d = digest(doc, read(GDD), new Date().toLocaleDateString('en-CA'))
  mkdirSync(join(project, dirname(DIGEST)), { recursive: true })
  writeFileSync(join(project, DIGEST), d.text)
  console.log(`✔ ${DIGEST}: Define run ${d.n}${d.revision ? ' (a revision)' : ''} — ${d.count} bricks grouped`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
