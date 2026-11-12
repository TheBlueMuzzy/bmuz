// F230 tasks 2–4: launch.mjs — Release on the plan files, without Claude, on the garden race at Deliver's end with its
// 1.0 build made (tests/fixtures/garden-release-setup.mjs). Stand-ins only: the release scripts are tests/fixtures/
// fake-release, the host is a folder served on 127.0.0.1 from this process, itch.io's butler is tests/fixtures/
// fake-butler.mjs, Steam is a page on that host, the research is today's sourced stand-in reports (links never
// fetched). Every push goes to a bare repository in a temp folder. Nothing here reaches anything real.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as L from '../plugin/scripts/launch.mjs'
import * as D from '../plugin/scripts/deliver.mjs'
import * as S from '../plugin/scripts/sprint.mjs'
import { setupReleaseGarden, researchReport, TOPICS } from './fixtures/garden-release-setup.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const script = E.parseScript(readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8'))
const NOW = new Date()
process.env.BMUZ_RELEASE_TOOLS = join(here, 'fixtures', 'fake-release', 'scripts')
process.env.BMUZ_SOURCES_OFFLINE = '1'
process.env.BMUZ_RECIPES = join(here, 'fixtures', 'no-recipes')
const calls = dir => (existsSync(`${dir}-release.log`) ? readFileSync(`${dir}-release.log`, 'utf8').split('\n').filter(Boolean) : [])
const read = (dir, f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
const git = (dir, args) => (spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout || '').trim()
const journal = (dir, rows) => writeFileSync(join(dir, '.bmuz/journal.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
const state = (dir, resultsBy) => writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...E.freshState('release'), resultsBy }, null, 2))
async function withEnv(set, fn) {
  const was = Object.fromEntries(Object.keys(set).map(k => [k, process.env[k]]))
  Object.assign(process.env, set)
  try { return await fn() } finally { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }
}

// One stand-in host for every test: serves each garden's host folder at /<n>/… on 127.0.0.1 (never anything public).
const roots = []
const server = createServer((req, res) => {
  const [, n, ...rest] = decodeURIComponent(new URL(req.url, 'http://x').pathname).split('/')
  const root = roots[Number(n)]
  const path = normalize(rest.join('/'))
  if (!root || path.split(/[/\\]/).includes('..')) { res.writeHead(404).end(); return }
  let file = join(root, path)
  if (existsSync(file) && !/\.\w+$/.test(file)) file = join(file, 'index.html')
  if (!existsSync(file)) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
after(() => server.close())

// The garden at 1.0; its host on the stand-in server at http://127.0.0.1:PORT/<n>/ (STATE's Live and Itch lines).
function garden(opts = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'bmuz-release-')), 'garden')
  setupReleaseGarden(dir, { port: PORT, ...opts })
  const n = roots.push(`${dir}-host`) - 1
  const st = join(dir, '.planning', 'STATE.md')
  writeFileSync(st, readFileSync(st, 'utf8').replaceAll(`127.0.0.1:${PORT}/`, `127.0.0.1:${PORT}/${n}/`))
  spawnSync('git', ['commit', '-qam', 'the stand-in host'], { cwd: dir })
  process.env.BMUZ_FAKE_RELEASE_LOG = `${dir}-release.log`
  return dir
}
const link = (dir, path) => `http://127.0.0.1:${PORT}/${roots.indexOf(`${dir}-host`)}/${path}`
// The creative picked these in "Where should it go?" (the journaled box answer) and the step handed them back.
function picked(dir, labels) {
  journal(dir, [{ ev: 'step.start', step: 'where' }, { ev: 'line', step: 'where', line: 'release.where', box: { question: 'Where should it go? (pick any)' } }, { ev: 'answer', step: 'where', text: `User has answered your questions: "Where should it go? (pick any)"="${labels.join(', ')}".` }])
  state(dir, { where: { platforms: labels } })
}
// This platform's Store & Launch card done, then the creative's own answer at its gate.
const answered = (dir, answer) => journal(dir, [{ ev: 'step.done', step: 'store' }, { ev: 'gate.answer', step: 'gate', answer }])
const releaseTest = fn => withEnv({ BMUZ_TEST: '1', BMUZ_BUTLER: join(here, 'fixtures', 'fake-butler.mjs') }, fn)

test('6.0 "Where should it go?": the box\'s labels exactly, the ones the creative picked in this try; an auto run may pick (nothing goes public before a gate)', () => {
  const dir = garden()
  picked(dir, ['The web', 'Steam'])
  assert.equal(L.whereProblem(dir, ['The web', 'Steam'], 'live'), null)
  assert.match(L.whereProblem(dir, ['The web'], 'live'), /the creative picked The web, Steam, not The web/)
  assert.match(L.whereProblem(dir, ['the internet'], 'live'), /isn't one of the box's options/)
  assert.match(L.whereProblem(dir, [], 'live'), /pick at least one/)
  journal(dir, [])
  assert.match(L.whereProblem(dir, ['Steam'], 'live'), /no answer to "Where should it go\? \(pick any\)" in this try/)
  assert.equal(L.whereProblem(dir, ['Steam'], 'auto'), null)
})

test('the loop: the next platform in the order picked; today\'s research isn\'t done again; Release waits for Deliver\'s 1.0 build', () => {
  const dir = garden({ research: ['web'] })
  picked(dir, ['The web', 'itch.io'])
  const r = L.next(dir, NOW)
  assert.deepEqual(r, { platform: 'the web', game: 'Garden Race', topic: TOPICS.web, fresh: 'no', page: 'no' })
  assert.deepEqual(L.readRecord(dir).platforms, ['web', 'itch'])
  // (a report from before today is researched again: stores change their rules)
  const old = new Date(Date.now() - 3 * 86400000)
  utimesSync(join(dir, L.researchFile('web')), old, old)
  assert.equal(L.next(dir, NOW).fresh, 'yes')
  writeFileSync(join(dir, D.RECORD), JSON.stringify({ milestone: 'Beta', stage: 'beta', build: {} }))
  assert.throws(() => L.next(dir, NOW), /Release starts once Deliver has made the 1\.0 build/)
})

test('6.1 Store & Launch: the requirements from today\'s sourced research, split into done / needs you; the store page drafted from the pitch; the card word for word', async () => {
  const dir = garden()
  picked(dir, ['Steam'])
  L.next(dir, NOW)
  const r = await L.store(dir, script, NOW)
  assert.deepEqual(r, { go: 'yes', page: 'yes' })
  const per = L.readRecord(dir).per.steam
  // (the upload through Steamworks is the creative's: BMUZ never submits to a store)
  assert.deepEqual(per.done, ['A store page · the short description and About This Game'])
  assert.deepEqual(per.you, ['A Steamworks developer account · the app fee per game', 'Capsule art · the main capsule at its set size', 'A trailer · one short gameplay video', 'The build uploaded through Steamworks · a depot per platform', "Valve's review of the store page and the build · a few business days", 'A release date · Coming Soon for at least two weeks'])
  const card = read(dir, L.SAY.store)
  assert.match(card, /^\*\*Store & Launch\*\* · Steam\nHere's what Steam needs today: A Steamworks developer account · the app fee per game; Capsule art/)
  assert.match(card, /\nDone: A store page · the short description and About This Game · Needs you: A Steamworks developer account/)
  for (const f of ['Store & Launch', "Here's what", 'needs today:', 'Done:', '· Needs you:']) assert.ok(E.plainWords(card).includes(E.plainWords(f)), f)
  const page = read(dir, L.pageFile('steam'))
  assert.match(page, /^# Garden Race — Steam page\n\n\*\*Garden Race\*\*\nTwo friends race to grow the best garden on one phone or online\. You plant seeds; your friend sends weather\.\n/)
  assert.match(page, /\*\*What it feels like:\*\* The thrill of a close race that you win right at the end\./)
  assert.equal(read(dir, L.PAGE_NOW), page, 'the draft the page step says')
  assert.match(read(dir, L.stepsFile('steam')), /^1\. Get this ready: A Steamworks developer account/m)
  assert.match(git(dir, ['log', '-1', '--format=%s']), /^Release: Steam's requirements researched/)
  assert.equal(git(dir, ['status', '--porcelain', '--', '.planning']), '', 'launch.mjs commits what it writes')
})

test('requirements are never written from memory: no research, research from before today, or an unsourced report is refused', async () => {
  const dir = garden({ research: [] })
  picked(dir, ['itch.io'])
  L.next(dir, NOW)
  await assert.rejects(L.store(dir, script, NOW), /there is no research on itch\.io .*never written from memory/)
  writeFileSync(join(dir, L.researchFile('itch')), researchReport(TOPICS.itch, ['A cover image · 630×500']))
  const old = new Date(Date.now() - 3 * 86400000)
  utimesSync(join(dir, L.researchFile('itch')), old, old)
  await assert.rejects(L.store(dir, script, NOW), /is from before today: stores change their rules/)
  writeFileSync(join(dir, L.researchFile('itch')), researchReport(TOPICS.itch, ['A cover image · 630×500']).replace('- A cover image · 630×500 [1] (one source)\n\n## Contradictions', '- A cover image · 630×500 (one source)\n\n## Contradictions'))
  await assert.rejects(L.store(dir, script, NOW), /isn't sourced well enough: .*cites no source/)
  // a fresh report the research flow just wrote (release-now.md) is kept under the platform's name
  writeFileSync(join(dir, L.RESEARCH_NOW), researchReport(TOPICS.itch, ['A cover image · 630×500']))
  await L.store(dir, script, NOW)
  assert.ok(!existsSync(join(dir, L.RESEARCH_NOW)))
  assert.match(read(dir, L.researchFile('itch')), /^# Discover \(release requirements\): itch\.io/)
})

test('"Release it" only with the creative\'s own answer at this platform\'s gate: none, "Not yet", or one before this card refuses, changing nothing', async () => {
  const dir = garden()
  picked(dir, ['The web'])
  L.next(dir, NOW)
  await L.store(dir, script, NOW)
  journal(dir, [{ ev: 'gate.answer', step: 'gate', answer: 'Release it' }, { ev: 'step.done', step: 'store' }])
  await assert.rejects(releaseTest(() => L.launch(dir, script, NOW)), /own "Release it" at "Release Garden Race on the web\?" \(no answer in this run\)/)
  answered(dir, 'Not yet')
  await assert.rejects(releaseTest(() => L.launch(dir, script, NOW)), /they answered "Not yet"/)
  assert.equal(git(dir, ['tag']), 'v0.3.0')
  assert.equal(calls(dir).length, 0, 'no release tool ran')
})

test('the web: "Release it" → 1.0 released (v1.0.0 tagged, pushed to the local origin only), deployed to the stand-in host, checked from outside; "[Game] is live" word for word', async () => {
  const dir = garden()
  picked(dir, ['The web', 'itch.io'])
  L.next(dir, NOW)
  await L.store(dir, script, NOW)
  answered(dir, 'Release it')
  const r = await releaseTest(() => L.launch(dir, script, NOW))
  assert.deepEqual(r, { walk: 'no', link: link(dir, 'garden-race/') })
  assert.deepEqual(calls(dir).map(c => c.split(' ')[0]), ['merge', 'release', 'smoke-pass', 'live-check'])
  assert.match(calls(dir)[1], /^release major 1\.0: the 1\.0 build/)
  assert.equal(git(dir, ['tag', '--sort=v:refname']).split('\n').pop(), 'v1.0.0')
  assert.equal(git(`${dir}-origin.git`, ['tag', '--sort=v:refname']).split('\n').pop(), 'v1.0.0', 'the tag reached the local origin only')
  assert.match(read(`${dir}-host`, 'garden-race/index.html'), /version 1\.0\.0/)
  assert.match(read(dir, S.ROADMAP), /^## v0\.4 — 1\.0 {2}\(→ 1\.0\) {2}✅ released \d{4}-\d\d-\d\d \(v1\.0\.0\)$/m)
  assert.match(read(dir, S.ROADMAP), /^Release target: released/m)
  assert.equal(read(dir, L.SAY.live), `Garden Race is live: ${link(dir, 'garden-race/')}. I checked it from outside, and it loads and plays.\n`)
  assert.match(read(dir, '.planning/STATE.md'), new RegExp(`^- Live on the web: ${link(dir, 'garden-race/').replace(/[.?]/g, '\\$&')} \\(v1\\.0\\.0, \\d{4}-\\d\\d-\\d\\d\\)$`, 'm'))
  assert.equal(L.readRecord(dir).per.web.status, 'live')
  assert.deepEqual(L.more(dir), { last: 'no', onward: 'release', at: 'platform' })
})

test('itch.io: the upload through its recipe (butler, a stand-in here), the 1.0 release done once, the page checked from outside; a test run never reaches itch.io', async () => {
  const dir = garden()
  picked(dir, ['itch.io'])
  L.next(dir, NOW)
  await L.store(dir, script, NOW)
  answered(dir, 'Release it')
  // (a test run without the stand-in butler is refused: it never uploads to itch.io)
  await assert.rejects(withEnv({ BMUZ_TEST: '1' }, () => L.launch(dir, script, NOW)), /uploads only to the stand-in \(BMUZ_BUTLER\), never to itch\.io/)
  const r = await releaseTest(() => L.launch(dir, script, NOW))
  assert.deepEqual(r, { walk: 'no', link: link(dir, 'itch/garden-race/') })
  assert.deepEqual(calls(dir).map(c => c.split(' ').slice(0, 2).join(' ')), ['merge dev/vertical-slice', 'release major', 'smoke-pass', 'butler push'])
  assert.match(calls(dir)[3], /^butler push dist test\/garden-race:html5 --userversion 1\.0\.0$/)
  assert.match(read(`${dir}-host`, 'itch/garden-race/index.html'), /version 1\.0\.0/)
  assert.ok(!existsSync(join(`${dir}-host`, 'garden-race')), 'no web deploy for itch.io')
  assert.equal(read(dir, L.SAY.live), `Garden Race is live: ${link(dir, 'itch/garden-race/')}. I checked it from outside, and it loads and plays.\n`)
  // the Itch line pointing anywhere but this machine is refused in a test run
  writeFileSync(join(dir, '.planning/STATE.md'), read(dir, '.planning/STATE.md').replace(/Itch: \S+/, 'Itch: https://someone.itch.io/garden-race'))
  await assert.rejects(releaseTest(() => L.launch(dir, script, NOW)), /uploads only to a page on this machine/)
})

test('Steam: "Release it" releases 1.0 (once) and starts the walk-through; it is marked live only on the creative\'s own link, checked from outside; an auto run never marks it', async () => {
  const dir = garden()
  picked(dir, ['Steam'])
  L.next(dir, NOW)
  await L.store(dir, script, NOW)
  answered(dir, 'Release it')
  assert.deepEqual(await releaseTest(() => L.launch(dir, script, NOW)), { walk: 'yes' })
  assert.equal(git(dir, ['tag', '--sort=v:refname']).split('\n').pop(), 'v1.0.0')
  assert.ok(!calls(dir).some(c => /^(butler|live-check)/.test(c)), 'BMUZ uploads nothing to Steam')
  const steam = link(dir, 'steam/garden-race/')
  mkdirSync(join(`${dir}-host`, 'steam', 'garden-race'), { recursive: true })
  writeFileSync(join(`${dir}-host`, 'steam', 'garden-race', 'index.html'), '<title>Garden Race on Steam (a stand-in page)</title>')
  journal(dir, [{ ev: 'step.start', step: 'walk' }, { ev: 'answer', step: 'walk', text: `It's live! ${steam}` }])
  assert.match(await releaseTest(() => L.liveLinkProblem(dir, steam, 'auto')), /only the creative can say it is live/)
  assert.match(await releaseTest(() => L.liveLinkProblem(dir, link(dir, 'steam/other/'), 'live')), /must be the creative's own, as they pasted it/)
  assert.equal(await releaseTest(() => L.liveLinkProblem(dir, steam, 'live')), null)
  journal(dir, [{ ev: 'step.start', step: 'walk' }, { ev: 'answer', step: 'walk', text: `https://store.steampowered.com/app/1/` }])
  assert.match(await releaseTest(() => L.liveLinkProblem(dir, 'https://store.steampowered.com/app/1/', 'live')), /checks only pages on this machine/)
  L.markedLive(dir, steam, script, NOW)
  assert.equal(L.readRecord(dir).per.steam.status, 'live')
  assert.equal(read(dir, L.SAY.live), `Garden Race is live: ${steam}. I checked it from outside, and it loads and plays.\n`)
  // a second platform after it doesn't release 1.0 again
  const before = calls(dir).length
  D.publish(dir, script, NOW, { approved: true, deploy: false })
  assert.equal(calls(dir).length, before)
})

test('"Not yet": what\'s missing on the roadmap in the creative\'s words, the platform waits, the run goes on; it is picked up again later', async () => {
  const dir = garden()
  picked(dir, ['Steam', 'itch.io'])
  L.next(dir, NOW)
  await L.store(dir, script, NOW)
  L.notYet(dir, 'The capsule art isn\'t drawn yet.', script, NOW)
  assert.match(read(dir, S.ROADMAP), /^- 🟢 F06 ✨ Release on Steam: The capsule art isn't drawn yet — The capsule art isn't drawn yet — must:1\.0$/m)
  assert.equal(read(dir, L.SAY.notyet), 'Steam waits until this is done: The capsule art isn\'t drawn yet. It\'s on the roadmap. When it\'s ready, say "bmuz stage release platform" and we\'ll pick Steam up again.\n')
  assert.deepEqual(L.more(dir), { last: 'no', onward: 'release', at: 'platform' })
  state(dir, {})
  assert.equal(L.next(dir, NOW).platform, 'itch.io')
  L.readRecord(dir)
  const rec = L.readRecord(dir)
  rec.per.itch.status = 'live'
  writeFileSync(join(dir, L.RECORD), JSON.stringify(rec))
  assert.deepEqual(L.more(dir), { last: 'yes', onward: 'later', at: 'first' })
  // later ("bmuz stage release platform"): the waiting one again
  assert.equal(L.next(dir, NOW).platform, 'Steam')
})

test('6.2 First Reactions: each feeling checked; the fixes into an "Update 1.1" milestone (current), the bugs into BUGS.md; the script\'s line', async () => {
  const dir = garden()
  picked(dir, ['The web'])
  L.next(dir, NOW)
  assert.match(L.reactionsProblem(dir, { feelings: [] }), /missing: "The thrill of a close race/)
  const reactions = { feelings: [{ feeling: 'The thrill of a close race that you win right at the end.', seen: 'seen ✓', why: '"came down to the last card" in 5 reviews' }], fixes: ['Hail is too strong late in the game'], bugs: [{ title: 'Rain text cut off on small phones', level: 'P2', steps: ['open a rain card on a small phone'], expected: 'the whole text', actual: 'cut off' }] }
  assert.equal(L.reactionsProblem(dir, reactions), null)
  state(dir, { reactions: { reactions } })
  writeFileSync(join(dir, 'version.json'), JSON.stringify({ name: 'garden-race', version: '1.0.0' }))
  const r = L.reactionsWrite(dir, script, NOW)
  assert.deepEqual([r.fixes, r.bugs, r.update], [['Hail is too strong late in the game'], ['B001'], 'Update 1.1'])
  const rm = read(dir, S.ROADMAP)
  assert.match(rm, /^## v1\.1 — Update 1\.1 {2}← current {2}\(→ update\)\nGoal: what players asked for after 1\.0\n- 🟢 F06 ✨ Hail is too strong late in the game — Hail is too strong late in the game — must:update$/m)
  assert.equal(S.currentMilestone(rm).name, 'Update 1.1')
  assert.equal(D.stageOf('update').kind, 'milestone', 'Deliver knows an update: 1.0.0 → 1.1.0')
  assert.match(read(dir, '.planning/BUGS.md'), /^### B001 · P2 · open · found \d{4}-\d\d-\d\d in Release · First Reactions/m)
  assert.equal(read(dir, L.SAY.reactions), 'Against your feelings: "The thrill of a close race that you win right at the end.": seen ✓ — "came down to the last card" in 5 reviews. Worth fixing in an update: Hail is too strong late in the game; B001 (a bug). Added to the roadmap as Update 1.1.\n')
})

test('6.3 Look Back: for this game → STATE\'s Key facts, for BMUZ → .planning/bmuz-suggestions.md; back to Develop for the update, else "the game is out"', () => {
  const dir = garden()
  picked(dir, ['The web'])
  L.next(dir, NOW)
  assert.match(L.lookbackProblem({ forgame: ['x'], forbmuz: [] }), /"forbmuz" needs at least one lesson/)
  const lessons = { forgame: ['Weather that hits both players kept games close'], forbmuz: ['Ask for the capsule art at Design, not at Release'] }
  state(dir, { lookback: { lessons } })
  assert.deepEqual(L.lookbackWrite(dir, script, NOW), { onward: 'later', at: 'first' })
  assert.match(read(dir, '.planning/STATE.md'), /^## Key facts\n- Lesson: Weather that hits both players kept games close$/m)
  assert.match(read(dir, L.SUGGESTIONS), /^## \d{4}-\d\d-\d\d · Garden Race\n- Ask for the capsule art at Design, not at Release$/m)
  assert.equal(read(dir, L.SAY.end), 'Garden Race is out. To start an update, tell me what to fix (it goes on the roadmap as an Update milestone), then say "bmuz stage develop plan".\n')
  const rec = L.readRecord(dir)
  rec.reactions = { update: 'Update 1.1' }
  writeFileSync(join(dir, L.RECORD), JSON.stringify(rec))
  assert.deepEqual(L.lookbackWrite(dir, script, NOW), { onward: 'develop', at: 'plan' })
  assert.equal(read(dir, L.SAY.end), 'Back to Develop to build Update 1.1.\n')
  assert.equal((read(dir, '.planning/STATE.md').match(/- Lesson: Weather/g) || []).length, 1, 'a lesson is kept once')
})
