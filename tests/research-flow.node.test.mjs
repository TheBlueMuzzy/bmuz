// No-Claude test of the research flow (plugin/workflows/research-flow.js): the script runs with fake
// helpers, so the lens and merge rules are checked without a session or the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkReport } from '../plugin/scripts/check-sources.mjs'

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
  brief: 'punchy screen shake',
  goal: 'hits that feel heavy without making anyone sick',
  kind: 'aesthetic',
  assumptions: [{ text: 'more shake is more punch', important: true }, { text: 'players turn shake off', important: true }, { text: 'red flashes help', important: false }],
  onIce: ['trauma-based shake'],
  constraints: ['2D phone game'],
  questions: ['What makes shake feel punchy?', 'Where does shake tip into nausea?'],
  out: '.planning/research/discover-screen-shake.md',
}

const lensNotes = id => ({
  notes: [
    { q: 1, says: `${id} says short shakes punch`, means: 'timing matters', urls: [`https://${id}.example/1`] },
    { q: 2, says: `${id} note with no source`, means: 'x', urls: [] },
    { q: 2, says: `${id} second page`, means: 'x', urls: [`https://www.${id}.example/2`] },
  ],
  assumptions: id === 'disconfirm' ? [{ n: 1, bears: 'contradicts', says: 'big shakes read as noise', urls: ['https://disconfirm.example/1'] }] : [],
  open: [{ question: 'How much is too much on a small screen?', probe: 'sketch', why: 'feel' }],
  onIce: id === 'outside' ? ['a camera kick instead of a shake'] : [],
  saturation: 'stopped at 4 sources: the last 2 added nothing new',
  sources: [{ url: `https://${id}.example/1`, title: `${id} page` }],
})

// The merge: two claims (one backed by two sites), an invented URL, an unsourced claim, a contradiction.
function answer(prompt, opts) {
  const lens = (opts.label || '').replace('lens: ', '')
  if (['mainstream', 'extremes', 'outside', 'disconfirm'].includes(lens)) return lensNotes(lens)
  return {
    themes: [
      {
        q: 1, theme: 'Short beats big',
        claims: [
          { text: 'Short shakes read as impact', urls: ['https://mainstream.example/1', 'https://extremes.example/1'], interpretation: false },
          { text: 'Timing carries the punch', urls: ['https://outside.example/1'], interpretation: true },
          { text: 'Invented claim', urls: ['https://invented.example/x'], interpretation: false },
          { text: 'Unsourced claim', urls: [], interpretation: false },
          // two pages of one site are one source, not several (www. or not)
          { text: 'Same site twice', urls: ['https://mainstream.example/1', 'https://www.mainstream.example/2'], interpretation: false },
        ],
        soWhat: { text: 'size may matter less than timing on a phone', urls: ['https://mainstream.example/1'] },
      },
    ],
    contradictions: [{ a: { says: 'big shakes feel strong', context: 'console games', urls: ['https://mainstream.example/1'] }, b: { says: 'big shakes read as noise', context: 'phones', urls: ['https://disconfirm.example/1'] } }],
    scoreboard: [{ n: 1, verdict: 'contradicted', evidence: 'big shakes read as noise', urls: ['https://disconfirm.example/1'] }],
    surprises: [{ text: 'Film editors cut on the hit frame', urls: ['https://outside.example/1'] }],
    open: [{ question: 'How much is too much on a small screen?', probe: 'sketch' }],
    onIce: ['a camera kick instead of a shake'],
    hmw: ['How might we make a hit feel heavy on a small screen?', 'not a hmw'],
  }
}

test('research flow: four lenses work alone; the topic type only changes where they look; MDA words kept apart', async () => {
  const { prompts } = await runFlow(ARGS, answer)
  const lenses = prompts.filter(p => /^lens: /.test(p.opts.label || ''))
  assert.deepEqual(lenses.map(p => p.opts.label), ['lens: mainstream', 'lens: extremes', 'lens: outside', 'lens: disconfirm'])
  assert.match(lenses[2].prompt, /look in: film, animation, product design, music with the same feeling/)
  assert.match(lenses[3].prompt, /look hard for evidence AGAINST each one/)
  for (const p of lenses) {
    assert.match(p.prompt, /Not MDA's "Aesthetics", which means the feelings a game evokes in players/)
    assert.match(p.prompt, /1\. more shake is more punch\n2\. players turn shake off/) // important ones only
    assert.doesNotMatch(p.prompt, /red flashes/)
    assert.match(p.prompt, /Never rank, recommend/)
    assert.doesNotMatch(p.prompt, /says short shakes punch/) // no lens sees another's notes
  }
  const tech = await runFlow({ ...ARGS, kind: 'tech' }, answer)
  assert.match(tech.prompts[0].prompt, /look in: official docs, common libraries, the usual architecture/)
})

test('research flow: the report has every section in order, strength marks, a scoreboard for every important assumption; it passes the source check', async () => {
  const { result, written } = await runFlow(ARGS, answer)
  assert.equal(result.wrote, '.planning/research/discover-screen-shake.md')
  assert.deepEqual(checkReport(written).problems, [])
  assert.match(written, /^# Discover: punchy screen shake\n/)
  assert.match(written, /## Question\n- Brief as said: punchy screen shake\n- Goal underneath: hits that feel heavy without making anyone sick\n- Topic type: aesthetic \(look, feel, sound, juice; not MDA's "Aesthetics", which means what players feel\)/)
  assert.match(written, /- Short shakes read as impact \[1\]\[2\] \(several sources\)\n- Timing carries the punch \[3\] \(interpretation only\)\n/)
  assert.match(written, /- Same site twice \[1\]\[4\] \(one source\)\n### 2\. Where does shake tip into nausea\?\n- none found: see Open questions/)
  assert.doesNotMatch(written, /Invented|Unsourced|no source/)
  assert.match(written, /## Contradictions\n- big shakes feel strong \[1\] \(context: console games\) — but big shakes read as noise \[5\] \(context: phones\)/)
  assert.match(written, /## Assumption scoreboard\n0 supported · 1 contradicted · 1 no evidence\n- Contradicted: "more shake is more punch" — big shakes read as noise \[5\]\n- No evidence: "players turn shake off"\n/)
  assert.match(written, /## Open questions → probes\n- How much is too much on a small screen\? → sketch\n/)
  assert.match(written, /## On ice\n- trauma-based shake \(from the creative\)\n- a camera kick instead of a shake \(came up in research\)\n/)
  assert.match(written, /## So what \(draft for Define\)\n- Short beats big: size may matter less than timing on a phone \[1\]\n\nDraft for Define: How might we make a hit feel heavy on a small screen\?\n/)
  assert.doesNotMatch(written, /not a hmw/)
  assert.deepEqual(result.scoreboard, { supported: 0, contradicted: 1, noEvidence: 1, contradictedNames: ['more shake is more punch'] })
  assert.equal(result.dropped, 2)
})

test('research flow: with no merge, the notes are listed by question and the report still passes', async () => {
  const noMerge = (prompt, opts) => (opts.label === 'merge' ? null : answer(prompt, opts))
  const { written, logs } = await runFlow(ARGS, noMerge)
  assert.deepEqual(checkReport(written).problems, [])
  assert.ok(logs.some(l => /merge helper gave no answer/.test(l)))
  assert.match(written, /- Contradicted: "more shake is more punch" — big shakes read as noise \[\d\]/) // from the Disconfirm helper's own evidence
  assert.match(written, /### 2\. Where does shake tip into nausea\?\n\*\*Notes from the lenses\*\*\n- mainstream second page \[5\] \(one source\)/)
})

test('research flow: a helper past the source cap keeps its first 10 links; the rest are said, not silent', async () => {
  const many = (prompt, opts) => {
    if (opts.label !== 'lens: mainstream') return answer(prompt, opts)
    const notes = Array.from({ length: 12 }, (_, i) => ({ q: 1, says: `note ${i}`, means: '', urls: [`https://m${i}.example/`] }))
    return { ...lensNotes('mainstream'), notes }
  }
  const { logs } = await runFlow(ARGS, many)
  assert.ok(logs.some(l => /left out \d+ notes? with no source \(or past the 10-source cap\)/.test(l)), logs.join('\n'))
})

test('research flow: a path outside the project falls back to the slug default; no brief or no questions fails', async () => {
  for (const out of ['../outside.md', 'C:/x.md', '/etc/x.md', '.bmuz/x.md', 'notes.txt']) {
    const { result } = await runFlow({ ...ARGS, out }, answer)
    assert.equal(result.wrote, '.planning/research/discover-punchy-screen-shake.md', out)
  }
  await assert.rejects(runFlow({ ...ARGS, brief: '' }, answer), /needs a "brief"/)
  await assert.rejects(runFlow({ ...ARGS, questions: [] }, answer), /needs "questions"/)
  const none = () => ({ notes: [{ q: 1, says: 'a claim', means: '', urls: [] }], assumptions: [], open: [], onIce: [], saturation: '', sources: [] })
  await assert.rejects(runFlow(ARGS, none), /no sourced findings/)
})
