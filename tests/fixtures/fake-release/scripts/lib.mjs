// BMUZ's tests: stand-ins for the release scripts in ~/.claude/config/bmuz (F219 review fix 7), so the Deliver tests
// always run, on any machine. Each one does the smallest true version of its job on the project's own git repository
// (never a remote), logs its call to $BMUZ_FAKE_RELEASE_LOG, and fails when its FAKE_<NAME>=fail is set.
import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export function called(name) {
  if (process.env.BMUZ_FAKE_RELEASE_LOG) appendFileSync(process.env.BMUZ_FAKE_RELEASE_LOG, `${[name, ...process.argv.slice(2)].join(' ')}\n`)
  const how = process.env[`FAKE_${name.toUpperCase().replace(/-/g, '_')}`]
  if (how === 'fail') { console.log(`✗ ${name} refused (a test stand-in told to fail)`); process.exit(1) }
  return how || ''
}
export const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' })
  if (r.status !== 0) { console.log(`✗ git ${args.join(' ')}: ${r.stderr || r.stdout}`); process.exit(1) }
  return (r.stdout || '').replace(/\s+$/, '') // (the end only: a status line starts with a space)
}
export const readJson = f => JSON.parse(readFileSync(f, 'utf8'))
