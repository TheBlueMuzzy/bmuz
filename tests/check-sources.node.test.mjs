// No-network test of the source check (plugin/scripts/check-sources.mjs) and the "script-ok" done-check
// that runs it. Links are answered by a fake fetch; the command-line run uses --offline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import { checkReport, checkSources, linkAnswers } from '../plugin/scripts/check-sources.mjs'

const GOOD = `# Research: seeds

Made by the BMUZ research flow. Every finding cites its sources [n].

## Summary
- Trading games shine when both players gain. [1][2]

## Reference games — what works, what is missing
- Players praise quick turns. [1]

## Sources
1. Page one — https://example.com/one
2. Page two — http://example.org/two
`

// A fake fetch: url -> status, or 'down' (no answer). Counts the calls per url.
function fakeFetch(map) {
  const calls = {}
  const fn = async (url, opts) => {
    calls[url] = (calls[url] || 0) + 1
    const v = map[url]
    if (v === 'down' || v === undefined) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    if (typeof v === 'object') return { status: v[opts.method] }
    return { status: v }
  }
  return { fn, calls }
}
const fast = f => ({ fetchFn: f.fn, waitMs: 0 })

test('source check: a good report passes, links answered', async () => {
  const f = fakeFetch({ 'https://example.com/one': 200, 'http://example.org/two': 301 })
  assert.deepEqual(await checkSources(GOOD, fast(f)), [])
  assert.deepEqual(checkReport(GOOD).links, [{ n: 1, url: 'https://example.com/one' }, { n: 2, url: 'http://example.org/two' }])
})

test('source check: each broken rule is named', async () => {
  const bad = GOOD
    .replace('- Players praise quick turns. [1]', '- Players praise quick turns.\n- Long games drag. [7]')
    .replace('2. Page two — http://example.org/two', '2. Page two — example.org/two')
  const problems = checkReport(bad).problems
  assert.ok(problems.some(p => /"- Players praise quick turns\." \(under "Reference games.*"\) cites no source/.test(p)), problems.join('\n'))
  assert.ok(problems.some(p => /\[7\] is cited .* but there is no source 7/.test(p)), problems.join('\n'))
  assert.ok(problems.some(p => /source 2 \("Page two — example\.org\/two"\) has no http\(s\) link/.test(p)), problems.join('\n'))
  assert.equal(problems.length, 3)
  // an unsourced summary line is caught too, and so is a report with no Sources list
  assert.ok(checkReport(GOOD.replace('gain. [1][2]', 'gain.')).problems.some(p => /under "Summary"\) cites no source/.test(p)))
  assert.ok(checkReport('## Summary\n- a thing [1]\n').problems.some(p => /no "## Sources" list/.test(p)))
})

test('source check: a dead link is named — a 404, or no answer after 3 tries', async () => {
  const f = fakeFetch({ 'https://example.com/one': 404, 'http://example.org/two': 'down' })
  const problems = await checkSources(GOOD, fast(f))
  assert.match(problems[0], /source 1 \(https:\/\/example\.com\/one\) is a dead link: answered 404/)
  assert.match(problems[1], /source 2 \(http:\/\/example\.org\/two\) is a dead link: no answer after 3 tries \(ENOTFOUND\)/)
  assert.equal(f.calls['http://example.org/two'], 3)
})

test('source check: a site that refuses robots (403, 429, 503) still counts as answered; a bad HEAD falls back to GET', async () => {
  for (const status of [401, 403, 429, 503]) assert.equal(await linkAnswers('https://x.test/', fast(fakeFetch({ 'https://x.test/': status }))), null, String(status))
  assert.equal(await linkAnswers('https://x.test/', fast(fakeFetch({ 'https://x.test/': { HEAD: 405, GET: 200 } }))), null)
  assert.match(await linkAnswers('https://x.test/', fast(fakeFetch({ 'https://x.test/': { HEAD: 200, GET: 404 } }))) ?? 'answered', /answered/) // HEAD said fine: no GET needed
  assert.match(await linkAnswers('https://x.test/', fast(fakeFetch({ 'https://x.test/': { HEAD: 404, GET: 410 } }))), /410/)
})

test('source check from the command line: exit 0 on a good report (offline), 1 with the problems listed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-sources-'))
  const script = fileURLToPath(new URL('../plugin/scripts/check-sources.mjs', import.meta.url))
  try {
    writeFileSync(join(dir, 'good.md'), GOOD)
    writeFileSync(join(dir, 'bad.md'), GOOD.replace(' [1]\n\n## Sources', '\n\n## Sources'))
    assert.match(execFileSync('node', [script, 'good.md', '--offline'], { cwd: dir, encoding: 'utf8' }), /✔ good\.md: every claim cites a source/)
    let out = ''
    try { execFileSync('node', [script, 'bad.md', '--offline'], { cwd: dir, encoding: 'utf8' }) } catch (err) { out = err.stdout; assert.equal(err.status, 1) }
    assert.match(out, /✘ bad\.md: 1 source problem\n {2}- "- Players praise quick turns\." .* cites no source/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('done-check "script-ok": passes on exit 0, fails with the command\'s words, holes filled; the pipeline check knows it', () => {
  const step = { id: 'research', kind: 'flow', workflow: 'bmuz:research-flow', done: { type: 'script-ok', run: ['node', '{plugin}/scripts/check-sources.mjs', 'r.md'] } }
  assert.deepEqual(E.checkRun(step, { plugin: '/p' }), ['node', '/p/scripts/check-sources.mjs', 'r.md'])
  assert.deepEqual(E.checkRun({ id: 'x', done: { type: 'result-has', key: 'k' } }, {}), null)
  assert.equal(E.doneCheck(step, {}, { ran: { exitCode: 0, stdout: 'fine' } }).ok, true)
  const no = E.doneCheck(step, {}, { ran: { exitCode: 1, stdout: '✘ r.md: 1 source problem\n  - source 1 is a dead link' } })
  assert.equal(no.ok, false)
  assert.match(no.why, /the check node check-sources\.mjs said: ✘ r\.md: 1 source problem/)
  assert.match(E.doneCheck(step, {}, {}).why, /did not run/)
  const p = { id: 'x', version: 1, steps: [step] }
  assert.deepEqual(E.checkPipeline(p), [])
  assert.ok(E.checkPipeline({ ...p, steps: [{ ...step, done: { type: 'script-ok' } }] }).some(x => /needs "run"/.test(x)))
  assert.ok(E.checkPipeline({ ...p, steps: [{ ...step, done: { type: 'script-ok', run: ['node', '{nope}'] } }] }).some(x => /\{nope\} isn't known/.test(x)))
})
