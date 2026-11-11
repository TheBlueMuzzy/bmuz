import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finalScore } from '../src/score.js'
import { fullRowBonus } from '../src/bonus.js'

test('an empty garden scores nothing', () => {
  assert.equal(finalScore([]), 0)
  assert.equal(fullRowBonus([]), 0)
})
