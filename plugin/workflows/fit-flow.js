export const meta = {
  name: 'fit-flow',
  description: 'Define fit check: three helpers check the creative\'s choices against each other and DISCOVER.md\'s shelves (story vs rules, pasted-on theme, interesting decisions, bricks against pillars, on-ice ideas that fit now) and choose nothing',
  whenToUse: 'Started by the BMUZ engine in a define pipeline; args { choices, digest, discover, out }',
  phases: [
    { title: 'Check', detail: 'Unity · Decisions & pillars · The shelves, each alone, reading project files only' },
    { title: 'Write', detail: 'the fit report: tensions, bricks against a pillar, on-ice ideas that fit, gaps' },
  ],
}

// The design: framework .planning/research/bmuz-vision/define-research.md, section 5(a) step 6 (Schell's Tetrad
// and Unification, the pasted-on theme test, story-vs-rules clash, Meier's interesting decisions, each brick
// against the pillars, on-ice ideas that fit now, Schell's Innovation filter against Prior art).
// The helpers find; they never choose. The creative walks each tension in the next talk step (keep / change / park).
// They read project files only (Read / Glob / Grep): no web, no edits; one Write for the report.

let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = {} } }
a = a || {}
const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const list = v => (Array.isArray(v) ? v : v ? [v] : [])
// (an item is text, {text, his?, picked?, brick?}, or a field's own shape: a pillar, a verb, a mechanism)
const itemLine = x => (typeof x === 'string' ? text(x) : x && typeof x === 'object' && x.text ? `${text(x.text)}${x.brick ? ` [${text(x.brick)}]` : ''}` : x && typeof x === 'object' ? text(Object.entries(x).filter(([k]) => k !== 'his' && k !== 'picked').map(([k, v]) => `${k}: ${list(v).map(y => (typeof y === 'object' ? JSON.stringify(y) : text(y))).join(' / ')}`).join(' · ')) : '')

// The files the helpers read and the report path stay inside the project (relative, no "..", not .bmuz).
const safe = (p, ext) => typeof p === 'string' && p.endsWith(ext) && !/^[\/\\]|^[A-Za-z]:|\\/.test(p) &&
  p.split('/').every(x => x && x !== '..' && x !== '.') && p.split('/')[0].toLowerCase() !== '.bmuz'
const digest = safe(a.digest, '.md') ? a.digest : '.planning/research/define-digest.md'
const discover = safe(a.discover, '.md') ? a.discover : '.planning/DISCOVER.md'
const out = safe(a.out, '.md') ? a.out : '.planning/research/define-fit.md'
if (a.out && out !== a.out) log(`"${a.out}" isn't a path inside the project; writing ${out} instead`)

// What the creative chose so far (the engine pins it from the talk steps): key → items.
const choices = a.choices && typeof a.choices === 'object' ? a.choices : {}
const chosenLines = Object.entries(choices)
  .map(([k, v]) => [k, list(v).map(itemLine).filter(Boolean)])
  .filter(([, v]) => v.length)
  .map(([k, v]) => `- ${k}: ${v.join('; ')}`)
if (!chosenLines.length) throw new Error('fit-flow needs "choices": what the creative chose in the talk steps so far')

const LENSES = [
  {
    id: 'unity', name: 'Unity',
    ask: 'Do the choices pull together? Schell\'s Tetrad (mechanics, story, aesthetics, technology) and Unification: does every choice serve the same experience? The pasted-on test (Jesper Juul, quoting a critic: could the rules be re-themed to "the terror of the French Revolution" without changing anything?): do the theme and the core verbs agree? Does the story say one thing while the rules reward another (ludonarrative dissonance)?',
  },
  {
    id: 'decisions', name: 'Decisions & pillars',
    ask: 'Sid Meier\'s interesting decisions: do the core verbs and mechanisms give the player real choices with tradeoffs, or obvious ones? Then each chosen brick against each pillar (Maine\'s closer / neutral / against): which chosen brick works against a pillar, and is any brick there because it is cool rather than because it serves a pillar? Too many verbs (verb bloat)?',
  },
  {
    id: 'shelves', name: 'The shelves',
    ask: `Read ${discover}: its On ice shelf (ideas held for Define) and its Prior art shelf. Which on-ice ideas now fit the pillars and the primary feelings (bring-in candidates, never decided by you)? Schell\'s Innovation filter: do the closest prior-art games already do exactly this, and what is new here? Gaps: a primary feeling no core verb delivers, a pillar no brick serves.`,
  },
]

const ITEM = { type: 'object', properties: { text: { type: 'string' }, brick: { type: 'string' } }, required: ['text'] }
const FIT = {
  type: 'object',
  properties: {
    tensions: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' }, why: { type: 'string' } }, required: ['a', 'b', 'why'] } },
    against: { type: 'array', items: { type: 'object', properties: { brick: { type: 'string' }, pillar: { type: 'string' }, why: { type: 'string' } }, required: ['brick', 'pillar', 'why'] } },
    onIceFits: { type: 'array', items: { type: 'object', properties: { idea: { type: 'string' }, brick: { type: 'string' }, why: { type: 'string' } }, required: ['idea', 'why'] } },
    gaps: { type: 'array', items: ITEM },
    checked: { type: 'string' },
  },
  required: ['tensions', 'against', 'onIceFits', 'gaps', 'checked'],
}

const frame = [
  'A creative (a game designer, not an engineer) is in the Define stage of a game: choosing which of the bricks collected in Discover to build with. These are their choices so far:',
  ...chosenLines,
  `The shelves they chose from: ${discover} (every brick collected) and ${digest} (the same bricks grouped, each with an id like [EX3]). Read them with the Read tool; Grep helps on long files.`,
].join('\n')

const prompt = lens => [
  frame,
  '',
  `Your check: ${lens.name} — ${lens.ask}`,
  'You work alone; other helpers do other checks.',
  'Rules:',
  '- Find, never choose: no recommendation, no ranking, no "you should". The creative decides each tension in the next step (keep both / change one / park one).',
  '- Every tension names the two choices that pull against each other ("a", "b") in a few words each, and "why" in one plain sentence a non-engineer can read.',
  '- Quote choices and bricks as they are written; give a brick\'s id (like OI12) in "brick" when it has one.',
  '- Only what the files and the choices show. Nothing invented about real players: what players would feel is a playtest or a question for the creative.',
  '- Use only Read, Glob and Grep. Change no file.',
  '- "checked": one line saying what you looked at.',
].join('\n')

phase('Check')
const found = await parallel(LENSES.map(lens => () => agent(prompt(lens), { label: `check: ${lens.id}`, phase: 'Check', schema: FIT })))

// Merged in code (no merge helper: organising only, so nothing can be chosen on the way): repeats folded,
// each finding keeps the checks that saw it.
const seen = new Map()
const add = (kind, key, item, lens) => {
  const k = `${kind}|${key.toLowerCase()}`
  if (!seen.has(k)) seen.set(k, { kind, ...item, by: [] })
  if (!seen.get(k).by.includes(lens)) seen.get(k).by.push(lens)
}
const failed = []
LENSES.forEach((lens, i) => {
  const r = found[i]
  if (!r) { failed.push(lens.id); return }
  for (const t of list(r.tensions)) if (text(t.a) && text(t.b)) add('tension', `${text(t.a)}|${text(t.b)}`, { a: text(t.a), b: text(t.b), why: text(t.why) }, lens.name)
  for (const x of list(r.against)) if (text(x.brick)) add('against', `${text(x.brick)}|${text(x.pillar)}`, { brick: text(x.brick), pillar: text(x.pillar), why: text(x.why) }, lens.name)
  for (const x of list(r.onIceFits)) if (text(x.idea)) add('onice', text(x.idea), { idea: text(x.idea), brick: text(x.brick), why: text(x.why) }, lens.name)
  for (const x of list(r.gaps)) if (text(x && x.text)) add('gap', text(x.text), { text: text(x.text) }, lens.name)
})
if (failed.length) log(`no answer from: ${failed.join(', ')}`)
if (failed.length === LENSES.length) throw new Error('no fit check came back')
const of = kind => [...seen.values()].filter(x => x.kind === kind)
const by = x => ` (seen by: ${x.by.join(', ')})`
const id = b => (/^[A-Z]{2}\d{1,4}$/.test(b || '') ? ` [${b}]` : '')
const none = '- none found'

const md = [
  '# Define fit check',
  '',
  'Made by the BMUZ fit-check flow: three helpers (Unity · Decisions & pillars · The shelves), each alone, read the choices so far and DISCOVER.md. Nothing here is chosen: the next step walks each tension with the creative (keep both / change one / park one).',
  '',
  '## Tensions',
  ...(of('tension').length ? of('tension').map(t => `- ${t.a} ↔ ${t.b}: ${t.why}${by(t)}`) : [none]),
  '',
  '## Bricks against a pillar',
  ...(of('against').length ? of('against').map(x => `- ${x.brick} — against "${x.pillar}": ${x.why}${by(x)}`) : [none]),
  '',
  '## On-ice ideas that fit now',
  ...(of('onice').length ? of('onice').map(x => `- ${x.idea}${id(x.brick)}: ${x.why}${by(x)}`) : [none]),
  '',
  '## Gaps',
  ...(of('gap').length ? of('gap').map(x => `- ${x.text}${by(x)}`) : [none]),
  '',
  '## What was checked',
  ...LENSES.map((l, i) => `- ${l.name}: ${found[i] ? text(found[i].checked) || 'not said' : 'no answer from this helper'}`),
  '',
].join('\n')

phase('Write')
const said = await agent([
  `Use the Write tool to create the file ${out} (relative to the current working directory) with exactly the text between the two lines of ===== below, character for character. Change nothing, add nothing.`,
  '=====',
  md,
  '=====',
  'Then reply with just the word written.',
].join('\n'), { label: 'write the fit report', phase: 'Write', model: 'haiku' })

return { wrote: out, tensions: of('tension').length, against: of('against').length, onIceFits: of('onice').length, gaps: of('gap').length, helpersFailed: failed, said }
