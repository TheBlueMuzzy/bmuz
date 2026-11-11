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
