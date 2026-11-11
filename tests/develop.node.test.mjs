// F216 task 2: sprint.mjs — Develop's sprints on the plan files, without Claude, on the garden race where Design left it
// (tests/fixtures/garden-designed: the GDD, the rulebook, the TDD, the roadmap, content/ and a tiny game).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as S from '../plugin/scripts/sprint.mjs'
import * as G from '../plugin/scripts/gdd.mjs'
import * as M from '../plugin/scripts/marks.mjs'
import * as B from '../plugin/scripts/bugs.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const script = E.parseScript(readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8'))
const NOW = new Date('2026-11-11T14:05:00')

function project(git = false) {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-develop-'))
  cpSync(join(here, 'fixtures', 'garden-designed'), dir, { recursive: true })
  mkdirSync(join(dir, '.bmuz'), { recursive: true })
  if (git) for (const args of [['init', '-q', '-b', 'main'], ['config', 'user.email', 'test@example.com'], ['config', 'user.name', 'BMUZ test'], ['add', '-A'], ['commit', '-q', '-m', 'the garden']]) spawnSync('git', args, { cwd: dir })
  return dir
}
const read = (dir, f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
const state = (dir, s) => writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ pipeline: 'develop', finished: [], results: {}, retries: {}, ...s }, null, 2))
const journal = (dir, rows) => writeFileSync(join(dir, '.bmuz/journal.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
const card = (id, tasks = 3) => ({ id, see: `you see ${id} work`, done: `${id} works by the rulebook`, notYet: 'animations', needs: 'nothing', tasks: Array.from({ length: tasks }, (_, i) => ({ who: i === 2 ? '🙋' : '🤖', text: `task ${i + 1} of ${id}` })), check: `node --test proves ${id}` })
function planned(dir) {
  S.propose(dir)
  state(dir, { resultsBy: { plan: { features: [card('F01'), card('F02')], goal: 'a turn you can play' } } })
  return S.planWrite(dir, script, NOW)
}

test('propose: the current milestone\'s ready features (every need done), at most 3, in roadmap order', () => {
  const dir = project()
  const p = S.propose(dir)
  assert.equal(p.sprint, 1)
  assert.equal(p.milestone, 'Vertical slice')
  assert.deepEqual(p.ready.map(f => f.id), ['F01', 'F02'])
  assert.equal(p.ready[0].name, 'Turn engine')
  assert.equal(p.pct, '0%')
})

test('plan-check: only proposed features, every card field, 3–8 tasks, a check line', () => {
  const dir = project()
  S.propose(dir)
  assert.deepEqual(S.planProblems(dir, [card('F01'), card('F02')]), [])
  const bad = S.planProblems(dir, [card('F03'), { ...card('F01'), see: '', tasks: [{ who: '🤖', text: 'one' }] }])
  assert.ok(bad.some(p => /F03 isn't one of the ready features \(F01 — Turn engine, F02 — Seed cards\)/.test(p)), bad.join('|'))
  assert.ok(bad.some(p => /F01: the card's "see" is empty/.test(p)))
  assert.ok(bad.some(p => /F01: 1 tasks; a feature has 3 to 8/.test(p)))
})

test('review fix 11: the fix helper runs only when the reviewer confirmed findings (review-save hands back "findings", the fix step runs "when" it is yes)', () => {
  assert.deepEqual(E.checkPipeline(FEAT), [])
  assert.equal(stepOf(FEAT, 'fix').when, '{findings}')
  assert.deepEqual(stepOf(FEAT, 'review-save').results, ['findings'])
  assert.equal(E.isWanted(stepOf(FEAT, 'fix'), { findings: 'no' }), false)
  assert.equal(E.isWanted(stepOf(FEAT, 'fix'), { findings: 'yes' }), true)
  // a script step's results come from its last line of JSON
  assert.deepEqual(E.scriptResults(stepOf(FEAT, 'review-save'), '✔ x\n{"results":{"findings":"no"}}'), { result: { findings: 'no' } })
  assert.match(E.scriptResults(stepOf(FEAT, 'review-save'), '✔ x').error, /hands back "findings"/)
  // skipped (no findings), the ready step still finds the build's report
  const dir = project()
  building(dir)
  journal(dir, [{ ev: 'flow.result', step: 'build', result: { tests: [], changed: ['x'] } }, { ev: 'flow.result', step: 'review', result: { findings: [] } }])
  assert.equal(S.reviewSave(dir).length, 0)
})

test('review fix 10: tests get 10 minutes by default, bmuz.json "testTimeoutMs" changes it, and a run past it says so plainly — neither a pass nor a fail', () => {
  assert.equal(E.testTimeoutOf({}), 600000)
  assert.equal(E.testTimeoutOf({ testTimeoutMs: 1200000 }), 1200000)
  assert.equal(E.testTimeoutOf({ testTimeoutMs: 'soon' }), 600000)
  assert.match(E.checkTimedOutWhy({ exitCode: null, timedOut: true }, 600000), /ran past its 10 minutes and was stopped: that is neither a pass nor a fail/)
  assert.equal(E.checkTimedOutWhy({ exitCode: 1 }, 600000), null)
  const dir = project()
  writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'feature', testTimeoutMs: 1500 }))
  assert.equal(B.testLimitMs(dir), 1500)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node -e "setTimeout(() => {}, 20000)"' } }))
  writeFileSync(join(dir, 'tests/turn.test.mjs'), builtTest)
  const p = S.proofProblem(dir, { tests: [{ rule: 'the turn passes', file: 'tests/turn.test.mjs', name: 'F01 the turn passes to the other player' }] })
  assert.match(p, /"npm test" didn't finish in 2 s and was stopped: that is neither a pass nor a fail/)
})

test('review fix 8: a step\'s own result never overrides a built-in hole ({auto}, {project}, {plugin}): built-ins win, and such a key is refused', () => {
  const base = { auto: 'auto', project: '/p', plugin: '/pl', features: [] }
  assert.deepEqual(E.checkVarsOf(base, { answer: 'approved', auto: 'live', project: '/elsewhere' }), { auto: 'auto', project: '/p', plugin: '/pl', features: [], answer: 'approved' })
  const P = { id: 'x', version: 1, steps: [{ id: 'a', kind: 'talk', needs: [], tools: ['Read'], craft: 'craft/a.md', results: ['answer'] }] }
  assert.match(E.resultProblems(P, P.steps[0], { answer: 'approved', auto: 'live' }), /"auto" is one of the engine's own holes/)
  assert.equal(E.resultProblems(P, P.steps[0], { answer: 'approved' }), null)
  const bad = { ...P, steps: [{ ...P.steps[0], results: ['answer', 'auto'] }] }
  assert.ok(E.checkPipeline(bad).some(p => /"auto" is one of the engine's own holes/.test(p)))
})

test('review fix 7: the next sprint is the highest archived number + 1 (not a count), and an archived sprint is never overwritten', () => {
  const dir = project()
  mkdirSync(join(dir, S.ARCHIVE), { recursive: true })
  writeFileSync(join(dir, S.ARCHIVE, 'sprint-01.md'), 'one')
  writeFileSync(join(dir, S.ARCHIVE, 'sprint-03.md'), 'three')
  assert.equal(S.sprintNumber(dir), 4)
  planned(dir)
  const rec = S.readRecord(dir)
  writeFileSync(join(dir, S.RECORD), JSON.stringify({ ...rec, n: 3 }))
  state(dir, { resultsBy: { lookback: { retro: { well: 'a', wrong: 'b', change: 'c' } } } })
  assert.throws(() => S.lookbackWrite(dir, script, NOW), /sprint-03\.md is already archived/)
  assert.equal(read(dir, `${S.ARCHIVE}/sprint-03.md`), 'three')
})

test('review fix 12: a sprint of one feature says "1 feature", not "1 features"', () => {
  const dir = project()
  S.propose(dir)
  state(dir, { resultsBy: { plan: { features: [card('F01')], goal: 'one turn' } } })
  const r = S.planWrite(dir, script, NOW)
  assert.match(r.say, /Here's what I'd build next, 1 feature:/)
  assert.doesNotMatch(r.say, /1 features/)
})

test('plan-write: SPRINT.md in PROJECT-FILES\' format, the record, a work branch, the 4.3 plan card word for word', () => {
  const dir = project(true)
  const r = planned(dir)
  const md = read(dir, S.SPRINT)
  assert.match(md, /^# Sprint 01 — a turn you can play\nStarted 2026-11-11 · Milestone Vertical slice · Features: F01, F02 \(in this order\)\n/)
  assert.match(md, /## F01 🧱 Turn engine\nYou'll see: you see F01 work\nDone when: F01 works by the rulebook\nNot doing yet: animations\nNeeds from you: nothing\n- \[ \] 🤖 1\. task 1 of F01\n- \[ \] 🤖 2\. task 2 of F01\n- \[ \] 🙋 3\. task 3 of F01\nCheck: node --test proves F01/)
  assert.equal(r.branch, 'dev/vertical-slice')
  assert.equal(S.readRecord(dir).features[1].status, 'planned')
  const say = read(dir, S.SAY.plan)
  assert.equal(say.split('\n\n')[0], E.renderLine(script, 'develop.plan', { n: '1', milestone: 'Vertical slice', count: '2' }).text)
  assert.match(say, /\*\*F02 — Seed cards\*\*\n· You'll see: you see F02 work\n· Done when: F02 works by the rulebook\n· Not doing yet: animations\n· Needs from you: nothing/)
  // the project page has a Sprint tab
  G.writePage(dir)
  assert.match(read(dir, G.PAGE), /Sprint/)
  assert.ok(G.designTabs(dir).some(t => t.id === 'sprint'))
})

test('the roadmap: a state changed in place (the graph too), the ready rule, the musts counted, BMUZ\'s marks kept true', () => {
  const dir = project()
  let rm = read(dir, S.ROADMAP)
  rm = S.setStates(rm, { F01: '✅', F02: '✅' })
  assert.match(rm, /^- ✅ F01 🧱 Turn engine/m)
  assert.match(rm, /F01\[✅ F01 Turn engine\]/)
  // F03 needed F01 and F02: now ready
  assert.match(rm, /^- 🟢 F03 🎮 Weather cards/m)
  assert.match(rm, /^Release target: playable — musts 2\/4 done$/m)
  assert.equal(Object.values(M.readBlocks(rm)).some(b => b.edited), false)
  assert.equal(S.milestonePct(S.currentMilestone(rm)).pct, '67%')
})

test('the roadmap: a hand-edited block stays theirs (its words kept), and the state still moves', () => {
  const dir = project()
  const mine = read(dir, S.ROADMAP).replace('Goal: one full game for two on one phone', 'Goal: one full game for two on one phone (my words)')
  const rm = S.setStates(mine, { F01: '🔨' })
  assert.match(rm, /\(my words\)/)
  assert.match(rm, /^- 🔨 F01 /m)
  assert.equal(M.readBlocks(rm)['rm:plan'].edited, true)
})

test('an idea lands under the roadmap\'s Ideas once, dated, and in the GDD\'s Ideas for Later', () => {
  const dir = project()
  S.idea(dir, 'seasons that change the weather deck', NOW)
  S.idea(dir, 'seasons that change the weather deck', NOW)
  const rm = read(dir, S.ROADMAP)
  assert.equal(rm.split('- 2026-11-11 — seasons that change the weather deck').length, 2)
  assert.match(rm, /## Ideas\n- 2026-11-11 — seasons/)
  assert.equal(M.readBlocks(rm)['rm:plan'].edited, false)
  assert.match(read(dir, G.GDD), /seasons that change the weather deck/)
})

test('the loop: an auto run only builds; live shows a built feature again, asks a tuned one again, builds a blocked one', () => {
  const dir = project()
  planned(dir)
  assert.deepEqual(S.next(dir, 'auto'), { start: { feature: 'F01', at: null } })
  const rec = S.readRecord(dir)
  const set = (a, b) => { rec.features[0].status = a; rec.features[1].status = b; writeFileSync(join(dir, S.RECORD), JSON.stringify(rec)) }
  set('built', 'planned')
  assert.deepEqual(S.next(dir, 'auto'), { start: { feature: 'F02', at: null } })
  assert.deepEqual(S.next(dir, 'live'), { start: { feature: 'F01', at: 'ready' } })
  set('built', 'blocked')
  assert.deepEqual(S.next(dir, 'auto'), { wait: ['F01', 'F02'], features: ['F01 — Turn engine', 'F02 — Seed cards'] })
  set('approved', 'tuning')
  assert.deepEqual(S.next(dir, 'live'), { start: { feature: 'F02', at: 'approve' } })
  set('approved', 'approved')
  assert.deepEqual(S.next(dir, 'live'), { done: true })
})

// A feature run's start: F01 being built.
function building(dir, id = 'F01') {
  planned(dir)
  state(dir, { pipeline: 'feature', given: { feature: id } })
  return S.featureStart(dir, script, NOW)
}

test('a feature run starts: 🔨, the builder\'s brief, the 4.4 progress line with the clock time', () => {
  const dir = project()
  building(dir)
  assert.match(read(dir, S.ROADMAP), /^- 🔨 F01 /m)
  assert.equal(read(dir, S.SAY.progress).trim(), '⏳ 14:05: building F01 — Turn engine (feature 1 of 2). Next update when it\'s done.')
  assert.match(read(dir, S.BRIEF), /# Build F01 — Turn engine \(Sprint 01 · Vertical slice\)/)
  assert.match(read(dir, S.BRIEF), /\.planning\/design\/RULEBOOK\.md \(the rules: the single truth; every rule this feature builds gets a test\)/)
})

const builtTest = [
  "import { test } from 'node:test'", "import assert from 'node:assert/strict'", "import { newGame } from '../src/garden.js'",
  "test('F01 the turn passes to the other player', () => { assert.equal(newGame().turn, 0) })", '',
].join('\n')

test('prove: the builder\'s word is never enough — its named tests run and pass, the suite is green; stuck twice says the script\'s line', () => {
  const dir = project()
  building(dir)
  const result = r => journal(dir, [{ ev: 'step.start', step: 'build' }, { ev: 'flow.result', step: 'build', result: r }])
  result({ changed: ['a turn'] })
  assert.throws(() => S.prove(dir, script, NOW), /the builder handed back no tests/)
  writeFileSync(join(dir, 'tests/turn.test.mjs'), builtTest)
  result({ tests: [{ rule: 'the turn passes', file: 'tests/turn.test.mjs', name: 'F01 the turn does not exist' }] })
  assert.throws(() => S.prove(dir, script, NOW), /didn't run in tests\/turn\.test\.mjs: the runner reported "F01 the turn passes to the other player"/)
  // two failed tries: the stuck line, word for word from the script
  assert.equal(read(dir, S.SAY.stuck).split('.')[0], 'F01 — Turn engine isn\'t working, and two tries haven\'t fixed it')
  assert.match(read(dir, S.TRIES), /^Try 1 failed its check: the builder handed back no tests/)
  result({ tests: [{ rule: 'the turn passes', file: 'tests/turn.test.mjs', name: 'F01 the turn passes to the other player' }], changed: ['you can take a turn'], try: 'npm run play' })
  const proof = S.prove(dir, script, NOW)
  assert.equal(proof.tests[0].sha.length, 12)
  assert.ok(proof.passed >= 1)
  assert.ok(existsSync(join(dir, '.bmuz/develop/F01.json')))
})

test('ready: 4.5\'s card word for word, 🎛️, the 🤖 tasks ticked, "Checked:" written, the work committed', () => {
  const dir = project(true)
  building(dir)
  ownWrite(dir, 'build', 'tests/turn.test.mjs', builtTest)
  journal(dir, [{ ev: 'flow.result', step: 'build', result: { tests: [{ rule: 'the turn passes', file: 'tests/turn.test.mjs', name: 'F01 the turn passes to the other player' }], changed: ['you can take a turn', 'the turn passes'], try: 'take one turn each' } }])
  const proof = S.prove(dir, script, NOW)
  const r = S.ready(dir, script, NOW)
  assert.equal(r.say, `**F01 — Turn engine — ready for you to check**\n· What changed: you can take a turn; the turn passes\n· Try it: npm run play · no phone build yet\n· Try this: take one turn each\n· Checked: ${proof.passed === 1 ? '1 test passes' : `${proof.passed} tests pass`}`)
  assert.match(read(dir, S.ROADMAP), /^- 🎛️ F01 /m)
  const md = read(dir, S.SPRINT)
  assert.match(md, /- \[x\] 🤖 1\. task 1 of F01\n- \[x\] 🤖 2\. task 2 of F01\n- \[ \] 🙋 3\. task 3 of F01/)
  assert.match(md, /Checked: \d+ tests? pass(es)? \(2026-11-11\)/)
  assert.match(spawnSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout, /^F01: built — Turn engine/m)
  assert.equal(S.readRecord(dir).features[0].status, 'built')
})

test('review fix 6: a feature\'s commit takes only the files this run\'s own calls changed; the creative\'s are left out and said; SPRINT.md and ROADMAP.md are committed as sprint.mjs writes them', () => {
  const dir = project(true)
  building(dir)
  const gitDirty = () => (spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout || '')
  // sprint.mjs committed its own plan files as it wrote them
  assert.doesNotMatch(gitDirty(), /SPRINT\.md|ROADMAP\.md/)
  // the builder's own writes, and the creative's edit of another file mid-run
  ownWrite(dir, 'build', 'tests/turn.test.mjs', builtTest)
  ownWrite(dir, 'build', 'src/garden.js', read(dir, 'src/garden.js') + '// the turn\n')
  writeFileSync(join(dir, 'src/play.mjs'), read(dir, 'src/play.mjs') + '// mine\n')
  journal(dir, [{ ev: 'flow.result', step: 'build', result: { tests: [{ rule: 'the turn passes', file: 'tests/turn.test.mjs', name: 'F01 the turn passes to the other player' }], changed: ['a turn'] } }])
  S.prove(dir, script, NOW)
  S.ready(dir, script, NOW)
  const files = spawnSync('git', ['show', '--name-only', '--format=', 'HEAD~1'], { cwd: dir, encoding: 'utf8' }).stdout + spawnSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout
  const built = spawnSync('git', ['log', '--format=%s', '-5'], { cwd: dir, encoding: 'utf8' }).stdout
  assert.match(built, /^F01: built — /m)
  const builtFiles = spawnSync('git', ['show', '--name-only', '--format=', ':/F01: built'], { cwd: dir, encoding: 'utf8' }).stdout
  assert.match(builtFiles, /src\/garden\.js/)
  assert.match(builtFiles, /tests\/turn\.test\.mjs/)
  assert.doesNotMatch(builtFiles, /src\/play\.mjs/)
  assert.match(gitDirty(), /src\/play\.mjs/)
  assert.match(read(dir, S.SPRINT), /Notes: left out of the commit \(changed by you, not by this run\): src\/play\.mjs/)
  assert.doesNotMatch(gitDirty(), /SPRINT\.md|ROADMAP\.md/)
  void files
})

test('approval: nothing is done without the creative\'s OK — an auto run can only wait; live needs their own answer to the box', () => {
  const dir = project()
  building(dir)
  assert.equal(S.approvalProblem(dir, 'waiting', 'auto'), null)
  assert.match(S.approvalProblem(dir, 'approved', 'auto'), /an auto run never answers for the creative/)
  assert.match(S.approvalProblem(dir, 'waiting', 'live'), /ask them with the script's box/)
  journal(dir, [{ ev: 'step.start', step: 'approve' }])
  assert.match(S.approvalProblem(dir, 'approved', 'live'), /no answer from the creative/)
  journal(dir, [{ ev: 'step.start', step: 'approve' }, approveBox('Did it feel like a race?'), { ev: 'answer', step: 'approve', text: 'User has answered your questions: "Did it feel like a race?"="Close, needs tuning". You can now continue.' }])
  assert.match(S.approvalProblem(dir, 'approved', 'live'), /answered "Close, needs tuning", not "Yes, approve it"/)
  assert.equal(S.approvalProblem(dir, 'tune', 'live'), null)
  // an answer from an earlier try of the step doesn't count
  journal(dir, [{ ev: 'step.start', step: 'approve' }, approveBox('Did it feel like a race?'), { ev: 'answer', step: 'approve', text: '"Did it feel like a race?"="Yes, approve it"' }, { ev: 'step.start', step: 'approve' }])
  assert.match(S.approvalProblem(dir, 'approved', 'live'), /no answer from the creative/)
})

// (review fix 1: the whole answer text was searched, so "Yes, approve it" anywhere in it — inside the moment or the
// feeling, or a second box — turned "Not right" into approved)
const approveBox = q => ({ ev: 'line', step: 'approve', line: 'develop.approve.box', kind: 'box', box: { question: q, options: [{ label: 'Yes, approve it' }, { label: 'Close, needs tuning' }, { label: 'Not right' }] } })
test('review fix 1: only the picked option of this exact approve box counts, compared exactly; other boxes and words in the question are ignored', () => {
  const dir = project()
  building(dir)
  const q = 'Did saying "Yes, approve it" to a storm feel like a comeback?'
  journal(dir, [{ ev: 'step.start', step: 'approve' }, approveBox(q), { ev: 'answer', step: 'approve', text: `User has answered your questions: "${q}"="Not right". You can now continue.` }])
  assert.equal(S.boxAnswer(dir), 'not-right')
  assert.match(S.approvalProblem(dir, 'approved', 'live'), /answered "Not right"/)
  // a second box in the same step whose answer is "Yes, approve it" is not this box's answer
  journal(dir, [{ ev: 'step.start', step: 'approve' }, approveBox('Did it feel like a race?'), { ev: 'answer', step: 'approve', text: '"Something else?"="Yes, approve it"' }])
  assert.equal(S.boxAnswer(dir), null)
  // a typed answer ("Other") that merely starts with a label is no pick
  journal(dir, [{ ev: 'step.start', step: 'approve' }, approveBox('Did it feel like a race?'), { ev: 'answer', step: 'approve', text: '"Did it feel like a race?"="Yes, approve it, but the hail is too strong"' }])
  assert.equal(S.boxAnswer(dir), null)
  journal(dir, [{ ev: 'step.start', step: 'approve' }, approveBox('Did it feel like a race?'), { ev: 'answer', step: 'approve', text: '"Did it feel like a race?"="Yes, approve it"' }])
  assert.equal(S.boxAnswer(dir), 'approved')
})

// The step's own Write, as the engine records it (.bmuz/own.json: register.tsx recordOwn).
function ownWrite(dir, step, file, text) {
  const before = read(dir, file)
  writeFileSync(join(dir, file), text)
  const own = JSON.parse(read(dir, '.bmuz/own.json') || '{"steps":{}}')
  own.steps[step] = own.steps[step] || {}
  own.steps[step][file] = E.ownEntry(own.steps[step][file] || null, before, text)
  writeFileSync(join(dir, '.bmuz/own.json'), JSON.stringify(own))
}

test('tuned: exactly one setting changed by the step itself (in content/), the suite still green; the rule route changes none and logs the rule', () => {
  const dir = project()
  building(dir)
  const g = read(dir, 'content/tuning/game.json')
  writeFileSync(join(dir, '.bmuz/checkpoint-tune.json'), JSON.stringify({ 'content/tuning/*.json': { pattern: ['content/tuning/game.json'] }, 'content/tuning/game.json': g }))
  assert.match(S.tunedProblem(dir, 'no'), /no setting changed/)
  ownWrite(dir, 'tune', 'content/tuning/game.json', g.replace('"weatherCardsPerHand": 2', '"weatherCardsPerHand": 1'))
  assert.equal(S.tunedProblem(dir, 'no'), null)
  assert.deepEqual(S.changedValues(dir), [{ file: 'content/tuning/game.json', key: 'weatherCardsPerHand', from: 2, to: 1 }])
  ownWrite(dir, 'tune', 'content/tuning/game.json', g.replace('"weatherCardsPerHand": 2', '"weatherCardsPerHand": 1').replace('"handSize": 3', '"handSize": 4'))
  assert.match(S.tunedProblem(dir, 'no'), /one setting at a time: 2 changed/)
  ownWrite(dir, 'tune', 'content/tuning/game.json', g)
  assert.match(S.tunedProblem(dir, 'yes', null), /give "rulebook" with its "log"/)
  assert.equal(S.tunedProblem(dir, 'yes', { log: 'hail destroys one bloom, not the row' }), null)
})

test('review fix 5: a value the creative changes during the tune (their Dev Kit save) is theirs: not the tune\'s one setting, never recorded as the tuning', () => {
  const dir = project(true)
  building(dir)
  const g = read(dir, 'content/tuning/game.json')
  writeFileSync(join(dir, '.bmuz/checkpoint-tune.json'), JSON.stringify({ 'content/tuning/game.json': g }))
  ownWrite(dir, 'tune', 'content/tuning/game.json', g.replace('"weatherCardsPerHand": 2', '"weatherCardsPerHand": 1'))
  // the creative saves hand size 5 in the Dev Kit meanwhile (not one of the step's own calls)
  writeFileSync(join(dir, 'content/tuning/game.json'), read(dir, 'content/tuning/game.json').replace('"handSize": 3', '"handSize": 5'))
  assert.equal(S.tunedProblem(dir, 'no'), null)
  assert.deepEqual(S.changedValues(dir), [{ file: 'content/tuning/game.json', key: 'weatherCardsPerHand', from: 2, to: 1 }])
  // they change the step's own setting too: theirs now, so the tune changed nothing of its own
  writeFileSync(join(dir, 'content/tuning/game.json'), read(dir, 'content/tuning/game.json').replace('"weatherCardsPerHand": 1', '"weatherCardsPerHand": 3'))
  assert.match(S.tunedProblem(dir, 'no'), /no setting changed/)
  state(dir, { pipeline: 'feature', given: { feature: 'F01' }, resultsBy: { approve: { answer: 'tune' }, tune: { setting: 'Weather cards per hand', cause: 'x', expect: 'y', rule: 'no' } } })
  S.featureEnd(dir, NOW)
  assert.doesNotMatch(read(dir, S.SPRINT), /handSize|2→3|2→5/)
})

test('feature-end: approved → ✅ and done; tuned → 🎛️ with the Tuning note (knob old→new); waiting → nothing changes', () => {
  const dir = project(true)
  building(dir)
  const g = read(dir, 'content/tuning/game.json')
  writeFileSync(join(dir, '.bmuz/checkpoint-tune.json'), JSON.stringify({ 'content/tuning/game.json': g }))
  ownWrite(dir, 'tune', 'content/tuning/game.json', g.replace('"weatherCardsPerHand": 2', '"weatherCardsPerHand": 1'))
  state(dir, { pipeline: 'feature', given: { feature: 'F01' }, resultsBy: { approve: { answer: 'tune' }, tune: { setting: 'Weather cards per hand', cause: 'a pattern of play', expect: 'storms to land more often', rule: 'no' } } })
  assert.equal(S.featureEnd(dir, NOW).status, 'tuning')
  assert.match(read(dir, S.SPRINT), /Notes: Tuning: Weather cards per hand 2→1 — a pattern of play — expect storms to land more often/)
  assert.match(spawnSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout, /^F01: tuned — Turn engine \(weatherCardsPerHand 2 → 1\)/)
  state(dir, { pipeline: 'feature', given: { feature: 'F01' }, resultsBy: { approve: { answer: 'waiting' } } })
  assert.equal(S.featureEnd(dir, NOW).status, 'tuning')
  state(dir, { pipeline: 'feature', given: { feature: 'F01' }, resultsBy: { approve: { answer: 'Yes, approve it' } } })
  assert.equal(S.featureEnd(dir, NOW).status, 'approved')
  assert.match(read(dir, S.ROADMAP), /^- ✅ F01 /m)
  assert.match(spawnSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout, /^F01: done — Turn engine \(approved\)/)
})

test('the look-back: the milestone\'s %, onward checked, the Retro written and the sprint archived, the GDD as built, 4.7\'s line, committed', () => {
  const dir = project(true)
  planned(dir)
  const rec = S.readRecord(dir)
  for (const f of rec.features) f.status = 'approved'
  writeFileSync(join(dir, S.RECORD), JSON.stringify(rec))
  writeFileSync(join(dir, S.ROADMAP), S.setStates(read(dir, S.ROADMAP), { F01: '✅', F02: '✅' }))
  const p = S.lookbackPrep(dir)
  assert.equal(p.pct, '67%')
  assert.equal(p.onward, 'develop')
  assert.equal(p.playtested, 'no')
  assert.match(S.lookbackProblem(dir, 'deliver', 'no'), /"onward" is "develop" \(Vertical slice has musts left\)/)
  assert.equal(S.lookbackProblem(dir, 'develop', 'no'), null)
  assert.match(S.retroProblem({ well: 'x' }), /"wrong", "change" are empty/)
  state(dir, { resultsBy: { lookback: { retro: { well: 'small features', wrong: 'one flaky test', change: 'name tests after the rule' }, built: [4], gdd: { chapters: { 4: 'Draw two, play one: built and played.' } }, rulebook: { log: 'the turn as built' }, onward: 'develop' } } })
  const r = S.lookbackWrite(dir, script, NOW)
  const arch = read(dir, '.planning/archive/sprints/sprint-01.md')
  assert.match(arch, /\nRetro:\n- went well: small features\n- went wrong: one flaky test\n- change: name tests after the rule\n$/)
  assert.match(read(dir, G.GDD), /### 4 · The Core Loop\n\*[^\n]*\*\n\nLevel: built/)
  assert.match(read(dir, '.planning/design/RULEBOOK.md'), /the turn as built/)
  assert.equal(r.next, 'F03 — Weather cards')
  assert.equal(read(dir, S.SAY.lookback).trim(), 'I\'ve updated the GDD, the rulebook and the technical plan to match what we built. Next sprint: F03 — Weather cards.')
  assert.match(spawnSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout, /^Sprint 01 done/)
  // the next sprint is number 2
  assert.equal(S.propose(dir).sprint, 2)
})

test('a milestone whose musts are all done: onward is deliver, and the next milestone becomes current', () => {
  const dir = project()
  planned(dir)
  writeFileSync(join(dir, S.ROADMAP), S.setStates(read(dir, S.ROADMAP), { F01: '✅', F02: '✅', F03: '✅' }))
  assert.equal(S.lookbackPrep(dir).onward, 'deliver')
  const rm = S.moveCurrent(read(dir, S.ROADMAP))
  assert.match(rm, /^## v0\.1 — Vertical slice  \(→ playable\)  ✅ ready to deliver \d{4}-\d\d-\d\d$/m)
  assert.match(rm, /^## v0\.2 — Alpha  ← current  \(→ alpha\)$/m)
  assert.equal(S.currentMilestone(rm).name, 'Alpha')
})

test('teaching: the tutorial into GDD chapter 14 (worked out) and a 🎮 Tutorial feature on the current milestone', () => {
  const dir = project()
  state(dir, { resultsBy: { teaching: { steps: ['plant a seed', 'send weather', 'score a row'], learn: 'weather goes on your friend\'s rows' } } })
  const r = S.teachingWrite(dir, NOW)
  assert.equal(r.id, 'F05')
  assert.match(read(dir, S.ROADMAP), /^- 🟢 F05 🎮 Tutorial — 3 short steps, each teaching one thing in the order players meet it — must:playable$/m)
  assert.match(read(dir, G.GDD), /### 14 · Teaching\n\*[^\n]*\*\n\nLevel: worked out/)
})

// ---- F216 tasks 3–5: the pipelines on the script's Stage 4 ----
const plugin = join(here, '..', 'plugin')
const DEV = JSON.parse(readFileSync(join(plugin, 'pipelines', 'develop.json'), 'utf8'))
const FEAT = JSON.parse(readFileSync(join(plugin, 'pipelines', 'feature.json'), 'utf8'))
const stepOf = (p, id) => p.steps.find(s => s.id === id)

test('develop.json is the script\'s Stage 4: 4.0–4.8 in order; every Develop line said by a step or composed by sprint.mjs; Design\'s next starts it', () => {
  assert.deepEqual(E.checkPipeline(DEV), [])
  assert.deepEqual(E.checkLines(DEV, script), [])
  assert.deepEqual(E.checkPipeline(FEAT), [])
  assert.deepEqual(E.checkLines(FEAT, script), [])
  const titled = [...new Map([...DEV.steps, ...FEAT.steps].filter(s => s.no).map(s => [s.no, s.title])).entries()].sort((a, b) => Number(a[0].split('.')[1]) - Number(b[0].split('.')[1]))
  assert.deepEqual(titled, [['4.0', 'Welcome to Develop'], ['4.1', 'Setup'], ['4.2', 'The Roadmap'], ['4.3', 'Plan the Sprint'], ['4.4', 'Build & Prove'], ['4.5', 'Play & Approve'], ['4.6', 'Tune & Revise'], ['4.7', 'Sprint Look-Back'], ['4.8', 'Teaching']])
  const said = new Set([...DEV.steps, ...FEAT.steps].flatMap(s => [...(s.lines || []), ...(s.line ? [s.line] : [])]))
  // composed by sprint.mjs from script.md and shown, or said by the engine itself
  const composed = ['develop.plan.feature', 'develop.plan.one', 'develop.progress', 'develop.stuck', 'develop.ready', 'develop.lookback.updated', 'develop.waiting', 'develop.idea']
  for (const id of Object.keys(script.lines).filter(id => id.startsWith('develop.') && !composed.includes(id))) assert.ok(said.has(id), id)
  const design = JSON.parse(readFileSync(join(plugin, 'pipelines', 'design.json'), 'utf8'))
  assert.deepEqual(design.next, { pipeline: 'develop', ask: false })
  assert.deepEqual(DEV.next, { pipeline: '{onward}', at: 'plan', ask: false })
  assert.equal(E.nextOf(DEV, { onward: 'develop' }).at, 'plan')
  assert.equal(stepOf(DEV, 'propose').always, true)
})

test('the two gates ask the script\'s boxes with the yes never first, and an auto run carries on past them (nothing approved)', () => {
  for (const [id, q, yes] of [['roadmap-ok', 'Start with the vertical slice?', 'Yes, start building'], ['plan-ok', 'Build this sprint?', 'Yes, build it']]) {
    const g = stepOf(DEV, id)
    const w = E.gateWords(g, script, { first: 'the vertical slice' })
    assert.equal(w.question, q)
    assert.equal(w.options[1], yes)
    assert.equal(g.approve, yes)
    assert.equal(g.auto, 'carry')
  }
  assert.equal(stepOf(DEV, 'roadmap-ok').backTo, 'reorder')
  assert.equal(stepOf(DEV, 'reorder').onBack, true)
  assert.equal(stepOf(DEV, 'plan-ok').backTo, 'plan')
})

test('the loop and the feature run: fresh builder and fixer may run commands, the reviewer only reads; done is proven by a script; approval needs the creative', () => {
  const loop = stepOf(DEV, 'features')
  assert.equal(loop.loop, 'feature')
  assert.deepEqual(loop.run.slice(-2), ['next', '{auto}'])
  for (const id of ['build', 'fix']) {
    assert.equal(stepOf(FEAT, id).workflow, 'bmuz:build-flow')
    // (review fix 2a: no Bash for the builder; it runs the fixed list through the engine's run tool)
    assert.ok(!stepOf(FEAT, id).agentTools.includes('Bash'), id)
    assert.ok(stepOf(FEAT, id).agentTools.includes(E.RUN_TOOL), id)
    assert.deepEqual(stepOf(FEAT, id).done.run.slice(-1), ['prove'])
  }
  // (StructuredOutput: how a helper with a schema hands its answer back — headless run 2026-11-11, refused, every build failed)
  assert.deepEqual(stepOf(FEAT, 'review').agentTools, ['Read', 'Glob', 'Grep', 'StructuredOutput'])
  for (const id of ['build', 'fix']) assert.ok(stepOf(FEAT, id).agentTools.includes('StructuredOutput'), id)
  assert.equal(E.bashProblem('C:/p', 'cat .bmuz/develop/tries.md 2>/dev/null; cat .bmuz/develop/brief.md'), null)
  assert.match(E.bashProblem('C:/p', 'echo x > .bmuz/develop/F01.json'), /\.bmuz/)
  assert.deepEqual(E.rebuildFromJournal('develop', [JSON.stringify({ ev: 'step.start', step: 'features', kind: 'script', t: 1 }), JSON.stringify({ ev: 'loop.waiting', step: 'features' })]).status, 'idle')
  assert.equal(stepOf(FEAT, 'build').stuck, '.bmuz/develop/say-stuck.md')
  const auto = JSON.parse(readFileSync(join(plugin, 'settings', 'auto-run.json'), 'utf8'))
  assert.ok(auto.permissions.allow.includes('Workflow(bmuz:build-flow)'))
  const ap = stepOf(FEAT, 'approve')
  assert.equal(ap.kind, 'talk')
  assert.deepEqual(ap.done.run.slice(-3), ['approval', '{answer}', '{auto}'])
  assert.deepEqual(E.renderLine(script, 'develop.approve.box', { moment: 'a storm in a full row', feeling: 'a sneaky comeback' }).box.options.map(o => o.label), ['Yes, approve it', 'Close, needs tuning', 'Not right'])
  assert.equal(stepOf(FEAT, 'tune').when, '{tune}')
  assert.ok(stepOf(FEAT, 'tune').writes.includes('content/tuning/*.json'))
  assert.equal(E.isWanted(stepOf(FEAT, 'tune'), { tune: 'no' }), false)
  assert.equal(E.isWanted(stepOf(DEV, 'teaching'), { playtested: 'no' }), false)
})

test('Bash while a pipeline runs: inside the project only (no "..", no .bmuz, no home folder, no push, no path outside)', () => {
  const d = 'C:/Users/x/proj'
  assert.equal(E.bashProblem(d, 'npm test'), null)
  assert.equal(E.bashProblem(d, 'node --test tests/turn.test.mjs'), null)
  assert.equal(E.bashProblem(d, 'ls /c/Users/x/proj/src'), null)
  assert.equal(E.bashProblem(d, 'npx playwright screenshot http://localhost:5173 .planning/screens/F01-phone.png'), null)
  assert.match(E.bashProblem(d, 'cd .. && ls'), /outside the project/)
  assert.match(E.bashProblem(d, 'cat .bmuz/state.json'), /\.bmuz/)
  assert.match(E.bashProblem(d, 'ls ~/Desktop'), /home folder/)
  assert.match(E.bashProblem(d, 'git push'), /pushing/)
  assert.match(E.bashProblem(d, 'type C:/Windows/win.ini'), /outside the project \(C:\/Windows/)
  const st = { ...E.freshState('feature'), current: 'build', status: 'working', finished: ['start'] }
  // (review fix 2a: the builder can't run Bash at all, only the run tool)
  assert.equal(E.judgeTool(FEAT, st, { tool: 'Bash', agentId: 'a1', input: { command: 'npm test' } }, { dir: d }).allow, false)
  assert.equal(E.judgeTool(FEAT, st, { tool: E.RUN_TOOL, agentId: 'a1', input: { what: 'test' } }, { dir: d }).allow, true)
  const rv = { ...st, current: 'review', finished: ['start', 'build'] }
  assert.equal(E.judgeTool(FEAT, rv, { tool: 'Bash', agentId: 'a2', input: { command: 'npm test' } }, { dir: d }).allow, false)
  assert.equal(E.judgeTool(FEAT, rv, { tool: 'Write', agentId: 'a2', input: { file_path: 'src/x.js' } }, { dir: d }).allow, false)
})

test('the loop\'s answer and the stuck line before the last try', () => {
  assert.deepEqual(E.loopAnswer('noise\n{"start":{"feature":"F07","at":"ready"}}'), { start: { feature: 'F07', at: 'ready' } })
  assert.deepEqual(E.loopAnswer('{"done":true}'), { done: true })
  assert.match(E.loopAnswer('{"start":{"feature":"../x"}}').error, /isn't start, wait or done/)
  const p = E.flowPrompt(stepOf(FEAT, 'build'), {}, 3, 'F01 — Turn engine isn\'t working, and two tries haven\'t fixed it.')
  assert.match(p, /This is try 3 of 3/)
  assert.match(p, /First write this to the creative, word for word, as its own paragraph:\n\nF01 — Turn engine isn't working/)
  assert.equal(E.sideRecord({ feature: 'F07', n: 3 }), 'feature-runs/3-F07')
  assert.equal(E.sideProblem({ pipeline: 'feature', from: 'develop', feature: 'F07', phase: 'on', n: 3, at: 'ready' }), null)
  assert.match(E.sideProblem({ pipeline: 'feature', from: 'develop', feature: 'X', phase: 'on', n: 3 }), /feature number/)
})
