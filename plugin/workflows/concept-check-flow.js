export const meta = {
  name: 'concept-check-flow',
  description: 'Define concept review: two separate reviewers read GDD Part 1 against itself, DISCOVER.md and the decisions list (story vs verbs and feelings, pillars vs primaries, orphan musts, not-this-game, pasted-on theme, cheap risk tests) and turn what they find into questions for the creative; they choose nothing',
  whenToUse: 'Started by the BMUZ engine in a define pipeline; args { gdd, discover, decisions, out }',
  phases: [
    { title: 'Review', detail: 'Traces · Clashes, each alone, reading project files only' },
    { title: 'Write', detail: 'the check report: findings as questions, what agrees, what was open' },
  ],
}

// The design: framework .planning/research/bmuz-vision/define-research.md, section 5(d), "By a separate
// reviewer" (Develop's separate-reviewer rule). The reviewers didn't write the concept and choose nothing: every
// finding becomes a question for the creative on the review step's card (taste / want / choice, never engineering).
// They read project files only (Read / Glob / Grep); one Write for the report.

let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = {} } }
a = a || {}
const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const list = v => (Array.isArray(v) ? v : v ? [v] : [])
const safe = (p, ext) => typeof p === 'string' && p.endsWith(ext) && !/^[\/\\]|^[A-Za-z]:|\\/.test(p) &&
  p.split('/').every(x => x && x !== '..' && x !== '.')
// (the decisions list is the engine's own .bmuz/decisions.md: read only; every other path stays out of .bmuz)
const notEngine = p => p.split('/')[0].toLowerCase() !== '.bmuz'
const gdd = safe(a.gdd, '.md') && notEngine(a.gdd) ? a.gdd : '.planning/GDD.md'
const discover = safe(a.discover, '.md') && notEngine(a.discover) ? a.discover : '.planning/DISCOVER.md'
const decisions = safe(a.decisions, '.md') ? a.decisions : '.bmuz/decisions.md'
const out = safe(a.out, '.md') && notEngine(a.out) ? a.out : '.planning/research/define-check.md'
if (a.out && out !== a.out) log(`"${a.out}" isn't a path inside the project; writing ${out} instead`)

const REVIEWERS = [
  {
    id: 'traces', name: 'Traces',
    checks: [
      'the story uses the core verbs and delivers the primary feelings (Schell\'s Tetrad and Unification)',
      'every pillar traces to a primary feeling, and every primary feeling has a pillar',
      'every first-release must serves a primary feeling or a pillar (no orphan musts), and every primary feeling is served by at least one must',
    ],
  },
  {
    id: 'clashes', name: 'Clashes',
    checks: [
      'nothing chosen contradicts "Not this game"',
      'the theme and the core verbs agree (the pasted-on test: could the rules be re-themed to "the terror of the French Revolution", as Juul quotes a critic, without changing anything?)',
      'each risk\'s cheapest test is cheap enough to run in Design (a sketch, a sim or a paper test, not the full game)',
      `nothing in Part 1 contradicts a decision already recorded in ${decisions} (if that file exists)`,
    ],
  },
]

const KINDS = ['taste', 'want', 'choice']
const REVIEW = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          check: { type: 'integer' }, part: { type: 'string' }, finding: { type: 'string' },
          key: { type: 'string' }, q: { type: 'string' }, kind: { type: 'string', enum: KINDS }, options: { type: 'array', items: { type: 'string' } },
        },
        required: ['check', 'part', 'finding', 'key', 'q', 'kind', 'options'],
      },
    },
    agrees: { type: 'array', items: { type: 'object', properties: { check: { type: 'integer' }, note: { type: 'string' } }, required: ['check', 'note'] } },
    notChecked: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'agrees', 'notChecked'],
}

const prompt = r => [
  'A creative (a game designer, not an engineer) has just written the concept of their game: Part 1 of the game design document. You review it; you did not write it.',
  `Read ${gdd} ("## Part 1 — The concept"), ${discover} (the bricks it was chosen from) and ${decisions} if it exists, with the Read tool.`,
  `Your checks (the numbers are "check"):\n${r.checks.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
  'Rules:',
  '- You choose nothing and change no file. Every problem you find becomes one question for the creative, in their terms: "q" ends in "?"; "kind" is taste (how it looks, feels or plays), want (what they want) or choice (pick between "options", 2 or more). Never an engineering question. "key": a short slug in lower case letters, digits and dashes, starting "concept-".',
  '- "finding": what you saw, in one plain sentence, quoting the parts that disagree. "part": the Part 1 heading it is about.',
  '- A part marked "open — not chosen yet" is not a problem: list it in "notChecked" and skip the checks that need it.',
  '- "agrees": each check that passed, with one line saying why.',
  '- Only what the files show. Nothing invented about real players. Use only Read, Glob and Grep. Call the person "the creative" (or "they"), never he or she.',
].join('\n')

phase('Review')
const got = await parallel(REVIEWERS.map(r => () => agent(prompt(r), { label: `review: ${r.id}`, phase: 'Review', schema: REVIEW })))

const failed = REVIEWERS.filter((_, i) => !got[i]).map(r => r.id)
if (failed.length) log(`no answer from: ${failed.join(', ')}`)
if (failed.length === REVIEWERS.length) throw new Error('no concept reviewer came back')
const slug = s => text(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
const keys = new Set()
const findings = []
const agrees = []
const open = new Set()
REVIEWERS.forEach((r, i) => {
  const res = got[i]
  if (!res) return
  for (const f of list(res.findings)) {
    const q = text(f.q)
    if (!text(f.finding) || !q) continue
    let key = slug(f.key) || `concept-${r.id}-${findings.length + 1}`
    if (!/^[a-z]/.test(key)) key = `concept-${key}`
    if (keys.has(key)) continue
    keys.add(key)
    const kind = KINDS.includes(f.kind) ? f.kind : 'want'
    const options = list(f.options).map(text).filter(Boolean)
    findings.push({ by: r.name, check: r.checks[(Number(f.check) || 1) - 1] || r.checks[0], part: text(f.part), finding: text(f.finding), key, q: q.endsWith('?') ? q : `${q.replace(/[.!]+$/, '')}?`, kind: kind === 'choice' && options.length < 2 ? 'want' : kind, options })
  }
  for (const x of list(res.agrees)) if (text(x.note)) agrees.push(`- ${r.name}: ${r.checks[(Number(x.check) || 1) - 1] || ''} — ${text(x.note)}`)
  for (const x of list(res.notChecked)) if (text(x)) open.add(text(x))
})

const md = [
  '# Define concept check',
  '',
  `Made by the BMUZ concept-review flow: two reviewers who did not write the concept (Traces · Clashes), each alone, read ${gdd} Part 1 against itself, ${discover} and ${decisions}. They choose nothing: each finding is a question for the creative on the review card.`,
  '',
  '## Findings',
  ...(findings.length ? findings.map(f => `- ${f.part ? `${f.part}: ` : ''}${f.finding} (${f.by}: ${f.check}) → question \`${f.key}\` (${f.kind}): ${f.q}${f.options.length ? ` Options: ${f.options.join(' / ')}` : ''}`) : ['- none: every check that could run agrees']),
  '',
  '## Agrees',
  ...(agrees.length ? agrees : ['- none listed']),
  '',
  '## Not checked (open parts)',
  ...(open.size ? [...open].map(x => `- ${x}`) : ['- none']),
  '',
  '## Reviewers',
  ...REVIEWERS.map((r, i) => `- ${r.name}: ${got[i] ? 'answered' : 'no answer'}`),
  '',
].join('\n')

phase('Write')
const said = await agent([
  `Use the Write tool to create the file ${out} (relative to the current working directory) with exactly the text between the two lines of ===== below, character for character. Change nothing, add nothing.`,
  '=====',
  md,
  '=====',
  'Then reply with just the word written.',
].join('\n'), { label: 'write the check report', phase: 'Write', model: 'haiku' })

return { wrote: out, findings: findings.length, questions: findings.map(f => ({ key: f.key, q: f.q, kind: f.kind, options: f.options })), agrees: agrees.length, notChecked: [...open], helpersFailed: failed, said }
