// Define's last step ("stage"): after the creative locks the concept, the GDD moves to Design.
// node define-stage.mjs        (run in the project folder; changes only .planning/GDD.md)
//
// The design: framework .planning/research/bmuz-vision/define-research.md, sections 5(d) and 6 (a script
// check, not Claude's memory). It refuses, in plain words, while the story, the primary feelings, the pillars
// or the first release's musts are still open: Design needs them. Otherwise it sets the phase line to
// "Current phase: Design · concept locked <date> (Define run N)" and logs the lock under Changes, once.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORE, GDD, fieldText, gddRuns, isOpen, readGdd } from './define-doc.mjs'

const WORDS = { Story: 'the story', 'Primary feelings': 'the primary feelings', Pillars: 'the pillars', 'First release (musts)': "the first release's musts" }

// Returns { ok: true, text } or { ok: false, why }.
export function stage(gddText, date) {
  if (gddText === null) return { ok: false, why: `Not ready for Design: there is no ${GDD} yet (the write step makes it).` }
  const g = readGdd(gddText)
  if (g.at < 0) return { ok: false, why: `Not ready for Design: ${GDD} has no concept (Part 1) yet.` }
  const missing = CORE.filter(([name, label]) => {
    const sub = g.subs.find(s => s.name === name)
    return isOpen(sub ? fieldText(sub, label) : null)
  })
  if (missing.length) {
    const what = missing.map(([, label, step]) => `${WORDS[label]} (step "${step}")`)
    return { ok: false, why: `Not ready for Design: ${what.join(', ')} ${missing.length > 1 ? 'are' : 'is'} still open. Design builds on them, so choose ${missing.length > 1 ? 'them' : 'it'} first: say "bmuz undo ${missing[0][2]}" to go back to that step, or run define again.` }
  }
  const n = gddRuns(gddText).define
  const all = g.all.slice()
  const pAt = all.findIndex(l => /^Current phase:/.test(l))
  const phase = `Current phase: Design · concept locked ${date} (Define run ${n})`
  if (pAt >= 0) all[pAt] = phase
  else all.splice(1, 0, phase)
  let text = all.join('\n')
  const log = `- ${date} · Concept locked; on to Design · the creative chose "Lock it" · Define run ${n} → Design`
  if (!text.includes(`· Define run ${n} → Design`)) {
    const lines = text.split('\n')
    const at = lines.findIndex(l => /^## Changes\b/i.test(l))
    if (at < 0) lines.push('', '## Changes', log)
    else {
      let end = lines.findIndex((l, i) => i > at && /^## /.test(l))
      if (end < 0) end = lines.length
      while (end > at + 1 && !lines[end - 1].trim()) end--
      lines.splice(end, 0, log)
    }
    text = lines.join('\n')
  }
  return { ok: true, text: text.replace(/\n*$/, '\n') }
}

function main() {
  const path = join(process.cwd(), GDD)
  const r = stage(existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null, new Date().toLocaleDateString('en-CA'))
  if (!r.ok) { console.log(`✘ ${r.why}`); process.exit(1) }
  writeFileSync(path, r.text)
  console.log(`✔ ${GDD}: concept locked, Current phase: Design`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
