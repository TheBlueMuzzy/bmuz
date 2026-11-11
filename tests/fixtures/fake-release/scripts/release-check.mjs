// Stand-in for release-check.mjs: the stage's checklist file, its open lines, and the stand-ins (credits.json entries
// marked "standIn": true), in the real script's words.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const checkFile = stage => `.planning/archive/release-checks/${stage}.md`
export function readChecklist(text) {
  return String(text || '').split('\n').map(l => l.match(/^\s*-\s*\[( |x|X)\]\s*([^:]+):(.*)$/)).filter(Boolean)
    .map(([, box, label, rest]) => ({ label: label.trim(), ticked: box !== ' ', filled: rest.trim() !== '', text: rest.trim() }))
}
export function standIns(root) {
  let credits = []
  try { credits = JSON.parse(readFileSync(join(root, 'content', 'credits.json'), 'utf8')) } catch (e) { credits = [] }
  return credits.filter(e => e && e.standIn === true).map(e => `credits.json: ${[].concat(e.paths || []).join(', ')} — "standIn: true"`)
}
export function releaseCheckProblems(root, stage) {
  const path = join(root, checkFile(stage))
  if (!existsSync(path)) return [[`no release checklist for ${stage} (${checkFile(stage)})`, 'write it']]
  return readChecklist(readFileSync(path, 'utf8')).filter(l => !l.ticked || !l.filled).map(l => [`release checklist: "${l.label}" isn't ticked`, 'tick it'])
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { called } = await import('./lib.mjs')
  called('release-check')
  const stage = process.argv[2]
  const path = checkFile(stage)
  if (!existsSync(path)) { mkdirSync('.planning/archive/release-checks', { recursive: true }); writeFileSync(path, `# Release check — ${stage}\n- [ ] Devices: <which phones>\n`) }
  console.log(`✓ ${path}`)
}
