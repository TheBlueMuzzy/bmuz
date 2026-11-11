// Design on the script (F227 task 4; framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stage 3).
//   node design.mjs sketch-prep          3.1: each sketch on the plan gets its page, a copy of the /sketch starter
//                                        (.planning/research/sketches/S01-<name>.html) with its title and question;
//                                        a numbers question gets a simulation file instead; the list in sketches.json
//   node design.mjs sketches-check       the sketch flow really built them (each page changed from the starter and
//                                        still has "Copy values for Claude"; each simulation file there)
//   node design.mjs sims                 runs each simulation (node, 60 s at most) and keeps what it printed
//   node design.mjs gdd <step> <level> [<n>=<level> …]
//                                        a step's result into the GDD, a chapter at its own level where named
//                                        (Screens & Menus: 13 worked out, 14 Teaching only loose)
//   node design.mjs tdd-start            3.6 "this also starts the TDD": .planning/TDD.md from the template's shape,
//                                        platforms and Players & Opponents filled from the GDD
//   node design.mjs plan-write           3.9: the TDD and the roadmap written from the plan step's result, and the
//                                        "Here's how it'll be built" + roadmap messages composed from the script
//   node design.mjs review-show          3.10: the Blueprint Review message, with the first sprint's three features
//   node design.mjs approved             after "Approve": logged in the GDD's Decisions and Changes
//   (run in the project folder)
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as E from '../hooks/engine.js'
import * as G from './gdd.mjs'
import * as M from './marks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const loadScript = () => E.parseScript(readFileSync(join(here, '..', 'script.md'), 'utf8'))
export const SKETCHES = '.planning/research/sketches'
export const MANIFEST = `${SKETCHES}/sketches.json`
export const STARTER = join(homedir(), '.claude', 'config', 'bmuz', 'templates', 'sketch', 'sketch-starter.html')
export const TDD = '.planning/TDD.md'
export const ROADMAP = '.planning/ROADMAP.md'
export const PLAN_MD = '.planning/research/design-plan.md'
export const REVIEW_MD = '.planning/research/design-review.md'
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
const slug = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sketch'
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fp = t => createHash('sha1').update(String(t)).digest('hex').slice(0, 12)
const day = (now = new Date()) => now.toISOString().slice(0, 10)
const readState = dir => { try { return JSON.parse(G.readFileIn(dir, '.bmuz/state.json') || 'null') } catch (e) { return null } }
const resultOf = (state, id) => (state && state.resultsBy && state.resultsBy[id]) || {}
const write = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text) }
const readJson = (dir, rel) => { try { return JSON.parse(G.readFileIn(dir, rel) || 'null') } catch (e) { return null } }

// ---- 3.1 Sketches ----
// A plan item: { id: "S01", name, question, test, numbers: true|false, knobs: [names] }.
export function sketchPrep(dir, plan, starter = STARTER) {
  const items = listOf(plan).filter(x => x && clean(x.name))
  const sketches = []
  for (const [i, x] of items.entries()) {
    const id = /^S\d{2,}$/.test(clean(x.id)) ? clean(x.id) : `S${String(i + 1).padStart(2, '0')}`
    const base = `${id}-${slug(x.name)}`
    const numbers = x.numbers === true || /^(yes|true)$/i.test(clean(x.numbers))
    const s = { id, name: clean(x.name), question: clean(x.question), test: clean(x.test), knobs: listOf(x.knobs).map(clean).filter(Boolean), numbers }
    if (numbers) {
      s.sim = `${SKETCHES}/${base}.sim.mjs`
      if (!existsSync(join(dir, s.sim))) write(dir, s.sim, `// ${id} ${s.name}: a numbers question, answered by simulation instead of a sketch (F227).\n// Question: ${s.question}\n// The sketch flow writes the simulation here. It prints ONE line of JSON last: {"how": "10,000 simulated games", "found": "…"}\nconsole.log(JSON.stringify({ how: 'nothing yet', found: 'the simulation is not written yet' }))\n`)
      s.starterPrint = fp(G.readFileIn(dir, s.sim))
    } else {
      if (!existsSync(starter)) throw new Error(`the /sketch starter isn't on this machine (${starter}); sync ~/.claude first`)
      s.file = `${SKETCHES}/${base}.html`
      s.link = pathToFileURL(resolve(dir, s.file)).href
      if (!existsSync(join(dir, s.file))) {
        const page = readFileSync(starter, 'utf8')
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(id)}: ${esc(s.name)}</title>`)
          .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(s.question || s.name)}">`)
        write(dir, s.file, page)
      }
      s.starterPrint = fp(G.readFileIn(dir, s.file))
    }
    sketches.push(s)
  }
  const out = { round: 1, made: day(), sketches }
  write(dir, MANIFEST, JSON.stringify(out, null, 2) + '\n')
  G.writePage(dir)
  return out
}

export function sketchesCheck(dir) {
  const m = readJson(dir, MANIFEST)
  if (!m) return [`there is no ${MANIFEST}`]
  const problems = []
  for (const s of m.sketches || []) {
    const path = s.numbers ? s.sim : s.file
    const text = G.readFileIn(dir, path)
    if (!text) { problems.push(`${s.id} ${s.name}: ${path} is missing`); continue }
    if (fp(text) === s.starterPrint) problems.push(`${s.id} ${s.name}: ${path} is still the starter (nothing built yet)`)
    if (!s.numbers && !text.includes('Copy values for Claude')) problems.push(`${s.id} ${s.name}: the "Copy values for Claude" button is gone`)
    if (!s.numbers && /<title>S1: Sketch name<\/title>/.test(text)) problems.push(`${s.id} ${s.name}: the title is still the starter's`)
  }
  return problems
}

// Runs each simulation; what it printed last (a JSON line {how, found}) goes into the list, or why it didn't run.
export function runSims(dir) {
  const m = readJson(dir, MANIFEST)
  if (!m) return { ran: 0 }
  let ran = 0
  for (const s of m.sketches || []) {
    if (!s.numbers || !s.sim) continue
    const r = spawnSync(process.execPath, [join(dir, s.sim)], { cwd: dir, encoding: 'utf8', timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    const last = String(r.stdout || '').trim().split('\n').pop() || ''
    let got = null
    try { got = JSON.parse(last) } catch (e) { got = null }
    if (r.status === 0 && got && clean(got.how) && clean(got.found)) s.result = { how: clean(got.how), found: clean(got.found).replace(/\.$/, '') }
    else s.result = { error: clean(r.error ? r.error.message : String(r.stderr || last || `exit ${r.status}`)).slice(0, 200) }
    ran += 1
  }
  write(dir, MANIFEST, JSON.stringify(m, null, 2) + '\n')
  return { ran, sketches: m.sketches }
}

// ---- a step's result into the GDD, some chapters at their own level ----
export function gddWrite(dir, stepId, level, overrides = {}, now = new Date()) {
  const state = readState(dir)
  if (!state) return { ok: false, say: '✘ no .bmuz/state.json: this runs inside a BMUZ stage' }
  const result = resultOf(state, stepId)
  const by = { step: stepId, stage: G.STAGE_NAMES[state.pipeline] || state.pipeline, day: day(now) }
  const chapters = result.chapters && typeof result.chapters === 'object' ? result.chapters : {}
  const main = { ...result, chapters: Object.fromEntries(Object.entries(chapters).filter(([n]) => !overrides[n])) }
  let doc = G.readFileIn(dir, G.GDD) || G.newGdd(result.name)
  const report = []
  const a = G.applyResult(doc, main, level, by)
  doc = a.text
  report.push(...a.report)
  for (const [n, lv] of Object.entries(overrides)) {
    if (!(n in chapters)) continue
    const b = G.applyResult(doc, { chapters: { [n]: chapters[n] } }, lv, by)
    doc = b.text
    report.push(...b.report)
  }
  write(dir, G.GDD, doc)
  G.writePage(dir, now)
  return { ok: true, say: `✔ ${G.GDD}: ${report.join('; ') || 'nothing new to write'} · page` }
}

// ---- The TDD (template shape: ~/.claude/config/bmuz/templates/TDD.md) ----
const TDD_SECTIONS = [
  ['glance', '1. At a glance'], ['fits', '2. How it fits together'], ['players', '2b. Game-specific systems'],
  ['data', '3. Data the game reads (editable by you, in Obsidian or the Dev Kit)'], ['standards', '4. Standards'],
  ['budgets', '5. Budgets'], ['security', '6. Security & fairness'], ['compliance', '7. Compliance & legal'],
  ['decisions', '8. Decisions log'], ['third', '9. Third-party stuff'], ['risks', '10. Risks & open questions'],
]
const STANDARDS = [
  '- **Readable code:** plain names, small files, a one-line comment on anything non-obvious. No clever tricks.',
  '- **Tests:** rules and logic get tests; every fixed bug gets a test that guards it. Feel is judged by playing, not tests.',
  '- **Testable by design:** game rules live in small pure functions (no screen, no network); the rulebook (.planning/design/RULEBOOK.md) is what they follow.',
  '- **Tunable:** every number you\'ll want to tune lives in content/ JSON, never in code.',
  '- **Branches:** one work branch per delivery (dev/<milestone>), merged at Deliver.',
].join('\n')
const BUDGETS = '| | Target | How it\'s checked |\n|---|---|---|\n| Frame rate | 60 fps on a mid-range phone | Dev Kit → Perf |\n| First load | under 3 s on 4G | Deliver\'s quick check |\n| Memory | no growth over a 10-minute session | Dev Kit → Perf |'
const COMPLIANCE = [
  '- [ ] Privacy policy page (both app stores require one, even with no data collected)',
  '- [ ] Age rating questionnaire answered honestly; not made for children under 13',
  '- [ ] Store privacy forms match what the game really collects',
  '- [ ] Any analytics, ads or accounts → consent and the privacy policy updated (EU/UK GDPR)',
  '- [ ] Every font, sound, image and code library licensed for commercial use (§9)',
  '- [ ] Accessibility basics: readable text, colour never the only signal, reduced motion respected',
].join('\n')
// The content tables call (task 3; framework research/bmuz-vision/content-tables-research.md), logged in every
// game's TDD Decisions with its Weighed block, as Muzzy asked (2026-11-11 01:45).
export const TABLES_DECISION = [
  'D01 · Content tables: JSON in content/data/ is the one source; a Google Sheet is an optional linked mirror',
  '  Proposed by: BMUZ   Options: JSON only / Sheet as the source / JSON with a linked Sheet mirror',
  '  Chose: JSON with an optional mirror per table — pull (Sheet → JSON: checked, shown as a diff, committed), push (values only, never formulas or notes columns), refused when both sides changed since the last sync (node tables.mjs link / pull / push / status)',
  '  Weighed: why it\'s this way now — the game reads content/ JSON and the Dev Kit edits it; git is the history and the save between machines · long term — one source keeps the Dev Kit, tests and releases simple; the Sheet can be dropped with no code change · standards — most tools are one-way (Joystick, Beamable, Hiro); Hutch moved its source to the Sheet but runs a live server and many designers; a one-person web game in git matches CastleDB / Dolt\'s "the repo is the source" · your goals — keep working in Sheets for games that started there; Dev Kit tuning shows up back in the Sheet; nothing typed is silently overwritten · the case against — push makes it two-way in practice (the refusal manages it, one more step); a pull is a manual step you can forget; simpler: pull only, if you mostly tune in the Sheet',
].join('\n')

export function newTdd(name) {
  const out = [`# ${clean(name) || 'Your game'} — Technical Design Document (TDD)`, '',
    '> How the game is built. Plain English first. Living document: Design starts it, Develop keeps it true. BMUZ writes between its marks (<!-- bmuz … -->); anything you write outside them is yours and is always kept.', '']
  for (const [key, head] of TDD_SECTIONS) out.push(`## ${head}`, M.block(`td:${key}`, G.NOTHING), '')
  return out.join('\n')
}
function tddWrite(dir, parts, by) {
  const gdd = G.readFileIn(dir, G.GDD) || ''
  let doc = G.readFileIn(dir, TDD) || newTdd(G.gameName(gdd))
  const wrote = []
  for (const [key, head] of TDD_SECTIONS) {
    const body = parts[key]
    if (body == null || !clean(body)) continue
    const r = M.writeBlock(doc, `td:${key}`, body, { after: `## ${head}`, by })
    doc = r.text
    if (r.changed) wrote.push(key)
  }
  write(dir, TDD, doc.endsWith('\n') ? doc : doc + '\n')
  return wrote
}
const chapterOf = (gdd, n) => { const c = G.readGdd(gdd)[n]; return c && c.text !== G.NOTHING ? c.text : '' }

export function tddStart(dir, now = new Date()) {
  const gdd = G.readFileIn(dir, G.GDD) || ''
  const state = readState(dir)
  const needs = listOf(resultOf(state, 'players').needs).map(clean).filter(Boolean)
  const by = { step: 'players', stage: 'Design', day: day(now) }
  const wrote = tddWrite(dir, {
    glance: [`- **Platforms:** from the GDD's Platform & Play:`, chapterOf(gdd, 5) || G.NOTHING, '- **Stack, hosting, Dev Kit tools:** chosen at The Build Plan (Design 3.9).'].join('\n'),
    players: ['**Players & Opponents** (from the GDD, chapter 11):', chapterOf(gdd, 11) || G.NOTHING, needs.length ? `\n**Needs:** ${needs.join(' · ')}` : ''].join('\n').trim(),
    standards: STANDARDS, budgets: BUDGETS, compliance: COMPLIANCE, decisions: TABLES_DECISION,
  }, by)
  G.writePage(dir, now)
  return wrote
}

// ---- 3.9 The Build Plan: the TDD and the roadmap from the plan step's result ----
// plan result: { how: [3 plain lines], tdd: { glance, fits, players, data, security, third, risks, decisions: [..] },
//   roadmap: { milestones: [{ name, stage, goal, features: [{ type, name, description, scope, needs: [names] }] }] } }
export const STAGE_WORDS = ['playable', 'alpha', 'beta', '1.0']
const TYPES = ['❓', '🧱', '🎮', '✨', '🔧', '🐞']
const textOf = v => (Array.isArray(v) ? listOf(v).map(x => `- ${clean(x && typeof x === 'object' ? x.text ?? x.name ?? '' : x).replace(/^- /, '')}`).join('\n') : v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '').trim())

export function roadmapText(name, milestones) {
  const ms = listOf(milestones).filter(m => m && clean(m.name))
  let n = 0
  const ids = new Map()
  const rows = ms.map((m, i) => ({ m, i, feats: listOf(m.features).filter(f => f && clean(f.name)).map(f => { n += 1; const id = `F${String(n).padStart(2, '0')}`; ids.set(clean(f.name).toLowerCase(), id); return { f, id } }) }))
  const musts = rows.flatMap(r => r.feats).filter(({ f }) => /^must/.test(clean(f.scope).toLowerCase()) || !clean(f.scope))
  const first = ms[0] ? STAGE_WORDS.find(w => clean(ms[0].stage).toLowerCase() === w) || 'playable' : 'playable'
  const out = [`# ${clean(name) || 'Your game'} — Roadmap`, `Release target: ${first} — musts 0/${musts.length} done`]
  for (const { m, i, feats } of rows) {
    const stage = STAGE_WORDS.find(w => clean(m.stage).toLowerCase() === w) || STAGE_WORDS[Math.min(i, 3)]
    out.push(`## v0.${i + 1} — ${clean(m.name)}${i === 0 ? '  ← current' : ''}  (→ ${stage})`)
    if (clean(m.goal)) out.push(`Goal: ${clean(m.goal)}`)
    const graph = []
    for (const { f, id } of feats) {
      const needs = listOf(f.needs).map(x => ids.get(clean(x).toLowerCase()) || (/^F\d+$/.test(clean(x)) ? clean(x) : null)).filter(Boolean).filter(x => x !== id)
      const scope = clean(f.scope).toLowerCase()
      const sc = /^should/.test(scope) ? 'should' : /^could/.test(scope) ? 'could' : `must:${stage}`
      const type = TYPES.includes(clean(f.type)) ? clean(f.type) : '🎮'
      out.push(`- ${needs.length ? '⏳' : '🟢'} ${id} ${type} ${clean(f.name)} — ${clean(f.description) || clean(f.name)} — ${sc}${needs.length ? ` · needs: ${needs.join(', ')}` : ''}`)
      graph.push(`  ${id}[${needs.length ? '⏳' : '🟢'} ${id} ${clean(f.name)}]`)
      for (const x of needs) graph.push(`  ${x} --> ${id}`)
    }
    if (graph.length) out.push('```mermaid', 'flowchart LR', ...graph, '```')
  }
  out.push('## Later', '', '## Ideas', '')
  return { text: out.join('\n'), firstSprint: (rows[0] ? rows[0].feats : []).slice(0, 3).map(({ f, id }) => `${id} — ${clean(f.name)}`) }
}

export function planWrite(dir, script = loadScript(), now = new Date()) {
  const state = readState(dir)
  const plan = resultOf(state, 'plan')
  const t = plan.tdd && typeof plan.tdd === 'object' ? plan.tdd : {}
  const by = { step: 'plan', stage: 'Design', day: day(now) }
  const decisions = [TABLES_DECISION, ...listOf(t.decisions).map((d, i) => {
    if (typeof d === 'string') return `D${String(i + 2).padStart(2, '0')} · ${clean(d)}`
    return [`D${String(i + 2).padStart(2, '0')} · ${clean(d.title || d.what)}`, d.options ? `  Options: ${listOf(d.options).map(clean).join(' / ')}` : null, `  Chose: ${clean(d.chose || d.choice)}${d.why ? ` — ${clean(d.why)}` : ''}`].filter(Boolean).join('\n')
  })].join('\n')
  const gdd = G.readFileIn(dir, G.GDD) || ''
  // (the TDD started at Players & Opponents keeps what this step doesn't say; hand edits are kept either way)
  const wrote = tddWrite(dir, {
    glance: t.glance ? textOf(t.glance) : null, fits: t.fits ? textOf(t.fits) : null, players: t.players ? textOf(t.players) : null,
    data: t.data ? textOf(t.data) : '| File | What\'s in it | Edited with |\n|---|---|---|\n| `content/data/*.json` | the content tables (cards, units, levels) | the Dev Kit, or a linked Google Sheet (pull / push) |\n| `content/tuning/*.json` | speeds, timings, odds | Dev Kit → Tuning |',
    standards: STANDARDS, budgets: BUDGETS, security: t.security ? textOf(t.security) : null, compliance: COMPLIANCE,
    decisions, third: t.third ? textOf(t.third) : null, risks: t.risks ? textOf(t.risks) : null,
  }, by)
  const rm = roadmapText(G.gameName(gdd), plan.roadmap && plan.roadmap.milestones ? plan.roadmap.milestones : plan.milestones)
  const prev = G.readFileIn(dir, ROADMAP)
  // (a roadmap already there is the creative's or an earlier plan's: BMUZ's goes in its marks, theirs is kept)
  // (the title line stays outside the marks, first, where the plan tools read it)
  const [title, ...body] = rm.text.split('\n')
  const r = prev ? M.writeBlock(prev, 'rm:plan', body.join('\n'), { after: title, by }) : { text: `${title}\n${M.block('rm:plan', body.join('\n'))}\n` }
  write(dir, ROADMAP, r.text.endsWith('\n') ? r.text : r.text + '\n')
  const ms = listOf(plan.roadmap && plan.roadmap.milestones ? plan.roadmap.milestones : plan.milestones).filter(m => m && clean(m.name))
  const how = E.renderLine(script, 'design.plan.how', { how: listOf(plan.how).map(clean).filter(Boolean) })
  if (how.error) throw new Error(how.error)
  const road = E.renderLine(script, 'design.plan.roadmap', { milestones: ms.map(m => `${clean(m.name)}${clean(m.goal) ? `: ${clean(m.goal)}` : ''}`) })
  if (road.error) throw new Error(road.error)
  write(dir, PLAN_MD, `${how.text}\n\n${road.text}\n`)
  G.writePage(dir, now)
  return { wrote, firstSprint: rm.firstSprint, features: (rm.text.match(/^- [⏳🟢]/gmu) || []).length }
}

// The first sprint: the first three features of the first milestone, "F01 — Name".
export function firstSprint(dir) {
  const rm = G.readFileIn(dir, ROADMAP) || ''
  const at = rm.split('\n').findIndex(l => /^## v/.test(l))
  const out = []
  for (const l of rm.split('\n').slice(at + 1)) {
    if (/^## /.test(l)) break
    const m = l.match(/^- \S+ (F\d+) \S+ (.+?) — /u)
    if (m) out.push(`${m[1]} — ${m[2]}`)
    if (out.length === 3) break
  }
  return out
}

export function reviewShow(dir, script = loadScript()) {
  const f = firstSprint(dir)
  const out = E.renderLine(script, 'design.review', { sprint: f.length ? f.join(' · ') : 'none yet' })
  if (out.error) throw new Error(out.error)
  write(dir, REVIEW_MD, out.text + '\n')
  G.writePage(dir)
  return out
}

export function approved(dir, now = new Date()) {
  const doc = G.readFileIn(dir, G.GDD)
  if (!doc) throw new Error(`there is no ${G.GDD}`)
  const out = G.applyResult(doc, { decisions: [`${day(now)} · The blueprint (the GDD, the rulebook, the content tables, the TDD and the roadmap) approved at Design's Blueprint Review; Develop builds from it, and every change is logged under Changes`] }, null, { step: 'review', stage: 'Design', day: day(now) })
  write(dir, G.GDD, out.text)
  G.writePage(dir, now)
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mode, ...rest] = process.argv.slice(2)
  const dir = process.cwd()
  const state = readState(dir)
  try {
    if (!state && mode !== 'sketches-check') throw new Error('no .bmuz/state.json: this runs inside a design run')
    if (mode === 'sketch-prep') {
      const m = sketchPrep(dir, resultOf(state, 'sketches').plan)
      console.log(`✔ ${MANIFEST}: ${m.sketches.map(s => `${s.id} ${s.numbers ? 'simulation' : 'sketch'}`).join(' · ') || 'nothing to build'}`)
    } else if (mode === 'sketches-check') {
      const p = sketchesCheck(dir)
      if (p.length) { console.log(`✘ the sketches aren't built yet: ${p.join('; ')}`); process.exit(1) }
      console.log('✔ every sketch on the list is built')
    } else if (mode === 'sims') {
      const r = runSims(dir)
      console.log(`✔ ${r.ran} simulations run${r.ran ? `: ${r.sketches.filter(s => s.numbers).map(s => `${s.id} ${s.result.error ? `didn't run (${s.result.error})` : s.result.found}`).join(' · ')}` : ''}`)
    } else if (mode === 'gdd') {
      const [step, ...lv] = rest
      const overrides = Object.fromEntries(lv.filter(x => /^\d+=/.test(x)).map(x => x.split('=')))
      const level = lv.filter(x => !/^\d+=/.test(x)).join(' ')
      const r = gddWrite(dir, step, level, overrides)
      console.log(r.say)
      process.exit(r.ok ? 0 : 1)
    } else if (mode === 'tdd-start') {
      console.log(`✔ ${TDD}: started (${tddStart(dir).join(', ')})`)
    } else if (mode === 'plan-write') {
      const r = planWrite(dir)
      console.log(`✔ ${TDD} (${r.wrote.join(', ')}) · ${ROADMAP} (${r.features} features; first sprint: ${r.firstSprint.join(' · ') || 'none'}) · ${PLAN_MD}`)
    } else if (mode === 'review-show') {
      reviewShow(dir)
      console.log(`✔ ${REVIEW_MD}`)
    } else if (mode === 'approved') {
      approved(dir)
      console.log(`✔ ${G.GDD}: the blueprint approved (Decisions, Changes)`)
    } else {
      throw new Error('use: node design.mjs sketch-prep | sketches-check | sims | gdd <step> <level> [n=level] | tdd-start | plan-write | review-show | approved')
    }
  } catch (err) {
    console.log(`✘ ${String(err && err.message ? err.message : err).slice(0, 300)}`)
    process.exit(1)
  }
}
