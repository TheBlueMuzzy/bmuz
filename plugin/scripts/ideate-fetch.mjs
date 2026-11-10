// Ideate's reading of what the creative shared (pipeline "ideate", step "fetch"; F228 task 2).
// node ideate-fetch.mjs        (run in the project folder; writes .planning/research/shared.md + shared.json)
//
// The design: framework .planning/research/bmuz-vision/stages.md ("show me what you have" — all of it read, Drive
// too) and discover-live-review-2026-11-09.md (S4: his real material sat in a Drive folder that was never read).
// What it reads, from the engine's own files (.bmuz/state.json: the "show" step's result; the start's
// .planning/research/intake.json when the project began with "bmuz new"):
// - pasted text and the creative's one-breath answer: as given
// - files and folders in this project: text files read; anything else listed by name with what it appears to be
//   (a Unity scene, a Photoshop file…), never pretended to be read
// - Google Drive links (a folder, a doc, a file): through the gws CLI, read-only (files get / list / export only;
//   never Gmail), the personal account first, then the muzzymade one (~/.claude/references/gws.md)
// Every path and Drive id comes from a hand-editable file (state.json, intake.json), so each is re-checked right
// before it is used for a path or a command. Nothing is chosen here; Claude reads shared.md next.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../hooks/engine.js'

export const SHARED_MD = '.planning/research/shared.md'
export const SHARED_JSON = '.planning/research/shared.json'
const PER_SOURCE = 60_000 // characters kept per source
const TOTAL = 400_000 // characters kept in all
const MAX_FILES = 200 // files looked at in one folder (and its folders)

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const listOf = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])

// Text files read as they are (by extension; a file with none is tried as text when it has no zero bytes).
const TEXT = /\.(md|markdown|txt|text|csv|tsv|json|jsonc|ya?ml|toml|ini|cfg|xml|html?|css|js|mjs|cjs|jsx|ts|tsx|cs|gd|lua|py|rb|java|kt|swift|c|h|cpp|hpp|go|rs|shader|hlsl|glsl|rtf|org|tex|ink|twee|fountain)$/i
// What a file that isn't read appears to be, by extension (said plainly, never pretended to be read).
const KINDS = [
  [/\.unity$/i, 'a Unity scene'], [/\.prefab$/i, 'a Unity prefab'], [/\.(asset|physicsMaterial2D|physicMaterial|mat|anim|controller|overrideController|mask|lighting)$/i, 'a Unity asset file'],
  [/\.meta$/i, 'Unity bookkeeping'], [/\.unitypackage$/i, 'a Unity package'],
  [/\.psd$/i, 'a Photoshop file (art)'], [/\.(ai|eps)$/i, 'an Illustrator file (art)'], [/\.(kra|xcf|clip|procreate|aseprite|ase)$/i, 'a painting or pixel-art file (art)'],
  [/\.(png|jpe?g|gif|webp|bmp|tga|tiff?|svg|heic)$/i, 'an image'], [/\.(blend|fbx|obj|gltf|glb|dae|3ds|max|ma|mb)$/i, 'a 3D model'],
  [/\.(wav|mp3|ogg|flac|aiff?|m4a)$/i, 'a sound'], [/\.(mp4|mov|webm|avi|mkv)$/i, 'a video'],
  [/\.pdf$/i, 'a PDF (paste its text to have it read)'], [/\.(docx?|odt|pages)$/i, 'a word-processor file (paste its text, or share it as a Google Doc)'],
  [/\.(xlsx?|ods|numbers)$/i, 'a spreadsheet file (share it as a Google Sheet)'], [/\.(pptx?|key|odp)$/i, 'a slide deck file (share it as Google Slides)'],
  [/\.(zip|7z|rar|tar|gz)$/i, 'an archive'], [/\.(exe|dll|so|dylib|apk|ipa)$/i, 'a program or build'],
  [/\.(ttf|otf|woff2?)$/i, 'a font'],
]
export const kindOf = name => (KINDS.find(([re]) => re.test(name)) || [null, 'a file I can\'t read as text'])[1]
export const isText = name => TEXT.test(name)
// Folders never looked into (the engine's own, tools', Unity's generated ones).
const SKIP_DIRS = new Set(['.bmuz', '.git', 'node_modules', 'Library', 'Temp', 'Logs', 'obj', '.vs', '.idea', 'Builds', 'build', 'dist'])

// The one place every text source is added: capped per source and in all.
function collector() {
  const c = { sources: [], listed: [], unread: [], used: 0 }
  c.add = (name, text) => {
    let t = String(text || '').replace(/\r\n/g, '\n')
    if (!clean(t)) return
    if (c.sources.some(s => s.name === name)) return
    const room = Math.max(0, TOTAL - c.used)
    if (!room) { c.unread.push({ what: name, why: 'over the reading limit for one pass' }); return }
    const cut = t.length > Math.min(PER_SOURCE, room)
    if (cut) t = t.slice(0, Math.min(PER_SOURCE, room))
    c.used += t.length
    c.sources.push({ name, text: t, ...(cut ? { cut: true } : {}) })
  }
  c.list = (name, kind, where = '') => { if (!c.listed.some(l => l.name === name && l.where === where)) c.listed.push({ name, kind, ...(where ? { where } : {}) }) }
  c.fail = (what, why) => { if (!c.unread.some(u => u.what === what)) c.unread.push({ what, why }) }
  return c
}

// A path inside the project: a file is read or listed; a folder is walked (its folders too, up to MAX_FILES files).
export function readLocal(project, rel, c) {
  const path = String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  // (re-checked right before it is used: the path came from a hand-editable file)
  if (!E.isSafePath(path)) { c.fail(path, 'outside this folder'); return }
  const full = join(project, path)
  if (!existsSync(full)) { c.fail(path, 'not found'); return }
  const st = statSync(full)
  if (!st.isDirectory()) return readOneFile(full, path, c)
  let seen = 0
  const walk = (dirAbs, dirRel, depth) => {
    for (const e of readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen >= MAX_FILES) { c.fail(`${dirRel}/…`, `more than ${MAX_FILES} files: the rest weren't looked at`); return }
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && depth < 4) walk(join(dirAbs, e.name), `${dirRel}/${e.name}`, depth + 1); continue }
      seen++
      readOneFile(join(dirAbs, e.name), `${dirRel}/${e.name}`, c)
    }
  }
  walk(full, path, 0)
}

function readOneFile(full, name, c) {
  if (/\.meta$/i.test(name)) return // Unity's bookkeeping beside every asset: noise, not material
  const base = name.split('/').pop()
  if (isText(base) || (!/\.[^./]+$/.test(base) && statSync(full).size < 200_000)) {
    const buf = readFileSync(full)
    if (buf.includes(0)) { c.list(name, kindOf(base)); return }
    c.add(name, buf.toString('utf8').replace(/^﻿/, ''))
    return
  }
  c.list(name, kindOf(base))
}

// ---- The command ----
function main() {
  const project = process.cwd()
  const read = f => (existsSync(join(project, f)) ? readFileSync(join(project, f), 'utf8') : null)
  const json = f => { try { return JSON.parse(read(f) || 'null') } catch (e) { return null } }
  const state = json('.bmuz/state.json')
  if (!state) { console.log('✘ no .bmuz/state.json: this runs inside an ideate run'); process.exit(1) }
  const show = (state.resultsBy && state.resultsBy.show) || {}
  const intake = json('.planning/research/intake.json') || {}
  const c = collector()
  // 1. Their own words: the one-breath answer and anything pasted (here and at the start).
  listOf(show.breath).forEach((x, i, all) => c.add(all.length > 1 ? `your one-breath answer ${i + 1}` : 'your one-breath answer', typeof x === 'string' ? x : x && x.text))
  const pasted = [...listOf(intake.pasted), ...listOf(show.pasted)].map(t => String(t || '')).filter(t => clean(t))
  pasted.forEach((t, i) => c.add(pasted.length > 1 ? `pasted text ${i + 1}` : 'pasted text', t))
  // 2. Files and folders in this project (named now, or read at the start).
  const fromStart = listOf(intake.sources).map(s => s && s.name).filter(n => typeof n === 'string' && !/^pasted text/.test(n))
  const links = []
  for (const f of [...fromStart, ...listOf(show.files)]) {
    if (/^https?:\/\//i.test(String(f))) { links.push(String(f)); continue }
    readLocal(project, f, c)
  }
  // 3. Links: Google Drive through gws (read-only); any other web page is named, not fetched.
  for (const u of [...listOf(intake.unreadable).map(x => x && x.path).filter(p => /^https?:\/\//i.test(String(p || ''))), ...listOf(show.links)]) links.push(String(u))
  for (const link of [...new Set(links.map(l => l.trim()).filter(Boolean))]) readLink(link, c)
  const date = new Date().toLocaleDateString('en-CA')
  mkdirSync(join(project, dirname(SHARED_MD)), { recursive: true })
  writeFileSync(join(project, SHARED_JSON), JSON.stringify({ version: 1, date, sources: c.sources, listed: c.listed, unread: c.unread }, null, 2) + '\n')
  writeFileSync(join(project, SHARED_MD), sharedMd({ date, ...c }))
  console.log(`✔ ${SHARED_MD}: ${c.sources.length} read, ${c.listed.length} listed by name, ${c.unread.length} couldn't be read`)
}

export function sharedMd({ date, sources, listed, unread }) {
  const out = [
    `# What you shared — read ${date}`,
    'Read by the ideate-fetch script (no AI): the text of everything shared, then what was only listed and what couldn\'t be read. Claude reads this next and writes "the game so far" from it.',
    '',
    `## Read (${sources.length})`,
    ...(sources.length ? sources.map(s => `- ${s.name} (${s.text.length} characters${s.cut ? ', cut short: only the start was read' : ''})`) : ['- nothing yet']),
    '',
    `## Listed, not read (${listed.length}) — what they appear to be`,
    ...(listed.length ? listed.map(l => `- ${l.name} — ${l.kind}${l.where ? ` (${l.where})` : ''}`) : ['- none']),
    '',
    `## Couldn't read (${unread.length})`,
    ...(unread.length ? unread.map(u => `- ${u.what} — ${u.why}`) : ['- none']),
    '',
    '## The text',
  ]
  for (const s of sources) out.push('', `### ${s.name}`, '', s.text.trimEnd())
  return out.join('\n') + '\n'
}

// ---- Google Drive (F228 task 2): filled in below ----
export function readLink(link, c) {
  c.fail(link, 'a web link: paste its text instead')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
