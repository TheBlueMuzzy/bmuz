// F215 task 2: the bug list writer (plugin/scripts/bugs.mjs), .planning/BUGS.md in PROJECT-FILES' format, keeping hand
// edits. No Claude: the file's shape, numbering, statuses, "Guarded by:" and the Bugs tab on the project page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as B from '../plugin/scripts/bugs.mjs'
import * as G from '../plugin/scripts/gdd.mjs'

const report = (over = {}) => ({ title: 'Score cut off on phone', level: 'P2', steps: ['Open the game on a phone', 'Finish a round'], expected: 'the whole score shows', actual: 'the last digit is cut off', often: 'every time', ...over })
const by = { day: '2026-11-11', where: 'Design · The Rulebook', name: 'Garden Race' }

test('a new list: the title, the Open count line, Open and Fixed sections; the first bug is B001, the header in the /bug shape', () => {
  const out = B.addBug('', report(), by)
  assert.equal(out.id, 'B001')
  const lines = out.text.split('\n')
  assert.equal(lines[0], '# Garden Race — Bugs')
  assert.equal(lines[1], 'Open: 1 (P0 0 · P1 0 · P2 1 · P3 0)')
  assert.match(out.text, /## Open\n\n?### B001 · P2 · open · found 2026-11-11 in Design · The Rulebook\n<!-- bmuz bug:b001 · [0-9a-f]{8} -->\n/)
  assert.ok(out.text.includes('Score cut off on phone\nSteps: 1. Open the game on a phone 2. Finish a round · Expected: the whole score shows · Actual: the last digit is cut off · How often: every time'))
  assert.ok(out.text.indexOf('## Fixed (newest first)') > out.text.indexOf('### B001'))
  assert.equal(B.bugWords(out.text, 'B001'), 'B001 · Score cut off on phone · P2 — annoying, not blocking')
})

test('numbers go on from the highest, the archive counted too; a bad report is refused in plain words', () => {
  let t = B.addBug('', report(), by).text
  t = B.addBug(t, report({ title: 'Crash on start', level: 'P0' }), by, '### B012 · P3 · verified 2026-01-01').text
  assert.match(t, /### B013 · P0 · open/)
  assert.equal(B.counts(t).open, 2)
  assert.match(t, /^Open: 2 \(P0 1 · P1 0 · P2 1 · P3 0\)$/m)
  assert.throws(() => B.addBug(t, report({ level: 'P5' }), by), /"level" must be one of P0, P1, P2, P3/)
  assert.throws(() => B.addBug(t, report({ title: '' }), by), /needs a "title"/)
})

test('statuses: open → fixing → fixed (to the top of Fixed, Guarded by a real file, the fix commit) → verified; a P1 needs its guard', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-bugs-'))
  mkdirSync(join(dir, 'tests'))
  writeFileSync(join(dir, 'tests', 'score.test.mjs'), 'test')
  let t = B.addBug('', report({ level: 'P1', title: 'Score one too high' }), by).text
  t = B.addBug(t, report(), by).text
  t = B.setStatus(t, 'B001', 'fixing', { day: '2026-11-11', dir })
  assert.match(t, /### B001 · P1 · fixing · found/)
  assert.throws(() => B.setStatus(t, 'B001', 'fixed', { day: '2026-11-11', dir }), /needs "Guarded by: <test file>"/)
  assert.throws(() => B.setStatus(t, 'B001', 'fixed', { day: '2026-11-11', dir, guardedBy: 'tests/nope.test.mjs' }), /there is no such file/)
  assert.throws(() => B.setStatus(t, 'B001', 'fixed', { day: '2026-11-11', dir, guardedBy: '../outside.mjs' }), /a file inside the project/)
  t = B.setStatus(t, 'B001', 'fixed', { day: '2026-11-12', dir, guardedBy: 'tests/score.test.mjs', commit: 'a1b2c3d' })
  const fixedAt = t.indexOf('## Fixed (newest first)')
  assert.ok(t.indexOf('### B001 · P1 · fixed 2026-11-12 · found 2026-11-11 in Design · The Rulebook · fixed in a1b2c3d · Guarded by: tests/score.test.mjs') > fixedAt)
  assert.ok(t.indexOf('### B002') < fixedAt)
  assert.match(t, /^Open: 1 \(P0 0 · P1 0 · P2 1 · P3 0\)$/m)
  // the entry's own text went with it
  assert.ok(t.indexOf('Score one too high') > fixedAt)
  t = B.setStatus(t, 'B001', 'verified', { day: '2026-11-13', dir })
  assert.match(t, /### B001 · P1 · verified 2026-11-13 · .* · fixed in a1b2c3d · Guarded by: tests\/score.test.mjs/)
  assert.throws(() => B.setStatus(t, 'B001', 'done', {}), /isn't a status/)
})

test('hand edits are kept: a level changed in the header counts, their note under the entry moves with it, their edit inside the marks stays', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-bugs-'))
  writeFileSync(join(dir, 'g.test.mjs'), 'x')
  let t = B.addBug('', report(), by).text
  // the creative: P2 → P3 by hand, a note of their own under the entry, and a word changed in BMUZ's text
  t = t.replace('### B001 · P2 · open', '### B001 · P3 · open').replace('How often: every time\n<!-- /bmuz bug:b001 -->', 'How often: every time, on small phones\n<!-- /bmuz bug:b001 -->\nMy note: only on the Pixel.')
  assert.match(B.openLine(t), /P2 0 · P3 1/)
  t = B.noteBug(t, 'B001', { Cause: 'the score box has a fixed width' }, { day: '2026-11-12', step: 'cause' })
  assert.ok(t.includes('How often: every time, on small phones'), 'their edit kept')
  assert.match(t, /Cause: the score box has a fixed width/)
  t = B.setStatus(t, 'B001', 'fixed', { day: '2026-11-12', dir, guardedBy: 'g.test.mjs' })
  assert.match(t, /### B001 · P3 · fixed 2026-11-12/)
  const fixed = t.split('## Fixed (newest first)')[1]
  assert.ok(fixed.includes('My note: only on the Pixel.'))
  assert.ok(fixed.includes('on small phones'))
})

test('an entry written by hand (no marks) is read, picked and noted; the pick order is P0 → P1 → P2 → P3, then number', () => {
  const hand = '# X — Bugs\nOpen: 2\n## Open\n### B003 · P2 · open · found 2026-10-01\nMenu overlaps\n### B004 · P1 · open · found 2026-10-02\nDice pulse forever\n## Fixed (newest first)\n'
  assert.equal(B.pickBug(hand).bug.id, 'B004')
  assert.equal(B.pickBug(hand, 'B003').bug.id, 'B003')
  assert.match(B.pickBug(hand, 'B009').error, /there is no B009/)
  assert.equal(B.pickBug(B.newBugs()).none, true)
  const t = B.noteBug(hand, 'B003', { Cause: 'z-index' })
  assert.match(t, /### B003 · P2 · open · found 2026-10-01\nMenu overlaps\n<!-- bmuz bug:b003 · [0-9a-f]{8} -->\nCause: z-index\n<!-- \/bmuz bug:b003 -->\n/)
  assert.equal(B.titleOf(t, 'B003'), 'Menu overlaps')
  assert.match(B.listText(hand), /^Open bugs: 2 — P0 0 · P1 1 · P2 1 · P3 0\n  B004 P1 Dice pulse forever\n  B003 P2 Menu overlaps$/)
})

test('the project page gets a Bugs tab when .planning/BUGS.md exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bmuz-bugs-'))
  mkdirSync(join(dir, '.planning'))
  writeFileSync(join(dir, G.GDD), G.newGdd('Garden Race'))
  const out = B.addIn(dir, report())
  assert.equal(out.id, 'B001')
  const page = readFileSync(join(dir, G.PAGE), 'utf8')
  assert.match(page, /<a href="#bugs">Bugs<\/a>/)
  assert.match(page, /B001 · P2 · open/)
  assert.ok(!/bmuz bug:b001/.test(page), 'the marks are not on the page')
})
