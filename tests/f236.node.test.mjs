// F236 — BMUZ hands back with a card (2026-11-15). No-Claude tests, one block per task; the motor's side (the say tool,
// the box guard, the wait) is in plugin/tests/engine.test.tsx, "F236".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(here, '..', 'plugin')
const NL = String.fromCharCode(10)

// ---- task 1: the step card (Done · Try it · Your to-do), engine-rendered from the box's own script lines ----
const CARD_SCRIPT = [
  '# Test', '',
  '## t.played · box · added',
  'done: **{name}** is ready. It answers: {question}',
  'try: {file}',
  'todo: Try moving: {knobs}.[[ Then {extra}.]]',
  '? Played {sketch}?',
  'header: Played it?',
  '- I played it — no values to keep',
  '- Not yet — next, tell me when you\'ve played it',
  '',
  '## t.plain · box',
  '? Keep it?',
  'header: Keep?',
  '- Yes',
  '- No',
  '',
  '## t.only · box · added',
  'todo: Look at the chart.',
  '? Anything wrong?',
  'header: Chart',
  '- All right',
  '- Move some — next, tell me which',
  '',
].join(NL)

test('task 1: a box may carry a card (done / try / todo lines before its question); the script reads it', () => {
  const s = E.parseScript(CARD_SCRIPT)
  assert.deepEqual(s.problems, [])
  assert.deepEqual(s.lines['t.played'].box.card, { done: '**{name}** is ready. It answers: {question}', try: '{file}', todo: 'Try moving: {knobs}.[[ Then {extra}.]]' })
  assert.equal(s.lines['t.played'].box.question, 'Played {sketch}?')
  assert.equal(s.lines['t.plain'].box.card, undefined)
  // a card line after the question is the question's own words, never a card part; an unknown part is a problem
  const bad = E.parseScript(['## t.x · box', 'seen: what you see', '? Q?', 'header: Q', '- A', '- B'].join(NL))
  assert.match(bad.problems.join(' '), /box "t.x": the line "seen: what you see"/)
})

test('task 1: the card renders with the card\'s labels, one line each, parts with nothing to say left out; the box is as before', () => {
  const s = E.parseScript(CARD_SCRIPT)
  const r = E.renderLine(s, 't.played', { name: 'S02 Action picker', question: 'Is picking quick?', file: 'file:///p/S02.html (open in your browser now)', knobs: 'Button size and Picker position', sketch: 'S02' })
  assert.equal(r.error, undefined)
  assert.equal(r.card, `**Done:** **S02 Action picker** is ready. It answers: Is picking quick?${NL}**Try it:** file:///p/S02.html (open in your browser now)${NL}**Your to-do:** Try moving: Button size and Picker position.`)
  assert.equal(r.box.question, 'Played S02?')
  assert.equal(r.box.header, 'Played it?')
  // a card with only a to-do: only that line
  assert.equal(E.renderLine(s, 't.only', {}).card, '**Your to-do:** Look at the chart.')
  // a plain box has no card
  assert.equal(E.renderLine(s, 't.plain', {}).card, undefined)
  // a card part's slot left out is refused like any slot (never a card with a hole)
  assert.match(E.renderLine(s, 't.played', { name: 'S02', question: 'Q?', knobs: 'k', sketch: 'S02' }).error, /needs \{file\}/)
})

test('task 1: the card is short — at most one line per part — and its words count for the box: text before a box may be the card plus one short line', () => {
  const card = `**Done:** **S02 Action picker** is ready. It answers: Does picking 2 of 3 actions, with last turn's second one locked, feel quick and clear on a screen?${NL}**Try it:** file:///C:/Users/Muzzy/Documents/dev/.scratch/sirius-live4/.planning/research/sketches/S02-action-picker.html (open in your browser now)${NL}**Your to-do:** Try moving: Button size, Locked look (dim / X / hidden), Picker position and Confirm step on or off. When a setting feels right, press "Copy values for Claude".`
  // over the plain 300-character limit on its own…
  assert.ok(E.hiddenTextProblem(card))
  // …but it is the engine's card for this box: fine, and with one short line before it
  assert.equal(E.hiddenTextProblem(card, card), null)
  assert.equal(E.hiddenTextProblem(`Noted in your design document: you recover your Evidence on its Planet.${NL}${NL}${card}`, card), null)
  // more than one short line before the card is still covered by the box
  assert.ok(E.hiddenTextProblem(`One.${NL}Two.${NL}Three.${NL}${card}`, card))
  // the card not at the end (words written after it) is no card: the usual limit
  assert.ok(E.hiddenTextProblem(`${card}${NL}And another thing.`, card))
})
