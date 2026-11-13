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
import { driveId, expandHome, githubLink, githubName, githubOk, isOutsidePath, itemsOf, onlyPointers } from './material.mjs'

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
    // (the same text twice — the concept given at the start handed back again as the one-breath answer — is one source)
    if (c.sources.some(s => s.name === name || clean(s.text) === clean(t))) return
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
  let path = String(rel).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  // F232 (headless run 2026-11-11: "the art folder" handed back as the path): a name said in words is looked up in
  // this folder — "the art folder" → art, "my rules doc" → rules.md — when exactly one file or folder there matches.
  if (!existsSync(join(project, path))) path = namedInWords(project, path) || path
  // (re-checked right before it is used: the path came from a hand-editable file)
  if (!E.isSafePath(path)) { c.fail(path, 'outside this folder'); return }
  readTree(join(project, path), path, c)
}

// The one top-level file or folder of the project a phrase names ("the art folder", "my rules doc"), or null.
export function namedInWords(project, phrase) {
  const words = String(phrase).toLowerCase().replace(/[^a-z0-9. -]/g, ' ').split(/\s+/).filter(w => w && !['the', 'my', 'a', 'an', 'our', 'folder', 'file', 'files', 'doc', 'docs', 'document', 'in', 'this', 'here'].includes(w))
  if (words.length !== 1) return null
  let names = []
  try { names = readdirSync(project).filter(n => !n.startsWith('.')) } catch (e) { return null }
  const base = n => n.toLowerCase().replace(/\.[a-z0-9]+$/, '')
  const hits = names.filter(n => n.toLowerCase() === words[0] || base(n) === words[0])
  return hits.length === 1 ? hits[0] : null
}

// A path anywhere on the creative's computer they pointed at (C:\..., ~/..., a file:/// link): read the same way,
// read-only — nothing there is ever written or deleted. `shown` is how the path was given (its name in shared.md).
export function readOutside(shown, c, home = undefined) {
  const given = String(shown).trim()
  const full = expandHome(given, home)
  readTree(full, given.replace(/\\/g, '/').replace(/\/+$/, ''), c)
}

// A secret is never read, even inside a folder they shared (their computer holds more than game notes).
const SECRET_DIRS = new Set(['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker'])
const SECRET_FILE = /^(\.env(\..*)?|\.npmrc|\.netrc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|kdbx))$/i

// Reads one file, or walks one folder (its folders too, to depth 4, up to MAX_FILES files), under the same caps.
// full = where it is; name = how it is named in shared.md.
export function readTree(full, name, c) {
  if (!existsSync(full)) { c.fail(name, 'not found'); return }
  let st
  try { st = statSync(full) } catch (e) { c.fail(name, "couldn't be opened"); return }
  if (!st.isDirectory()) return readOneFile(full, name, c)
  // (F234 task 6, from F233 task 10: a folder of 200+ old art files never reached its rulebook. The whole tree is listed
  // first, then documents are read before art, newest first; the cap counts files in that order.)
  const files = []
  const walk = (dirAbs, dirRel, depth) => {
    let entries
    try { entries = readdirSync(dirAbs, { withFileTypes: true }) } catch (e) { c.fail(dirRel, "couldn't be opened"); return }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_LISTED) return
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !SECRET_DIRS.has(e.name) && depth < 4) walk(join(dirAbs, e.name), `${dirRel}/${e.name}`, depth + 1); continue }
      if (!e.isFile() || /\.meta$/i.test(e.name)) continue
      let time = 0
      try { time = statSync(join(dirAbs, e.name)).mtimeMs } catch (err) { time = 0 }
      files.push({ full: join(dirAbs, e.name), name: `${dirRel}/${e.name}`, base: e.name, time })
    }
  }
  walk(full, name, 0)
  const ordered = docsFirst(files, f => isDocName(f.base))
  for (const f of ordered.slice(0, MAX_FILES)) readOneFile(f.full, f.name, c)
  if (ordered.length > MAX_FILES || files.length >= MAX_LISTED) c.fail(`${name}/…`, `more than ${MAX_FILES} files: the rest weren't looked at`)
}

// (F234 task 6) Documents (text, Docs, PDFs, word-processor files) before everything else, each group newest first
// (then by name). isDoc tells a document; each item has "time" (ms, 0 when unknown) and "name".
const MAX_LISTED = 5000 // files listed in one folder tree before the order is worked out
export const isDocName = name => isText(name) || /\.(pdf|docx?|odt|rtf|pages)$/i.test(name)
export function docsFirst(items, isDoc) {
  const rank = x => (isDoc(x) ? 0 : 1)
  return items.slice().sort((a, b) => rank(a) - rank(b) || (b.time || 0) - (a.time || 0) || String(a.name).localeCompare(String(b.name)))
}

function readOneFile(full, name, c) {
  if (/\.meta$/i.test(name)) return // Unity's bookkeeping beside every asset: noise, not material
  if (SECRET_FILE.test(name.split('/').pop())) { c.list(name, 'looks like a password or key file: left unread'); return }
  const base = name.split('/').pop()
  if (isText(base) || (!/\.[^./]+$/.test(base) && statSync(full).size < 200_000)) {
    if (statSync(full).size > 5_000_000) { c.list(name, 'a text file too big to read in one pass'); return }
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
  // (F232: Ideate's 1.1 "Your Idea" (step "idea") and 1.2 "Your Material" (step "material"); "show" was F228's one step)
  const by = state.resultsBy || {}
  const show = by.show || {
    breath: [...listOf(by.idea && by.idea.idea), ...listOf(by.idea && by.idea.spark)],
    pasted: by.material && by.material.pasted, files: by.material && by.material.files, links: by.material && by.material.links,
  }
  const intake = json('.planning/research/intake.json') || {}
  const c = collector()
  // (F234, from F233 task 11: "more <step>" — the rules asked for once, read and added to what was shared before)
  const [mode, from] = process.argv.slice(2)
  if (mode === 'more') {
    const prev = json(SHARED_JSON) || {}
    for (const s of listOf(prev.sources)) { c.sources.push(s); c.used += String((s && s.text) || '').length }
    c.listed.push(...listOf(prev.listed))
    c.unread.push(...listOf(prev.unread))
    const r = by[from] || {}
    const seen = new Set()
    readPointers(project, listOf(r.files), c, { files: true, seen })
    readPointers(project, listOf(r.links), c, { seen })
    const date = new Date().toLocaleDateString('en-CA')
    writeFileSync(join(project, SHARED_JSON), JSON.stringify({ version: 1, date, sources: c.sources, listed: c.listed, unread: c.unread }, null, 2) + '\n')
    writeFileSync(join(project, SHARED_MD), sharedMd({ date, ...c }))
    console.log(`✔ ${SHARED_MD}: ${c.sources.length - listOf(prev.sources).length} more read (${c.sources.length} in all)`)
    return
  }
  // 1. Their own words: the one-breath answer and anything pasted (here and at the start).
  listOf(show.breath).forEach((x, i, all) => c.add(all.length > 1 ? `your one-breath answer ${i + 1}` : 'your one-breath answer', typeof x === 'string' ? x : x && x.text))
  // (a "pasted" item that is only links and paths is a list of things to read, not text)
  const allPasted = [...listOf(intake.pasted), ...listOf(show.pasted)].map(t => String(t || '')).filter(t => clean(t))
  const pasted = allPasted.filter(t => !onlyPointers(t))
  pasted.forEach((t, i) => c.add(pasted.length > 1 ? `pasted text ${i + 1}` : 'pasted text', t))
  // 2. What they pointed at: files read at the start, files and links named now, what the start left for Ideate
  // (links, paths outside the project), and the links in a pasted list — each item split into one link or path.
  const fromStart = listOf(intake.sources).map(s => s && s.name).filter(n => typeof n === 'string' && !/^pasted text/.test(n))
  const later = listOf(intake.unreadable).filter(x => x && (x.later || /^https?:\/\//i.test(String(x.path || '')))).map(x => x.path)
  const seen = new Set()
  readPointers(project, [...fromStart, ...listOf(show.files), ...later], c, { files: true, seen })
  readPointers(project, [...listOf(show.links), ...allPasted.filter(onlyPointers)], c, { seen })
  const date = new Date().toLocaleDateString('en-CA')
  mkdirSync(join(project, dirname(SHARED_MD)), { recursive: true })
  writeFileSync(join(project, SHARED_JSON), JSON.stringify({ version: 1, date, sources: c.sources, listed: c.listed, unread: c.unread }, null, 2) + '\n')
  writeFileSync(join(project, SHARED_MD), sharedMd({ date, ...c }))
  console.log(`✔ ${SHARED_MD}: ${c.sources.length} read, ${c.listed.length} listed by name, ${c.unread.length} couldn't be read`)
}

// Every item split (splitMaterial), each link or path read once: Drive and GitHub links, other links named, paths
// in this project or anywhere on their computer. Words that are neither (a stray "and") are left out.
// opts.files: the items are a "files" list Claude handed back (material.mjs itemsOf). opts.seen: shared between calls.
export function readPointers(project, items, c, opts = {}) {
  const seen = opts.seen || new Set()
  for (const raw of items) {
    for (const it of itemsOf(raw, { files: opts.files })) {
      const key = it.value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      if (it.kind === 'text' || seen.has(key)) continue
      seen.add(key)
      if (it.kind === 'path') isOutsidePath(it.value) ? readOutside(it.value, c, opts.home) : readLocal(project, it.value, c)
      else readLink(it.value, c, opts.gws, opts.gh)
    }
  }
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

// ---- Google Drive (F228 task 2): through the gws CLI, read-only ----
// Only three calls are ever made: drive files get (metadata, or a file's own bytes), drive files list (a folder's
// files) and drive files export (a Google Doc / Sheet / Slides as text). Nothing is written to Drive; no Gmail.
const ID_RE = /^[A-Za-z0-9_-]{10,200}$/
export const GOOGLE_TYPES = {
  'application/vnd.google-apps.document': ['text/plain', 'a Google Doc'],
  'application/vnd.google-apps.spreadsheet': ['text/csv', 'a Google Sheet (its first sheet)'],
  'application/vnd.google-apps.presentation': ['text/plain', 'Google Slides'],
}
const FOLDER = 'application/vnd.google-apps.folder'

// (driveId lives in material.mjs, beside the other link readers; kept here for its callers)
export { driveId }

// How to run gws from node: no shell (a Drive id travels inside a JSON argument). On Windows the npm shim is a .cmd
// file, so its own launcher script is run with node. Tests may stand in a fake (BMUZ_GWS, only with BMUZ_TEST=1).
export function gwsCommand(env = process.env) {
  if (env.BMUZ_TEST === '1' && env.BMUZ_GWS) return [process.execPath, env.BMUZ_GWS]
  if (process.platform === 'win32') {
    for (const dir of String(env.PATH || env.Path || '').split(delimiter)) {
      const launcher = join(dir, 'node_modules', '@googleworkspace', 'cli', 'run-gws.js')
      if (dir && existsSync(join(dir, 'gws.cmd')) && existsSync(launcher)) return [process.execPath, launcher]
    }
  }
  return ['gws']
}

// The accounts to try, in order (~/.claude/references/gws.md): personal (gws's default), then muzzymade.
export function gwsAccounts(home = homedir()) {
  const out = [{ name: 'personal', env: {} }]
  const muzzy = join(home, '.config', 'gws-muzzy')
  if (existsSync(muzzy)) out.push({ name: 'muzzymade', env: { GOOGLE_WORKSPACE_CLI_CONFIG_DIR: muzzy } })
  return out
}

export function gwsRunner(cmd = gwsCommand(), accounts = gwsAccounts()) {
  let account = accounts[0]
  const run = (args, { cwd } = {}) => {
    const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...account.env }, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
    if (r.error) return { ok: false, missing: r.error.code === 'ENOENT', why: String(r.error.message || r.error) }
    const out = String(r.stdout || '')
    let json = null
    try { json = JSON.parse(out.slice(out.indexOf('{'))) } catch (e) { json = null }
    const said = clean(`${(json && json.error && (json.error.message || json.error)) || ''} ${String(r.stderr || '').replace(/Using keyring backend: \w+/g, '')}`).slice(0, 200)
    return r.status === 0 && !(json && json.error) ? { ok: true, json } : { ok: false, why: said || `gws exited ${r.status}` }
  }
  return {
    // The first account that can see the file; it stays the account for everything under it.
    meta(id) {
      let last = null
      for (const a of accounts) {
        account = a
        const r = run(['drive', 'files', 'get', '--params', JSON.stringify({ fileId: id, fields: 'id,name,mimeType,size', supportsAllDrives: true })])
        if (r.ok && r.json && r.json.id) return { ok: true, file: r.json, account: a.name }
        last = r
        if (r.missing) break
      }
      return { ok: false, missing: !!(last && last.missing), why: last ? last.why : 'no account to try' }
    },
    list(folderId) {
      const files = []
      let pageToken
      for (let page = 0; page < 10; page++) {
        const params = { q: `'${folderId}' in parents and trashed = false`, fields: 'files(id,name,mimeType,size,modifiedTime),nextPageToken', pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true, ...(pageToken ? { pageToken } : {}) }
        const r = run(['drive', 'files', 'list', '--params', JSON.stringify(params)])
        if (!r.ok) return { ok: false, why: r.why, files }
        files.push(...((r.json && r.json.files) || []))
        pageToken = r.json && r.json.nextPageToken
        if (!pageToken) break
      }
      return { ok: true, files }
    },
    // A file's text: a Google Doc / Sheet / Slides exported, anything else downloaded as it is. Into a temp folder.
    text(file) {
      const tmp = mkdtempSync(join(tmpdir(), 'bmuz-drive-'))
      try {
        const g = GOOGLE_TYPES[file.mimeType]
        const r = g
          ? run(['drive', 'files', 'export', '--params', JSON.stringify({ fileId: file.id, mimeType: g[0] }), '-o', 'out.txt'], { cwd: tmp })
          : run(['drive', 'files', 'get', '--params', JSON.stringify({ fileId: file.id, alt: 'media', supportsAllDrives: true }), '-o', 'out.txt'], { cwd: tmp })
        if (!r.ok) return { ok: false, why: r.why }
        const out = join(tmp, 'out.txt')
        if (!existsSync(out)) return { ok: false, why: 'nothing came back' }
        const buf = readFileSync(out)
        if (buf.includes(0)) return { ok: false, binary: true }
        return { ok: true, text: buf.toString('utf8').replace(/^﻿/, '') }
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    },
  }
}

// One link: a Drive folder (walked, its folders too), a Drive file or Doc; any other link is named, not fetched.
export function readLink(link, c, gws = null, gh = null) {
  const hub = githubLink(link)
  if (hub) return readGithub(hub, c, gh)
  const id = driveId(link)
  if (!id) { c.fail(link, 'a web link, not Google Drive or GitHub: paste its text instead'); return }
  const g = gws || gwsRunner()
  const m = g.meta(id)
  if (!m.ok) {
    c.fail(link, m.missing ? "Google Drive can't be reached from here (the gws tool isn't installed): paste the text instead" : `Google Drive said no (${m.why}): is it shared with one of your two accounts?`)
    return
  }
  const where = `Google Drive, ${m.account} account`
  let seen = 0
  const one = (file, path) => {
    if (/\.meta$/i.test(file.name)) return // Unity's bookkeeping beside every asset
    const name = `Drive · ${path}`
    const g2 = GOOGLE_TYPES[file.mimeType]
    const textLike = g2 || /^text\//.test(file.mimeType || '') || file.mimeType === 'application/json' || isText(file.name)
    if (!textLike) { c.list(name, file.mimeType && file.mimeType.startsWith('application/vnd.google-apps.') ? 'a Google file that has no text form' : kindOf(file.name), where); return }
    if (!g2 && Number(file.size || 0) > 2_000_000) { c.list(name, 'a text file too big to read in one pass', where); return }
    const t = g.text(file)
    if (t.ok) c.add(name, t.text)
    else if (t.binary) c.list(name, kindOf(file.name), where)
    else c.fail(name, `Google Drive said no (${t.why})`)
  }
  // (F234 task 6, from F233 task 10: the rerun's Drive folder stopped at 200 files, most of them old art in Archive/,
  // before its rulebook. The tree is listed first; then Docs, PDFs and text are read before art, newest first.)
  const files = []
  const walk = (folderId, path, depth) => {
    const l = g.list(folderId)
    if (!l.ok) { c.fail(`Drive · ${path}`, `couldn't list the folder (${l.why})`); return }
    for (const f of l.files.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      if (files.length >= MAX_LISTED) return
      if (!f || !ID_RE.test(String(f.id || ''))) continue // (an id from Drive is re-checked before it goes into a command)
      if (f.mimeType === FOLDER) { if (depth < 3) walk(f.id, `${path}/${f.name}`, depth + 1); continue }
      if (/\.meta$/i.test(String(f.name))) continue
      files.push({ file: f, name: `${path}/${f.name}`, time: Date.parse(f.modifiedTime || '') || 0 })
    }
  }
  if (m.file.mimeType === FOLDER) {
    walk(id, m.file.name, 0)
    const isDoc = x => !!GOOGLE_TYPES[x.file.mimeType] || /^text\//.test(x.file.mimeType || '') || x.file.mimeType === 'application/pdf' || isDocName(String(x.file.name))
    const ordered = docsFirst(files, isDoc)
    for (const x of ordered.slice(0, MAX_FILES)) { seen++; one(x.file, x.name) }
    if (ordered.length > MAX_FILES || files.length >= MAX_LISTED) c.fail(`Drive · ${m.file.name}/…`, `more than ${MAX_FILES} files: the rest weren't looked at`)
  } else one(m.file, m.file.name)
}

// ---- GitHub (live look round 5): through the gh CLI, read-only ----
// Only two calls are ever made: `gh repo clone <owner>/<repo> <temp> -- --depth 1 [--branch <ref>]` (a repo or a
// folder: a shallow copy into a fresh temp folder, read like a local folder, then deleted) and `gh api
// repos/<o>/<r>/contents/<path>?ref=<ref>` with the raw accept header (one file). No shell; every part is
// pattern-checked again right before it goes into a command. Tests may stand in a fake (BMUZ_GH, only with BMUZ_TEST=1).
export function ghCommand(env = process.env) {
  if (env.BMUZ_TEST === '1' && env.BMUZ_GH) return [process.execPath, env.BMUZ_GH]
  return ['gh']
}

export function ghRunner(cmd = ghCommand()) {
  const run = (args, { cwd } = {}) => {
    const r = spawnSync(cmd[0], [...cmd.slice(1), ...args], { cwd, encoding: 'utf8', env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' }, timeout: 180_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
    if (r.error) return { ok: false, missing: r.error.code === 'ENOENT', why: String(r.error.message || r.error) }
    return r.status === 0 ? { ok: true, out: String(r.stdout || '') } : { ok: false, why: clean(`${r.stderr || ''} ${r.stdout || ''}`).slice(0, 200) || `gh exited ${r.status}` }
  }
  return {
    // A shallow copy into `dest` (a fresh temp folder's child).
    clone(g, dest) {
      if (!githubOk(g)) return { ok: false, why: 'the link has parts that aren\'t safe to use' }
      return run(['repo', 'clone', `${g.owner}/${g.repo}`, dest, '--', '--depth', '1', ...(g.ref ? ['--branch', g.ref] : [])])
    },
    // One file's text.
    file(g) {
      if (!githubOk(g) || !g.path) return { ok: false, why: 'the link has parts that aren\'t safe to use' }
      const path = g.path.split('/').map(encodeURIComponent).join('/')
      return run(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${g.owner}/${g.repo}/contents/${path}${g.ref ? `?ref=${encodeURIComponent(g.ref)}` : ''}`])
    },
  }
}

export function readGithub(g, c, gh = null) {
  const r = gh || ghRunner()
  const name = githubName(g)
  const said = res => (res.missing ? "GitHub can't be reached from here (the gh tool isn't installed): paste the text instead" : `GitHub said no (${res.why}): is the repo public, or are you signed in to gh?`)
  if (g.kind === 'blob') {
    const base = g.path.split('/').pop()
    if (!isText(base) && /\.[^./]+$/.test(base)) { c.list(name, kindOf(base), 'GitHub'); return }
    const res = r.file(g)
    if (!res.ok) { c.fail(name, said(res)); return }
    if (res.out.includes('\u0000')) { c.list(name, kindOf(base), 'GitHub'); return }
    c.add(name, res.out)
    return
  }
  const tmp = mkdtempSync(join(tmpdir(), 'bmuz-github-'))
  try {
    const dest = join(tmp, 'repo')
    const res = r.clone(g, dest)
    if (!res.ok) { c.fail(name, said(res)); return }
    const at = g.path ? join(dest, ...g.path.split('/')) : dest
    readTree(at, name, c)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
