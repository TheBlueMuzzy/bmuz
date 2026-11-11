// The GDD: the game's one design document, 14 chapters in three parts, each with its level (F232 task 1).
// The design: framework .planning/research/bmuz-vision/bmuz-design-doc.html, "2 · The documents" (the chapter table)
// and "4 · How the GDD grows" (empty · loose · chosen · worked out · built).
//
//   node gdd.mjs step <step-id> <level>   write that step's result (.bmuz/state.json) into its chapters, then the page
//   node gdd.mjs page [--open]            rebuild the project page (and open it in the browser; never in a test run)
//   (run in the project folder)
//
// How hand edits are kept: BMUZ writes each chapter's text between two marks,
//   <!-- bmuz 3 · 1a2b3c4d -->  …  <!-- /bmuz 3 -->
// where 1a2b3c4d is a fingerprint of the text as BMUZ last wrote it. Anything outside the marks is the creative's and
// is never touched. Text inside the marks that no longer matches its fingerprint was edited by hand: it is kept as it
// is, and BMUZ's new text goes below it (dated), so nothing they wrote is ever overwritten. A level only goes up
// (a chapter marked "chosen" by hand stays chosen).
// The running lists at the back (Sketches S01…, Open Questions, Decisions, Ideas for Later) only grow; an item
// already there (same words) isn't added twice. Every write is logged under "Changes".
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const GDD = '.planning/GDD.md'
export const PAGE = '.planning/project-page.html'

// The chapters, as the script's table has them: [number, name, what it holds, part].
export const PARTS = [
  [1, 'Part 1 · The concept (one page)'],
  [2, 'Part 2 · The game'],
  [3, 'Part 3 · The digital game (starts the TDD)'],
]
export const CHAPTERS = [
  [1, 'The Feelings', "the one or two feelings that are this game · how we'll know a player feels them · what it deliberately won't have", 1],
  [2, 'The 3 Pillars', 'three rules that settle arguments', 1],
  [3, 'The Pitch', 'the game in 3–5 lines written to "you" · one line · the familiar part and the new part', 1],
  [4, 'The Core Loop', 'what you do over and over, in plain words', 1],
  [5, 'Platform & Play Structure', "where it's played first · solo, together, online, by turns, against the computer", 1],
  [6, 'Scope', "must / should / could / won't · effort vs impact · the vertical slice", 1],
  [7, 'Risks & Unknowns', 'what could stop it being great · what needs research or a sketch', 1],
  [8, 'Rulebook', 'overview, components, how to win, setup, the flow, each action, game end, scoring, keywords, development log', 2],
  [9, 'Content & Balance', 'a summary and link to the content tables', 2],
  [10, 'Change Over Time', 'what changes within a game and between games · progression · pacing', 2],
  [11, 'Players & Opponents', "the computer opponent's personality · online people (leaving, joining, idling) · saves, accounts", 3],
  [12, 'Look & Sound', 'style, references, audio mood', 3],
  [13, 'Screens & Menus', 'UI style · the screen map · what the player must see (HUD) · names of things', 3],
  [14, 'Teaching', 'what a new player must learn (notes in Design; the tutorial itself is built in Develop after playtests)', 3],
]
export const chapterName = n => (CHAPTERS.find(c => c[0] === Number(n)) || [])[1] || null
// The levels, lowest first (script section 4).
export const LEVELS = ['empty', 'loose', 'chosen', 'worked out', 'built']
export const LEVEL_WORDS = { empty: 'Empty', loose: 'Loose · your ideas, nothing chosen', chosen: 'Chosen · decided', 'worked out': 'Worked out · detailed and tested', built: 'Built · in the game' }
// "a chapter with nothing says 'open: nothing yet'" (script section 4)
export const NOTHING = 'open: nothing yet'
// The running lists at the back (script: "Running lists at the back").
export const LISTS = ['Sketches', 'Open Questions', 'Decisions', 'Ideas for Later']
const CHANGES = 'Changes'

const nl = t => String(t ?? '').replace(/\r\n/g, '\n')
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
export const fingerprint = text => createHash('sha1').update(nl(text).trim()).digest('hex').slice(0, 8)
const levelIndex = l => LEVELS.indexOf(String(l || '').trim().toLowerCase())

// A new GDD, every chapter empty.
export function newGdd(name = '') {
  const out = [`# ${clean(name) || 'Your game'} — Game Design Document`, '',
    'The one design document for this game: 14 chapters, each marked empty, loose, chosen, worked out or built. BMUZ writes between its marks (<!-- bmuz … -->); anything you write outside them is yours and is always kept, and if you change BMUZ\'s text, your version is kept too.', '']
  for (const [p, title] of PARTS) {
    out.push(`## ${title}`, '')
    for (const [n, ch, holds, part] of CHAPTERS) {
      if (part !== p) continue
      out.push(`### ${n} · ${ch}`, `*${holds}*`, '', 'Level: empty', block(n, NOTHING), '')
    }
  }
  for (const l of LISTS) out.push(`## ${l}`, '', ...(l === 'Decisions' ? ['Answered once, never asked again.', ''] : []))
  out.push(`## ${CHANGES}`, '')
  return out.join('\n')
}

function block(n, text) {
  const body = nl(text).trim() || NOTHING
  return `<!-- bmuz ${n} · ${fingerprint(body)} -->\n${body}\n<!-- /bmuz ${n} -->`
}

// The chapters as they are in the file: { n: { level, text, edited, at: {head, level, start, end} } }.
// edited = the text inside the marks isn't what BMUZ last wrote (the creative changed it).
export function readGdd(text) {
  const lines = nl(text).split('\n')
  const chapters = {}
  let cur = null
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^###\s+(\d+)\s*·/)
    if (h) { cur = Number(h[1]); chapters[cur] = { level: 'empty', text: '', edited: false, at: { head: i, level: -1, start: -1, end: -1 } }; continue }
    if (/^##\s/.test(lines[i])) { cur = null; continue }
    if (cur === null) continue
    const c = chapters[cur]
    // (everything the chapter holds, the creative's own lines too, for the page)
    const isHolds = i === c.at.head + 1 && /^\*.*\*$/.test(lines[i])
    if (!/^<!-- \/?bmuz /.test(lines[i]) && !/^Level:/.test(lines[i]) && !isHolds) c.all = c.all ? `${c.all}\n${lines[i]}` : lines[i]
    const lv = lines[i].match(/^Level:\s*(.+?)\s*$/)
    if (lv && c.at.level < 0) { c.at.level = i; c.level = levelIndex(lv[1]) >= 0 ? lv[1].trim().toLowerCase() : 'empty'; continue }
    const open = lines[i].match(/^<!-- bmuz (\d+) · ([0-9a-f]{8}) -->$/)
    if (open && Number(open[1]) === cur && c.at.start < 0) { c.at.start = i; c.mark = open[2]; continue }
    if (lines[i] === `<!-- /bmuz ${cur} -->` && c.at.start >= 0 && c.at.end < 0) {
      c.at.end = i
      c.text = lines.slice(c.at.start + 1, i).join('\n').trim()
      c.edited = fingerprint(c.text) !== c.mark
    }
  }
  return chapters
}

// The items of a running list ("- " lines under its heading).
export function readList(text, list) {
  const lines = nl(text).split('\n')
  const at = lines.findIndex(l => l.trim() === `## ${list}`)
  if (at < 0) return []
  const out = []
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) if (/^- /.test(lines[i])) out.push(lines[i].slice(2).trim())
  return out
}

// A chapter's new text: a string as it is, a list as "- " lines. Empty → null (nothing to write).
export function chapterText(v) {
  if (v == null) return null
  if (Array.isArray(v)) {
    const items = v.map(x => (x && typeof x === 'object' ? x.text ?? '' : x)).map(x => clean(x)).filter(Boolean)
    return items.length ? items.map(x => `- ${x}`).join('\n') : null
  }
  if (typeof v === 'object') return chapterText(v.text ?? v.lines ?? null)
  // (F227: a step that hands back a whole chapter as the file shows it brings its heading, its "what it holds" line,
  // its Level line and BMUZ's marks along; those belong to the file, not the text — kept, they made a second chapter)
  const lines = nl(v).split('\n')
  const out = lines.filter((l, i) => !/^###\s+\d+\s*·/.test(l) && !/^Level:\s/.test(l) && !/^<!-- \/?bmuz /.test(l) && !(i > 0 && /^###\s+\d+\s*·/.test(lines[i - 1]) && /^\*.*\*$/.test(l)))
  const t = out.join('\n').trim()
  return t ? t : null
}

// Writes one chapter. level only goes up. by = { step, stage, day } for the Changes log and a hand-edit note.
// Returns { text, changed, kept } (kept = the creative's own edit inside the marks was kept).
export function writeChapter(text, n, body, level, by = {}) {
  let doc = nl(text)
  if (!doc.trim()) doc = newGdd() // (an empty file: callers pass a real one)
  if (!readGdd(doc)[n]) doc = addChapter(doc, n) // (F232 review: a missing chapter goes back in its place; the rest is kept)
  const ch = readGdd(doc)[n]
  const lines = doc.split('\n')
  const want = chapterText(body)
  let changed = false
  let kept = false
  if (want !== null) {
    let repl = null
    if (ch.at.start < 0 || !ch.edited || ch.text.trim() === NOTHING || ch.text.trim() === want.trim()) {
      if (ch.at.start < 0 || ch.edited || ch.text.trim() !== want.trim()) repl = block(n, want).split('\n')
    } else {
      // The creative edited BMUZ's text: theirs moves out of the marks (above them), so it is theirs for good, and
      // BMUZ's new text goes in the marks below it, dated.
      const note = `BMUZ, ${by.day || ''}${by.step ? ` (${by.stage ? `${by.stage} · ` : ''}${by.step})` : ''}:`
      repl = [...ch.text.split('\n'), '', ...block(n, `${note}\n${want}`).split('\n')]
      kept = true
    }
    if (repl) {
      if (ch.at.start >= 0 && ch.at.end >= 0) lines.splice(ch.at.start, ch.at.end - ch.at.start + 1, ...repl)
      else lines.splice((ch.at.level >= 0 ? ch.at.level : ch.at.head) + 1, 0, ...repl)
      changed = true
    }
  }
  // The level line, only ever up.
  const after = readGdd(lines.join('\n'))[n]
  const have = levelIndex(after.level)
  const goal = levelIndex(level)
  if (goal > have || after.at.level < 0) {
    const line = `Level: ${goal > have ? LEVELS[goal] : after.level}`
    if (after.at.level >= 0) lines[after.at.level] = line
    else lines.splice(after.at.head + 1, 0, line)
    changed = changed || goal > have
  }
  return { text: lines.join('\n'), changed, kept }
}

// Puts back a chapter whose heading is missing, empty, in chapter order: after the chapter before it in its part,
// else before the chapter after it in its part, else under its part's heading, else before the running lists.
// Everything else in the file stays as it is.
function addChapter(doc, n) {
  const lines = doc.split('\n')
  const [, name, holds, part] = CHAPTERS.find(c => c[0] === n)
  const have = readGdd(doc)
  const sameP = CHAPTERS.filter(c => c[3] === part && have[c[0]]).map(c => c[0])
  const before = sameP.filter(m => m < n).pop()
  const after = sameP.find(m => m > n)
  let at
  if (before) {
    at = have[before].at.head + 1
    while (at < lines.length && !/^#{2,3}\s/.test(lines[at])) at++
  } else if (after) {
    at = have[after].at.head
  } else {
    const p = lines.findIndex(l => l.trim() === `## ${PARTS.find(x => x[0] === part)[1]}`)
    if (p >= 0) at = p + 1 < lines.length && lines[p + 1].trim() === '' ? p + 2 : p + 1
    else {
      at = lines.findIndex(l => LISTS.concat(CHANGES).some(x => l.trim() === `## ${x}`))
      if (at < 0) at = lines.length
    }
  }
  const add = [`### ${n} · ${name}`, `*${holds}*`, '', 'Level: empty', block(n, NOTHING), '']
  if (at > 0 && lines[at - 1].trim() !== '') add.unshift('')
  lines.splice(at, 0, ...add)
  return lines.join('\n')
}

// Adds items to a running list (never twice: same words). Sketches are numbered on: S01, S02…
// items: strings, or for Sketches { name, question }. Returns { text, added: [the lines added] }.
export function addToList(text, list, items) {
  const lines = nl(text).split('\n')
  let at = lines.findIndex(l => l.trim() === `## ${list}`)
  if (at < 0) {
    const ch = lines.findIndex(l => l.trim() === `## ${CHANGES}`)
    const where = ch < 0 ? lines.length : ch
    lines.splice(where, 0, `## ${list}`, '')
    at = where
  }
  let end = at + 1
  while (end < lines.length && !/^##\s/.test(lines[end])) end++
  const have = readList(lines.join('\n'), list)
  const norm = s => clean(s).toLowerCase()
  let top = have.reduce((m, l) => Math.max(m, Number((l.match(/^S(\d+)\b/) || [])[1] || 0)), 0)
  const added = []
  for (const it of Array.isArray(items) ? items : []) {
    let line
    if (list === 'Sketches') {
      const name = clean(it && typeof it === 'object' ? it.name : it)
      if (!name) continue
      if (have.some(h => norm(h.replace(/^S\d+\s+/, '').split(' — ')[0]) === norm(name))) continue
      top += 1
      const q = clean(it && typeof it === 'object' ? it.question : '')
      line = `S${String(top).padStart(2, '0')} ${name}${q ? ` — answers: ${q}` : ''}`
    } else {
      line = clean(it && typeof it === 'object' ? it.text ?? it.q ?? it.question ?? '' : it)
      if (!line || have.some(h => norm(h) === norm(line))) continue
    }
    have.push(line)
    added.push(line)
  }
  // (after the last item, before the blank line that closes the section)
  let ins = end
  while (ins > at + 1 && lines[ins - 1].trim() === '') ins--
  lines.splice(ins, 0, ...added.map(a => `- ${a}`))
  return { text: lines.join('\n'), added }
}

// The title line's game name ("# Garden Race — Game Design Document").
export function gameName(text) {
  const m = nl(text).match(/^# (.+?) — Game Design Document\s*$/m)
  return m && m[1] !== 'Your game' ? m[1] : ''
}
export function setName(text, name) {
  const n = clean(name)
  if (!n) return text
  return nl(text).replace(/^# .+? — Game Design Document\s*$/m, `# ${n} — Game Design Document`)
}

// What a step's result writes (its keys, all optional):
//   name: the game's name · chapters: { "<n>": text or list } · sketches: [{ name, question }] ·
//   questions / ideas / decisions: lists of text (Open Questions, Ideas for Later, Decisions).
// Returns { text, report: [plain lines], added: { Sketches: [...] } }.
export function applyResult(text, result, level, by = {}) {
  let doc = nl(text).trim() ? nl(text) : newGdd(result && result.name)
  const report = []
  const r = result && typeof result === 'object' ? result : {}
  if (r.name && !gameName(doc)) doc = setName(doc, r.name)
  const chapters = r.chapters && typeof r.chapters === 'object' && !Array.isArray(r.chapters) ? r.chapters : {}
  const touched = []
  for (const [k, v] of Object.entries(chapters)) {
    const n = Number(k)
    if (!chapterName(n)) { report.push(`skipped "${k}": not a chapter (1–14)`); continue }
    const out = writeChapter(doc, n, v, chapterText(v) === null ? null : level, by)
    doc = out.text
    if (out.changed) touched.push(n)
    if (out.kept) report.push(`chapter ${n} (${chapterName(n)}): your own edit kept, BMUZ's update added below it`)
  }
  const added = {}
  for (const [key, list] of [['sketches', 'Sketches'], ['questions', 'Open Questions'], ['ideas', 'Ideas for Later'], ['decisions', 'Decisions']]) {
    if (!Array.isArray(r[key]) || !r[key].length) continue
    const out = addToList(doc, list, r[key])
    doc = out.text
    if (out.added.length) added[list] = out.added
  }
  if (touched.length || Object.keys(added).length) {
    const what = [touched.length ? `chapters ${touched.join(', ')}` : '', ...Object.entries(added).map(([l, a]) => `${a.length} on ${l}`)].filter(Boolean).join('; ')
    doc = addToList(doc, CHANGES, [`${by.day || ''} · ${by.stage ? `${by.stage} · ` : ''}${by.step || 'BMUZ'}: ${what}${level ? ` (${level})` : ''}`]).text
    report.push(`wrote ${what}`)
  }
  return { text: doc.endsWith('\n') ? doc : doc + '\n', report, added, touched }
}

// ---- The project page (script 1.7): the GDD's chapters with their levels, sketches, open questions, ideas ----
// A file in the project, opened in the browser; it reloads itself every few seconds, so after every step it shows
// the GDD as it is now (nothing is published anywhere).
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
function mdHtml(md) {
  const out = []
  let list = false
  let table = null
  const flush = () => {
    if (list) { out.push('</ul>'); list = false }
    if (table) { out.push(`<table>${table.map((r, i) => `<tr>${r.map(c => (i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`).join('')}</table>`); table = null }
  }
  for (const raw of nl(md).split('\n')) {
    const l = raw.trimEnd()
    if (/^\|.*\|$/.test(l.trim())) {
      if (list) { out.push('</ul>'); list = false }
      const cells = l.trim().slice(1, -1).split('|').map(c => c.trim())
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue
      table = table || []
      table.push(cells)
      continue
    }
    if (table) flush()
    if (/^\s*[-·]\s+/.test(l)) { if (!list) { out.push('<ul>'); list = true } out.push(`<li>${inline(l.replace(/^\s*[-·]\s+/, ''))}</li>`); continue }
    flush()
    if (!l.trim()) continue
    const h = l.match(/^#{1,6}\s+(.*)$/)
    out.push(h ? `<h4>${inline(h[1])}</h4>` : `<p>${inline(l)}</p>`)
  }
  flush()
  return out.join('\n')
}

// (F227) The Design documents, each a tab on the page when it exists: the rulebook, the content tables, the sketches
// built, the seven UI styles side by side (from the rulebook on), the TDD and the roadmap (the Plan tab).
export const DESIGN_FILES = { rulebook: '.planning/design/RULEBOOK.md', tables: '.planning/design/tables.json', sketches: '.planning/research/sketches', tdd: '.planning/TDD.md', roadmap: '.planning/ROADMAP.md' }
const unmark = t => nl(t).split('\n').filter(l => !/^<!-- \/?bmuz [^>]*-->$/.test(l)).join('\n')
function stylesHtml() {
  let s = null
  try { s = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'ui-styles.json'), 'utf8')) } catch (e) { s = null }
  if (!s) return ''
  return `<div class="styles">${s.styles.map(({ name, tokens: t }) => `<div class="style" style="background:${esc(t.bg)};color:${esc(t['on-bg'])};font-family:${esc(t['font-display'])}">
<b>${esc(name)}</b><div class="panel" style="background:${esc(t.surface)};color:${esc(t['on-surface'])};border:${esc(t['border-width'])} solid ${esc(t.border)};border-radius:${esc(t['radius-panel'])};box-shadow:${esc(t['depth-1'])}">Score 12 · Round 3<br><span class="btn" style="background:${esc(t.primary)};color:${esc(t['on-primary'])};border-radius:${esc(t['radius-control'])};text-transform:${esc(t['text-case'])}">Play</span> <span class="btn" style="background:${esc(t.accent)};color:${esc(t['on-bg'])};border-radius:${esc(t['radius-control'])}">Options</span></div></div>`).join('\n')}</div>`
}
export function designTabs(dir) {
  const tabs = []
  const read = rel => readFileIn(dir, rel)
  const rb = read(DESIGN_FILES.rulebook)
  if (rb) tabs.push({ id: 'rulebook', title: 'Rulebook', html: `<section class="list">${mdHtml(unmark(rb))}</section>` })
  let sync = null
  try { sync = JSON.parse(read(DESIGN_FILES.tables) || 'null') } catch (e) { sync = null }
  if (sync && sync.tables) {
    const parts = Object.entries(sync.tables).map(([id, t]) => {
      let tb = null
      try { tb = JSON.parse(read(t.file || `content/data/${id}.json`) || 'null') } catch (e) { tb = null }
      if (!tb || !Array.isArray(tb.columns)) return ''
      const rows = (tb.rows || []).map(r => `<tr>${tb.columns.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')
      return `<section class="list"><h3>${esc(tb.name || id)}</h3><p class="holds">${esc(t.file || '')}${t.sheet ? ` · linked to the Google Sheet tab "${esc(t.sheet.tab)}"` : ''}</p><table><tr>${tb.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${rows || `<tr><td colspan="${tb.columns.length}" class="open">nothing yet</td></tr>`}</table></section>`
    }).filter(Boolean)
    if (parts.length) tabs.push({ id: 'content', title: 'Content', html: parts.join('\n') })
  }
  const sk = join(dir, DESIGN_FILES.sketches)
  if (existsSync(sk)) {
    const files = readdirSync(sk).filter(f => /\.html?$/.test(f)).sort()
    if (files.length) tabs.push({ id: 'sketch-files', title: 'Sketch pages', html: `<section class="list"><ul>${files.map(f => `<li><a href="research/sketches/${encodeURIComponent(f)}">${esc(f.replace(/\.html?$/, ''))}</a></li>`).join('')}</ul></section>` })
  }
  if (rb) {
    const st = stylesHtml()
    if (st) tabs.push({ id: 'ui-styles', title: 'UI styles', html: `<p class="holds">The seven UI styles of the game-ui kit, side by side.</p>${st}` })
  }
  const tdd = read(DESIGN_FILES.tdd)
  if (tdd) tabs.push({ id: 'tdd', title: 'TDD', html: `<section class="list">${mdHtml(unmark(tdd).replace(/```[\s\S]*?```/g, ''))}</section>` })
  // (F215) the bug list, as .planning/BUGS.md has it (bugs.mjs writes it)
  const bugs = read('.planning/BUGS.md')
  if (bugs) tabs.push({ id: 'bugs', title: 'Bugs', html: `<section class="list">${mdHtml(unmark(bugs).replace(/^# .*\n/, ''))}</section>` })
  // (F216) the sprint being built, as .planning/SPRINT.md has it (sprint.mjs writes it): each feature's plan card and tasks
  const sprint = read('.planning/SPRINT.md')
  if (sprint) tabs.push({ id: 'sprint', title: 'Sprint', html: `<section class="list">${mdHtml(unmark(sprint).replace(/^- \[x\] /gm, '- ✔ ').replace(/^- \[ \] /gm, '- ☐ '))}</section>` })
  return tabs
}

export function pageHtml(text, when = '', tabs = [], roadmap = '') {
  const doc = nl(text)
  const chapters = readGdd(doc)
  const name = gameName(doc) || 'Your game'
  const counts = Object.fromEntries(LEVELS.map(l => [l, 0]))
  for (const [n] of CHAPTERS) counts[chapters[n] ? chapters[n].level : 'empty'] += 1
  const chip = l => `<span class="chip ${l.replace(' ', '-')}">${esc(l)}</span>`
  const parts = PARTS.map(([p, title]) => {
    const rows = CHAPTERS.filter(c => c[3] === p).map(([n, ch, holds]) => {
      const c = chapters[n] || { level: 'empty', text: '' }
      const all = String(c.all || '').trim()
      const body = all && all !== NOTHING ? mdHtml(all) : `<p class="open">${NOTHING}</p>`
      return `<section class="ch"><h3>${n} · ${esc(ch)} ${chip(c.level)}</h3><p class="holds">${esc(holds)}</p>${body}</section>`
    })
    return `<h2>${esc(title)}</h2>\n${rows.join('\n')}`
  })
  const listHtml = l => {
    const items = readList(doc, l)
    return `<section class="list"><h3>${esc(l)}</h3>${items.length ? `<ul>${items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>` : '<p class="open">nothing yet</p>'}</section>`
  }
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>${esc(name)} — project page</title>
<style>
:root { --ink:#1f2328; --soft:#59636e; --line:#d8dee4; --bg:#f6f8fa; --empty:#d0d7de; --loose:#f2cc60; --chosen:#54aeff; --worked:#4ac26b; --built:#8250df; }
body { font: 16px/1.5 system-ui, sans-serif; color: var(--ink); background: var(--bg); margin: 0; }
main { max-width: 860px; margin: 0 auto; padding: 24px 20px 64px; }
nav { display: flex; gap: 8px; margin: 12px 0 24px; } nav a { padding: 6px 12px; border: 1px solid var(--line); border-radius: 16px; text-decoration: none; color: var(--ink); background: #fff; }
.ch, .list { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin: 12px 0; }
h1 { margin: 0; } h2 { margin-top: 32px; } h3 { margin: 0 0 4px; font-size: 18px; }
.holds { color: var(--soft); font-size: 14px; margin: 0 0 8px; } .open { color: var(--soft); font-style: italic; }
.chip { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }
.empty { background: var(--empty); } .loose { background: var(--loose); } .chosen { background: var(--chosen); color: #fff; } .worked-out { background: var(--worked); color: #fff; } .built { background: var(--built); color: #fff; }
.styles { display: flex; flex-wrap: wrap; gap: 10px; } .style { width: 180px; padding: 10px; border-radius: 10px; border: 1px solid var(--line); } .style .panel { margin-top: 6px; padding: 8px; font-size: 13px; } .style .btn { display: inline-block; margin-top: 6px; padding: 4px 10px; font-weight: 700; }
.levels { color: var(--soft); font-size: 14px; } table { border-collapse: collapse; margin: 8px 0; } td, th { border: 1px solid var(--line); padding: 4px 10px; text-align: left; }
</style></head><body><main>
<h1>${esc(name)}</h1>
<p class="levels">The game: ${LEVELS.map(l => `${counts[l]} ${l}`).join(' · ')}${when ? ` · updated ${esc(when)}` : ''}</p>
<nav><a href="#game">The game</a>${tabs.filter(t => t.id === 'rulebook' || t.id === 'content').map(t => `<a href="#${t.id}">${esc(t.title)}</a>`).join('')}<a href="#sketches">Sketches</a>${tabs.filter(t => t.id !== 'rulebook' && t.id !== 'content' && t.id !== 'sketch-files').map(t => `<a href="#${t.id}">${esc(t.title)}</a>`).join('')}<a href="#plan">Plan</a><a href="#lists">Open questions &amp; Ideas for Later</a></nav>
<div id="game">
${parts.join('\n')}
</div>
${tabs.filter(t => t.id === 'rulebook' || t.id === 'content').map(t => `<h2 id="${t.id}">${esc(t.title)}</h2>\n${t.html}`).join('\n')}
<h2 id="sketches">Sketches</h2>
${listHtml('Sketches')}
${tabs.filter(t => t.id === 'sketch-files').map(t => t.html).join('\n')}
${tabs.filter(t => t.id !== 'rulebook' && t.id !== 'content' && t.id !== 'sketch-files').map(t => `<h2 id="${t.id}">${esc(t.title)}</h2>\n${t.html}`).join('\n')}
<h2 id="plan">Plan</h2>
<section class="list">${roadmap ? mdHtml(unmark(roadmap).replace(/```[\s\S]*?```/g, '')) : '<p class="open">Milestones and their progress show here from Design on.</p>'}</section>
<h2 id="lists">Open questions &amp; Ideas for Later</h2>
${listHtml('Open Questions')}
${listHtml('Ideas for Later')}
${listHtml('Decisions')}
</main></body></html>
`
}

// The page's address for the creative (a file:/// link).
export const pageLink = dir => pathToFileURL(resolve(dir, PAGE)).href

// Opens the page in the creative's browser. Never in a test run (BMUZ_TEST=1): it says what it would open instead.
export function openPage(dir, env = process.env) {
  const file = resolve(dir, PAGE)
  if (env.BMUZ_TEST === '1') return `test run: would open ${pageLink(dir)}`
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]]
  const r = spawnSync(cmd[0], cmd[1], { stdio: 'ignore', timeout: 15000, windowsHide: true })
  return r.error ? `couldn't open the browser (${String(r.error.message).slice(0, 80)}); the page is ${pageLink(dir)}` : `opened ${pageLink(dir)}`
}

// ---- The command line ----
function writeFile(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
export function readFileIn(dir, rel) {
  const p = join(dir, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}
export function writePage(dir, now = new Date()) {
  const doc = readFileIn(dir, GDD) || newGdd()
  writeFile(dir, PAGE, pageHtml(doc, now.toISOString().slice(0, 16).replace('T', ' '), designTabs(dir), readFileIn(dir, DESIGN_FILES.roadmap) || ''))
}
export const STAGE_NAMES = { ideate: 'Ideate', define: 'Define', design: 'Design', develop: 'Develop' }

// chapter (F227): the one chapter a step writes; a result whose "chapters" is plain text, not { "<n>": … }, goes there.
export function stepWrite(dir, stepId, level, now = new Date(), chapter = null) {
  if (!/^[a-z][a-z0-9-]*$/.test(String(stepId || ''))) return { ok: false, say: `✘ say which step's result to write, like: node gdd.mjs step feelings chosen` }
  if (levelIndex(level) < 0) return { ok: false, say: `✘ "${level}" isn't a level (${LEVELS.join(', ')})` }
  let state
  try { state = JSON.parse(readFileIn(dir, '.bmuz/state.json') || 'null') } catch (e) { state = null }
  if (!state) return { ok: false, say: '✘ no .bmuz/state.json: this runs inside a BMUZ stage' }
  let result = (state.resultsBy && state.resultsBy[stepId]) || null
  if (result && chapter && typeof result.chapters === 'string') result = { ...result, chapters: { [chapter]: result.chapters } }
  const by = { step: stepId, stage: STAGE_NAMES[state.pipeline] || state.pipeline, day: now.toISOString().slice(0, 10) }
  const out = applyResult(readFileIn(dir, GDD) || newGdd(result && result.name), result || {}, level, by)
  writeFile(dir, GDD, out.text)
  writePage(dir, now)
  return { ok: true, say: `✔ ${GDD}: ${out.report.join('; ') || 'nothing new to write'} · page ${PAGE}`, out }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const [cmd, a, b, c] = process.argv.slice(2)
  const dir = process.cwd()
  if (cmd === 'step') {
    const r = stepWrite(dir, a, b, new Date(), chapterName(c) ? Number(c) : null)
    console.log(r.say)
    process.exit(r.ok ? 0 : 1)
  } else if (cmd === 'page') {
    if (!readFileIn(dir, GDD)) writeFile(dir, GDD, newGdd())
    writePage(dir)
    console.log(`✔ ${PAGE}${a === '--open' ? ` · ${openPage(dir)}` : ''}`)
  } else if (cmd === 'init') {
    if (!readFileIn(dir, GDD)) writeFile(dir, GDD, newGdd(a))
    writePage(dir)
    console.log(`✔ ${GDD}`)
  } else {
    console.log('use: node gdd.mjs step <step-id> <level> | page [--open] | init [name]')
    process.exit(1)
  }
}
