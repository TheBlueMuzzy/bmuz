// The one wrapper Deliver (F219) uses for the release scripts BMUZ already has, in ~/.claude/config/bmuz/scripts:
// release-check, merge, release, live-check, rollback, deps-check, and hooks/smoke-pass. They are run where they live,
// never copied (the F219 scope call: moving them into the plugin is F223 — Hook diet's / F226 — Six stages' job).
// BMUZ_RELEASE_TOOLS names another scripts folder (a test may point it somewhere else; nothing else does).
//   runTool(dir, 'merge', ['dev/vertical-slice'])  → { ok, code, out }   (run in the project folder)
//   loadTool('release-check')                       → the script's module (standIns, readChecklist, …)
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FILES = {
  'release-check': 'release-check.mjs',
  merge: 'merge.mjs',
  release: 'release.mjs',
  'live-check': 'live-check.mjs',
  rollback: 'rollback.mjs',
  'deps-check': 'deps-check.mjs',
  'smoke-pass': join('..', 'hooks', 'smoke-pass.mjs'),
}

export const toolsDir = () => process.env.BMUZ_RELEASE_TOOLS || join(homedir(), '.claude', 'config', 'bmuz', 'scripts')

export function toolPath(name) {
  if (!FILES[name]) throw new Error(`"${name}" isn't one of the release tools (${Object.keys(FILES).join(', ')})`)
  const path = join(toolsDir(), FILES[name])
  if (!existsSync(path)) throw new Error(`the release tool ${name} isn't installed here (${path}); the BMUZ config (~/.claude/config/bmuz) has it`)
  return path
}

// Runs one tool in the project folder and hands back what it printed. Never throws for a refusal: ok is false and
// out says why in the tool's own plain words.
export function runTool(dir, name, args = [], { timeout = 540000 } = {}) {
  const r = spawnSync(process.execPath, [toolPath(name), ...args], { cwd: dir, encoding: 'utf8', timeout, env: process.env })
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()
  if (r.error && r.error.code === 'ETIMEDOUT') return { ok: false, code: null, out: `${name} didn't finish in ${Math.round(timeout / 1000)} s and was stopped\n${out}` }
  return { ok: r.status === 0, code: r.status, out }
}

export async function loadTool(name) {
  return import(pathToFileURL(toolPath(name)).href)
}
