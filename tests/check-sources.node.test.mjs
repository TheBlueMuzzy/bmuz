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

// The discover report format (discover-research.md section 5): every section, in order.
const GOOD = `# Discover: screen shake

Made by the BMUZ research flow.

## Question
- Brief as said: punchy screen shake
- Goal underneath: hits that feel heavy

## Research questions
1. What makes shake feel punchy?

## Findings by question
### 1. What makes shake feel punchy?
**Short and strong**
- Short, strong shakes read as impact. [1][2] (several sources)
- A shake longer than a beat reads as an earthquake. [1] (interpretation only)

## Bricks
### Verbs
- shake → show a hit landed [1][2] (several sources)
### Nouns
- none on this shelf

## Contradictions
- none found

## Assumption scoreboard
1 supported · 0 contradicted · 1 no evidence
- Supported: "more shake is more punch" — up to a point [2]
- No evidence: "players turn it off"

## Surprises
- Film editors cut on the hit frame. [2]

## Open questions → probes
- How much is too much on a phone? → sketch

## On ice
- trauma-based shake (from the creative)

## So what (draft for Define)
- Short and strong: impact comes from timing more than size, which matters for a phone screen [1]

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
    .replace('- Short, strong shakes read as impact. [1][2] (several sources)', '- Short, strong shakes read as impact. (several sources)\n- Long games drag. [7] (one source)\n- Shake hides the hit. [1]')
    .replace('2. Page two — http://example.org/two', '2. Page two — example.org/two')
  const problems = checkReport(bad).problems
  const has = re => assert.ok(problems.some(p => re.test(p)), `${re}\n${problems.join('\n')}`)
  has(/"- Short, strong shakes read as impact\. \(several sources\)" \(under "Findings by question"\) cites no source/)
  has(/"- Shake hides the hit\. \[1\]" \(under "Findings by question"\) has no strength mark/)
  has(/\[7\] is cited .* but there is no source 7/)
  has(/source 2 \("Page two — example\.org\/two"\) has no http\(s\) link/)
  assert.equal(problems.length, 4)
})

test('source check: surprises, contradictions, "so what" and the scoreboard\'s supported / contradicted lines cite; "none" and "no evidence" need nothing', () => {
  const one = (from, to) => checkReport(GOOD.replace(from, to)).problems
  assert.match(one('hit frame. [2]', 'hit frame.')[0], /under "Surprises"\) cites no source/)
  assert.match(one('- none found', '- A says long, B says short')[0], /under "Contradictions"\) cites no source/)
  assert.match(one('a phone screen [1]', 'a phone screen')[0], /under "So what \(draft for Define\)"\) cites no source/)
  assert.match(one('up to a point [2]', 'up to a point')[0], /under "Assumption scoreboard"\) cites no source/)
  assert.deepEqual(one('- Supported: "more shake is more punch" — up to a point [2]', '- Contradicted: "x" — y [2]'), [])
  // F217: a brick is held to a finding's rule: a source and a strength mark
  assert.match(one('show a hit landed [1][2] (several sources)', 'show a hit landed (several sources)')[0], /under "Bricks"\) cites no source/)
  assert.match(one('show a hit landed [1][2] (several sources)', 'show a hit landed [1]')[0], /under "Bricks"\) has no strength mark/)
})

test('source check: every section is there, in order; findings are not empty', () => {
  const noSurprises = GOOD.replace(/## Surprises\n[^\n]*\n\n/, '')
  assert.match(checkReport(noSurprises).problems.join('\n'), /no "## Surprises" section/)
  const swapped = GOOD.replace('## On ice', '## TEMP').replace('## Open questions → probes', '## On ice').replace('## TEMP', '## Open questions → probes')
  assert.match(checkReport(swapped).problems.join('\n'), /sections are out of order/)
  const empty = GOOD.replace(/### 1\.[\s\S]*?\(interpretation only\)\n/, '- none found\n')
  assert.match(checkReport(empty).problems.join('\n'), /"Findings by question" has no findings/)
  assert.match(checkReport('## Summary\n- a thing [1]\n').problems.join('\n'), /no "## Question", "## Research questions".*"## Sources" sections/)
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
    assert.match(out, /✘ bad\.md: 1 source problem\n {2}- "- Short and strong: impact .*" .* cites no source/)
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
