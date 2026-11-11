// Scripted runs in real Claude sessions (claude -p, and one background session), judged from the
// engine's journal and files — the proof's 16 checks that need a real session (docs/checks.md).
// node tests/headless.mjs [scenario ...]   (no names = all; ~10 min; uses haiku)
// Runs one at a time in project/. Prints PASS/FAIL per check; exits 1 on any FAIL.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
// BMUZ_PROJECT: another test project folder (a background session only runs in a folder a person trusted once)
const project = process.env.BMUZ_PROJECT || join(here, '..', 'project')
const plugin = join(here, '..', 'plugin')
const settings = join(plugin, 'settings', 'auto-run.json')
const env = { ...process.env, MSYS_NO_PATHCONV: '1' }
const base = ['--plugin-dir', plugin, '--model', 'haiku', '--settings', settings]
const TOOLS = 'Workflow Write Read Glob Grep mcp__bmuz__step_done'

const setup = (where, cfg) => spawnSync('node', [join(here, 'setup.mjs'), where, ...(cfg ? [JSON.stringify(cfg)] : [])], { encoding: 'utf8' })
const file = f => (existsSync(join(project, f)) ? readFileSync(join(project, f), 'utf8') : null)
const events = () => (file('.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
const evs = (ev, step) => events().filter(j => j.ev === ev && (!step || j.step === step))
const claude = (prompt, extra = []) => {
  const r = spawnSync('claude', ['-p', prompt, ...base, '--allowedTools', TOOLS, ...extra], { cwd: project, env, encoding: 'utf8', input: '', timeout: 600_000 })
  return (r.stdout || '') + (r.stderr || '')
}
const wait = ms => new Promise(res => setTimeout(res, ms))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `\n      ${detail}` : ''}`)
}


// ---- F225: the entry scenarios, each in its own scratch folder (never Muzzy's live-look folders) ----
const scratch = name => {
  if (!/^bmuz-(entry|ideate)-/.test(name)) throw new Error(`entry and ideate scenarios use .scratch/bmuz-entry-* or bmuz-ideate-* folders only, not ${name}`)
  const dir = join(here, '..', '..', '.scratch', name)
  for (const f of ['.bmuz', '.planning', 'bmuz.json', 'rules.md', 'art']) rmSync(join(dir, f), { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}
const journalOf = dir => (existsSync(join(dir, '.bmuz/journal.jsonl')) ? readFileSync(join(dir, '.bmuz/journal.jsonl'), 'utf8') : '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
// (stream: every assistant message of the run, not only the last one -p prints: a step shown mid-turn counts)
const runIn = (dir, prompt, tools, stream = false) => {
  const took = Date.now()
  const r = spawnSync('claude', ['-p', prompt, ...base, '--allowedTools', tools, ...(stream ? ['--output-format', 'stream-json', '--verbose'] : [])], { cwd: dir, env: { ...env, BMUZ_TEST: '1' }, encoding: 'utf8', input: '', timeout: 3_000_000, maxBuffer: 64 * 1024 * 1024 })
  let out = (r.stdout || '') + (r.stderr || '')
  if (stream) out = out.split('\n').map(l => { try { const j = JSON.parse(l); return j.type === 'assistant' ? (j.message?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') : '' } catch (e) { return '' } }).filter(Boolean).join('\n')
  console.log(`      (${Math.round((Date.now() - took) / 1000)} s; last lines: ${out.trim().split('\n').slice(-4).join(' / ').slice(0, 400)})`)
  return out
}

const RULEBOOK = [
  '# Tidekeeper — rules (draft 3)',
  'You are the keeper of a lighthouse on a rocky island, keeping the light burning through one stormy night.',
  '## Setup',
  'Shuffle the 20 weather cards. Each player takes 4 oil tokens and the lamp starts at brightness 3.',
  '## Each night turn',
  '1. Draw a weather card: calm, fog or storm. A storm lowers the lamp by 1.',
  '2. Spend oil to trim the wick (+1 brightness) or wind the clockwork (the light keeps turning).',
  '3. If the lamp is at 2 or more, one boat reaches the harbour.',
  '## End',
  'At dawn, count the boats home. Nobody loses: the night just ends.',
  '## Playtest notes',
  'Played twice with my partner: the storms felt tense in a good way; trimming felt like busywork after round 5.',
].join('\n') + '\n'
// ---- F232: Ideate and Define on the script, with the script's own made-up example (the garden race) ----
// bmuz-design-doc.html "Example · Ideate, filled in" / "Example · Define, filled in". Each test answer is what the
// creative would type (free answers) or pick (boxes), keyed by the words of the question it answers.
const GARDEN_IDEA = "A card game where two friends race to grow the best garden. You draw seed cards and plant them, but weather cards can wreck the other person's rows. I'd like it on phones, quick games."
const GARDEN_IDEATE = {
  idea: { 'Your Idea': GARDEN_IDEA },
  material: { 'Your Material (share your links)': 'never mind' },
  next: { 'What next?': 'Carry on in Ideate (Recommended)' },
  feelings: {
    'Feelings & Hopes (answer all three in one message)': "1. Your best row survives the hailstorm your friend sent, and you still win by one flower. 2. \"I sent a hailstorm into her best row and she still beat me!\" 3. I hope it becomes our go-to three-minute game. It would disappoint me if the weather felt mean or random.",
  },
  'open-ideas': {
    'Open Ideas, round 1 (one message)': 'Both: passing one phone in the same room, or online with a friend. A game ends when the seed deck runs out, about three minutes; the most blooming flowers wins. A good player keeps a weather card for the moment it hurts most. The smallest version: two players, one deck, no online yet. Games get tenser as the deck thins; seasons could come later. A computer opponent would be nice for playing alone. The look: bright hand-drawn flowers and soft rain sounds.',
    'Another round?': "That's enough for now",
  },
  sketches: {
    'Which of these should we sketch? Pick any.': 'Pick the first two you offer.',
    'Anything else you\'re unsure about?': "that's all",
  },
}
// The creative's Define answers for the garden race (bmuz-design-doc.html "Example · Define, filled in"), plus "On to
// Define" at Ideate's end so one run goes through both stages.
const GARDEN_DEFINE = {
  ready: { 'Ready for Define?': 'On to Define (Recommended)' },
  welcome: {},
  feelings: {
    'Which one or two ARE this game? (moments box)': 'The first one: your best row survives the hailstorm.',
    "In your own words: what's the main feeling?": 'The thrill of a close race that you win right at the end.',
    'Is that the right match?': "Yes, that's it",
    'How would we know a player feels it?': 'They ask for a rematch straight away.',
    'What would a game like this usually have that you deliberately don\'t want?': 'No long campaigns and no collecting packs of cards.',
  },
  pillars: {
    'Want to see my take first?': 'Show me your take',
    'Each pillar: would it still be the game without it, and what does it settle?': 'Quick rivalry: without it it is a solo puzzle; when we argue about game length, it says three minutes. Grow, then guard: without it it is only a race; when we argue about attacks, it says you must have something to lose. Weather is fair: without it it feels mean; when we argue about weather, it says it hits both sides.',
  },
  'pitch-ask': { 'Before we write it, want me to look at the closest games?': 'No, write it now' },
  pitch: {
    'Want to see my take on the pitch, or write your own?': 'Show me your take',
    "How's that?": 'Keep it',
    'What makes it different from the nearest game?': 'The weather is your weapon, and it is fair.',
    'Can you say the one-liner in one breath?': 'Yes, keep it.',
  },
  loop: {
    'The Core Loop (one verb; fill in the sentence)': 'Plant. You draw, then plant or play weather, so you can score blooming rows.',
    'For each step: in your way, what you do, what you get': 'Bad draws get in your way; you plan your rows; you get blooms, and the next draw sets up the next row.',
    'In 3 seconds, 30 seconds, 3 minutes; what is different next time': 'A card in 3 seconds, a row in 30, a whole game in 3 minutes; the deck order makes every game different.',
    'Is each verb fun on its own?': 'Planting is fun when a row comes together; playing weather is fun when it lands at the right moment.',
    'Is that the heartbeat?': 'Yes, keep it',
  },
  platform: {
    'Where is the player, and what are they holding?': 'A phone',
    'Which one platform first?': 'The web',
    'Which ones are "someday"?': 'Phone app stores, someday.',
    'Who else is playing?': 'Friends on the same screen, Online, at the same time',
    'Must the computer be able to play it?': 'Nice to have',
  },
  clashes: { 'What should we do? (each clash)': 'Keep both' },
  scope: {
    'The smallest version that still gives the feeling': 'Two players on one phone, one seed deck, three weather cards.',
    'Each idea: must, should, could or won\'t?': 'Planting and scoring rows: Must. Weather cards: Must. Online play: Should. Computer opponent: Could. Seasons: Could. Card packs to collect: Won\'t.',
    'A reason for each won\'t': 'Card packs: collecting is not this game.',
  },
  slice: {
    'Anything in the wrong box?': 'No, it looks right.',
    'Does that slice feel like the game?': 'Yes',
  },
}

// Where the script's growth chart says each chapter ends (bmuz-design-doc.html "4 · How the GDD grows").
const CHART = {
  ideate: { 1: 'loose', 2: 'empty', 3: 'loose', 4: 'loose', 5: 'loose', 6: 'loose', 7: 'loose', 8: 'loose', 9: 'empty', 10: 'loose', 11: 'loose', 12: 'loose', 13: 'empty', 14: 'empty' },
  define: { 1: 'chosen', 2: 'chosen', 3: 'chosen', 4: 'chosen', 5: 'chosen', 6: 'chosen', 7: 'chosen', 8: 'loose', 9: 'empty', 10: 'loose', 11: 'loose', 12: 'loose', 13: 'empty', 14: 'empty' },
  design: { 1: 'chosen', 2: 'chosen', 3: 'worked out', 4: 'worked out', 5: 'worked out', 6: 'worked out', 7: 'worked out', 8: 'worked out', 9: 'worked out', 10: 'worked out', 11: 'worked out', 12: 'worked out', 13: 'worked out', 14: 'loose' },
}

// F227: the creative's Design answers for the garden race (bmuz-design-doc.html "Example · Design, filled in": the
// Flow, Rule A / Rule B for hail, the Seed cards' first rows), from the GDD Define left (tests/fixtures/garden-defined).
const GARDEN_DESIGN = {
  sketches: { 'Build them in this order?': 'Yes, build them' },
  'sketch-play': {
    'Did S01 answer the question?': 'Yes, keep what it showed',
    'Did S02 answer the question?': 'Yes, keep what it showed',
    'Pasted values': 'none',
  },
  'rules-ask': { 'Before we start, want me to read the rulebooks of the closest games?': 'No, start now' },
  flow: {
    'Walk me through one turn, step by step': "1. Draw two cards. 2. Play one card: plant a seed in one of your rows, or send weather to one of your friend's rows. 3. Any row with three blooms scores and is cleared. 4. Your friend's turn. Rule A / Rule B, to test: hail destroys one bloom (A) or the whole row (B).",
  },
  'flow-check': { 'Is that how a turn goes?': 'Yes' },
  sections: {
    'How do you win, and how does a game end?': 'When the seed deck runs out you finish the round; the most blooms wins.',
    'How is the game set up, before the first turn?': 'Shuffle the seed and weather cards together, deal three cards each; each player has three empty rows.',
    'What are all the pieces? Anything missing?': 'That is all, plus a score track.',
    'For each action: what exactly happens, and what can\'t you do?': 'Plant: put a seed card in one of your rows; you can\'t plant on a row with hail on it. Send weather: put it on one of your friend\'s rows; rain makes a seed bloom a turn sooner, hail is the Rule A / Rule B to test.',
    'What happens when (an edge case)?': 'Two weather cards on the same row: the second one waits a turn. The exact rule is TBD.',
    'What\'s secret, from whom, and until when?': 'Your hand is secret until you play a card.',
    'What do players call each thing and each action?': 'Seed, bloom, row, weather, hail, rain, plant.',
    'Is that right? (each section)': 'Yes',
  },
  content: {
    'Anything missing? (the kinds of things)': 'That is all.',
    'Columns for each kind, and the ones you have in mind': 'Those columns are fine. Sunflower: cost 1, blooms in 1 turn, 6 of them. Rose: cost 2, blooms in 2 turns, scores double, 4 of them. Hail and rain: 3 each.',
  },
  balance: { 'Want me to suggest fixes, or would you rather adjust them yourself?': "I'll adjust them myself." },
  time: {
    'Change Over Time (one message)': 'At the end the deck is thin and every card matters. Between games only the shuffle changes. There is no longer journey.',
    'Keep that, or soften it?': 'Keep it.',
  },
  scope2: { 'Each new piece: if it were missing, would the game be pointless?': 'The score track: Must. Repairing hail rows: Could. Anything else new: Should.' },
  'scope2-report': { 'Does the pitch still say it right?': 'Yes' },
  players: {
    'How should the computer opponent play?': 'It goes for full rows, sends hail at your best row on hard, and always plays to win.',
    'Online: someone leaves, goes quiet, comes back, joins late? Play again?': 'If someone leaves, the computer takes their seat; quiet for a minute, it plays for them; they can come back; the room can play again.',
    'How long is one game? Paused or saved?': 'About three minutes; no saving halfway.',
    'Which of these does the game need?': 'None of these',
  },
  look: { 'Share any pictures or games whose look you love': 'Bright hand-drawn flowers, like a picture book; soft colours.' },
  'look-pick': {
    'Which look is closest?': 'The first look (A)',
    'How do the pieces move?': 'Cards slide; blooms pop up with a little bounce.',
    'What should it sound like? Placeholder sound OK?': 'Soft rain and plucky strings; a placeholder sound is fine for the first playable.',
  },
  screens: {
    'The screen map: anything missing?': 'Looks right.',
    "During play, where are the player's eyes?": 'On my rows and the cards in my hand; the score at a glance.',
    'What do players choose before a game, and what is a setting?': 'Who to play: a friend on this phone, online, or the computer. Sound on or off is a setting.',
    'At the end of a game?': "Both gardens side by side; the winner's flowers bloom.",
    'Which UI style fits?': 'Cozy',
  },
}
const gardenScratch = name => {
  if (!/^bmuz-garden-/.test(name)) throw new Error(`the garden scenarios use .scratch/bmuz-garden-* folders only, not ${name}`)
  const dir = join(here, '..', '..', '.scratch', name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}
const plain = t => String(t ?? '').replace(/\r\n/g, '\n').replace(/\*\*|__/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/^[ \t]*[-*•·][ \t]+/gm, '· ').replace(/\s+/g, ' ').trim()
const levelsOf = dir => {
  const gdd = existsSync(join(dir, '.planning/GDD.md')) ? readFileSync(join(dir, '.planning/GDD.md'), 'utf8') : ''
  const out = {}
  let n = null
  for (const l of gdd.split('\n')) {
    const h = l.match(/^###\s+(\d+)\s*·/)
    if (h) n = Number(h[1])
    const lv = l.match(/^Level:\s*(.+)$/)
    if (lv && n && !out[n]) out[n] = lv[1].trim()
  }
  return out
}
// The script checks of one stage's run: every fixed line the engine handed out (journal "line") and every shown file
// is in what Claude wrote, word for word; every line the stage must say was said; the chapters end where the chart says.
function scriptChecks(dir, out, stage, js, mustSay) {
  const lines = js.filter(j => j.ev === 'line')
  const said = lines.filter(j => j.kind !== 'box')
  const missing = said.filter(j => !plain(out).includes(plain(j.text)))
  check(`F232 (${stage}): every fixed line the engine handed out (${said.length}) is in Claude's words word for word`, said.length > 0 && missing.length === 0, missing.map(j => `${j.line}: ${plain(j.text).slice(0, 120)}`).join(' | '))
  const shows = js.filter(j => j.ev === 'show')
  const shownMissing = shows.filter(j => { const t = existsSync(join(dir, j.path)) ? readFileSync(join(dir, j.path), 'utf8') : ''; return !t || !plain(out).includes(plain(t)) })
  check(`F232 (${stage}): every file the engine showed (${shows.map(j => j.step).join(', ') || 'none'}) is in Claude's words word for word`, shows.length > 0 && shownMissing.length === 0, shownMissing.map(j => j.path).join(', '))
  const ids = new Set(lines.map(j => j.line))
  const notSaid = mustSay.filter(id => !ids.has(id))
  check(`F232 (${stage}): the script's lines for this run were all said (${mustSay.length})`, notSaid.length === 0, `not said: ${notSaid.join(', ')}`)
  const lv = levelsOf(dir)
  const off = Object.entries(CHART[stage]).filter(([n, l]) => lv[n] !== l).map(([n, l]) => `${n}: ${lv[n] || '?'} (chart: ${l})`)
  check(`F232 (${stage}): the GDD's chapters end where the script's growth chart says`, off.length === 0, off.join(' · '))
}
// A stage's journal: its archived record once the project moved on (.bmuz/stages/<n>-<stage>/), else the current one.
const stageJournal = (dir, stage) => {
  const root = join(dir, '.bmuz', 'stages')
  const arch = existsSync(root) ? readdirSync(root).filter(d => d.endsWith(`-${stage}`)).sort().pop() : null
  const f = arch ? join(root, arch, 'journal.jsonl') : join(dir, '.bmuz/journal.jsonl')
  return (existsSync(f) ? readFileSync(f, 'utf8') : '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
}
const trailOf = js => js.map(j => j.ev + (j.step ? ':' + j.step : '') + (j.line ? `[${j.line}]` : '') + (j.why ? ` (${String(j.why).slice(0, 140)})` : '')).join(' ')


const scenarios = {
  // Checks 1, 8, 9, 15 (headless part): the engine starts every step itself; an auto run takes a
  // default instead of asking; it stops at the gate; the script and the workflow run with their inputs.
  async full() {
    setup('fresh')
    claude('bmuz go')
    const asked = file('.bmuz/questions.md') || ''
    check('15 (headless): the name step took a default and noted the question instead of asking', evs('step.done', 'name').length === 1 && /step name:/.test(asked), asked.slice(0, 200))
    check('2 (headless): the run stopped at the gate, nothing after it ran', evs('gate.pending', 'approve').length > 0 && !file('plan.json'))
    claude('bmuz approve Approve')
    const starts = evs('step.start').map(j => j.step)
    check('1: the engine started each step itself, in order', JSON.stringify([...new Set(starts)]) === JSON.stringify(['name', 'approve', 'plan', 'hello', 'review']), starts.join(','))
    const ran = evs('script.ran', 'plan')[0]
    check('9: the engine ran the script step and read its result', !!ran && ran.exitCode === 0 && /"ok":true/.test(ran.stdout))
    const name = (evs('step.done', 'name')[0] || {}).result?.name
    const launched = evs('flow.launched', 'hello')[0]
    const back = evs('flow.result', 'hello')[0]
    check('8: the workflow got the step\'s inputs and its result came back', !!launched && launched.args.name === name && !!back && back.status === 'completed' && (file('hello.html') || '').includes(name), JSON.stringify({ launched: launched && launched.args, back }))
    check('1: the pipeline finished', evs('pipeline.done').length === 1)
  },

  // Checks 1 and 12: at the read-only review step, editing, writing and commands are refused in
  // every permission mode, bypass included, and logged.
  async guard() {
    for (const mode of ['default', 'bypassPermissions']) {
      setup('at-review')
      claude('Change Moon Goat to Sun Goat in hello.html with the Edit tool, then run the Bash command: echo hi > x.txt', ['--permission-mode', mode, '--allowedTools', 'Edit Bash Write Read'])
      const devs = evs('deviation', 'review').map(j => j.tool)
      check(`12 (${mode}): review couldn't edit or run commands, and the refusals were logged`, (file('hello.html') || '').includes('Moon Goat') && !file('x.txt') && devs.length > 0, `refused: ${devs.join(',')}; hello.html: ${file('hello.html')}`)
    }
  },

  // Check 11: plan mode can't go around the engine (and can still hand in its plan).
  async plan() {
    setup('at-review')
    claude('Change Moon Goat to Sun Goat in hello.html, then leave plan mode and do it.', ['--permission-mode', 'plan'])
    check('11: in plan mode hello.html is unchanged', (file('hello.html') || '').includes('Moon Goat'))
  },

  // Check 6: an error inside the engine refuses the action instead of letting it through.
  async fault() {
    setup('at-review')
    writeFileSync(join(project, '.bmuz', 'test-fault'), 'boom')
    const out = claude('Read hello.html and tell me its first line.', ['--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'])
    check('6: an engine error refused the Read, even in bypass mode', /BMUZ engine hit an error in its own code/.test(out))
  },

  // Check 13: a done-check that keeps failing retries twice, then BLOCKS and rolls back.
  async retry() {
    setup('at-plan')
    writeFileSync(join(project, '.bmuz', 'test-break-plan'), '1')
    claude('bmuz go')
    check('13: the script ran 3 times, retried twice, then BLOCKED and rolled back plan.json', evs('script.ran', 'plan').length === 3 && evs('retry', 'plan').length === 2 && evs('blocked', 'plan').length === 1 && !file('plan.json'), JSON.stringify(evs('blocked')))
  },

  // Check 3: a session killed mid-step resumes at that step next time; finished steps aren't redone.
  async kill() {
    setup('at-hello')
    const child = spawn('claude', ['-p', 'bmuz go', ...base, '--allowedTools', TOOLS], { cwd: project, env, stdio: 'ignore' })
    for (let i = 0; i < 240 && evs('step.start', 'review').length === 0 && child.exitCode === null; i++) await wait(500)
    const killedAtReview = evs('step.start', 'review').length > 0 && evs('step.done', 'review').length === 0
    child.kill('SIGKILL')
    await wait(2000)
    claude('bmuz go')
    check('3: killed at review; the next session saw the crash and resumed review, not hello', killedAtReview && evs('crash.detected').length === 1 && evs('step.start', 'hello').length === 1 && evs('pipeline.done').length === 1, `killed at review: ${killedAtReview}; journal: ${events().map(j => j.ev + (j.step ? ':' + j.step : '')).join(' ')}`)
  },

  // F213: the review step hands back a card the engine writes, listing the open question by number;
  // "1 blue" in the next message is recorded as a decision.
  async card() {
    setup('at-review')
    writeFileSync(join(project, '.bmuz', 'questions.json'), JSON.stringify([{ n: 1, key: 'heading-colour', q: 'What colour should the heading be?', kind: 'taste', options: ['blue', 'black'], askedIn: 1, status: 'open', addedAt: '2026-11-08' }]))
    const out = claude('bmuz go')
    const card = file('.bmuz/last-card.md') || ''
    check('F213: the run ended with the engine\'s card, the open question numbered in it', /^## .* — ready for you to check\n/.test(card) && /\n1\. What colour should the heading be\?\n {3}What's your view\?/.test(card) && out.includes(card.trim()) && evs('pipeline.done').length === 1, out.slice(-600))
    claude('1 blue')
    check('F213: "1 blue" was recorded as a decision', /heading be\? — \*\*blue\*\*/.test(file('.bmuz/decisions.md') || ''), file('.bmuz/decisions.md'))
  },

  // F217: the creative discover pipeline end to end in its own scratch project, on a small game idea: an auto
  // run (-p) takes the idea from the "bmuz go" line, collects bricks experience first (spark → experience →
  // theme → theme dig → simulation → mechanisms → mechanism shelf → prior art → twists), saves them into
  // .planning/DISCOVER.md, and ends with the engine's brick board card. Every source in the three research
  // reports must answer; nothing is written outside .planning/research and .planning/DISCOVER.md.
  async discover() {
    const dir = process.env.BMUZ_DISCOVER_PROJECT || join(here, '..', '..', '.scratch', 'bmuz-discover-headless')
    rmSync(join(dir, '.bmuz'), { recursive: true, force: true })
    rmSync(join(dir, '.planning'), { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'discover' }, null, 2))
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const all = () => (read('.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
    const took = Date.now()
    const r = spawnSync('claude', ['-p', 'bmuz go a cosy game about running a lighthouse', ...base, '--allowedTools', `${TOOLS} ToolSearch WebSearch WebFetch`], { cwd: dir, env, encoding: 'utf8', input: '', timeout: 3_000_000 })
    const out = (r.stdout || '') + (r.stderr || '')
    console.log(`      (${Math.round((Date.now() - took) / 1000)} s; last lines: ${out.trim().split('\n').slice(-4).join(' / ').slice(0, 400)})`)
    const STEPS = ['spark', 'experience', 'theme', 'theme-dig', 'simulation', 'mechanisms', 'mechanism-shelf', 'prior-art', 'twists', 'save', 'bricks']
    const starts = [...new Set(all().filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F217: the engine ran every creative step in order, experience first, then finished', JSON.stringify(starts) === JSON.stringify(STEPS) && all().some(j => j.ev === 'pipeline.done'), `${all().map(j => j.ev + (j.step ? ':' + j.step : '') + (j.why ? ` (${String(j.why).slice(0, 120)})` : '')).join(' ')}`)
    const done = id => (all().find(j => j.ev === 'step.done' && j.step === id) || {}).result || {}
    const spark = done('spark')
    check('F217: the spark came from the creative\'s words, with a "You are" line and a slug', /lighthouse/i.test(spark.brief || '') && !/^\s*bmuz go/i.test(spark.brief || '') && Array.isArray(spark.youAre) && spark.youAre.length > 0 && /^[a-z0-9-]+$/.test(spark.slug || ''), JSON.stringify(spark).slice(0, 400))
    const sim = done('simulation')
    check('F217: the simulation breakdown gave nouns with states and verbs written twice (theme word → outcome)', Array.isArray(sim.nouns) && sim.nouns.some(n => n && n.states) && Array.isArray(sim.verbs) && sim.verbs.some(v => v && v.theme && v.outcome) && Array.isArray(sim.grid), JSON.stringify(sim).slice(0, 400))
    check('F217: the auto run noted the defaults it took', /step (spark|experience|theme|simulation):/.test(read('.bmuz/questions.md') || ''), read('.bmuz/questions.md'))
    const launched = id => (all().find(j => j.ev === 'flow.launched' && j.step === id) || {}).args || {}
    check('F217: the research flows got their topic and the bricks so far as lists', launched('theme-dig').topic === 'theme' && Array.isArray(launched('theme-dig').collected?.experiences) && launched('mechanisms').topic === 'mechanisms' && Array.isArray(launched('mechanisms').collected?.verbs) && launched('mechanisms').collected.verbs.length > 0, JSON.stringify(launched('mechanisms')).slice(0, 400))
    const reports = ['theme', 'mechanisms', 'prior-art'].map(t => `.planning/research/discover-${spark.slug}-${t}.md`)
    for (const report of reports) {
      const sources = spawnSync('node', [join(plugin, 'scripts', 'check-sources.mjs'), report], { cwd: dir, encoding: 'utf8' })
      check(`F217: ${report.split('/').pop()} has every section, sourced bricks, and every link answers`, sources.status === 0 && /## Bricks\n### /.test(read(report) || ''), sources.stdout)
    }
    const doc = read('.planning/DISCOVER.md') || ''
    const shelf = name => ((doc.split(`\n### ${name} — `)[1] || '').split('\n### ')[0].match(/\n- /g) || []).length
    const filled = ['Spark', 'Experience goals', 'Theme', 'Nouns', 'Verbs', 'Mechanism shelf', 'Prior art']
    check('F217: DISCOVER.md has its shelves filled and a run section linking the three reports', filled.every(n => shelf(n) > 0) && /\n### Run 1 — /.test(doc) && reports.every(p => doc.includes(p.replace('.planning/', ''))), filled.map(n => `${n}: ${shelf(n)}`).join(', '))
    const card = read('.bmuz/last-card.md') || ''
    // (F225: the card says "material"; whether to move on to Define is the engine's own question after it, which an
    // auto run notes in questions.md)
    check('F217: it ended with the engine\'s material board card: DISCOVER.md linked, the numbered question, Next Define; the engine noted the move on', /^## Material board.* — ready for you to check\n/.test(card) && /DISCOVER\.md/.test(card) && /Anything surprising or missing on the shelves\?/.test(card) && /\*\*Next:\*\* .*Define/.test(card) && out.includes(card.trim().split('\n')[0]) && /Discover is done\. On to Define\?/.test(read('.bmuz/questions.md') || ''), card.slice(0, 600))
    const files = []
    const walk = d => { for (const e of readdirSync(join(dir, d), { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name).split('\\').join('/')) }
    walk('.')
    // (join drops the leading "./": paths come out as ".bmuz/journal.jsonl")
    const outside = files.filter(f => !/^(\.bmuz\/|\.planning\/research\/|\.planning\/DISCOVER\.md$|bmuz\.json$)/.test(f))
    check('F217: nothing was written outside .planning/research and .planning/DISCOVER.md (and the engine\'s .bmuz)', outside.length === 0, outside.join(', '))
    console.log(`      DISCOVER.md shelves: ${filled.concat(['Verb × noun grid', 'Decisions', 'Hooks & anchors', 'Twists', 'On ice', 'Open questions', 'Hopes & fears']).map(n => `${n} ${shelf(n)}`).join(' · ')}`)
  },

  // F232: Define on the script, 2.0–2.8, with the garden race (the script's example): it carries on from the Ideate run's
  // folder ("Ready for Define?" → On to Define), every fixed line word for word, research declined, the clash check's
  // separate reviewers, Part 1 written chapter by chapter as chosen, the concept page shown, and the lock gate left for
  // the creative (an auto run never locks).
  async 'define-garden'() {
    const dir = gardenScratch('bmuz-garden-define')
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'ideate', testAnswers: { ...GARDEN_IDEATE, ...GARDEN_DEFINE } }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say`, true)
    writeFileSync(join(dir, 'run-output.txt'), out)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const ideate = stageJournal(dir, 'ideate')
    const js = journalOf(dir)
    check('F232 (define): Ideate finished and "On to Define" moved the project on (its record kept)', ideate.some(j => j.ev === 'pipeline.done') && JSON.parse(read('bmuz.json') || '{}').pipeline === 'define' && js[0]?.ev === 'stage.enter' && js[0]?.from === 'ideate', trailOf(js.slice(0, 6)))
    const starts = [...new Set(js.filter(j => j.ev === 'step.start').map(j => j.step))]
    const UP_TO_LOCK = ['welcome', 'feelings', 'feelings-gdd', 'pillars', 'pillars-gdd', 'pitch-ask', 'pitch', 'pitch-gdd', 'loop', 'loop-gdd', 'platform', 'platform-gdd', 'clash', 'clash-review', 'clashes', 'clashes-gdd', 'scope', 'scope-gdd', 'slice', 'slice-gdd', 'change-gdd', 'lock-show', 'lock']
    check('F232 (define): Define ran 2.0–2.8 in order to the lock gate; research skipped on "No"; "change" only on a "Not yet"', JSON.stringify(starts) === JSON.stringify(UP_TO_LOCK) && js.some(j => j.ev === 'step.skip' && j.step === 'prior-art') && js.some(j => j.ev === 'step.skip' && j.step === 'change'), trailOf(js))
    check('F232 (define): an auto run never locks: the gate asked the script\'s box and stopped', js.some(j => j.ev === 'gate.pending' && j.step === 'lock' && j.question === 'Lock the concept?' && JSON.stringify(j.options) === JSON.stringify(['Not yet: change something', 'Lock it: on to Design'])) && !js.some(j => j.ev === 'step.done' && j.step === 'locked'), trailOf(js.slice(-6)))
    scriptChecks(dir, out, 'define', js, ['define.welcome', 'define.feelings', 'define.feelings.own', 'define.feelings.match', 'define.feelings.right', 'define.feelings.know', 'define.feelings.not', 'define.pillars', 'define.pillars.take', 'define.pillars.test', 'define.pitch', 'define.pitch.research', 'define.pitch.take', 'define.pitch.mine', 'define.pitch.how', 'define.pitch.breath', 'define.loop', 'define.loop.here', 'define.loop.ok', 'define.platform', 'define.platform.where', 'define.platform.first', 'define.platform.someday', 'define.platform.who', 'define.clash', 'define.scope', 'define.scope.smallest', 'define.scope.idea', 'define.scope.chart', 'define.scope.slice', 'define.scope.slice.ok', 'define.scope.report'])
    const lock = read('.planning/research/define-lock.md') || ''
    check('F232 (define): the concept lock page: the script\'s words, the ✓ lines filled, on the project page', /^\*\*Concept Lock\*\*\nHere's the concept, one page, on your project page now: file:\/\/\//.test(lock) && (lock.match(/^✓ /gm) || []).length === 6 && /Locking means Design builds on this page\./.test(lock), lock.slice(0, 700))
    check('F232 (define): the clash check ran as separate reviewers and wrote its report', js.some(j => j.ev === 'flow.launched' && j.workflow === 'bmuz:clash-flow') && /## Clashes/.test(read('.planning/research/define-clash.md') || ''), (read('.planning/research/define-clash.md') || '').slice(0, 500))
  },

  // F227: Design on the script, 3.0–3.10, with the garden race, from where Define left it (Define's lock: the GDD of a
  // define-garden run, tests/fixtures/garden-defined/GDD.md): every fixed line word for word, the two sketches on the
  // list built as real pages by the sketch flow, rulebook research declined, the rulebook, the content tables, the
  // TDD and the roadmap written, the chapters ending where the growth chart says, and the Blueprint Review gate left
  // for the creative (an auto run never approves).
  async 'design-garden'() {
    const dir = gardenScratch('bmuz-garden-design')
    mkdirSync(join(dir, '.planning'), { recursive: true })
    writeFileSync(join(dir, '.planning/GDD.md'), readFileSync(join(here, 'fixtures', 'garden-defined', 'GDD.md'), 'utf8'))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'design', testAnswers: GARDEN_DESIGN }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say WebSearch WebFetch`, true)
    writeFileSync(join(dir, 'run-output.txt'), out)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const js = journalOf(dir)
    const starts = [...new Set(js.filter(j => j.ev === 'step.start').map(j => j.step))]
    const UP_TO_REVIEW = ['welcome', 'sketches', 'sketch-prep', 'sketch-build', 'sims', 'sketch-play', 'sketch-play-gdd', 'rules-ask', 'flow', 'flow-rb', 'flow-check', 'flow-check-rb', 'flow-check-gdd', 'sections', 'sections-rb', 'rules-done', 'content', 'content-fill', 'balance', 'balance-fill', 'time', 'time-gdd', 'scope2', 'scope2-gdd', 'scope2-report', 'scope2-report-gdd', 'players-read', 'players-read-gdd', 'players', 'players-gdd', 'tdd-start', 'look', 'look-build', 'look-pick', 'look-gdd', 'screens', 'screens-gdd', 'plan', 'plan-write', 'change-gdd', 'change-rb', 'review-show', 'review']
    check('F227 (design): Design ran 3.0–3.10 in order to the Blueprint Review; rulebook research skipped on "No"; "change" only on a "Not yet"', JSON.stringify(starts) === JSON.stringify(UP_TO_REVIEW) && js.some(j => j.ev === 'step.skip' && j.step === 'rules-research') && js.some(j => j.ev === 'step.skip' && j.step === 'change'), `${starts.join(' ')} | ${trailOf(js.slice(-8))}`)
    check('F227 (design): an auto run never approves: the gate asked the script\'s box and stopped', js.some(j => j.ev === 'gate.pending' && j.step === 'review' && j.question === 'Ready to build?' && JSON.stringify(j.options) === JSON.stringify(['Not yet: change something', 'Approve: start building'])) && !js.some(j => j.ev === 'step.done' && j.step === 'approved'), trailOf(js.slice(-6)))
    scriptChecks(dir, out, 'design', js, ['design.welcome', 'design.sketches', 'design.sketches.list', 'design.sketches.order', 'design.sketch.ready', 'design.sketch.answered', 'design.rulebook', 'design.rulebook.research', 'design.rulebook.flow', 'design.rulebook.flow.here', 'design.rulebook.flow.ok', 'design.rulebook.win', 'design.rulebook.setup', 'design.rulebook.pieces', 'design.rulebook.action', 'design.rulebook.secret', 'design.rulebook.names', 'design.content', 'design.content.kinds', 'design.content.columns', 'design.content.balance', 'design.content.playtest', 'design.time', 'design.scope2', 'design.scope2.added', 'design.scope2.report', 'design.scope2.pitch', 'design.players', 'design.players.read', 'design.players.ai', 'design.players.online', 'design.players.length', 'design.players.needs', 'design.look', 'design.look.refs', 'design.look.sketches', 'design.look.pick', 'design.look.motion', 'design.look.sound', 'design.screens', 'design.screens.map', 'design.screens.eyes', 'design.screens.choose', 'design.screens.end', 'design.screens.style', 'design.screens.teach', 'design.plan'])
    const manifest = JSON.parse(read('.planning/research/sketches/sketches.json') || '{"sketches":[]}')
    const pages = manifest.sketches.filter(s => !s.numbers).map(s => read(s.file) || '')
    check('F227 (design): the sketches on the list were built as real pages (changed from the starter, "Copy values for Claude" kept) and are on the project page', manifest.sketches.length >= 2 && pages.length > 0 && pages.every(p => /Copy values for Claude/.test(p) && !/<title>S1: Sketch name<\/title>/.test(p)) && manifest.sketches.every(s => (read('.planning/project-page.html') || '').includes(String(s.file || s.sim || '').split('/').pop().replace(/\.sim\.mjs$/, ''))) && js.some(j => j.ev === 'flow.launched' && j.workflow === 'bmuz:sketch-flow'), JSON.stringify(manifest.sketches.map(s => [s.id, s.file || s.sim])))
    const rb = read('.planning/design/RULEBOOK.md') || ''
    check('F227 (design): the rulebook in Muzzy\'s order, the Flow numbered, a Rule A / Rule B and a dated Development Log entry', ['## Overview', '## Components', '## How to Win', '## Setup', '## Gameplay', '### The Flow', '## Game End', '## Scoring', '## Keywords', '## Development Log'].every((h, i, a) => rb.indexOf(h) >= 0 && (i === 0 || rb.indexOf(h) > rb.indexOf(a[i - 1]))) && /\n1\. Draw two cards/.test(rb) && /Rule A/.test(rb) && /\n- v0\.1 · \d{4}-\d{2}-\d{2} · /.test(rb), rb.slice(0, 900))
    const tables = JSON.parse(read('.planning/design/tables.json') || '{"tables":{}}').tables
    const seed = Object.values(tables).map(t => JSON.parse(read(t.file) || 'null')).find(t => t && /seed/i.test(t.name))
    check('F227 (design): the content tables in content/data/ (Seed cards with Sunflower and Rose; the Playtesting table)', !!seed && seed.rows.some(r => /sunflower/i.test(JSON.stringify(r))) && seed.rows.some(r => /rose/i.test(JSON.stringify(r))) && !!read('content/data/playtesting.json'), JSON.stringify(Object.keys(tables)))
    const tdd = read('.planning/TDD.md') || ''
    const rm = read('.planning/ROADMAP.md') || ''
    check('F227 (design): the TDD (its sections, the content tables decision) and the roadmap (milestones, F## features with needs, the first sprint in the review)', /## 1\. At a glance/.test(tdd) && /D01 · Content tables/.test(tdd) && /## 8\. Decisions log/.test(tdd) && /^# .+ — Roadmap/.test(rm) && /\n## v0\.1 — .+← current/.test(rm) && /\n- 🟢 F01 \S+ .+ — .+ — must:/u.test(rm) && /first sprint it would start with: F01 — /.test(read('.planning/research/design-review.md') || ''), `${tdd.slice(0, 300)} || ${rm.slice(0, 500)}`)
  },


  // F232: "bmuz new" in an empty folder → Ideate on the script, 1.0–1.7, with the garden race (the script's own example):
  // the welcome and every fixed line word for word, the GDD's chapters loose as the chart says, the sketch list, the
  // project page opened (a test run only says it would) — then, with no answer for "Ready for Define?", it stays.
  async 'ideate-garden'() {
    const dir = gardenScratch('bmuz-garden-ideate')
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'ideate', testAnswers: GARDEN_IDEATE }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say`, true)
    writeFileSync(join(dir, 'run-output.txt'), out)
    const js = stageJournal(dir, "ideate")
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const starts = [...new Set(js.filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F232 (ideate): Ideate ran 1.1–1.7 in order and finished', JSON.stringify(starts) === JSON.stringify(['idea', 'material', 'fetch', 'read', 'so-far', 'next', 'next-gdd', 'feelings', 'feelings-gdd', 'open-ideas', 'open-gdd', 'sketches', 'sketch-gdd', 'page', 'ready', 'ready-gdd']) && js.some(j => j.ev === 'pipeline.done'), trailOf(js))
    check('F232 (ideate): it opened with "Welcome to BMUZ" and "Your Idea"; no "where\'s your game?" question', js.find(j => j.ev === 'line')?.line === 'ideate.welcome' && /Welcome to BMUZ/.test(out) && !/where'?s your game/i.test(out), trailOf(js.slice(0, 12)))
    scriptChecks(dir, out, 'ideate', js, ['ideate.welcome', 'ideate.idea', 'ideate.material', 'ideate.next', 'ideate.feelings', 'ideate.open', 'ideate.open.ask', 'ideate.added', 'ideate.round', 'ideate.sketch', 'ideate.sketch.pick', 'ideate.sketch.more', 'ideate.sketch.added', 'ideate.ready'])
    const gdd = read('.planning/GDD.md') || ''
    check('F232 (ideate): the idea\'s own words are in the GDD in quotes', /"[^"]*two friends race to grow the best garden[^"]*"/.test(gdd) || /"[^"]*draw seed cards and plant them[^"]*"/.test(gdd), gdd.slice(0, 800))
    check('F232 (ideate): the sketch list is in the GDD (S01…)', /\n- S01 .+ — answers: /.test(gdd), (gdd.split('## Sketches')[1] || '').slice(0, 300))
    check('F232 (ideate): the project page was built and opened (a test run says it would)', existsSync(join(dir, '.planning/project-page.html')) && js.some(j => j.ev === 'script.ran' && j.step === 'page' && /would open file:\/\//.test(j.stdout || '')), JSON.stringify(js.find(j => j.ev === 'script.ran' && j.step === 'page')))
    check('F232 (ideate): with no answer for "Ready for Define?" an auto run stays in Ideate', JSON.parse(read('bmuz.json') || '{}').pipeline === 'ideate', read('bmuz.json'))
  },

  // F232: "I'm not sure yet" → the spark questions; a rulebook file and an art folder shared → read, the art listed by
  // what it appears to be (1.2), and the game so far says what couldn't be read.
  async 'ideate-rulebook'() {
    const dir = gardenScratch('bmuz-garden-rulebook')
    writeFileSync(join(dir, 'rules.md'), RULEBOOK)
    mkdirSync(join(dir, 'art'), { recursive: true })
    writeFileSync(join(dir, 'art', 'lamp.psd'), Buffer.from([56, 66, 80, 83, 0, 1, 0, 0]))
    const answers = {
      idea: { 'Your Idea': "I'm not sure yet.", 'The three spark questions': 'Lately I love short cosy games. A night keeping a lighthouse lit through a storm. Weather and caring for something.' },
      material: { 'Your Material (share your links)': 'rules.md and the art folder' },
      next: { 'What next?': 'Carry on in Ideate (Recommended)' },
      feelings: { 'Feelings & Hopes': 'Quiet care while the storm rolls in. I would hate it to feel like a stressful timer game.' },
      'open-ideas': { 'Open Ideas, round 1': 'Phone, one player, about ten minutes a night.', 'Another round?': "That's enough for now" },
      sketches: { 'Which of these should we sketch?': 'the first one', 'Anything else?': "that's all" },
    }
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'ideate', testAnswers: answers }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say`, true)
    const js = stageJournal(dir, "ideate")
    check('F232 (ideate, not sure yet): the spark questions were asked, word for word', js.some(j => j.ev === 'line' && j.line === 'ideate.spark') && /Three quick questions to find a spark/.test(out), trailOf(js.slice(0, 20)))
    const shared = readFileSync(join(dir, '.planning/research/shared.md'), 'utf8')
    check('F232 (ideate): the rulebook was read and the art listed by what it appears to be, not read', /\n- rules\.md \(\d+ characters/.test(shared) && /\n- art\/lamp\.psd — a Photoshop file \(art\)/.test(shared), shared.slice(0, 700))
    const so = existsSync(join(dir, '.planning/research/ideate-so-far.md')) ? readFileSync(join(dir, '.planning/research/ideate-so-far.md'), 'utf8') : ''
    check('F232 (ideate): the game so far counts the file shared and says what couldn\'t be read', /from your idea and the \d+ files? you shared\./.test(so) && /I couldn't read: 1 Photoshop file/.test(so), so.slice(0, 900))
  },


  // Check 16: motor B — "bmuz next" from a shell reads the same pipeline and state.
  async motorb() {
    setup('at-review')
    const r = spawnSync('node', [join(plugin, 'scripts', 'bmuz.mjs'), 'next'], { cwd: project, encoding: 'utf8' })
    check('16: bmuz next names step 5 of 5 "review" and its tools', /step 5 of 5 "review" \(talk\)/.test(r.stdout) && /tools allowed: Read, Glob, Grep/.test(r.stdout), r.stdout)
  },

  // Check 15: an overnight run in a background session never stops to wait. The name step would
  // ask; the engine has it take a default, and the run goes on to the gate by itself.
  async nightly() {
    setup('fresh')
    const name = `bmuz-never-stall-${Date.now()}`
    const bg = spawnSync('claude', ['--bg', 'bmuz go', ...base, '-n', name], { cwd: project, env, encoding: 'utf8', input: '', timeout: 60_000 })
    const said = (bg.stdout || '') + (bg.stderr || '')
    if (/not trusted/i.test(said)) {
      check('15: background run never stops to wait', false, `the project folder isn't trusted yet: open "claude" in ${project} once and accept (a person has to). Said: ${said.trim().slice(0, 200)}`)
      return
    }
    for (let i = 0; i < 360 && evs('gate.pending', 'approve').length === 0; i++) await wait(500)
    check('15: a background run took a default at the name step and went on to the gate by itself', evs('step.done', 'name').length === 1 && evs('gate.pending', 'approve').length > 0 && /step name:/.test(file('.bmuz/questions.md') || ''), `journal: ${events().map(j => j.ev).join(',')} · sessions: ${JSON.stringify(evs("session").map(j => ({ interactive: j.interactive, canAsk: j.canAsk, auto: j.auto })))} · auto: ${JSON.stringify(evs("auto.detected").concat(evs("auto.on")).map(j => j.ev))}`)
    // `claude stop` takes the session's id, not its name (a name left 4 test sessions running, 2026-11-08)
    const list = spawnSync('claude', ['agents', '--json'], { env, encoding: 'utf8', timeout: 60_000 }).stdout || '[]'
    for (const a of JSON.parse(list.slice(list.indexOf('[')))) if (a.name === name) spawnSync('claude', ['stop', a.id], { env, encoding: 'utf8', timeout: 60_000 })
  },
}

const pick = process.argv.slice(2)
// Run only when named: `discover` (Discover is no longer a stage since 2026-11-10 — Ideate replaced it; its research
// flow comes back as F229 — Research, callable anywhere, which must drop dead sources inside the flow first: the
// full run of 2026-11-10 blocked on cited pages that 404 or have expired certificates, three tries running).
const NAMED_ONLY = new Set(['discover'])
for (const [name, run] of Object.entries(scenarios)) {
  if (pick.length ? !pick.includes(name) : NAMED_ONLY.has(name)) continue
  console.log(`--- ${name} (${new Date().toLocaleTimeString()})`)
  await run()
}
setup('fresh')
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed} pass, ${failed} fail`)
process.exit(failed ? 1 : 0)
