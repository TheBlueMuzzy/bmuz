// Checks a research report's sources (the research flow's done-check, pipeline "discover").
// node check-sources.mjs <report.md> [--offline]     (BMUZ_SOURCES_OFFLINE=1 also skips the links)
// Prints each problem in plain words; exits 0 when every rule holds, 1 otherwise.
//
// The rules:
// - every line with words in a "## " section (other than Sources) is a claim and cites a source, like [2]
// - every [n] cited is in the Sources list
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

// The report's structure, no network. Returns { problems, links: [{ n, url }] }.
export function checkReport(text) {
  const problems = []
  const lines = String(text).split(/\r?\n/)
  let section = null
  const cited = new Map() // n -> first line citing it
  const sources = new Map() // n -> url | null
  for (const raw of lines) {
    const line = raw.trim()
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) { section = h[1]; continue }
    if (!line || section === null || /^#/.test(line)) continue
    if (/^sources$/i.test(section)) {
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
    if (!nums.length) problems.push(`"${clip(line)}" (under "${section}") cites no source; every claim needs one, like [1]`)
    for (const n of nums) if (!cited.has(n)) cited.set(n, line)
  }
  if (![...lines].some(l => /^##\s+sources\s*$/i.test(l.trim()))) problems.push('the report has no "## Sources" list')
  for (const [n, line] of cited) if (!sources.has(n)) problems.push(`[${n}] is cited ("${clip(line)}") but there is no source ${n} in the Sources list`)
  if (cited.size === 0 && sources.size === 0) problems.push('the report has no findings and no sources')
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
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
