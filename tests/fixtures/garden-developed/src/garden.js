// Garden Race: the game state and its rules. Every number comes from content/ (never written in the code).
import { readFileSync } from 'node:fs'

export const tuning = JSON.parse(readFileSync(new URL('../content/tuning/game.json', import.meta.url), 'utf8'))
export const seeds = JSON.parse(readFileSync(new URL('../content/data/seed-cards.json', import.meta.url), 'utf8'))

// A new game for two: each player has empty rows and an empty hand; the turn is player 0's.
export function newGame(deck = []) {
  const player = () => ({ rows: Array.from({ length: tuning.rows }, () => []), hand: [], score: 0 })
  return { players: [player(), player()], turn: 0, deck: [...deck] }
}
// F01: draw, play one card, the turn passes.
export function draw(game) {
  const p = game.players[game.turn]
  for (let i = 0; i < tuning.drawPerTurn && game.deck.length; i++) p.hand.push(game.deck.shift())
  return game
}
export function play(game, card, row, target = game.turn) {
  const p = game.players[game.turn]
  const at = p.hand.indexOf(card)
  if (at < 0) throw new Error(`${card} isn't in the hand`)
  p.hand.splice(at, 1)
  // F03: weather lands on a friend's row; F02: a seed is planted in your own
  if (card === 'hail') game.players[target].rows[row].pop()
  else if (card === 'rain') game.players[target].rows[row].forEach(s => { s.grown += 1 })
  else p.rows[row].push({ seed: card, grown: 0 })
  game.turn = 1 - game.turn
  return game
}
// F02: a flower blooms once it has grown enough.
export const blooms = (game, who) => game.players[who].rows.flat().filter(s => s.grown >= tuning.bloomsToScore).length
