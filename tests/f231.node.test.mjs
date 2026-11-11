// F231 — engine fixes from the Xong live look (2026-11-10): no-Claude tests of the engine's pure rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../plugin/hooks/engine.js'

// Claude Code's refusal in the live run (Ideate's gaps, 14:37), as the tool result carried it.
const SHAPE = { result: '<tool_use_error>InputValidationError: This call included a question with fewer than 2 options, so it was rejected and the person never saw it. [{"code": "too_small", "minimum": 2, "message": "Too small: expected array to have >=2 items"}]</tool_use_error>', isError: true }

test('F231 fix 1: a shape refusal is not "nobody is here"; only "not available in this session" is', () => {
  assert.equal(E.isShapeRefusal(SHAPE), true)
  assert.equal(E.isNobodyToAsk(SHAPE), false)
  assert.equal(E.isNobodyToAsk({ result: 'not available in this session', isError: true }), true)
  assert.equal(E.isNobodyToAsk({ result: 'AskUserQuestion is not available in non-interactive mode', isError: true }), true)
  // anything else (an unknown refusal) is a failed ask, never auto
  assert.equal(E.isNobodyToAsk({ result: 'Something went wrong', isError: true }), false)
  assert.equal(E.isNobodyToAsk({ deny: 'BMUZ engine: the option "I\'ll paste it" stands in for typing' }), false)
})

test('F231 fix 1: the engine refuses a question box with fewer than 2 or more than 4 options, in plain words', () => {
  const q = (n, header = 'Frame') => [{ question: 'Which?', header, options: Array.from({ length: n }, (_, i) => ({ label: `o${i}` })) }]
  assert.match(E.optionCountProblem(q(1)), /"Frame" has 1 option; the question box takes 2 to 4 real options\. With only one way forward/)
  assert.match(E.optionCountProblem(q(0)), /has 0 options/)
  assert.match(E.optionCountProblem(q(5)), /has 5 options.*Keep the 4 that matter most/)
  for (const n of [2, 3, 4]) assert.equal(E.optionCountProblem(q(n)), null)
  assert.equal(E.optionCountProblem([{ question: 'no list' }]), null) // left to Claude Code's own check
  assert.equal(E.optionCountProblem(undefined), null)
  // the live run's box: four questions, the fourth with one option
  assert.match(E.optionCountProblem([...q(2, 'a'), ...q(3, 'b'), ...q(2, 'c'), ...q(1, 'Matter most')]), /"Matter most" has 1 option/)
})
