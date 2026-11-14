// F232 task 3: Ideate rebuilt to the approved script's 1.0–1.7. No-Claude tests of the pipeline's shape and of
// ideate.mjs (1.3 The Game So Far, the steps' additions to the GDD, 1.7 Your Project Page), on the script's own
// made-up example: the garden race.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'
import * as G from '../plugin/scripts/gdd.mjs'
import * as I from '../plugin/scripts/ideate.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const P = JSON.parse(readFileSync(join(plugin, 'pipelines', 'ideate.json'), 'utf8'))
const script = E.parseScript(readFileSync(join(plugin, 'script.md'), 'utf8'))
// The script's example (bmuz-design-doc.html, "Example · Ideate, filled in").
// (F233 task 5, 6b) approved lines no step says any more: "really vague and doesn't offer enough guidance" ·
// "a bad question. we should consider removing it" (live look 2026-11-13); ideate.pool.first replaces the first
// (F235 task 2: where it's played and who plays are asked once, in Define's Platform & Play, never in Ideate too)
const RETIRED = ['ideate.pool.smallest', 'ideate.pool.decided', 'ideate.pool.where', 'ideate.digital.who']
export const GARDEN_IDEA ="A card game where two friends race to grow the best garden. You draw seed cards and plant them, but weather cards can wreck the other person's rows. I'd like it on phones, quick games."

test('the pipeline is the script\'s Stage 1: 1.1–1.7 in order, every Ideate line said by a step, openings first, the gates (1.3, 1.7) as script boxes', () => {
  assert.deepEqual(E.checkPipeline(P), [])
  assert.deepEqual(E.checkLines(P, script), [])
  // (F233: the conversion path's 1.4 has its own title; the new-idea path's titles are the script's)
  const titled = [...new Map(P.steps.filter(s => s.no && s.when !== '{convert}').map(s => [s.no, s.title])).entries()]
  assert.deepEqual(titled, [['1.1', 'Your Idea'], ['1.2', 'Your Material'], ['1.3', 'The Game So Far'], ['1.4', 'Feelings & Hopes'], ['1.5', 'Open Ideas'], ['1.6', 'Sketch List'], ['1.7', 'Your Project Page']])
  const said = new Set(P.steps.flatMap(s => s.lines || []))
  // ideate.sofar and ideate.page are composed by the script steps (shown word for word), not said by Claude
  for (const id of Object.keys(script.lines).filter(id => id.startsWith('ideate.') && !['ideate.sofar', 'ideate.sofar.rules', 'ideate.page', ...RETIRED].includes(id))) assert.ok(said.has(id), id)
  // (F233 task 5, 6b: Muzzy found these two vague in the live look; kept in the script, said by no step)
  for (const id of RETIRED) assert.ok(!said.has(id), id)
  const step = id => P.steps.find(s => s.id === id)
  assert.deepEqual(step('idea').opening, ['ideate.welcome', 'ideate.idea'])
  assert.deepEqual(step('material').opening, ['ideate.material'])
  assert.deepEqual(step('next').opening, ['ideate.next'])
  assert.deepEqual(step('ready').opening, ['ideate.ready'])
  assert.equal(step('next').wrapTo, 'page', '"Jump to Define" skips to the project page')
  assert.ok(step('page').always && step('ready').always)
  assert.equal(step('so-far').show, I.SO_FAR)
  assert.equal(step('page').show, I.PAGE_MD)
  // the start is folded in: no "where's your game?" step; on to Define is the creative's pick at 1.7
  assert.deepEqual(P.next, { pipeline: '{onward}', ask: false })
  assert.ok(!P.steps.some(s => /where/i.test(s.id)))
  assert.equal(E.stepPlace(P, step('open-ideas')), 'Ideate · 5 of 7 · Open Ideas')
})

function project(read, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-ideate-'))
  mkdirSync(join(dir, '.bmuz'))
  mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
  const state = { pipeline: 'ideate', resultsBy: { idea: { idea: GARDEN_IDEA, spark: '', unsure: false, name: '' }, read, ...extra } }
  writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify(state))
  writeFileSync(join(dir, '.bmuz/journal.jsonl'), JSON.stringify({ ev: 'answer', step: 'idea', line: 'ideate.idea', via: 'typed', text: GARDEN_IDEA }) + '\n')
  writeFileSync(join(dir, '.planning/research/shared.json'), JSON.stringify({ version: 1, sources: [{ name: 'your one-breath answer', text: GARDEN_IDEA }], listed: [], unread: [] }))
  return { dir, state }
}

// The reading the script's example shows (Already clear · Your ideas · Still open).
const GARDEN_READ = {
  name: 'Garden Race',
  stands: 'a concept',
  sofar: {
    3: { fixed: [{ text: 'two friends race to grow the best garden', his: true }], ideas: [], open: [] },
    4: { fixed: [{ text: 'draw seed cards and plant them', his: true }], ideas: [{ text: 'a shared deck of seeds and weather', his: false }], open: [] },
    5: { fixed: [{ text: 'on phones, quick games', his: true }], ideas: [], open: ['Against a friend in the same room, online, or both?'] },
    8: { fixed: [], ideas: [{ text: "weather cards can wreck the other person's rows", his: true }], open: ['How does a game end and who wins?', 'What makes a garden "best"?'] },
    2: { fixed: [{ text: 'Quick rivalry', his: false }] },
    1: { fixed: [{ text: 'the thrill of a close race', his: true }] },
  },
}

test('1.3 The Game So Far: quotes checked, the GDD written (loose; the pillars stay empty), the message composed from the script word for word', () => {
  const { dir, state } = project(GARDEN_READ)
  const r = I.soFar(dir, state, script)
  const gdd = readFileSync(join(dir, '.planning/GDD.md'), 'utf8')
  const ch = G.readGdd(gdd)
  assert.equal(G.gameName(gdd), 'Garden Race')
  for (const n of [3, 4, 5, 8]) assert.equal(ch[n].level, 'loose', `chapter ${n}`)
  assert.equal(ch[2].level, 'empty', 'pillars stay empty in Ideate')
  assert.equal(ch[2].text, G.NOTHING)
  // "the thrill of a close race" isn't in their words: kept as my reading
  assert.equal(r.notQuoted, 1)
  assert.match(ch[1].text, /Clear: the thrill of a close race \(my reading\)/)
  assert.match(ch[3].text, /^- Clear: "two friends race to grow the best garden"$/)
  assert.match(ch[8].text, /- Idea: "weather cards can wreck the other person's rows"\n- Open: How does a game end and who wins\?/)
  assert.deepEqual(G.readList(gdd, 'Open Questions').slice(0, 2), ['Against a friend in the same room, online, or both? (Platform & Play Structure)', 'How does a game end and who wins? (Rulebook)'])
  // the message: the script's line, filled
  const msg = readFileSync(join(dir, I.SO_FAR), 'utf8')
  const fixedParts = ['**The Game So Far**', "Here's your game as I understand it, from your idea. Your own words are in quotes; anything I've worked out myself is marked \"my reading\". Nothing here is decided yet.", '**Already clear**', '**Your ideas**', '**Still open**', '**Where it stands:** a concept.', 'The full version is on your project page: file:///']
  for (const f of fixedParts) assert.ok(msg.includes(f), f)
  assert.match(msg, /\*\*Already clear\*\*\n· "two friends race to grow the best garden"\n· "draw seed cards and plant them"\n· "on phones, quick games"\n· the thrill of a close race \(my reading\)\n/)
  assert.match(msg, /\*\*Your ideas\*\*\n· a shared deck of seeds and weather \(my reading\)\n· "weather cards can wreck the other person's rows"\n/)
  assert.match(msg, /\*\*Still open\*\*\n· Against a friend in the same room, online, or both\? \(Platform & Play Structure\)\n· How does a game end and who wins\? \(Rulebook\)\n· nothing yet \(The Core Loop\)|\*\*Still open\*\*\n· Against a friend/)
  assert.equal(r.jump, false, 'feelings, pitch and core loop not all clear yet')
  assert.equal(JSON.parse(readFileSync(join(dir, I.SO_FAR_JSON), 'utf8')).jump, false)
  // the page exists and shows the chapters
  assert.match(readFileSync(join(dir, G.PAGE), 'utf8'), /3 · The Pitch <span class="chip loose">loose<\/span>/)
})

test('1.3: "Jump to Define" is offered only when the material already covers the feelings, pitch and core loop', () => {
  const read = JSON.parse(JSON.stringify(GARDEN_READ))
  read.sofar[1] = { fixed: [{ text: 'quick games', his: true }] }
  const { dir, state } = project(read)
  const r = I.soFar(dir, state, script)
  assert.equal(r.jump, true)
  const j = JSON.parse(readFileSync(join(dir, I.SO_FAR_JSON), 'utf8'))
  assert.equal(j.covers, 'your notes already cover the feelings, pitch and core loop')
  const box = E.renderLine(script, 'ideate.next', { jump: j.jump, covers: j.covers })
  assert.deepEqual(box.box.options.map(o => o.label), ['Carry on in Ideate (Recommended)', 'Jump to Define', 'I need to correct something'])
})

test('where it stands is worked out, never asked: from the reading, else from what was shared', () => {
  assert.equal(I.standsFrom({}, {}, 'a concept with some rules written down.'), 'a concept with some rules written down')
  assert.equal(I.standsFrom({}, { listed: [{ name: 'Game.unity', kind: 'a Unity scene' }] }), 'a prototype')
  assert.equal(I.standsFrom({ 8: { fixed: [1, 2], ideas: [] } }, {}), 'a concept with some rules written down')
  assert.equal(I.standsFrom({}, {}), 'nothing yet')
  assert.equal(I.unreadLine({ listed: [{ name: 'a.psd', kind: 'a Photoshop file (art)' }, { name: 'b.psd', kind: 'a Photoshop file (art)' }] }), '2 Photoshop files')
})

test('1.4–1.6: each step adds to its chapters (nothing replaced, nothing twice, never the pillars); sketches go on the list as S01, S02…', () => {
  const { dir, state } = project(GARDEN_READ)
  I.soFar(dir, state, script)
  state.resultsBy.feelings = { chapters: { 1: [{ text: 'your best row survives the hailstorm', his: true }], 7: ['Open: Could it turn mean when weather only hits the loser?'], 2: ['Quick rivalry'] }, moments: ['your best row survives the hailstorm'], questions: [] }
  state.resultsBy.sketches = { sketches: [{ name: 'Weather sting', question: 'Does wrecking a row feel fun or mean?' }, { name: 'Three-minute race', question: 'Is three minutes long enough to feel close?' }] }
  writeFileSync(join(dir, '.bmuz/journal.jsonl'), [JSON.stringify({ ev: 'answer', step: 'feelings', text: 'When your best row survives the hailstorm.' }), ''].join('\n'), { flag: 'a' })
  const f = I.addStep(dir, state, 'feelings')
  assert.deepEqual(f.touched, [1, 7])
  I.addStep(dir, state, 'feelings') // twice: nothing added twice
  const s = I.addStep(dir, state, 'sketches')
  assert.deepEqual(s.added.Sketches, ['S01 Weather sting — answers: Does wrecking a row feel fun or mean?', 'S02 Three-minute race — answers: Is three minutes long enough to feel close?'])
  const ch = G.readGdd(readFileSync(join(dir, '.planning/GDD.md'), 'utf8'))
  assert.equal(ch[1].text.split('\n').length, 2, 'the reading kept, the moment added once')
  assert.match(ch[1].text, /Idea: "your best row survives the hailstorm"/)
  assert.equal(ch[7].level, 'loose')
  assert.equal(ch[2].level, 'empty')
})

test('1.7 Your Project Page: opened (never in a test run), and the message composed from the script with the counts and the three questions that matter most for Define', () => {
  const { dir, state } = project(GARDEN_READ)
  I.soFar(dir, state, script)
  state.resultsBy.sketches = { sketches: [{ name: 'Weather sting', question: 'Fun or mean?' }, { name: 'Three-minute race', question: 'Close enough?' }] }
  I.addStep(dir, state, 'sketches')
  const r = I.page(dir, state, script, { BMUZ_TEST: '1' })
  assert.match(r.opened, /^test run: would open file:\/\//)
  assert.equal(r.sketches, 2)
  assert.equal(r.loose, 5)
  const msg = readFileSync(join(dir, I.PAGE_MD), 'utf8')
  assert.ok(msg.startsWith('**Your Project Page**\nThis is your game\'s home page. It opens in your browser and updates itself after every step, so you never need to edit it. On it:'))
  assert.match(msg, /Type \/ppp any time to open it again\.\n\n\*\*Ideate is done\.\*\* Since you started, 5 chapters went from empty to loose, and 2 sketches are on the list\.\nThe three questions that matter most for Define:\n1\. Against a friend in the same room, online, or both\? \(Platform & Play Structure\)\n2\. How does a game end and who wins\? \(Rulebook\)/)
})
