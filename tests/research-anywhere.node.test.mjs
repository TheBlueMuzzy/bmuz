// F229 — Research, callable anywhere. No Claude, no web: the research flow runs with fake helpers, and every link it
// cites lives on local servers (one page that answers, one that answers 404, one server that never answers), so the
// dead-source drop is proven offline, end to end through the real link test (check-sources.mjs --dead).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import { checkReport, checkSources, deadLinks } from '../plugin/scripts/check-sources.mjs'
import { found, shortLines, stub } from '../plugin/scripts/research.mjs'
import { designTabs, researchReports, writePage } from '../plugin/scripts/gdd.mjs'

const run = promisify(execFile)
const here = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(here, '..', 'plugin')
const CHECKER = `${ROOT}/scripts/check-sources.mjs`
const SCRIPT = readFileSync(join(ROOT, 'workflows', 'research-flow.js'), 'utf8').replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')

// ---- the local web: /ok answers, /gone is a 404; the second server takes the connection and never answers ----
const sockets = new Set()
const web = createServer((req, res) => {
  if (req.url.startsWith('/gone')) { res.writeHead(404); res.end('not here') } else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>ok</title>') }
})
const silent = createServer(() => { /* never answers */ })
for (const s of [web, silent]) s.on('connection', c => { sockets.add(c); c.on('close', () => sockets.delete(c)) })
await new Promise(r => web.listen(0, '127.0.0.1', r))
await new Promise(r => silent.listen(0, '127.0.0.1', r))
const OK = `http://127.0.0.1:${web.address().port}/ok`
const OK2 = `http://127.0.0.1:${web.address().port}/ok-too`
const GONE = `http://127.0.0.1:${web.address().port}/gone`
const HANGS = `http://127.0.0.1:${silent.address().port}/page`
after(() => { for (const c of sockets) c.destroy(); web.close(); silent.close() })

// Runs the flow body with fake helpers; "check links" really runs the command it is given (the engine's exact one).
async function runFlow(args, answer, { linkHelper = 'run' } = {}) {
  const prompts = []
  const logs = []
  const commands = []
  let written = null
  const agent = async (prompt, opts = {}) => {
    prompts.push({ prompt, opts })
    if (/Use the Write tool/.test(prompt)) {
      written = prompt.split('=====\n')[1].replace(/\n$/, '')
      return 'written'
    }
    if (opts.label === 'check links') {
      const command = prompt.split('\n')[1]
      commands.push(command)
      if (linkHelper === 'silent') return null
      assert.ok(E.isLinkCheck(command, ROOT), `the engine lets exactly this through: ${command}`)
      const m = command.match(/^node "([^"]+)" --dead (.*)$/)
      const urls = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])
      const out = await run(process.execPath, [m[1], '--dead', ...urls], { env: { ...process.env, BMUZ_LINK_TIMEOUT_MS: '400', BMUZ_SOURCES_OFFLINE: '' } })
      return { output: out.stdout }
    }
    return answer(prompt, opts)
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const body = new Function('args', 'agent', 'parallel', 'log', 'phase', `return (async () => {\n${SCRIPT}\n})()`)
  const result = await body(args, agent, parallel, m => logs.push(m), () => {})
  return { result, written, prompts, logs, commands }
}

const QUESTION = {
  topic: 'question',
  brief: 'has a co-op garden game where weather helps you been done?',
  game: 'Garden Race: two friends race to grow the best garden; weather cards hurt the other player.',
  date: '2026-11-11',
  place: 'Design · The Rulebook',
  checker: CHECKER,
  out: '.planning/research/research-2026-11-11-weather.md',
}

// Each lens cites the page that answers, the 404 and the silent one; one note rests only on the dead pages.
const lens = id => ({
  notes: [
    { q: 1, says: `${id}: Weather helping both players appears in a few co-op games`, means: 'it has been done', urls: [OK, GONE] },
    { q: 2, says: `${id}: a note resting only on dead pages`, means: 'x', urls: [GONE, HANGS] },
  ],
  bricks: [
    { shelf: 'Examples', text: `${id} game · weather helps everyone · praised`, urls: [OK2] },
    { shelf: 'Examples', text: `${id} dead example`, urls: [HANGS] },
  ],
  assumptions: [],
  open: [],
  onIce: [],
  saturation: 'stopped at 3 sources',
  sources: [{ url: OK, title: 'A page' }, { url: GONE, title: 'Gone page' }, { url: HANGS, title: 'Silent page' }, { url: OK2, title: 'Another page' }],
})
function answer(prompt, opts) {
  const id = (opts.label || '').replace('lens: ', '')
  if (['mainstream', 'extremes', 'outside', 'disconfirm'].includes(id)) return lens(id)
  // the merge cites a dead page too (it only ever sees what was left, but is checked in code anyway)
  return {
    themes: [{ q: 1, theme: 'It has been done', claims: [{ text: 'Weather helping both players appears in a few co-op games', urls: [OK, GONE], interpretation: false }, { text: 'Only dead', urls: [HANGS], interpretation: false }], soWhat: { text: 'helping weather is known ground', urls: [OK] } }],
    bricks: [{ shelf: 'Examples', text: 'Some game · weather helps everyone · praised', urls: [OK2] }],
    contradictions: [], scoreboard: [], surprises: [], open: [], onIce: [], hmw: [],
  }
}

test('F229 task 2: the link test on its own — a page that answers is live; a 404 and a server that never answers are dead', async () => {
  const dead = await deadLinks([OK, GONE, HANGS, 'not a link'], { timeoutMs: 300, tries: 2, waitMs: 10 })
  assert.deepEqual(dead.map(d => d.url).sort(), [GONE, HANGS].sort())
  assert.match(dead.find(d => d.url === GONE).why, /answered 404/)
  assert.match(dead.find(d => d.url === HANGS).why, /no answer after 2 tries/)
  assert.deepEqual(await deadLinks([GONE], { offline: true }), [])
  // from the command line, as the flow's helper runs it: one line of JSON
  const out = await run(process.execPath, [CHECKER, '--dead', OK, GONE], { env: { ...process.env, BMUZ_SOURCES_OFFLINE: '' } })
  assert.deepEqual(JSON.parse(out.stdout.trim()).dead.map(d => d.url), [GONE])
})

test('F229 task 2: the flow drops dead links itself — removed with their [n], what rested only on them listed as "couldn\'t source" — and the source check passes on what\'s left (links tried)', async () => {
  const { result, written, commands, logs } = await runFlow(QUESTION, answer)
  assert.equal(commands.length, 1)
  assert.ok(commands[0].includes(`'${GONE}'`) && commands[0].includes(`'${HANGS}'`) && commands[0].includes(`'${OK}'`))
  const sources = written.split('## Sources')[1]
  assert.ok(sources.includes(OK) && sources.includes(OK2))
  assert.ok(!sources.includes(GONE) && !sources.includes(HANGS), sources)
  assert.match(written, /## Couldn't source\nDead links, dropped: .*answered 404.*no answer after 3 tries/)
  assert.match(written, /- mainstream: a note resting only on dead pages \(its only sources were dead links\)/)
  assert.match(written, /- mainstream dead example \(its only sources were dead links\)/)
  assert.doesNotMatch(written.split("## Couldn't source")[0], /Only dead|dead example|resting only on dead/)
  assert.equal(result.deadLinks, 2)
  assert.ok(logs.some(l => /dropped 2 dead links/.test(l)))
  // the source check, links tried for real on the local servers: nothing left to refuse
  assert.deepEqual(await checkSources(written, { timeoutMs: 300, tries: 2, waitMs: 10 }), [])
})

test('F229 task 2: the "question" topic — the creative\'s words as the brief, the game so far as context; its report says when and where it was asked', async () => {
  const { written, prompts, result } = await runFlow(QUESTION, answer)
  const lens1 = prompts.find(p => p.opts.label === 'lens: mainstream').prompt
  assert.match(lens1, /in the middle of a step they asked a research question/)
  assert.match(lens1, /Their question, in their words: "has a co-op garden game where weather helps you been done\?"/)
  assert.match(lens1, /The game so far: Garden Race: two friends race/)
  assert.match(lens1, /1\. has a co-op garden game where weather helps you been done\?\n2\. Which games or designers have dealt with this/)
  assert.match(lens1, /Examples: "<game, product or case> · what it does about the question · how it went"/)
  assert.match(written, /^# Research: has a co-op garden game where weather helps you been done\?\n\nAsked on 2026-11-11 at Design · The Rulebook\.\n/)
  assert.match(written, /what to do with it is the creative's/)
  assert.match(written, /\n## So what\n/)
  assert.equal(result.wrote, QUESTION.out)
  assert.deepEqual(checkReport(written).problems, [])
})

test('F229 task 2: no checker, or a link helper that gives no answer — nothing is dropped, and the log says the source check will judge the links', async () => {
  const none = await runFlow({ ...QUESTION, checker: undefined }, answer)
  assert.ok(none.logs.some(l => /no link checker was given/.test(l)))
  assert.equal(none.commands.length, 0)
  const silentHelper = await runFlow(QUESTION, answer, { linkHelper: 'silent' })
  assert.ok(silentHelper.logs.some(l => /the link check gave no answer/.test(l)))
  assert.ok(silentHelper.written.split('## Sources')[1].includes(GONE))
})

test('F229 task 2: the engine lets a research helper run exactly the link test — never another command, never outside research', () => {
  const p = { id: 't', version: 1, steps: [
    { id: 'research', kind: 'flow', needs: [], workflow: 'bmuz:research-flow', args: {}, agentTools: ['WebSearch'] },
    { id: 'build', kind: 'flow', needs: ['research'], workflow: 'bmuz:build-flow', args: {}, agentTools: ['Bash'] },
  ] }
  const st = cur => ({ current: cur, status: 'working', finished: [], retries: {}, results: {} })
  const cmd = `node "${CHECKER}" --dead '${OK}' '${GONE}'`
  const judge = (state, command, extra = {}) => E.judgeTool(p, state, { tool: 'Bash', agentId: 'a1', input: { command } }, { dir: '/proj', root: ROOT, ...extra })
  assert.equal(judge(st('research'), cmd).allow, true)
  assert.equal(judge(st('research'), cmd.replace(/\\/g, '/')).allow, true)
  assert.equal(judge(st('research'), `${cmd}; rm -rf .`).allow, false)
  assert.equal(judge(st('research'), `node "${CHECKER}" --dead ${OK}`).allow, false) // unquoted: the shell would read it
  assert.equal(judge(st('research'), `node "/elsewhere/check-sources.mjs" --dead '${OK}'`).allow, false)
  assert.equal(judge(st('build'), cmd).allow, false) // another step's helper: the plugin path is outside the project
  // the creative's own research, running beside any step (F229 task 3)
  assert.equal(judge(st('build'), cmd, { research: { status: 'running' } }).allow, true)
  assert.equal(E.isLinkCheck(`node "${CHECKER}" --dead 'https://a.example/x?y=1&z=2'`, ROOT), true)
  assert.equal(E.isLinkCheck(`node "${CHECKER}" --dead 'https://a.example/x' 'ftp://b'`, ROOT), false)
})

// ---- task 3: what the engine runs around the flow (plugin/scripts/research.mjs) ----
const OUT = '.planning/research/research-2026-11-11-weather.md'
function project() {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-f229-'))
  mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
  return dir
}

test('F229 task 3: the 3 short lines are the first finding of each question in turn, without their [n] and strength marks', async () => {
  const { written } = await runFlow(QUESTION, answer)
  const lines = shortLines(written)
  assert.equal(lines.length, 1) // this report has one finding
  assert.equal(lines[0], 'Weather helping both players appears in a few co-op games')
  const many = '## Findings by question\n### 1. a?\n**T**\n- A one [1] (one source)\n- A two [2] (one source)\n### 2. b?\n- none found: see Open questions\n### 3. c?\n- C one [1][2] (several sources)\n## Bricks\n- not a finding [1] (one source)\n'
  assert.deepEqual(shortLines(many), ['A one', 'C one', 'A two'])
})

test('F229 task 3: found — a report that passes the source check gives its lines (and the page is rebuilt); none, or an unsourced one, is refused plainly', async () => {
  const dir = project()
  try {
    assert.match((await found(dir, OUT, { offline: true })).why, /wrote no report/)
    assert.match((await found(dir, '../x.md', { offline: true })).why, /isn't a research report path/)
    const { written } = await runFlow(QUESTION, answer)
    writeFileSync(join(dir, OUT), written)
    writeFileSync(join(dir, '.planning', 'GDD.md'), '# Garden Race\n')
    const ok = await found(dir, OUT, { offline: true })
    assert.deepEqual(ok, { ok: true, lines: ['Weather helping both players appears in a few co-op games'], out: OUT })
    assert.ok(existsSync(join(dir, '.planning', 'project-page.html')))
    writeFileSync(join(dir, OUT), written.replace(/ \[\d+\](\[\d+\])* \((one source|several sources)\)/, ''))
    assert.match((await found(dir, OUT, { offline: true })).why, /didn't pass the source check/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F229 task 3: the test stand-in is honoured only with BMUZ_TEST=1: copied in as this question\'s report, titled with it', () => {
  const dir = project()
  const stubs = mkdtempSync(join(tmpdir(), 'bmuz-f229-stub-'))
  try {
    writeFileSync(join(stubs, 'question.md'), '# Research: stand-in\n\nAsked on 2000-01-01.\n\nMade by the BMUZ research flow.\n')
    assert.deepEqual(stub(dir, OUT, 'q?', '2026-11-11', 'Design · The Rulebook', { BMUZ_RESEARCH_STUB: stubs }), { ok: true, stub: false })
    const was = process.env.BMUZ_TEST
    process.env.BMUZ_TEST = '1'
    try {
      assert.deepEqual(stub(dir, OUT, 'q?', '2026-11-11', 'Design · The Rulebook', { BMUZ_RESEARCH_STUB: stubs }), { ok: true, stub: true })
    } finally { if (was === undefined) delete process.env.BMUZ_TEST; else process.env.BMUZ_TEST = was }
    assert.equal(readFileSync(join(dir, OUT), 'utf8'), '# Research: q?\n\nAsked on 2026-11-11 at Design · The Rulebook.\n\nMade by the BMUZ research flow.\n')
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(stubs, { recursive: true, force: true }) }
})

test('F229 task 3: every talk step is told research is a step-in (an auto run only where its craft note asks); a typed ask carries the hint', () => {
  const step = { id: 's', kind: 'talk', tools: ['Read'], craft: 'craft/x.md' }
  assert.match(E.talkPrompt(step, 'craft', '', false), /Research, any time: .*mcp__bmuz__research \{"question"/)
  assert.match(E.talkPrompt(step, 'craft', '', true), /Auto run: research only where this step's craft note asks for it/)
  assert.equal(E.soundsLikeResearch("what's the research say about this?"), true)
  assert.equal(E.soundsLikeResearch('has this been done before?'), true)
  assert.equal(E.soundsLikeResearch('make it blue'), false)
  assert.equal(E.soundsLikeResearch('bmuz go'), false)
  assert.equal(E.researchOut('What about Weather?!', '2026-11-11'), '.planning/research/research-2026-11-11-what-about-weather.md')
  const notes = [{ pipeline: 'design', step: 'rules-ask', question: 'q', out: 'o.md', found: ['a', 'b'], answer: 'no change' }, { pipeline: 'define', step: 'rules-ask', question: 'other', out: 'p.md', found: [], answer: '' }]
  assert.match(E.researchNotesFor(notes, 'rules-ask', 'design'), /"q" \(o\.md\): found a · b\. Their answer to "Does it change anything\?": "no change"/)
  assert.doesNotMatch(E.researchNotesFor(notes, 'rules-ask', 'design'), /other/)
  assert.equal(E.researchNotesFor(notes, 'flow', 'design'), '')
})

// ---- task 4: the Sources tab on the project page ----
test('F229 task 4: the project page has a Sources tab — every research report with its question, its date and its sources as links, newest first', async () => {
  const dir = project()
  try {
    const { written } = await runFlow(QUESTION, answer)
    writeFileSync(join(dir, OUT), written)
    // a stage's own research (Define's prior art), dated by its file; a report with no Sources list is not research
    const prior = ['# Discover (prior art): a garden race', '', '## Findings by question', '- x [1] (one source)', '', '## Sources', '1. BoardGameGeek: Cascadia — https://boardgamegeek.com/boardgame/295947', '']
    const priorPath = join(dir, '.planning', 'research', 'define-prior-art.md')
    writeFileSync(priorPath, prior.join(String.fromCharCode(10)))
    utimesSync(priorPath, new Date('2026-11-12T10:00:00Z'), new Date('2026-11-12T10:00:00Z')) // (dated by its file: the day after)
    writeFileSync(join(dir, '.planning', 'research', 'define-lock.md'), '**Concept Lock**')
    const reports = researchReports(dir)
    assert.deepEqual(reports.map(r => [r.file, r.question, r.date]), [
      ['define-prior-art.md', 'Discover (prior art): a garden race', '2026-11-12'],
      [OUT.split('/').pop(), QUESTION.brief, '2026-11-11'],
    ])
    assert.equal(reports.find(r => r.file === 'define-prior-art.md').sources[0].url, 'https://boardgamegeek.com/boardgame/295947')
    const mine = reports.find(r => r.file === OUT.split('/').pop())
    assert.equal(mine.date, '2026-11-11')
    assert.deepEqual(mine.sources.map(s => s.url).sort(), [OK, OK2].sort())
    const tab = designTabs(dir).find(t => t.id === 'sources')
    assert.equal(tab.title, 'Sources')
    assert.match(tab.html, /<h3>has a co-op garden game where weather helps you been done\?<\/h3><p class="holds">2026-11-11 · <a href="research\/research-2026-11-11-weather\.md">/)
    assert.ok(tab.html.includes(`<a href="${OK}" target="_blank" rel="noopener">`))
    assert.ok(!tab.html.includes('define-lock'))
    writeFileSync(join(dir, '.planning', 'GDD.md'), '# Garden Race\n')
    writePage(dir)
    const page = readFileSync(join(dir, '.planning', 'project-page.html'), 'utf8')
    assert.match(page, /<a href="#sources">Sources<\/a>/)
    assert.match(page, /<h2 id="sources">Sources<\/h2>/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
