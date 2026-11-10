// No-Claude test of the start's intake (F225, plugin/scripts/intake.mjs): quotes checked against the material,
// the shelves marked "from your material" and never trimmed, the gap map, and the proposal rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildIntake, checkMaterial, gapMap, isVerbatim, normalise, propose } from '../plugin/scripts/intake.mjs'
import { mergeDoc } from '../plugin/scripts/discover-doc.mjs'
import { readShelves } from '../plugin/scripts/define-doc.mjs'
import { digest } from '../plugin/scripts/define-digest.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const DEFINE_KEYS = ['youAre', 'fantasy', 'primaries', 'knowWhen', 'notThis', 'audience', 'story', 'pitch', 'hook', 'anchor', 'coreVerbs', 'mechanisms', 'interactables', 'theme', 'tone', 'pillars', 'musts', 'later', 'should', 'could', 'wont', 'size', 'product', 'risks']
const CONCEPT = 'You are the keeper of a lighthouse on a rocky island. The fun is the quiet care: trimming the wick, winding the clockwork, polishing the lens — while storms roll in.\nA boat makes it home and the night goes quiet. Inspired by Lighthouse: The Game and cosy job sims.'
const q = text => ({ text, his: true })

test('a quote counts as the creative\'s words only when it is in the material (case, quote marks, dashes and markdown ignored)', () => {
  const src = normalise(CONCEPT)
  assert.ok(isVerbatim('the quiet care', src))
  assert.ok(isVerbatim('"You are the keeper of a lighthouse on a rocky island."', src))
  assert.ok(isVerbatim('trimming the wick, winding the clockwork … while storms roll in', src))
  assert.ok(isVerbatim('polishing the lens - while storms roll in', src))
  assert.ok(!isVerbatim('the calm care of a keeper', src)) // reworded
  assert.ok(!isVerbatim('ok', src)) // too short to be a quote
  const { items, notVerbatim, unknown } = checkMaterial({ youAre: [q('You are the keeper of a lighthouse on a rocky island')], primaries: [q('the quiet care')], verbs: ['tend the lamp'], nonsense: ['x'] }, CONCEPT, DEFINE_KEYS)
  assert.deepEqual(items.youAre, [q('You are the keeper of a lighthouse on a rocky island')])
  assert.deepEqual(items.verbs, [{ text: 'tend the lamp' }]) // not in the text: Claude's reading, never "his"
  assert.equal(notVerbatim, 1)
  assert.deepEqual(unknown, ['nonsense'])
})

test('the gap map: covered / partly / not yet per stage, by fixed rules', () => {
  assert.deepEqual(gapMap({}).gaps, { ideate: 'not yet', define: 'not yet', design: 'not yet', develop: 'not yet', deliver: 'not yet', release: 'not yet' })
  const concept = gapMap({ youAre: [q('a')], spark: [q('b')], experiences: [q('c')], primaries: [q('d')] })
  assert.deepEqual([concept.gaps.ideate, concept.gaps.define], ['partly', 'partly'])
  assert.match(concept.why.define, /has the primary feelings; still open: the 3–5 line story, the pillars, the first-release musts/)
  const rulebook = gapMap({ youAre: [q('a')], spark: [q('b')], experiences: [q('c')], tone: [q('t')], verbs: [q('v')], primaries: [q('d')], story: [q('s')], pillars: [q('p')], musts: [q('m')], rules: [q('r')], playtests: [q('x')] })
  // a line in each of four groups is breadth without depth: still "partly"
  assert.deepEqual(rulebook.gaps, { ideate: 'partly', define: 'covered', design: 'covered', develop: 'not yet', deliver: 'not yet', release: 'not yet' })
  const many = n => Array.from({ length: n }, (_, i) => q(`item ${i}`))
  assert.equal(gapMap({ youAre: many(5), experiences: many(5), tone: many(5), verbs: many(5) }).gaps.ideate, 'covered')
  assert.equal(gapMap({ youAre: many(5), experiences: many(5), tone: many(9) }).gaps.ideate, 'partly') // deep, but 3 groups
})

test('the proposal: nothing or a spark → Ideate; a later goal than the material supports catches up first', () => {
  const p = (where, goal, items) => { const { gaps, discoverGot } = gapMap(items); return propose({ where, goal, items, g: gaps, discoverGot }) }
  assert.deepEqual([p('nothing', 'none', {}).stage, p('nothing', 'none', {}).at], ['ideate', 'first'])
  assert.deepEqual([p('spark', 'none', { spark: [q('a')], youAre: [q('b')] }).stage, p('spark', 'none', { spark: [q('a')], youAre: [q('b')] }).at], ['ideate', 'first'])
  // a concept, "pin it down": Define from the start, Ideate offered as "earlier"
  const pin = p('concept', 'pin', { youAre: [q('a')], primaries: [q('calm')] })
  assert.deepEqual([pin.stage, pin.at, pin.catchUp, pin.earlier], ['define', 'digest', null, { stage: 'ideate', at: 'first' }])
  // "work it out" with no pillars or scope: Design needs them, so Define first (the catch-up)
  const work = p('written', 'work', { youAre: [q('a')], primaries: [q('calm')], rules: [q('r')] })
  assert.equal(work.stage, 'define')
  assert.match(work.catchUp, /^Design needs the 3–5 line story, the pillars, the first-release musts; I'll start you in Define to make those first, with everything your material already chose kept in one tap\.$/)
  // "open it up" with material: Ideate at its first step (it shows what was read and asks for the rest)
  const open = p('written', 'open', { youAre: [q('a')], spark: [q('b')], experiences: [q('c')] })
  assert.deepEqual([open.stage, open.at], ['ideate', 'first'])
  assert.match(open.why, /Ideate reads all of your material \(it already touches spark, experience\), writes back the game so far/)
  // the label is off: "build it" from a bare concept goes back to Define
  assert.equal(p('concept', 'build', { youAre: [q('a')], spark: [q('b')] }).stage, 'define')
})

test('buildIntake: the proposal screen, the gap map for all six stages, the material marked where it came from', () => {
  const result = { where: 'concept', goal: 'pin', brief: 'a cosy lighthouse game', slug: 'cosy-lighthouse', material: { youAre: [q('You are the keeper of a lighthouse on a rocky island')], primaries: [q('the quiet care')], experiences: [q('A boat makes it home and the night goes quiet')], reminds: [q('Lighthouse: The Game')], verbs: ['tend the lamp'] } }
  const { json, md, run, screen } = buildIntake({ result, sources: [{ name: 'pasted text', text: CONCEPT }], defineKeys: DEFINE_KEYS, date: '2026-11-09', key: 'k1' })
  assert.equal(json.proposal.stage, 'define')
  assert.deepEqual(json.given.primaries, [q('the quiet care')])
  assert.equal(json.given.brief, 'a cosy lighthouse game')
  assert.equal(json.given.slug, 'cosy-lighthouse')
  assert.match(md, /^## Proposal\n\*\*What I read:\*\*\n- "a cosy lighthouse game"\n- "You are the keeper/m)
  for (const s of ['Ideate (the material)', 'Define (the blocks)', 'Design (assembling them)', 'Develop (the production model)', 'Deliver (ready to hand over)', 'Release (the public)']) assert.match(md, new RegExp(`\\n- ${s.replace(/[()]/g, '\\$&')}: (covered|partly|not yet) — `))
  assert.match(md, /\*\*Where I'd start you:\*\* Define · digest — You asked to pin it down/)
  assert.match(md, /## Options\n- Start there: Define · digest\n- Start earlier: Ideate\n- Somewhere else\n/)
  // F228: the screen the engine shows before "Start there?": the proposal only, no options, no material list
  assert.match(screen, /^## Where you're starting — a cosy lighthouse game\n\*\*What I read:\*\*\n/)
  assert.match(screen, /\*\*Where I'd start you:\*\* Define · digest/)
  assert.ok(!/## Options|## The material/.test(screen))
  assert.equal(buildIntake({ result: { where: 'nothing' }, sources: [], defineKeys: DEFINE_KEYS, date: '2026-11-09' }).screen, '')
  assert.deepEqual(json.pasted, [])
  // DISCOVER.md: every Discover item on its shelf, quotes marked "from your material", the rest Claude's reading
  const doc = mergeDoc(null, run).text
  assert.match(doc, /\n- Situation: "A boat makes it home and the night goes quiet" — run 1 · from your material\n/)
  assert.match(doc, /\n- tend the lamp — run 1 · Claude's reading of your material\n/)
  assert.match(doc, /\n- From your material: pasted text\n/)
  // one vocabulary (F225 task 6): Discover gathers material, Define makes the blocks
  assert.match(doc, /\nBMUZ collects the material for the game's building blocks here; nothing in this file is chosen\. Define makes the blocks from it\./)
  assert.match(doc, /\n- Material added: \[Spark\]/)
  assert.ok(!/brick/i.test(doc))
  assert.ok(!/the quiet care/.test(doc)) // a Define block isn't Discover material: it rides in "given"
  // Define's digest reads the marks as the creative's own words
  const shelves = readShelves(doc)
  const exp = shelves.shelves.find(s => s.name === 'Experience goals').bricks[0]
  assert.deepEqual([exp.source, exp.label], ['material', 'Situation'])
  assert.match(digest(shelves, null, '2026-11-09').text, /their words, from their material/)
})

test('the intake never trims: merged into an existing DISCOVER.md, every line stays and only new ones are added', () => {
  const before = readFileSync(join(here, 'fixtures', 'lighthouse-discover', 'DISCOVER.md'), 'utf8')
  const { run } = buildIntake({ result: { where: 'written', goal: 'open', brief: 'the lighthouse again', material: { experiences: [q('A boat makes it home and the night goes quiet')] } }, sources: [{ name: 'notes.md', text: CONCEPT }], defineKeys: DEFINE_KEYS, date: '2026-11-10', key: 'k2' })
  const after = mergeDoc(before, run).text.split('\n')
  // (the Seed line is the engine's own: its "last run" date moves on with every run)
  for (const line of before.split('\n').filter(l => !/^Seed:/.test(l))) assert.ok(after.includes(line) || after.some(l => l.startsWith(line.trimEnd() + ' · ')), `kept: ${line.slice(0, 80)}`)
  assert.ok(after.some(l => /from your material$/.test(l)))
  // saved twice (a crash between writing and the engine's record): nothing added twice
  assert.equal(mergeDoc(mergeDoc(before, run).text, run).already, true)
})

test('the script: reads the files named, says plainly what it can\'t read, writes intake.json, intake.md and DISCOVER.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-intake-'))
  try {
    mkdirSync(join(dir, '.bmuz'))
    writeFileSync(join(dir, 'rules.md'), '# Tidekeeper rules\nYou are the keeper of a lighthouse.\nEach night, draw 3 weather cards; spend oil to keep the lamp lit.\nPillars: quiet care; nobody loses.\n')
    const opening = { where: 'written', goal: 'work', brief: 'Tidekeeper', slug: 'tidekeeper', pasted: [], files: ['rules.md', 'deck.pdf', 'https://docs.google.com/x', '../secret.md'], material: { youAre: [q('You are the keeper of a lighthouse.')], rules: [q('Each night, draw 3 weather cards; spend oil to keep the lamp lit.')], pillars: [q('quiet care'), q('nobody loses')] } }
    writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify({ pipeline: 'start', results: opening, resultsBy: { opening }, finished: ['opening'] }))
    const r = spawnSync('node', [join(here, '..', 'plugin', 'scripts', 'intake.mjs')], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /✔ intake: 1 sources/)
    const json = JSON.parse(readFileSync(join(dir, '.planning', 'research', 'intake.json'), 'utf8'))
    assert.deepEqual(json.unreadable.map(u => u.path), ['deck.pdf', 'https://docs.google.com/x', '../secret.md'])
    assert.equal(json.gaps.design, 'partly')
    assert.equal(json.proposal.stage, 'define') // "work it out" without a story or musts: Define first
    assert.deepEqual(json.given.pillars, [q('quiet care'), q('nobody loses')])
    const md = readFileSync(join(dir, '.planning', 'research', 'intake.md'), 'utf8')
    assert.match(md, /not readable yet: deck\.pdf \(not a text file yet: paste its text instead\), https:\/\/docs\.google\.com\/x \(a link: Ideate reads it \(Google Drive folders and docs\), or paste its text\)/)
    assert.match(md, /Design needs the primary feelings, the 3–5 line story, the first-release musts; I'll start you in Define/)
    assert.match(md, /- Ideate \(the material\): partly — 1 piece of material, touching spark \(1 of 6\)/)
    assert.match(readFileSync(join(dir, '.planning', 'research', 'intake-proposal.md'), 'utf8'), /^## Where you're starting — Tidekeeper\n/)
    assert.match(readFileSync(join(dir, '.planning', 'DISCOVER.md'), 'utf8'), /\n- "You are the keeper of a lighthouse\." — run 1 · from your material\n/)
    assert.ok(existsSync(join(dir, '.planning', 'research', 'intake.md')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
