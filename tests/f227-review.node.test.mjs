// No-Claude tests for the F227/F232 code review's findings (2026-11-11): each one reproduced first, then fixed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as G from '../plugin/scripts/gdd.mjs'

const by = { step: 'read', stage: 'Ideate', day: '2026-11-11' }

test('B1: a GDD missing one chapter heading keeps everything when any chapter is written; the missing chapter is added in its place', () => {
  let t = G.newGdd('Garden Race')
  t = G.applyResult(t, { chapters: { 3: 'You and a friend race gardens.' }, decisions: ['Two players only.'] }, 'chosen', by).text
  t = t.replace('<!-- /bmuz 3 -->', '<!-- /bmuz 3 -->\nMy own note.')
  // the creative deletes chapter 7's heading (and its lines)
  const lines = t.split('\n')
  const h = lines.findIndex(l => l.startsWith('### 7 ·'))
  const e = lines.findIndex((l, i) => i > h && /^#{2,3}\s/.test(l))
  lines.splice(h, e - h)
  t = lines.join('\n')
  assert.equal(G.readGdd(t)[7], undefined)
  // writing chapter 4 (or 7) never throws the document away
  for (const n of [4, 7]) {
    const out = G.writeChapter(t, n, `Chapter ${n} text.`, 'loose', by).text
    assert.match(out, /^# Garden Race — Game Design Document$/m, 'title kept')
    assert.ok(out.includes('You and a friend race gardens.'), 'other chapters kept')
    assert.ok(out.includes('My own note.'), 'their own lines kept')
    assert.ok(out.includes('- Two players only.'), 'Decisions kept')
    const ch = G.readGdd(out)
    assert.equal(ch[n].text, `Chapter ${n} text.`)
    assert.equal(Object.keys(ch).length, n === 7 ? 14 : 13)
  }
  // chapter 7 goes back in its place: after 6, before Part 2
  const out = G.writeChapter(t, 7, 'Risky.', 'loose', by).text
  const at = s => out.indexOf(s)
  assert.ok(at('### 6 ·') < at('### 7 · Risks & Unknowns') && at('### 7 ·') < at('## Part 2'), 'in chapter order, in its part')
  // chapter 1 missing: goes before chapter 2, after Part 1's heading
  const no1 = G.newGdd('G').replace(/### 1 · [\s\S]*?(?=### 2 ·)/, '')
  const o1 = G.writeChapter(no1, 1, 'Joy.', 'loose', by).text
  assert.ok(o1.indexOf('## Part 1') < o1.indexOf('### 1 · The Feelings') && o1.indexOf('### 1 ·') < o1.indexOf('### 2 ·'))
  assert.equal(G.readGdd(o1)[1].text, 'Joy.')
})

test('A4: a part handed back as the file shows it (its heading and BMUZ\'s marks) is written as its text only, never nested marks', async () => {
  const M = await import('../plugin/scripts/marks.mjs')
  const R = await import('../plugin/scripts/rulebook.mjs')
  let doc = R.applyRulebook('', { setup: 'Deal 5.' }, by).text
  const shown = '## Setup\n' + doc.split('## Setup\n')[1].split('\n## ')[0].trim().replace('Deal 5.', 'Deal 6.')
  doc = R.applyRulebook(doc, { setup: shown, actions: [{ name: 'Plant', text: '<!-- bmuz rb:action-plant · 0123abcd -->\nPlant one.\n<!-- /bmuz rb:action-plant -->' }] }, by).text
  assert.equal(doc.match(/<!-- bmuz rb:setup /g).length, 1, 'one pair of marks')
  assert.equal(M.readBlocks(doc)['rb:setup'].text, 'Deal 6.')
  assert.equal(M.readBlocks(doc)['rb:setup'].edited, false)
  assert.equal(doc.match(/<!-- bmuz rb:action-plant /g).length, 1)
  assert.equal(M.readBlocks(doc)['rb:action-plant'].text, 'Plant one.')
  // the TDD and roadmap write through writeBlock the same way
  const t = M.writeBlock('# TDD\n\n## Risks\n', 'td:risks', '## Risks\n<!-- bmuz td:risks · 0123abcd -->\nNone yet.\n<!-- /bmuz td:risks -->', { after: '## Risks' }).text
  assert.equal(t.match(/<!-- bmuz td:risks /g).length, 1)
  assert.equal(t.match(/^## Risks$/gm).length, 1)
  assert.equal(M.readBlocks(t)['td:risks'].text, 'None yet.')
})

test('A6: the content steps\' "writes" cover content/data/*.json; a pattern is a * in the file name only; ls.mjs lists what it matches', async () => {
  const { readFileSync, mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { spawnSync } = await import('node:child_process')
  const E = await import('../plugin/hooks/engine.js')
  const D = JSON.parse(readFileSync(new URL('../plugin/pipelines/design.json', import.meta.url), 'utf8'))
  for (const id of ['content-fill', 'balance-fill']) assert.ok(D.steps.find(s => s.id === id).writes.includes('content/data/*.json'), id)
  assert.equal(E.isSafePath('content/data/*.json'), true)
  assert.equal(E.matchesPattern('content/data/*.json', 'content/data/seed-cards.json'), true)
  assert.equal(E.matchesPattern('content/data/*.json', 'content/data/x/seed.json'), false)
  assert.equal(E.matchesPattern('content/data/*.json', 'content/other.json'), false)
  const bad = { id: 'p', version: 1, steps: [{ id: 'a', kind: 'script', run: ['node', 'x.mjs'], writes: ['content/*/x.json'] }] }
  assert.ok(E.checkPipeline(bad).some(p => /may have a \* only in its file name/.test(p)))
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-ls-'))
  mkdirSync(join(dir, 'content', 'data', 'deeper'), { recursive: true })
  for (const f of ['a.json', 'b.json', 'notes.md']) writeFileSync(join(dir, 'content', 'data', f), '{}')
  const ls = new URL('../plugin/scripts/ls.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const run = p => JSON.parse(spawnSync(process.execPath, [ls, dir, p], { encoding: 'utf8' }).stdout)
  assert.deepEqual(run('content/data/*.json'), ['content/data/a.json', 'content/data/b.json'])
  assert.deepEqual(run('nothing/*.json'), [])
})

// ---- after the review: what let design-garden's players step through (headless 2026-11-11, 8/10) ----
test('must: a talk step\'s "must" lines are checked against the lines handed out this step; the pipeline check keeps them inside "lines"', async () => {
  const E = await import('../plugin/hooks/engine.js')
  const { readFileSync } = await import('node:fs')
  const D = JSON.parse(readFileSync(new URL('../plugin/pipelines/design.json', import.meta.url), 'utf8'))
  const players = D.steps.find(s => s.id === 'players')
  assert.deepEqual(players.must, ['design.players.long', 'design.players.defaults', 'design.players.needs']) // (F235 task 2)
  for (const p of ['ideate', 'define', 'design']) {
    const P = JSON.parse(readFileSync(new URL(`../plugin/pipelines/${p}.json`, import.meta.url), 'utf8'))
    assert.deepEqual(E.checkPipeline(P), [], p)
  }
  const bad = { id: 'p', version: 1, steps: [{ id: 'a', kind: 'talk', tools: ['Read'], lines: ['x.one'], must: ['x.two'] }] }
  assert.ok(E.checkPipeline(bad).some(p => /"must" line "x.two" isn't one of the step's "lines"/.test(p)))
  // nothing said yet: both named; one said: the other named; another step's record doesn't count
  assert.match(E.mustProblem(players, { said: null }), /"design\.players\.long", "design\.players\.defaults", "design\.players\.needs" were never said/)
  assert.match(E.mustProblem(players, { said: { step: 'players', lines: ['design.players.read', 'design.players.long', 'design.players.defaults'] } }), /line "design\.players\.needs" was never said[^]*mcp__bmuz__say/)
  assert.ok(E.mustProblem(players, { said: { step: 'look', lines: ['design.players.long', 'design.players.defaults', 'design.players.needs'] } }))
  assert.equal(E.mustProblem(players, { said: { step: 'players', lines: ['design.players.long', 'design.players.defaults', 'design.players.needs'] } }), null)
  // a step's record starts with it and ends when it finishes
  const s1 = E.begin({ finished: [], said: { step: 'look', lines: ['a'] } }, players, 1)
  assert.deepEqual(s1.said, { step: 'players', lines: [] })
  assert.deepEqual(E.begin({ ...s1, said: { step: 'players', lines: ['b'] } }, players, 2).said, { step: 'players', lines: ['b'] }, 'a restart keeps what was said')
  assert.equal(E.finish({ ...s1, results: {}, retries: {} }, players, {}).said, null)
})

test('chapters: a chapter-writing step\'s result with a chapter number outside "chapters" is refused with the expected shape', async () => {
  const E = await import('../plugin/hooks/engine.js')
  const { readFileSync } = await import('node:fs')
  const D = JSON.parse(readFileSync(new URL('../plugin/pipelines/design.json', import.meta.url), 'utf8'))
  const players = D.steps.find(s => s.id === 'players')
  const why = E.resultProblems(D, players, { 5: 'chapter five', chapters: { 11: 'eleven' }, needs: ['None of these'] })
  assert.match(why, /"5" is a chapter number outside "chapters"/)
  assert.match(why, /\{"chapters": \{"5": "/)
  assert.match(E.resultProblems(D, players, { 5: 'five', needs: ['x'] }), /outside "chapters"/)
  assert.match(E.resultProblems(D, players, { chapters: ['five'], needs: ['x'] }), /"chapters" must be/)
  assert.equal(E.resultProblems(D, players, { chapters: { 5: 'five', 11: 'eleven' }, needs: ['x'] }), null)
  assert.equal(E.resultProblems(D, players, { chapters: 'plain text for the step\'s one chapter', needs: ['x'] }), null)
})
