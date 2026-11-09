export const meta = {
  name: 'research-flow',
  description: 'Discover research: 3 helpers research a topic from different angles, one merges, the report keeps only sourced claims',
  whenToUse: 'Started by the BMUZ engine in a discover pipeline; args { topic, out }',
  phases: [
    { title: 'Research', detail: 'reference games, the players, what is fun' },
    { title: 'Merge', detail: 'one summary; findings without a source are dropped' },
    { title: 'Write', detail: 'the report file, with its Sources list' },
  ],
}

// Inputs come pinned by the engine (pipeline step "research"); a plain string is taken as the topic.
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = { topic: a } } }
const topic = String((a && a.topic) || '').trim()
if (!topic) throw new Error('research-flow needs a "topic"')

// The report stays inside the project: relative, forward slashes, no "..", a .md file, not in .bmuz.
// (The engine checks the same at its end; a bad path here falls back to the default rather than writing elsewhere.)
const DEFAULT_OUT = '.planning/research/discover.md'
const safeOut = p => typeof p === 'string' && /\.md$/.test(p) && !/^[\/\\]|^[A-Za-z]:|\\/.test(p) &&
  p.split('/').every(x => x && x !== '..' && x !== '.') && p.split('/')[0].toLowerCase() !== '.bmuz'
let out = a && a.out
if (!safeOut(out)) {
  if (out) log(`"${out}" isn't a path inside the project; writing ${DEFAULT_OUT} instead`)
  out = DEFAULT_OUT
}

// The three angles (ARCHITECTURE.md, Discover row). Each one is a section of the report.
const ANGLES = [
  { id: 'games', heading: 'Reference games — what works, what is missing', ask: 'existing games close to this topic: what players praise in them (what works) and what players or critics say is missing or frustrating' },
  { id: 'players', heading: 'The players — who and why', ask: 'who plays games like this (age, group size, experience, where and how long they play) and why they come back' },
  { id: 'fun', heading: "What's fun — the core feeling and loops", ask: 'what makes this kind of game fun: the feeling players describe, and the core loop (the thing players do again and again) that produces it' },
]

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, urls: { type: 'array', items: { type: 'string' } } },
        required: ['text', 'urls'],
      },
    },
    sources: {
      type: 'array',
      items: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' } }, required: ['url', 'title'] },
    },
  },
  required: ['findings', 'sources'],
}

const helperPrompt = angle => [
  `Research for a game designer exploring this idea: "${topic}".`,
  `Your angle: ${angle.ask}.`,
  'Use WebSearch to find sources and WebFetch to open the pages you rely on (if they are not loaded yet, load them with ToolSearch "select:WebSearch,WebFetch").',
  'Give 4 to 6 findings. Each finding is one plain sentence a non-engineer can read, and lists the full https URL of every page it comes from in "urls".',
  'Cite only pages that came back in your searches or that you opened. Never make up a URL or guess a page path. A finding you cannot source, leave out.',
  'Report what you found, not advice: never say what this game should be or do. Those calls belong to the designer.',
  'List every page you cited in "sources" with its title.',
].join('\n')

phase('Research')
const found = await parallel(ANGLES.map(angle => () => agent(helperPrompt(angle), { label: `research: ${angle.id}`, phase: 'Research', schema: FINDINGS })))

// Every page any helper cited, by URL; only http(s) links count as a source.
const isLink = u => typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u.trim())
const titles = new Map()
found.forEach(r => (r && Array.isArray(r.sources) ? r.sources : []).forEach(s => {
  if (s && isLink(s.url) && !titles.has(s.url.trim())) titles.set(s.url.trim(), String(s.title || '').trim())
}))
const raw = {}
ANGLES.forEach((angle, i) => {
  const r = found[i]
  raw[angle.id] = (r && Array.isArray(r.findings) ? r.findings : []).map(f => ({ text: String(f.text || '').trim(), urls: (f.urls || []).filter(isLink).map(u => u.trim()) }))
})
const helpersFailed = ANGLES.filter((_, i) => !found[i]).map(x => x.id)
if (helpersFailed.length) log(`no answer from: ${helpersFailed.join(', ')}`)

phase('Merge')
const MERGED = {
  type: 'object',
  properties: {
    summary: { type: 'array', items: FINDINGS.properties.findings.items },
    games: FINDINGS.properties.findings,
    players: FINDINGS.properties.findings,
    fun: FINDINGS.properties.findings,
  },
  required: ['summary', 'games', 'players', 'fun'],
}
const merged = await agent([
  `Three researchers looked into "${topic}" for a game designer. Their findings, by angle, as JSON:`,
  JSON.stringify(raw, null, 1),
  'Merge them into one report:',
  '- "summary": 3 to 5 sentences, the most useful things across all angles. Each one lists in "urls" the URLs of the findings it rests on.',
  '- "games", "players", "fun": the findings for each angle, with duplicates across angles merged (keep each in the angle it fits best). Keep each finding\'s URLs exactly as given.',
  'Use only URLs that appear above. Drop any finding that has no URL. Add nothing new and no advice about what the game should be.',
].join('\n'), { label: 'merge', phase: 'Merge', schema: MERGED })

// The merge is checked in code, not trusted: a URL no helper cited is removed, and a claim left
// with no source is dropped (it never reaches the report).
const known = new Set([...titles.keys(), ...Object.values(raw).flat().flatMap(f => f.urls)])
const keep = list => (Array.isArray(list) ? list : [])
  .map(f => ({ text: String((f && f.text) || '').replace(/\s+/g, ' ').trim(), urls: [...new Set(((f && f.urls) || []).filter(isLink).map(u => u.trim()).filter(u => known.has(u)))] }))
  .filter(f => f.text)
const sections = {}
let dropped = 0
for (const angle of ANGLES) {
  const all = keep(merged ? merged[angle.id] : raw[angle.id])
  sections[angle.id] = all.filter(f => f.urls.length)
  dropped += all.length - sections[angle.id].length
}
// No merge (the helper died): the summary is each angle's first finding.
let summaryAll = keep(merged ? merged.summary : ANGLES.map(x => sections[x.id][0]).filter(Boolean))
const summary = summaryAll.filter(f => f.urls.length)
dropped += summaryAll.length - summary.length
if (dropped) log(`dropped ${dropped} claim${dropped > 1 ? 's' : ''} with no source`)
const total = ANGLES.reduce((n, x) => n + sections[x.id].length, 0)
if (!total || !summary.length) throw new Error(`no sourced findings to report on "${topic}"`)

// Sources numbered in the order they are first cited, so [n] in the text matches the Sources list.
const numbers = new Map()
const cite = f => f.urls.map(u => {
  if (!numbers.has(u)) numbers.set(u, numbers.size + 1)
  return `[${numbers.get(u)}]`
}).join('')
const line = f => `- ${f.text.replace(/\s*\[\d+\]/g, '')} ${cite(f)}`
const md = [
  `# Research: ${topic}`,
  '',
  'Made by the BMUZ research flow. Every finding cites its sources [n]; claims without a source were left out.',
  '',
  '## Summary',
  ...summary.map(line),
]
for (const angle of ANGLES) md.push('', `## ${angle.heading}`, ...sections[angle.id].map(line))
md.push('', '## Sources', ...[...numbers.entries()].map(([u, n]) => `${n}. ${(titles.get(u) || u).replace(/[\[\]]/g, '')} — ${u}`), '')
const report = md.join('\n')

phase('Write')
const said = await agent([
  `Use the Write tool to create the file ${out} (relative to the current working directory) with exactly the text between the two lines of ===== below, character for character. Change nothing, add nothing.`,
  '=====',
  report,
  '=====',
  'Then reply with just the word written.',
].join('\n'), { label: 'write the report', phase: 'Write', model: 'haiku' })

return { wrote: out, topic, findings: total, summary: summary.length, sources: numbers.size, dropped, helpersFailed, said }
