// Checks the bug-garden fixture from the outside (F215's headless run): both places of the planted mistake fixed.
// node tests/fixtures/bug-garden-check.mjs <game folder>  → prints a JSON verdict
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
const dir = process.argv[2]
const rows = [['bloom', 'bloom', 'bloom'], ['bloom', 'seed', 'empty'], ['empty', 'empty', 'empty']]
const { finalScore } = await import(pathToFileURL(join(dir, 'src', 'score.js')).href + `?t=${Date.now()}`)
const { fullRowBonus } = await import(pathToFileURL(join(dir, 'src', 'bonus.js')).href + `?t=${Date.now()}`)
console.log(JSON.stringify({ score: finalScore(rows), bonus: fullRowBonus(rows), ok: finalScore(rows) === 4 && fullRowBonus(rows) === 2 }))
