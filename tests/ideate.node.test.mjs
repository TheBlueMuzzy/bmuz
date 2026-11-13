// No-Claude tests of Ideate (F228, kept through F232): the reading script (files, folders, Drive, GitHub), the
// creative's answers from the journal, the engine's "show" and "when", the nudge, and splitting a paste into links.
// (F228's IDEATE.md / Define-digest tests went with that code in F232: the GDD is the one document now —
// tests/gdd.node.test.mjs and tests/ideate-script.node.test.mjs.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import { answersFrom } from '../plugin/scripts/ideate.mjs'
import { driveId, kindOf } from '../plugin/scripts/ideate-fetch.mjs'
import { fileUrlPath, githubLink, githubName, githubOk, isOutsidePath, itemsOf, onlyPointers, pointersOf, splitMaterial } from '../plugin/scripts/material.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const scripts = join(here, '..', 'plugin', 'scripts')
const XONG = 'Basically, standard pong, but xong has some weird things that happen based on each players score. since the scores are on the screen, they become interactive. 0s are portals, when you have a 1, you move both your 1 and your paddle (they move in opposite directions). 2-10 all have other abilities.'
const his = text => ({ text, his: true })

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

test('Drive links: the id is read from any Drive or Docs link; other links are not Drive', () => {
  assert.equal(driveId('https://drive.google.com/drive/folders/1mGTFuDLcFBOKxRrR2s9ylI7LeQxOFN74?usp=sharing'), '1mGTFuDLcFBOKxRrR2s9ylI7LeQxOFN74')
  assert.equal(driveId('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit'), '1AbCdEfGhIjKlMnOp')
  assert.equal(driveId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view'), '1AbCdEfGhIjKlMnOp')
  assert.equal(driveId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'), '1AbCdEfGhIjKlMnOp')
  assert.equal(driveId('https://evil.example.com/drive/folders/1AbCdEfGhIjKlMnOp'), null)
  assert.equal(driveId('https://drive.google.com/drive/folders/x\'y'), null)
  assert.equal(driveId('not a link'), null)
})

test('Drive end to end (a fake gws): a folder walked, Docs exported, code read, the rest listed; the second account tried; read-only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-drive-'))
  try {
    mkdirSync(join(dir, '.bmuz'))
    const data = join(dir, 'world.json')
    const log = join(dir, 'calls.jsonl')
    writeFileSync(data, JSON.stringify({ files: {
      FOLDER0000001: { name: 'Xong', mimeType: 'application/vnd.google-apps.folder' },
      DOC000000001: { name: 'Xong ideas', mimeType: 'application/vnd.google-apps.document', parent: 'FOLDER0000001', text: '3s make the ball curve.' },
      SUB000000001: { name: 'Assets', mimeType: 'application/vnd.google-apps.folder', parent: 'FOLDER0000001' },
      CS0000000001: { name: 'Ball.cs', mimeType: 'text/x-csharp', size: '30', parent: 'SUB000000001', text: 'public int speed = 10;' },
      META00000001: { name: 'Ball.cs.meta', mimeType: 'application/octet-stream', parent: 'SUB000000001', text: 'guid' },
      UNITY0000001: { name: 'ReversePong.unity', mimeType: 'application/octet-stream', size: '22360', parent: 'SUB000000001' },
      PNG000000001: { name: 'paddle.png', mimeType: 'image/png', parent: 'SUB000000001' },
      WORK00000001: { name: 'Client pitch', mimeType: 'application/vnd.google-apps.document', owner: 'muzzymade', text: 'A work pitch.' },
    } }))
    mkdirSync(join(dir, 'home', '.config', 'gws-muzzy'), { recursive: true })
    const show = { links: ['https://drive.google.com/drive/folders/FOLDER0000001', 'https://docs.google.com/document/d/WORK00000001/edit', 'https://drive.google.com/file/d/MISSING00001/view', 'https://example.com/x'] }
    writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify({ pipeline: 'ideate', resultsBy: { show } }))
    const env = { ...process.env, BMUZ_TEST: '1', BMUZ_GWS: join(here, 'fixtures', 'fake-gws.mjs'), FAKE_GWS_DATA: data, FAKE_GWS_LOG: log, HOME: join(dir, 'home'), USERPROFILE: join(dir, 'home') }
    const r = spawnSync('node', [join(scripts, 'ideate-fetch.mjs')], { cwd: dir, encoding: 'utf8', env })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const j = JSON.parse(readFileSync(join(dir, '.planning', 'research', 'shared.json'), 'utf8'))
    assert.deepEqual(j.sources.map(s => [s.name, s.text]), [['Drive · Xong/Assets/Ball.cs', 'public int speed = 10;'], ['Drive · Xong/Xong ideas', '3s make the ball curve.'], ['Drive · Client pitch', 'A work pitch.']])
    assert.deepEqual(j.listed.map(l => [l.name, l.kind, l.where]), [['Drive · Xong/Assets/paddle.png', 'an image', 'Google Drive, personal account'], ['Drive · Xong/Assets/ReversePong.unity', 'a Unity scene', 'Google Drive, personal account']])
    assert.equal(j.unread.length, 2)
    assert.match(j.unread[0].why, /^Google Drive said no \(File not found: MISSING00001\): is it shared with one of your two accounts\?$/)
    assert.equal(j.unread[1].what, 'https://example.com/x')
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    assert.ok(calls.every(c => c.args[0] === 'drive' && c.args[1] === 'files' && ['get', 'list', 'export'].includes(c.args[2])), 'only drive files get / list / export')
    assert.ok(calls.some(c => c.account === 'muzzymade' && c.args[2] === 'export')) // the work doc came through the second account
    assert.ok(!calls.some(c => c.args.join(' ').includes('Ball.cs.meta'))) // .meta never fetched
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

test('the ideate pipeline (F232: the script\'s 1.1–1.7): idea → material → fetch → read → so-far (shown) → next → … → page (shown) → ready, then Define on the creative\'s pick; no research', () => {
  const p = JSON.parse(readFileSync(join(here, '..', 'plugin', 'pipelines', 'ideate.json'), 'utf8'))
  assert.deepEqual(E.checkPipeline(p), [])
  assert.deepEqual(p.steps.map(s => s.id), ['idea', 'material', 'fetch', 'read', 'so-far', 'rules-ask', 'rules-fetch', 'rules-read', 'rules-so-far', 'next', 'next-gdd', 'feelings', 'feelings-gdd', 'open-ideas', 'open-gdd', 'rules-open', 'rules-gdd', 'sketches', 'sketch-gdd', 'page', 'ready', 'ready-gdd'])
  // (F233: a finished game's "rules-open" in place of feelings and open-ideas, decided by the so-far step's path)
  assert.deepEqual(p.steps.filter(s => s.when).map(s => [s.id, s.when]), [['rules-ask', '{rulesask}'], ['rules-fetch', '{more}'], ['rules-read', '{more}'], ['rules-so-far', '{more}'], ['next', '{fresh}'], ['next-gdd', '{fresh}'], ['feelings', '{fresh}'], ['feelings-gdd', '{fresh}'], ['open-ideas', '{fresh}'], ['open-gdd', '{fresh}'], ['rules-open', '{convert}'], ['rules-gdd', '{convert}']])
  assert.deepEqual(p.steps.filter(s => s.show).map(s => s.id), ['so-far', 'rules-so-far', 'page'])
  assert.ok(!p.steps.some(s => s.kind === 'flow')) // research is on demand (F229), never a default step
  assert.ok(!E.stepById(p, 'read').tools.includes('AskUserQuestion')) // the reading step can't ask
  assert.equal(p.next.pipeline, '{onward}')
  assert.ok(existsSync(join(here, '..', 'plugin', 'pipelines', 'discover.json'))) // kept on disk, no longer a stage
})

test('task 3: a plain-text question is found; the nudge names it, twice at most; text before a box is measured', () => {
  const step = { id: 'gaps' }
  assert.equal(E.plainQuestion('Here is the game so far.\n\nWhat do 2-10 do?'), 'What do 2-10 do?')
  assert.equal(E.plainQuestion('1. **How does a match end?**'), 'How does a match end?**')
  assert.equal(E.plainQuestion('All saved. Nothing to ask.'), null)
  assert.match(E.nudgeFor(step, 'Tell me the concept in your own words?', 0), /asked "Tell me the concept in your own words\?" in plain text[^\n]*Ask it again with AskUserQuestion/)
  assert.match(E.nudgeFor(step, 'Thanks, noted.', 1), /ended without the question box or step_done/)
  assert.equal(E.nudgeFor(step, 'What now?', E.MAX_NUDGES), null)
  const rows = [
    { role: 'user', text: 'BMUZ step "gaps"', toolUses: [] },
    { role: 'assistant', text: 'Let me read it.', toolUses: [{ tool: 'Read' }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ text: 'file' }] },
    { role: 'assistant', text: 'Research questions:\n1. a\n2. b\n3. c\n4. d', toolUses: [{ tool: 'AskUserQuestion' }] },
  ]
  assert.equal(E.turnText(rows), 'Let me read it.\nResearch questions:\n1. a\n2. b\n3. c\n4. d')
  assert.match(E.hiddenTextProblem(E.turnText(rows)), /6 lines of plain text .* came before this question box/)
  assert.equal(E.hiddenTextProblem('Two quick gaps, frame first.'), null)
  // every live talk step is told; an auto run gets its own never-ask rule instead
  assert.match(E.talkPrompt({ id: 'x', results: [] }, 'craft', '', false), /every question to the creative goes through AskUserQuestion/)
  assert.ok(!/every question to the creative goes through AskUserQuestion/.test(E.talkPrompt({ id: 'x', results: [] }, 'craft', '', true)))
})

test('live look 2026-11-10: an option that stands in for typing ("I\'ll paste the link") is refused; real answers pass', () => {
  const box = (label, description = '') => [{ question: 'Your material?', options: [{ label: 'Nothing to share yet' }, { label, description }] }]
  // what the live look actually showed, four screens of it
  for (const fake of ["I'll paste it", "I'll paste the link", 'I will paste a link or text', 'Write it here instead', 'Paste it', 'Type it in', 'Let me paste them'])
    assert.match(E.fakeTypeOptionProblem(box(fake)) || '', /stands in for typing/, fake)
  assert.match(E.fakeTypeOptionProblem(box("It's in Google Drive", 'paste the link in Other')) || '', /stands in for typing/)
  assert.match(E.fakeTypeOptionProblem(box('A Drive link or more text', "paste it in 'Type something'")) || '', /stands in for typing/)
  // real answers, including the ones the craft notes now use
  for (const ok of ['Read rules.md and notes.txt', 'Look in this folder again', "That's everything", 'No link — ask me the idea instead', 'Keep going', 'Send it to Define', 'Open it up', 'Nothing yet — help me find one'])
    assert.equal(E.fakeTypeOptionProblem(box(ok, 'drop your files here first, then pick this')), null, ok)
  assert.equal(E.fakeTypeOptionProblem(undefined), null)
  // the refusal points at the chat (F232: free answers go in the chat; the next message is the answer)
  assert.match(E.fakeTypeOptionProblem(box("I'll paste it")) || '', /ask in the chat instead of the box \(their next chat message is the answer\)/)
  assert.equal(E.PASTE_OPTION, undefined)
  // every live talk step without script lines is told: links or long text go in the chat, never the box
  const notes = E.talkPrompt({ id: 'x', results: [] }, 'craft', '', false)
  assert.match(notes, /Links, notes or any long text: never the box — ask in one short line as your whole reply and end your turn; their next chat message is the answer/)
  assert.ok(!/Paste links or text/.test(notes))
})

test('F232 (was live look round 5, ask_paste): the ask for links is the script\'s free line, the creative\'s own words; "never mind" in any form; no stall while any free question is open', () => {
  const script = E.parseScript(readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8'))
  const links = E.renderLine(script, E.LINKS_LINE, {})
  assert.equal(links.kind, 'free')
  assert.ok(links.text.endsWith('Share your links — paste them with Alt+V. I can read Google Drive folder and/or doc links, GitHub links, and even folder and file links from your computer. If you don\'t want to share any links, just say "never mind".'))
  assert.match(E.sayNext(links, false), /Write exactly the "say" text as your whole reply/)
  const open = { step: 'material', line: E.LINKS_LINE, text: links.text }
  assert.ok(E.askResumeLine(open).endsWith(links.text))
  for (const t of ['never mind', 'Never mind', '  NEVER MIND  ', '"never mind"', 'Never mind.', '“never mind”', '"Never mind."', 'nevermind', 'never mind!'])
    assert.equal(E.isNeverMind(t), true, t)
  for (const t of ['never mind the drive link, here: https://drive.google.com/x', 'mind', '', 'never'])
    assert.equal(E.isNeverMind(t), false, t)
  assert.match(E.answerNote(open, 'Never mind.'), /carry on with the step with no material/)
  assert.match(E.answerNote(open, 'https://github.com/a/b'), /take every link and path in it as their material/)
  // any other free line: the answer is named as the answer to that line
  assert.match(E.answerNote({ step: 'idea', line: 'ideate.idea', text: '**Your Idea**\nTell me about your game' }, 'A card game'), /answer to the script line "ideate\.idea" \("Your Idea Tell me about your game"\)/)
  // open only while its own step runs
  const working = { status: 'working', current: 'material', startedAt: 1, ask: open }
  assert.deepEqual(E.askOpen(working), open)
  assert.equal(E.askOpen({ ...working, current: 'fetch' }), null)
  assert.equal(E.askOpen({ ...working, status: 'idle' }), null)
  assert.equal(E.askOpen({ status: 'working', current: 'material' }), null)
  // a step waiting on the answer is not stalled; finishing the step closes the question
  const P = { id: 't', steps: [{ id: 'material', kind: 'talk' }] }
  assert.equal(E.isStalled(P, working, 10_000_000, 1000), false)
  assert.equal(E.isStalled(P, { ...working, ask: null }, 10_000_000, 1000), true)
  assert.equal(E.finish({ ...working, finished: [], retries: {}, results: {} }, P.steps[0], { links: [] }).ask, null)
  // the say tool: allowed only in a talk step with script lines
  const S = { id: 't', steps: [{ id: 'material', kind: 'talk', tools: ['AskUserQuestion'], lines: [E.LINKS_LINE] }] }
  const st = { ...E.freshState('t'), status: 'working', current: 'material', startedAt: 1 }
  assert.equal(E.judgeTool(S, st, { tool: E.SAY_TOOL }, { auto: false }).allow, true)
  assert.equal(E.judgeTool({ id: 't', steps: [{ id: 'material', kind: 'talk', tools: ['Read'] }] }, st, { tool: E.SAY_TOOL }).allow, false)
})

test('live look round 5: one paste, many links — Drive, GitHub repo/tree/blob, Windows paths, quoted paths with spaces, file:///', () => {
  const kinds = t => splitMaterial(t).map(i => [i.kind, i.value])
  const paste = [
    'https://drive.google.com/drive/folders/1mGTFuDLcFBOKxRrR2s9ylI7LeQxOFN74?usp=sharing, https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit',
    'https://github.com/TheBlueMuzzy/lamp https://github.com/TheBlueMuzzy/lamp/tree/main/docs',
    'https://github.com/TheBlueMuzzy/lamp/blob/v2/rules/core.md',
    'C:\\Users\\Muzzy\\Documents\\My Game\\notes.md',
    '"C:\\Users\\Muzzy\\Desktop\\Art Folder" and ~/sketches/lamp.txt',
    'file:///C:/Users/Muzzy/My%20Notes/idea.md',
  ].join('\n')
  assert.deepEqual(kinds(paste), [
    ['drive', 'https://drive.google.com/drive/folders/1mGTFuDLcFBOKxRrR2s9ylI7LeQxOFN74?usp=sharing'],
    ['drive', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit'],
    ['github', 'https://github.com/TheBlueMuzzy/lamp'],
    ['github', 'https://github.com/TheBlueMuzzy/lamp/tree/main/docs'],
    ['github', 'https://github.com/TheBlueMuzzy/lamp/blob/v2/rules/core.md'],
    ['path', 'C:\\Users\\Muzzy\\Documents\\My Game\\notes.md'],
    ['path', 'C:\\Users\\Muzzy\\Desktop\\Art Folder'],
    ['text', 'and'],
    ['path', '~/sketches/lamp.txt'],
    ['path', 'C:/Users/Muzzy/My Notes/idea.md'],
  ])
  assert.deepEqual(kinds('see https://example.com/page.'), [['text', 'see'], ['web', 'https://example.com/page']])
  assert.ok(onlyPointers('https://github.com/a/b\nC:\\x\\y.md'))
  assert.ok(!onlyPointers('A lighthouse keeper game. https://github.com/a/b'))
  // a "files" item is one path, spaces and all; a plain word is a folder name
  assert.deepEqual(itemsOf('Assets', { files: true }), [{ kind: 'path', value: 'Assets' }])
  assert.deepEqual(itemsOf('docs/My Rules.md', { files: true }), [{ kind: 'path', value: 'docs/My Rules.md' }])
  assert.deepEqual(itemsOf('a.md, b.md', { files: true }).map(i => i.value), ['a.md', 'b.md'])
  assert.deepEqual(pointersOf({ files: ['rules.md', 'https://github.com/a/b'], pasted: ['https://drive.google.com/drive/folders/1mGTFuDLcFBOKxRrR2s9ylI7LeQxOFN74\nD:\\games\\x', 'my words, not links'] }),
    ['rules.md', 'https://github.com/a/b', 'https://drive.google.com/drive/folders/1mGTFuDLcFBOKxRrR2s9ylI7LeQxOFN74', 'D:\\games\\x'])
  assert.equal(fileUrlPath('file:///home/me/x.md'), '/home/me/x.md')
  assert.ok(isOutsidePath('C:\\x') && isOutsidePath('~/x') && isOutsidePath('\\\\server\\share') && !isOutsidePath('notes.md') && !isOutsidePath('../x'))
})

test('live look round 5: GitHub links parsed; a bad owner, repo, ref or path never reaches gh', () => {
  assert.deepEqual(githubLink('https://github.com/TheBlueMuzzy/lamp'), { owner: 'TheBlueMuzzy', repo: 'lamp', kind: 'repo', ref: null, path: '' })
  assert.deepEqual(githubLink('https://github.com/TheBlueMuzzy/lamp.git'), { owner: 'TheBlueMuzzy', repo: 'lamp', kind: 'repo', ref: null, path: '' })
  assert.deepEqual(githubLink('https://www.github.com/o/r/tree/main/docs/My%20Rules'), { owner: 'o', repo: 'r', kind: 'tree', ref: 'main', path: 'docs/My Rules' })
  assert.deepEqual(githubLink('https://github.com/o/r/blob/v1.2/a/b.md'), { owner: 'o', repo: 'r', kind: 'blob', ref: 'v1.2', path: 'a/b.md' })
  assert.equal(githubName(githubLink('https://github.com/o/r/tree/main/docs')), 'github.com/o/r/docs')
  for (const bad of [
    'https://github.com/-o/r', 'https://github.com/o;rm/r', 'https://github.com/o/r%20x', 'https://github.com/o/..',
    'https://github.com/o/r/tree/--upload-pack=x', 'https://github.com/o/r/tree/a..b', 'https://github.com/o/r/blob/main',
    'https://github.com/o/r/blob/main/%2E%2E/x', 'https://github.com/o/r/blob/main/a%5Cb', 'https://github.com/o/r/blob/main/-x',
    'https://github.com/o/r/issues/1', 'https://evil.com/o/r', 'not a link',
  ]) assert.equal(githubLink(bad), null, bad)
  assert.equal(githubOk({ owner: 'o', repo: 'r', ref: '-x', path: '' }), false)
  assert.equal(githubOk({ owner: 'o', repo: 'r', ref: 'main', path: 'a/../b' }), false)
  assert.equal(githubOk({ owner: 'o', repo: 'r', ref: null, path: '' }), true)
})

test('live look round 5: GitHub and a folder outside the project, end to end (a fake gh): read-only, caps kept, temp copy gone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-gh-'))
  try {
    const project = join(dir, 'project')
    mkdirSync(join(project, '.bmuz'), { recursive: true })
    // a folder elsewhere on their computer, with a secret and a big folder in it
    const outside = join(dir, 'Elsewhere', 'Art Folder')
    mkdirSync(join(outside, 'many'), { recursive: true })
    writeFileSync(join(outside, 'lamp notes.md'), 'The lamp must never go out.')
    writeFileSync(join(outside, '.env'), 'TOKEN=secret')
    writeFileSync(join(outside, 'cover.png'), Buffer.from([0, 1, 2]))
    for (let i = 0; i < 210; i++) writeFileSync(join(outside, 'many', `n${String(i).padStart(3, '0')}.txt`), `note ${i}`)
    const before = readdirSync(outside).sort()
    const data = join(dir, 'gh-world.json')
    const log = join(dir, 'gh-calls.jsonl')
    writeFileSync(data, JSON.stringify({ repos: { 'TheBlueMuzzy/lamp': { 'README.md': '# Lamp\nA lighthouse game.', 'docs/rules.md': 'Spend oil each night.', 'art/logo.png': '\u0000PNG' } } }))
    const show = { links: [
      `https://github.com/TheBlueMuzzy/lamp/tree/main/docs\nhttps://github.com/TheBlueMuzzy/lamp/blob/main/README.md "${outside}"`,
      'https://github.com/TheBlueMuzzy/missing',
      `${join(dir, 'nowhere', 'x.md')}`,
    ] }
    writeFileSync(join(project, '.bmuz', 'state.json'), JSON.stringify({ pipeline: 'ideate', resultsBy: { show } }))
    const env = { ...process.env, BMUZ_TEST: '1', BMUZ_GH: join(here, 'fixtures', 'fake-gh.mjs'), FAKE_GH_DATA: data, FAKE_GH_LOG: log }
    const r = spawnSync('node', [join(scripts, 'ideate-fetch.mjs')], { cwd: project, encoding: 'utf8', env })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const j = JSON.parse(readFileSync(join(project, '.planning', 'research', 'shared.json'), 'utf8'))
    const name = outside.replace(/\\/g, '/')
    const texts = Object.fromEntries(j.sources.map(s => [s.name, s.text]))
    assert.equal(texts['github.com/TheBlueMuzzy/lamp/docs/rules.md'], 'Spend oil each night.')
    assert.equal(texts['github.com/TheBlueMuzzy/lamp/README.md'], '# Lamp\nA lighthouse game.')
    assert.equal(texts[`${name}/lamp notes.md`], 'The lamp must never go out.')
    assert.ok(!j.sources.some(s => /\.env$/.test(s.name)))
    assert.ok(j.listed.some(l => l.name === `${name}/.env` && /password or key/.test(l.kind)))
    assert.ok(j.listed.some(l => l.name === `${name}/cover.png` && l.kind === 'an image'))
    // the cap: 200 files looked at in one folder, the rest said
    assert.ok(j.unread.some(u => u.what === `${name}/many/…` && /more than 200 files/.test(u.why)))
    assert.ok(j.unread.some(u => u.what === 'github.com/TheBlueMuzzy/missing' && /^GitHub said no/.test(u.why)))
    assert.ok(j.unread.some(u => /nowhere\/x\.md$/.test(u.what.replace(/\\/g, '/')) && u.why === 'not found'))
    // read-only: only "repo clone … -- --depth 1" and "api -H Accept: raw"; the outside folder unchanged; temp copies gone
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l))
    assert.ok(calls.every(c => (c.args[0] === 'repo' && c.args[1] === 'clone' && c.args.slice(4, 7).join(' ') === '-- --depth 1') || (c.args[0] === 'api' && c.args[2] === 'Accept: application/vnd.github.raw')), JSON.stringify(calls))
    assert.ok(calls.some(c => c.args[0] === 'repo' && c.args.includes('--branch') && c.args.includes('main')))
    assert.ok(calls.every(c => c.args[0] !== 'repo' || !existsSync(c.args[3])), 'the temp copy is deleted')
    assert.deepEqual(readdirSync(outside).sort(), before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('F232: a file or folder named in words ("the art folder", "my rules doc") is found in the project when exactly one matches', async () => {
  const { namedInWords } = await import('../plugin/scripts/ideate-fetch.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-named-'))
  mkdirSync(join(dir, 'art'))
  writeFileSync(join(dir, 'rules.md'), '# rules')
  writeFileSync(join(dir, 'notes.txt'), 'n')
  writeFileSync(join(dir, 'notes.md'), 'n')
  assert.equal(namedInWords(dir, 'the art folder'), 'art')
  assert.equal(namedInWords(dir, 'my rules doc'), 'rules.md')
  assert.equal(namedInWords(dir, 'the notes'), null, 'two match: none picked')
  assert.equal(namedInWords(dir, 'the lamp art folder'), null, 'more than one word left: none picked')
  assert.equal(namedInWords(dir, 'music'), null)
})
