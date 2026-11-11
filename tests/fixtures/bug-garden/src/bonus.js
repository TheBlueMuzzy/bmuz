// The full-row bonus: each row of three blooms earns 2 more points.
export function fullRowBonus(rows) {
  let bonus = 0
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 3 && row.every(cell => cell === 'bloom')) bonus += 2
  }
  return bonus
}
