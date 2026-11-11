// F216 review fix 2a: the builder helper has no Bash; it runs only a fixed list through the engine's run tool
// (plugin/scripts/run.mjs): the test command, check:fast, npm install, Playwright screenshots. No git, no free commands.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as R from '../plugin/scripts/run.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const pkg = { scripts: { test: 'node --test', 'check:fast': 'node --test' }, devDependencies: { playwright: '1.0.0' } }

test('the run tool takes only its fixed list, each checked', () => {
  assert.deepEqual(R.commandFor('test', [], pkg).argv, ['npm', 'test'])
  assert.deepEqual(R.commandFor('test', ['tests/a.test.mjs'], pkg).argv.slice(1), ['--test', 'tests/a.test.mjs'])
  assert.match(R.commandFor('test', ['../x.mjs'], pkg).error, /isn't a test file in the project/)
  assert.match(R.commandFor('test', ['a.mjs; rm -rf .'], pkg).error, /isn't a test file/)
  assert.deepEqual(R.commandFor('check', [], pkg).argv, ['npm', 'run', 'check:fast'])
  assert.match(R.commandFor('check', [], {}).error, /no "check:fast"/)
  assert.deepEqual(R.commandFor('install', [], pkg).argv, ['npm', 'install'])
  assert.match(R.commandFor('install', ['left-pad'], pkg).error, /takes no arguments/)
  assert.deepEqual(R.commandFor('screenshot', ['http://localhost:5173/', '.planning/screens/F01-phone.png', 'phone'], pkg).argv.slice(3), ['screenshot', '--viewport-size=390,844', 'http://localhost:5173/', '.planning/screens/F01-phone.png'])
  assert.match(R.commandFor('screenshot', ['https://evil.test/', '.planning/screens/a.png', 'phone'], pkg).error, /localhost/)
  assert.match(R.commandFor('screenshot', ['http://localhost:5173/', 'src/a.png', 'phone'], pkg).error, /\.planning\/screens/)
  assert.match(R.commandFor('screenshot', ['http://localhost:5173/', '.planning/screens/a.png', 'phone'], {}).error, /no Playwright/)
  for (const w of ['git', 'bash', 'node', 'push']) assert.match(R.commandFor(w, [], pkg).error, /isn't one of: test, check, install, screenshot/)
})

test('it runs in the project and reports its exit and the files the run changed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-run-'))
  for (const args of [['init', '-q'], ['config', 'user.email', 't@e.com'], ['config', 'user.name', 't']]) spawnSync('git', args, { cwd: dir })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test' } }))
  mkdirSync(join(dir, 'tests'))
  writeFileSync(join(dir, 'tests/a.test.mjs'), "import { test } from 'node:test'\nimport { writeFileSync } from 'node:fs'\ntest('writes', () => { writeFileSync('made.txt', 'x') })\n")
  spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-qm', 'x'], { cwd: dir })
  const r = spawnSync(process.execPath, [join(here, '..', 'plugin', 'scripts', 'run.mjs'), 'test', 'tests/a.test.mjs'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } })
  const last = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.equal(last.exitCode, 0)
  assert.deepEqual(last.changed, ['made.txt'])
  const no = spawnSync(process.execPath, [join(here, '..', 'plugin', 'scripts', 'run.mjs'), 'git', 'push'], { cwd: dir, encoding: 'utf8' })
  assert.match(no.stdout, /isn't one of/)
  assert.equal(JSON.parse(no.stdout.trim().split('\n').pop()).exitCode, 2)
  void readFileSync
})
