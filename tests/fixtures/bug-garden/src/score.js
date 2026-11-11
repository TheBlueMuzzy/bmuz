// The garden's final score: every bloom in every row counts one point.
// rows: a list of rows, each a list of cells ("bloom", "seed" or "empty").
export function finalScore(rows) {
  let total = 0
  for (let i = 1; i < rows.length; i++) {
    total += rows[i].filter(cell => cell === 'bloom').length
  }
  return total
}
