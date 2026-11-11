// Marked blocks: how BMUZ writes into a document the creative may also edit (F227; the GDD's own marks are gdd.mjs's).
// BMUZ's text for one part sits between two marks carrying a fingerprint of what BMUZ last wrote:
//   <!-- bmuz rb:flow · 1a2b3c4d -->  …  <!-- /bmuz rb:flow -->
// Anything outside the marks is the creative's and is never touched. Text inside the marks that no longer matches
// its fingerprint was edited by hand: it moves OUT of the marks (theirs for good) and BMUZ's new text goes in the
// marks below it, dated. So nothing they wrote is ever overwritten (the rule: read their edits, never overwrite them).
import { createHash } from 'node:crypto'

const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
export const fingerprint = text => createHash('sha1').update(nl(text).trim()).digest('hex').slice(0, 8)
const KEY_RE = /^[a-z][a-z0-9:-]*$/

// A part's text as BMUZ keeps it: a step that hands back a part as the file shows it brings BMUZ's marks (and the
// heading the part sits under) along; those belong to the file, not the text — kept, they nested a second pair of
// marks inside the first (F227 review; gdd.chapterText does the same for chapters).
export function bodyText(text, heading = null) {
  const lines = nl(text).split('\n').filter(l => !/^<!-- \/?bmuz [a-z][a-z0-9:-]*( · [0-9a-f]{8})? -->$/.test(l.trim()))
  while (lines.length && lines[0].trim() === '') lines.shift()
  if (heading !== null && lines.length && lines[0].trim() === String(heading).trim()) lines.shift()
  return lines.join('\n').trim()
}

export function block(key, text) {
  if (!KEY_RE.test(key)) throw new Error(`"${key}" isn't a block name`)
  const body = bodyText(text)
  return `<!-- bmuz ${key} · ${fingerprint(body)} -->\n${body}\n<!-- /bmuz ${key} -->`
}

// Every block in the text: { key: { start, end, text, edited } } (start / end = the marks' line numbers).
export function readBlocks(text) {
  const lines = nl(text).split('\n')
  const out = {}
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^<!-- bmuz ([a-z][a-z0-9:-]*) · ([0-9a-f]{8}) -->$/)
    if (!m || out[m[1]]) continue
    const end = lines.indexOf(`<!-- /bmuz ${m[1]} -->`, i + 1)
    if (end < 0) continue
    const body = lines.slice(i + 1, end).join('\n').trim()
    out[m[1]] = { start: i, end, text: body, edited: fingerprint(body) !== m[2] }
  }
  return out
}

// Writes one block. If it isn't there yet it goes right after the line `after` (an exact line, like "## Setup"),
// or at the end. Returns { text, changed, kept } (kept = their own edit inside the marks was kept, above).
export function writeBlock(text, key, body, { after = null, by = {} } = {}) {
  const want = bodyText(body, after)
  const lines = nl(text).split('\n')
  const have = readBlocks(text)[key]
  if (!want) return { text: nl(text), changed: false, kept: false }
  if (!have) {
    let at = after === null ? -1 : lines.findIndex(l => l.trim() === after)
    if (at < 0) { while (lines.length && lines[lines.length - 1].trim() === '') lines.pop(); lines.push(''); at = lines.length - 1 }
    lines.splice(at + 1, 0, ...block(key, want).split('\n'))
    return { text: lines.join('\n'), changed: true, kept: false }
  }
  if (!have.edited) {
    if (have.text === want) return { text: nl(text), changed: false, kept: false }
    lines.splice(have.start, have.end - have.start + 1, ...block(key, want).split('\n'))
    return { text: lines.join('\n'), changed: true, kept: false }
  }
  if (have.text === want) return { text: nl(text), changed: false, kept: false }
  const note = `BMUZ, ${by.day || ''}${by.step ? ` (${by.stage ? `${by.stage} · ` : ''}${by.step})` : ''}:`
  lines.splice(have.start, have.end - have.start + 1, ...have.text.split('\n'), '', ...block(key, `${note}\n${want}`).split('\n'))
  return { text: lines.join('\n'), changed: true, kept: true }
}

// After BMUZ changed lines in place (F216: a feature's state mark in the roadmap, a ticked task in the sprint, a line
// added under Ideas): every block that was BMUZ's own before the change (its text matched its fingerprint) gets the
// fingerprint of its new text, so it stays BMUZ's. A block the creative had edited keeps its old fingerprint: theirs.
export function refreshMarks(before, after) {
  const was = readBlocks(before)
  const now = readBlocks(after)
  const lines = nl(after).split('\n')
  for (const [key, b] of Object.entries(now)) {
    if (!was[key] || was[key].edited) continue
    lines[b.start] = `<!-- bmuz ${key} · ${fingerprint(b.text)} -->`
  }
  return lines.join('\n')
}

// The text with the marks taken out (for showing on the page).
export const unmarked = text => nl(text).split('\n').filter(l => !/^<!-- \/?bmuz [a-z][a-z0-9:-]*( · [0-9a-f]{8})? -->$/.test(l)).join('\n')
