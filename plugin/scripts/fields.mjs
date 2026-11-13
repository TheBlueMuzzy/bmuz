// F234 — Steps ask only what's still open: the evidence the engine reads before each Ideate and Define step
// (.planning/research/fields.json, { "<field>": [{ chapter, line, kind, step, day }] }; engine.js askPlan, and
// docs/pipeline-format.md "Asking only what's still open").
//   node fields.mjs decided <field> <chapter> <step> <answer>   the "already decided" step-in: the answer goes into its chapter
//                                                         as "Fixed: … (you said it's already decided)" and the field is
//                                                         recorded decided (run by the engine, in the project folder)
// A record is only a pointer: the engine counts it only while its line is still in its chapter of the GDD.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'

export const DECIDED_MARK = "(you said it's already decided)"

export function readFields(project) {
  const f = join(project, E.FIELDS_FILE)
  if (!existsSync(f)) return {}
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch (e) {
    return {}
  }
}

// Adds records (each { field, chapter, line, kind, step }); one field + line is recorded once (the newest kind wins).
export function addRecords(project, recs) {
  const ok = (recs || []).filter(r => r && E.FIELD_RE.test(String(r.field || '')) && Number.isInteger(Number(r.chapter)) && String(r.line || '').trim() && E.FIELD_KINDS.includes(r.kind))
  if (!ok.length) return 0
  const doc = readFields(project)
  const day = new Date().toISOString().slice(0, 10)
  for (const r of ok) {
    const list = (doc[r.field] || []).filter(x => E.fieldText(x.line) !== E.fieldText(r.line))
    list.push({ chapter: Number(r.chapter), line: String(r.line).trim(), kind: r.kind, step: r.step || '', day })
    doc[r.field] = list
  }
  mkdirSync(dirname(join(project, E.FIELDS_FILE)), { recursive: true })
  writeFileSync(join(project, E.FIELDS_FILE), JSON.stringify(doc, null, 2) + '\n')
  return ok.length
}

// The kind of evidence a GDD line is: a quoted rule of a finished game (checked as theirs) is fixed; their own
// answer is said; anything else is my reading.
export function kindOf(label, theirs) {
  if (/^fixed$/i.test(label) && theirs) return 'fixed'
  return theirs ? 'said' : 'read'
}

// The stage's "What I didn't ask about" line (Muzzy's rule 4: never a silent skip), from the engine's plans in the
// state; '' when nothing was left out. Said at the stage's end (Ideate's page, Define's lock-show).
const here = dirname(fileURLToPath(import.meta.url))
export function skipList(state, script) {
  let p = null
  try { p = JSON.parse(readFileSync(join(here, '..', 'pipelines', `${state.pipeline}.json`), 'utf8')) } catch (e) { return '' }
  const items = E.skipItems(p, state)
  if (!items.length) return ''
  const r = E.renderLine(script, 'any.skipped', { skipped: items.map(i => `${i.what} (${i.title}): ${i.why}`) })
  if (r.error) throw new Error(r.error)
  return r.text
}

// "Already decided": the answer into its chapter (its level kept; an empty chapter becomes loose) and the record.
export function decided(project, field, chapter, answer, step = '') {
  const n = Number(chapter)
  if (!E.FIELD_RE.test(String(field || '')) || !G.chapterName(n)) throw new Error(`no such field or chapter: ${field} ${chapter}`)
  const words = String(answer || '').replace(/\s+/g, ' ').trim().replace(/[.]+$/, '')
  if (!words) throw new Error('no answer: what was decided?')
  const line = `Fixed: ${words} ${DECIDED_MARK}`
  let doc = G.readFileIn(project, G.GDD) || G.newGdd()
  const ch = G.readGdd(doc)[n]
  const have = ch && ch.text && ch.text.trim() !== G.NOTHING ? ch.text.split('\n').map(l => l.replace(/^- /, '')).filter(l => l.trim()) : []
  if (!have.some(l => E.fieldText(l) === E.fieldText(line))) {
    const level = ch && ch.level && ch.level !== 'empty' ? ch.level : 'loose'
    doc = G.writeChapter(doc, n, [...have, line], level, { step, stage: '', day: new Date().toISOString().slice(0, 10) }).text
    mkdirSync(dirname(join(project, G.GDD)), { recursive: true })
    writeFileSync(join(project, G.GDD), doc)
    G.writePage(project)
  }
  addRecords(project, [{ field, chapter: n, line, kind: 'decided', step }])
  return { line }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mode, field, chapter, step, ...rest] = process.argv.slice(2)
  try {
    if (mode !== 'decided') throw new Error('use: node fields.mjs decided <field> <chapter> <step> <answer>')
    const r = decided(process.cwd(), field, chapter, rest.join(' '), step)
    console.log(`✔ ${G.GDD}: ${field} decided — ${r.line}`)
  } catch (err) {
    console.log(`✘ ${String(err && err.message ? err.message : err).slice(0, 300)}`)
    process.exit(1)
  }
}
