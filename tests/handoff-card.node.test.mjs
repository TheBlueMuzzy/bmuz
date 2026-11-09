// No-Claude tests of the engine-written hand-off card (docs/handoff-card.md): F213.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

const CARD = {
  title: 'Hello page for Moon Goat',
  done: 'checked hello.html against plan.json',
  see: 'a hello page with the name as its heading',
  try: 'open hello.html',
  proof: ['hello.html has the heading', 'plan.json names Moon Goat'],
  todos: 'none',
  next: 'nothing to type: the run is finished',
}

test('a full card passes; each missing or empty part is named', () => {
  assert.deepEqual(E.checkCard(CARD), { ok: true })
  const { see, proof, ...rest } = CARD
  const bad = E.checkCard({ ...rest, todos: '  ' })
  assert.equal(bad.ok, false)
  assert.match(bad.why, /"see", "proof", "todos" are missing or empty/)
  assert.match(E.checkCard(undefined).why, /the result has no "card"/)
  assert.match(E.checkCard({ ...CARD, title: '' }).why, /"title" is missing/)
  assert.match(E.checkCard({ ...CARD, questions: 'none' }).why, /"questions" must be a list/)
})

test('the card has today\'s labels, in today\'s order; lists go one line each under the label', () => {
  const text = E.renderCard(CARD, [])
  assert.equal(text, [
    '## Hello page for Moon Goat — ready for you to check',
    '**Done:** checked hello.html against plan.json',
    "**You'll see:** a hello page with the name as its heading",
    '**Try it:** open hello.html',
    '**Proof:**',
    '- hello.html has the heading',
    '- plan.json names Moon Goat',
    '**Your to-dos:** none',
    '**Questions:** none',
    '**Next:** nothing to type: the run is finished',
  ].join('\n'))
  // a title that already says "ready for you to check" doesn't say it twice
  assert.match(E.renderCard({ ...CARD, title: 'X — ready for you to check' }, []), /^## X — ready for you to check\n/)
})

test('questions are numbered, end in "?", options indented under them', () => {
  const text = E.renderCard(CARD, [{ n: 3, key: 'colour', q: 'Which colour?', kind: 'choice', options: ['blue', 'black'] }])
  assert.match(text, /\*\*Questions:\*\*\n3\. Which colour\?\n {3}- blue\n {3}- black\n\*\*Next:\*\*/)
  assert.match(E.checkCard({ ...CARD, questions: [{ key: 'colour', q: 'Pick a colour', kind: 'choice' }] }).why, /must be a question ending in "\?"/)
  assert.match(E.checkCard({ ...CARD, questions: [{ key: 'colour', kind: 'choice' }] }).why, /question 1 has no "q"/)
})

test('"handoff" is a talk-step setting: true or false, and the talk prompt asks for the card', () => {
  const talk = { id: 'r', kind: 'talk', tools: ['Read'], craft: 'craft/r.md' }
  assert.deepEqual(E.checkPipeline({ id: 'x', version: 1, steps: [{ ...talk, handoff: true }] }), [])
  assert.ok(E.checkPipeline({ id: 'x', version: 1, steps: [{ ...talk, handoff: 'yes' }] }).some(p => /"handoff" must be true or false/.test(p)))
  assert.ok(E.checkPipeline({ id: 'x', version: 1, steps: [{ id: 's', kind: 'script', run: ['x'], handoff: true }] }).some(p => /unknown setting "handoff"/.test(p)))
  const words = E.talkPrompt({ ...talk, handoff: true, done: { type: 'result-has', key: 'verdict' } }, 'Review it.', '', false, [{ key: 'colour', answer: 'blue' }])
  assert.match(words, /"card":\{"title"/)
  assert.match(words, /Already decided \(use these, never ask them again\): colour = blue/)
  assert.doesNotMatch(E.talkPrompt(talk, 'x', '', false), /card/)
})
