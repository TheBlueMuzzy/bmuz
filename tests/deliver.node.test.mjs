// F219 tasks 2–4: deliver.mjs — Deliver on the plan files and the release scripts, without Claude, on the garden race
// at Develop's end (tests/fixtures/garden-developed: v0.1's musts approved, a dev/vertical-slice branch, a tiny game).
// Every push goes to a bare repository in a temp folder and every deploy into a folder beside the project: nothing here
// reaches anything real, and the tests check that. The release scripts are the stand-ins in tests/fixtures/fake-release
// (review fix 7: they always run, on any machine; each logs its call); headless deliver-garden runs the real ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as D from '../plugin/scripts/deliver.mjs'
import * as S from '../plugin/scripts/sprint.mjs'
import * as B from '../plugin/scripts/bugs.mjs'
import { setupDevelopedGarden } from './fixtures/garden-developed-setup.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const script = E.parseScript(readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8'))
const NOW = new Date('2026-11-11T18:05:00')
process.env.BMUZ_RELEASE_TOOLS = join(here, 'fixtures', 'fake-release', 'scripts')
// The stand-ins' calls, one line each ("release milestone …"), for the tests that count them.
const calls = dir => (existsSync(`${dir}-release.log`) ? readFileSync(`${dir}-release.log`, 'utf8').split('\n').filter(Boolean) : [])
// A stand-in told to fail (or die after its tag) for the length of fn: FAKE_LIVE_CHECK=fail, FAKE_RELEASE=die-after-tag.
function withFake(set, fn) {
  const was = Object.fromEntries(Object.keys(set).map(k => [k, process.env[k]]))
  Object.assign(process.env, set)
  try { return fn() } finally { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
}
function garden({ port = 1 } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'bmuz-deliver-')), 'garden')
  setupDevelopedGarden(dir, { port })
  mkdirSync(join(dir, '.bmuz'), { recursive: true })
  process.env.BMUZ_FAKE_RELEASE_LOG = `${dir}-release.log`
  return dir
}
const read = (dir, f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
const git = (dir, args) => (spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout || '').trim()
const journal = (dir, rows) => writeFileSync(join(dir, '.bmuz/journal.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
const plain = t => E.plainWords(t)

test('prep: the milestone Develop marked ready, as a Playable build; the first time gets the welcome, 5.0 word for word', () => {
  const dir = garden()
  const r = D.prep(dir, NOW)
  assert.deepEqual([r.rec.milestone, r.rec.stage, r.rec.branch, r.first], ['Vertical slice', 'playable', 'dev/vertical-slice', true])
  D.welcome(dir, script, NOW)
  assert.match(read(dir, D.SAY.welcome), /^\*\*Welcome to Deliver\*\*\nVertical slice is built and approved, so it's time to turn it into something you can play and share\./)
  assert.equal(D.prep(dir, NOW).first, false, 'welcomed once: not the first time any more')
  assert.deepEqual([D.stageOf('alpha').kind, D.stageOf('beta').rank, D.stageOf('1.0').kind], ['stage', 2, 'major'])
})

test('review fix 9: a milestone with no release stage, or one BMUZ doesn\'t know, is refused with the heading to fix; never guessed', () => {
  assert.equal(D.stageOf(''), null)
  assert.equal(D.stageOf('gamma'), null)
  for (const [from, to] of [['  (→ playable)  ✅', '  ✅'], ['(→ playable)', '(→ gamma)']]) {
    const dir = garden()
    writeFileSync(join(dir, S.ROADMAP), read(dir, S.ROADMAP).replace(`## v0.1 — Vertical slice  ${from.trim()}`, `## v0.1 — Vertical slice  ${to.trim()}`))
    assert.throws(() => D.prep(dir, NOW), /The milestone heading "## v0\.1 — Vertical slice .*" has no release stage I know: add "\(→ playable\)", "\(→ alpha\)", "\(→ beta\)" or "\(→ 1\.0\)" to it in \.planning\/ROADMAP\.md, then say "bmuz retry"/)
    assert.equal(D.readRecord(dir), null, 'nothing recorded')
  }
})

test('5.1 the Release Check: musts · blocking bugs · every check, each ✓; ready', async () => {
  const dir = garden()
  D.prep(dir, NOW)
  const rec = await D.check(dir, script)
  assert.equal(rec.go, true)
  assert.equal(read(dir, D.SAY.check), '**Release Check** · Playable\n✓ every must for this stage is done (3 of 3)\n✓ no blocking bugs\n✓ every check passes\n')
})

test('5.1 not ready: an open must and a P0 bug are named in the script\'s "Not ready yet…" line; a P2 doesn\'t block a Playable build', async () => {
  const dir = garden()
  writeFileSync(join(dir, S.ROADMAP), read(dir, S.ROADMAP).replace('- ✅ F03 🎮 Weather cards', '- 🎛️ F03 🎮 Weather cards'))
  B.addIn(dir, { title: 'Hail freezes the game', level: 'P0', steps: ['play hail'], expected: 'the turn passes', actual: 'it freezes' })
  B.addIn(dir, { title: 'Score text a bit small', level: 'P2' })
  D.prep(dir, NOW)
  const rec = await D.check(dir, script)
  assert.equal(rec.go, false)
  const say = read(dir, D.SAY.check)
  assert.match(say, /✗ 2 of 3 musts for this stage are done\n✗ blocking bugs: B001 \(P0\)\n✓ every check passes/)
  assert.match(say, /\n\nNot ready yet: F03 — Weather cards, B001 — Hail freezes the game isn't done\. Want to finish it first, or move it to the next stage\?\n$/)
  // the answer: an auto run may only finish; "move" is the creative's call
  assert.match(D.choiceProblem(dir, 'Move it to the next stage', 'auto'), /creative's call/)
  assert.equal(D.choiceProblem(dir, 'Finish it first', 'auto'), null)
})

test('review fix 8: the not-ready answer is the option the creative picked in the script\'s box, matched exactly: "don\'t move it, finish it first" is no "move"', () => {
  const dir = garden()
  writeFileSync(join(dir, S.ROADMAP), read(dir, S.ROADMAP).replace('- ✅ F03 🎮 Weather cards', '- 🎛️ F03 🎮 Weather cards'))
  D.prep(dir, NOW)
  writeFileSync(join(dir, D.RECORD), JSON.stringify({ ...D.readRecord(dir), check: { musts: { done: 2, all: 3, open: ['F03'] }, bugs: [], checks: [], missing: ['F03 — Weather cards'] } }))
  const box = E.renderLine(script, 'deliver.notready.box', {}).box
  assert.deepEqual(box.options.map(o => o.label), ['Finish it first', 'Move it to the next stage'])
  assert.equal(D.choiceOf("don't move it, finish it first"), null)
  assert.equal(D.choiceOf('Move it to the next stage'), 'move')
  const asked = (picked) => journal(dir, [
    { ev: 'step.start', step: 'notready' },
    { ev: 'line', step: 'notready', line: 'deliver.notready.box', kind: 'box', box: { question: box.question } },
    { ev: 'answer', step: 'notready', text: `User has answered your questions: "${box.question}"="${picked}". You can now continue.` },
  ])
  asked('Finish it first')
  assert.equal(D.choiceProblem(dir, 'Finish it first', 'live'), null)
  assert.match(D.choiceProblem(dir, 'Move it to the next stage', 'live'), /the creative picked "Finish it first"/)
  assert.match(D.choiceProblem(dir, "don't move it, finish it first", 'live'), /must be exactly "Finish it first" or "Move it to the next stage"/)
  asked('Move it to the next stage')
  assert.equal(D.choiceProblem(dir, 'Move it to the next stage', 'live'), null)
  journal(dir, [{ ev: 'step.start', step: 'notready' }])
  assert.match(D.choiceProblem(dir, 'Finish it first', 'live'), /no answer to the box/)
})

test('"move it to the next stage": the must moves to Alpha with its tag and its graph node, the roadmap says so; a bug left still sends it back', async () => {
  const dir = garden()
  writeFileSync(join(dir, S.ROADMAP), read(dir, S.ROADMAP).replace('- ✅ F03 🎮 Weather cards', '- 🎛️ F03 🎮 Weather cards'))
  // (committed: a roadmap with the creative's unsaved changes is theirs to commit, and BMUZ leaves it uncommitted)
  spawnSync('git', ['commit', '-qam', 'F03 back to tuning'], { cwd: dir })
  D.prep(dir, NOW)
  await D.check(dir, script)
  const rec = D.notReady(dir, 'Move it to the next stage', script, NOW)
  assert.equal(rec.go, true)
  const rm = read(dir, S.ROADMAP)
  const ms = S.readRoadmap(rm).milestones
  assert.deepEqual(ms[0].features.map(f => f.id), ['F01', 'F02'])
  assert.deepEqual(ms[1].features.map(f => [f.id, f.scope]), [['F04', 'must:alpha'], ['F03', 'must:alpha']])
  assert.match(rm, /^- 🎛️ F03 🎮 Weather cards — rain and hail on a friend's row — must:alpha · needs: F01, F02 · moved from playable 2026-11-11$/m)
  const alphaGraph = rm.split('## v0.2')[1].split('## v0.3')[0]
  assert.match(alphaGraph, /F03\[🎛️ F03 Weather cards\][\s\S]*F01 --> F03/)
  assert.ok(!/F03\[/.test(rm.split('## v0.2')[0]), 'the node left the Playable graph')
  assert.equal(read(dir, D.SAY.back), '')
  assert.match(git(dir, ['log', '-1', '--format=%s']), /^Plan: F03 moved to the next stage$/)
})

test('"finish it first": back to Develop with the milestone current again, the script\'s added line', async () => {
  const dir = garden()
  B.addIn(dir, { title: 'Hail freezes the game', level: 'P0' })
  D.prep(dir, NOW)
  await D.check(dir, script)
  D.notReady(dir, 'Finish it first', script, NOW)
  const rm = read(dir, S.ROADMAP)
  assert.match(rm, /^## v0\.1 — Vertical slice {2}← current {2}\(→ playable\)$/m)
  assert.match(rm, /^## v0\.2 — Alpha {2}\(→ alpha\)$/m)
  assert.equal(S.currentMilestone(rm).name, 'Vertical slice')
  assert.equal(read(dir, D.SAY.back), 'Back to Develop to finish B001 — Hail freezes the game.\n')
  assert.equal(D.readRecord(dir).go, false)
})

test('5.2 Polish & Stand-ins: the placeholders by name (release-check.mjs finds them); "None" ships, a pick goes on the roadmap and back to Develop', async () => {
  const dir = garden()
  D.prep(dir, NOW)
  await D.check(dir, script)
  assert.deepEqual(await D.decide(dir), { go: 'yes', polish: 'yes' })
  assert.deepEqual(D.readRecord(dir).standins, ['the sounds', 'the card art'])
  const box = E.renderLine(script, 'deliver.standins.box', { standins: D.readRecord(dir).standins }).box
  assert.deepEqual(box.options.map(o => o.label), ['the sounds', 'the card art', 'None, ship it as it is'])
  assert.deepEqual(D.polish(dir, ['None, ship it as it is'], script, NOW), { go: 'yes', picked: [] })
  assert.deepEqual(D.polish(dir, '["the sounds"]', script, NOW), { go: 'no', picked: ['the sounds'] })
  assert.match(read(dir, S.ROADMAP), /^- 🟢 F05 ✨ Polish: the sounds — the sounds, made final instead of a placeholder — must:playable$/m)
  assert.equal(read(dir, D.SAY.back), 'Back to Develop to polish the sounds.\n')
  assert.throws(() => D.polish(dir, ['the music'], script, NOW), /isn't one of the placeholders/)
})

test('5.3 Safety & Legal: no keys, every asset licensed, Beta and 1.0 named; a key or an unlicensed file refuses', async () => {
  const dir = garden()
  D.prep(dir, NOW)
  assert.deepEqual(await D.safety(dir, script), [])
  assert.equal(read(dir, D.SAY.safety), '**Safety & Legal** · Playable\n✓ no passwords or keys in the build\n✓ every font, sound and picture is licensed for this use\nBeta and 1.0 add: a privacy page, store age and data forms, a full security review\n')
  writeFileSync(join(dir, 'src', 'keys.js'), "export const apiKey = 'sk-ant-REALLOOKINGSECRETKEY0123456789abcdef'\n")
  writeFileSync(join(dir, 'public', 'title.png'), 'x')
  spawnSync('git', ['add', '-A'], { cwd: dir })
  const p = await D.safety(dir, script)
  assert.equal(p.length, 2)
  assert.match(p[0], /an API secret key in src\/keys\.js/)
  assert.match(p[1], /public\/title\.png has no licence/)
  assert.match(read(dir, D.SAY.safety), /✗ passwords or keys in the build: an API secret key in src\/keys\.js\n✗ not licensed for this use yet: public\/title\.png/)
})

test('5.4 the build card: built, a link for you (the build on this machine) and one to share (STATE\'s Live link)', () => {
  const dir = garden({ port: 4321 })
  D.prep(dir, NOW)
  const b = D.build(dir, script)
  assert.ok(existsSync(join(dir, 'dist', 'index.html')))
  assert.match(b.local, /^file:\/\/\/.*\/dist\/index\.html$/)
  assert.equal(b.share, 'http://127.0.0.1:4321/garden-race/')
  assert.match(read(dir, D.SAY.build), /^\*\*Build & Share\*\*\nThe playable build is ready and tested on desktop:\n· For you: file:\/\/\/.+\n· To share: http:\/\/127\.0\.0\.1:4321\/garden-race\/\n$/)
})

test('"Share it" only with the creative\'s own answer after this build: none, "Not yet", or an earlier one refuses, changing nothing', () => {
  const dir = garden()
  D.prep(dir, NOW)
  journal(dir, [{ ev: 'gate.answer', step: 'share', answer: 'Share it' }, { ev: 'step.done', step: 'build' }])
  assert.throws(() => D.publish(dir, script, NOW), /own "Share it".*no answer in this run/)
  journal(dir, [{ ev: 'step.done', step: 'build' }, { ev: 'gate.answer', step: 'share', answer: 'Not yet — next, tell me what\'s missing' }])
  assert.throws(() => D.publish(dir, script, NOW), /they answered "Not yet/)
  assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), 'dev/vertical-slice')
  assert.equal(git(dir, ['tag']), '')
  // a test run pushes only to a folder on this machine
  journal(dir, [{ ev: 'step.done', step: 'build' }, { ev: 'gate.answer', step: 'share', answer: 'Share it' }])
  spawnSync('git', ['remote', 'set-url', 'origin', 'https://github.com/example/garden-race.git'], { cwd: dir })
  const was = process.env.BMUZ_TEST
  process.env.BMUZ_TEST = '1'
  try { assert.throws(() => D.publish(dir, script, NOW), /pushes only to a folder on this machine/) } finally { process.env.BMUZ_TEST = was }
})

test('"Not yet": what\'s missing goes on the roadmap in the creative\'s words, the milestone current again, back to Develop', () => {
  const dir = garden()
  D.prep(dir, NOW)
  const id = D.notYet(dir, 'A title screen. Friends need to know what the game is.', script, NOW)
  assert.equal(id, 'F05')
  assert.match(read(dir, S.ROADMAP), /^- 🟢 F05 ✨ A title screen — A title screen\. Friends need to know what the game is\. — must:playable$/m)
  assert.equal(S.currentMilestone(read(dir, S.ROADMAP)).name, 'Vertical slice')
  assert.equal(read(dir, D.SAY.back), "Back to Develop to add what's missing: A title screen. Friends need to know what the game is.\n")
})

// "Share it" for this run: the build step done, then the creative's own answer, journaled.
function shareSaid(dir) {
  D.prep(dir, NOW)
  D.build(dir, script)
  journal(dir, [{ ev: 'step.done', step: 'build' }, { ev: 'gate.answer', step: 'share', answer: 'Share it' }])
}
// (BMUZ_TEST: a push may only go to a folder on this machine; today's real date, as release.mjs checks it)
const publishTest = dir => withFake({ BMUZ_TEST: '1' }, () => D.publish(dir, script))
// The garden after a first release (v0.1.0), with a second slice approved on dev/second-slice, ready to deliver.
function secondSlice(dir) {
  writeFileSync(join(dir, S.ROADMAP), read(dir, S.ROADMAP).replace(/^## v0\.2 — Alpha {2}← current {2}\(→ alpha\)$/m, '## v0.2 — Second slice  (→ playable)  ✅ ready to deliver 2026-11-11').replace('- 🟢 F04 🎮 Computer opponent — play alone against the computer — must:alpha', '- ✅ F04 🎮 Computer opponent — play alone against the computer — must:playable'))
  spawnSync('git', ['commit', '-qam', 'Plan: the second slice is approved'], { cwd: dir })
  spawnSync('git', ['checkout', '-q', '-b', 'dev/second-slice'], { cwd: dir })
  appendFileSync(join(dir, 'src', 'garden.js'), '// F04: the computer opponent\n')
  spawnSync('git', ['commit', '-qam', 'F04: done — Computer opponent'], { cwd: dir })
}

test('5.4 "Share it": merged, versioned v0.1.0 and tagged, smoke pass, pushed to the local origin only, deployed, the live check passes', () => {
  const dir = garden({ port: 4321 })
  shareSaid(dir)
  // (the engine's bmuz.json, never committed yet: hidden from git while the release scripts run, like .bmuz/)
  writeFileSync(join(dir, 'bmuz.json'), '{ "pipeline": "deliver" }\n')
  const r = publishTest(dir)
  assert.deepEqual(r, { tag: 'v0.1.0', link: 'http://127.0.0.1:4321/garden-race/' })
  assert.deepEqual(calls(dir).map(c => c.split(' ')[0]), ['merge', 'release', 'smoke-pass', 'live-check'])
  assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main')
  assert.equal(JSON.parse(read(dir, 'version.json')).version, '0.1.0')
  const origin = `${dir}-origin.git`
  assert.equal(git(origin, ['tag']), 'v0.1.0', 'the tag reached the local origin')
  assert.equal(git(origin, ['rev-parse', 'main']), git(dir, ['rev-parse', 'main']), 'main is pushed to the local origin')
  assert.equal(git(dir, ['remote', 'get-url', 'origin']), origin, 'the only remote is the folder on this machine')
  assert.match(read(`${dir}-host`, 'garden-race/index.html'), /version 0\.1\.0/)
  assert.match(read(dir, S.ROADMAP), /^## v0\.1 — Vertical slice {2}\(→ playable\) {2}✅ released \d{4}-\d\d-\d\d \(v0\.1\.0\)$/m)
  assert.match(read(dir, S.ROADMAP), /^Release target: alpha/m)
  assert.match(read(dir, '.planning/archive/releases/v0.1.0.md'), /^# v0\.1\.0\n\n## Highlights\nVertical slice: one full game for two on one phone\.\n\n## New\n- Turn engine: draw a card/)
  assert.match(git(dir, ['log', '--format=%s']), /^Live check for v0\.1\.0\nSmoke pass for v0\.1\.0\nRelease v0\.1\.0: Vertical slice: the playable build\nMerge dev\/vertical-slice into main/)
  assert.equal(read(dir, D.SAY.live), "It's live: http://127.0.0.1:4321/garden-race/ (version 0.1.0).\n")
  // a try after this one carries on where it stopped: nothing is done twice
  assert.deepEqual(publishTest(dir), r)
  assert.equal(calls(dir).length, 4)
  assert.ok(!/\.bmuz/.test(read(dir, '.git/info/exclude') || ''), 'the engine\'s record is hidden from git only while the release scripts run')
})

test('a failed live check puts the last good version back (rollback.mjs), pushed and deployed again, and the step says so', () => {
  const dir = garden()
  shareSaid(dir)
  publishTest(dir)
  secondSlice(dir)
  shareSaid(dir)
  const BACK = /The new build \(v0\.2\.0\) failed its live check, so I put v0\.1\.0 back; that's what's live now\./
  withFake({ FAKE_LIVE_CHECK: 'fail' }, () => assert.throws(() => publishTest(dir), BACK))
  assert.match(git(dir, ['log', '-1', '--format=%s']), /^Rollback to v0\.1\.0: undo v0\.2\.0/)
  assert.equal(git(dir, ['diff', 'v0.1.0', 'HEAD', '--', 'src']), '', 'the code is v0.1.0\'s again')
  assert.equal(git(`${dir}-origin.git`, ['rev-parse', 'main']), git(dir, ['rev-parse', 'main']), 'the rollback is pushed (to the local origin)')
  assert.equal(D.readRecord(dir).publish.rolledBack, 'v0.1.0')
  // review fix 1: a try after the rollback — its live check would pass, on the rolled-back site — never says the new
  // build is live: the same plain line, nothing run again, no "It's live"
  const before = calls(dir).length
  writeFileSync(join(dir, D.SAY.live), '')
  assert.throws(() => publishTest(dir), BACK)
  assert.equal(calls(dir).length, before, 'no live check, release or deploy on the retry')
  assert.equal(read(dir, D.SAY.live), '')
  assert.equal(JSON.parse(readFileSync(join(here, '..', 'plugin', 'pipelines', 'deliver.json'), 'utf8')).steps.find(s => s.id === 'publish').retries, 0, 'publish blocks at once: no automatic retry')
})

test('review fix 3: a release the release script refuses leaves no "released" marks, no Log line, no notes; the next try writes the Log line once; going back to Develop clears every Deliver mark', () => {
  const dir = garden()
  shareSaid(dir)
  const plan = () => [S.ROADMAP, '.planning/STATE.md', S.SPRINT].map(f => read(dir, f))
  const before = plan()
  withFake({ FAKE_RELEASE: 'fail' }, () => assert.throws(() => publishTest(dir), /version v0\.1\.0: ✗ release refused/))
  assert.deepEqual(plan(), before, 'the roadmap, STATE and the sprint as they were')
  assert.equal(read(dir, '.planning/archive/releases/v0.1.0.md'), null)
  assert.ok(!/released/.test(read(dir, S.ROADMAP)))
  publishTest(dir)
  assert.equal((read(dir, '.planning/STATE.md').match(/Released v0\.1\.0:/g) || []).length, 1, 'one Log line')
  // reopen: "✅ released …" and "✅ ready to deliver …" both go, "← current" comes back
  const text = '# R\nRelease target: playable\n## v0.1 — Vertical slice  (→ playable)  ✅ released 2026-11-11 (v0.1.0)\n- ✅ F01 🧱 Turn engine — a — must:playable\n## v0.2 — Alpha  ← current  (→ alpha)\n'
  assert.match(D.reopen(text, 'Vertical slice'), /^## v0\.1 — Vertical slice {2}← current {2}\(→ playable\)$/m)
  assert.ok(!/✅ released|✅ ready/.test(D.reopen(text, 'Vertical slice')))
})

test('review fix 2: the version is bumped once: a release that tagged and then died (a timeout, a crash) is adopted on the next try, never bumped again', () => {
  const dir = garden()
  shareSaid(dir)
  // release.mjs tags v0.1.0, then exits 1 (as a timeout would)
  const r = withFake({ FAKE_RELEASE: 'die-after-tag' }, () => publishTest(dir))
  assert.equal(r.tag, 'v0.1.0')
  assert.equal(JSON.parse(read(dir, 'version.json')).version, '0.1.0')
  assert.equal(git(dir, ['tag']), 'v0.1.0')
  assert.equal(calls(dir).filter(c => /^release /.test(c)).length, 1)
  // a crash after release.mjs tagged but before the record knew it: the intended version is on record, so the next try adopts it
  const two = garden()
  shareSaid(two)
  withFake({ FAKE_SMOKE_PASS: 'fail' }, () => assert.throws(() => publishTest(two), /the smoke pass/))
  assert.deepEqual(D.readRecord(two).publish.intended, { tag: 'v0.1.0', version: '0.1.0' })
  writeFileSync(join(two, D.RECORD), JSON.stringify({ ...D.readRecord(two), publish: { ...D.readRecord(two).publish, tag: undefined, version: undefined, smoke: undefined } }))
  assert.equal(publishTest(two).tag, 'v0.1.0')
  assert.equal(JSON.parse(read(two, 'version.json')).version, '0.1.0', 'not 0.2.0')
  assert.equal(git(two, ['tag']), 'v0.1.0')
  assert.equal(calls(two).filter(c => /^release /.test(c)).length, 1, 'release.mjs ran once')
})

test('review fix 5: the creative\'s own unsaved changes are never released with BMUZ\'s: publish refuses, naming them, before anything is merged', () => {
  const dir = garden()
  shareSaid(dir)
  appendFileSync(join(dir, '.planning', 'GDD.md'), '\nmy half-written note\n')
  assert.throws(() => publishTest(dir), /You have unsaved changes in \.planning\/GDD\.md; they'd go out with the release\. Save or undo them, then say "bmuz retry" to share it\./)
  assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), 'dev/vertical-slice')
  assert.equal(git(dir, ['tag']), '')
  assert.deepEqual(calls(dir), [])
})

test('review fix 4: the scan reads what ships — the build folder (here build/, not dist/), every size — after the last build, right before the push: a key in a 3 MB bundle refuses, nothing pushed', () => {
  const dir = garden()
  // the game's build writes build/: an index page and a 3 MB bundle whose last line holds a key
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'scripts', 'build.mjs'), [
    "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'",
    "const v = JSON.parse(readFileSync('version.json', 'utf8')).version",
    "mkdirSync('build', { recursive: true })",
    "writeFileSync('build/index.html', `<h1>Garden Race</h1> version ${v}`)",
    "writeFileSync('build/app.js', '// bundle' + String.fromCharCode(10) + 'x'.repeat(3000000) + String.fromCharCode(10) + 'const k = \"' + 'sk-ant-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4' + '\"')",
  ].join(String.fromCharCode(10)) + String.fromCharCode(10))
  writeFileSync(join(dir, '.gitignore'), 'dist/\nbuild/\nnode_modules/\n.fake-host\n')
  spawnSync('git', ['commit', '-qam', 'the build writes build/'], { cwd: dir })
  D.prep(dir, NOW)
  spawnSync('npm', ['run', 'build'], { cwd: dir, shell: true })
  assert.equal(D.shipDir(dir), 'build')
  const p = withFake({}, () => D.secretsIn(dir))
  assert.deepEqual(p, [{ file: 'build/app.js', what: 'an API secret key' }])
  shareSaid(dir)
  assert.throws(() => publishTest(dir), /Not shared: an API secret key in build\/app\.js \(the build that would go out\)/)
  assert.equal(git(`${dir}-origin.git`, ['tag']), '', 'nothing pushed')
  assert.ok(!calls(dir).some(c => /^release /.test(c)), 'caught before the release too')
  // a Vite game names its own output folder
  writeFileSync(join(dir, 'vite.config.mjs'), "export default { build: { outDir: 'www' } }\n")
  assert.equal(D.shipDir(dir), 'www')
})

test('review fix 6: a publish stopped while the engine\'s files are hidden from git (the 600 s cap) leaves a restore note; the next start or the doctor (deliver.mjs restore-exclude) puts .git/info/exclude back', () => {
  const dir = garden()
  const exclude = join(dir, '.git', 'info', 'exclude')
  writeFileSync(exclude, '# mine\n*.tmp\n')
  D.hideBmuz(dir) // (hidden, and never put back: the process was stopped here)
  assert.match(read(dir, '.git/info/exclude'), /\/\.bmuz\//)
  assert.deepEqual(JSON.parse(read(dir, D.EXCLUDE_NOTE)).before, '# mine\n*.tmp\n')
  const r = spawnSync(process.execPath, [join(here, '..', 'plugin', 'scripts', 'deliver.mjs'), 'restore-exclude'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout)
  assert.equal(readFileSync(exclude, 'utf8'), '# mine\n*.tmp\n')
  assert.equal(read(dir, D.EXCLUDE_NOTE), null, 'the note is gone')
  // a whole publish leaves no note behind
  shareSaid(dir)
  publishTest(dir)
  assert.equal(read(dir, D.EXCLUDE_NOTE), null)
  assert.equal(readFileSync(exclude, 'utf8'), '# mine\n*.tmp\n')
})

test('5.5 Playtest Notes: each feeling of GDD chapter 1 checked; tuning, bugs, rulebook questions and ideas land in the roadmap; the script\'s lines', () => {
  const dir = garden()
  D.prep(dir, NOW)
  assert.deepEqual(D.feelingsOf(dir), ['The thrill of a close race that you win right at the end.'])
  assert.match(D.notesProblem(dir, { feelings: [] }), /missing: "The thrill of a close race/)
  const notes = {
    feelings: [{ feeling: 'The thrill of a close race that you win right at the end.', seen: 'partly', why: 'games were decided by round 2' }],
    tuning: ['hail feels too strong late in the game'],
    bugs: [{ title: 'Rain card text cut off on a small phone', level: 'P3', steps: ['play rain on a small phone'], expected: 'all the text', actual: 'cut off' }],
    questions: ['can you play weather on your own row?'],
    ideas: ['a seasons mode'],
  }
  assert.equal(D.notesProblem(dir, notes), null)
  assert.match(D.notesProblem(dir, { ...notes, feelings: [{ ...notes.feelings[0], seen: 'kind of' }] }), /needs "seen" \(seen ✓ \/ partly \/ not seen\)/)
  assert.match(D.notesProblem(dir, { ...notes, bugs: [{ level: 'P2' }] }), /^a bug: the report needs a "title"/)
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ pipeline: 'deliver', resultsBy: { notes: { notes } } }))
  const r = D.notesWrite(dir, script, NOW)
  assert.equal(r.added, '1 tuning task, 1 bug, 1 rulebook question and 1 idea')
  const rm = read(dir, S.ROADMAP)
  assert.match(rm, /^- 🟢 F05 ✨ Tuning: hail feels too strong late in — hail feels too strong late in the game — should:alpha$/m)
  assert.match(rm, /^- 🟢 F06 ❓ Rule question: can you play weather on your — can you play weather on your own row\? — should:alpha$/m)
  assert.match(rm, /^- 2026-11-11 — a seasons mode$/m)
  assert.match(read(dir, B.BUGS), /^### B001 · P3 · open · found \d{4}-\d\d-\d\d in Deliver · Playtest Notes$/m)
  assert.equal(read(dir, D.SAY.notes), 'Against the feelings you chose:\n· "The thrill of a close race that you win right at the end.": partly — games were decided by round 2\n\nFrom your notes I\'ve added 1 tuning task, 1 bug, 1 rulebook question and 1 idea to the roadmap. Back to Develop.\n')
  // every fixed part of 5.5's two lines is in what BMUZ shows
  for (const f of ['Against the feelings you chose:', "From your notes I've added", 'to the roadmap. Back to Develop.']) assert.ok(plain(read(dir, D.SAY.notes)).includes(plain(f)), f)
})

test('deliver.json is the script\'s Stage 5 in order; nothing after the gate runs without "Share it"; the gate\'s yes is never first; Develop\'s onward starts it, and it goes back to Develop at Plan the Sprint', () => {
  const p = JSON.parse(readFileSync(join(here, '..', 'plugin', 'pipelines', 'deliver.json'), 'utf8'))
  assert.deepEqual(E.checkPipeline(p), [])
  assert.deepEqual(E.checkLines(p, script), [])
  // (prep is the Release Check's own first look, so 5.1 comes before the 5.0 welcome it decides on)
  assert.deepEqual([...new Set(p.steps.map(s => s.no))], ['5.1', '5.0', '5.2', '5.3', '5.4', '5.5'])
  assert.deepEqual(p.steps.map(s => s.id), ['prep', 'welcome', 'check', 'notready', 'notready-do', 'decide', 'polish', 'polish-do', 'safety', 'build', 'notyet', 'notyet-do', 'share', 'publish', 'notes', 'notes-write'])
  const share = p.steps.find(s => s.id === 'share')
  assert.equal(share.kind, 'gate')
  assert.ok(!share.auto, 'an auto run stops at Share it (never "carry")')
  assert.deepEqual(E.gateWords(share, script), { question: 'Share it?', options: ['Not yet', 'Share it'] })
  const publish = p.steps.find(s => s.id === 'publish')
  assert.deepEqual([publish.needs, publish.when, publish.writes], [['share'], '{go}', undefined], 'publish runs only after the gate, and the engine never puts files back over a release')
  // (F230: Develop at Plan the Sprint — prep says so — unless the 1.0 build hands over to Release: build says so)
  assert.deepEqual(p.next, { pipeline: '{onward}', at: '{at}', ask: false })
  assert.deepEqual([p.steps.find(s => s.id === 'prep').results, p.steps.find(s => s.id === 'build').results], [['first', 'onward', 'at'], ['go', 'onward', 'at']])
  const develop = JSON.parse(readFileSync(join(here, '..', 'plugin', 'pipelines', 'develop.json'), 'utf8'))
  assert.deepEqual(develop.next, { pipeline: '{onward}', at: '{at}', ask: false })
  assert.deepEqual(develop.steps.find(s => s.id === 'lookback-write').results, ['at'])
  for (const s of p.steps.filter(x => x.show)) assert.ok(E.isShowPath(s.show), s.show)
})
