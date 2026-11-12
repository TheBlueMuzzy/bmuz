export const meta = {
  name: 'research-flow',
  description: 'Discover research: four lenses research one topic of a game idea alone (theme dig, mechanisms or prior art), one merge organises (never chooses), every claim and brick sourced',
  whenToUse: 'Started by the BMUZ engine in a discover pipeline; args { topic, brief, youAre, collected, fears, onIce, constraints, questions, out }',
  phases: [
    { title: 'Diverge', detail: 'Mainstream · Extremes & failures · Outside the field · Disconfirm, each alone' },
    { title: 'Check links', detail: 'every cited link tried; a dead one is dropped with what rested only on it' },
    { title: 'Converge-lite', detail: 'themes, bricks for the shelves, strength, contradictions, fears scoreboard, surprises, probes' },
    { title: 'Write', detail: 'the report file, with its Sources list' },
  ],
}

// The design: framework .planning/research/bmuz-vision/discover-creative-research.md section 6 (the creative
// steps, what the helpers look up per step) and discover-research.md (H1–H26: collect never choose, independent
// helpers, four lenses as the stance, strength marks, contradictions kept, on ice, hopes and fears).
// Discover collects the bricks of a game; Define chooses which to build with. A workflow never holds a taste
// decision: it widens and organises.

// ---- Inputs (pinned by the engine from the talk steps before it) ----
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = { brief: a } } }
a = a || {}
const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const list = v => (Array.isArray(v) ? v : v ? [v] : [])
// A talk step's item is text or an object ({text, his} or a noun's / verb's own fields): as one line of text.
const itemLine = x => (typeof x === 'string' ? text(x) : x && typeof x === 'object' ? text(x.text || Object.entries(x).filter(([k]) => k !== 'his' && k !== 'picked').map(([k, v]) => `${k}: ${list(v).map(text).join(' / ')}`).join(' · ')) : '')
// (F218: Define passes its pitch, a list of {text} items, where Discover passed a line of text)
const brief = list(a.brief).map(itemLine).filter(Boolean).join(' ')
if (!brief) throw new Error('research-flow needs a "brief": the idea in the creative\'s words')
const youAre = list(a.youAre).map(itemLine).filter(Boolean)[0] || ''

// The shelf each brick goes on (DISCOVER.md, section 6(d)), with the shape a brick's line takes there.
const SHELF_FORMS = {
  'Theme': 'one subject note, reference (in or outside games), tone word, or thing players already know about the subject',
  'Nouns': '"<thing> · states: <a> / <b> / <c> · acts on / acted on by: … · wants: … · stopped by: …" (wants and stopped-by only for living things)',
  'Verbs': '"<theme word> → <outcome form>", like "stitch → join two pieces into one": the theme word keeps the fantasy, the outcome form finds the mechanism',
  'Experience goals': 'a situation a player finds themselves in (not a feature), or a fantasy "I want to …"',
  'Mechanism shelf': '"<outcome verb> → <mechanism> → example games: <A>, <B> → teaches: <the skill the player learns>"',
  'Decisions': '"<a choice the player makes> → costs: <its tradeoff>"',
  'Prior art': '"<game> · shares: <which bricks> · praised for: … · complaints / missed: … · hook / anchor: …"',
  'Hooks & anchors': '"Hook: …" (the part players have never seen) or "Anchor: …" (the familiar part they recognise); candidates only',
  'Twists': 'one twist: something taken away, an odd mashup, an extreme, a constraint that sounds fun',
  'Requirements': '"<what the platform needs> · <the details: sizes, limits, fees, how long it takes>", one requirement each, as the platform\'s own current docs say it',
  'Examples': '"<game, product or case> · what it does about the question · how it went"',
}

// BoardGameGeek's mechanics list is not a catalogue (Muzzy, 2026-11-09): not all entries are mechanics, some are
// the same thing twice, the granularity is uneven, and it is wargame-heavy. Private vocabulary only.
const BGG_RULE = 'Never present BoardGameGeek\'s mechanics list as a resource, catalogue, taxonomy or authority, and never cite it for a mechanism: not all its entries are mechanics, some are duplicates, the granularity is uneven, and it is wargame-heavy. You may use its entries privately as vocabulary to think with. For mechanisms cite designer-written sources: Engelstein & Shalev\'s Building Blocks of Tabletop Game Design, the gameplay design patterns wiki (Björk & Holopainen, Chalmers), Raph Koster\'s game grammar, Anthropy & Clark\'s verbs and objects, Dan Cook\'s skill atoms, designers\' own breakdowns of specific games. BoardGameGeek game pages are fine as prior art (what a game is, what players say about it).'

// ---- The three research topics (section 6(c)): what the helpers look for, and where each lens looks ----
const TOPICS = {
  theme: {
    name: 'Theme dig',
    task: 'what the subject really is, in and outside games: its systems, history, textures, tone and conflicts, and what players already know about it. Also, for the simulation breakdown that comes next, the subject\'s real things (nouns) with the states they can be in and what acts on them, what its living things want and what stops them, and the real processes that happen there (verbs)',
    shelves: ['Theme', 'Nouns', 'Verbs', 'Experience goals'],
    questions: [
      `What is "${brief}" really like as a subject: its systems, history, textures and conflicts?`,
      'What things are in this world, what states can they be in, and what acts on them?',
      'How have games used this subject, and what did they keep and drop?',
    ],
    where: {
      mainstream: 'games on the subject: what they kept and what they dropped; how games usually deliver the experience goals',
      extremes: 'the deepest simulations and the most abstract games of the same subject, and where games on it fell flat',
      outside: 'the subject itself, outside games: non-fiction, history, how the real system works, documentaries, hobbyist communities, image references. This is the main lens for a theme dig',
      disconfirm: 'evidence that the hoped-for feeling does not come from this subject or this kind of play',
    },
  },
  mechanisms: {
    name: 'Mechanism shelf',
    task: 'for each outcome verb, 2 to 4 candidate mechanisms designers use to make that outcome playable, 1 to 3 games that use each, and the skill each one teaches the player; plus genres whose verbs already cover part of the idea',
    shelves: ['Mechanism shelf', 'Decisions'],
    questions: null, // made from the verbs, below
    where: {
      mainstream: 'designer-written catalogues and breakdowns: Building Blocks of Tabletop Game Design, the gameplay design patterns wiki, Koster\'s game grammar, Anthropy & Clark, designers\' breakdowns of specific games, genre verb bundles',
      extremes: 'where each mechanism is criticised: a pasted-on theme, degenerate strategies, failed uses',
      outside: 'real-world systems with the same structure (markets for trading, ecology for growth, queues for waiting)',
      disconfirm: 'evidence that a mechanism does not create the wanted behaviour or feeling',
    },
  },
  'prior-art': {
    name: 'Prior art',
    task: 'games that already do this, or part of it: what each shares with the bricks collected, what players praise, what they complain about or say is missing, and the hook (the part players have never seen) and anchor (the familiar part) each uses. Also twists: what taking something away, an odd mashup or an extreme would do',
    shelves: ['Prior art', 'Hooks & anchors', 'Twists'],
    questions: [
      'Which games are closest to this idea, and which of its bricks do they share?',
      'What do players praise in them, and what do they complain about or say is missing?',
      'What hooks and anchors do those games use, and what twists has nobody tried?',
    ],
    where: {
      mainstream: 'Steam tag matches (genre plus themes and moods), store pages, BoardGameGeek and MobyGames game pages (as prior art only), reviews',
      extremes: 'game jam entries (itch.io), postmortems, the oddest and most extreme takes on the idea',
      outside: 'non-game products, toys and media with the same hook',
      disconfirm: '"this already exists and players say it isn\'t fun" evidence: complaints, refunds, abandoned projects',
    },
  },
  // F230: Release's Store & Launch — what one platform needs today before a game goes out there (the brief names the
  // platform). Stores change their rules, so it is researched fresh at release time, from the platform's own docs first.
  release: {
    name: 'Release requirements',
    task: `what ${brief} needs today before a game can be released there: accounts and fees, the store page and its parts (text, images and their sizes, a trailer), the build (formats, limits, the upload), the platform's review and how long it takes, age ratings and data or privacy forms, and the release date`,
    shelves: ['Requirements'],
    questions: [
      `What does ${brief} require today before a game can be released there?`,
      `What does a game's page on ${brief} need: its text, images (with sizes), a trailer?`,
      `What does ${brief}'s review check, how long does it take, and what gets a game refused?`,
    ],
    where: {
      mainstream: `${brief}'s own current documentation and developer help pages`,
      extremes: 'developers\' accounts of rejections, delays and surprises on this platform, the most recent first',
      outside: 'the bodies behind its forms: age ratings, privacy and data rules',
      disconfirm: 'guides that are out of date: rules the platform changed recently, and claims its own current docs contradict',
    },
  },
  // F229: research callable anywhere — the creative's own question, asked at any step of any stage ("what's the research
  // say about this?", a creative block, "has this been done?", a rule that doesn't work, a risk to test). The brief is
  // their question in their words; "game" is the game so far, for context.
  question: {
    name: 'Research question',
    task: 'what is known about the creative\'s question: how games, and the world outside games, have dealt with it, what worked and what went wrong, with examples',
    shelves: ['Examples'],
    questions: [
      `${brief.replace(/[?.!\s]+$/, '')}?`,
      'Which games or designers have dealt with this, and how did it go?',
      'What goes wrong when games try this?',
    ],
    where: {
      mainstream: 'designers\' own writing, postmortems, talks and breakdowns of the games closest to the question',
      extremes: 'the most extreme or unusual answers to the question, and the games where it failed',
      outside: 'the same question outside games: other media, real-world systems, research',
      disconfirm: 'evidence against the obvious answer, and against the assumptions behind the question',
    },
  },
}
const topicId = text(a.topic).toLowerCase()
const topic = TOPICS[topicId]
if (!topic) throw new Error(`research-flow needs a "topic": one of ${Object.keys(TOPICS).join(', ')} (got "${topicId}")`)

// What the talk steps collected so far (the engine pins it): key → list of items.
const collected = a.collected && typeof a.collected === 'object' ? a.collected : {}
const collectedLines = Object.entries(collected)
  .map(([k, v]) => [k, list(v).map(itemLine).filter(Boolean)])
  .filter(([, v]) => v.length)
  .map(([k, v]) => `- ${k}: ${v.join('; ')}`)

// Fears are the creative's important assumptions (H25): the Disconfirm lens starts from them.
const TAGS = ['desirable', 'feasible', 'viable']
const assumptions = [
  ...list(a.fears).map(x => ({ text: itemLine(x), important: true, tag: TAGS.includes(x && x.tag) ? x.tag : 'desirable', fear: true })),
  ...list(a.assumptions).map(x => (typeof x === 'string' ? { text: text(x), important: true, tag: '', fear: false } : { text: text(x && x.text), important: !!(x && (x.important || x.fear)), tag: TAGS.includes(x && x.tag) ? x.tag : '', fear: !!(x && x.fear) })),
].filter(x => x.text)
const important = [...assumptions.filter(x => x.important && x.fear), ...assumptions.filter(x => x.important && !x.fear)]
const label = x => [x.tag, x.fear ? 'a fear' : ''].filter(Boolean).join(', ')
const withLabel = x => `${x.text}${label(x) ? ` (${label(x)})` : ''}`
const onIceIn = list(a.onIce).map(itemLine).filter(Boolean)
const constraints = list(a.constraints).map(itemLine).filter(Boolean)

// The research questions: the creative's own (the theme step's), else the topic's. For mechanisms, one per
// outcome verb ("What mechanisms let a player join two pieces into one?").
const verbOutcomes = list(collected.verbs).map(v => (v && typeof v === 'object' ? text(v.outcome || v.text) : text(v).split('→').pop().trim())).filter(Boolean)
let questions = list(a.questions).map(itemLine).filter(Boolean).slice(0, 5)
if (!questions.length && topicId === 'mechanisms') questions = [...verbOutcomes.slice(0, 4).map(v => `What mechanisms let a player ${v.replace(/\?$/, '')}?`), 'Which genres already bundle several of these verbs?']
if (!questions.length) questions = topic.questions || [`What is already known about "${brief}"?`]

// The report stays inside the project: relative, forward slashes, no "..", a .md file, not in .bmuz.
// (The engine checks the same at its end; a bad path here falls back to the default rather than writing elsewhere.)
const slug = brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'idea'
const isQuestion = topicId === 'question'
const DEFAULT_OUT = isQuestion ? `.planning/research/research-${slug}.md` : `.planning/research/discover-${slug}-${topicId}.md`
// (F229) the game so far, for a question's context; when and where it was asked (the workflow has no clock: the engine
// passes the day)
const game = text(a.game).slice(0, 1500)
const askedOn = /^\d{4}-\d\d-\d\d$/.test(text(a.date)) ? text(a.date) : ''
const askedAt = text(a.place).slice(0, 160)
const safeOut = p => typeof p === 'string' && /\.md$/.test(p) && !/^[\/\\]|^[A-Za-z]:|\\/.test(p) &&
  p.split('/').every(x => x && x !== '..' && x !== '.') && p.split('/')[0].toLowerCase() !== '.bmuz'
let out = a.out
if (!safeOut(out)) {
  if (out) log(`"${out}" isn't a path inside the project; writing ${DEFAULT_OUT} instead`)
  out = DEFAULT_OUT
}

// ---- Stage B: four lenses, fixed by heuristic; the topic only changes where each one looks ----
const LENSES = [
  { id: 'mainstream', name: 'Mainstream', ask: 'how this is usually done: what most examples share' },
  { id: 'extremes', name: 'Extremes & failures', ask: 'the most extreme cases, edge cases, and documented failures or post-mortems (failures are where assumptions break)' },
  { id: 'outside', name: 'Outside the field', ask: 'the same activity or feeling in an unrelated domain, for a fresh view and for things nobody thought to ask' },
  { id: 'disconfirm', name: 'Disconfirm', ask: 'evidence AGAINST the creative\'s fears and important assumptions, starting from their fears (marked "a fear"): look for whether each fear comes true' },
]
const MAX_SOURCES = 6 // per helper: the hard cap beside saturation (H15), kept small so a discover run stays affordable
const PROBES = ['sketch', 'proto', 'spike', 'playtest', 'ask the creative']

const URLS = { type: 'array', items: { type: 'string' } }
const BRICK = { type: 'object', properties: { shelf: { type: 'string', enum: topic.shelves }, text: { type: 'string' }, urls: URLS }, required: ['shelf', 'text', 'urls'] }
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
    bricks: { type: 'array', items: BRICK },
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
      items: { type: 'object', properties: { question: { type: 'string' }, probe: { type: 'string', enum: PROBES }, timebox: { type: 'string' }, why: { type: 'string' } }, required: ['question', 'probe', 'timebox', 'why'] },
    },
    onIce: { type: 'array', items: { type: 'string' } },
    saturation: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' } }, required: ['url', 'title'] } },
  },
  required: ['notes', 'bricks', 'assumptions', 'open', 'onIce', 'saturation', 'sources'],
}

const numbered = xs => xs.map((x, i) => `${i + 1}. ${x}`).join('\n')
const frame = [
  isQuestion
    ? 'A creative (a game designer, not an engineer) is making a game, and in the middle of a step they asked a research question. Find what is known, from sources. What to do with it is theirs to decide.'
    : 'A creative (a game designer, not an engineer) is in the Discover stage of a new game: collecting the building blocks ("bricks") of the game before anyone chooses which to build with. Choosing is the next stage, Define, and it is theirs.',
  isQuestion ? `Their question, in their words: "${brief}"` : `The idea, in their words: "${brief}"`,
  game ? `The game so far: ${game}` : '',
  youAre ? `Who the player is: "${youAre}"` : '',
  collectedLines.length ? `Bricks collected so far in this run (the creative's and Claude's, from the talk steps):\n${collectedLines.join('\n')}` : '',
  constraints.length ? `It must fit / off the table: ${constraints.join('; ')}.` : '',
  `This research: ${topic.name} — ${topic.task}.`,
  `Research questions (the numbers are "q" in your notes):\n${numbered(questions)}`,
  important.length ? `The creative's fears and important assumptions: things to TEST, not take as true (the numbers are "n"):\n${numbered(important.map(withLabel))}` : 'The creative named no fears or important assumptions.',
  'MDA\'s "Aesthetics" means the feelings a game evokes in players (Sensation, Fantasy, Narrative, Challenge, Fellowship, Discovery, Expression, Submission); keep it apart from look and feel.',
].filter(Boolean).join('\n')

const shelfRules = topic.shelves.map(s => `  - ${s}: ${SHELF_FORMS[s]}`).join('\n')
const helperPrompt = lens => [
  frame,
  '',
  `Your lens: ${lens.name} — ${lens.ask}. For this research, look in: ${topic.where[lens.id]}.`,
  'You work alone; other helpers cover other lenses. Answer every research question you can from your lens.',
  'Use WebSearch to find sources and WebFetch to open the pages you rely on (if they are not loaded yet, load them with ToolSearch "select:WebSearch,WebFetch"). Fetch the pages yourself.',
  'Rules:',
  '- Collect widely before you sum up. Never rank, recommend, or say what the creative should do or pick: that is the next stage, and theirs.',
  '- Two columns per note: "says" = what the source says or shows; "means" = what you think it means. Keep them apart.',
  '- Every note and every brick lists the full https URL of each page it comes from. Cite only pages that came back in your searches or that you opened; never make up a URL or guess a page path. What you cannot source, leave out.',
  '- "q" = the research question a note bears on; 0 = none of them (something nobody asked, worth knowing).',
  `- "bricks": building blocks for the creative's shelves, each one line in the shelf's form:\n${shelfRules}\n  Extend what the creative already collected rather than repeat it; a brick already on their list adds nothing.`,
  `- ${BGG_RULE}`,
  `- "assumptions": evidence that supports or contradicts a fear or important assumption, by its number.${lens.id === 'disconfirm' ? ' This is your main job: look hard for evidence AGAINST each one.' : ''}`,
  `- Stop when your last few sources added nothing new, and say so in "saturation" (how many sources, and whether you stopped at "nothing new" or at the cap). Never more than ${MAX_SOURCES} sources.`,
  `- "open": what reading can't answer, as the one question a probe would answer, with the probe (${PROBES.join(' / ')}) and a "timebox" (like "1 hour", "half a day"). A sketch (a throwaway playable toy) for feel, because feel only shows up when played; a proto (a quick rules simulation) for numbers and balance; a spike for a tech unknown (H26). Real players are never imagined by you: what players would feel is a playtest or a question for the creative.`,
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
  const bricks = list(r.bricks).map(b => ({ shelf: topic.shelves.includes(b && b.shelf) ? b.shelf : topic.shelves[0], text: text(b && b.text), urls: urls(b && b.urls).filter(allow) }))
  const ev = list(r.assumptions).map(x => ({ n: Number(x.n) || 0, bears: x.bears === 'contradicts' ? 'contradicts' : 'supports', says: text(x.says), urls: urls(x.urls).filter(allow) }))
  const before = list(r.notes).length + list(r.bricks).length + list(r.assumptions).length
  const kept = [...notes.filter(n => n.says), ...bricks.filter(b => b.text), ...ev.filter(x => x.says)].filter(x => x.urls.length).length
  capped += Math.max(0, before - kept)
  raw[lens.id] = {
    notes: notes.filter(n => n.says && n.urls.length),
    bricks: bricks.filter(b => b.text && b.urls.length),
    assumptions: ev.filter(x => x.says && x.urls.length && x.n >= 1 && x.n <= important.length),
    open: list(r.open).map(o => ({ question: text(o.question), probe: PROBES.includes(o.probe) ? o.probe : 'ask the creative', timebox: text(o.timebox), why: text(o.why) })).filter(o => o.question),
    onIce: list(r.onIce).map(text).filter(Boolean),
    saturation: text(r.saturation) || (found[i] ? 'not said' : 'no answer from this helper'),
  }
})
// ---- F229: dead sources are dropped here, before the report's source check ----
// (The headless discover run of 2026-11-10 BLOCKED: the helpers cited a page that answered 404 and one with an expired
// certificate, and re-cited them on every retry.) The workflow has no network, so one helper runs the source check's
// own link test (check-sources.mjs --dead: the same rules, so what's left passes it) on every cited link. A dead link is
// removed with its [n]; a note, brick or piece of evidence left with no source is dropped and listed as "couldn't
// source". The engine lets a helper run exactly that command, nothing else.
const quote = u => `'${u}'`
const linkCommand = (checker, urls) => `node "${checker}" --dead ${urls.map(quote).join(' ')}`
const checker = typeof a.checker === 'string' && /check-sources\.mjs$/.test(a.checker) && !/["'`$\n\r]/.test(a.checker) ? a.checker : ''
const dead = new Map() // url -> why
const cited = [...new Set([...titles.keys(), ...Object.values(raw).flatMap(r => [...r.notes, ...r.bricks, ...r.assumptions].flatMap(n => n.urls))])]
// (a link with a quote or a space in it can't be passed safely; it is left to the source check. Review fix 7: at most
// LINK_CAP links are tried, the rest left to the source check, marked so in the report)
const LINK_CAP = 60
const passable = cited.filter(u => !/['\s\\]/.test(u))
const checkable = passable.slice(0, LINK_CAP)
const notChecked = cited.filter(u => !checkable.includes(u))
if (notChecked.length && checker) log(`${notChecked.length} link${notChecked.length > 1 ? 's' : ''} not tried here (over the cap of ${LINK_CAP}, or not safe to pass): left to the source check`)
if (!checker) log('no link checker was given: dead links are left to the source check')
else if (checkable.length) {
  phase('Check links')
  const ran = await agent([
    'Run exactly this one command with the Bash tool (timeout 120000), changing nothing in it:',
    linkCommand(checker, checkable),
    'Then give its output, unchanged, as "output". Run nothing else.',
  ].join('\n'), { label: 'check links', phase: 'Check links', model: 'haiku', schema: { type: 'object', properties: { output: { type: 'string' } }, required: ['output'] } })
  const line = String((ran && ran.output) || '').split(/\r?\n/).map(l => l.trim()).reverse().find(l => /^\{"dead"/.test(l))
  let answer = null
  try { answer = JSON.parse(line).dead } catch (e) { answer = null }
  if (!Array.isArray(answer)) log('the link check gave no answer: dead links are left to the source check')
  else for (const d of answer) if (d && checkable.includes(d.url)) dead.set(d.url, text(d.why) || 'dead')
}
const unsourced = [] // what rested only on dead links
if (dead.size) {
  log(`dropped ${dead.size} dead link${dead.size > 1 ? 's' : ''}: ${[...dead.keys()].join(', ')}`)
  for (const r of Object.values(raw)) {
    for (const key of ['notes', 'bricks', 'assumptions']) {
      r[key] = r[key].map(x => ({ ...x, urls: x.urls.filter(u => !dead.has(u)) })).filter(x => {
        if (x.urls.length) return true
        unsourced.push(x.says || x.text)
        return false
      })
    }
  }
  for (const u of dead.keys()) titles.delete(u)
}
const helpersFailed = LENSES.filter((_, i) => !found[i]).map(x => x.id)
if (helpersFailed.length) log(`no answer from: ${helpersFailed.join(', ')}`)
if (capped) log(`left out ${capped} note${capped > 1 ? 's' : ''} or bricks with no source (or past the ${MAX_SOURCES}-source cap)`)
const known = new Set([...titles.keys(), ...Object.values(raw).flatMap(r => [...r.notes, ...r.bricks, ...r.assumptions].flatMap(n => n.urls))])
if (!Object.values(raw).some(r => r.notes.length)) throw new Error(`no sourced findings on "${brief}" (${topic.name})`)

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
    bricks: { type: 'array', items: BRICK },
    contradictions: { type: 'array', items: { type: 'object', properties: { a: SIDE, b: SIDE }, required: ['a', 'b'] } },
    scoreboard: {
      type: 'array',
      items: { type: 'object', properties: { n: { type: 'integer' }, verdict: { type: 'string', enum: ['supported', 'contradicted', 'no evidence'] }, evidence: { type: 'string' }, urls: URLS }, required: ['n', 'verdict', 'evidence', 'urls'] },
    },
    surprises: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, urls: URLS }, required: ['text', 'urls'] } },
    open: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, probe: { type: 'string', enum: PROBES }, timebox: { type: 'string' } }, required: ['question', 'probe', 'timebox'] } },
    onIce: { type: 'array', items: { type: 'string' } },
    hmw: { type: 'array', items: { type: 'string' } },
  },
  required: ['themes', 'bricks', 'contradictions', 'scoreboard', 'surprises', 'open', 'onIce', 'hmw'],
}
const merged = await agent([
  frame,
  '',
  'Four helpers researched this alone, each through one lens. Their notes and bricks, as JSON:',
  JSON.stringify(Object.fromEntries(LENSES.map(l => [l.name, { notes: raw[l.id].notes, bricks: raw[l.id].bricks, assumptions: raw[l.id].assumptions, open: raw[l.id].open, onIce: raw[l.id].onIce }])), null, 1),
  '',
  'Organise them. You never choose: no recommendation, no ranking of options, no scope. Choosing is the next stage.',
  '- "themes": group the notes into themes under each research question ("q", 0 = none). Each claim is one plain sentence a non-engineer can read, with the URLs of the notes it rests on. "interpretation": true when the claim is a helper\'s reading (their "means") rather than what a source says. Combine notes that say the same thing into one claim with all their URLs.',
  '- Each theme gets "soWhat": one draft line for the next stage — the observation plus why it might matter — with the URLs it rests on.',
  `- "bricks": every distinct brick, on its shelf, in the shelf's form:\n${shelfRules}\n  Combine bricks that say the same thing into one with all their URLs. Keep every other brick: collecting, not trimming.`,
  `- ${BGG_RULE}`,
  '- "contradictions": where notes disagree, keep both sides with each side\'s context (who or what the source was looking at). Never average them away.',
  '- "scoreboard": each fear or important assumption by number: supported / contradicted / no evidence, with the evidence and its URLs.',
  '- "surprises": 1 or 2 findings that answer a question nobody asked, with URLs.',
  '- "open": what reading couldn\'t answer, each with its probe and timebox.',
  '- "onIce": solutions and ideas that came up, kept for the next stage.',
  '- "hmw": at most 2 draft "How might we …?" questions with no solution in them, or none.',
  'Use only URLs that appear above. Add nothing new.',
].join('\n'), { label: 'merge', phase: 'Converge-lite', schema: MERGED })

// The merge is checked in code, not trusted: a URL no helper cited is removed, and a claim or brick left with
// no source is dropped. Strength is counted here too (H14): 2+ different sites = several sources.
let dropped = 0
const clean = us => [...new Set(list(us).filter(isLink).map(u => u.trim()).filter(u => known.has(u)))]
// (a regex, not new URL(): the workflow sandbox has no URL, and the fallback counted every link as its own
// site, so two pages from one site were marked "several sources" — first headless run, 2026-11-09)
const host = u => ((String(u).match(/^https?:\/\/([^\/?#:]+)/i) || [])[1] || String(u)).toLowerCase().replace(/^www\./, '')
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
  log('the merge helper gave no answer; the report lists the notes and bricks as they came')
  const notes = Object.values(raw).flatMap(r => r.notes)
  themes = [...new Set(notes.map(n => n.q))].map(q => ({ q, theme: 'Notes from the lenses', claims: notes.filter(n => n.q === q).map(n => ({ text: n.says, urls: n.urls, interpretation: false })), soWhat: null }))
}
if (!themes.length) throw new Error(`no sourced findings on "${brief}" (${topic.name}) after the merge`)
// Bricks: the merge's, checked; without them (or with none left) the lenses' own, so nothing collected is lost.
const brickOf = b => ({ shelf: topic.shelves.includes(b && b.shelf) ? b.shelf : topic.shelves[0], text: text(b && b.text), urls: clean(b && b.urls), interpretation: false })
let bricks = merged ? sourcedOnly(list(merged.bricks).map(brickOf)) : []
if (!bricks.length) bricks = Object.values(raw).flatMap(r => r.bricks).map(brickOf).filter(b => b.text && b.urls.length)
const bricksSeen = new Set()
bricks = bricks.filter(b => {
  const k = `${b.shelf}|${b.text.toLowerCase()}`
  if (bricksSeen.has(k)) return false
  bricksSeen.add(k)
  return true
})
const sides = s => ({ says: text(s && s.says), context: text(s && s.context), urls: clean(s && s.urls) })
const contradictions = merged ? list(merged.contradictions).map(c => ({ a: sides(c.a), b: sides(c.b) })).filter(c => c.a.says && c.b.says && c.a.urls.length && c.b.urls.length) : []
// Every fear and important assumption is on the scoreboard. A verdict with no source left is "no evidence".
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
  return { assumption: x.text, label: label(x), ...v }
})
const surprises = sourcedOnly((merged ? list(merged.surprises) : Object.values(raw).flatMap(r => r.notes).filter(n => n.q === 0).map(n => ({ text: n.says, urls: n.urls }))).map(s => ({ text: text(s.text), urls: clean(s.urls) }))).slice(0, 2)
const probes = new Map()
// The merge folds the lenses' open questions together; their raw lists are used only without a merge
// (adding both gave 24 probes in the first headless run).
const openIn = merged && list(merged.open).length ? list(merged.open) : Object.values(raw).flatMap(r => r.open)
for (const o of openIn) {
  const q = text(o.question)
  if (q && !probes.has(q.toLowerCase())) probes.set(q.toLowerCase(), { question: q, probe: PROBES.includes(o.probe) ? o.probe : 'ask the creative', timebox: text(o.timebox) })
}
const onIce = [
  ...onIceIn.map(x => `${x} (from the creative)`),
  ...[...new Set([...(merged ? list(merged.onIce) : []), ...Object.values(raw).flatMap(r => r.onIce)].map(text).filter(Boolean))].map(x => `${x} (came up in research)`),
]
const soWhats = themes.filter(t => t.soWhat && t.soWhat.text && t.soWhat.urls.length)
const hmw = merged ? list(merged.hmw).map(text).filter(x => /^how might we\b/i.test(x)).slice(0, 2) : []
if (dropped) log(`dropped ${dropped} claim${dropped > 1 ? 's' : ''} or bricks with no source`)

// ---- The report (format checked by plugin/scripts/check-sources.mjs; bricks read back by discover-doc.mjs) ----
const numbers = new Map()
const cite = us => us.map(u => {
  if (!numbers.has(u)) numbers.set(u, numbers.size + 1)
  return `[${numbers.get(u)}]`
}).join('')
const bare = s => s.replace(/\s*\[\d+\]/g, '')
const none = '- none found'
const md = [
  isQuestion ? `# Research: ${brief}` : `# Discover (${topic.name.toLowerCase()}): ${brief}`,
  '',
  ...(isQuestion && (askedOn || askedAt) ? [`Asked${askedOn ? ` on ${askedOn}` : ''}${askedAt ? ` at ${askedAt}` : ''}.`, ''] : []),
  `Made by the BMUZ research flow: four lenses (Mainstream, Extremes & failures, Outside the field, Disconfirm), each working alone, merged after. Strength: (several sources) = two or more different sites agree · (one source) · (interpretation only) = a helper's reading. ${isQuestion ? 'Nothing here is a decision: what to do with it is the creative\'s.' : 'Nothing here is a decision: choosing is /define\'s. The bricks below join the project\'s .planning/DISCOVER.md.'}`,
  '',
  'Where each lens stopped (saturation or the cap):',
  ...LENSES.map(l => `${l.name}: ${raw[l.id].saturation}`),
  ...(checker && notChecked.length ? [`Links not tried before the source check: ${notChecked.length} (over the cap of ${LINK_CAP}, or not safe to pass)`] : []),
  '',
  '## Question',
  `- Research: ${topic.name} — ${topic.task}`,
  `- The idea, in the creative's words: ${brief}`,
  ...(youAre ? [`- Who the player is: ${youAre}`] : []),
  `- Must fit / off the table: ${constraints.length ? constraints.join('; ') : 'none named'}`,
  `- Fears and assumptions: ${assumptions.length ? assumptions.map(x => `"${x.text}" (${[x.important ? 'important' : 'not important', label(x)].filter(Boolean).join(', ')})`).join('; ') : 'none named'}`,
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
// Bricks by shelf, each with its sources and strength, like a finding (the source check holds them to the same rule).
md.push('', '## Bricks')
for (const shelf of topic.shelves) {
  const on = bricks.filter(b => b.shelf === shelf)
  md.push(`### ${shelf}`, ...(on.length ? on.map(b => `- ${bare(b.text)} ${cite(b.urls)} (${strength(b)})`) : [none]))
}
md.push('', '## Contradictions', ...(contradictions.length ? contradictions.map(c => `- ${bare(c.a.says)} ${cite(c.a.urls)} (context: ${c.a.context || 'not said'}) — but ${bare(c.b.says)} ${cite(c.b.urls)} (context: ${c.b.context || 'not said'})`) : [none]))
const count = v => scoreboard.filter(s => s.verdict === v).length
md.push('', '## Assumption scoreboard')
if (scoreboard.length) {
  md.push(`${count('supported')} supported · ${count('contradicted')} contradicted · ${count('no evidence')} no evidence`)
  const tagged = s => `"${s.assumption}"${s.label ? ` (${s.label})` : ''}`
  for (const s of scoreboard) md.push(s.verdict === 'no evidence' ? `- No evidence: ${tagged(s)}` : `- ${s.verdict === 'supported' ? 'Supported' : 'Contradicted'}: ${tagged(s)} — ${bare(s.evidence)} ${cite(s.urls)}`)
} else md.push('- none: the creative named no fears or important assumptions')
md.push('', '## Surprises', ...(surprises.length ? surprises.map(s => `- ${bare(s.text)} ${cite(s.urls)}`) : [none]))
// Each probe answers one question in a timebox (H26): a sketch for feel, a proto for numbers, a spike for tech.
md.push('', '## Open questions → probes', ...(probes.size ? [...probes.values()].map(o => `- ${o.question} → ${o.probe}${o.timebox ? ` (timebox: ${o.timebox})` : ''}`) : [none]))
md.push('', '## On ice', ...(onIce.length ? onIce.map(x => `- ${x}`) : ['- none']))
md.push('', isQuestion ? '## So what' : '## So what (draft for Define)', ...(soWhats.length ? soWhats.map(t => `- ${bare(t.theme)}: ${bare(t.soWhat.text)} ${cite(t.soWhat.urls)}`) : ['- none drafted']))
if (hmw.length) md.push('', ...hmw.map(h => `Draft for Define: ${h}`))
// (F229) what the dead links took with them: no [n], so the source check holds nothing here to a source
if (dead.size) {
  md.push('', '## Couldn\'t source', 'Dead links, dropped: ' + [...dead.entries()].map(([u, why]) => `${u} (${why})`).join(' · '))
  md.push(...(unsourced.length ? [...new Set(unsourced.map(bare))].map(x => `- ${x} (its only sources were dead links)`) : ['- nothing else rested only on them']))
}
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
  wrote: out, topic: topicId, brief, findings, bricks: bricks.length, sources: numbers.size, dropped, capped, deadLinks: dead.size, unsourced: unsourced.length,
  scoreboard: { supported: count('supported'), contradicted: count('contradicted'), noEvidence: count('no evidence'), contradictedNames: scoreboard.filter(s => s.verdict === 'contradicted').map(s => s.assumption) },
  surprises: surprises.length, probes: probes.size, helpersFailed, said,
}
