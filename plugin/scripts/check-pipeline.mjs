// Checks pipeline files before they ship: the same check the engine runs at session start,
// plus that every file a pipeline names exists in the plugin.
// node plugin/scripts/check-pipeline.mjs [pipeline.json ...]   (no files = every file in plugin/pipelines/)
// Prints each problem in plain words; exits 1 if there are any.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).name
// Unattended runs must never stop at Claude Code's own "run this workflow?" question: each workflow is pre-approved there.
const autoAllow = JSON.parse(readFileSync(join(root, 'settings', 'auto-run.json'), 'utf8')).permissions.allow

export function checkFile(file) {
  let p
  try {
    p = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return [`can't be read as JSON: ${err.message}`]
  }
  const problems = E.checkPipeline(p)
  const name = basename(file, '.json')
  if (p && p.id !== undefined && p.id !== name) problems.push(`its id "${p.id}" must match its file name "${name}"`)
  for (const f of E.pluginFiles(p)) if (!existsSync(join(root, f))) problems.push(`the craft note ${f} is missing`)
  for (const s of Array.isArray(p && p.steps) ? p.steps : []) {
    if (s && s.kind === 'flow' && typeof s.workflow === 'string' && s.workflow.startsWith(`${plugin}:`)) {
      const wf = s.workflow.slice(plugin.length + 1)
      if (!existsSync(join(root, 'workflows', `${wf}.js`))) problems.push(`step "${s.id}": the workflow ${s.workflow} has no file workflows/${wf}.js`)
    }
    if (s && s.kind === 'flow' && typeof s.workflow === 'string' && !autoAllow.includes(`Workflow(${s.workflow})`)) {
      problems.push(`step "${s.id}": add "Workflow(${s.workflow})" to settings/auto-run.json's permissions.allow, or an overnight run stops at Claude Code's "run this workflow?" question`)
    }
    // A script step's command and a "script-ok" done-check's command: a {plugin}/ script they name must exist.
    const commands = [s && s.kind === 'script' && s.run, s && s.done && s.done.type === 'script-ok' && s.done.run].filter(Array.isArray)
    for (const run of commands) {
      for (const arg of run) {
        const m = typeof arg === 'string' && arg.match(/^\{plugin\}\/(.+)$/)
        if (m && !existsSync(join(root, m[1]))) problems.push(`step "${s.id}": the script ${m[1]} is missing`)
      }
    }
  }
  return problems
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const files = args.length ? args : readdirSync(join(root, 'pipelines')).filter(f => f.endsWith('.json')).map(f => join(root, 'pipelines', f))
  let bad = 0
  for (const file of files) {
    const problems = checkFile(file)
    if (problems.length) {
      bad++
      console.log(`✘ ${basename(file)}: ${problems.length} problem${problems.length > 1 ? 's' : ''}`)
      for (const x of problems) console.log(`  - ${x}`)
    } else {
      console.log(`✔ ${basename(file)}`)
    }
  }
  process.exit(bad ? 1 : 0)
}
