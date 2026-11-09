// No-Claude test of the research flow (plugin/workflows/research-flow.js): the script runs with fake
// helpers, so the lens, merge and brick rules are checked without a session or the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkReport } from '../plugin/scripts/check-sources.mjs'
import { parseReport } from '../plugin/scripts/discover-doc.mjs'

const SCRIPT = readFileSync(new URL('../plugin/workflows/research-flow.js', import.meta.url), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?\n\}\n/, '') // meta is for Claude Code; the body is what runs

// Runs the flow body. answer(prompt, opts) plays every helper; returns { result, written, prompts, logs }.
async function runFlow(args, answer) {
  const prompts = []
  const logs = []
  let written = null
  const agent = async (prompt, opts = {}) => {
    prompts.push({ prompt, opts })
    if (/Use the Write tool/.test(prompt)) {
      written = prompt.split('=====\n')[1].replace(/\n$/, '')
      return 'written'
    }
    return answer(prompt, opts)
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const run = new Function('args', 'agent', 'parallel', 'log', 'phase', `return (async () => {\n${SCRIPT}\n})()`)
  const result = await run(args, agent, parallel, m => logs.push(m), () => {})
  return { result, written, prompts, logs }
}

const ARGS = {
  topic: 'theme',
  brief: 'a cosy game about running a lighthouse',
  youAre: [{ text: 'You are the last keeper of a lighthouse', his: true }],
  collected: { experiences: ['keeping the light lit through a storm'], tone: [{ text: 'cosy', picked: true }], senses: null },
  fears: [{ text: 'it will feel boring', his: true }],
  onIce: [{ text: 'a day-night cycle', his: true }],
  constraints: ['phone, short sessions'],
  questions: ['What does a keeper do all day?', 'What can go wrong at a lighthouse?'],
  out: '.planning/research/discover-lighthouse-theme.md',
}

const lensNotes = id => ({
  notes: [
    { q: 1, says: `${id} says keepers trimmed wicks`, means: 'routine', urls: [`https://${id}.example/1`] },
    { q: 2, says: `${id} note with no source`, means: 'x', urls: [] },
    { q: 2, says: `${id} second page`, means: 'x', urls: [`https://www.${id}.example/2`] },
  ],
  bricks: [
    { shelf: 'Nouns', text: `the lamp · states: lit / out (${id})`, urls: [`https://${id}.example/1`] },
    { shelf: 'Verbs', text: 'unsourced verb', urls: [] },
  ],
  assumptions: id === 'disconfirm' ? [{ n: 1, bears: 'contradicts', says: 'storms break the routine', urls: ['https://disconfirm.example/1'] }] : [],
  open: [{ question: 'Is trimming a wick fun with a thumb?', probe: 'sketch', timebox: '1 hour', why: 'feel' }],
  onIce: id === 'outside' ? ['a radio to talk to ships'] : [],
  saturation: 'stopped at 4 sources: the last 2 added nothing new',
  sources: [{ url: `https://${id}.example/1`, title: `${id} page` }],
})

// The merge: claims (one backed by two sites), an invented URL, an unsourced claim, bricks, a contradiction.
function answer(prompt, opts) {
  const lens = (opts.label || '').replace('lens: ', '')
  if (['mainstream', 'extremes', 'outside', 'disconfirm'].includes(lens)) return lensNotes(lens)
  return {
    themes: [
      {
        q: 1, theme: 'Routine',
        claims: [
          { text: 'Keepers trimmed the wick every few hours', urls: ['https://mainstream.example/1', 'https://extremes.example/1'], interpretation: false },
          { text: 'The routine is the comfort', urls: ['https://outside.example/1'], interpretation: true },
          { text: 'Invented claim', urls: ['https://invented.example/x'], interpretation: false },
          { text: 'Unsourced claim', urls: [], interpretation: false },
          // two pages of one site are one source, not several (www. or not)
          { text: 'Same site twice', urls: ['https://mainstream.example/1', 'https://www.mainstream.example/2'], interpretation: false },
        ],
        soWhat: { text: 'routine may be the cosy part', urls: ['https://mainstream.example/1'] },
      },
    ],
    bricks: [
      { shelf: 'Nouns', text: 'the lamp · states: lit / out / sooty', urls: ['https://mainstream.example/1', 'https://extremes.example/1'] },
      { shelf: 'Verbs', text: 'trim → keep a resource from running down', urls: ['https://outside.example/1'] },
      { shelf: 'Theme', text: 'Invented brick', urls: ['https://invented.example/x'] },
      { shelf: 'Nouns', text: 'the lamp · states: lit / out / sooty', urls: ['https://mainstream.example/1'] }, // the same brick twice
    ],
    contradictions: [{ a: { says: 'keeping was lonely', context: 'remote rocks', urls: ['https://mainstream.example/1'] }, b: { says: 'keepers had families', context: 'shore lights', urls: ['https://disconfirm.example/1'] } }],
    scoreboard: [{ n: 1, verdict: 'contradicted', evidence: 'storms break the routine', urls: ['https://disconfirm.example/1'] }],
    surprises: [{ text: 'Some keepers were women who ran the light alone', urls: ['https://outside.example/1'] }],
    open: [{ question: 'Is trimming a wick fun with a thumb?', probe: 'sketch', timebox: '1 hour' }],
    onIce: ['a radio to talk to ships'],
    hmw: ['How might we make routine feel cosy?', 'not a hmw'],
  }
}

test('research flow: four lenses work alone; the topic changes where they look; the BGG rule is in every prompt', async () => {
  const { prompts } = await runFlow(ARGS, answer)
  const lenses = prompts.filter(p => /^lens: /.test(p.opts.label || ''))
  assert.deepEqual(lenses.map(p => p.opts.label), ['lens: mainstream', 'lens: extremes', 'lens: outside', 'lens: disconfirm'])
  assert.match(lenses[2].prompt, /look in: the subject itself, outside games: non-fiction, history/)
  assert.match(lenses[3].prompt, /look hard for evidence AGAINST each one/)
  for (const p of [...lenses, prompts.find(x => x.opts.label === 'merge')]) {
    assert.match(p.prompt, /Never present BoardGameGeek's mechanics list as a resource, catalogue, taxonomy or authority/)
    assert.match(p.prompt, /The idea, in their words: "a cosy game about running a lighthouse"/)
    assert.match(p.prompt, /Who the player is: "You are the last keeper of a lighthouse"/)
    assert.match(p.prompt, /- experiences: keeping the light lit through a storm\n- tone: cosy/) // a null (skipped) key is left out
    assert.match(p.prompt, /1\. it will feel boring \(desirable, a fear\)/)
    assert.match(p.prompt, /Nouns: "<thing> · states: <a> \/ <b>/)
  }
  for (const p of lenses) {
    assert.match(p.prompt, /Never rank, recommend/)
    assert.doesNotMatch(p.prompt, /says keepers trimmed wicks/) // no lens sees another's notes
  }
  const mech = await runFlow({ ...ARGS, topic: 'mechanisms', questions: null, collected: { verbs: [{ theme: 'trim', outcome: 'keep a resource from running down' }, 'sweep → reveal what is hidden'] } }, answer)
  assert.match(mech.prompts[0].prompt, /look in: designer-written catalogues and breakdowns: Building Blocks of Tabletop Game Design, the gameplay design patterns wiki, Koster's game grammar/)
  assert.match(mech.prompts[0].prompt, /1\. What mechanisms let a player keep a resource from running down\?\n2\. What mechanisms let a player reveal what is hidden\?\n3\. Which genres already bundle/)
  assert.match(mech.prompts[0].prompt, /Mechanism shelf: "<outcome verb> → <mechanism> → example games/)
  await assert.rejects(runFlow({ ...ARGS, topic: 'vibes' }, answer), /needs a "topic": one of theme, mechanisms, prior-art/)
})

test('research flow: the report has every section in order, sourced bricks by shelf, a scoreboard for every fear; it passes the source check and reads back as bricks', async () => {
  const { result, written } = await runFlow(ARGS, answer)
  assert.equal(result.wrote, '.planning/research/discover-lighthouse-theme.md')
  assert.deepEqual(checkReport(written).problems, [])
  assert.match(written, /^# Discover \(theme dig\): a cosy game about running a lighthouse\n/)
  assert.match(written, /- Keepers trimmed the wick every few hours \[1\]\[2\] \(several sources\)\n- The routine is the comfort \[3\] \(interpretation only\)\n/)
  assert.match(written, /- Same site twice \[1\]\[4\] \(one source\)\n/)
  assert.doesNotMatch(written, /Invented|Unsourced|unsourced verb|no source/)
  assert.match(written, /## Bricks\n### Theme\n- none found\n### Nouns\n- the lamp · states: lit \/ out \/ sooty \[1\]\[2\] \(several sources\)\n### Verbs\n- trim → keep a resource from running down \[3\] \(one source\)\n### Experience goals\n- none found\n/)
  assert.match(written, /## Assumption scoreboard\n0 supported · 1 contradicted · 0 no evidence\n- Contradicted: "it will feel boring" \(desirable, a fear\) — storms break the routine \[\d\]\n/)
  assert.match(written, /## Open questions → probes\n- Is trimming a wick fun with a thumb\? → sketch \(timebox: 1 hour\)\n/)
  assert.match(written, /## On ice\n- a day-night cycle \(from the creative\)\n- a radio to talk to ships \(came up in research\)\n/)
  assert.doesNotMatch(written, /not a hmw/)
  assert.equal(result.bricks, 2)
  const back = parseReport(written)
  assert.deepEqual(back.bricks.map(b => [b.shelf, b.strength]), [['Nouns', 'several sources'], ['Verbs', 'one source']])
})

test('research flow: with no merge, the lenses\' own notes and bricks are listed and the report still passes', async () => {
  const noMerge = (prompt, opts) => (opts.label === 'merge' ? null : answer(prompt, opts))
  const { written, logs } = await runFlow(ARGS, noMerge)
  assert.deepEqual(checkReport(written).problems, [])
  assert.ok(logs.some(l => /merge helper gave no answer/.test(l)))
  assert.match(written, /- Contradicted: "it will feel boring" \(desirable, a fear\) — storms break the routine \[\d\]/) // from the Disconfirm helper's own evidence
  assert.match(written, /### Nouns\n- the lamp · states: lit \/ out \(mainstream\) \[\d+\] \(one source\)\n- the lamp · states: lit \/ out \(extremes\)/)
})

test('research flow: a helper past the source cap keeps its first 6 links; the rest are said, not silent', async () => {
  const many = (prompt, opts) => {
    if (opts.label !== 'lens: mainstream') return answer(prompt, opts)
    const notes = Array.from({ length: 9 }, (_, i) => ({ q: 1, says: `note ${i}`, means: '', urls: [`https://m${i}.example/`] }))
    return { ...lensNotes('mainstream'), notes }
  }
  const { logs } = await runFlow(ARGS, many)
  assert.ok(logs.some(l => /left out \d+ notes? or bricks with no source \(or past the 6-source cap\)/.test(l)), logs.join('\n'))
})

test('research flow: a path outside the project falls back to the slug default; no brief fails; no questions uses the topic\'s own', async () => {
  for (const out of ['../outside.md', 'C:/x.md', '/etc/x.md', '.bmuz/x.md', 'notes.txt']) {
    const { result } = await runFlow({ ...ARGS, out }, answer)
    assert.equal(result.wrote, '.planning/research/discover-a-cosy-game-about-running-a-lighthouse-theme.md', out)
  }
  await assert.rejects(runFlow({ ...ARGS, brief: '' }, answer), /needs a "brief"/)
  // a theme step skipped by a wrap-up: its questions come as null, the topic's own are used
  const { written } = await runFlow({ ...ARGS, questions: null }, answer)
  assert.match(written, /## Research questions\n1\. What is "a cosy game about running a lighthouse" really like as a subject/)
  const none = () => ({ notes: [{ q: 1, says: 'a claim', means: '', urls: [] }], bricks: [], assumptions: [], open: [], onIce: [], saturation: '', sources: [] })
  await assert.rejects(runFlow(ARGS, none), /no sourced findings/)
})

test('research flow: prior art looks at Steam tags and game pages, and its shelves are prior art, hooks and twists', async () => {
  const { prompts, written } = await runFlow({ ...ARGS, topic: 'prior-art', questions: null, out: '.planning/research/discover-lighthouse-prior-art.md' }, answer)
  assert.match(prompts[0].prompt, /look in: Steam tag matches \(genre plus themes and moods\), store pages, BoardGameGeek and MobyGames game pages \(as prior art only\)/)
  assert.match(written, /## Bricks\n### Prior art\n[\s\S]*### Hooks & anchors\n[\s\S]*### Twists\n/)
  assert.deepEqual(checkReport(written).problems, [])
})
