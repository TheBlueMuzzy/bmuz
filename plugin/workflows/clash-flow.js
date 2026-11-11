export const meta = {
  name: 'clash-flow',
  description: 'Define clash check (the script\'s 2.6): two separate reviewers read GDD Part 1 (the concept) for things that pull against each other and problems that are hard to see from the inside — pasted-on theme, decisions without real trade-offs, anything there only because it\'s cool — and write each clash as A, B and why; they choose nothing',
  whenToUse: 'Started by the BMUZ engine in the define pipeline; args { gdd, decisions, out }',
  phases: [
    { title: 'Review', detail: 'Pulls · Inside view, each alone, reading project files only' },
    { title: 'Write', detail: 'the clash report: each clash as A, B and why, and what holds it together' },
  ],
}

// The design: the approved script's 2.6 Clash Check (framework .planning/research/bmuz-vision/bmuz-design-doc.html):
// "separate reviewers read Part 1 (about 2 minutes)"; checks: pasted-on theme (Juul), decisions with real trade-offs
// (Meier), anything there only because it's cool (Thornton). The reviewers didn't write the concept and choose nothing:
// the creative decides each clash in the next step (keep both · change one · park one). Read / Glob / Grep only; one
// Write for the report.

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
const decisions = safe(a.decisions, '.md') ? a.decisions : '.bmuz/decisions.md'
const out = safe(a.out, '.md') && notEngine(a.out) ? a.out : '.planning/research/define-clash.md'
if (a.out && out !== a.out) log(`"${a.out}" isn't a path inside the project; writing ${out} instead`)

const REVIEWERS = [
  {
    id: 'pulls', name: 'Pulls',
    checks: [
      'two decisions pull against each other (a feeling and a pillar, the pitch and the core loop, the platform and the play structure, the scope and the feeling)',
      'something chosen goes against what the game deliberately won\'t have (The Feelings)',
      `something contradicts a decision already recorded in ${decisions} (if that file exists)`,
    ],
  },
  {
    id: 'inside', name: 'Inside view',
    checks: [
      'pasted-on theme (Juul): could the rules be re-themed to something else entirely without changing anything?',
      'decisions with real trade-offs (Meier): does the core loop give the player choices that are actually hard?',
      'anything there only because it\'s cool (Thornton): a part that no feeling or pillar asks for',
    ],
  },
]

const REVIEW = {
  type: 'object',
  properties: {
    clashes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { check: { type: 'integer' }, a: { type: 'string' }, b: { type: 'string' }, why: { type: 'string' } },
        required: ['check', 'a', 'b', 'why'],
      },
    },
    holds: { type: 'string' },
  },
  required: ['clashes', 'holds'],
}

const prompt = r => [
  'A creative (a game designer, not an engineer) has just decided the concept of their game: Part 1 of the game design document. You review it; you did not write it.',
  `Read ${gdd} (its "Part 1 · The concept" chapters: The Feelings, The 3 Pillars, The Pitch, The Core Loop, Platform & Play Structure, Scope, Risks & Unknowns) and ${decisions} if it exists, with the Read tool.`,
  `Your checks (the numbers are "check"):\n${r.checks.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
  'Rules:',
  '- You choose nothing and change no file. Each problem is one clash: "a" and "b" are the two things that pull against each other, each quoted short from the GDD with where it is ("Quick games", the pillar "Big comebacks"); "why" is one plain line in the creative\'s terms (a comeback needs time to build, and a 3-minute game may not have it). For a one-sided problem (a pasted-on theme), "b" is what it fails (the core loop).',
  '- Only real clashes, the most important first, at most 3. None is a fine answer.',
  '- "holds": one plain line on what holds the concept together (used when nothing clashes).',
  '- A chapter that says "open: nothing yet" is not a problem. Only what the files show; nothing invented about real players. Use only Read, Glob and Grep. Call the person "the creative" (or "they"), never he or she.',
].join('\n')

phase('Review')
const got = await parallel(REVIEWERS.map(r => () => agent(prompt(r), { label: `review: ${r.id}`, phase: 'Review', schema: REVIEW })))
const failed = REVIEWERS.filter((_, i) => !got[i]).map(r => r.id)
if (failed.length) log(`no answer from: ${failed.join(', ')}`)
if (failed.length === REVIEWERS.length) throw new Error('no clash reviewer came back')

const clashes = []
const holds = []
REVIEWERS.forEach((r, i) => {
  const res = got[i]
  if (!res) return
  for (const c of list(res.clashes)) {
    const x = { a: text(c.a), b: text(c.b), why: text(c.why).replace(/\.$/, ''), by: r.name }
    if (!x.a || !x.b || !x.why) continue
    if (clashes.some(y => y.a.toLowerCase() === x.a.toLowerCase() && y.b.toLowerCase() === x.b.toLowerCase())) continue
    clashes.push(x)
  }
  if (text(res.holds)) holds.push(text(res.holds))
})
const top = clashes.slice(0, 4)

const md = [
  '# Define clash check',
  '',
  `Made by the BMUZ clash flow: two reviewers who did not write the concept (Pulls · Inside view), each alone, read ${gdd} Part 1 and ${decisions}. They choose nothing: the creative decides each clash.`,
  '',
  '## Clashes',
  'Each line: number :: A :: B :: why',
  ...(top.length ? top.map((c, i) => `${i + 1} :: ${c.a} :: ${c.b} :: ${c.why} (${c.by})`) : ['- none']),
  '',
  '## Holds together',
  holds[0] || 'the concept agrees with itself',
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
].join('\n'), { label: 'write the clash report', phase: 'Write' })
return { out, clashes: top.length, written: text(said) }
