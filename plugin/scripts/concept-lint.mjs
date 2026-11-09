// Define's structural check of the concept ("concept-lint" step and the review step's done-check).
// node concept-lint.mjs [gdd]      (default .planning/GDD.md; run in the project folder)
//
// The design: framework .planning/research/bmuz-vision/define-research.md, section 5(d), "By script".
// Fails (exit 1, the problems in plain words) only when the concept is malformed: a heading or field missing,
// too many or too few story lines, pillars or core verbs, a won't without a reason, a risk without a test, a
// pillar without the argument it settles, or DISCOVER.md's "chosen" marks not matching Part 1's count.
// An "open — not chosen yet" field passes: wrapping up early is allowed, never silent.
// Whether the parts agree in meaning is the concept-review flow's job, not this script's.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import { DISCOVER, GDD, PART1, PART1_HEADING, SHELVES_LABEL, fieldItems, fieldText, isOpen, markedIn, readGdd } from './define-doc.mjs'

// Returns { problems: [plain words], warnings: [plain words], open: [field names] }.
export function lintConcept(gddText, discoverText) {
  const problems = []
  const warnings = []
  const open = []
  if (gddText === null) return { problems: [`${GDD} doesn't exist: the write step makes it`], warnings, open }
  const g = readGdd(gddText)
  if (g.at < 0) return { problems: [`${GDD} has no "${PART1_HEADING}" section`], warnings, open }
  if (!g.head.some(l => /^Current phase:/.test(l))) problems.push('the GDD has no "Current phase:" line above Part 1')
  const count = (name, label, min, max, what) => {
    const sub = g.subs.find(s => s.name === name)
    const t = sub ? fieldText(sub, label) : null
    if (isOpen(t)) return null
    const items = fieldItems(t)
    if (items.length < min || items.length > max) problems.push(`${name}: ${what} has ${items.length} ${items.length === 1 ? 'line' : 'lines'}; it needs ${min === max ? min : `${min} to ${max}`} (one "- " line each)`)
    return items
  }
  for (const [name, fields] of PART1) {
    const sub = g.subs.find(s => s.name === name)
    if (!sub) { problems.push(`Part 1 has no "### ${name}" heading (write it back, with its fields, or run the write step again)`); continue }
    for (const [, label] of fields) {
      const t = fieldText(sub, label)
      if (t === null) problems.push(`${name} has no **${label}:** line (fill it, or write "open — not chosen yet")`)
      else if (!t.replace(/^\*\*[^*]+:\*\*/, '').trim()) problems.push(`${name}: **${label}:** is empty (fill it, or write "open — not chosen yet")`)
      else if (isOpen(t)) open.push(`${name}: ${label}`)
    }
  }
  count('The story', 'Story', 3, 5, 'the story')
  count('Experience targets', 'Primary feelings', 1, 2, 'the primary feelings list')
  count('Made of', 'Core verbs', 1, 3, 'the core verbs list')
  const pillars = count('Pillars', 'Pillars', 2, 5, 'the pillars list')
  if (pillars) {
    if (pillars.length !== 3) warnings.push(`there are ${pillars.length} pillars; 3 is usual`)
    pillars.forEach((p, i) => { if (!/— settles: (?!not said yet)\S/.test(p)) problems.push(`pillar ${i + 1} doesn't say which argument it settles ("— settles: …")`) })
  }
  const items = (name, label) => {
    const sub = g.subs.find(s => s.name === name)
    const t = sub ? fieldText(sub, label) : null
    return isOpen(t) ? [] : fieldItems(t)
  }
  items('Scope per release', "Won't").forEach(w => { if (!/— why: \S/.test(w)) problems.push(`the won't "${w.slice(0, 60)}" has no reason ("— why: …")`) })
  items('Risks & probes', 'Risks').forEach(r => { if (!/→ test: (?!not named)\S/.test(r)) problems.push(`the risk "${r.split('→')[0].trim().slice(0, 60)}" has no cheapest test ("→ test: …")`) })
  // Part 1 ↔ DISCOVER.md: the count of bricks this run says it chose matches DISCOVER.md's marks for that run.
  const line = g.intro.find(l => l.startsWith(`**${SHELVES_LABEL}:**`))
  if (!line) problems.push(`Part 1 has no **${SHELVES_LABEL}:** line (the write step writes it)`)
  else {
    const m = line.match(/Define run (\d+) chose (\d+) brick/)
    if (!m) problems.push(`the **${SHELVES_LABEL}:** line doesn't say "Define run N chose M bricks"`)
    else if (discoverText === null) problems.push(`${DISCOVER} is missing, so the chosen bricks can't be checked against the shelves`)
    else if (markedIn(discoverText, Number(m[1])) !== Number(m[2])) problems.push(`Part 1 says Define run ${m[1]} chose ${m[2]} bricks, but ${DISCOVER} marks ${markedIn(discoverText, Number(m[1]))} as chosen in that run`)
  }
  return { problems, warnings, open }
}

function main() {
  const out = process.argv[2] || GDD
  if (!E.isSafePath(out)) { console.log(`✘ ${out} isn't a path inside the project`); process.exit(1) }
  const read = f => (existsSync(join(process.cwd(), f)) ? readFileSync(join(process.cwd(), f), 'utf8') : null)
  const r = lintConcept(read(out), read(DISCOVER))
  const notes = [...r.warnings.map(w => `  note: ${w}`), ...(r.open.length ? [`  still open: ${r.open.join(', ')}`] : [])]
  if (r.problems.length) {
    console.log([`✘ ${out}: ${r.problems.length} problem${r.problems.length > 1 ? 's' : ''} in the concept`, ...r.problems.map(p => `  - ${p}`), ...notes].join('\n'))
    process.exit(1)
  }
  console.log([`✔ ${out}: Part 1 is well-formed`, ...notes].join('\n'))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
