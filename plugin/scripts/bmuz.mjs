// Motor B: the same pipeline file and engine.js, driven from a shell command.
// `bmuz next` prints the step to do now (and its craft note) for the project in the current folder.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const project = process.cwd()
const cmd = process.argv[2] || 'next'
if (!existsSync(join(project, 'bmuz.json'))) {
  console.log('BMUZ: no bmuz.json in this folder.')
  process.exit(1)
}
const cfg = JSON.parse(readFileSync(join(project, 'bmuz.json'), 'utf8'))
const p = JSON.parse(readFileSync(join(root, 'pipelines', `${cfg.pipeline}.json`), 'utf8'))
const statePath = join(project, '.bmuz', 'state.json')
const journalPath = join(project, '.bmuz', 'journal.jsonl')
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : E.rebuildFromJournal(p.id, existsSync(journalPath) ? readFileSync(journalPath, 'utf8').split('\n') : [])
if (cmd === 'next') {
  const step = (state.current && E.stepById(p, state.current)) || E.nextStep(p, state)
  if (!step || state.status === 'done') {
    console.log(`BMUZ next: nothing — all ${p.steps.length} steps done.`)
  } else {
    const n = p.steps.indexOf(step) + 1
    console.log(`BMUZ next: step ${n} of ${p.steps.length} "${step.id}" (${step.kind}), status ${state.status}`)
    if (step.tools) console.log(`tools allowed: ${step.tools.join(', ')}`)
    if (step.craft) console.log(readFileSync(join(root, step.craft), 'utf8').trim())
  }
}
