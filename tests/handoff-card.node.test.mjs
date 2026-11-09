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

const Q = (key, extra = {}) => ({ key, q: `What about ${key}?`, kind: 'choice', options: ['a', 'b'], ...extra })

test('new questions number on from the highest; every card lists all open ones with their numbers', () => {
  let list = E.addCardQuestions([], [Q('colour'), Q('size')], '2026-11-09')
  assert.deepEqual(list.map(x => [x.n, x.key, x.status, x.askedIn]), [[1, 'colour', 'open', 0], [2, 'size', 'open', 0]])
  let card = E.questionsForCard(list)
  assert.deepEqual(card.shown.map(x => x.n), [1, 2])
  // 1 answered; a later card adds "speed" as 3 (numbers are never reused) and still lists 2
  list = card.list.map(x => (x.n === 1 ? { ...x, status: 'answered' } : x))
  list = E.addCardQuestions(list, [Q('speed'), Q('size')], '2026-11-10') // "size" again: not added twice
  assert.deepEqual(list.map(x => x.n), [1, 2, 3])
  card = E.questionsForCard(list)
  assert.deepEqual(card.shown.map(x => x.n), [2, 3])
})

test('a question shown in 2 cards and still unanswered is parked and left out; asked again, it opens again', () => {
  let list = E.addCardQuestions([], [Q('colour')], '2026-11-09')
  for (let i = 0; i < 2; i++) list = E.questionsForCard(list).list
  const third = E.questionsForCard(list)
  assert.deepEqual(third.shown, [])
  assert.equal(third.list[0].status, 'parked')
  const md = E.questionsMd(null, [], third.list)
  assert.match(md, /## Parked — decide when the feature that needs it is planned\n.*\n- 1\. What about colour\? \(options: a \/ b\) — asked in 2 cards, first on 2026-11-09\n$/)
  const back = E.questionsForCard(E.addCardQuestions(third.list, [Q('colour')], '2026-11-12'))
  assert.deepEqual(back.shown.map(x => [x.n, x.askedIn]), [[1, 1]])
})

test('questions.md: an auto run\'s lines go above the parked section, which is rewritten in place', () => {
  const parked = [{ n: 4, key: 'k', q: 'Which?', kind: 'want', options: [], askedIn: 2, status: 'parked', addedAt: '2026-11-09' }]
  let md = E.questionsMd(null, ['- [ ] a'])
  assert.equal(md, E.QUESTIONS_MD_HEAD + '- [ ] a\n') // as before F213
  md = E.questionsMd(md, [], parked)
  md = E.questionsMd(md, ['- [ ] b'])
  assert.equal(md, E.QUESTIONS_MD_HEAD + '- [ ] a\n- [ ] b\n\n' + md.slice(md.indexOf(E.PARKED_HEADING)))
  assert.match(md, /- 4\. Which\? — asked in 2 cards/)
  assert.doesNotMatch(E.questionsMd(md, [], []), /Parked/) // answered: the section goes
})

test('a card question needs a key, and a key once per card', () => {
  assert.match(E.checkCard({ ...CARD, questions: [{ q: 'Which?', kind: 'choice' }] }).why, /question 1 needs a "key"/)
  assert.match(E.checkCard({ ...CARD, questions: [Q('a'), Q('a')] }).why, /question 2 has the same key "a"/)
})

test('answers by number: "1 yes", "1. blue", "2: the first one"; only waiting questions; not "1.5 seconds"', () => {
  const list = [
    { n: 1, key: 'a', q: 'A?', status: 'open' }, { n: 2, key: 'b', q: 'B?', status: 'parked' },
    { n: 3, key: 'c', q: 'C?', status: 'answered' },
  ]
  const ans = t => E.matchAnswers(t, list).map(a => [a.n, a.answer])
  assert.deepEqual(ans('1 yes'), [[1, 'yes']])
  assert.deepEqual(ans('1. blue\n2: the first one'), [[1, 'blue'], [2, 'the first one']])
  assert.deepEqual(ans('ok then\n 2) bigger  '), [[2, 'bigger']])
  assert.deepEqual(ans('3 again'), []) // answered already
  assert.deepEqual(ans('9 what'), []) // no such question
  assert.deepEqual(ans('1.5 seconds feels right'), [])
  assert.deepEqual(ans('looks good to me'), [])
})

test('recorded answers join the decisions; a later card asking the same key is refused with the answer', () => {
  const list = [{ n: 1, key: 'orientation', q: 'Portrait or landscape?', status: 'open' }]
  const out = E.recordAnswers(list, [], E.matchAnswers('1 portrait', list), '2026-11-09')
  assert.equal(out.list[0].status, 'answered')
  assert.deepEqual(out.decisions, [{ key: 'orientation', q: 'Portrait or landscape?', answer: 'portrait', at: '2026-11-09' }])
  assert.match(E.decisionsMd(out.decisions), /- 2026-11-09 · Portrait or landscape\? — \*\*portrait\*\* \(`orientation`\)/)
  const again = E.checkCard({ ...CARD, questions: [Q('orientation')] }, out.decisions)
  assert.equal(again.ok, false)
  assert.match(again.why, /already answered on 2026-11-09: portrait — use it, don't ask again/)
  assert.match(E.answersNote([{ n: 1, answer: 'yes' }, { n: 2, answer: 'you pick' }]), /answers recorded for 1, 2.*For 2 the creative said "you pick"/)
})
