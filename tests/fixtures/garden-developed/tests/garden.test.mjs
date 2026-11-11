import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, draw, play, blooms, tuning } from '../src/garden.js'

test('a new game has two players, each with empty rows', () => {
  const g = newGame()
  assert.equal(g.players.length, 2)
  for (const p of g.players) assert.equal(p.rows.length, tuning.rows)
})
test('F01: a turn draws, plays one card and passes', () => {
  const g = draw(newGame(['sunflower', 'rose']))
  assert.equal(g.players[0].hand.length, tuning.drawPerTurn)
  play(g, g.players[0].hand[0], 0)
  assert.equal(g.turn, 1)
})
test('F02 + F03: rain grows a friend\'s row until it blooms; hail knocks a flower back', () => {
  const g = newGame()
  g.players[1].rows[0].push({ seed: 'rose', grown: 0 })
  for (let i = 0; i < tuning.bloomsToScore; i++) { g.turn = 0; g.players[0].hand.push('rain'); play(g, 'rain', 0, 1) }
  assert.equal(blooms(g, 1), 1)
  g.turn = 0; g.players[0].hand.push('hail'); play(g, 'hail', 0, 1)
  assert.equal(blooms(g, 1), 0)
})
