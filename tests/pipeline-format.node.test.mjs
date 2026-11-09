// No-Claude test of the pipeline file check (docs/pipeline-format.md): every rule refuses its broken file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import { checkFile } from '../plugin/scripts/check-pipeline.mjs'

const HELLO = JSON.parse(readFileSync(new URL('../plugin/pipelines/hello.json', import.meta.url), 'utf8'))
const copy = () => structuredClone(HELLO)
const step = (p, id) => p.steps.find(s => s.id === id)
// One broken file in, the problems out; asserts one of them says `want`.
const refuses = (p, want) => {
  const problems = E.checkPipeline(p)
  assert.ok(problems.some(x => want.test(x)), `expected a problem like ${want}, got: ${JSON.stringify(problems)}`)
}

test('the shipped pipelines pass, files included', () => {
  assert.deepEqual(E.checkPipeline(HELLO), [])
  assert.deepEqual(checkFile(fileURLToPath(new URL('../plugin/pipelines/hello.json', import.meta.url))), [])
  // F217: the discover pipeline (a "script-ok" done-check, the research flow pre-approved for auto runs)
  assert.deepEqual(checkFile(fileURLToPath(new URL('../plugin/pipelines/discover.json', import.meta.url))), [])
})

test('a "script-ok" check naming a {plugin} script that is missing is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-pipe-'))
  try {
    const p = JSON.parse(readFileSync(new URL('../plugin/pipelines/discover.json', import.meta.url), 'utf8'))
    p.id = 'gone'
    p.steps.find(s => s.id === 'research').done.run[1] = '{plugin}/scripts/no-such-check.mjs'
    writeFileSync(join(dir, 'gone.json'), JSON.stringify(p))
    assert.ok(checkFile(join(dir, 'gone.json')).some(x => /the script scripts\/no-such-check\.mjs is missing/.test(x)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the whole file: not an object, no steps, wrong version, unknown or bad top settings', () => {
  assert.deepEqual(E.checkPipeline(null), ['the pipeline file is not a JSON object'])
  assert.deepEqual(E.checkPipeline([]), ['the pipeline file is not a JSON object'])
  refuses({ ...copy(), steps: [] }, /no steps list/)
  refuses({ ...copy(), version: 2 }, /"version" must be 1/)
  refuses({ ...copy(), version: undefined }, /"version" must be 1/)
  refuses({ ...copy(), id: 'Hello World' }, /needs an "id"/)
  refuses({ ...copy(), stpes: [] }, /unknown setting "stpes"/)
  refuses({ ...copy(), watchdogMs: -5 }, /"watchdogMs" must be/)
  refuses({ ...copy(), watchdogMs: '20 min' }, /"watchdogMs" must be/)
})

test('steps: ids, kinds, order, typos', () => {
  let p = copy(); step(p, 'plan').id = 'name'; refuses(p, /"name" is used twice/)
  p = copy(); step(p, 'plan').id = 'Plan Step'; refuses(p, /needs an "id"/)
  p = copy(); step(p, 'plan').kind = 'dance'; refuses(p, /kind "dance" is not one of/)
  p = copy(); step(p, 'name').needs = ['review']; refuses(p, /needs "review", which is not an earlier step/)
  p = copy(); step(p, 'name').needs = 'nothing'; refuses(p, /"needs" must be a list/)
  p = copy(); step(p, 'name').need = ['x']; refuses(p, /unknown setting "need"/)
  p = copy(); step(p, 'approve').tools = ['Read']; refuses(p, /\(gate\) has an unknown setting "tools"/)
  p = copy(); step(p, 'plan').timeoutMs = 0; refuses(p, /"timeoutMs" must be/)
  p = copy(); p.steps.push('oops'); refuses(p, /step 6 is not an object/)
})

test('talk steps need tools and a craft note', () => {
  let p = copy(); delete step(p, 'name').tools; refuses(p, /needs "tools"/)
  p = copy(); step(p, 'name').tools = 'Read'; refuses(p, /needs "tools"/)
  p = copy(); delete step(p, 'review').craft; refuses(p, /needs a "craft" note/)
  p = copy(); step(p, 'review').craft = '../../secrets.md'; refuses(p, /"craft" must be a .md file inside the plugin/)
  p = copy(); step(p, 'review').craft = 'craft/review.txt'; refuses(p, /"craft" must be a .md file/)
})

test('gates need a question, 2+ different options, and an earlier backTo', () => {
  let p = copy(); delete step(p, 'approve').question; refuses(p, /needs a "question"/)
  p = copy(); step(p, 'approve').options = ['Approve']; refuses(p, /needs 2 or more "options"/)
  p = copy(); step(p, 'approve').options = ['Yes', 'Yes']; refuses(p, /same words/)
  p = copy(); delete step(p, 'approve').approve; refuses(p, /needs "approve"/)
  p = copy(); step(p, 'approve').approve = 'Yes please'; refuses(p, /needs "approve"/)
  p = copy(); step(p, 'approve').options = ['Approve', 'Change the name']; refuses(p, /"Approve" can't be the first option; a stray Enter/)
  p = copy(); step(p, 'approve').backTo = 'review'; refuses(p, /"backTo" "review" is not an earlier step/)
})

test('script and flow steps need what they run', () => {
  let p = copy(); delete step(p, 'plan').run; refuses(p, /needs "run"/)
  p = copy(); step(p, 'plan').run = 'node x.mjs'; refuses(p, /needs "run"/)
  p = copy(); step(p, 'hello').workflow = 'hello-flow'; refuses(p, /needs "workflow" as plugin:name/)
  p = copy(); step(p, 'hello').args = ['x']; refuses(p, /"args" must be an object/)
  p = copy(); step(p, 'hello').agentTools = 'Write'; refuses(p, /"agentTools" must be a list/)
})

test('done-checks: known types, their settings, only talk hands back a result', () => {
  let p = copy(); step(p, 'plan').done = { type: 'file-exists', path: 'plan.json' }; refuses(p, /type "file-exists" is not one of/)
  p = copy(); step(p, 'plan').done = { type: 'file-json-has', path: 'plan.json' }; refuses(p, /needs "key"/)
  p = copy(); step(p, 'plan').done = { type: 'file-json-has', path: 'plan.json', key: 'name', extra: 1 }; refuses(p, /unknown setting "extra"/)
  p = copy(); step(p, 'plan').done = { type: 'result-has', key: 'x' }; refuses(p, /only talk steps hand back a result/)
  p = copy(); step(p, 'plan').done.path = '../plan.json'; refuses(p, /path "..\/plan.json" must stay inside the project/)
})

test('writes: files the engine checkpoints and may delete stay inside the project', () => {
  for (const bad of ['../x.json', '/etc/passwd', 'C:/Windows/x', 'a\\b.json', '.bmuz/state.json', 'a//b', './x']) {
    const p = copy(); step(p, 'plan').writes = [bad]
    refuses(p, /must stay inside the project/)
  }
  let p = copy(); step(p, 'plan').writes = ['{name}.json']; refuses(p, /can't use \{holes\}/)
  p = copy(); step(p, 'plan').writes = 'plan.json'; refuses(p, /"writes" must be a list/)
  for (const good of ['plan.json', 'docs/plan.json', 'a-b/c_d.v2.json']) assert.equal(E.isSafePath(good), true, good)
})

test('{holes} must name the project, the plugin, or a result from a talk step this step needs', () => {
  let p = copy(); step(p, 'plan').run = ['node', '{plugin}/scripts/write-plan.mjs', '{project}', '{nmae}']; refuses(p, /\{nmae\} isn't known here/)
  p = copy(); step(p, 'approve').question = 'Approve {verdict}?'; refuses(p, /\{verdict\} isn't known here/)
  // reached through a gate: approve needs name, plan needs approve -> {name} is known in plan
  assert.deepEqual(E.checkPipeline(copy()), [])
})

test('the engine re-checks a filled path before reading it (a result can carry "../")', () => {
  const s = { id: 'x', kind: 'script', done: { type: 'file-contains', path: '{name}.html', text: 'hi' } }
  assert.deepEqual(E.checkFiles(s, { name: '../../outside' }), [])
  assert.match(E.doneCheck(s, { name: '../../outside' }, { files: {} }).why, /outside the project/)
})

test('the command line: exit 0 for good files, exit 1 with plain words for broken ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-pipe-'))
  try {
    const script = fileURLToPath(new URL('../plugin/scripts/check-pipeline.mjs', import.meta.url))
    assert.match(execFileSync('node', [script], { encoding: 'utf8' }), /✔ hello.json/)
    const p = copy(); p.id = 'broken'; step(p, 'hello').workflow = 'bmuz:no-such-flow'; step(p, 'review').craft = 'craft/gone.md'
    const file = join(dir, 'broken.json')
    writeFileSync(file, JSON.stringify(p))
    let out = ''
    assert.throws(() => execFileSync('node', [script, file], { encoding: 'utf8' }), e => { out = e.stdout; return e.status === 1 })
    assert.match(out, /✘ broken.json: 3 problems/)
    assert.match(out, /add "Workflow\(bmuz:no-such-flow\)" to settings\/auto-run.json/)
    assert.match(out, /workflow bmuz:no-such-flow has no file workflows\/no-such-flow.js/)
    assert.match(out, /craft note craft\/gone.md is missing/)
    writeFileSync(join(dir, 'other.json'), JSON.stringify(copy()))
    assert.throws(() => execFileSync('node', [script, join(dir, 'other.json')], { encoding: 'utf8' }), e => /must match its file name "other"/.test(e.stdout))
    writeFileSync(join(dir, 'junk.json'), '{ not json')
    assert.throws(() => execFileSync('node', [script, join(dir, 'junk.json')], { encoding: 'utf8' }), e => /can't be read as JSON/.test(e.stdout))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
