// No-Claude tests of Define's scripts (F218): the digest, the write step (GDD Part 1 + DISCOVER.md marks),
// the concept lint and the stage step. Shelves are never trimmed, hand edits are kept, a second run logs its
// changes, the lint refuses what it should, and stage refuses while the core parts are open.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OPEN, allBricks, annotateDiscover, brickRefs, chosen, mergeGdd, readShelves } from '../plugin/scripts/define-doc.mjs'
import { digest } from '../plugin/scripts/define-digest.mjs'
import { lintConcept } from '../plugin/scripts/concept-lint.mjs'
import { stage } from '../plugin/scripts/define-stage.mjs'

const scripts = fileURLToPath(new URL('../plugin/scripts/', import.meta.url))
const DEFINE = JSON.parse(readFileSync(new URL('../plugin/pipelines/define.json', import.meta.url), 'utf8'))

// A small DISCOVER.md in discover-doc.mjs's layout: provenance tails, labels, a hand-added line, a creative's note.
const DISCOVER = [
  '# Discover',
  'Seed: You are a lighthouse keeper · "a cosy game about running a lighthouse" (the creative\'s words) · last run 2026-11-09',
  '',
  'BMUZ collects the bricks here; nothing in this file is chosen.',
  '',
  '## Shelves (cumulative — every run adds; nothing is chosen here)',
  '### Spark — what excites, why',
  '- "a cosy game about running a lighthouse" — run 1 · the creative\'s words',
  '',
  '### Experience goals — candidate situations',
  '- Situation: Waiting out a storm with tea while the lamp turns — run 1 · Claude\'s suggestion',
  '- Situation: Guiding a small boat past the rocks — run 1 · picked by the creative',
  '- Fantasy: I want to keep a light others depend on — run 1 · Claude\'s suggestion',
  '- Keepers stood night watches of three to four hours — run 1 · [Keepers FAQ](https://nps.example/faq) · several sources',
  'My own note in the middle of a shelf, kept as it is.',
  '',
  '### Verbs — theme word → outcome form',
  '- trim → keep a resource from running down — run 1 · Claude\'s suggestion',
  '- my hand-added verb: polish',
  '',
  '### Mechanism shelf — outcome verb → candidates',
  '- Feels like the verb: trim: a routine check of the lamp — run 1 · Claude\'s suggestion',
  '- Feels pasted on: overlapping timers — run 1 · Claude\'s suggestion',
  '',
  '### On ice — ideas held for Define',
  '- a radio to talk to ships — run 1 · Theme dig research',
  '- an automated beacon — run 1 · Theme dig research',
  '',
  '## Runs (newest first)',
  '',
  '### Run 1 — 2026-11-09 — a cosy game about running a lighthouse',
  '- Bricks added: lots',
  '',
].join('\n')

const STEPS = DEFINE.steps
const ALL_TALK = ['direction', 'story', 'bricks', 'pillars', 'tensions', 'scope', 'risks']
const FULL = {
  direction: { youAre: [{ text: 'You are the keeper of a small island light', his: true }], fantasy: [{ text: 'I want to keep a light others depend on', brick: 'EX3' }], primaries: [{ text: 'quiet care — waiting out a storm with tea', his: true, brick: 'EX1' }], knowWhen: ['they linger after the boat is safe'], notThis: ['a stressful time-management game'], audience: ['someone unwinding after work'] },
  story: { story: ['You keep a small light on a rocky island.', 'You trim and polish so it never goes dark.', 'When fog rolls in, boats find their way.'], pitch: ['A cosy lighthouse game where care keeps boats safe'], hook: ['the light pattern is yours'], anchor: ['a daily routine'] },
  bricks: { coreVerbs: [{ verb: 'trim', outcome: 'keep a resource from running down', brick: 'VE1' }], mechanisms: [{ verb: 'trim', lead: 'a routine check of the lamp', leadBrick: 'ME1' }], interactables: ['the lamp'], theme: ['lighthouse keeping'], tone: ['cosy'] },
  pillars: { pillars: [{ pillar: 'Every moment is quiet care', kind: 'feeling', settles: 'when we argue about timers, no rush' }, { pillar: 'A real keeper did it', kind: 'theme rule', settles: 'when we argue about magic, stay real' }, { pillar: 'The storm is weather, not an enemy', kind: 'situation', settles: 'when we argue about losing, nobody loses' }] },
  tensions: { resolved: [{ tension: 'boats ↔ no rush', choice: 'keep both', note: 'boats wait' }], broughtIn: [{ text: 'a radio to talk to ships', brick: 'OI1' }], parked: [{ idea: 'an automated beacon', where: 'another game', brick: 'OI2' }] },
  scope: { musts: ['tend the lamp through one night'], later: ['seasons'], should: [], could: ['a cat'], wont: [{ what: 'combat', why: 'against pillar 1' }], size: ['small: rough read'], product: { platform: 'phone browser', played: 'alone', session: '10 minutes', players: '1' } },
  risks: { risks: [{ risk: 'tending becomes a chore', test: 'sketch: one night of tending (1 hour)', rethink: 'testers skip it', status: 'open' }] },
}
const stateOf = (resultsBy, over = {}) => ({ pipeline: 'define', finished: ['digest', ...Object.keys(resultsBy), 'fit-check'], skipped: [], resultsBy, results: {}, ...over })

function runOnce(discoverText, gddText, resultsBy, n = 1, date = '2026-11-09', over = {}) {
  const doc = readShelves(discoverText)
  const { results, by } = chosen(STEPS, stateOf(resultsBy, over))
  const bricks = new Map(allBricks(doc).map(b => [b.id, b]))
  const refs = brickRefs(results, by)
  let unmatched = 0
  for (const id of [...refs.keys()]) if (!bricks.has(id)) { refs.delete(id); unmatched++ }
  const gdd = mergeGdd(gddText, { n, discoverRuns: doc.discoverRuns, date, results, by, bricks, refs, unmatched, brief: doc.brief })
  const ann = annotateDiscover(discoverText, doc, refs, n)
  return { gdd, discover: ann.text, marked: ann.marked }
}

// Every line of the old DISCOVER.md is still there, word for word up to any mark added at its end.
const neverTrimmed = (before, after) => {
  const now = after.split('\n')
  return before.split('\n').every((l, i) => now[i] === l || now[i].startsWith(`${l.trimEnd()} · `))
}

test('digest: groups each shelf by its labels then research, ids per shelf, counts; DISCOVER.md only read', () => {
  const d = digest(readShelves(DISCOVER), null, '2026-11-09')
  assert.match(d.text, /^Define run: 1 \(the first Define run\)$/m)
  assert.match(d.text, /^- Experience goals \[EX\]: 4 \(picked by the creative 1 · Claude's suggestion 2 · research 1\)$/m)
  assert.match(d.text, /#### Situation \(2\)\n- \[EX1\] Waiting out a storm with tea while the lamp turns \(Claude\)\n- \[EX2\] Guiding a small boat past the rocks \(they picked it\)/)
  assert.match(d.text, /#### From research \(1\)\n- \[EX4\] Keepers stood night watches/)
  assert.ok(d.text.indexOf('#### From research') > d.text.indexOf('#### Fantasy'), 'research comes after the labels')
  assert.match(d.text, /- \[VE2\] my hand-added verb: polish \(added by hand\)/)
  assert.match(d.text, /## Tensions Discover flagged\n- \[ME2\] Feels pasted on: overlapping timers/)
  assert.equal(d.revision, false)
})

test('write: a new GDD gets the layout (Part 1 / Part 2 / Open questions / Changes); chosen bricks are marked, never trimmed', () => {
  const r = runOnce(DISCOVER, null, FULL)
  const g = r.gdd.text
  for (const h of ['## Part 1 — The concept', '### The story', '### Experience targets', '### Pillars', '### Made of', '### Scope per release', '### Product', '### Risks & probes', '### Not this game, for now', '## Part 2 — The game', '## Open questions', '## Changes']) assert.ok(g.includes(`\n${h}`), h)
  assert.match(g, /^Current phase: Define · Define run 1 · read DISCOVER\.md through Discover run 1$/m)
  assert.match(g, /\*\*Pillars:\*\*\n1\. Every moment is quiet care \(feeling\) — settles: when we argue about timers, no rush\n2\./)
  assert.match(g, /\*\*Mechanisms:\*\*\n- trim — lead: a routine check of the lamp\n/) // no backup asked for, none shown
  assert.match(g, /\*\*Platform:\*\* phone browser/)
  assert.match(g, /## Open questions\n- tending becomes a chore: sketch: one night of tending \(1 hour\) \(a probe from Define run 1\) · status: open/)
  assert.match(g, /- 2026-11-09 · Concept written \(Part 1\): \d+ fields chosen; still open: Should · /)
  assert.match(g, /Tension: boats ↔ no rush → keep both: boats wait/)
  assert.ok(neverTrimmed(DISCOVER, r.discover), 'every DISCOVER.md line is still there')
  assert.match(r.discover, /Waiting out a storm with tea while the lamp turns — run 1 · Claude's suggestion · → chosen \(Define run 1: direction\)/)
  assert.match(r.discover, /trim → keep a resource from running down — run 1 · Claude's suggestion · → chosen \(Define run 1: bricks\)/)
  assert.match(r.discover, /a radio to talk to ships — run 1 · Theme dig research · → brought in \(Define run 1\)/)
  assert.match(r.discover, /an automated beacon — run 1 · Theme dig research · parked \(Define run 1: another game\)/)
  assert.match(g, /\*\*From the shelves:\*\* Define run 1 chose 5 bricks/)
  assert.deepEqual(lintConcept(g, r.discover).problems, [])
})

test('write: a run saved twice adds nothing twice (same Changes, same marks)', () => {
  const one = runOnce(DISCOVER, null, FULL)
  const two = runOnce(one.discover, one.gdd.text, FULL)
  assert.equal(two.gdd.text, one.gdd.text)
  assert.equal(two.discover, one.discover)
  assert.equal(two.marked, 0)
})

test('write: a second run keeps hand edits and fields it did not choose, changes what it chose, and logs it under Changes', () => {
  const one = runOnce(DISCOVER, null, FULL)
  // The creative's hand edits: the pitch rewritten, a line of their own in Part 2, a subsection of their own in Part 1.
  const edited = one.gdd.text
    .replace('**Pitch:** A cosy lighthouse game where care keeps boats safe', '**Pitch:** My own pitch, edited by hand')
    .replace('Design writes this: how it plays, systems, look & sound.', 'Design writes this: how it plays, systems, look & sound.\nMy Part 2 notes.')
    .replace('### Not this game, for now', '### My moodboard\n- grey sea, warm window\n\n### Not this game, for now')
  // Run 2: only the pillars step chose again (every other key "keep" = []).
  const keep = Object.fromEntries(ALL_TALK.map(id => [id, Object.fromEntries(Object.keys(FULL[id]).map(k => [k, k === 'product' ? {} : []]))]))
  keep.pillars = { pillars: [...FULL.pillars.pillars.slice(0, 2), { pillar: 'Every storm passes', kind: 'situation', settles: 'when we argue about game over, there is none' }], whyChanged: 'the storm felt like an enemy' }
  const two = runOnce(one.discover, edited, keep, 2, '2026-11-10')
  const g = two.gdd.text
  assert.match(g, /\*\*Pitch:\*\* My own pitch, edited by hand/)
  assert.match(g, /My Part 2 notes\./)
  assert.match(g, /### My moodboard\n- grey sea, warm window/)
  assert.match(g, /3\. Every storm passes \(situation\)/)
  assert.ok(!g.includes('The storm is weather, not an enemy'))
  assert.match(g, /- 2026-11-10 · Pillars: "Pillars" changed · why: the storm felt like an enemy \(step pillars\) · Define run 2/)
  assert.equal((g.match(/Concept written/g) || []).length, 1, 'the first run\'s Changes line is kept, not repeated')
  assert.match(g, /^Current phase: Define · Define run 2/m)
  assert.ok(neverTrimmed(one.discover, two.discover))
  assert.equal(two.marked, 0, 'run 2 chose no new bricks')
})

test('write: an older GDD without the layout gets Part 1 on top; everything it had is kept below as Part 2', () => {
  const old = '# Moon Goat — Game Design Document\n\n## Core Loop\nJump on moons.\n\n## Open Questions\n- how high?\n'
  const g = runOnce(DISCOVER, old, FULL).gdd.text
  assert.ok(g.startsWith('# Moon Goat — Game Design Document\nCurrent phase: Define · Define run 1'))
  assert.ok(g.indexOf('## Part 1 — The concept') < g.indexOf('## Part 2 — The game'))
  assert.ok(g.indexOf('## Part 2 — The game') < g.indexOf('## Core Loop\nJump on moons.'))
  assert.match(g, /## Open Questions\n- how high\?\n- tending becomes a chore/)
  assert.equal((g.match(/^## Open questions/gim) || []).length, 1)
  assert.match(g, /\n## Changes\n/)
})

test('write: a wrap-up after direction leaves the rest open, said plainly; the lint passes it', () => {
  const r = runOnce(DISCOVER, null, { direction: FULL.direction }, 1, '2026-11-09', { skipped: ['story', 'bricks', 'pillars', 'fit-check', 'tensions', 'scope', 'risks'] })
  assert.match(r.gdd.text, new RegExp(`\\*\\*Story:\\*\\* ${OPEN}`))
  assert.match(r.gdd.text, /\*\*Primary feelings:\*\*\n- quiet care/)
  assert.deepEqual(lintConcept(r.gdd.text, r.discover).problems, [])
})

test('lint: refuses a missing heading, a 6-line story, a pillar that settles nothing, a won\'t without a reason, a risk without a test, a brick count that disagrees', () => {
  const r = runOnce(DISCOVER, null, FULL)
  const ok = r.gdd.text
  const bad = [
    [ok.replace('### Product\n', ''), /no "### Product" heading/],
    [ok.replace('- When fog rolls in, boats find their way.', '- a\n- b\n- c\n- d'), /the story has 6 lines; it needs 3 to 5/],
    [ok.replace(' — settles: when we argue about magic, stay real', ''), /pillar 2 doesn't say which argument it settles/],
    [ok.replace('combat — why: against pillar 1', 'combat'), /the won't "combat" has no reason/],
    [ok.replace('→ test: sketch: one night of tending (1 hour) ', '→ test: not named '), /the risk "tending becomes a chore" has no cheapest test/],
    [ok.replace('**Pitch:** A cosy lighthouse game where care keeps boats safe', '**Pitch:**'), /The story: \*\*Pitch:\*\* is empty/],
    [ok.replace('Define run 1 chose 5 bricks', 'Define run 1 chose 9 bricks'), /says Define run 1 chose 9 bricks, but .*marks 5/],
  ]
  for (const [text, why] of bad) {
    const out = lintConcept(text, r.discover)
    assert.ok(out.problems.some(p => why.test(p)), `${why}: got ${JSON.stringify(out.problems)}`)
  }
  assert.match(lintConcept(ok.replace(/\n3\. The storm[^\n]*/, ''), r.discover).warnings.join(), /there are 2 pillars; 3 is usual/)
  assert.match(lintConcept(null, r.discover).problems[0], /doesn't exist/)
})

test('stage: refuses in plain words while the core parts are open, naming the earliest step; moves to Design once', () => {
  const open = runOnce(DISCOVER, null, { direction: FULL.direction, story: FULL.story })
  const no = stage(open.gdd.text, '2026-11-09')
  assert.equal(no.ok, false)
  assert.equal(no.why, 'Not ready for Design: the pillars (step "pillars"), the first release\'s musts (step "scope") are still open. Design builds on them, so choose them first: say "bmuz undo pillars" to go back to that step, or run define again.')
  const full = runOnce(DISCOVER, null, FULL).gdd.text
  const yes = stage(full, '2026-11-09')
  assert.equal(yes.ok, true)
  assert.match(yes.text, /^Current phase: Design · concept locked 2026-11-09 \(Define run 1\)$/m)
  assert.match(yes.text, /## Changes\n[\s\S]*- 2026-11-09 · Concept locked; on to Design · the creative chose "Lock it" · Define run 1 → Design\n/)
  assert.equal(stage(yes.text, '2026-11-09').text, yes.text, 'staging twice changes nothing')
})

// The scripts as the engine runs them: in the project folder, reading bmuz.json and .bmuz/state.json.
test('the commands: digest → write → lint → stage in a project folder; nothing written outside .planning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-define-'))
  try {
    mkdirSync(join(dir, '.planning'), { recursive: true })
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'define' }))
    writeFileSync(join(dir, '.planning', 'DISCOVER.md'), DISCOVER)
    const run = (s, args = []) => spawnSync('node', [join(scripts, s), ...args], { cwd: dir, encoding: 'utf8' })
    assert.match(run('define-digest.mjs').stdout, /✔ \.planning\/research\/define-digest\.md: Define run 1 — 11 bricks grouped/)
    writeFileSync(join(dir, '.bmuz', 'state.json'), JSON.stringify(stateOf(FULL)))
    assert.match(run('define-doc.mjs').stdout, /✔ \.planning\/GDD\.md: Define run 1 — chosen now: \d+, changed: 0, still open: 1 · \.planning\/DISCOVER\.md: 6 bricks marked/)
    assert.equal(run('concept-lint.mjs', ['.planning/GDD.md']).status, 0)
    const st = run('define-stage.mjs')
    assert.equal(st.status, 0, st.stdout)
    // a second define run is a revision: the digest says so and lists what is locked
    const d2 = run('define-digest.mjs')
    assert.match(d2.stdout, /Define run 2 \(a revision\)/)
    assert.match(readFileSync(join(dir, '.planning', 'research', 'define-digest.md'), 'utf8'), /## Already locked \(GDD Part 1, as it stands\)\n### The story\n\*\*Story:\*\*\n- You keep a small light/)
    // bmuz.json is re-checked before its name goes into a path
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: '../../x' }))
    assert.match(run('define-doc.mjs').stdout, /bmuz\.json "pipeline" isn't a plain pipeline name/)
    const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => join(e.parentPath ?? e.path, e.name).slice(dir.length + 1).split('\\').join('/'))
    assert.deepEqual(files.filter(f => !/^(\.planning\/|\.bmuz\/|bmuz\.json$)/.test(f)), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the commands: no DISCOVER.md is refused in plain words', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-define-'))
  try {
    const r = spawnSync('node', [join(scripts, 'define-digest.mjs')], { cwd: dir, encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stdout, /DISCOVER\.md is missing .*Run discover first\./)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
