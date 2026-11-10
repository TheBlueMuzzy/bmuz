// No-Claude tests of Ideate (F228): the game so far per need (fixed · ideas · open), every quote checked against the
// creative's real words, IDEATE.md as DISCOVER.md's successor (Define's digest reads it first), the reading script,
// and the engine's two new step settings ("show" and "when").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import { BY, NEED_KEYS, answersFrom, checkSoFar, freshIdeate, ideateRun, markAnswered, mergeSoFar, screen } from '../plugin/scripts/ideate-doc.mjs'
import { mergeDoc } from '../plugin/scripts/discover-doc.mjs'
import { readShelves, sourceDoc } from '../plugin/scripts/define-doc.mjs'
import { digest } from '../plugin/scripts/define-digest.mjs'
import { kindOf } from '../plugin/scripts/ideate-fetch.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const scripts = join(here, '..', 'plugin', 'scripts')
const XONG = 'Basically, standard pong, but xong has some weird things that happen based on each players score. since the scores are on the screen, they become interactive. 0s are portals, when you have a 1, you move both your 1 and your paddle (they move in opposite directions). 2-10 all have other abilities.'
const his = text => ({ text, his: true })

test('the needs: frame first, nine plus "also"', () => {
  assert.deepEqual(NEED_KEYS, ['frame', 'loop', 'things', 'rules', 'decisions', 'feel', 'change', 'smallest', 'look', 'also'])
})

test('every quote is checked: found in the material, found in their answers, or kept as Claude\'s reading', () => {
  const sofar = {
    loop: { fixed: [his('standard pong')], ideas: [his('0s are portals')], open: ['How does a rally end?'] },
    rules: { ideas: [his('2-10 all have other abilities.'), his('the ball bounces off the middle line')], open: [] },
    frame: { fixed: [his('online against a friend')] },
    nonsense: { fixed: ['something'] },
  }
  const { needs, notQuoted } = checkSoFar(sofar, XONG, ['local against AI and also online against a friend. no local'])
  assert.deepEqual(needs.loop.fixed, [{ text: 'standard pong', by: BY.material }])
  assert.deepEqual(needs.loop.open, [{ text: 'How does a rally end?', by: BY.open }])
  assert.deepEqual(needs.frame.fixed, [{ text: 'online against a friend', by: BY.answer }])
  // a "his" quote that isn't in their words is Claude's reading, never theirs
  assert.deepEqual(needs.rules.ideas[1], { text: 'the ball bounces off the middle line', by: BY.claude })
  assert.equal(notQuoted, 1)
  assert.deepEqual(needs.also.fixed, [{ text: 'something', by: BY.claude }]) // an unknown need goes to "also"
})

test('version 2 = version 1 + what the answers added, minus the open questions they settled', () => {
  const v1 = checkSoFar({ rules: { open: ['How does a match end?', 'What do 2-10 do?'] }, frame: { fixed: [his('online against a friend')] } }, XONG, ['online against a friend']).needs
  const add = checkSoFar({ rules: { fixed: [his('first to 11')] }, frame: { fixed: [his('online against a friend')] } }, XONG, ['first to 11', 'online against a friend']).needs
  const v2 = mergeSoFar(v1, add, ['How does a match end?'])
  assert.deepEqual(v2.rules.fixed.map(x => x.text), ['first to 11'])
  assert.deepEqual(v2.rules.open.map(x => x.text), ['What do 2-10 do?'])
  assert.equal(v2.frame.fixed.length, 1) // the same item twice is one
})

test('the screen: per need, their words in quotes, my reading marked; version 2 names the open questions that matter', () => {
  const needs = checkSoFar({ loop: { fixed: [his('standard pong')], ideas: ['the score digits are on the court'] } }, XONG, []).needs
  const v1 = screen({ needs, brief: 'Xong', version: 1, read: 'pasted text' })
  assert.match(v1, /^## The game so far — Xong \(version 1: what you shared\)\n/)
  assert.match(v1, /\n\*\*Frame\*\* — platform, which way up/) // frame first
  assert.ok(v1.indexOf('**Frame**') < v1.indexOf('**Core loop**'))
  assert.match(v1, /\n- Fixed: “standard pong”\n- Ideas: the score digits are on the court \(my reading\)\n/)
  assert.match(v1, /\*\*Rules\*\* — [^\n]*\n- Open: nothing yet\n/)
  assert.match(v1, /\*\*Read:\*\* pasted text/)
  assert.ok(!/Also noted/.test(v1)) // "also" only when it has something
  const v2 = screen({ needs, brief: 'Xong', version: 2, matter: ['What do 2-10 do?', 'How does a match end?'], added: 3 })
  assert.match(v2, /\(version 2: with your answers\)/)
  assert.match(v2, /\*\*The open questions that matter most\*\*\n1\. What do 2-10 do\?\n2\. How does a match end\?\n/)
  assert.match(v2, /Next: Define/)
})

test('IDEATE.md: one shelf per need, Fixed / Idea / Open lines with their source; Define\'s parser reads it with ids', () => {
  const needs = checkSoFar({ frame: { fixed: [his('online against a friend')], open: ['Phone or desktop?'] }, loop: { ideas: [his('0s are portals')] } }, XONG, ['online against a friend']).needs
  const run = ideateRun({ needs, brief: 'Xong', date: '2026-11-10', key: 'k1', read: 'pasted text', matter: ['Phone or desktop?'], steps: ['show', 'fetch', 'read', 'so-far', 'gaps', 'save'] })
  const merged = mergeDoc(null, run, { shelves: [['Frame', 'x'], ['Core loop', 'y']], fresh: freshIdeate })
  const text = merged.text
  assert.match(text, /^# The game so far\nSeed: "Xong" \(the creative's words\) · last run 2026-11-10\n/)
  assert.match(text, /\n### Frame — platform[^\n]*\n- Fixed: "online against a friend" — run 1 · the creative's words\n- Open: Phone or desktop\? — run 1 · open question\n/)
  assert.match(text, /\n- Idea: "0s are portals" — run 1 · from your material\n/)
  assert.match(text, /\n- Open questions that matter most:\n  1\. Phone or desktop\?\n/)
  assert.ok(!/Research: none ran/.test(text))
  assert.equal(mergeDoc(text, run, { fresh: freshIdeate }).already, true) // saved twice: nothing added twice
  const doc = readShelves(text)
  const frame = doc.shelves.find(s => s.name === 'Frame')
  assert.deepEqual(frame.bricks.map(b => [b.id, b.label, b.source]), [['FR1', 'Fixed', 'creative'], ['FR2', 'Open', 'open']])
  // a later run's answer marks the old open line, never removes it
  const later = markAnswered(text, ['Phone or desktop?'], 2)
  assert.match(later.text, /- Open: Phone or desktop\? — run 1 · open question · answered in run 2\n/)
  assert.equal(later.marked, 1)
  // Define's digest groups it by need and label, frame first
  const d = digest(doc, null, '2026-11-10', '.planning/IDEATE.md').text
  assert.match(d, /Read: \.planning\/IDEATE\.md through Ideate run 1/)
  assert.match(d, /### Frame \[FR\] \(2\)\n#### Fixed \(1\)\n- \[FR1\] "online against a friend" \(their words\)\n#### Open \(1\)\n- \[FR2\] Phone or desktop\? \(still open\)/)
})

test('Define builds on IDEATE.md when it exists, else on an older DISCOVER.md', () => {
  const files = { '.planning/DISCOVER.md': '# Discover\n## Shelves\n### Spark\n- x — run 1 · the creative\'s words\n## Runs\n' }
  assert.equal(sourceDoc(f => files[f] ?? null).path, '.planning/DISCOVER.md')
  files['.planning/IDEATE.md'] = freshIdeate()
  assert.equal(sourceDoc(f => files[f] ?? null).path, '.planning/IDEATE.md')
  assert.equal(sourceDoc(() => null).path, null)
})

test('the creative\'s answers come from the engine\'s journal: only the answers, not the questions', () => {
  const lines = [
    JSON.stringify({ ev: 'answer', step: 'gaps', text: 'User has answered your questions: "Frame — how is it played?"="desktop, both players online", "Rules — how does it end?"="first to 11". You can now continue.' }),
    JSON.stringify({ ev: 'answer', step: 'show', text: 'plain words with no form' }),
    JSON.stringify({ ev: 'step.done', step: 'gaps' }),
    'torn',
  ]
  assert.deepEqual(answersFrom(lines), ['desktop, both players online', 'first to 11', 'plain words with no form'])
  assert.deepEqual(answersFrom(lines, ['show']), ['plain words with no form'])
  assert.equal(E.answerText({ text: 'a' }), 'a')
  assert.equal(E.answerText({ result: { content: [{ type: 'text', text: 'b' }] } }), 'b')
})

test('the scripts end to end: so-far writes version 1; save writes IDEATE.md and version 2 (quotes checked, opens settled)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-ideate-'))
  try {
    mkdirSync(join(dir, '.bmuz'))
    mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
    writeFileSync(join(dir, '.planning', 'research', 'shared.json'), JSON.stringify({ sources: [{ name: 'your one-breath answer', text: XONG }], listed: [{ name: 'Assets/ReversePong.unity', kind: 'a Unity scene' }], unread: [] }))
    const read = { sofar: { loop: { fixed: [his('standard pong')], ideas: [his('0s are portals')], open: [] }, rules: { open: ['How does a match end?', 'What do 2-10 do?'] } }, brief: 'standard pong with interactive scores' }
    const gaps = { added: { rules: { fixed: [his('first to 11')] }, frame: { fixed: [his('desktop, both players online')] } }, answered: ['How does a match end?'], matter: ['What do 2-10 do?'] }
    writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify({ pipeline: 'ideate', finished: ['show', 'fetch', 'read', 'so-far', 'gaps'], skipped: [], resultsBy: { show: { breath: [his(XONG)] }, read, gaps }, results: {} }))
    writeFileSync(join(dir, '.bmuz', 'journal.jsonl'), [{ t: 5, ev: 'step.start', step: 'show' }, { ev: 'answer', step: 'gaps', text: '"How does it end?"="first to 11", "Frame?"="desktop, both players online"' }].map(j => JSON.stringify(j)).join('\n') + '\n')
    const run = mode => spawnSync('node', [join(scripts, 'ideate-doc.mjs'), mode], { cwd: dir, encoding: 'utf8', env: { ...process.env, BMUZ_TEST: '' } })
    const one = run('so-far')
    assert.equal(one.status, 0, one.stdout + one.stderr)
    const v1 = readFileSync(join(dir, '.planning', 'research', 'ideate-so-far.md'), 'utf8')
    assert.match(v1, /version 1: what you shared/)
    assert.match(v1, /- Fixed: “standard pong”/)
    assert.match(v1, /\*\*Read:\*\* your one-breath answer · listed, not read: Assets\/ReversePong\.unity \(a Unity scene\)/)
    const two = run('save')
    assert.equal(two.status, 0, two.stdout + two.stderr)
    const v2 = readFileSync(join(dir, '.planning', 'research', 'ideate-so-far.md'), 'utf8')
    assert.match(v2, /version 2: with your answers/)
    assert.match(v2, /\*\*Rules\*\* — [^\n]*\n- Fixed: “first to 11”\n- Open: What do 2-10 do\?\n/)
    assert.match(v2, /1\. What do 2-10 do\?/)
    const doc = readFileSync(join(dir, '.planning', 'IDEATE.md'), 'utf8')
    assert.match(doc, /- Fixed: "first to 11" — run 1 · the creative's words/)
    assert.ok(!/How does a match end/.test(doc)) // settled in the same run: never written as open
    assert.match(run('save').stdout, /already in it/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the reading script: text read, a folder walked, the rest listed by what it appears to be, nothing outside the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-fetch-'))
  try {
    mkdirSync(join(dir, '.bmuz'))
    mkdirSync(join(dir, 'Assets', 'Scripts'), { recursive: true })
    writeFileSync(join(dir, 'notes.md'), '# Xong notes\n0s are portals.\n')
    writeFileSync(join(dir, 'Assets', 'Scripts', 'Ball.cs'), 'public class Ball { public int speed = 10; }\n')
    writeFileSync(join(dir, 'Assets', 'Scripts', 'Ball.cs.meta'), 'guid: 1\n')
    writeFileSync(join(dir, 'Assets', 'ReversePong.unity'), '%YAML 1.1\n')
    writeFileSync(join(dir, 'Assets', 'art.psd'), Buffer.from([0, 1, 2]))
    const show = { breath: [his(XONG)], pasted: ['pasted words'], files: ['notes.md', 'Assets', '../secret.md', 'missing.txt'], links: ['https://example.com/page'] }
    writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify({ pipeline: 'ideate', resultsBy: { show } }))
    const r = spawnSync('node', [join(scripts, 'ideate-fetch.mjs')], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const j = JSON.parse(readFileSync(join(dir, '.planning', 'research', 'shared.json'), 'utf8'))
    assert.deepEqual(j.sources.map(s => s.name), ['your one-breath answer', 'pasted text', 'notes.md', 'Assets/Scripts/Ball.cs'])
    assert.deepEqual(j.listed.map(l => [l.name, l.kind]), [['Assets/art.psd', 'a Photoshop file (art)'], ['Assets/ReversePong.unity', 'a Unity scene']])
    assert.deepEqual(j.unread.map(u => u.what), ['../secret.md', 'missing.txt', 'https://example.com/page'])
    const md = readFileSync(join(dir, '.planning', 'research', 'shared.md'), 'utf8')
    assert.match(md, /## Listed, not read \(2\) — what they appear to be\n- Assets\/art\.psd — a Photoshop file \(art\)\n- Assets\/ReversePong\.unity — a Unity scene\n/)
    assert.match(md, /## The text\n\n### your one-breath answer\n\nBasically, standard pong/)
    assert.equal(kindOf('x.blend'), 'a 3D model')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the engine: "show" shows a script step\'s file in a turn of its own; "when" runs a step only on a yes', () => {
  const base = { id: 'p', version: 1, steps: [
    { id: 'ask', kind: 'talk', tools: ['Read'], craft: 'craft/a.md', results: ['priorArt'] },
    { id: 'look', kind: 'script', needs: ['ask'], run: ['node', 'x.mjs'], when: '{priorArt}', show: '.planning/research/x.md' },
  ] }
  assert.deepEqual(E.checkPipeline(base), [])
  const bad = over => E.checkPipeline({ ...base, steps: [base.steps[0], { ...base.steps[1], ...over }] }).join()
  assert.match(bad({ show: '../x.md' }), /"show" must be a \.md file inside the project/)
  assert.match(bad({ show: 'x-{slug}.md' }), /"show" must be a \.md file inside the project with no \{holes\}/)
  assert.match(bad({ when: 'yes' }), /"when" must be one \{hole\}/)
  assert.match(bad({ when: '{nope}' }), /\{nope\} isn't known here/)
  const look = base.steps[1]
  assert.equal(E.isWanted(look, { priorArt: 'yes' }), true)
  assert.equal(E.isWanted(look, { priorArt: 'Yes, look at prior art' }), true)
  assert.equal(E.isWanted(look, { priorArt: [{ text: 'yes', picked: true }] }), true)
  for (const v of ['no', 'No, keep going', '', null, undefined, []]) assert.equal(E.isWanted(look, { priorArt: v }), false, String(v))
  assert.equal(E.isWanted(base.steps[0], {}), true)
  assert.match(E.showPrompt('/p/.bmuz/last-shown.md'), /Read \/p\/\.bmuz\/last-shown\.md and show the creative its text exactly as written[^\n]*Ask nothing/)
  // the shown copy may be read between steps, like the card
  assert.equal(E.judgeTool(base, { ...E.freshState('p'), status: 'idle', finished: ['ask'] }, { tool: 'Read', input: { file_path: 'C:\\p\\.bmuz\\last-shown.md' } }).allow, true)
  // a skipped "when" step is rebuilt from the journal as skipped
  const s = E.rebuildFromJournal('p', [JSON.stringify({ ev: 'step.done', step: 'ask', result: { priorArt: 'no' } }), JSON.stringify({ ev: 'step.skip', step: 'look', empties: { look: {} } })])
  assert.deepEqual([s.finished, s.skipped], [['ask', 'look'], ['look']])
})

test('the ideate pipeline: show → fetch → read → so-far (shown) → gaps → save (shown), then Define; no research', () => {
  const p = JSON.parse(readFileSync(join(here, '..', 'plugin', 'pipelines', 'ideate.json'), 'utf8'))
  assert.deepEqual(E.checkPipeline(p), [])
  assert.deepEqual(p.steps.map(s => s.id), ['show', 'fetch', 'read', 'so-far', 'gaps', 'save'])
  assert.deepEqual(p.steps.filter(s => s.show).map(s => s.id), ['so-far', 'save'])
  assert.ok(!p.steps.some(s => s.kind === 'flow')) // research is on demand (F229), never a default step
  assert.ok(!E.stepById(p, 'read').tools.includes('AskUserQuestion')) // the reading step can't ask
  assert.equal(p.next.pipeline, 'define')
  assert.ok(existsSync(join(here, '..', 'plugin', 'pipelines', 'discover.json'))) // kept on disk, no longer a stage
})
