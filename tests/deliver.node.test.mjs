// F219 tasks 2–4: deliver.mjs — Deliver on the plan files and the release scripts, without Claude, on the garden race
// at Develop's end (tests/fixtures/garden-developed: v0.1's musts approved, a dev/vertical-slice branch, a tiny game).
// Every push goes to a bare repository in a temp folder and every "live" page to the stand-in host on 127.0.0.1
// (tests/fixtures/fake-host.mjs): nothing here reaches anything real, and the tests check that.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as D from '../plugin/scripts/deliver.mjs'
import * as S from '../plugin/scripts/sprint.mjs'
import * as B from '../plugin/scripts/bugs.mjs'
import { toolsDir } from '../plugin/scripts/release-tools.mjs'
import { setupDevelopedGarden } from './fixtures/garden-developed-setup.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const script = E.parseScript(readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8'))
const NOW = new Date('2026-11-11T18:05:00')
// The release scripts live in ~/.claude/config/bmuz (the BMUZ config); without them the tests that run them are skipped.
const noTools = !existsSync(join(toolsDir(), 'release.mjs')) && 'the release scripts (~/.claude/config/bmuz/scripts) are not on this machine'
process.env.BMUZ_CLEANUP = join(here, 'fixtures', 'noop-cleanup.sh')
process.env.BMUZ_LIVE_TRIES = '2'
process.env.BMUZ_POLL_MS = '300'

const hosts = []
after(() => { for (const h of hosts) h.kill() })
// The stand-in host on a free port; resolves once it listens.
function fakeHost(folder) {
  const port = 41000 + Math.floor(Math.random() * 2000)
  const child = spawn(process.execPath, [join(here, 'fixtures', 'fake-host.mjs'), folder, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] })
  hosts.push(child)
  return new Promise(res => child.stdout.on('data', d => { if (/listening/.test(String(d))) res(port) }))
}
function garden({ port = 1 } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'bmuz-deliver-')), 'garden')
  setupDevelopedGarden(dir, { port })
  mkdirSync(join(dir, '.bmuz'), { recursive: true })
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
  assert.deepEqual([D.stageOf('alpha').kind, D.stageOf('beta').rank, D.stageOf('1.0').kind, D.stageOf('').key], ['stage', 2, 'major', 'playable'])
})

test('5.1 the Release Check: musts · blocking bugs · every check, each ✓; ready', { skip: noTools }, async () => {
  const dir = garden()
  D.prep(dir, NOW)
  const rec = await D.check(dir, script)
  assert.equal(rec.go, true)
  assert.equal(read(dir, D.SAY.check), '**Release Check** · Playable\n✓ every must for this stage is done (3 of 3)\n✓ no blocking bugs\n✓ every check passes\n')
})

test('5.1 not ready: an open must and a P0 bug are named in the script\'s "Not ready yet…" line; a P2 doesn\'t block a Playable build', { skip: noTools }, async () => {
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
  assert.match(D.choiceProblem(dir, 'move it to the next stage', 'auto'), /creative's call/)
  assert.equal(D.choiceProblem(dir, 'move it to the next stage', 'live'), null)
  assert.equal(D.choiceProblem(dir, 'Finish it first', 'auto'), null)
  assert.match(D.choiceProblem(dir, 'maybe', 'live'), /must be "finish"/)
})

test('"move it to the next stage": the must moves to Alpha with its tag and its graph node, the roadmap says so; a bug left still sends it back', { skip: noTools }, async () => {
  const dir = garden()
  writeFileSync(join(dir, S.ROADMAP), read(dir, S.ROADMAP).replace('- ✅ F03 🎮 Weather cards', '- 🎛️ F03 🎮 Weather cards'))
  // (committed: a roadmap with the creative's unsaved changes is theirs to commit, and BMUZ leaves it uncommitted)
  spawnSync('git', ['commit', '-qam', 'F03 back to tuning'], { cwd: dir })
  D.prep(dir, NOW)
  await D.check(dir, script)
  const rec = D.notReady(dir, 'move', script, NOW)
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

test('"finish it first": back to Develop with the milestone current again, the script\'s added line', { skip: noTools }, async () => {
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

test('5.2 Polish & Stand-ins: the placeholders by name (release-check.mjs finds them); "None" ships, a pick goes on the roadmap and back to Develop', { skip: noTools }, async () => {
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

test('5.3 Safety & Legal: no keys, every asset licensed, Beta and 1.0 named; a key or an unlicensed file refuses', { skip: noTools }, async () => {
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

test('5.4 the build card: built, a link for you (the build on this machine) and one to share (STATE\'s Live link)', { skip: noTools }, () => {
  const dir = garden({ port: 4321 })
  D.prep(dir, NOW)
  const b = D.build(dir, script)
  assert.ok(existsSync(join(dir, 'dist', 'index.html')))
  assert.match(b.local, /^file:\/\/\/.*\/dist\/index\.html$/)
  assert.equal(b.share, 'http://127.0.0.1:4321/garden-race/')
  assert.match(read(dir, D.SAY.build), /^\*\*Build & Share\*\*\nThe playable build is ready and tested on desktop:\n· For you: file:\/\/\/.+\n· To share: http:\/\/127\.0\.0\.1:4321\/garden-race\/\n$/)
})

test('"Share it" only with the creative\'s own answer after this build: none, "Not yet", or an earlier one refuses, changing nothing', { skip: noTools }, () => {
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

test('5.4 "Share it": merged, versioned v0.1.0 and tagged, smoke pass, pushed to the local origin only, deployed to the stand-in host, the live check passes', { skip: noTools, timeout: 600000 }, async () => {
  const pre = garden()
  const port = await fakeHost(`${pre}-host`)
  const dir = pre
  writeFileSync(join(dir, '.planning', 'STATE.md'), read(dir, '.planning/STATE.md').replace('127.0.0.1:1/', `127.0.0.1:${port}/`))
  spawnSync('git', ['commit', '-qam', 'the host\'s port'], { cwd: dir })
  D.prep(dir, NOW)
  D.build(dir, script)
  journal(dir, [{ ev: 'step.done', step: 'build' }, { ev: 'gate.answer', step: 'share', answer: 'Share it' }])
  const was = process.env.BMUZ_TEST
  process.env.BMUZ_TEST = '1'
  let r
  // (today's real date: release.mjs checks the Log line and the milestone heading are dated today)
  try { r = D.publish(dir, script) } finally { process.env.BMUZ_TEST = was }
  assert.deepEqual(r, { tag: 'v0.1.0', link: `http://127.0.0.1:${port}/garden-race/` })
  assert.equal(git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main')
  assert.equal(JSON.parse(read(dir, 'version.json')).version, '0.1.0')
  const origin = `${dir}-origin.git`
  assert.equal(git(origin, ['tag']), 'v0.1.0', 'the tag reached the local origin')
  assert.equal(git(origin, ['rev-parse', 'main']), git(dir, ['rev-parse', 'main']), 'main is pushed to the local origin')
  assert.equal(git(dir, ['remote', 'get-url', 'origin']), origin, 'the only remote is the folder on this machine')
  assert.match(read(`${dir}-host`, 'garden-race/index.html'), /version 0\.1\.0/)
  assert.match(read(dir, '.planning/live-pass'), /v0\.1\.0 http:\/\/127\.0\.0\.1/)
  assert.match(read(dir, S.ROADMAP), /^## v0\.1 — Vertical slice {2}\(→ playable\) {2}✅ released \d{4}-\d\d-\d\d \(v0\.1\.0\)$/m)
  assert.match(read(dir, S.ROADMAP), /^Release target: alpha/m)
  assert.match(read(dir, '.planning/archive/releases/v0.1.0.md'), /^# v0\.1\.0\n\n## Highlights\nVertical slice: one full game for two on one phone\.\n\n## New\n- Turn engine: draw a card/)
  assert.match(git(dir, ['log', '--format=%s']), /^Live check for v0\.1\.0\n(Smoke pass for v0\.1\.0\n)?Release v0\.1\.0: Vertical slice: the playable build\nMerge dev\/vertical-slice into main/)
  assert.equal(read(dir, D.SAY.live), `It's live: http://127.0.0.1:${port}/garden-race/ (version 0.1.0).\n`)
  // a try after this one carries on where it stopped: nothing is done twice
  assert.deepEqual(D.publish(dir, script), r)
  assert.ok(!/\.bmuz/.test(read(dir, '.git/info/exclude') || ''), 'the engine\'s record is hidden from git only while the release scripts run')
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
