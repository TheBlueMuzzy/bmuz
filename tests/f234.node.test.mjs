// F234 — Steps ask only what's still open. No-Claude tests: what each step collects, the engine's check before each step
// (there / unsure / missing, rules 2, 3 and 5), "already decided" (rule 1), the stage's skip list and reopen (rule 4),
// and the task 6 fixes (folders read documents first, newest first; plural(); the correction's again-list).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'
import * as I from '../plugin/scripts/ideate.mjs'
import * as F from '../plugin/scripts/fields.mjs'
import { MOON_READ, moonProject } from './f233.node.test.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
const pipe = id => JSON.parse(readFileSync(join(plugin, 'pipelines', `${id}.json`), 'utf8'))
const IDEATE = pipe('ideate')
const DEFINE = pipe('define')
const NL = String.fromCharCode(10)
const gdd = lines => G.writeChapter(G.newGdd('Test'), 5, lines, 'loose', {}).text

test('task 2: every Define step that asks the concept names what it collects, who needs it later, and the line that asks it', () => {
  assert.deepEqual(E.checkPipeline(DEFINE), [])
  assert.deepEqual(E.checkPipeline(IDEATE), [])
  const ids = s => (E.stepById(DEFINE, s).collects || []).map(c => c.field)
  assert.deepEqual(ids('platform'), ['platform.where', 'platform.first', 'platform.someday', 'players.who', 'computer.ai'])
  assert.deepEqual(ids('platform-rules'), ids('platform'))
  assert.deepEqual(ids('decides'), ['feel.target', 'feel.know', 'pillars', 'pitch.oneliner', 'pitch.lines', 'loop'])
  for (const s of ['feelings', 'pillars', 'pitch', 'loop', 'scope', 'slice']) assert.ok(ids(s).length, s)
  // every field a later stage needs on the new-idea path is also asked on the conversion path, and the other way round
  const on = (vars) => DEFINE.steps.filter(s => s.collects && E.isWanted(s, vars)).flatMap(s => s.collects.filter(c => c.neededBy.length).map(c => c.field))
  assert.deepEqual([...new Set(on({ convert: 'yes' }))].sort(), [...new Set(on({ fresh: 'yes' }))].filter(f => f !== 'feel.not').sort())
  // Ideate only gathers: its fields are [] (Define asks again)
  for (const s of IDEATE.steps.filter(x => x.collects)) for (const c of s.collects) assert.deepEqual(c.neededBy, [], `${s.id} ${c.field}`)
  // the checks
  const bad = { id: 'x', kind: 'talk', tools: ['Read'], craft: 'c.md', lines: ['a'], collects: [{ field: 'Platform', what: '', chapter: 20, line: 'b', neededBy: ['later'] }] }
  const probs = E.collectsProblems(bad, 'step "x"').join(' | ')
  for (const want of [/"field" must be lower case/, /"what" must name/, /"chapter" must be/, /"line" must be one of the step's "lines"/, /"neededBy" must list/]) assert.match(probs, want)
  assert.match(E.collectsProblems({ id: 'y', kind: 'script', collects: [] }, 's').join(), /only a talk step asks/)
})

test('task 3, rules 2 and 5: there only with a fixed rule or a decision whose line is still in the GDD; anything else read in is confirmed; nothing = asked', () => {
  const step = E.stepById(DEFINE, 'platform')
  const fixed = 'Fixed: "Play it online, two players taking turns" (from rules.md)'
  const said = 'Clear: "On a computer first"'
  const read = 'Clear: phones, probably (my reading)'
  const doc = gdd([fixed, said, read, 'Idea: maybe Steam someday'])
  const records = { 'players.who': [{ chapter: 5, line: fixed, kind: 'fixed' }], 'platform.where': [{ chapter: 5, line: said, kind: 'said' }], 'platform.first': [{ chapter: 5, line: read, kind: 'read' }] }
  const plan = E.askPlan(step, records, doc)
  const st = Object.fromEntries(plan.fields.map(f => [f.field, f.status]))
  assert.deepEqual(st, { 'platform.where': 'unsure', 'platform.first': 'unsure', 'platform.someday': 'missing', 'players.who': 'there', 'computer.ai': 'missing' })
  assert.equal(plan.decision, 'confirm')
  assert.equal(plan.fields.find(f => f.field === 'players.who').why, 'your rules say "Play it online, two players taking turns" (from rules.md)')
  // a chapter that looks full is not an answer: an Idea line is no record at all
  assert.equal(plan.fields.find(f => f.field === 'platform.someday').status, 'missing')
  // the line taken out of the GDD (an undo, a hand edit): the field is open again
  assert.equal(E.askPlan(step, records, gdd([said])).fields.find(f => f.field === 'players.who').status, 'missing')
  // a new idea: nothing recorded = everything asked
  assert.equal(E.askPlan(step, {}, doc).decision, 'ask')
  // every field there = skip; a reopened step asks them all again
  const all = Object.fromEntries(step.collects.map(c => [c.field, [{ chapter: 5, line: fixed, kind: 'fixed' }]]))
  assert.equal(E.askPlan(step, all, doc).decision, 'skip')
  assert.equal(E.askPlan(step, all, doc, { forced: true }).decision, 'ask')
  // the musts it lifts: lines whose fields are there or confirmed; a missing one stays
  const lifted = E.liftedMusts(step, plan)
  assert.ok(lifted.includes('define.platform.who') && lifted.includes('define.platform.where') && lifted.includes('define.platform.first') && !lifted.includes('define.platform.someday'))
  const state = { asked: { platform: E.planRecord(plan, step) }, said: { step: 'platform', lines: ['define.platform'] } }
  assert.match(E.mustProblem(step, state, {}), /"define\.platform\.someday" was never said/)
  assert.doesNotMatch(E.mustProblem(step, state, {}), /define\.platform\.who/)
  // the plan as the step is told it
  const note = E.planNote(step, plan)
  assert.match(note, /Who else is playing \(define\.platform\.who\): already there, so don't ask it/)
  assert.match(note, /Where the player is, and what they hold \(define\.platform\.where\): the document has "Clear: "On a computer first"".*Confirm it with "any\.keep"/)
  assert.match(note, /Which platforms are someday \(define\.platform\.someday\): not in the document yet: ask it \(store needs it\)/)
})

test('task 3, rule 3: a step a path turns off still asks a needed field that nothing else asks; the conversion path as built needs none', () => {
  const convert = { convert: 'yes', fresh: 'no', research: 'no' }
  const state = { finished: ['path', 'welcome', 'welcome-rules', 'decides', 'decides-gdd'], skipped: ['welcome'] }
  for (const id of ['feelings', 'pillars', 'pitch', 'loop', 'platform']) assert.equal(E.neededMissing(DEFINE, state, E.stepById(DEFINE, id), {}, '', convert), null, id)
  // a field a later stage needs that no step on this path asks: still asked, only it
  const p = { id: 't', steps: [
    { id: 'a', kind: 'talk', when: '{fresh}', collects: [{ field: 'platform.first', what: 'First', chapter: 5, line: 'x', neededBy: ['build'] }, { field: 'feel.not', what: 'Not', chapter: 1, line: 'y', neededBy: [] }] },
    { id: 'b', kind: 'talk', when: '{convert}', collects: [{ field: 'feel.not', what: 'Not', chapter: 1, line: 'y', neededBy: [] }] },
  ] }
  assert.deepEqual(E.neededMissing(p, { finished: [], skipped: [] }, p.steps[0], {}, '', convert), ['platform.first'])
  // asked by a later stage: covered
  assert.equal(E.neededMissing(p, { finished: [], skipped: [] }, p.steps[0], {}, '', convert, ['platform.first']), null)
  const only = E.askPlan(p.steps[0], {}, '', { only: ['platform.first'] })
  assert.deepEqual(only.fields.map(f => f.status), ['missing', 'path'])
  assert.equal(only.decision, 'ask')
})

test('task 3: what the scripts record — a finished game\'s tagged rules (fixed) and the conversion path\'s answers (said); never on the new-idea path', () => {
  const tagged = JSON.parse(JSON.stringify(MOON_READ))
  tagged.sofar[5] = { fixed: [{ text: 'Play it online, two players taking turns', his: false, source: 'rules.md', field: 'players.who' }], ideas: [], open: [] }
  tagged.sofar[8].fixed[0].field = 'nonsense.Field'
  const { dir, state } = moonProject(tagged)
  I.soFar(dir, state, script)
  const rec = F.readFields(dir)
  // (the rule isn't in their words: kept as my reading, so it is "read" — confirmed later, never skipped)
  assert.deepEqual(Object.keys(rec), ['players.who'])
  assert.equal(rec['players.who'][0].kind, 'read')
  assert.match(rec['players.who'][0].line, /^Fixed: Play it online, two players taking turns \(my reading, from rules\.md\)$/)
  assert.ok(E.fieldText(readFileSync(join(dir, '.planning/GDD.md'), 'utf8')).includes(E.fieldText(rec['players.who'][0].line)))
  // an answer on the conversion path: "said"; on the new-idea path: nothing recorded
  const answer = { chapters: { 5: [{ text: 'On a computer first', his: true, field: 'platform.where' }] } }
  const run = results => {
    const { dir: d } = moonProject(MOON_READ, { 'rules-open': answer })
    const st = JSON.parse(readFileSync(join(d, '.bmuz/state.json'), 'utf8'))
    writeFileSync(join(d, '.bmuz/state.json'), JSON.stringify({ ...st, results }))
    writeFileSync(join(d, '.bmuz/journal.jsonl'), JSON.stringify({ ev: 'answer', step: 'rules-open', text: 'On a computer first' }) + NL)
    I.addStep(d, { ...st, results }, 'rules-open')
    return F.readFields(d)
  }
  assert.deepEqual(run({ convert: 'yes', fresh: 'no' })['platform.where'].map(r => [r.kind, r.line]), [['said', 'Idea: "On a computer first"']])
  assert.deepEqual(run({ convert: 'no', fresh: 'yes' }), {})
})

test('task 4, rule 1: "already decided" writes that one answer into its chapter (its level kept) and records it decided', () => {
  const { dir } = moonProject(MOON_READ)
  writeFileSync(join(dir, '.planning/GDD.md'), G.writeChapter(G.newGdd('Moon'), 5, ['Open: Which platform first?'], 'chosen', {}).text)
  const r = spawnSync('node', [join(plugin, 'scripts', 'fields.mjs'), 'decided', 'platform.first', '5', 'platform-rules', 'The', 'web.'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout)
  const ch = G.readGdd(readFileSync(join(dir, '.planning/GDD.md'), 'utf8'))[5]
  assert.equal(ch.level, 'chosen')
  assert.match(ch.text, /^- Fixed: The web \(you said it's already decided\)$/m)
  assert.deepEqual(F.readFields(dir), { 'platform.first': [{ chapter: 5, line: "Fixed: The web (you said it's already decided)", kind: 'decided', step: 'platform-rules', day: new Date().toISOString().slice(0, 10) }] })
  const plan = E.askPlan(E.stepById(DEFINE, 'platform-rules'), F.readFields(dir), readFileSync(join(dir, '.planning/GDD.md'), 'utf8'))
  assert.deepEqual(plan.fields.filter(f => f.status === 'there').map(f => f.field), ['platform.first'], 'only that one answer')
  // the question it settles: the one just asked, named when several were asked together
  const step = E.stepById(DEFINE, 'platform-rules')
  assert.deepEqual(E.decidedTarget(step, { lastAsk: { step: 'platform-rules', lines: ['define.platform.first'] } }).fields.map(f => f.field), ['platform.first'])
  assert.match(E.decidedTarget(step, { lastAsk: { step: 'platform-rules', lines: ['define.platform.where', 'define.platform.first'] } }).error, /name the one/)
  assert.deepEqual(E.decidedTarget(step, { lastAsk: { step: 'platform-rules', lines: ['define.platform.where', 'define.platform.first'] } }, 'define.platform.where').fields.map(f => f.field), ['platform.where'])
  assert.match(E.decidedTarget(step, {}).error, /no question of this step was asked yet/)
  assert.match(spawnSync('node', [join(plugin, 'scripts', 'fields.mjs'), 'decided', 'platform.first', '5', 'x'], { cwd: dir, encoding: 'utf8' }).stdout, /no answer/)
})

test('task 5, rule 4: the stage\'s end says what wasn\'t asked, numbered; "reopen <n>" or its name brings that step back and redoes only it and the end', () => {
  const plan = { decision: 'skip', title: 'Platform & Play', fields: [{ field: 'players.who', what: 'Who else is playing', line: 'define.platform.who', status: 'there', why: 'your rules say "online, by turns" (from rules.md)' }, { field: 'platform.first', what: 'Which one platform first', status: 'missing', why: '' }] }
  const upTo = DEFINE.steps.slice(0, DEFINE.steps.findIndex(s => s.id === 'lock')).map(s => s.id)
  const state = { pipeline: 'define', finished: upTo, skipped: ['platform-rules'], current: 'lock', status: 'waiting', asked: { 'platform-rules': plan }, resultsBy: {}, results: {}, retries: {} }
  const items = E.skipItems(DEFINE, state)
  assert.deepEqual(items, [{ n: 1, step: 'platform-rules', title: 'Platform & Play', what: 'Who else is playing', why: 'your rules say "online, by turns" (from rules.md)' }])
  const line = F.skipList(state, script)
  assert.equal(line, `**What I didn't ask about**${NL}1. Who else is playing (Platform & Play): your rules say "online, by turns" (from rules.md)${NL}To bring one back, say "reopen" and its number.`)
  for (const w of ['reopen 1', 'Reopen 1.', '1', 'reopen who else is playing', 'reopen platform & play']) assert.equal(E.reopenTarget(items, w), 'platform-rules', w)
  assert.equal(E.reopenTarget(items, 'reopen 2'), null)
  const out = E.reopenStep(DEFINE, state, 'platform-rules')
  assert.deepEqual(out.dropped.sort(), ['lock', 'lock-show', 'platform-rules', 'platform-rules-gdd'].sort())
  assert.ok(out.state.finished.includes('scope') && out.state.finished.includes('slice-gdd'), 'nothing else is redone')
  assert.deepEqual(out.state.forced, ['platform-rules'])
  assert.equal(out.state.asked['platform-rules'], undefined)
  assert.equal(E.nextStep(DEFINE, out.state).id, 'platform-rules')
  // the doctor rebuilds the same from the journal
  const j = [{ ev: 'confirm', step: 'platform-rules', plan }, { ev: 'reopen', step: 'platform-rules', dropped: out.dropped }].map(x => JSON.stringify(x))
  assert.deepEqual(E.rebuildFromJournal('define', j).forced, ['platform-rules'])
  // no skips: nothing said
  assert.equal(F.skipList({ ...state, asked: {} }, script), '')
})

test('task 5 (F233 task 11): What next? only on the new-idea path; a game said to be played whose rules weren\'t read is asked once for them', () => {
  assert.equal(E.stepById(IDEATE, 'next').when, '{fresh}')
  assert.equal(I.wantsRules({ played: true }, false, 'read'), true)
  assert.equal(I.wantsRules({ played: true }, true, 'read'), false, 'rules read: no ask')
  assert.equal(I.wantsRules({ played: true }, false, 'rules-read'), false, 'once only')
  assert.equal(I.wantsRules({ played: false }, false, 'read'), false)
  // the so-far step says so; the second reading takes the conversion path when the rules came
  const thin = { ...MOON_READ, finished: false, played: true, sofar: { 1: { fixed: [], ideas: [], open: ['What should it feel like?'] } } }
  const { dir } = moonProject(thin)
  const r = spawnSync('node', [join(plugin, 'scripts', 'ideate.mjs'), 'so-far'], { cwd: dir, encoding: 'utf8' })
  assert.deepEqual(E.scriptResults(E.stepById(IDEATE, 'so-far'), r.stdout).result, { convert: 'no', fresh: 'yes', rulesask: 'yes' })
  const st = JSON.parse(readFileSync(join(dir, '.bmuz/state.json'), 'utf8'))
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...st, resultsBy: { ...st.resultsBy, 'rules-read': MOON_READ } }))
  const r2 = spawnSync('node', [join(plugin, 'scripts', 'ideate.mjs'), 'so-far', 'rules-read'], { cwd: dir, encoding: 'utf8' })
  assert.deepEqual(E.scriptResults(E.stepById(IDEATE, 'rules-so-far'), r2.stdout).result, { convert: 'yes', fresh: 'no', rulesask: 'no' })
  // the rules fetched are added to what was shared before
  mkdirSync(join(dir, 'docs'))
  writeFileSync(join(dir, 'docs', 'rules.txt'), 'Setup: deal 3 cards each.')
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...st, resultsBy: { ...st.resultsBy, 'rules-ask': { links: [], files: ['docs/rules.txt'], more: 'yes' } } }))
  const f = spawnSync('node', [join(plugin, 'scripts', 'ideate-fetch.mjs'), 'more', 'rules-ask'], { cwd: dir, encoding: 'utf8' })
  assert.equal(f.status, 0, f.stdout + f.stderr)
  const shared = JSON.parse(readFileSync(join(dir, '.planning/research/shared.json'), 'utf8'))
  assert.deepEqual(shared.sources.map(s => s.name), ['your one-breath answer', 'rules.md', 'docs/rules.txt'])
})

test('task 6 (F233 task 10): a folder reads its documents before its art, newest first — the rulebook past 200 old pictures is read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-f234-'))
  mkdirSync(join(dir, '.bmuz'))
  mkdirSync(join(dir, 'Game', 'Archive'), { recursive: true })
  for (let i = 0; i < 230; i++) {
    const f = join(dir, 'Game', 'Archive', `card${String(i).padStart(3, '0')}.psd`)
    writeFileSync(f, Buffer.from([56, 66, 80, 83, 0]))
    utimesSync(f, new Date('2021-01-01'), new Date('2021-01-01'))
  }
  writeFileSync(join(dir, 'Game', 'Rules v1.md'), 'old rules')
  utimesSync(join(dir, 'Game', 'Rules v1.md'), new Date('2022-01-01'), new Date('2022-01-01'))
  writeFileSync(join(dir, 'Game', 'Rules v3.md'), 'Setup: each player takes 3 cards.')
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ pipeline: 'ideate', resultsBy: { material: { files: ['Game'], links: [], pasted: [] } } }))
  const r = spawnSync('node', [join(plugin, 'scripts', 'ideate-fetch.mjs')], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const j = JSON.parse(readFileSync(join(dir, '.planning/research/shared.json'), 'utf8'))
  assert.deepEqual(j.sources.map(s => s.name), ['Game/Rules v3.md', 'Game/Rules v1.md'], 'newest first')
  assert.equal(j.listed.length, 198, 'the art after them, up to the cap')
  assert.ok(j.unread.some(u => u.what === 'Game/…' && /more than 200 files/.test(u.why)))
})

test('task 6 (F233 task 9): plural() no longer breaks words', () => {
  assert.equal(I.plural('Unity bookkeeping', 214), 'Unity bookkeeping files')
  assert.equal(I.plural('Google file that has no text form', 2), 'Google files that have no text form')
  assert.equal(I.plural('Photoshop file', 2), 'Photoshop files')
  assert.equal(I.plural('Unity scene', 1), 'Unity scene')
  assert.match(I.unreadLine({ listed: [{ kind: 'a Google file that has no text form' }, { kind: 'a Google file that has no text form' }, { kind: 'Unity bookkeeping' }, { kind: 'Unity bookkeeping' }] }), /^2 Google files that have no text form and 2 Unity bookkeeping files$/)
})

test('task 6 (F233 task 8): the correction\'s again-list never repeats a line', () => {
  const T = 'Type your answer below.'
  assert.deepEqual(E.againLines([{ id: 'any.type', text: T }], { step: 's', line: 'wait', text: T }, 's'), [])
  assert.deepEqual(E.againLines([{ id: 'x', text: 'Hello.' }], { step: 's', line: 'wait', text: T }, 's'), [{ id: 'any.type', text: T }])
  const head = '**Open Ideas**\nA few questions.'
  const q = `${head}\n\n1. Where?\nAnswer in one message.\n\n${T}`
  assert.deepEqual(E.againLines([{ id: 'ideate.open', text: head }], { step: 's', line: 'ideate.open.ask', text: q }, 's'), [{ id: 'ideate.open.ask', text: `1. Where?\nAnswer in one message.\n\n${T}` }])
  assert.deepEqual(E.againLines([{ id: 'ideate.open.ask', text: q }], { step: 's', line: 'ideate.open.ask', text: q }, 's'), [])
  assert.deepEqual(E.againLines([], { step: 'other', line: 'x', text: 'y' }, 's'), [])
})

test('task 6 (F233 task 10): a Drive folder reads its Docs before its art, newest first (the rerun: 200+ old pictures in Archive/ before the rulebook)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-f234-drive-'))
  mkdirSync(join(dir, '.bmuz'))
  const files = { FOLDER0000001: { name: 'Sirius', mimeType: 'application/vnd.google-apps.folder' }, ARCH00000001: { name: 'Archive', mimeType: 'application/vnd.google-apps.folder', parent: 'FOLDER0000001' } }
  for (let i = 0; i < 220; i++) files[`PSD${String(i).padStart(9, '0')}`] = { name: `card${i}.psd`, mimeType: 'image/vnd.adobe.photoshop', parent: 'ARCH00000001', modifiedTime: '2021-03-01T00:00:00Z' }
  files.RULES0000001 = { name: 'Sirius Smugglers - Rules', mimeType: 'application/vnd.google-apps.document', parent: 'FOLDER0000001', text: 'Setup: each player takes a ship.', modifiedTime: '2026-10-01T00:00:00Z' }
  files.RULES0000002 = { name: 'Rules (old)', mimeType: 'application/vnd.google-apps.document', parent: 'FOLDER0000001', text: 'Old rules.', modifiedTime: '2023-01-01T00:00:00Z' }
  const data = join(dir, 'world.json')
  writeFileSync(data, JSON.stringify({ files }))
  mkdirSync(join(dir, 'home'))
  writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify({ pipeline: 'ideate', resultsBy: { material: { links: ['https://drive.google.com/drive/folders/FOLDER0000001'], files: [], pasted: [] } } }))
  const env = { ...process.env, BMUZ_TEST: '1', BMUZ_GWS: join(here, 'fixtures', 'fake-gws.mjs'), FAKE_GWS_DATA: data, HOME: join(dir, 'home'), USERPROFILE: join(dir, 'home') }
  const r = spawnSync('node', [join(plugin, 'scripts', 'ideate-fetch.mjs')], { cwd: dir, encoding: 'utf8', env })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const j = JSON.parse(readFileSync(join(dir, '.planning', 'research', 'shared.json'), 'utf8'))
  assert.deepEqual(j.sources.map(s => s.name), ['Drive · Sirius/Sirius Smugglers - Rules', 'Drive · Sirius/Rules (old)'])
  assert.equal(j.listed.length, 198)
  assert.ok(j.unread.some(u => u.what === 'Drive · Sirius/…' && /more than 200 files/.test(u.why)))
})
