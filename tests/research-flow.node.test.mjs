// No-Claude test of the research flow (plugin/workflows/research-flow.js): the script runs with fake
// helpers, so the merge rules are checked without a session or the network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkReport } from '../plugin/scripts/check-sources.mjs'

const SCRIPT = readFileSync(new URL('../plugin/workflows/research-flow.js', import.meta.url), 'utf8')
  .replace(/^export const meta = \{[\s\S]*?\n\}\n/, '') // meta is for Claude Code; the body is what runs

// Runs the flow body. answer(prompt, opts) plays every helper; returns { result, written, prompts }.
async function runFlow(args, answer) {
  const prompts = []
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
  const result = await run(args, agent, parallel, () => {}, () => {})
  return { result, written, prompts }
}

const helper = angle => ({
  findings: [
    { text: `${angle} finding one`, urls: [`https://example.com/${angle}/1`] },
    { text: `${angle} finding with no source`, urls: [] },
    { text: `${angle} finding with a made-up link`, urls: ['not a link'] },
  ],
  sources: [{ url: `https://example.com/${angle}/1`, title: `${angle} page` }],
})

// The merge helper echoes the helpers' findings and adds a claim citing a URL nobody found.
function answer(prompt, opts) {
  const angle = (opts.label || '').replace('research: ', '')
  if (['games', 'players', 'fun'].includes(angle)) return helper(angle)
  const raw = JSON.parse(prompt.split('\n').slice(1).join('\n').split('\nMerge them')[0])
  return {
    summary: [{ text: 'Summary line', urls: ['https://example.com/fun/1'] }, { text: 'Unsourced summary line', urls: [] }],
    games: [...raw.games, { text: 'Invented claim', urls: ['https://invented.example/nowhere'] }],
    players: raw.players,
    fun: raw.fun,
  }
}

test('research flow: three angles, one merge; claims with no real source are dropped; the report passes the source check', async () => {
  const { result, written, prompts } = await runFlow({ topic: 'a cosy card game about trading seeds', out: '.planning/research/discover.md' }, answer)
  assert.equal(prompts.filter(p => /^research: /.test(p.opts.label || '')).length, 3)
  assert.equal(result.wrote, '.planning/research/discover.md')
  assert.equal(result.findings, 3)
  assert.equal(result.sources, 3)
  assert.match(written, /^# Research: a cosy card game about trading seeds\n/)
  assert.match(written, /## Summary\n- Summary line \[1\]\n\n/)
  assert.doesNotMatch(written, /no source|made-up|Invented|Unsourced/)
  assert.match(written, /## Sources\n1\. fun page — https:\/\/example\.com\/fun\/1\n2\. games page — https:\/\/example\.com\/games\/1\n/)
  // the engine's own check agrees (links not fetched here)
  assert.deepEqual(checkReport(written).problems, [])
})

test('research flow: a path outside the project falls back to the default; no topic fails the flow', async () => {
  for (const out of ['../outside.md', 'C:/x.md', '/etc/x.md', '.bmuz/x.md', 'notes.txt']) {
    const { result } = await runFlow({ topic: 'seeds', out }, answer)
    assert.equal(result.wrote, '.planning/research/discover.md', out)
  }
  await assert.rejects(runFlow({ out: 'x.md' }, answer), /needs a "topic"/)
})

test('research flow: nothing sourced at all fails the flow instead of writing an empty report', async () => {
  const empty = () => ({ findings: [{ text: 'a claim', urls: [] }], sources: [], summary: [], games: [], players: [], fun: [] })
  await assert.rejects(runFlow({ topic: 'seeds' }, empty), /no sourced findings/)
})
