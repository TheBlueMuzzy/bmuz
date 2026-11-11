// F215 task 4: the bug pipeline's scripts (bugs.mjs pick / repro / verify / hits-fail / hits-pass / record), run for real
// on the bug-garden fixture (tests/fixtures/bug-garden: the final score skips the first row, the full-row bonus copies
// the mistake), in a temporary git repository. No Claude: the test and fix steps are written by the test itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  // (review fix 2a: whether there is anything to fix comes from the hits themselves, never a separate flag)
  const mf = P.steps.find(s => s.id === 'matching-fix')
  assert.equal(mf.when, '{hits}')
  assert.deepEqual(P.steps.find(s => s.id === 'matching').results, ['hits'])
  assert.equal(E.isWanted(mf, { hits: [{ where: 'src/bonus.js:4', action: 'fix', test: 't' }], fixhits: 'no' }), true)
  assert.equal(E.isWanted(mf, { hits: [] }), false)
  assert.equal(E.isWanted({ when: '{x}' }, { x: [{ text: 'no' }] }), false) // (a list of answers still reads its first one)
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
  const results = { cause: { cause: 'finalScore and its loop start at row 1, so the first row is never counted (src/score.js).', repeat: 'none', rule: 'every row counts, starting from the first (index 0)' }, fix: { files: ['src/score.js'] }, matching: { hits }, 'matching-fix': { alsoFiles: ['src/bonus.js'] } }
  // (review fix 2b: record runs every proof again right before it commits; any red is refused, nothing committed)
  const head = git(dir, 'rev-parse', 'HEAD').stdout
  const before = read(dir, 'tests/b001-also-bonus.test.mjs')
  writeFileSync(join(dir, 'tests/b001-also-bonus.test.mjs'), before.replace('), 2)', '), 2, "x")'))
  setResults(dir, results, { bug: 'B001' })
  assert.match(bugs(dir, 'record').stdout, /b001-also-bonus\.test\.mjs: the test changed after it was shown failing/)
  writeFileSync(join(dir, 'tests/b001-also-bonus.test.mjs'), before)
  setResults(dir, { ...results, matching: { hits: [...hits, { where: 'src/score.js:9', action: 'fix', test: 'tests/garden.test.mjs' }] } }, { bug: 'B001' })
  assert.match(bugs(dir, 'record').stdout, /src\/score\.js:9 has no test shown failing first/)
  writeFileSync(join(dir, 'tests/zz-red.test.mjs'), "import { test } from 'node:test'\ntest('red', () => { throw new Error('red') })\n")
  setResults(dir, results, { bug: 'B001' })
  assert.match(bugs(dir, 'record').stdout, /"npm test" fails/)
  rmSync(join(dir, 'tests/zz-red.test.mjs'))
  assert.equal(git(dir, 'rev-parse', 'HEAD').stdout, head)
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

// Review fix 4: "reproduced" only when the runner ran the named test and reported it failing; anything else refused.
test('a top-level throw, a file with no tests, a hung test or a runner that is not there is never "reproduced"', () => {
  const dir = garden()
  bugs(dir, 'add', JSON.stringify({ report: { title: 'Final score misses the first row', level: 'P1' } }))
  setResults(dir, {}, { bug: 'B001' })
  assert.equal(bugs(dir, 'pick').status, 0)
  const t = 'tests/b001-x.test.mjs'
  const tryIt = (body, env = {}) => { writeFileSync(join(dir, t), body); return spawnSync(process.execPath, [join(plugin, 'scripts', 'bugs.mjs'), 'repro', t], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } }) }
  let r = tryIt("throw new Error('boom at the top')\n")
  assert.equal(r.status, 1)
  assert.match(r.stdout, /no test in .* ran and failed/)
  r = tryIt("console.log('nothing to test')\n")
  assert.equal(r.status, 1)
  assert.match(r.stdout, /passes|no test in .* ran/)
  r = tryIt("import { test } from 'node:test'\ntest('hangs', async () => { await new Promise(r => setTimeout(r, 60000)) })\n", { BMUZ_BUG_TEST_MS: '3000' })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /didn't finish in 3 s/)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'vitest' } }))
  r = tryIt("import { test } from 'node:test'\ntest('x', () => { throw new Error('x') })\n")
  assert.equal(r.status, 1)
  assert.match(r.stdout, /no test in .* ran and failed|couldn't run/)
  assert.equal(B.failedTests([process.execPath, '--test'], { exitCode: 1, all: 'not ok 1 - every row counts\n# fail 1' }).length, 1)
  assert.equal(B.failedTests([process.execPath, '--test'], { exitCode: 1, all: 'not ok 1 - tests\\b001-x.test.mjs\n# fail 1' }).length, 0)
  assert.equal(B.failedTests(['npx', 'vitest'], { exitCode: 1, all: ' Tests  2 failed | 1 passed (3)' }).length, 2)
  assert.equal(B.failedTests(['npx', 'vitest'], { exitCode: 1, all: 'No test files found, exiting with code 1' }).length, 0)
})

// Review fix 5: a commit takes only files (never a folder) that this run changed; a file the creative had changed
// before the run is left out, and the closing line says so.
test('the fix commit leaves out a folder and a file with the creative\'s own unsaved changes, and says so', () => {
  const dir = garden()
  bugs(dir, 'add', JSON.stringify({ report: { title: 'Final score misses the first row', level: 'P2' } }))
  writeFileSync(join(dir, 'src/bonus.js'), read(dir, 'src/bonus.js') + '// my own note: bonus might go up to 3\n')
  setResults(dir, {}, { bug: 'B001' })
  assert.equal(bugs(dir, 'pick').status, 0)
  writeFileSync(join(dir, 'tests/b001-first-row.test.mjs'), REPRO)
  assert.equal(bugs(dir, 'repro', 'tests/b001-first-row.test.mjs').status, 0)
  writeFileSync(join(dir, 'src/score.js'), read(dir, 'src/score.js').replace('let i = 1', 'let i = 0'))
  assert.equal(bugs(dir, 'verify').status, 0)
  const hits = [{ where: 'src/bonus.js:4', what: 'the same loop', action: 'fix', test: 'tests/b001-also-bonus.test.mjs' }]
  writeFileSync(join(dir, 'tests/b001-also-bonus.test.mjs'), HIT)
  assert.equal(bugs(dir, 'hits-fail', JSON.stringify(hits)).status, 0)
  writeFileSync(join(dir, 'src/bonus.js'), read(dir, 'src/bonus.js').replace('let i = 1', 'let i = 0'))
  assert.equal(bugs(dir, 'hits-pass').status, 0)
  setResults(dir, { cause: { cause: 'the loop starts at row 1', repeat: 'none', rule: 'count from row 0' }, fix: { files: ['src', 'src/score.js'] }, matching: { hits }, 'matching-fix': { alsoFiles: ['src/bonus.js', '.'] } }, { bug: 'B001' })
  const r = bugs(dir, 'record')
  assert.equal(r.status, 0, r.stdout)
  const inFix = git(dir, 'show', '--name-only', '--format=', 'HEAD~1').stdout.split('\n').filter(Boolean).sort()
  assert.deepEqual(inFix, ['.planning/BUGS.md', '.planning/STATE.md', 'src/score.js', 'tests/b001-also-bonus.test.mjs', 'tests/b001-first-row.test.mjs'])
  assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=all', '--', '.', ':!.bmuz').stdout.trim(), 'M src/bonus.js')
  assert.match(read(dir, B.SAY.done), /· You had unsaved changes in src\/bonus\.js, so I left it out of the commit: the fix is in it too\./)
  assert.deepEqual(B.commitFiles(dir, ['src'], 'x'), { nothing: true })
})
