// The builder helper's only way to run anything (F216 review fix 2a: no Bash for it). A fixed list, in the project
// folder, nothing else: no git, no free commands.
//   node run.mjs test [<test file>]     the project's test command (npm test), or one test file with its runner
//   node run.mjs check                  npm run check:fast, when the project has it
//   node run.mjs install                npm install (no arguments)
//   node run.mjs screenshot <url> <out.png> <phone|desktop>   npx playwright screenshot, when the project has Playwright;
//                                       the url on localhost, the file in .planning/screens/
// Prints what the command printed (its last part), then one line of JSON: {"exitCode", "changed": [files it changed]}.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import * as E from '../hooks/engine.js'

const SIZES = { phone: '390,844', desktop: '1280,800' }
const readPkg = dir => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) } catch (e) { return {} } }

// The command for one request, or { error } in plain words. pkg = package.json.
export function commandFor(what, args = [], pkg = {}, exists = () => true) {
  const s = pkg.scripts || {}
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  if (what === 'test') {
    const file = args[0]
    if (!file) return s.test ? { argv: ['npm', 'test'] } : { error: 'package.json has no "test" script' }
    if (!E.isSafePath(file) || !/^[\w@./-]+$/.test(file) || !exists(file)) return { error: `"${file}" isn't a test file in the project` }
    if (/\bvitest\b/.test(s.test || '')) return { argv: ['npx', '--no-install', 'vitest', 'run', file] }
    if (/\bjest\b/.test(s.test || '')) return { argv: ['npx', '--no-install', 'jest', file] }
    return { argv: [process.execPath, '--test', file] }
  }
  if (what === 'check') return s['check:fast'] ? { argv: ['npm', 'run', 'check:fast'] } : { error: 'package.json has no "check:fast" script' }
  if (what === 'install') return args.length ? { error: '"install" takes no arguments: it installs what package.json lists' } : { argv: ['npm', 'install'] }
  if (what === 'screenshot') {
    const [url, out, size] = args
    if (!deps.playwright && !deps['@playwright/test']) return { error: 'the project has no Playwright (package.json), so no screenshots: say so in your answer' }
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?(\/[\w./?=&%#-]*)?$/.test(String(url || ''))) return { error: 'a screenshot is of the game on localhost, like http://localhost:5173/' }
    if (!(E.isSafePath(out) && /^\.planning\/screens\/[\w.-]+\.png$/.test(String(out)))) return { error: 'a screenshot goes in .planning/screens/<name>.png' }
    if (!SIZES[size]) return { error: 'the size is phone or desktop' }
    return { argv: ['npx', '--no-install', 'playwright', 'screenshot', `--viewport-size=${SIZES[size]}`, url, out] }
  }
  return { error: `"${what}" isn't one of: test, check, install, screenshot` }
}

// The game's dev server for one screenshot: started only when the url doesn't answer yet and package.json has "dev";
// waits up to 30 s for it. Returns the child to stop, or null.
async function startDev(dir, url, env) {
  const answers = async () => { try { const r = await fetch(url); return r.status < 500 } catch (e) { return false } }
  if (await answers()) return null
  if (!((readPkg(dir).scripts || {}).dev)) return null
  const port = (String(url).match(/:(\d{2,5})/) || [])[1] || '5173'
  const child = spawn('npm', ['run', 'dev', '--', '--port', port, '--strictPort'], { cwd: dir, env, shell: process.platform === 'win32', stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await answers()); i++) await new Promise(r => setTimeout(r, 500))
  return child
}
function stopDev(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
  else { try { process.kill(-child.pid) } catch (e) { child.kill('SIGTERM') } }
}

const git = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 60000 })
const changedNow = dir => (git(dir, ['status', '--porcelain', '--untracked-files=all']).stdout || '').split('\n').filter(Boolean).map(l => l.slice(3).replace(/^"|"$/g, '')).filter(f => !/^\.bmuz\//.test(f) && !/^node_modules\//.test(f))
const shaOf = (dir, f) => { try { return E.textSha(readFileSync(join(dir, f), 'utf8')) } catch (e) { return null } }

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [what, ...args] = process.argv.slice(2)
  const dir = process.cwd()
  const c = commandFor(what, args, readPkg(dir), f => existsSync(join(dir, f)))
  if (c.error) { console.log(`✘ ${c.error}`); console.log(JSON.stringify({ exitCode: 2, changed: [] })); process.exit(0) }
  const before = new Map(changedNow(dir).map(f => [f, shaOf(dir, f)]))
  const limit = Math.min(E.testTimeoutOf((() => { try { return JSON.parse(readFileSync(join(dir, 'bmuz.json'), 'utf8')) } catch (e) { return {} } })()), 570000)
  const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
  delete env.NODE_TEST_CONTEXT
  const win = process.platform === 'win32' && c.argv[0] !== process.execPath
  // (a screenshot of a game with a "dev" script: its dev server is started on the url's port for the shot, then stopped;
  // the builder has no other way to start one)
  const server = what === 'screenshot' ? await startDev(dir, args[0], env) : null
  const r = spawnSync(c.argv[0], c.argv.slice(1), { cwd: dir, encoding: 'utf8', timeout: limit, shell: win, env })
  if (server) stopDev(server)
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT') || (r.status === null && !!r.signal)
  console.log(out.slice(-3000))
  if (timedOut) console.log(`(stopped after ${Math.round(limit / 1000)} s: that is neither a pass nor a fail)`)
  const changed = changedNow(dir).filter(f => !before.has(f) || before.get(f) !== shaOf(dir, f))
  console.log(JSON.stringify({ exitCode: r.status === null ? -1 : r.status, timedOut, changed }))
}
