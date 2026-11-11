// F227 task 4–5: Design on the approved script's 3.0–3.10. No-Claude tests of the pipeline's shape and of
// design.mjs (sketches, the TDD, the roadmap, the Blueprint Review), on the script's own made-up example: the garden race.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'
import * as D from '../plugin/scripts/design.mjs'
import * as R from '../plugin/scripts/rulebook.mjs'
import * as T from '../plugin/scripts/tables.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'design.json'), 'utf8'))
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
const step = id => P.steps.find(s => s.id === id)

test('the pipeline is the script\'s Stage 3: the welcome, then 3.1–3.10 in order, every Design line said by a step or composed by a script', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  assert.deepEqual(E.checkLines(P, script), [])
  const titled = [...new Map(P.steps.filter(s => s.no).map(s => [s.no, s.title])).entries()]
  assert.deepEqual(titled, [['3.0', 'Welcome to Design'], ['3.1', 'Sketches, Round 1'], ['3.2', 'The Rulebook'], ['3.3', 'Content & Balance'], ['3.4', 'Change Over Time'], ['3.5', 'Scope & Risks, Second Pass'], ['3.6', 'Players & Opponents'], ['3.7', 'Look & Sound'], ['3.8', 'Screens & Menus'], ['3.9', 'The Build Plan'], ['3.10', 'Blueprint Review']])
  const said = new Set([...P.steps.flatMap(s => s.lines || []), ...P.steps.filter(s => s.line).map(s => s.line)])
  // composed by a script from script.md and shown word for word, not said by Claude
  const composed = ['design.rulebook.done', 'design.plan.how', 'design.plan.roadmap', 'design.review']
  for (const id of Object.keys(script.lines).filter(id => id.startsWith('design.') && !composed.includes(id))) assert.ok(said.has(id), id)
  for (const id of composed) assert.ok(!said.has(id), id)
  assert.ok(said.has('define.scope.idea')) // 3.5's box is Define's own words
  assert.equal(E.stepPlace(P, step('flow')), 'Design · 2 of 10 · The Rulebook')
  assert.equal(E.stepPlace(P, step('welcome')), 'Design · Welcome to Design')
  assert.equal(E.stepPlace(P, step('review')), 'Design · 10 of 10 · Blueprint Review')
  assert.deepEqual(P.next, { pipeline: 'develop', ask: false })
})

test('sketches only when there are any; research offered first, never forced; sketches and looks built by fresh helpers (bmuz:sketch-flow, pre-approved)', () => {
  for (const id of ['sketch-prep', 'sketch-build', 'sims', 'sketch-play']) assert.equal(step(id).when, '{build}', id)
  assert.equal(E.isWanted(step('sketch-build'), { build: 'no' }), false)
  assert.equal(step('rules-research').when, '{research}')
  assert.equal(step('rules-research').workflow, 'bmuz:research-flow')
  assert.equal(step('sketch-build').workflow, 'bmuz:sketch-flow')
  assert.equal(step('look-build').workflow, 'bmuz:sketch-flow')
  assert.equal(step('look-build').args.mode, 'look')
  const auto = JSON.parse(readFileSync(join(plugin, 'settings', 'auto-run.json'), 'utf8'))
  assert.ok(auto.permissions.allow.includes('Workflow(bmuz:sketch-flow)'))
  // research before the questions at Players & Opponents and The Build Plan: the talk steps may search, nothing more
  for (const id of ['players-read', 'plan']) assert.ok(step(id).tools.includes('WebSearch') && !step(id).tools.includes('AskUserQuestion'), id)
})

test('Blueprint Review: the script\'s box as an engine gate ("Not yet" first, Approve never pre-picked); "Not yet" goes back to a step that runs only then', () => {
  const g = step('review')
  assert.equal(g.kind, 'gate')
  assert.deepEqual(E.gateWords(g, script), { question: 'Ready to build?', options: ['Not yet: change something', 'Approve: start building'] })
  assert.equal(g.approve, 'Approve: start building')
  assert.equal(g.backTo, 'change')
  assert.equal(step('change').onBack, true)
  const st = { ...E.freshState('design'), finished: P.steps.slice(0, P.steps.indexOf(g)).map(s => s.id), current: 'review', status: 'waiting', results: {} }
  assert.equal(E.onBackSkips(step('change'), st), true)
  const back = E.answerGate(P, st, g, 'Not yet: change something')
  assert.equal(back.approved, false)
  assert.equal(E.nextStep(P, back.state).id, 'change')
})

// A GDD where Define left it (the growth chart's Define column), the garden race.
function project() {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-design-'))
  mkdirSync(join(dir, '.bmuz'))
  mkdirSync(join(dir, '.planning'), { recursive: true })
  const by = { step: 'x', stage: 'Define', day: '2026-11-11' }
  let gdd = G.newGdd('Garden Race')
  gdd = G.applyResult(gdd, { chapters: { 1: '**The feeling:** a close race', 2: '- **Quick rivalry**', 3: '**One line:** a three-minute garden race where the weather is your weapon', 4: '**You draw → you plant or play weather → you score → (again)**', 5: '- **First:** The web', 6: '**Must:** planting · weather', 7: '- weather may feel mean' } }, 'chosen', by).text
  gdd = G.applyResult(gdd, { chapters: { 8: ['Idea: "weather cards"'], 10: ['Idea: seasons later'], 11: ['Idea: a computer opponent'], 12: ['Idea: "bright hand-drawn flowers"'] }, sketches: [{ name: 'Hail timing', question: 'when does hail hurt most?' }, { name: 'First-player advantage', question: 'does going first win more?' }] }, 'loose', by).text
  writeFileSync(join(dir, G.GDD), gdd)
  return dir
}
const setState = (dir, resultsBy) => writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ pipeline: 'design', resultsBy }))
const levels = dir => Object.fromEntries(Object.entries(G.readGdd(readFileSync(join(dir, G.GDD), 'utf8'))).map(([n, c]) => [n, c.level]))

test('every chapter ends Design where the script\'s growth chart says: 1–2 chosen, 3–13 worked out, 14 loose', () => {
  const dir = project()
  const results = {
    'flow-check': { chapters: { 4: '**You draw → you plant or play weather → you score → (again)**\n- **The Flow:** 4 steps' } },
    sections: { rulebook: { win: 'Most blooms wins.', flow: ['Draw two cards.'] } },
    content: { tables: [{ name: 'Seed cards', columns: ['Name', 'Cost'], rows: [['Sunflower', 1]] }] },
    time: { chapters: { 10: '- **During a game:** the deck thins' } },
    scope2: { chapters: { 6: '**Must:** planting · weather · scoring rows' } },
    'scope2-report': { chapters: { 3: '**One line:** a three-minute garden race where the weather is your weapon', 6: '**Must:** planting · weather · scoring rows\n**Vertical slice:** one full game', 7: '- weather may feel mean\n- hail rows' } },
    players: { chapters: { 5: '- **First:** The web\n- **Game length:** 3 minutes', 11: '- **The computer opponent:** plays for full rows' } },
    'look-pick': { chapters: { 12: '- **The look:** A: Soft watercolour' } },
    screens: { chapters: { 13: '- **Screen map:** Title → Game → Results', 14: '- To learn: plant, then weather' } },
  }
  setState(dir, results)
  const ok = r => assert.equal(r.ok, true, r.say)
  ok(G.stepWrite(dir, 'flow-check', 'worked out'))
  ok(R.stepWrite(dir, 'sections', 'worked out'))
  ok(T.stepWrite(dir, 'content', 'worked out'))
  for (const s of ['time', 'scope2', 'scope2-report', 'players', 'look-pick']) ok(G.stepWrite(dir, s, 'worked out'))
  ok(D.gddWrite(dir, 'screens', 'worked out', { 14: 'loose' }))
  const lv = levels(dir)
  const CHART = { 1: 'chosen', 2: 'chosen', 3: 'worked out', 4: 'worked out', 5: 'worked out', 6: 'worked out', 7: 'worked out', 8: 'worked out', 9: 'worked out', 10: 'worked out', 11: 'worked out', 12: 'worked out', 13: 'worked out', 14: 'loose' }
  assert.deepEqual(lv, Object.fromEntries(Object.entries(CHART).map(([n, l]) => [n, l])))
  // the pipeline's own commands write those same levels
  assert.deepEqual(step('screens-gdd').run.slice(2), ['gdd', 'screens', 'worked out', '14=loose'])
  for (const id of ['flow-check-gdd', 'time-gdd', 'scope2-gdd', 'scope2-report-gdd', 'players-gdd', 'look-gdd']) assert.equal(step(id).run.slice(-1)[0], 'worked out', id)
  assert.deepEqual(step('sections-rb').run.slice(2), ['step', 'sections', 'worked out'])
  assert.deepEqual(step('content-fill').run.slice(2), ['step', 'content', 'worked out'])
})

test('3.1 sketch-prep: each sketch\'s page is a copy of the /sketch starter with its title and question; a numbers question gets a simulation file; the check says what isn\'t built; the sims run', { skip: !existsSync(D.STARTER) && 'the /sketch starter is not on this machine' }, () => {
  const dir = project()
  const m = D.sketchPrep(dir, [
    { id: 'S01', name: 'Hail timing', question: 'when does hail hurt most?', test: 'you can tell which turn hurts most', numbers: false, knobs: ['Hail chance'] },
    { id: 'S02', name: 'First-player advantage', question: 'does going first win more?', numbers: 'yes' },
  ])
  assert.deepEqual(m.sketches.map(s => [s.id, s.numbers, s.file || s.sim]), [['S01', false, '.planning/research/sketches/S01-hail-timing.html'], ['S02', true, '.planning/research/sketches/S02-first-player-advantage.sim.mjs']])
  const page = readFileSync(join(dir, m.sketches[0].file), 'utf8')
  assert.match(page, /<title>S01: Hail timing<\/title>/)
  assert.match(page, /<meta name="description" content="when does hail hurt most\?">/)
  assert.match(page, /Copy values for Claude/)
  assert.match(m.sketches[0].link, /^file:\/\/\/.*S01-hail-timing\.html$/)
  assert.deepEqual(D.sketchesCheck(dir), ['S01 Hail timing: .planning/research/sketches/S01-hail-timing.html is still the starter (nothing built yet)', 'S02 First-player advantage: .planning/research/sketches/S02-first-player-advantage.sim.mjs is still the starter (nothing built yet)'])
  // what the sketch flow's helpers do: build the page, write the simulation
  writeFileSync(join(dir, m.sketches[0].file), page.replace('// ===== The sketch itself (replace this demo) =====', '// the hail sketch'))
  writeFileSync(join(dir, m.sketches[1].sim), 'let first = 0; for (let i = 0; i < 10000; i++) if (Math.random() < 0.53) first++\nconsole.log(JSON.stringify({ how: "10,000 simulated games", found: `the first player wins ${Math.round(first / 100)}%` }))\n')
  assert.deepEqual(D.sketchesCheck(dir), [])
  const r = D.runSims(dir)
  assert.equal(r.ran, 1)
  assert.equal(r.sketches[1].result.how, '10,000 simulated games')
  assert.match(r.sketches[1].result.found, /^the first player wins \d+%$/)
  // the page lists the sketch pages
  G.writePage(dir)
  assert.match(readFileSync(join(dir, G.PAGE), 'utf8'), /research\/sketches\/S01-hail-timing\.html/)
  // a page whose "Copy values for Claude" was lost is refused
  writeFileSync(join(dir, m.sketches[0].file), '<title>S01: Hail timing</title>')
  assert.match(D.sketchesCheck(dir)[0], /the "Copy values for Claude" button is gone/)
})

const PLAN = {
  how: ['Web first, a link anyone can open; the phone version later from the same code', 'Online play runs on your own free server account', 'Every number you\'ll want to tune lives in files you can change live with the Dev Kit'],
  tdd: { glance: ['- **Platforms:** web (phone browsers first)', '- **Stack:** Vite + TypeScript + React — why: Muzzy\'s web stack'], fits: ['Rules: pure functions from the rulebook (src/rules)'], risks: ['Online sync on phones: a spike in alpha'], decisions: [{ title: 'Online play on PartyServer', options: ['PartyServer on Cloudflare', 'Colyseus'], chose: 'PartyServer', why: 'free on Muzzy\'s own Cloudflare' }] },
  roadmap: { milestones: [
    { name: 'Vertical slice', stage: 'playable', goal: 'one full game against the computer, close to final look', features: [
      { type: '🧱', name: 'Turn engine', description: 'draw, play and score, from the rulebook', scope: 'must', needs: [] },
      { type: '🎮', name: 'Garden board', description: 'your rows and your friend\'s, on one phone', scope: 'must', needs: ['Turn engine'] },
      { type: '🎮', name: 'Weather cards', description: 'hail, rain and sun hit a row', scope: 'must', needs: ['Turn engine'] },
      { type: '🎮', name: 'Computer opponent', description: 'plays for full rows', scope: 'should', needs: ['Turn engine'] }] },
    { name: 'Alpha', stage: 'alpha', goal: 'every must-have feature, rough', features: [{ type: '🎮', name: 'Online rooms', description: 'play a friend online', scope: 'must', needs: ['Turn engine'] }] },
    { name: 'Beta', stage: 'beta', goal: 'finished, polished, tested', features: [] },
    { name: '1.0', stage: '1.0', goal: 'release', features: [] },
  ] },
}

test('3.6 + 3.9: the TDD (the template\'s shape, the content tables decision with its Weighed block), the roadmap in the planner\'s format, and the messages composed from the script', () => {
  const dir = project()
  setState(dir, { players: { needs: ['None of these'] }, plan: PLAN })
  D.tddStart(dir)
  const started = readFileSync(join(dir, D.TDD), 'utf8')
  assert.match(started, /^# Garden Race — Technical Design Document \(TDD\)/)
  assert.match(started, /## 8\. Decisions log\n<!-- bmuz td:decisions · [0-9a-f]{8} -->\nD01 · Content tables: JSON in content\/data\/ is the one source/)
  assert.match(started, /Weighed: why it's this way now — /)
  const r = D.planWrite(dir, script)
  const tdd = readFileSync(join(dir, D.TDD), 'utf8')
  assert.match(tdd, /- \*\*Stack:\*\* Vite \+ TypeScript \+ React/)
  assert.match(tdd, /D02 · Online play on PartyServer\n  Options: PartyServer on Cloudflare \/ Colyseus\n  Chose: PartyServer — free on Muzzy's own Cloudflare/)
  const rm = readFileSync(join(dir, D.ROADMAP), 'utf8')
  assert.match(rm, /^# Garden Race — Roadmap\n<!-- bmuz rm:plan · [0-9a-f]{8} -->\nRelease target: playable — musts 0\/4 done\n/)
  assert.match(rm, /\n## v0\.1 — Vertical slice  ← current  \(→ playable\)\nGoal: one full game against the computer, close to final look\n- 🟢 F01 🧱 Turn engine — draw, play and score, from the rulebook — must:playable\n- ⏳ F02 🎮 Garden board — your rows and your friend's, on one phone — must:playable · needs: F01\n/)
  assert.match(rm, /- ⏳ F04 🎮 Computer opponent — plays for full rows — should · needs: F01/)
  assert.match(rm, /## v0\.2 — Alpha  \(→ alpha\)\nGoal: every must-have feature, rough\n- ⏳ F05 🎮 Online rooms — play a friend online — must:alpha · needs: F01/)
  assert.match(rm, /```mermaid\nflowchart LR\n  F01\[🟢 F01 Turn engine\]\n  F02\[⏳ F02 Garden board\]\n  F01 --> F02/)
  assert.match(rm, /## Later\n\n## Ideas/)
  assert.deepEqual(r.firstSprint, ['F01 — Turn engine', 'F02 — Garden board', 'F03 — Weather cards'])
  const msg = readFileSync(join(dir, D.PLAN_MD), 'utf8')
  assert.equal(msg, "Here's how it'll be built:\n· Web first, a link anyone can open; the phone version later from the same code\n· Online play runs on your own free server account\n· Every number you'll want to tune lives in files you can change live with the Dev Kit\nThe full technical plan, the TDD, is on your project page.\n\nAnd here's the roadmap, the order we'll build in:\n1. Vertical slice: one full game against the computer, close to final look\n2. Alpha: every must-have feature, rough\n3. Beta: finished, polished, tested\n4. 1.0: release\nEach milestone lists its features and what each one needs first.\n")
  // the page: the TDD tab and the roadmap in Plan
  const page = readFileSync(join(dir, G.PAGE), 'utf8')
  assert.match(page, /<h2 id="tdd">TDD<\/h2>/)
  assert.match(page, /F01 🧱 Turn engine/)
  // a hand edit to the roadmap is kept when the plan is written again
  writeFileSync(join(dir, D.ROADMAP), rm.replace('draw, play and score, from the rulebook', 'draw, play and score (my words)'))
  D.planWrite(dir, script)
  assert.match(readFileSync(join(dir, D.ROADMAP), 'utf8'), /draw, play and score \(my words\)[\s\S]*BMUZ, \d{4}-\d{2}-\d{2} \(Design · plan\):/)
})

test('3.10 Blueprint Review: the script\'s words with the first sprint\'s three features; after "Approve" the blueprint is logged in the GDD\'s Decisions', () => {
  const dir = project()
  setState(dir, { plan: PLAN })
  D.planWrite(dir, script)
  const out = D.reviewShow(dir, script)
  assert.equal(readFileSync(join(dir, D.REVIEW_MD), 'utf8'), out.text + '\n')
  assert.match(out.text, /^\*\*Blueprint Review\*\*\nBefore anything is built, one full read-through\. Everything is on your project page:\n· The GDD, start to end\n· The rulebook and the content tables\n· The technical plan \(TDD\)\n· The roadmap, with the first sprint it would start with: F01 — Turn engine · F02 — Garden board · F03 — Weather cards\n\nFrom here we start building\./)
  D.approved(dir, new Date('2026-11-12T09:00:00Z'))
  const gdd = readFileSync(join(dir, G.GDD), 'utf8')
  assert.match(G.readList(gdd, 'Decisions').pop(), /^2026-11-12 · The blueprint \(the GDD, the rulebook, the content tables, the TDD and the roadmap\) approved at Design's Blueprint Review/)
})
