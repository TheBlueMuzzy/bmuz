// Checks a discover research report (the research flow's done-check, pipeline "discover").
// node check-sources.mjs <report.md> [--offline]     (BMUZ_SOURCES_OFFLINE=1 also skips the links)
// Prints each problem in plain words; exits 0 when every rule holds, 1 otherwise.
//
// The rules (the report format: framework .planning/research/bmuz-vision/discover-research.md, section 5):
// - the sections are all there, in order (SECTIONS below)
// - every finding (a "- " line under "Findings by question") and every brick (under "Bricks", by shelf)
//   cites a source, like [2], and carries its
//   strength mark: (several sources) · (one source) · (interpretation only)   (H14 triangulation)
// - every contradiction, surprise and "so what" line cites a source; so does every supported or
//   contradicted assumption on the scoreboard ("no evidence" needs none); a "- none …" line is fine
// - every [n] cited anywhere is in the Sources list
// - every source is an http(s) link
// - every link answers (not offline)
//
// "Answers" (a call, 2026-11-09): any HTTP reply counts, except 404 and 410 (the page isn't there).
// A site that refuses robots (401, 403, 429, a 5xx from a bot wall) still proves the page's site is
// real; what this check is for is links a helper made up, which come back 404 or don't connect at all.
// No reply at all (no such site, refused, timed out) after 3 tries = dead.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LINK_RE = /https?:\/\/[^\s<>()\]]+/i

// The report's "## " sections, in order. cite: which "- " lines must cite a source.
export const SECTIONS = [
  { name: 'Question', re: /^question$/i, cite: 'none' },
  { name: 'Research questions', re: /^research questions$/i, cite: 'none' },
  { name: 'Findings by question', re: /^findings by question$/i, cite: 'finding' },
  { name: 'Bricks', re: /^bricks$/i, cite: 'brick' },
  { name: 'Contradictions', re: /^contradictions$/i, cite: 'every' },
  { name: 'Assumption scoreboard', re: /^assumption scoreboard$/i, cite: 'scoreboard' },
  { name: 'Surprises', re: /^surprises$/i, cite: 'every' },
  { name: 'Open questions → probes', re: /^open questions/i, cite: 'none' },
  { name: 'On ice', re: /^on ice$/i, cite: 'none' },
  { name: 'So what (draft for Define)', re: /^so what/i, cite: 'every' },
  { name: 'Sources', re: /^sources$/i, cite: 'sources' },
]
export const STRENGTH_RE = /\((several sources|one source|interpretation only)\)/i

// The report's structure, no network. Returns { problems, links: [{ n, url }] }.
export function checkReport(text) {
  const problems = []
  const lines = String(text).split(/\r?\n/)
  let section = null
  let rule = null
  const order = [] // the known sections, in the order they appear
  let findings = 0
  const cited = new Map() // n -> first line citing it
  const sources = new Map() // n -> url | null
  for (const raw of lines) {
    const line = raw.trim()
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      section = h[1]
      const known = SECTIONS.find(x => x.re.test(section))
      rule = known ? known.cite : 'none'
      if (known) order.push(known.name)
      continue
    }
    if (!line || section === null || /^#/.test(line)) continue
    if (rule === 'sources') {
      const m = line.match(/^(?:(\d+)[.)]|\[(\d+)\])\s+(.*)$/)
      if (!m) { problems.push(`the Sources line "${clip(line)}" doesn't start with its number, like "1. Title — https://…"`); continue }
      const n = Number(m[1] || m[2])
      if (sources.has(n)) problems.push(`source ${n} is listed twice`)
      const url = (m[3].match(LINK_RE) || [null])[0]
      sources.set(n, url ? url.replace(/[.,;]+$/, '') : null)
      if (!url) problems.push(`source ${n} ("${clip(m[3])}") has no http(s) link`)
      continue
    }
    const nums = [...line.matchAll(/\[(\d+)\]/g)].map(x => Number(x[1]))
    for (const n of nums) if (!cited.has(n)) cited.set(n, line)
    // Only list lines are claims; a line saying there is nothing ("- none found") needs no source.
    if (!/^[-*]\s/.test(line) || /^[-*]\s+(\*\*)?none\b/i.test(line)) continue
    const mustCite = rule === 'every' || rule === 'finding' || rule === 'brick' ||
      (rule === 'scoreboard' && /^[-*]\s+(\*\*)?(supported|contradicted)\b/i.test(line))
    if (mustCite && !nums.length) problems.push(`"${clip(line)}" (under "${section}") cites no source; every claim needs one, like [1]`)
    if (rule === 'finding') findings++
    // A brick is held to a finding's rule: it joins DISCOVER.md with its sources and its strength.
    if ((rule === 'finding' || rule === 'brick') && !STRENGTH_RE.test(line)) problems.push(`"${clip(line)}" (under "${section}") has no strength mark: (several sources), (one source) or (interpretation only)`)
  }
  const missing = SECTIONS.filter(x => !order.includes(x.name)).map(x => `"## ${x.name}"`)
  if (missing.length) problems.push(`the report has no ${missing.join(', ')} section${missing.length > 1 ? 's' : ''}`)
  const want = SECTIONS.map(x => x.name).filter(x => order.includes(x))
  if (JSON.stringify([...new Set(order)]) !== JSON.stringify(want)) problems.push(`the sections are out of order: ${[...new Set(order)].join(' · ')}; the order is ${SECTIONS.map(x => x.name).join(' · ')}`)
  if (order.includes('Findings by question') && findings === 0) problems.push('"Findings by question" has no findings')
  for (const [n, line] of cited) if (!sources.has(n)) problems.push(`[${n}] is cited ("${clip(line)}") but there is no source ${n} in the Sources list`)
  const links = [...sources.entries()].filter(([, u]) => u).map(([n, url]) => ({ n, url }))
  return { problems, links }
}

const clip = s => (s.length > 70 ? s.slice(0, 67) + '…' : s)

// Does this link answer? fetchFn is fetch (tests pass a fake). Returns null = answered, or why it didn't.
export async function linkAnswers(url, { fetchFn = fetch, timeoutMs = 8000, tries = 3, waitMs = 500 } = {}) {
  let last = ''
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise(r => setTimeout(r, waitMs * i))
    try {
      const opts = { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (BMUZ source check)' } }
      let res = await fetchFn(url, { ...opts, method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
      // Some sites answer HEAD wrongly (404/405/501); the GET is the real answer.
      if (res.status >= 400) res = await fetchFn(url, { ...opts, method: 'GET', signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404 || res.status === 410) return `answered ${res.status} (the page isn't there)`
      return null
    } catch (err) {
      last = (err && (err.cause?.code || err.name || err.message)) || String(err)
    }
  }
  return `no answer after ${tries} tries (${last})`
}

// The whole check. Returns the list of problems (empty = passes).
export async function checkSources(text, { offline = false, ...fetchOpts } = {}) {
  const { problems, links } = checkReport(text)
  if (offline) return problems
  const dead = await Promise.all(links.map(async l => ({ ...l, why: await linkAnswers(l.url, fetchOpts) })))
  for (const d of dead) if (d.why) problems.push(`source ${d.n} (${d.url}) is a dead link: ${d.why}`)
  return problems
}

// F229: the research flow drops dead links itself, before this check reads its report: the same test, on a list of
// links. Returns [{ url, why }] for the ones that don't answer (offline: none are tried).
export async function deadLinks(urls, { offline = false, ...fetchOpts } = {}) {
  if (offline) return []
  const list = [...new Set((Array.isArray(urls) ? urls : []).filter(u => /^https?:\/\/\S+$/i.test(String(u))))]
  const tried = await Promise.all(list.map(async url => ({ url, why: await linkAnswers(url, fetchOpts) })))
  return tried.filter(d => d.why)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  // node check-sources.mjs --dead <url> <url> …   → one line of JSON: {"dead":[{"url","why"}]}
  if (args[0] === '--dead') {
    const offline = process.env.BMUZ_SOURCES_OFFLINE === '1'
    // (BMUZ_LINK_TIMEOUT_MS: a test's local server that never answers is given up on sooner)
    const dead = await deadLinks(args.slice(1), { offline, timeoutMs: Number(process.env.BMUZ_LINK_TIMEOUT_MS) || 8000 })
    console.log(JSON.stringify({ dead, ...(offline ? { offline: true } : {}) }))
    process.exit(0)
  }
  const file = args.find(x => !x.startsWith('--'))
  const offline = args.includes('--offline') || process.env.BMUZ_SOURCES_OFFLINE === '1'
  if (!file) {
    console.log('usage: node check-sources.mjs <report.md> [--offline]')
    process.exit(2)
  }
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    console.log(`✘ ${file} can't be read: ${err.code || err.message}`)
    process.exit(1)
  }
  const problems = await checkSources(text, { offline })
  if (problems.length) {
    console.log(`✘ ${file}: ${problems.length} source problem${problems.length > 1 ? 's' : ''}`)
    for (const p of problems) console.log(`  - ${p}`)
    process.exit(1)
  }
  console.log(`✔ ${file}: every claim cites a source${offline ? ' (links not checked: offline)' : ' and every link answers'}`)
}
