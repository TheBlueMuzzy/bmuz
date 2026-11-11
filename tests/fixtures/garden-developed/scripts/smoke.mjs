// npm run smoke: the build loads and one turn plays.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { newGame, draw, play } from '../src/garden.js'
spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' })
if (!/Garden Race/.test(readFileSync('dist/index.html', 'utf8'))) { console.log('smoke: the page is empty'); process.exit(1) }
const g = draw(newGame(['sunflower', 'rose']))
play(g, g.players[0].hand[0], 0)
console.log(g.turn === 1 ? 'smoke: the page loads and a turn plays' : 'smoke: the turn did not pass')
process.exit(g.turn === 1 ? 0 : 1)
