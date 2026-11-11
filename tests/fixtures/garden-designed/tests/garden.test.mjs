import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, tuning } from '../src/garden.js'

test('a new game has two players, each with empty rows', () => {
  const g = newGame()
  assert.equal(g.players.length, 2)
  for (const p of g.players) assert.equal(p.rows.length, tuning.rows)
})
