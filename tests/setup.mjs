// Puts project/ into a known state for a test.
// node tests/setup.mjs <fresh|at-plan|at-hello|at-review|stall|done> [cfg-json]
//   stall = at-hello with a helper that freezes 150s and a 25s watchdog (live watchdog test)
//   done  = every step finished (the engine stands aside; never-stall test)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const project = new URL('../project/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let [where = 'fresh', cfg = '{}'] = process.argv.slice(2)
if (where === 'stall') {
  where = 'at-hello'
  cfg = JSON.stringify({ flowArgs: { stallTest: 150 }, testAgentTools: ['Bash', 'ToolSearch'], watchdogMs: 25000, watchdogTickMs: 3000 })
}
rmSync(join(project, '.bmuz'), { recursive: true, force: true })
for (const f of ['plan.json', 'hello.html', 'x.txt', 'notes.txt', 'colour.txt', 'done.txt']) rmSync(join(project, f), { force: true })
mkdirSync(join(project, '.bmuz'), { recursive: true })
writeFileSync(join(project, 'bmuz.json'), JSON.stringify({ pipeline: 'hello', ...JSON.parse(cfg) }, null, 2))

const all = ['name', 'approve', 'plan', 'hello', 'review']
const done = { fresh: [], 'at-plan': all.slice(0, 2), 'at-hello': all.slice(0, 3), 'at-review': all.slice(0, 4), done: all }[where]
if (!done) {
  console.log(`unknown state ${where}`)
  process.exit(1)
}
if (done.length === 0) process.exit(0)
if (done.includes('plan')) writeFileSync(join(project, 'plan.json'), JSON.stringify({ name: 'Moon Goat', pages: ['hello'] }))
if (done.includes('hello')) writeFileSync(join(project, 'hello.html'), '<h1>Hello Moon Goat</h1>')
const current = where === 'at-review' ? 'review' : null
const status = where === 'done' ? 'done' : current ? 'working' : 'idle'
const state = {
  pipeline: 'hello', current, status, results: { name: 'Moon Goat' },
  retries: {}, finished: done, blocked: null, startedAt: current ? Date.now() : null,
}
writeFileSync(join(project, '.bmuz', 'state.json'), JSON.stringify(state, null, 2))
console.log(`project set to ${where}`)
