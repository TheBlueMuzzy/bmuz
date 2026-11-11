// Stand-in for hooks/smoke-pass.mjs: the project's smoke script runs; its pass is recorded for the commit tested.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { called, git } from '../scripts/lib.mjs'
called('smoke-pass')
const r = spawnSync('npm run smoke', { shell: true, encoding: 'utf8' })
if (r.status !== 0) { console.log(`✗ smoke failed: ${r.stdout}${r.stderr}`); process.exit(1) }
mkdirSync('.planning', { recursive: true })
writeFileSync('.planning/smoke-pass', `${git('rev-parse', 'HEAD')}\nsmoke passed\n`)
console.log('✓ smoke pass recorded')
