// Garden Race: the game state. Every number comes from content/ (never written in the code).
import { readFileSync } from 'node:fs'

export const tuning = JSON.parse(readFileSync(new URL('../content/tuning/game.json', import.meta.url), 'utf8'))
export const seeds = JSON.parse(readFileSync(new URL('../content/data/seed-cards.json', import.meta.url), 'utf8'))

// A new game for two: each player has empty rows and an empty hand; the turn is player 0's.
export function newGame() {
  const player = () => ({ rows: Array.from({ length: tuning.rows }, () => []), hand: [], score: 0 })
  return { players: [player(), player()], turn: 0, deck: [] }
}
