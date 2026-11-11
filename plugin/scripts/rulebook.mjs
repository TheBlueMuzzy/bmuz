// The rulebook (F227 task 2; the approved script's 3.2, framework .planning/research/bmuz-vision/bmuz-design-doc.html):
// the rules written like a real rulebook, in Muzzy's own rulebooks' order (Blobimus, Sirius Smugglers, Dust Bunny
// Rumble, Glyphtender's Trial): Overview · Components · How to Win · Setup · Gameplay (the Flow, then each action) ·
// Game End · Scoring · Keywords · Development Log. The single truth the game, the tests and the tutorial follow.
//
//   node rulebook.mjs step <step-id> [level]   write that step's "rulebook" result (.bmuz/state.json) into
//                                              .planning/design/RULEBOOK.md, its summary into GDD chapter 8 (at the
//                                              level, default loose), then the project page
//   node rulebook.mjs done-show                3.2's "First pass done" message, counted from the file (TBD rules,
//                                              Rule A / Rule B pairs, the last Development Log entry), to be shown
//   (run in the project folder)
//
// Hand edits are kept the way the GDD keeps them (marks.mjs): BMUZ writes each part between fingerprinted marks;
// anything outside them is the creative's, and a part they changed inside the marks moves out of them, kept for good,
// with BMUZ's new text dated below. The Development Log only grows (one dated, numbered entry per write that gives one).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as M from './marks.mjs'

export const RULEBOOK = '.planning/design/RULEBOOK.md'
export const DONE_MD = '.planning/research/design-rulebook-done.md'
const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
export const slug = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x'

// The sections, in order: [key, heading]. The Flow and the actions sit under Gameplay.
export const SECTIONS = [
  ['overview', 'Overview'], ['components', 'Components'], ['win', 'How to Win'], ['setup', 'Setup'],
  ['gameplay', 'Gameplay'], ['end', 'Game End'], ['scoring', 'Scoring'], ['keywords', 'Keywords'], ['log', 'Development Log'],
]
const LOG = '## Development Log'

export function newRulebook(name = '') {
  const out = [`# ${clean(name) || 'Your game'} — Rulebook`, '',
    'The rules, written like a real rulebook: the single truth the game, the tests and the tutorial follow. A first pass is rough on purpose. BMUZ writes between its marks (<!-- bmuz … -->); anything you write outside them is yours and is always kept, and if you change BMUZ\'s text, your version is kept too.', '']
  for (const [key, head] of SECTIONS) {
    out.push(`## ${head}`, '')
    if (key === 'gameplay') out.push('### The Flow', M.block('rb:flow', G.NOTHING), '')
    else if (key === 'log') out.push('What changed and why, newest last.', '')
    else out.push(M.block(`rb:${key}`, G.NOTHING), '')
  }
  return out.join('\n')
}

// A part's text: a string as it is, a list as "- " lines, the Flow as numbered steps.
function partText(v, numbered = false) {
  if (v == null) return null
  if (Array.isArray(v)) {
    const items = v.map(x => (x && typeof x === 'object' ? (x.term ? `**${clean(x.term)}**: ${clean(x.meaning ?? x.text ?? '')}` : x.text ?? x.name ?? '') : x)).map(x => clean(x).replace(/^(\d+[.)]|[-·•])\s+/, '')).filter(Boolean)
    if (!items.length) return null
    return items.map((x, i) => (numbered ? `${i + 1}. ${x}` : `- ${x}`)).join('\n')
  }
  if (typeof v === 'object') return partText(v.text ?? v.lines ?? null, numbered)
  const t = nl(v).trim()
  return t || null
}

// The Flow's steps as a list (for the 3.2 "Here's the Flow as I've written it" line).
export function flowSteps(text) {
  const b = M.readBlocks(text)['rb:flow']
  if (!b || b.text === G.NOTHING) return []
  return b.text.split('\n').map(l => l.replace(/^\s*(\d+[.)]|[-·•])\s+/, '').trim()).filter(Boolean)
}

// The Development Log's entries ("- " lines under its heading).
export function logEntries(text) {
  const lines = nl(text).split('\n')
  const at = lines.findIndex(l => l.trim() === LOG)
  if (at < 0) return []
  const out = []
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) if (/^- /.test(lines[i])) out.push(lines[i].slice(2).trim())
  return out
}

function addLog(text, entry, day) {
  const e = clean(entry)
  if (!e) return { text, added: null }
  const have = logEntries(text)
  if (have.some(h => h.replace(/^v\d+\.\d+ · \S+ · /, '') === e)) return { text, added: null }
  const line = `v0.${have.length + 1} · ${day} · ${e}`
  const lines = nl(text).split('\n')
  let at = lines.findIndex(l => l.trim() === LOG)
  if (at < 0) { lines.push('', LOG, ''); at = lines.length - 2 }
  let end = at + 1
  while (end < lines.length && !/^##\s/.test(lines[end])) end++
  while (end > at + 1 && lines[end - 1].trim() === '') end--
  lines.splice(end, 0, `- ${line}`)
  return { text: lines.join('\n'), added: line }
}

// Writes a step's rulebook result: { overview, components, win, setup, flow: [steps], actions: [{name, text}], end,
// scoring, keywords: [{term, meaning}] or text, log: "what changed and why" }, every key optional.
// Returns { text, report: [plain lines], kept: [parts whose hand edit was kept] }.
export function applyRulebook(text, r, by = {}) {
  let doc = nl(text).trim() ? nl(text) : newRulebook(r && r.name)
  const rb = r && typeof r === 'object' ? r : {}
  const wrote = []
  const kept = []
  const put = (key, body, after) => {
    if (body == null) return
    const out = M.writeBlock(doc, key, body, { after, by })
    doc = out.text
    if (out.changed) wrote.push(key.replace(/^rb:/, ''))
    if (out.kept) kept.push(key.replace(/^rb:/, ''))
  }
  for (const [key, head] of SECTIONS) {
    if (key === 'gameplay' || key === 'log') continue
    put(`rb:${key}`, partText(rb[key]), `## ${head}`)
  }
  put('rb:flow', partText(rb.flow, true), '### The Flow')
  for (const a of Array.isArray(rb.actions) ? rb.actions : []) {
    const name = clean(a && typeof a === 'object' ? a.name : a)
    const body = partText(a && typeof a === 'object' ? a.text ?? a.rules : null)
    if (!name || !body) continue
    const key = `rb:action-${slug(name)}`
    if (!M.readBlocks(doc)[key]) {
      // (a new action: its own heading under Gameplay, after the last one, before Game End)
      const lines = doc.split('\n')
      let at = lines.findIndex(l => l.trim() === '## Game End')
      if (at < 0) at = lines.length
      while (at > 0 && lines[at - 1].trim() === '') at--
      lines.splice(at, 0, '', `### ${name}`, ...M.block(key, body).split('\n'))
      doc = lines.join('\n')
      wrote.push(`action ${name}`)
    } else put(key, body)
  }
  const log = addLog(doc, rb.log, by.day || '')
  doc = log.text
  const report = []
  if (wrote.length) report.push(`wrote ${wrote.join(', ')}`)
  if (kept.length) report.push(`your own edit kept in ${kept.join(', ')} (BMUZ's update added below it)`)
  if (log.added) report.push(`Development Log: ${log.added}`)
  return { text: doc.endsWith('\n') ? doc : doc + '\n', report, kept, logged: log.added }
}

// What the first pass leaves open, counted from the file: rules marked TBD, rival rules "Rule A / Rule B".
export function counts(text) {
  const body = nl(text).split('\n')
  const at = body.findIndex(l => l.trim() === LOG)
  const rules = (at < 0 ? body : body.slice(0, at)).filter(l => !/^<!-- /.test(l))
  return {
    tbd: rules.filter(l => /\bTBD\b/.test(l)).length,
    ab: rules.filter(l => /\bRule A\b[\s\S]*\bRule B\b|\(A\)[\s\S]*\(B\)/.test(l)).length,
    actions: rules.filter(l => /^### /.test(l) && l.trim() !== '### The Flow').map(l => l.replace(/^###\s+/, '').trim()),
  }
}

// The rulebook in a few lines, for GDD chapter 8 (the rulebook itself lives in its own file, on its own tab).
export function summary(text) {
  const c = counts(text)
  const flow = flowSteps(text)
  const b = M.readBlocks(text)
  const first = k => ((b[k] && b[k].text !== G.NOTHING ? b[k].text : '').split('\n')[0] || '').replace(/^- /, '')
  return [
    `The rulebook: ${RULEBOOK} (its own tab on the project page).`,
    first('rb:overview') ? `- **Overview:** ${first('rb:overview')}` : null,
    flow.length ? `- **The Flow:** ${flow.length} steps: ${flow.join(' ')}` : null,
    c.actions.length ? `- **Actions:** ${c.actions.join(' · ')}` : null,
    first('rb:win') ? `- **How to win:** ${first('rb:win')}` : null,
    `- **Still rough:** ${c.tbd} TBD · ${c.ab} Rule A / Rule B to test`,
  ].filter(Boolean).join('\n')
}

export function stepWrite(dir, stepId, level = 'loose', now = new Date()) {
  let state
  try { state = JSON.parse(G.readFileIn(dir, '.bmuz/state.json') || 'null') } catch (e) { state = null }
  if (!state) return { ok: false, say: '✘ no .bmuz/state.json: this runs inside a BMUZ stage' }
  const result = (state.resultsBy && state.resultsBy[stepId]) || {}
  const by = { step: stepId, stage: G.STAGE_NAMES[state.pipeline] || state.pipeline, day: now.toISOString().slice(0, 10) }
  const gdd = G.readFileIn(dir, G.GDD) || G.newGdd()
  const out = applyRulebook(G.readFileIn(dir, RULEBOOK) || newRulebook(G.gameName(gdd)), result.rulebook || {}, by)
  mkdirSync(dirname(join(dir, RULEBOOK)), { recursive: true })
  writeFileSync(join(dir, RULEBOOK), out.text)
  const g = G.applyResult(gdd, { chapters: { 8: summary(out.text) } }, level, by)
  writeFileSync(join(dir, G.GDD), g.text)
  G.writePage(dir, now)
  return { ok: true, say: `✔ ${RULEBOOK}: ${out.report.join('; ') || 'nothing new to write'} · GDD chapter 8 · page`, out }
}

export function doneShow(dir, script = loadScript()) {
  const text = G.readFileIn(dir, RULEBOOK)
  if (!text) throw new Error(`there is no ${RULEBOOK} yet`)
  const c = counts(text)
  const log = logEntries(text)
  const out = E.renderLine(script, 'design.rulebook.done', { tbd: String(c.tbd), ab: String(c.ab), entry: log[log.length - 1] || 'none yet' })
  if (out.error) throw new Error(out.error)
  mkdirSync(dirname(join(dir, DONE_MD)), { recursive: true })
  writeFileSync(join(dir, DONE_MD), out.text + '\n')
  return { text: out.text, counts: c }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [cmd, a, ...rest] = process.argv.slice(2)
  const dir = process.cwd()
  try {
    if (cmd === 'step') {
      const r = stepWrite(dir, a, rest.join(' ') || 'loose')
      console.log(r.say)
      process.exit(r.ok ? 0 : 1)
    } else if (cmd === 'done-show') {
      const r = doneShow(dir)
      console.log(`✔ ${DONE_MD}: ${r.counts.tbd} TBD, ${r.counts.ab} Rule A / Rule B`)
    } else {
      console.log('✘ use: node rulebook.mjs step <step-id> [level] | done-show')
      process.exit(1)
    }
  } catch (err) {
    console.log(`✘ ${String(err && err.message ? err.message : err).slice(0, 300)}`)
    process.exit(1)
  }
}
