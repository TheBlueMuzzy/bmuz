// F229 — Research, callable anywhere: the engine's two jobs around the research flow, run in the project folder.
//   node research.mjs found <report.md>     the report is checked (check-sources.mjs, the same rules as every research
//                                            step), its 3 short lines picked for "Here's what I found:", and the project
//                                            page rebuilt (its Sources tab lists the report). One line of JSON:
//                                            {"ok":true,"lines":[…]} or {"ok":false,"why":"…"}
//   node research.mjs stub <report.md> <question> <date> <place>
//                                            a test run's stand-in for the flow (BMUZ_RESEARCH_STUB names a folder with
//                                            question.md; honoured only with BMUZ_TEST=1, so a real run always
//                                            researches): copied in as this question's report. {"ok":true,"stub":true|false}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSources } from './check-sources.mjs'
import { writePage } from './gdd.mjs'

const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const isTest = () => process.env.BMUZ_TEST === '1'
// (a path the engine gave: inside the project, under .planning/research/, a .md file)
const safeOut = p => typeof p === 'string' && /^\.planning\/research\/[\w.-]+\.md$/.test(p) && !p.split('/').includes('..')

// The 3 short lines: the first finding of each research question in turn, then the next ones, until there are 3. A
// finding's [n] marks and strength mark are left out (the sources are on the project page); a long one is cut short.
export function shortLines(report, n = 3) {
  const body = (nl(report).split(/^## Findings by question\s*$/m)[1] || '').split(/^## /m)[0]
  const groups = body.split(/^### /m).slice(1).map(g => g.split('\n').filter(l => /^[-*]\s/.test(l.trim())).map(l => l.trim().replace(/^[-*]\s+/, '')))
    .map(ls => ls.filter(l => !/^none\b/i.test(l)))
  const clean = l => {
    const t = l.replace(/\s*\[\d+\]/g, '').replace(/\s*\((several sources|one source|interpretation only)\)\s*$/i, '').trim().replace(/[.;,\s]+$/, '')
    return t.length > 140 ? `${t.slice(0, 137).replace(/\s+\S*$/, '')}…` : t
  }
  const out = []
  for (let i = 0; out.length < n && groups.some(g => g[i]); i++) for (const g of groups) if (g[i] && out.length < n) out.push(clean(g[i]))
  return out
}

export async function found(dir, out, { offline = process.env.BMUZ_SOURCES_OFFLINE === '1' } = {}) {
  if (!safeOut(out)) return { ok: false, why: `"${out}" isn't a research report path (.planning/research/<name>.md)` }
  const p = join(dir, out)
  if (!existsSync(p)) return { ok: false, why: `the research flow wrote no report (${out})` }
  const text = readFileSync(p, 'utf8')
  const problems = await checkSources(text, { offline })
  if (problems.length) return { ok: false, why: `the report didn't pass the source check: ${problems.slice(0, 3).join('; ')}` }
  const lines = shortLines(text)
  if (!lines.length) return { ok: false, why: 'the report has no findings' }
  // (the project page from Define on; Ideate's page has no Sources tab yet)
  if (existsSync(join(dir, '.planning', 'GDD.md'))) writePage(dir)
  return { ok: true, lines, out }
}

export function stub(dir, out, question, date, place, env = process.env) {
  if (!(isTest() && env.BMUZ_RESEARCH_STUB)) return { ok: true, stub: false }
  const from = join(env.BMUZ_RESEARCH_STUB, 'question.md')
  if (!existsSync(from) || !safeOut(out)) return { ok: true, stub: false }
  const body = nl(readFileSync(from, 'utf8')).split('\n').slice(1).join('\n').replace(/^\s*Asked[^\n]*\n/, '')
  mkdirSync(dirname(join(dir, out)), { recursive: true })
  writeFileSync(join(dir, out), `# Research: ${question}\n\nAsked on ${date}${place ? ` at ${place}` : ''}.\n${body}`)
  return { ok: true, stub: true }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2)
  const dir = process.cwd()
  let r
  try {
    if (cmd === 'found') r = await found(dir, rest[0])
    else if (cmd === 'stub') r = stub(dir, rest[0], rest[1] || '', rest[2] || '', rest[3] || '')
    else r = { ok: false, why: 'use: node research.mjs found <report.md> | stub <report.md> <question> <date> <place>' }
  } catch (err) {
    r = { ok: false, why: String(err && err.message || err).slice(0, 300) }
  }
  console.log(JSON.stringify(r))
  process.exit(r.ok ? 0 : 1)
}
