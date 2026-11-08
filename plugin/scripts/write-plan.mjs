// Script step: writes <project>/plan.json for the game name, then checks it.
// A file <project>/.bmuz/test-break-plan makes it write a broken plan (retry test).
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [project, name] = process.argv.slice(2)
const broken = existsSync(join(project, '.bmuz', 'test-break-plan'))
const plan = broken ? { pages: ['hello'] } : { name, pages: ['hello'], madeBy: 'write-plan.mjs' }
writeFileSync(join(project, 'plan.json'), JSON.stringify(plan, null, 2))
const back = JSON.parse(readFileSync(join(project, 'plan.json'), 'utf8'))
if (!back.name) {
  console.log(JSON.stringify({ ok: false, why: 'plan has no name' }))
  process.exit(2)
}
console.log(JSON.stringify({ ok: true, plan: back }))
