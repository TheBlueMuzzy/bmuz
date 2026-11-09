export const meta = {
  name: 'research-flow',
  description: 'Discover research: four lenses research the framed questions alone, one merge organises (never chooses), every claim sourced',
  whenToUse: 'Started by the BMUZ engine in a discover pipeline; args { brief, goal, kind, assumptions, onIce, constraints, questions, out }',
  phases: [
    { title: 'Diverge', detail: 'Mainstream · Extremes & failures · Outside the field · Disconfirm, each alone' },
    { title: 'Converge-lite', detail: 'themes, strength, contradictions, assumption scoreboard, surprises, probes' },
    { title: 'Write', detail: 'the report file, with its Sources list' },
  ],
}

// The design: framework .planning/research/bmuz-vision/discover-research.md, sections 5 and 6 (H1–H24).
// Stage B (diverge) + Stage C (converge-lite). A workflow never holds a taste decision: it widens and
// organises; choosing is Define's.

// ---- Inputs (pinned by the engine from the "frame" and "questions" talk steps) ----
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = { brief: a } } }
a = a || {}
const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const list = v => (Array.isArray(v) ? v : v ? [v] : [])
const brief = text(a.brief)
if (!brief) throw new Error('research-flow needs a "brief"')
const goal = text(a.goal) || brief
const KINDS = ['tech', 'aesthetic', 'design']
let kind = text(a.kind).toLowerCase()
if (!KINDS.includes(kind)) { log(`topic type "${kind}" isn't tech / aesthetic / design; looking as for design`); kind = 'design' }
const assumptions = list(a.assumptions).map(x => (typeof x === 'string' ? { text: text(x), important: true } : { text: text(x && x.text), important: !!(x && x.important) })).filter(x => x.text)
const important = assumptions.filter(x => x.important)
const onIceIn = list(a.onIce).map(text).filter(Boolean)
const constraints = list(a.constraints).map(text).filter(Boolean)
const questions = list(a.questions).map(text).filter(Boolean).slice(0, 5)
if (!questions.length) throw new Error('research-flow needs "questions": the research questions from the questions step')

// The report stays inside the project: relative, forward slashes, no "..", a .md file, not in .bmuz.
// (The engine checks the same at its end; a bad path here falls back to the default rather than writing elsewhere.)
const slug = brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'topic'
const DEFAULT_OUT = `.planning/research/discover-${slug}.md`
const safeOut = p => typeof p === 'string' && /\.md$/.test(p) && !/^[\/\\]|^[A-Za-z]:|\\/.test(p) &&
  p.split('/').every(x => x && x !== '..' && x !== '.') && p.split('/')[0].toLowerCase() !== '.bmuz'
let out = a.out
if (!safeOut(out)) {
  if (out) log(`"${out}" isn't a path inside the project; writing ${DEFAULT_OUT} instead`)
  out = DEFAULT_OUT
}

// MDA's "Aesthetics" (what players feel) and the creative's "aesthetic" topics (look, feel, sound,
// juice) are different words; every prompt keeps them apart (discover-research.md section 4).
const KIND_WORDS = {
  tech: 'a tech topic (an engine feature, library or platform)',
  aesthetic: 'an aesthetic topic: look, feel, sound, juice (the polish a player senses). Not MDA\'s "Aesthetics", which means the feelings a game evokes in players; keep the two words apart',
  design: 'a design topic (a mechanic, loop or rule)',
}

// ---- Stage B: four lenses, fixed by heuristic; the topic type only changes where each one looks ----
const LENSES = [
  {
    id: 'mainstream', name: 'Mainstream', why: 'H12',
    ask: 'how this is usually done: what most examples share',
    where: { tech: 'official docs, common libraries, the usual architecture', aesthetic: 'common treatments in games of that kind', design: 'standard mechanics for that experience' },
  },
  {
    id: 'extremes', name: 'Extremes & failures', why: 'H12',
    ask: 'the most extreme cases, edge cases, and documented failures or post-mortems (failures are where assumptions break)',
    where: { tech: 'issue trackers, post-mortems, limits and benchmarks', aesthetic: 'the most extreme examples of the feeling, and where it tips into "too much"', design: 'edge players, degenerate strategies, failed designs' },
  },
  {
    id: 'outside', name: 'Outside the field', why: 'H11, H24',
    ask: 'the same activity or feeling in an unrelated domain, for a fresh view and for things nobody thought to ask',
    where: { tech: 'other industries solving the same technical problem', aesthetic: 'film, animation, product design, music with the same feeling', design: 'sports, toys, social rituals with the same dynamic' },
  },
  {
    id: 'disconfirm', name: 'Disconfirm', why: 'H9, H14, H8',
    ask: 'evidence AGAINST the creative\'s important assumptions (the beliefs that would hurt most if wrong)',
    where: { tech: 'evidence the favoured option won\'t fit the constraints', aesthetic: 'evidence the favoured reference doesn\'t produce the target feeling', design: 'evidence the favoured mechanic doesn\'t create the wanted behaviour' },
  },
]
const MAX_SOURCES = 10 // per helper: the hard cap beside saturation (H15)
const PROBES = ['spike', 'sketch', 'playtest', 'ask the creative']

const URLS = { type: 'array', items: { type: 'string' } }
const NOTES = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'integer' }, says: { type: 'string' }, means: { type: 'string' }, urls: URLS },
        required: ['q', 'says', 'means', 'urls'],
      },
    },
    assumptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, bears: { type: 'string', enum: ['supports', 'contradicts'] }, says: { type: 'string' }, urls: URLS },
        required: ['n', 'bears', 'says', 'urls'],
      },
    },
    open: {
      type: 'array',
      items: { type: 'object', properties: { question: { type: 'string' }, probe: { type: 'string', enum: PROBES }, why: { type: 'string' } }, required: ['question', 'probe', 'why'] },
    },
    onIce: { type: 'array', items: { type: 'string' } },
    saturation: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' } }, required: ['url', 'title'] } },
  },
  required: ['notes', 'assumptions', 'open', 'onIce', 'saturation', 'sources'],
}

const numbered = xs => xs.map((x, i) => `${i + 1}. ${x}`).join('\n')
const frame = [
  `A creative (a game designer, not an engineer) is in the Discover stage: understanding the problem before anyone solves it.`,
  `Brief, as they said it: "${brief}"`,
  `The goal underneath: "${goal}"`,
  `This is ${KIND_WORDS[kind]}.`,
  constraints.length ? `It must fit / off the table: ${constraints.join('; ')}.` : '',
  `Research questions (the numbers are "q" in your notes):\n${numbered(questions)}`,
  important.length ? `The creative's important assumptions: things they believe, to be TESTED, not taken as true (the numbers are "n"):\n${numbered(important.map(x => x.text))}` : 'The creative named no important assumptions.',
].filter(Boolean).join('\n')

const helperPrompt = lens => [
  frame,
  '',
  `Your lens: ${lens.name} — ${lens.ask}. For this topic, look in: ${lens.where[kind]}.`,
  'You work alone; other helpers cover other lenses. Answer every research question you can from your lens.',
  'Use WebSearch to find sources and WebFetch to open the pages you rely on (if they are not loaded yet, load them with ToolSearch "select:WebSearch,WebFetch").',
  'Rules:',
  '- Gather widely before you sum up. Never rank, recommend, or say what the creative should do or pick: that is the next stage, and theirs.',
  '- Two columns per note: "says" = what the source says or shows; "means" = what you think it means. Keep them apart.',
  '- Every note lists the full https URL of each page it comes from. Cite only pages that came back in your searches or that you opened; never make up a URL or guess a page path. A note you cannot source, leave out.',
  '- "q" = the research question it bears on; 0 = none of them (something nobody asked, worth knowing).',
  `- "assumptions": evidence that supports or contradicts an important assumption, by its number.${lens.id === 'disconfirm' ? ' This is your main job: look hard for evidence AGAINST each one.' : ''}`,
  `- Stop when your last few sources added nothing new, and say so in "saturation" (how many sources, and whether you stopped at "nothing new" or at the cap). Never more than ${MAX_SOURCES} sources.`,
  `- "open": what reading can't answer, with the probe that could: ${PROBES.join(' / ')}. Real players are never imagined by you: what players would feel is a playtest or a question for the creative.`,
  '- "onIce": ready-made solutions or ideas you came across: kept for later, not pursued.',
  '- List every page you cited in "sources" with its title.',
].join('\n')

phase('Diverge')
// Each helper alone; none sees another's notes before the merge (H5).
const found = await parallel(LENSES.map(lens => () => agent(helperPrompt(lens), { label: `lens: ${lens.id}`, phase: 'Diverge', schema: NOTES })))

const isLink = u => typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u.trim())
const titles = new Map()
const raw = {}
let capped = 0
LENSES.forEach((lens, i) => {
  const r = found[i] || {}
  for (const s of list(r.sources)) if (s && isLink(s.url) && !titles.has(s.url.trim())) titles.set(s.url.trim(), text(s.title))
  // The cap, kept in code: a helper's first MAX_SOURCES links count; a note resting only on later ones is dropped (and said).
  const seen = []
  const allow = u => {
    if (!seen.includes(u) && seen.length < MAX_SOURCES) seen.push(u)
    return seen.includes(u)
  }
  const urls = us => list(us).filter(isLink).map(u => u.trim())
  const notes = list(r.notes).map(n => ({ q: Number(n.q) || 0, says: text(n.says), means: text(n.means), urls: urls(n.urls).filter(allow) }))
  const ev = list(r.assumptions).map(x => ({ n: Number(x.n) || 0, bears: x.bears === 'contradicts' ? 'contradicts' : 'supports', says: text(x.says), urls: urls(x.urls).filter(allow) }))
  const before = list(r.notes).length + list(r.assumptions).length
  const kept = notes.filter(n => n.says && n.urls.length).length + ev.filter(x => x.says && x.urls.length).length
  capped += Math.max(0, before - kept)
  raw[lens.id] = {
    notes: notes.filter(n => n.says && n.urls.length),
    assumptions: ev.filter(x => x.says && x.urls.length && x.n >= 1 && x.n <= important.length),
    open: list(r.open).map(o => ({ question: text(o.question), probe: PROBES.includes(o.probe) ? o.probe : 'ask the creative', why: text(o.why) })).filter(o => o.question),
    onIce: list(r.onIce).map(text).filter(Boolean),
    saturation: text(r.saturation) || (found[i] ? 'not said' : 'no answer from this helper'),
  }
})
const helpersFailed = LENSES.filter((_, i) => !found[i]).map(x => x.id)
if (helpersFailed.length) log(`no answer from: ${helpersFailed.join(', ')}`)
if (capped) log(`left out ${capped} note${capped > 1 ? 's' : ''} with no source (or past the ${MAX_SOURCES}-source cap)`)
const known = new Set([...titles.keys(), ...Object.values(raw).flatMap(r => [...r.notes, ...r.assumptions].flatMap(n => n.urls))])
if (!Object.values(raw).some(r => r.notes.length)) throw new Error(`no sourced findings on "${brief}"`)

// ---- Stage C: converge-lite. Organise, check strength, keep disagreements: never choose ----
phase('Converge-lite')
const CLAIM = { type: 'object', properties: { text: { type: 'string' }, urls: URLS, interpretation: { type: 'boolean' } }, required: ['text', 'urls', 'interpretation'] }
const SIDE = { type: 'object', properties: { says: { type: 'string' }, context: { type: 'string' }, urls: URLS }, required: ['says', 'context', 'urls'] }
const MERGED = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'integer' }, theme: { type: 'string' }, claims: { type: 'array', items: CLAIM },
          soWhat: { type: 'object', properties: { text: { type: 'string' }, urls: URLS }, required: ['text', 'urls'] },
        },
        required: ['q', 'theme', 'claims', 'soWhat'],
      },
    },
    contradictions: { type: 'array', items: { type: 'object', properties: { a: SIDE, b: SIDE }, required: ['a', 'b'] } },
    scoreboard: {
      type: 'array',
      items: { type: 'object', properties: { n: { type: 'integer' }, verdict: { type: 'string', enum: ['supported', 'contradicted', 'no evidence'] }, evidence: { type: 'string' }, urls: URLS }, required: ['n', 'verdict', 'evidence', 'urls'] },
    },
    surprises: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, urls: URLS }, required: ['text', 'urls'] } },
    open: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, probe: { type: 'string', enum: PROBES } }, required: ['question', 'probe'] } },
    onIce: { type: 'array', items: { type: 'string' } },
    hmw: { type: 'array', items: { type: 'string' } },
  },
  required: ['themes', 'contradictions', 'scoreboard', 'surprises', 'open', 'onIce', 'hmw'],
}
const merged = await agent([
  frame,
  '',
  'Four helpers researched this alone, each through one lens. Their notes, as JSON:',
  JSON.stringify(Object.fromEntries(LENSES.map(l => [l.name, { notes: raw[l.id].notes, assumptions: raw[l.id].assumptions, open: raw[l.id].open, onIce: raw[l.id].onIce }])), null, 1),
  '',
  'Organise them. You never choose: no recommendation, no ranking of options, no scope. Choosing is the next stage.',
  '- "themes": group the notes into themes under each research question ("q", 0 = none). Each claim is one plain sentence a non-engineer can read, with the URLs of the notes it rests on. "interpretation": true when the claim is a helper\'s reading (their "means") rather than what a source says. Combine notes that say the same thing into one claim with all their URLs.',
  '- Each theme gets "soWhat": one draft line for the next stage — the observation plus why it might matter — with the URLs it rests on.',
  '- "contradictions": where notes disagree, keep both sides with each side\'s context (who or what the source was looking at). Never average them away.',
  '- "scoreboard": each important assumption by number: supported / contradicted / no evidence, with the evidence and its URLs.',
  '- "surprises": 1 or 2 findings that answer a question nobody asked, with URLs.',
  '- "open": what reading couldn\'t answer, each with its probe.',
  '- "onIce": solutions and ideas that came up, kept for the next stage.',
  '- "hmw": at most 2 draft "How might we …?" questions with no solution in them, or none.',
  'Use only URLs that appear above. Add nothing new.',
].join('\n'), { label: 'merge', phase: 'Converge-lite', schema: MERGED })

// The merge is checked in code, not trusted: a URL no helper cited is removed, and a claim left with
// no source is dropped. Strength is counted here too (H14): 2+ different sites = several sources.
let dropped = 0
const clean = us => [...new Set(list(us).filter(isLink).map(u => u.trim()).filter(u => known.has(u)))]
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch (e) { return u } }
const strength = c => (c.interpretation ? 'interpretation only' : new Set(c.urls.map(host)).size >= 2 ? 'several sources' : 'one source')
const sourcedOnly = xs => {
  const keep = xs.filter(x => x.text && x.urls.length)
  dropped += xs.length - keep.length
  return keep
}
let themes
if (merged) {
  themes = list(merged.themes).map(t => ({
    q: Number(t.q) || 0,
    theme: text(t.theme),
    claims: sourcedOnly(list(t.claims).map(c => ({ text: text(c.text), urls: clean(c.urls), interpretation: !!c.interpretation }))),
    soWhat: t.soWhat ? { text: text(t.soWhat.text), urls: clean(t.soWhat.urls) } : null,
  })).filter(t => t.claims.length)
} else {
  // No merge (the helper died): each question's notes as they came, one theme per question.
  log('the merge helper gave no answer; the report lists the notes by question as they came')
  const notes = Object.values(raw).flatMap(r => r.notes)
  themes = [...new Set(notes.map(n => n.q))].map(q => ({ q, theme: 'Notes from the lenses', claims: notes.filter(n => n.q === q).map(n => ({ text: n.says, urls: n.urls, interpretation: false })), soWhat: null }))
}
if (!themes.length) throw new Error(`no sourced findings on "${brief}" after the merge`)
const sides = s => ({ says: text(s && s.says), context: text(s && s.context), urls: clean(s && s.urls) })
const contradictions = merged ? list(merged.contradictions).map(c => ({ a: sides(c.a), b: sides(c.b) })).filter(c => c.a.says && c.b.says && c.a.urls.length && c.b.urls.length) : []
// Every important assumption is on the scoreboard. A verdict with no source left is "no evidence".
const fromHelpers = n => {
  const ev = Object.values(raw).flatMap(r => r.assumptions).filter(x => x.n === n)
  const against = ev.filter(x => x.bears === 'contradicts')
  const use = against.length ? against : ev
  return use.length ? { verdict: against.length ? 'contradicted' : 'supported', evidence: use[0].says, urls: [...new Set(use.flatMap(x => x.urls))] } : null
}
const scoreboard = important.map((x, i) => {
  const m = merged && list(merged.scoreboard).find(s => Number(s.n) === i + 1)
  let v = m ? { verdict: m.verdict, evidence: text(m.evidence), urls: clean(m.urls) } : fromHelpers(i + 1)
  if (!v || v.verdict === 'no evidence' || !v.urls.length) v = { verdict: 'no evidence', evidence: '', urls: [] }
  return { assumption: x.text, ...v }
})
const surprises = sourcedOnly((merged ? list(merged.surprises) : Object.values(raw).flatMap(r => r.notes).filter(n => n.q === 0).map(n => ({ text: n.says, urls: n.urls }))).map(s => ({ text: text(s.text), urls: clean(s.urls) }))).slice(0, 2)
const probes = new Map()
for (const o of [...(merged ? list(merged.open) : []), ...Object.values(raw).flatMap(r => r.open)]) {
  const q = text(o.question)
  if (q && !probes.has(q.toLowerCase())) probes.set(q.toLowerCase(), { question: q, probe: PROBES.includes(o.probe) ? o.probe : 'ask the creative' })
}
const onIce = [
  ...onIceIn.map(x => `${x} (from the creative)`),
  ...[...new Set([...(merged ? list(merged.onIce) : []), ...Object.values(raw).flatMap(r => r.onIce)].map(text).filter(Boolean))].map(x => `${x} (came up in research)`),
]
const soWhats = themes.filter(t => t.soWhat && t.soWhat.text && t.soWhat.urls.length)
const hmw = merged ? list(merged.hmw).map(text).filter(x => /^how might we\b/i.test(x)).slice(0, 2) : []
if (dropped) log(`dropped ${dropped} claim${dropped > 1 ? 's' : ''} with no source`)

// ---- The report (format checked by plugin/scripts/check-sources.mjs) ----
const numbers = new Map()
const cite = us => us.map(u => {
  if (!numbers.has(u)) numbers.set(u, numbers.size + 1)
  return `[${numbers.get(u)}]`
}).join('')
const bare = s => s.replace(/\s*\[\d+\]/g, '')
const none = '- none found'
const md = [
  `# Discover: ${brief}`,
  '',
  'Made by the BMUZ research flow: four lenses (Mainstream, Extremes & failures, Outside the field, Disconfirm), each working alone, merged after. Strength: (several sources) = two or more different sites agree · (one source) · (interpretation only) = a helper\'s reading. Nothing here is a decision: choosing is /define\'s.',
  '',
  `Lenses: ${LENSES.map(l => `${l.name}: ${raw[l.id].saturation}`).join(' · ')}`,
  '',
  '## Question',
  `- Brief as said: ${brief}`,
  `- Goal underneath: ${goal}`,
  `- Topic type: ${kind === 'aesthetic' ? 'aesthetic (look, feel, sound, juice; not MDA\'s "Aesthetics", which means what players feel)' : kind}`,
  `- Must fit / off the table: ${constraints.length ? constraints.join('; ') : 'none named'}`,
  `- Assumptions: ${assumptions.length ? assumptions.map(x => `"${x.text}" (${x.important ? 'important' : 'not important'})`).join('; ') : 'none named'}`,
  '',
  '## Research questions',
  numbered(questions),
  '',
  '## Findings by question',
]
const qs = [...questions.map((q, i) => ({ n: i + 1, q })), { n: 0, q: 'Beyond the questions' }]
for (const { n, q } of qs) {
  const ts = themes.filter(t => (t.q >= 1 && t.q <= questions.length ? t.q : 0) === n)
  if (!ts.length && n === 0) continue
  md.push(`### ${n ? `${n}. ` : ''}${q}`)
  if (!ts.length) md.push('- none found: see Open questions')
  for (const t of ts) md.push(`**${bare(t.theme) || 'Theme'}**`, ...t.claims.map(c => `- ${bare(c.text)} ${cite(c.urls)} (${strength(c)})`))
}
md.push('', '## Contradictions', ...(contradictions.length ? contradictions.map(c => `- ${bare(c.a.says)} ${cite(c.a.urls)} (context: ${c.a.context || 'not said'}) — but ${bare(c.b.says)} ${cite(c.b.urls)} (context: ${c.b.context || 'not said'})`) : [none]))
const count = v => scoreboard.filter(s => s.verdict === v).length
md.push('', '## Assumption scoreboard')
if (scoreboard.length) {
  md.push(`${count('supported')} supported · ${count('contradicted')} contradicted · ${count('no evidence')} no evidence`)
  for (const s of scoreboard) md.push(s.verdict === 'no evidence' ? `- No evidence: "${s.assumption}"` : `- ${s.verdict === 'supported' ? 'Supported' : 'Contradicted'}: "${s.assumption}" — ${bare(s.evidence)} ${cite(s.urls)}`)
} else md.push('- none: the creative named no important assumptions')
md.push('', '## Surprises', ...(surprises.length ? surprises.map(s => `- ${bare(s.text)} ${cite(s.urls)}`) : [none]))
md.push('', '## Open questions → probes', ...(probes.size ? [...probes.values()].map(o => `- ${o.question} → ${o.probe}`) : [none]))
md.push('', '## On ice', ...(onIce.length ? onIce.map(x => `- ${x}`) : ['- none']))
md.push('', '## So what (draft for Define)', ...(soWhats.length ? soWhats.map(t => `- ${bare(t.theme)}: ${bare(t.soWhat.text)} ${cite(t.soWhat.urls)}`) : ['- none drafted']))
if (hmw.length) md.push('', ...hmw.map(h => `Draft for Define: ${h}`))
md.push('', '## Sources', ...[...numbers.entries()].map(([u, n]) => `${n}. ${(titles.get(u) || host(u)).replace(/[\[\]]/g, '')} — ${u}`), '')
const report = md.join('\n')

phase('Write')
const said = await agent([
  `Use the Write tool to create the file ${out} (relative to the current working directory) with exactly the text between the two lines of ===== below, character for character. Change nothing, add nothing.`,
  '=====',
  report,
  '=====',
  'Then reply with just the word written.',
].join('\n'), { label: 'write the report', phase: 'Write', model: 'haiku' })

const findings = themes.reduce((n, t) => n + t.claims.length, 0)
return {
  wrote: out, brief, kind, findings, sources: numbers.size, dropped, capped,
  scoreboard: { supported: count('supported'), contradicted: count('contradicted'), noEvidence: count('no evidence'), contradictedNames: scoreboard.filter(s => s.verdict === 'contradicted').map(s => s.assumption) },
  surprises: surprises.length, probes: probes.size, helpersFailed, said,
}
