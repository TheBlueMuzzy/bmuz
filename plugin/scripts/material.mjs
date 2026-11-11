// What the creative points at, sorted (F228, live look round 5): one helper for the opening (intake.mjs) and Ideate
// (ideate-fetch.mjs). A message may hold several links and paths at once (spaces, commas, new lines); each becomes
// one item, said what it is: a Google Drive link, a GitHub link, another web link, or a path (in this project, or
// anywhere on their computer: C:\..., ~/..., file:/// links, quoted paths with spaces).
// Every id and path here comes from a hand-editable file, so the readers check them again right before use.
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/

// The Drive id in a link (a folder, a file, a Doc / Sheet / Slides), or null for any other link.
export function driveId(link) {
  let u
  try { u = new URL(String(link).trim()) } catch (e) { return null }
  if (!/(^|\.)(drive|docs)\.google\.com$/i.test(u.hostname)) return null
  const m = u.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/) || u.pathname.match(/\/d\/([A-Za-z0-9_-]+)/) || [null, u.searchParams.get('id')]
  return m[1] && DRIVE_ID.test(m[1]) ? m[1] : null
}

// ---- GitHub: github.com/<owner>/<repo>[/tree|blob/<ref>/<path>] ----
export const GH_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
export const GH_REPO = /^[A-Za-z0-9._-]{1,100}$/
export const GH_REF = /^[A-Za-z0-9._-]{1,200}$/
// One path segment: no slash, no backslash, no control characters, not "." or "..", not starting with "-".
const GH_SEGMENT = /^(?!\.{1,2}$)(?!-)[^/\\\u0000-\u001f]{1,255}$/

// { owner, repo, kind: 'repo' | 'tree' | 'blob', ref, path } for a GitHub link, or null (not GitHub, or a part fails
// its pattern: then nothing about it reaches a command). The ref is one segment (a branch, tag or commit).
export function githubLink(link) {
  let u
  try { u = new URL(String(link).trim()) } catch (e) { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null
  let parts
  try { parts = u.pathname.split('/').filter(Boolean).map(p => decodeURIComponent(p)) } catch (e) { return null }
  const [owner, rawRepo, kind, ref, ...rest] = parts
  const repo = String(rawRepo || '').replace(/\.git$/i, '')
  if (!GH_OWNER.test(String(owner || '')) || !GH_REPO.test(repo) || repo === '.' || repo === '..') return null
  if (!kind) return { owner, repo, kind: 'repo', ref: null, path: '' }
  if ((kind !== 'tree' && kind !== 'blob') || !GH_REF.test(String(ref || '')) || ref.startsWith('-') || ref.includes('..')) return null
  if (!rest.every(s => GH_SEGMENT.test(s))) return null
  if (kind === 'blob' && !rest.length) return null
  return { owner, repo, kind, ref, path: rest.join('/') }
}
// Is it still safe to hand to gh (checked again right before each command)?
export function githubOk(g) {
  return !!g && GH_OWNER.test(g.owner) && GH_REPO.test(g.repo) && g.repo !== '.' && g.repo !== '..' &&
    (g.ref == null || (GH_REF.test(g.ref) && !g.ref.startsWith('-') && !g.ref.includes('..'))) &&
    (!g.path || g.path.split('/').every(s => GH_SEGMENT.test(s)))
}
export const githubName = g => `github.com/${g.owner}/${g.repo}${g.path ? `/${g.path}` : ''}`

// ---- Paths on the creative's computer ----
// A file:/// link as a path: file:///C:/My%20Game/notes.md → C:/My Game/notes.md.
export function fileUrlPath(link) {
  const s = String(link).trim()
  if (!/^file:\/\//i.test(s)) return null
  let p
  try { p = decodeURIComponent(s.replace(/^file:\/\/(localhost)?/i, '')) } catch (e) { return null }
  if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1)
  return p || null
}
// Is it a path that points outside the project by itself (a drive letter, a UNC share, ~, or a / root)?
export function isOutsidePath(p) {
  const s = String(p || '')
  return /^[A-Za-z]:[\\/]/.test(s) || /^\\\\[^\\]/.test(s) || /^~([\\/]|$)/.test(s) || (s.startsWith('/') && isAbsolute(s))
}
// ~ expanded to the home folder; anything else as given.
export function expandHome(p, home = homedir()) {
  return String(p).replace(/^~(?=[\\/]|$)/, home)
}
// Does a word look like a path (not just a word of text)?
const looksLikePath = t => isOutsidePath(t) || /^\.{1,2}[\\/]/.test(t) || /[\\/]/.test(t) || /^[^\s\\/]+\.[A-Za-z0-9]{1,8}$/.test(t)

// One item: what it is. kind: 'drive' | 'github' | 'web' | 'path' | 'text'.
export function classify(token) {
  const t = String(token || '').trim()
  if (!t) return null
  const f = fileUrlPath(t)
  if (f) return { kind: 'path', value: f }
  if (/^https?:\/\//i.test(t)) {
    if (driveId(t)) return { kind: 'drive', value: t }
    if (githubLink(t)) return { kind: 'github', value: t }
    return { kind: 'web', value: t }
  }
  if (/^(www\.)?github\.com\//i.test(t) && githubLink(`https://${t}`)) return { kind: 'github', value: `https://${t}` }
  if (looksLikePath(t)) return { kind: 'path', value: t }
  return { kind: 'text', value: t }
}

const QUOTED = /"([^"\r\n]+)"|'([^'\r\n]+)'|“([^”\r\n]+)”|‘([^’\r\n]+)’/g
const trimEnds = t => t.replace(/^[<(\[]+/, '').replace(/[>)\],;.]+$/, '')

// A message (or one hand-back item) split into its links and paths, one item each, in order. Quoted text is one item
// (a path with spaces). A line that is a single unquoted path with spaces (C:\My Game\notes.md) is kept whole.
// Returns [{ kind, value }]; words that are neither links nor paths come back as kind "text".
export function splitMaterial(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    const quoted = []
    line = line.replace(QUOTED, (m, a, b, c, d) => { quoted.push(a || b || c || d); return ' \u0000 ' })
    const plain = line.replace(/\u0000/g, '').trim()
    let words
    if (!quoted.length && /^([A-Za-z]:[\\/]|~[\\/]|\\\\)/.test(plain) && !/https?:\/\/|,|\s[A-Za-z]:[\\/]/.test(plain)) words = [plain]
    else words = line.split(/[\s,]+/).filter(Boolean)
    let q = 0
    for (const w of words) {
      const item = classify(w === '\u0000' ? quoted[q++] : trimEnds(w))
      if (item) out.push(item)
    }
  }
  return out
}

// One hand-back item as links and paths. opts.files: the item comes from a "files" list Claude handed back (one path
// each), so an item with no comma, new line or second link in it is taken whole (a folder named "Assets", a path
// with spaces) and a plain word is a path. Anything else is split (splitMaterial).
export function itemsOf(raw, opts = {}) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return []
  const whole = opts.files && !/[\r\n,]/.test(s) && !/\s(https?:\/\/|file:\/\/|[A-Za-z]:[\\/]|~[\\/])/.test(s)
  if (!whole) return splitMaterial(s)
  const one = classify(s.replace(/^["'“‘]|["'”’]$/g, ''))
  return [one.kind === 'text' ? { kind: 'path', value: one.value } : one]
}

// Every link and path the opening handed back: its "files" (and "links") and any pasted item that is only links and
// paths, one item each, in order, the same thing once.
export function pointersOf(result) {
  const list = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
  const out = []
  const add = it => { if (it.kind !== 'text' && !out.includes(it.value)) out.push(it.value) }
  for (const f of list(result && result.files)) itemsOf(f, { files: true }).forEach(add)
  for (const l of list(result && result.links)) itemsOf(l).forEach(add)
  for (const p of list(result && result.pasted)) if (onlyPointers(p)) itemsOf(p).forEach(add)
  return out
}

// Only links and paths in it (no words of text)? Then a "pasted" item is really a list of things to read.
export function onlyPointers(text) {
  const items = splitMaterial(text)
  return items.length > 0 && items.every(i => i.kind !== 'text')
}

// ---- Their own words (moved here from intake.mjs in F232, when the start was folded into Ideate) ----
// Text as compared: case, curly quotes, dashes and markdown signs don't count.
export function normalise(s) {
  return String(s || '').toLowerCase()
    .replace(/[‘’`´]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—−]/g, '-')
    .replace(/[*_#>|]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Is `text` the creative's own words, found in `sources` (normalised)? A quote cut with "…" counts when every
// part is there; the quote's own end punctuation doesn't have to match.
export function isVerbatim(text, sources) {
  const parts = normalise(text).replace(/^["']|["']$/g, '').split(/\s*(?:\.\.\.|…)\s*/).map(p => p.replace(/[.,;:!?"']+$/, '').trim()).filter(Boolean)
  return parts.length > 0 && parts.every(p => p.length >= 3 && sources.includes(p))
}
