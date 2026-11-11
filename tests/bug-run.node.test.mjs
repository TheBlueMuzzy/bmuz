// F215 task 4: the bug pipeline's scripts (bugs.mjs pick / repro / verify / hits-fail / hits-pass / record), run for real
// on the bug-garden fixture (tests/fixtures/bug-garden: the final score skips the first row, the full-row bonus copies
// the mistake), in a temporary git repository. No Claude: the test and fix steps are written by the test itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as B from '../plugin/scripts/bugs.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'bug.json'), 'utf8'))
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
const bugs = (dir, ...args) => spawnSync(process.execPath, [join(plugin, 'scripts', 'bugs.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: 120000 })
const git = (dir, ...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
const read = (dir, f) => readFileSync(join(dir, f), 'utf8')

function garden() {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-bug-garden-'))
  cpSync(join(here, 'fixtures', 'bug-garden'), dir, { recursive: true })
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'BMUZ test')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'the garden')
  mkdirSync(join(dir, '.bmuz'))
  return dir
}
const setResults = (dir, resultsBy, given = {}) => writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...E.freshState('bug'), given, resultsBy }))
const REPRO = "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { finalScore } from '../src/score.js'\ntest('B001: every row counts, the first one too', () => {\n  assert.equal(finalScore([['bloom', 'bloom', 'bloom'], ['bloom', 'seed', 'empty']]), 4)\n})\n"
const HIT = "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { fullRowBonus } from '../src/bonus.js'\ntest('B001 also: the first full row earns its bonus', () => {\n  assert.equal(fullRowBonus([['bloom', 'bloom', 'bloom'], ['bloom', 'seed', 'empty']]), 2)\n})\n"

test('the pipeline: pick → reproduce → reproduced → cause → fix → matching → matching fix (only with hits to fix) → record; every check is a script that runs the tests', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  assert.deepEqual(E.checkLines(P, script), [])
  assert.deepEqual(P.steps.map(s => s.id), ['pick', 'reproduce', 'repro-show', 'cause', 'fix', 'matching', 'matching-fix', 'record'])
  assert.deepEqual(P.steps.find(s => s.id === 'reproduce').done.run.slice(2), ['repro', '{test}'])
  assert.deepEqual(P.steps.find(s => s.id === 'fix').done.run.slice(2), ['verify'])
  assert.deepEqual(P.steps.find(s => s.id === 'matching').done.run.slice(2), ['hits-fail', '{hits}'])
  assert.equal(P.steps.find(s => s.id === 'matching-fix').when, '{fixhits}')
  for (const id of ['pick', 'repro-show', 'record']) assert.ok(P.steps.find(s => s.id === id).show, id)
  // (a whole-hole argument holding a list reaches the script as JSON)
  assert.deepEqual(E.fillDeep(['hits-fail', '{hits}'], { hits: [{ where: 'a' }] }), ['hits-fail', '[{"where":"a"}]'])
})

test('the fix run on the bug-garden: refused while the test passes, proven failing, refused while the fix is missing or the test changed, then fixed in both places, recorded and committed', () => {
  const dir = garden()
  // the creative's report, logged (and committed "Bug B001: …")
  const added = JSON.parse(bugs(dir, 'add', JSON.stringify({ report: { title: 'Final score misses the first row', level: 'P1', steps: ['Fill the first row with blooms', 'End the game'], expected: 'every bloom counts', actual: 'the first row scores nothing', often: 'every time' }, where: 'Design · The Rulebook' })).stdout)
  assert.equal(added.id, 'B001')
  assert.match(git(dir, 'log', '--format=%s').stdout, /^Bug B001: Final score misses the first row$/m)
  setResults(dir, {}, { bug: 'B001' })
  // pick
  let r = bugs(dir, 'pick')
  assert.equal(r.status, 0, r.stdout)
  assert.match(read(dir, B.BUGS), /### B001 · P1 · fixing · found \d{4}-\d\d-\d\d in Design · The Rulebook/)
  assert.equal(read(dir, B.SAY.start), E.renderLine(script, 'bug.fix.start', { bug: 'B001 · Final score misses the first row · P1 — a feature doesn\'t work' }).text + '\n')
  // reproduce: a test that passes is refused; one that fails is recorded
  writeFileSync(join(dir, 'tests/b001-first-row.test.mjs'), REPRO.replace('), 4)', '), 1)'))
  r = bugs(dir, 'repro', 'tests/b001-first-row.test.mjs')
  assert.equal(r.status, 1)
  assert.match(r.stdout, /passes, so it doesn't show B001 yet/)
  writeFileSync(join(dir, 'tests/b001-first-row.test.mjs'), "import { nope } from '../src/missing.js'\n")
  assert.match(bugs(dir, 'repro', 'tests/b001-first-row.test.mjs').stdout, /crashed before testing anything/)
  assert.match(bugs(dir, 'repro', '../outside.test.mjs').stdout, /isn't a test file path inside the project/)
  writeFileSync(join(dir, 'tests/b001-first-row.test.mjs'), REPRO)
  r = bugs(dir, 'repro', 'tests/b001-first-row.test.mjs')
  assert.equal(r.status, 0, r.stdout)
  // (review fix 1: the proof and the current-bug pointer live under .bmuz/, where Write / Edit are refused; nothing of
  // it is in the project's own folders, so a hand-made proof there counts for nothing)
  assert.ok(!existsSync(join(dir, '.planning/bugs/B001.json')) && !existsSync(join(dir, '.planning/bugs/current.json')))
  const proof = JSON.parse(read(dir, '.bmuz/bug/B001.json'))
  assert.ok(proof.repro.exitCode !== 0 && proof.repro.sha)
  assert.equal(JSON.parse(read(dir, '.bmuz/bug/current.json')).id, 'B001')
  const P0 = { ...E.freshState('bug'), current: 'fix', status: 'working', finished: ['pick'] }
  assert.equal(E.judgeTool(P, P0, { tool: 'Write', input: { file_path: join(dir, '.bmuz', 'bug', 'B001.json') } }, { dir: dir.replace(/\\/g, '/') }).allow, false)
  assert.equal(bugs(dir, 'say-repro').status, 0)
  assert.equal(read(dir, B.SAY.repro), 'Reproduced: tests/b001-first-row.test.mjs fails, as it should while the bug is there.\n')
  // fix: refused before the fix, refused when the test was changed to pass, passes after the real fix
  assert.match(bugs(dir, 'verify').stdout, /still fails/)
  writeFileSync(join(dir, 'tests/b001-first-row.test.mjs'), REPRO.replace('), 4)', '), 1)'))
  assert.match(bugs(dir, 'verify').stdout, /the test changed after it was shown failing\. Fix the code, not the test/)
  writeFileSync(join(dir, 'tests/b001-first-row.test.mjs'), REPRO)
  writeFileSync(join(dir, 'src/score.js'), read(dir, 'src/score.js').replace('let i = 1', 'let i = 0'))
  r = bugs(dir, 'verify')
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /the test passes now, and the suite too/)
  // matching places: a hit to fix needs its own test, failing first
  const hits = [{ where: 'src/bonus.js:4', what: 'the same loop skips the first row', action: 'fix', test: 'tests/b001-also-bonus.test.mjs' }, { where: 'src/score.js:2', what: 'the comment says nothing about empty rows', action: 'log', title: 'Score comment unclear about empty rows', level: 'P3' }]
  assert.match(bugs(dir, 'hits-fail', JSON.stringify([{ where: 'x', action: 'fix' }])).stdout, /needs its own "test" file/)
  writeFileSync(join(dir, 'tests/b001-also-bonus.test.mjs'), HIT)
  r = bugs(dir, 'hits-fail', JSON.stringify(hits))
  assert.equal(r.status, 0, r.stdout)
  assert.match(bugs(dir, 'hits-pass').stdout, /b001-also-bonus\.test\.mjs still fails/)
  writeFileSync(join(dir, 'src/bonus.js'), read(dir, 'src/bonus.js').replace('let i = 1', 'let i = 0'))
  assert.equal(bugs(dir, 'hits-pass').status, 0)
  // record
  setResults(dir, { cause: { cause: 'finalScore and its loop start at row 1, so the first row is never counted (src/score.js).', repeat: 'none', rule: 'every row counts, starting from the first (index 0)' }, fix: { files: ['src/score.js'] }, matching: { hits, fixhits: 'yes' }, 'matching-fix': { alsoFiles: ['src/bonus.js'] } }, { bug: 'B001' })
  r = bugs(dir, 'record')
  assert.equal(r.status, 0, r.stdout)
  const text = read(dir, B.BUGS)
  const fixed = text.split('## Fixed (newest first)')[1]
  assert.match(fixed, /### B001 · P1 · fixed \d{4}-\d\d-\d\d · found .* · fixed in [0-9a-f]{7,} · Guarded by: tests\/b001-first-row\.test\.mjs/)
  assert.match(fixed, /Cause: finalScore and its loop start at row 1/)
  assert.match(fixed, /Also fixed: src\/bonus\.js:4 \(Guarded by: tests\/b001-also-bonus\.test\.mjs\)/)
  assert.match(fixed, /Don't re-break: every row counts/)
  assert.match(text.split('## Fixed')[0], /### B002 · P3 · open · found \d{4}-\d\d-\d\d in B001's matching places\n<!-- bmuz bug:b002 · [0-9a-f]{8} -->\nScore comment unclear about empty rows/)
  assert.match(text, /^Open: 1 \(P0 0 · P1 0 · P2 0 · P3 1\)$/m)
  assert.match(read(dir, B.STATE_MD), /## Don't re-break\n- B001: every row counts, starting from the first \(index 0\)/)
  const log = git(dir, 'log', '--format=%s').stdout.split('\n')
  assert.equal(log[1], 'Fix B001: Final score misses the first row')
  assert.match(log[0], /^Bug B001: fixed in [0-9a-f]{7,}$/)
  const inFix = git(dir, 'show', '--name-only', '--format=', 'HEAD~1').stdout.split('\n').filter(Boolean).sort()
  assert.deepEqual(inFix, ['.planning/BUGS.md', '.planning/STATE.md', 'src/bonus.js', 'src/score.js', 'tests/b001-also-bonus.test.mjs', 'tests/b001-first-row.test.mjs'])
  // (review fix 8: nothing of the run is left in the project: the shown lines and the pointer are in .bmuz/ only)
  assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all', '--', '.', ':!.bmuz').stdout.trim(), '')
  assert.ok(!existsSync(join(dir, '.planning/bugs')))
  for (const f of Object.values(B.SAY)) assert.match(f, /^\.bmuz\/bug\/say-[a-z]+\.md$/)
  // the closing line, from the script; run again, nothing is added twice
  const done = read(dir, B.SAY.done)
  assert.match(done, /^\*\*Fixed: B001 · Final score misses the first row · P1 — a feature doesn't work\*\*\n· Cause: finalScore/)
  assert.match(done, /· Committed: "Fix B001: Final score misses the first row"/)
  assert.match(done, /Check it yourself, then say "bmuz bug verified B001"\.\nBack to what we were doing\.$/m)
  assert.equal(bugs(dir, 'record').status, 0)
  assert.equal((read(dir, B.BUGS).match(/### B002/g) || []).length, 1)
  const v = spawnSync(process.execPath, [join(here, 'fixtures', 'bug-garden-check.mjs'), dir], { encoding: 'utf8' })
  assert.equal(JSON.parse(v.stdout).ok, true)
})

test('pick: nothing open, or a bug already closed, is said plainly; "next" goes P0 → P3', () => {
  const dir = garden()
  setResults(dir, {})
  assert.match(bugs(dir, 'pick').stdout, /there are no open bugs to fix/)
  bugs(dir, 'add', JSON.stringify({ report: { title: 'Menu overlaps', level: 'P3' } }))
  bugs(dir, 'add', JSON.stringify({ report: { title: 'Crash on start', level: 'P0' } }))
  assert.equal(JSON.parse(bugs(dir, 'next').stdout).id, 'B002')
  assert.equal(JSON.parse(bugs(dir, 'next', 'B001').stdout).id, 'B001')
  assert.match(JSON.parse(bugs(dir, 'next', 'B009').stdout).say, /there is no B009/)
  assert.ok(existsSync(join(dir, B.BUGS)))
})
