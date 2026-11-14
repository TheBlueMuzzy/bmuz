// Scripted runs in real Claude sessions (claude -p, and one background session), judged from the
// engine's journal and files — the proof's 16 checks that need a real session (docs/checks.md).
// node tests/headless.mjs [scenario ...]   (no names = all; ~10 min; uses haiku)
// Runs one at a time in project/. Prints PASS/FAIL per check; exits 1 on any FAIL.
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'

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
// F215: a headless run stopped as soon as `done()` says so (checked every 3 s), or at `maxMs`: the step-in scenario only
// needs the step it went back to finished, not the rest of Design. Windows needs taskkill to stop claude's own children.
const runUntil = async (dir, prompt, tools, done, maxMs) => {
  const took = Date.now()
  const child = spawn('claude', ['-p', prompt, ...base, '--allowedTools', tools], { cwd: dir, env: { ...env, BMUZ_TEST: '1' }, stdio: 'ignore' })
  let ended = false
  child.on('exit', () => { ended = true })
  while (!ended && !done() && Date.now() - took < maxMs) await wait(3000)
  if (!ended) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    else child.kill('SIGTERM')
  }
  console.log(`      (${Math.round((Date.now() - took) / 1000)} s; ${ended ? 'ended by itself' : 'stopped once done'})`)
}

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
  // (tools null: nothing but the settings file allows tools: an unattended run's own pre-approvals, F216 review fix 9)
  const r = spawnSync('claude', ['-p', prompt, ...base, ...(tools ? ['--allowedTools', tools] : []), ...(stream ? ['--output-format', 'stream-json', '--verbose'] : [])], { cwd: dir, env: { ...env, BMUZ_TEST: '1' }, encoding: 'utf8', input: '', timeout: 3_000_000, maxBuffer: 64 * 1024 * 1024 })
  let out = (r.stdout || '') + (r.stderr || '')
  if (stream) out = out.split('\n').map(l => { try { const j = JSON.parse(l); return j.type === 'assistant' ? (j.message?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') : '' } catch (e) { return '' } }).filter(Boolean).join('\n')
  console.log(`      (${Math.round((Date.now() - took) / 1000)} s; last lines: ${out.trim().split('\n').slice(-4).join(' / ').slice(0, 400)})`)
  return out
}
// F219: like runIn (stream), with more settings in the environment, stopped as soon as `done()` says so (checked every
// 3 s) or at `maxMs`; hands back every assistant message so far. Deliver's run 2 stops once the project is back in
// Develop (the next sprint is develop-garden's business).
const runCollect = async (dir, prompt, tools, done, maxMs, extra = {}) => {
  const took = Date.now()
  const child = spawn('claude', ['-p', prompt, ...base, ...(tools ? ['--allowedTools', tools] : []), '--output-format', 'stream-json', '--verbose'], { cwd: dir, env: { ...env, BMUZ_TEST: '1', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  let raw = ''
  child.stdout.on('data', d => { raw += d })
  child.stderr.on('data', d => { raw += d })
  let ended = false
  child.on('exit', () => { ended = true })
  while (!ended && !done() && Date.now() - took < maxMs) await wait(3000)
  if (!ended) {
    await wait(5000) // (the last message of the turn that got it there)
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    else child.kill('SIGTERM')
  }
  const out = raw.split('\n').map(l => { try { const j = JSON.parse(l); return j.type === 'assistant' ? (j.message?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') : '' } catch (e) { return '' } }).filter(Boolean).join('\n')
  console.log(`      (${Math.round((Date.now() - took) / 1000)} s; ${ended ? 'ended by itself' : 'stopped once done'}; last lines: ${out.trim().split('\n').slice(-3).join(' / ').slice(0, 300)})`)
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
// F216: the creative's Develop answers for the garden race (run 2 of develop-garden): F01 tuned once, then approved.
const GARDEN_DEVELOP = {
  // (by feature, in order: F01's first approve is "Close, needs tuning", its next "Yes, approve it"; the done-check holds to them)
  approve: { F01: ['Close, needs tuning', 'Yes, approve it'], F02: ['Yes, approve it'], F03: ['Yes, approve it'] },
  tune: { "In your words, what's wrong with it?": 'A turn drags: drawing two cards every turn makes my hand too big. Try drawing one.' },
  lookback: { 'Your three lines (your words win)': 'Fine, keep your draft.' },
}
const gardenScratch = name => {
  if (!/^bmuz-garden-/.test(name)) throw new Error(`the garden scenarios use .scratch/bmuz-garden-* folders only, not ${name}`)
  const dir = join(here, '..', '..', '.scratch', name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}
const plain = t => String(t ?? '').replace(/\r\n/g, '\n').replace(/\*\*|__/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/^[ \t]*[-*•·][ \t]+/gm, '· ').replace(/\s+/g, ' ').trim()
// (F230 item 9a) A line said again in the same step replaces its earlier words (the later "line" event names them in
// "replaced"): only the latest words must be in what Claude wrote.
const kept = js => { const gone = new Set(js.filter(j => j.ev === 'line' && j.replaced).map(j => `${j.step}|${j.line}|${j.replaced}`)); return j => !(j.ev === 'line' && gone.has(`${j.step}|${j.line}|${j.text}`)) }
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
  const lines = js.filter(j => j.ev === 'line').filter(kept(js))
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
    // (F233: Define's first step, "path", works out which path from Ideate's reading — a new idea here)
    const UP_TO_LOCK = ['path', 'welcome', 'feelings', 'feelings-gdd', 'pillars', 'pillars-gdd', 'pitch-ask', 'pitch', 'pitch-gdd', 'loop', 'loop-gdd', 'platform', 'platform-gdd', 'clash', 'clash-review', 'clashes', 'clashes-gdd', 'scope', 'scope-gdd', 'slice', 'slice-gdd', 'change-gdd', 'lock-show', 'lock']
    check('F232 (define): Define ran 2.0–2.8 in order to the lock gate; research skipped on "No"; "change" only on a "Not yet"', JSON.stringify(starts) === JSON.stringify(UP_TO_LOCK) && js.some(j => j.ev === 'step.skip' && j.step === 'prior-art') && js.some(j => j.ev === 'step.skip' && j.step === 'change'), trailOf(js))
    check('F232 (define): an auto run never locks: the gate asked the script\'s box and stopped', js.some(j => j.ev === 'gate.pending' && j.step === 'lock' && j.question === 'Lock the concept?' && JSON.stringify(j.options) === JSON.stringify(['Not yet: change something', 'Lock it: on to Design'])) && !js.some(j => j.ev === 'step.done' && j.step === 'locked'), trailOf(js.slice(-6)))
    scriptChecks(dir, out, 'define', js, ['define.welcome', 'define.feelings', 'define.feelings.own', 'define.feelings.match', 'define.feelings.right', 'define.feelings.know', 'define.feelings.not', 'define.pillars', 'define.pillars.take', 'define.pillars.test', 'define.pitch', 'define.pitch.research', 'define.pitch.take', 'define.pitch.mine', 'define.pitch.how', 'define.pitch.breath', 'define.loop', 'define.loop.here', 'define.loop.ok', 'define.platform.now', 'define.platform.where', 'define.platform.first', 'define.platform.who', 'define.clash', 'define.scope', 'define.scope.smallest', 'define.scope.idea', 'define.scope.someday', 'define.scope.chart', 'define.scope.slice', 'define.scope.slice.ok', 'define.scope.report'])
    const lock = read('.planning/research/define-lock.md') || ''
    check('F232 (define): the concept lock page: the script\'s words, the ✓ lines filled, on the project page', /^\*\*Concept Lock\*\*\nHere's the concept, one page, on your project page now: file:\/\/\//.test(lock) && (lock.match(/^✓ /gm) || []).length === 6 && /Locking means Design builds on this page\./.test(lock), lock.slice(0, 700))
    // F234: on the new-idea path every Define step that names what it collects asks it all
    const planned = js.filter(j => ['ask', 'confirm', 'skip'].includes(j.ev) && j.fields)
    check('F234 (define): a new idea gets every question: each step\'s plan is "ask" (feelings, pillars, pitch, loop, platform, scope, slice), nothing skipped', JSON.stringify(planned.map(j => `${j.ev}:${j.step}`)) === JSON.stringify(['feelings', 'pillars', 'pitch', 'loop', 'platform', 'scope', 'slice'].map(s => `ask:${s}`)) && !(read('.planning/research/define-lock.md') || '').includes("What I didn't ask about"), planned.map(j => `${j.ev}:${j.step}`).join(' '))
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
    scriptChecks(dir, out, 'design', js, ['design.welcome', 'design.sketches', 'design.sketches.list', 'design.sketches.order', 'design.sketch.ready', 'design.sketch.answered', 'design.rulebook', 'design.rulebook.research', 'design.rulebook.flow', 'design.rulebook.flow.here', 'design.rulebook.flow.ok', 'design.rulebook.win', 'design.rulebook.setup', 'design.rulebook.pieces', 'design.rulebook.action', 'design.rulebook.secret', 'design.rulebook.names', 'design.content', 'design.content.kinds', 'design.content.columns', 'design.content.balance', 'design.content.playtest', 'design.time', 'design.scope2', 'design.scope2.added', 'design.scope2.report', 'design.scope2.pitch', 'design.players', 'design.players.read', 'design.players.ai', 'design.players.long', 'design.players.defaults', 'design.players.needs', 'design.look', 'design.look.refs', 'design.look.sketches', 'design.look.pick', 'design.look.motion', 'design.look.sound', 'design.screens', 'design.screens.map', 'design.screens.eyes', 'design.screens.choose', 'design.screens.end', 'design.screens.style', 'design.screens.teach', 'design.plan'])
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
    // F234: a new idea's document holds only ideas and open questions, so every step asks everything
    check('F234 (ideate): a new idea gets every question: Feelings & Hopes planned "ask", nothing skipped or confirmed, no rules asked for', js.some(j => j.ev === 'ask' && j.fields && j.step === 'feelings') && !js.some(j => j.ev === 'skip' || j.ev === 'confirm' || (j.ev === 'step.skip' && j.by === 'fields')) && !js.some(j => j.ev === 'step.start' && j.step === 'rules-ask') && !existsSync(join(dir, '.planning/research/fields.json')), trailOf(js.filter(j => ['ask', 'skip', 'confirm'].includes(j.ev))))
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

  // F233 — Finished games come in as fixed: a finished, played game (tests/fixtures/finished-game/rules.md, a short
  // made-up rulebook, "played over 50 times", and an art file) goes through Ideate and Define on the conversion path,
  // taken without asking: the rules in as fixed with their source, "What Your Rules Leave Open" in place of the
  // feelings and open ideas, Define's "What Your Rulebook Decides" in one pass, then Platform & Play, scope and the
  // slice, to the lock gate (an auto run never locks). No question asks what the rules already say.
  async 'ideate-finished'() {
    const dir = scratch('bmuz-ideate-finished')
    writeFileSync(join(dir, 'rules.md'), readFileSync(join(here, 'fixtures', 'finished-game', 'rules.md'), 'utf8'))
    mkdirSync(join(dir, 'art'), { recursive: true })
    writeFileSync(join(dir, 'art', 'board.psd'), Buffer.from([56, 66, 80, 83, 0, 1, 0, 0]))
    const answers = {
      idea: { 'Your Idea': "It's Moonmarket, a board game I finished years ago: we've played it loads. I want to turn it into a digital version." },
      material: { 'Your Material (share your links)': 'rules.md and the art folder' },
      next: { 'What next?': 'Carry on in Ideate (Recommended)' },
      'rules-open': { 'What Your Rules Leave Open (answer all in one message)': 'If the deck runs out, shuffle the discards back in. On a computer first. Online, taking turns, and against the computer. The computer should do all the bookkeeping, and a short tutorial would be nice.' },
      sketches: { 'Which of these should we sketch? Pick any.': 'the first two', 'Anything else?': "that's all" },
      ready: { 'Ready for Define?': 'On to Define (Recommended)' },
      'welcome-rules': {},
      decides: { 'Is that your game?': "Yes, that's it" },
      'platform-rules': { 'Keep? (each answer from Ideate)': 'Keep', 'Which one platform first?': 'The web', 'Must the computer be able to play it?': 'Yes, and it has to be good' },
      scope: {
        'The smallest version that still gives the feeling': 'Two players against each other online, the base game only.',
        'Each idea: must, should, could or won\'t?': 'Online, taking turns: Must. A computer opponent: Should. A tutorial: Could. Expansions: Won\'t.',
        'A reason for each won\'t': 'Expansions: the base game first.',
      },
      slice: { 'Anything in the wrong box?': 'No, it looks right.', 'Does that slice feel like the game?': 'Yes' },
    }
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'ideate', testAnswers: answers }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say`, true)
    writeFileSync(join(dir, 'run-output.txt'), out)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '')
    const ideate = stageJournal(dir, 'ideate')
    const define = journalOf(dir)
    const both = [...ideate, ...define]
    // 1. the conversion path, taken without asking
    const iStarts = [...new Set(ideate.filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F233 (ideate): the conversion path was taken without asking: "What Your Rules Leave Open" ran, Feelings & Hopes and Open Ideas were skipped', iStarts.includes('rules-open') && !iStarts.some(s => ['feelings', 'open-ideas'].includes(s)) && ['feelings', 'open-ideas'].every(s => ideate.some(j => j.ev === 'step.skip' && j.step === s)) && JSON.parse(read('.planning/research/ideate-so-far.json') || '{}').path === 'convert', iStarts.join(' '))
    const so = read('.planning/research/ideate-so-far.md')
    check('F233 (ideate): the game so far says the rules are fixed, never "Nothing here is decided yet"; the flavour text isn\'t "your ideas"', /\*\*Fixed by your rules\*\*\n/.test(so) && !/Nothing here is decided yet/.test(so) && !/\*\*Your ideas\*\*[^*]*Welcome to the Moonmarket/.test(so), so.slice(0, 1200))
    const gdd = read('.planning/GDD.md')
    check('F233 (ideate): the rules are in the GDD as fixed, with their source', (gdd.match(/^- Fixed: .*\(from [^)]*rules\.md\)$/gm) || []).length >= 3, (gdd.split('### 8 ·')[1] || '').slice(0, 800))
    // 2. no question asks what the rules answer: every question that touches a fact the rules settle names what they say
    // (a sketch's own question — "On one device, can each player keep their hand secret?" — is answered by playing
    // the sketch, not asked of the creative: the sketch list's options are left out, its question kept)
    const asked = both.filter(j => j.ev === 'line' && (j.kind === 'free' || j.kind === 'box')).map(j => (j.kind === 'box' ? `${j.box.question} ${j.line === 'ideate.sketch.pick' ? '' : j.box.options.map(o => `${o.label} ${o.description}`).join(' ')}` : j.text))
    const FACTS = [/how (is|do you|does it) (get )?set ?up|the setup/i, /how does (a|the|one) game end|when does (a|the) game end/i, /who wins|how do(es)? (you|a player|someone) win/i, /\btie\b/i, /how many players/i, /\b(secret|hidden)\b/i, /what('s| is) (in|on) (an|each) order/i, /how (far|many stalls) (do|can) you move/i]
    const bad = asked.flatMap(t => t.split('\n')).filter(l => FACTS.some(re => re.test(l)) && !/Your rules (say|are for)/.test(l))
    check('F233: no question asks about something the rulebook answers (each one that touches a rule says what the rules say first)', asked.length > 0 && bad.length === 0, bad.join(' | ') || `${asked.length} questions`)
    const NEW_ONLY = ['ideate.feelings', 'ideate.open', 'ideate.pool.mentioned', 'ideate.pool.remember', 'ideate.pool.end', 'ideate.pool.skill', 'ideate.pool.first', 'ideate.round', 'define.welcome', 'define.feelings', 'define.feelings.moments', 'define.feelings.own', 'define.feelings.know', 'define.feelings.not', 'define.pillars', 'define.pillars.take', 'define.pillars.own', 'define.pillars.test', 'define.pitch', 'define.pitch.research', 'define.pitch.take', 'define.pitch.write', 'define.loop', 'define.loop.steps', 'define.loop.time', 'define.clash']
    const newSaid = both.filter(j => j.ev === 'line' && NEW_ONLY.includes(j.line)).map(j => j.line)
    check('F233: none of the new-idea questions were asked (feelings, hopes, "ideas for it, even half-formed", pillars, pitch, loop)', newSaid.length === 0, newSaid.join(', '))
    check('F233: every free question ended with "Type your answer below."', both.filter(j => j.ev === 'line' && j.kind === 'free').every(j => /Type your answer below\.$/.test(j.text)), both.filter(j => j.ev === 'line' && j.kind === 'free' && !/Type your answer below\.$/.test(j.text)).map(j => j.line).join(', '))
    // 3. Define on the conversion path reaches its lock
    const dStarts = [...new Set(define.filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F233 (define): Define took the conversion path: What Your Rulebook Decides, Platform & Play, scope, the slice, to the lock gate', JSON.stringify(dStarts) === JSON.stringify(['path', 'welcome-rules', 'decides', 'decides-gdd', 'platform-rules', 'platform-rules-gdd', 'scope', 'scope-gdd', 'slice', 'slice-gdd', 'change-gdd', 'lock-show', 'lock']) && define.some(j => j.ev === 'gate.pending' && j.step === 'lock') && !define.some(j => j.ev === 'step.done' && j.step === 'locked'), `${dStarts.join(' ')} | ${trailOf(define.slice(-6))}`)
    const lock = read('.planning/research/define-lock.md')
    check('F233 (define): the concept lock page has its six ✓ lines; GDD Part 1 written as chosen the same way', (lock.match(/^✓ /gm) || []).length === 6 && [1, 2, 3, 4, 5, 6].every(n => levelsOf(dir)[n] === 'chosen'), `${JSON.stringify(levelsOf(dir))} | ${lock.slice(0, 600)}`)
    const said = both.filter(j => j.ev === 'line' && j.kind !== 'box').filter(kept(both))
    const missing = said.filter(j => !plain(out).includes(plain(j.text)))
    check('F233: every fixed line the engine handed out is in Claude\'s words word for word', said.length > 0 && missing.length === 0, missing.map(j => `${j.line}: ${plain(j.text).slice(0, 120)}`).join(' | '))
    // (the first run, read first-hand: "added to 8, 5, 11", "closes.. We'll know", "who" asked as a box and again as Keep)
    const sloppy = said.filter(j => (j.line === 'ideate.added' && /added to [\d,\s]+\.$/.test(j.text)) || /[^.]\.\.(\s|$)/.test(j.text)).map(j => `${j.line}: ${j.text.slice(0, 100)}`)
    const plat = define.filter(j => j.ev === 'line' && j.step === 'platform-rules')
    const twice = [['define.platform.where', 'Where is the player'], ['define.platform.who', 'Who else is playing']].filter(([id, q]) => plat.some(j => j.line === id) && plat.some(j => j.line === 'any.keep' && j.box.question.startsWith(q))).map(([id]) => id)
    check('F233: the lines read right (chapters by name, no doubled full stops) and Platform & Play asks nothing twice', sloppy.length === 0 && twice.length === 0, [...sloppy, ...twice.map(id => `${id} asked and kept`)].join(' | '))
    const ids = new Set(both.filter(j => j.ev === 'line').map(j => j.line))
    const must = ['ideate.rules', 'ideate.open.ask', 'ideate.added', 'define.welcome.rules', 'define.rules', 'define.rules.ok', 'define.platform.now', 'define.platform.first', 'define.scope', 'define.scope.slice', 'define.scope.report']
    check('F233: the conversion path\'s lines were all said', must.every(id => ids.has(id)), `not said: ${must.filter(id => !ids.has(id)).join(', ')}`)
  },


  // F234 review fix 1 (reviewer 2026-11-13): a finished game (Moonmarket) in Define at What Your Rulebook Decides, whose
  // one box ("Is that your game?") confirms six answers. "Already decided" about the loop at that box settles the loop
  // only: one decided record, none for the feelings, pillars or pitch, no "already decided" line in chapters 1–3, and
  // the box is asked again for the rest. Stopped once the step's chapters are written.
  async 'ideate-decided-box'() {
    const dir = scratch('bmuz-ideate-decided-box')
    const G = await import('../plugin/scripts/gdd.mjs')
    const rules = readFileSync(join(here, 'fixtures', 'finished-game', 'rules.md'), 'utf8')
    const RULES = ['Each player puts their cart on any stall and draws 3 goods cards.', 'Move your cart one or two stalls around the ring.', 'When it reaches space 8 the market closes and the game ends.', 'The most points wins. A tie is a shared win.'].map(r => `Fixed: "${r}" (from rules.md)`)
    mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
    writeFileSync(join(dir, '.planning/GDD.md'), G.writeChapter(G.newGdd('Moonmarket'), 8, RULES, 'loose', {}).text)
    writeFileSync(join(dir, 'rules.md'), rules)
    writeFileSync(join(dir, '.planning/research/shared.md'), `# What you shared\n\n## rules.md\n\n${rules}`)
    writeFileSync(join(dir, '.planning/research/ideate-so-far.json'), JSON.stringify({ path: 'convert' }))
    const define = JSON.parse(readFileSync(join(plugin, 'pipelines', 'define.json'), 'utf8'))
    const entered = E.enterAt(define, E.freshState('define'), 'decides', { convert: 'yes', fresh: 'no' }).state
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify(entered, null, 2))
    const answers = { decides: { 'Is that your game?': 'Already decided: the core loop is "move your cart, trade at the stall, race the market\'s close". The rest is right, yes, that\'s it.' } }
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'define', testAnswers: answers }, null, 2))
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '')
    const state = () => { try { return JSON.parse(read('.bmuz/state.json')) } catch (e) { return {} } }
    const out = await runCollect(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say mcp__bmuz__decided`, () => (state().finished || []).includes('decides-gdd'), 1_200_000)
    writeFileSync(join(dir, 'run-output.txt'), out)
    const js = journalOf(dir)
    const dec = js.filter(j => j.ev === 'decided')
    const fields = (() => { try { return JSON.parse(read('.planning/research/fields.json')) } catch (e) { return {} } })()
    check('F234 review fix 1: "already decided" at the box that confirms six answers settled one (the loop), never all six', dec.length === 1 && JSON.stringify(dec[0].fields) === '["loop"]' && JSON.stringify(Object.keys(fields)) === '["loop"]', `${JSON.stringify(dec)} | fields: ${Object.keys(fields).join(', ')} | ${trailOf(js.filter(j => j.step === 'decides')).slice(0, 600)}`)
    const ch = G.readGdd(read('.planning/GDD.md'))
    check('F234 review fix 1: no "already decided" line was written into the feelings, pillars or pitch (chapters 1–3)', [1, 2, 3].every(n => !/already decided/.test((ch[n] || {}).text || '')), [1, 2, 3].map(n => `${n}: ${((ch[n] || {}).text || '').slice(0, 120)}`).join(' | '))
    const boxes = js.filter(j => j.ev === 'line' && j.step === 'decides' && j.line === 'define.rules.ok')
    const at = js.indexOf(dec[0])
    check('F234 review fix 1: the box was asked again for the rest after the one answer was settled', at >= 0 && boxes.some(j => js.indexOf(j) > at) && (state().finished || []).includes('decides'), `${boxes.length} boxes; ${trailOf(js.slice(-8))}`)
    // (the run is stopped once the step is written down, maybe with the next step's first line handed out but not yet
    // written: only this step's lines count)
    const said = js.filter(j => j.ev === 'line' && j.kind !== 'box' && j.step === 'decides').filter(kept(js))
    const missing = said.filter(j => !plain(out).includes(plain(j.text)))
    check('F234: every fixed line the engine handed out in this step is in Claude\'s words word for word', said.length > 0 && missing.length === 0, missing.map(j => `${j.line}: ${plain(j.text).slice(0, 120)}`).join(' | '))
  },

  // F234 — Steps ask only what's still open: a finished game (Moonmarket) in Define, at Platform & Play, its rules
  // already saying where it's played and who plays (the GDD's chapter 5 and .planning/research/fields.json, as Ideate's
  // reading records them). Proves, in one run: what the rules say is not asked (and is listed at the stage's end, to
  // reopen); what they leave open that a later stage needs is still asked (the first platform); "already decided" on
  // that one question settles it alone (the questions after it are still asked); the lock gate waits (auto run).
  async 'ideate-decided'() {
    const dir = scratch('bmuz-ideate-decided')
    const G = await import('../plugin/scripts/gdd.mjs')
    const WHERE = 'Fixed: "Played on a computer, with a mouse." (from rules.md)'
    const WHO = 'Fixed: "Two players online, taking turns." (from rules.md)'
    const RULES = ['Each player puts their cart on any stall and draws 3 goods cards.', 'Move your cart one or two stalls around the ring.', 'When it reaches space 8 the market closes and the game ends.', 'The most points wins. A tie is a shared win.'].map(r => `Fixed: "${r}" (from rules.md)`)
    let doc = G.newGdd('Moonmarket')
    doc = G.writeChapter(doc, 8, RULES, 'loose', {}).text
    doc = G.writeChapter(doc, 5, [WHERE, WHO], 'loose', {}).text
    mkdirSync(join(dir, '.planning', 'research'), { recursive: true })
    writeFileSync(join(dir, '.planning/GDD.md'), doc)
    writeFileSync(join(dir, 'rules.md'), readFileSync(join(here, 'fixtures', 'finished-game', 'rules.md'), 'utf8'))
    writeFileSync(join(dir, '.planning/research/ideate-so-far.json'), JSON.stringify({ path: 'convert' }))
    writeFileSync(join(dir, '.planning/research/fields.json'), JSON.stringify({ 'platform.where': [{ chapter: 5, line: WHERE, kind: 'fixed', step: 'read' }], 'players.who': [{ chapter: 5, line: WHO, kind: 'fixed', step: 'read' }] }))
    const define = JSON.parse(readFileSync(join(plugin, 'pipelines', 'define.json'), 'utf8'))
    const given = { convert: 'yes', fresh: 'no', feelings: ['the tension of a close market'], feeling: 'tension', pillars: [{ name: 'Every stall matters', settles: 'what to cut' }], oneliner: 'Race your cart round the moonlit market before it closes.', loop: 'Move, buy, sell, score.' }
    const entered = E.enterAt(define, E.freshState('define'), 'platform-rules', given).state
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify(entered, null, 2))
    const answers = {
      'platform-rules': { 'Which one platform first?': 'Already decided: the web.', 'Which ones are "someday"?': 'Phone app stores, someday.', 'Must the computer be able to play it?': 'Yes, and it has to be good' },
      scope: {
        'The smallest version that still gives the feeling': 'Two players against each other online, the base game only.',
        'Each idea: must, should, could or won\'t?': 'Online, taking turns: Must. A computer opponent: Should. A tutorial: Could. Expansions: Won\'t.',
        'A reason for each won\'t': 'Expansions: the base game first.',
      },
      slice: { 'Anything in the wrong box?': 'No, it looks right.', 'Does that slice feel like the game?': 'Yes' },
    }
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'define', testAnswers: answers }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch mcp__bmuz__say mcp__bmuz__decided`, true)
    writeFileSync(join(dir, 'run-output.txt'), out)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '')
    const js = journalOf(dir)
    const plan = js.find(j => j.ev === 'confirm' && j.step === 'platform-rules')
    const st = plan ? Object.fromEntries(plan.fields.map(x => [x.field, x.status])) : {}
    check('F234: before Platform & Play the engine read the document: where and who are there (the rules say), the first platform and the computer missing (F235: someday is asked in Scope now)',JSON.stringify(st) === JSON.stringify({ 'platform.where': 'there', 'platform.first': 'missing', 'players.who': 'there', 'computer.ai': 'missing' }), JSON.stringify(plan || trailOf(js.slice(0, 12))))
    const plat = js.filter(j => j.ev === 'line' && j.step === 'platform-rules')
    const askedThere = plat.filter(j => ['define.platform.where', 'define.platform.who'].includes(j.line) || (j.line === 'any.keep' && /^(Where is the player|Who else is playing)/.test(j.box?.question || '')))
    check('F234 rule 2: what the rules already say was not asked (no where / who box, no Keep for them)', plat.length > 0 && askedThere.length === 0, askedThere.map(j => j.line).join(', ') || plat.map(j => j.line).join(', '))
    check('F234 rule 3: what the rules leave open and a later stage needs was still asked (Which one platform first?)', plat.some(j => j.line === 'define.platform.first'), plat.map(j => j.line).join(', '))
    const dec = js.filter(j => j.ev === 'decided')
    const decAt = js.indexOf(dec[0])
    // (review fix run 2026-11-13: haiku may ask the other questions before the one it was told is decided, or as a Keep;
    // what rule 1 needs is that they were still asked in the step and not settled with it)
    const after = js.filter(j => j.ev === 'line' && j.step === 'platform-rules' && (['define.platform.ai'].includes(j.line) || (j.line === 'any.keep' && /computer be able/i.test(j.box?.question || '')))).filter(j => js.indexOf(j) !== decAt)
    const fields = (() => { try { return JSON.parse(read('.planning/research/fields.json')) } catch (e) { return {} } })()
    check('F234 rule 1: "already decided" settled exactly that one question (platform.first, written into chapter 5), and the next questions were still asked', dec.length === 1 && JSON.stringify(dec[0].fields) === '["platform.first"]' && /you said it's already decided/.test((G.readGdd(read('.planning/GDD.md'))[5] || {}).text || '') && (fields['platform.first'] || []).some(r => r.kind === 'decided') && after.length >= 1 && js.some(j => j.ev === 'line' && j.line === 'any.decided'), `${JSON.stringify(dec)} | after: ${after.map(j => j.line).join(', ')}`)
    const lock = read('.planning/research/define-lock.md')
    check('F234 rule 4: the stage\'s end lists what wasn\'t asked, with why, and how to bring one back', /\*\*What I didn't ask about\*\*\n1\. Where it's played, and what the player holds \(Platform & Play\): your rules say "Played on a computer, with a mouse\." \(from rules\.md\)\n2\. Who else plays \(Platform & Play\): your rules say/.test(lock) && /To bring one back, say "reopen" and its number\./.test(lock), lock.slice(-600))
    check('F234: Define went on to the lock gate (an auto run never locks)', js.some(j => j.ev === 'gate.pending' && j.step === 'lock') && !js.some(j => j.ev === 'step.done' && j.step === 'locked'), trailOf(js.slice(-6)))
    const said = js.filter(j => j.ev === 'line' && j.kind !== 'box').filter(kept(js))
    const missing = said.filter(j => !plain(out).includes(plain(j.text)))
    check('F234: every fixed line the engine handed out is in Claude\'s words word for word', said.length > 0 && missing.length === 0, missing.map(j => `${j.line}: ${plain(j.text).slice(0, 120)}`).join(' | '))
  },

  // F215: the bug pipeline on a tiny game with a planted bug (tests/fixtures/bug-garden: the final score skips the first
  // row; the full-row bonus copies the same mistake), its Design waiting at the Blueprint Review. Run 1, the creative
  // steps in with the bug in plain words: logged in BUGS.md, the script's line word for word, the gate untouched. Run 2,
  // "bmuz bug": the stage parks, the fix run goes pick → reproduce (the test fails first) → cause → fix (passes after)
  // → matching places (the bonus fixed too, with its own test) → record (BUGS.md fixed + Guarded by, committed
  // "Fix B001: …"), every fixed line word for word, then back to Design at the same gate.
  async 'bug-garden'() {
    const dir = gardenScratch('bmuz-garden-bug')
    cpSync(join(here, 'fixtures', 'bug-garden'), dir, { recursive: true })
    mkdirSync(join(dir, '.planning'), { recursive: true })
    writeFileSync(join(dir, '.planning/GDD.md'), readFileSync(join(here, 'fixtures', 'garden-defined', 'GDD.md'), 'utf8'))
    for (const args of [['init', '-q'], ['config', 'user.email', 'test@example.com'], ['config', 'user.name', 'BMUZ test'], ['add', '-A'], ['commit', '-q', '-m', 'the garden']]) spawnSync('git', args, { cwd: dir })
    const design = JSON.parse(readFileSync(join(plugin, 'pipelines', 'design.json'), 'utf8'))
    const review = design.steps.findIndex(s => s.id === 'review')
    const entered = E.enterAt(design, E.freshState('design'), 'review', {}).state
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...entered, current: 'review', status: 'waiting', startedAt: Date.now() }, null, 2))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'design' }, null, 2))
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const tools = `${TOOLS} Edit ToolSearch mcp__bmuz__say mcp__bmuz__bug`
    // run 1: the step-in
    // (only the final score's bloom points are reported: the full-row bonus is the copy the matching step must find)
    const out1 = runIn(dir, 'Found a bug: the blooms in my first row never count toward the final score (one point per bloom). The other rows count fine. It happens every time.', tools, true)
    let js = journalOf(dir)
    const bug = js.find(j => j.ev === 'bug')
    const logged = js.find(j => j.ev === 'line' && j.line === 'bug.logged')
    check('F215 (bug): the step-in is logged as B001 in BUGS.md, and the script\'s line is in Claude\'s words word for word', !!bug && bug.id === 'B001' && !!logged && /^Logged as a bug: B001 · .+ · P[0-3] — .+\. It doesn't block what we're doing, so I'll fix it after Blueprint Review\.$/.test(logged.text) && plain(out1).includes(plain(logged.text)) && /^### B001 · P[0-3] · open · found \d{4}-\d\d-\d\d in Design · 10 of 10 · Blueprint Review$/m.test(read('.planning/BUGS.md') || ''), `${trailOf(js)} | ${(read('.planning/BUGS.md') || '').slice(0, 400)}`)
    const st1 = JSON.parse(read('.bmuz/state.json') || '{}')
    check('F215 (bug): the gate it stepped in at is untouched (waiting at the Blueprint Review, nothing finished or dropped)', st1.current === 'review' && st1.status === 'waiting' && st1.finished.length === review && !js.some(j => j.ev === 'retry' || j.ev === 'blocked'), JSON.stringify({ current: st1.current, status: st1.status, finished: st1.finished?.length }))
    // run 2: the fix run (review fix 8: what git shows as changed before it, .bmuz/ left out, is all it shows after it)
    const changed = () => new Set((spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', '.', ':!.bmuz'], { cwd: dir, encoding: 'utf8' }).stdout || '').split('\n').filter(Boolean).map(l => l.slice(3)))
    const changedBefore = changed()
    const out2 = runIn(dir, 'bmuz bug', tools, true)
    writeFileSync(join(dir, 'run-output.txt'), `${out1}\n----\n${out2}`)
    const runs = JSON.parse(read('.bmuz/bug-runs.json') || '[]')
    const rec = runs[0] ? join(dir, runs[0].record.replace(/^\.bmuz\//, '.bmuz/')) : null
    const bj = rec && existsSync(join(rec, 'journal.jsonl')) ? readFileSync(join(rec, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : journalOf(dir)
    const starts = [...new Set(bj.filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F215 (bug): the fix run went pick → reproduce → cause → fix → matching → matching fix → record, and finished', JSON.stringify(starts) === JSON.stringify(['pick', 'reproduce', 'repro-show', 'cause', 'fix', 'matching', 'matching-fix', 'record']) && bj.some(j => j.ev === 'pipeline.done'), trailOf(bj))
    const proof = JSON.parse(read('.bmuz/bug/B001.json') || '{}')
    const reproRan = bj.filter(j => j.ev === 'check.ran' && j.step === 'reproduce').pop()
    const fixRan = bj.filter(j => j.ev === 'check.ran' && j.step === 'fix').pop()
    check('F215 (bug): the test failed first (a script ran it and recorded the failing exit) and passes after, unchanged', !!proof.repro && proof.repro.exitCode !== 0 && !!reproRan && reproRan.exitCode === 0 && !!fixRan && fixRan.exitCode === 0 && !!proof.verify && existsSync(join(dir, proof.repro.test)), JSON.stringify({ repro: proof.repro && { ...proof.repro, out: undefined }, reproRan, fixRan }))
    const v = spawnSync('node', [join(here, 'fixtures', 'bug-garden-check.mjs'), dir], { encoding: 'utf8' })
    const fixedHit = (proof.hits || []).find(h => h.action === 'fix' && /bonus/.test(h.where))
    check('F215 (bug): both places fixed (the score and the copied mistake in the bonus, with its own test proven failing first)', /"ok":true/.test(v.stdout) && !!fixedHit && fixedHit.exitCode !== 0 && existsSync(join(dir, fixedHit.test)), `${v.stdout} ${JSON.stringify(proof.hits)}`)
    const bugsMd = read('.planning/BUGS.md') || ''
    const fixed = bugsMd.split('## Fixed (newest first)')[1] || ''
    check('F215 (bug): BUGS.md right: B001 under Fixed with "fixed in" and Guarded by a real test, its cause, the Open count line', /^Open: \d+ \(P0 \d+ · P1 \d+ · P2 \d+ · P3 \d+\)$/m.test(bugsMd) && new RegExp(`### B001 · P[0-3] · fixed \\d{4}-\\d\\d-\\d\\d · .* · fixed in [0-9a-f]{7,} · Guarded by: ${proof.repro?.test?.replace(/[.]/g, '[.]')}$`, 'm').test(fixed) && /\nCause: /.test(fixed) && !/### B001/.test(bugsMd.split('## Fixed')[0]), bugsMd.slice(0, 1200))
    const log = spawnSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout
    check('F215 (bug): committed "Fix B001: …" (and the report "Bug B001: …" before it)', /^Fix B001: .+$/m.test(log) && /^Bug B001: /m.test(log), log)
    const leftOver = [...changed()].filter(f => !changedBefore.has(f) && f !== 'run-output.txt')
    check('F215 (bug): nothing of the fix run is left in the project: git shows only what it showed before the run', leftOver.length === 0, leftOver.join(', '))
    const shows = bj.filter(j => j.ev === 'show')
    const missing = shows.filter(j => !plain(out2).includes(plain(read(j.path) || '~')))
    check('F215 (bug): every fixed line of the fix run (Fixing a bug, Reproduced, Fixed) is in Claude\'s words word for word', shows.map(j => j.step).join(',') === 'pick,repro-show,record' && missing.length === 0, `${shows.map(j => j.step)} missing: ${missing.map(j => j.path)}`)
    js = journalOf(dir)
    const st2 = JSON.parse(read('.bmuz/state.json') || '{}')
    check('F215 (bug): back to Design at the same gate, its record intact (the side trip\'s record kept in .bmuz/bug-runs/)', st2.pipeline === 'design' && st2.current === 'review' && st2.status === 'waiting' && st2.finished.length === review && js.some(j => j.ev === 'side.back' && j.bug === 'B001') && !existsSync(join(dir, '.bmuz/side.json')) && runs.length === 1, `${JSON.stringify({ pipeline: st2.pipeline, current: st2.current, status: st2.status })} | ${trailOf(js.slice(-6))}`)
  },

  // F215: a step-in during Design returns to the same step. Design is at The Rulebook's Flow (a talk step) from an earlier
  // session; the creative says something's broken: logged, the script's line, the step's record untouched (no failed
  // try). Then "bmuz go": the same step resumes and finishes on its first try (the run is stopped once it has).
  async 'bug-stepin'() {
    const dir = gardenScratch('bmuz-garden-bugstep')
    mkdirSync(join(dir, '.planning'), { recursive: true })
    writeFileSync(join(dir, '.planning/GDD.md'), readFileSync(join(here, 'fixtures', 'garden-defined', 'GDD.md'), 'utf8'))
    const design = JSON.parse(readFileSync(join(plugin, 'pipelines', 'design.json'), 'utf8'))
    const entered = E.enterAt(design, E.freshState('design'), 'flow', {}).state
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...entered, current: 'flow', status: 'working', startedAt: Date.now() }, null, 2))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'design', testAnswers: GARDEN_DESIGN }, null, 2))
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const tools = `${TOOLS} Edit ToolSearch mcp__bmuz__say mcp__bmuz__bug`
    const before = JSON.parse(read('.bmuz/state.json'))
    const out = runIn(dir, 'the score text is cut off on my phone', tools, true)
    writeFileSync(join(dir, 'run-output.txt'), out)
    let js = journalOf(dir)
    const logged = js.find(j => j.ev === 'line' && j.line === 'bug.logged')
    const st = JSON.parse(read('.bmuz/state.json') || '{}')
    check('F215 (step-in): during Design the bug is logged and its line said word for word ("fix it after The Rulebook")', js.some(j => j.ev === 'bug' && j.step === 'flow') && !!logged && /so I'll fix it after The Rulebook\.$/.test(logged.text) && plain(out).includes(plain(logged.text)), trailOf(js))
    check('F215 (step-in): the step keeps its record: still The Rulebook\'s Flow, working, no failed try, nothing finished or dropped', st.current === 'flow' && st.status === 'working' && JSON.stringify(st.retries) === JSON.stringify(before.retries) && JSON.stringify(st.finished) === JSON.stringify(before.finished) && !js.some(j => j.ev === 'retry' || j.ev === 'blocked'), JSON.stringify({ current: st.current, status: st.status, retries: st.retries }))
    // "bmuz go": the same step resumes and finishes on its first try; stopped there (the rest of Design is design-garden's)
    await runUntil(dir, 'bmuz go', tools, () => journalOf(dir).some(j => j.ev === 'step.done' && j.step === 'flow'), 900_000)
    js = journalOf(dir)
    const resumed = js.find(j => j.ev === 'resume' && j.step === 'flow')
    const done = js.find(j => j.ev === 'step.done' && j.step === 'flow')
    check('F215 (step-in): "bmuz go" goes back to the same step and it finishes on its first try', !!resumed && !!done && !js.some(j => j.ev === 'retry' && j.step === 'flow') && js.filter(j => j.ev === 'step.start').every(j => j.step !== 'flow' || j.attempt === 1), trailOf(js.slice(-12)))
  },

  // F229: research, callable anywhere. Design is at The Rulebook's Flow (a talk step) from an earlier session; the creative
  // asks a research question. Run 1 (claude -p: an auto run): the research tool, the research itself (the test's stand-in
  // for the flow, BMUZ_RESEARCH_STUB: no web is searched), the script's reply word for word in its two halves, the Sources
  // tab listing the report, what it found in the questions file (nobody is there to answer "Does it change anything?"),
  // and the step's record untouched. Run 2: "bmuz go" goes back to the same step, which finishes on its first try.
  async 'research-stepin'() {
    const dir = gardenScratch('bmuz-garden-research')
    mkdirSync(join(dir, '.planning'), { recursive: true })
    writeFileSync(join(dir, '.planning/GDD.md'), readFileSync(join(here, 'fixtures', 'garden-defined', 'GDD.md'), 'utf8'))
    const design = JSON.parse(readFileSync(join(plugin, 'pipelines', 'design.json'), 'utf8'))
    const entered = E.enterAt(design, E.freshState('design'), 'flow', {}).state
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...entered, current: 'flow', status: 'working', startedAt: Date.now() }, null, 2))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'design', testAnswers: GARDEN_DESIGN }, null, 2))
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const extra = { BMUZ_RESEARCH_STUB: join(here, 'fixtures', 'research-stub'), BMUZ_SOURCES_OFFLINE: '1' }
    const tools = `${TOOLS} Edit ToolSearch mcp__bmuz__say mcp__bmuz__bug mcp__bmuz__research`
    const before = JSON.parse(read('.bmuz/state.json'))
    const out = await runCollect(dir, "what's the research say about this? Has a garden race where the weather can help both gardens been done before?", tools, () => false, 900_000, extra)
    writeFileSync(join(dir, 'run-output.txt'), out)
    let js = journalOf(dir)
    const asked = js.find(j => j.ev === 'research.asked')
    const look = js.find(j => j.ev === 'line' && j.line === 'research.look')
    const found = js.find(j => j.ev === 'line' && j.line === 'research.found')
    check('F229 (research): mid-Design the creative\'s question started the research from the step it was asked at (The Rulebook\'s Flow), and it came back', !!asked && asked.step === 'flow' && asked.stub === true && js.some(j => j.ev === 'research.done'), trailOf(js))
    check('F229 (research): the script\'s reply word for word: "Let me look. …", then "Here\'s what I found: [3 short lines] Sources are on your project page. Does it change anything?"', !!look && !!found && look.text === 'Let me look. About 5 minutes…' && /^Here's what I found:\n· .+\n· .+\n· .+\nSources are on your project page\. Does it change anything\?$/.test(found.text) && plain(out).includes(plain(look.text)) && plain(out).includes(plain(found.text)), `${look && look.text} | ${found && found.text} | ${out.slice(-600)}`)
    const report = asked ? read(asked.out) : null
    const page = read('.planning/project-page.html') || ''
    const sources = (page.split('<h2 id="sources">Sources</h2>')[1] || '')
    check('F229 (research): the report is in .planning/research/ and the project page\'s Sources tab lists it — its question, its date, its sources as links', !!report && /^# Research: /.test(report) && /<a href="#sources">Sources<\/a>/.test(page) && sources.includes(String(asked.out).split('/').pop()) && sources.includes('href="https://example.com/shared-weather"') && sources.includes((String(asked.out).match(/\d{4}-\d\d-\d\d/) || ['?'])[0]), sources.slice(0, 600))
    const st = JSON.parse(read('.bmuz/state.json') || '{}')
    check('F229 (research): the step keeps its record: still The Rulebook\'s Flow, working, no failed try, nothing finished or dropped', st.current === 'flow' && st.status === 'working' && JSON.stringify(st.retries) === JSON.stringify(before.retries) && JSON.stringify(st.finished) === JSON.stringify(before.finished) && !js.some(j => j.ev === 'retry' || j.ev === 'blocked'), JSON.stringify({ current: st.current, status: st.status, retries: st.retries }))
    const rs = JSON.parse(read('.bmuz/research.json') || '{"notes":[]}')
    check('F229 (research): an auto run waits for no answer: what it found is in the questions file and noted for the step', /Research while you were away: ".+" \(\.planning\/research\/research-.+\.md\) found: .+ Does it change anything\?/.test(read('.bmuz/questions.md') || '') && rs.now === null && rs.notes.some(n => n.step === 'flow' && n.found.length === 3), `${(read('.bmuz/questions.md') || '').slice(-400)} | ${JSON.stringify(rs)}`)
    // "bmuz go": the same step resumes (reading the research noted for it) and finishes on its first try
    await runUntil(dir, 'bmuz go', tools, () => journalOf(dir).some(j => j.ev === 'step.done' && j.step === 'flow'), 900_000)
    js = journalOf(dir)
    const resumed = js.find(j => j.ev === 'resume' && j.step === 'flow')
    const done = js.find(j => j.ev === 'step.done' && j.step === 'flow')
    check('F229 (research): "bmuz go" goes back to the same step and it finishes on its first try', !!resumed && !!done && !js.some(j => j.ev === 'retry' && j.step === 'flow') && js.filter(j => j.ev === 'step.start').every(j => j.step !== 'flow' || j.attempt === 1), trailOf(js.slice(-12)))
  },

  // F216: Develop from Design's end on the garden race (tests/fixtures/garden-designed: the blueprint + a tiny game).
  // Run 1, an auto run with no one to approve: Design hands over to Develop, which runs 4.0–4.4 (the gates carried, the
  // plan card written), builds and proves each feature with a fresh builder and a separate reviewer, shows it ready, and
  // leaves every approval as a question without stalling. Run 2, the creative's answers as test answers: F01 tuned once
  // (one setting), then approved; F02 approved; the look-back writes the retro and the loop reaches sprint 2.
  async 'develop-garden'() {
    const dir = gardenScratch('bmuz-garden-develop')
    cpSync(join(here, 'fixtures', 'garden-designed'), dir, { recursive: true })
    for (const args of [['init', '-q', '-b', 'main'], ['config', 'user.email', 'test@example.com'], ['config', 'user.name', 'BMUZ test'], ['add', '-A'], ['commit', '-q', '-m', 'the garden, as Design left it']]) spawnSync('git', args, { cwd: dir })
    const design = JSON.parse(readFileSync(join(plugin, 'pipelines', 'design.json'), 'utf8'))
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...E.freshState('design'), finished: design.steps.map(s => s.id), status: 'done' }, null, 2))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'design' }, null, 2))
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const json = f => { try { return JSON.parse(read(f) || 'null') } catch (e) { return null } }
    const tools = `${TOOLS} Edit Bash ToolSearch WebSearch WebFetch mcp__bmuz__say mcp__bmuz__bug mcp__bmuz__idea`
    // every journal of the run: the stages' archives, the feature runs' records, the current one
    const allJournals = () => {
      const out = []
      for (const sub of ['stages', 'feature-runs']) {
        const root = join(dir, '.bmuz', sub)
        if (existsSync(root)) for (const d of readdirSync(root).sort()) { const f = join(root, d, 'journal.jsonl'); if (existsSync(f)) out.push(...readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })) }
      }
      return [...out, ...journalOf(dir)]
    }
    // (F230 item 9b) Sprint 2 planned: the develop stage run that Develop started for it (its journal opens with
    // stage.enter from develop) has plan-write done. Read wherever that journal is — .bmuz/parked/ while a feature run
    // of sprint 2 has already started — never from the state at one moment (run 19:45 stopped inside F03's run).
    const sprint2Planned = () => {
      const parked = join(dir, '.bmuz', 'parked', 'journal.jsonl')
      const jj = existsSync(parked) ? readFileSync(parked, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } }) : journalOf(dir)
      return !!jj[0] && jj[0].ev === 'stage.enter' && jj[0].from === 'develop' && jj[0].to === 'develop' && jj.some(j => j.ev === 'step.done' && j.step === 'plan-write') && /^# Sprint 02 — /m.test(read('.planning/SPRINT.md') || '')
    }
    const tuningBefore = json('content/tuning/game.json')
    // run 1: the auto run
    // (review fix 9: run 1 allows only what auto-run.json pre-approves, as a real overnight run does)
    const out1 = runIn(dir, 'bmuz go', null, true)
    writeFileSync(join(dir, 'run-output-1.txt'), out1)
    let js = allJournals()
    const rec1 = json('.bmuz/develop/sprint.json') || { features: [] }
    const stages = json('.bmuz/stages.json') || []
    check('F216 (develop): Design\'s end hands over to Develop, which runs 4.0 Welcome → 4.1 Setup → 4.2 The Roadmap → 4.3 Plan the Sprint, both gates carried by the auto run (nothing approved)', stages.some(s => s.pipeline === 'design') && ['welcome', 'setup', 'roadmap', 'propose', 'plan', 'plan-write', 'features'].every(id => js.some(j => j.ev === 'step.start' && j.step === id)) && js.filter(j => j.ev === 'gate.carried').map(j => j.step).join(',') === 'roadmap-ok,plan-ok' && !js.some(j => j.ev === 'gate.answer'), trailOf(js.slice(0, 40)))
    const sprint = read('.planning/SPRINT.md') || ''
    const cards = rec1.features.map(f => f.id)
    check('F216 (develop): the plan card for each feature in SPRINT.md (You\'ll see · Done when · Not doing yet · Needs from you, tasks 🤖/🙋, Check) and shown word for word', cards.length >= 1 && cards.every(id => new RegExp(`## ${id} [^\\n]+\\nYou'll see: .+\\nDone when: .+\\nNot doing yet: .+\\nNeeds from you: .+\\n- \\[[ x]\\] (🤖|🙋) 1\\. `).test(sprint)) && /^# Sprint 01 — /m.test(sprint) && plain(out1).includes(plain(read('.bmuz/develop/say-plan.md') || '~')), sprint.slice(0, 800))
    const runs1 = json('.bmuz/feature-runs.json') || []
    const flows = js.filter(j => j.ev === 'flow.result')
    // (review fix 11: the fixer runs only when the reviewer confirmed findings; otherwise its step is skipped)
    const fixedOrSkipped = js.filter(j => (j.ev === 'flow.result' && j.step === 'fix') || (j.ev === 'step.skip' && j.step === 'fix')).length
    check('F216 (develop): each feature had a fresh builder, a separate reviewer and the fixer only when there were findings (bmuz:build-flow), each run kept in .bmuz/feature-runs/', runs1.length >= cards.length && cards.every(id => runs1.some(r => r.feature === id && existsSync(join(dir, r.record, 'state.json')))) && ['build', 'review'].every(s => flows.filter(j => j.step === s).length >= cards.length) && fixedOrSkipped >= cards.length, `${JSON.stringify(runs1)} | ${flows.map(j => j.step).join(',')}`)
    const proofs = cards.map(id => json(`.bmuz/develop/${id}.json`))
    const proved = js.filter(j => j.ev === 'check.ran' && (j.step === 'build' || j.step === 'fix'))
    check('F216 (develop): the tests were proven green by the engine\'s script (sprint.mjs prove ran them), fingerprinted under .bmuz/develop/', proofs.every(p => p && p.tests.length > 0 && p.tests.every(t => t.sha && existsSync(join(dir, t.file)))) && proved.some(j => j.exitCode === 0) && spawnSync('npm', ['test'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' }).status === 0, JSON.stringify(proofs.map(p => p && p.tests)))
    check('F216 (develop): every feature shown ready to check (4.5\'s card) and its approval left as a question: nothing approved, the waiting line said', rec1.features.every(f => f.status === 'built') && js.filter(j => j.ev === 'show' && j.step === 'ready').length >= cards.length && /waiting for your OK/.test(read('.bmuz/questions.md') || '') && js.some(j => j.ev === 'loop.waiting') && !/✅ F0/.test(read('.planning/ROADMAP.md') || ''), `${JSON.stringify(rec1.features.map(f => [f.id, f.status]))} | ${trailOf(js.slice(-10))}`)
    // (a helper reaching for Bash is refused by the engine — journaled as a deviation — so every Bash try is a refused one;
    // a command that also reaches outside the project or into .bmuz is refused by that guard first, F230 item 9 run 2)
    const helperBash = js.filter(j => j.ev === 'deviation' && j.tool === 'Bash' && j.agentId)
    check('F216 (develop): the builders ran only through the engine\'s run tool, every Bash try of theirs refused, with nothing allowed but the pre-approvals of auto-run.json', js.some(j => j.ev === 'run') && helperBash.every(j => /^BMUZ engine: (a helper may not use Bash|Bash stays inside this project)/.test(j.why)), trailOf(js.filter(j => j.ev === 'run' || (j.ev === 'deviation' && j.agentId))))
    check('F216 (develop): the auto run never stalled: it ended by itself, no watchdog stop, no BLOCK left standing', !js.some(j => j.ev === 'watchdog' || j.ev === 'watchdog.stopped') && !js.some(j => j.ev === 'blocked' && !runs1.some(r => r.outcome === 'blocked')), trailOf(js.filter(j => /watchdog|blocked|retry/.test(j.ev))))
    // every fixed line the engine handed out in run 1, and every file it showed, in Claude's words word for word
    const lines1 = js.filter(j => j.ev === 'line' && j.kind !== 'box').filter(kept(js))
    const unsaid1 = lines1.filter(j => !plain(out1).includes(plain(j.text)))
    const shows1 = js.filter(j => j.ev === 'show')
    const shownText = { 'plan-write': read('.bmuz/develop/say-plan.md') }
    const unshown1 = shows1.filter(j => shownText[j.step] && !plain(out1).includes(plain(shownText[j.step])))
    check('F216 (develop): every Stage 4 fixed line of the auto run (handed out, or a shown file) is in Claude\'s words word for word', lines1.length > 0 && shows1.length > 0 && unsaid1.length === 0 && unshown1.length === 0, `${unsaid1.map(j => `${j.line}: ${plain(j.text).slice(0, 100)}`).join(' | ')} ${unshown1.map(j => j.step).join(',')}`)
    // run 2: the creative's answers (the project moved on, so bmuz.json says develop now)
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ ...(json('bmuz.json') || {}), pipeline: 'develop', testAnswers: GARDEN_DEVELOP }, null, 2))
    await runUntil(dir, 'bmuz go', tools, sprint2Planned, 3_000_000)
    js = allJournals()
    const tuningAfter = json('content/tuning/game.json') || {}
    // (the tune's own change, as the engine recorded its Edit: the builds may add settings of their own to the same file)
    const tuneRuns = (json('.bmuz/feature-runs.json') || []).map(r => json(`${r.record}/own.json`)).filter(o => o && o.steps && o.steps.tune)
    const changed = tuneRuns.flatMap(o => Object.entries(o.steps.tune).filter(([f]) => /^content\//.test(f)).flatMap(([f, e]) => Object.keys((e && e.keys) || {}).map(k => `${f} ${k}`)))
    void tuningAfter
    const arch = read('.planning/archive/sprints/sprint-01.md') || ''
    check('F216 (develop): a tune answer changed exactly one setting in content/ (the Tuning note in the sprint), then the feature was approved', changed.length === 1 && /Notes: Tuning: /.test(arch) && js.some(j => j.ev === 'step.done' && j.step === 'tune'), `${changed.join(', ')} | ${arch.slice(0, 600)}`)
    check('F216 (develop): only the creative\'s answers approved: every feature of sprint 1 ✅ in the roadmap after run 2', cards.every(id => new RegExp(`^- ✅ ${id} `, 'm').test(read('.planning/ROADMAP.md') || '')), (read('.planning/ROADMAP.md') || '').slice(0, 700))
    check('F216 (develop): the look-back wrote the retro (three lines), archived the sprint and said 4.7\'s lines', /\nRetro:\n- went well: .+\n- went wrong: .+\n- change: .+\n/.test(arch) && js.some(j => j.ev === 'line' && j.line === 'develop.lookback') && js.some(j => j.ev === 'show' && j.step === 'lookback-write'), arch.slice(-400))
    const st2 = json('.bmuz/state.json') || {}
    check('F216 (develop): the loop reached sprint 2 (Develop again from Plan the Sprint, the next ready feature on its plan card)', sprint2Planned() && (json('.bmuz/stages.json') || []).filter(s => s.pipeline === 'develop').length >= 1, `${JSON.stringify({ p: st2.pipeline, cur: st2.current, fin: st2.finished })} | ${(read('.planning/SPRINT.md') || '').slice(0, 200)}`)
    const log = spawnSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).stdout
    check('F216 (develop): committed on a work branch: "F01: built …", "F01: done …", "Sprint 01 done"', /^F01: built — /m.test(log) && /^F01: done — /m.test(log) && /^Sprint 01 done$/m.test(log) && /^dev\//.test(spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout), log)
    const ids = new Set(allJournals().filter(j => j.ev === 'line').map(j => j.line))
    const need = ['develop.welcome', 'develop.setup', 'develop.roadmap', 'develop.approve.box', 'develop.tune', 'develop.tune.try', 'develop.tune.keep', 'develop.lookback', 'develop.waiting']
    check('F216 (develop): the script\'s lines for this run were all said', need.every(id => ids.has(id)) && ['plan-write', 'start', 'ready', 'lookback-write'].every(s => js.some(j => j.ev === 'show' && j.step === s)), `not said: ${need.filter(id => !ids.has(id)).join(', ')}`)
  },

  // F219: Deliver on the garden race at Develop's end (tests/fixtures/garden-developed: v0.1's musts approved, ready to
  // deliver, a dev/vertical-slice branch, a tiny web game). NOTHING REAL: origin is a bare repository in a folder beside
  // it, the "host" is tests/fixtures/fake-host.mjs on 127.0.0.1, and the release scripts' cleanup stands aside.
  // Run 1, an auto run: Develop's end hands over to Deliver, which runs 5.0–5.4 and stops at "Share it?" with nothing
  // merged, tagged, pushed or deployed. Run 2, the creative types "bmuz approve Share it": merged, v0.1.0 tagged,
  // pushed to the local origin only, deployed to the stand-in host, the live check passes; the playtest notes (test
  // answers) land in the roadmap and BUGS.md, and the project goes back to Develop. Run 3, a must not done: "Not ready
  // yet", "finish it first", back to Develop with nothing shared.
  async 'deliver-garden'() {
    const { setupDevelopedGarden } = await import('./fixtures/garden-developed-setup.mjs')
    const dir = gardenScratch('bmuz-garden-deliver')
    const port = 43000 + Math.floor(Math.random() * 1000)
    const { host, origin } = setupDevelopedGarden(dir, { port })
    const server = spawn(process.execPath, [join(here, 'fixtures', 'fake-host.mjs'), host, String(port)], { stdio: 'ignore' })
    const extra = { BMUZ_CLEANUP: join(here, 'fixtures', 'noop-cleanup.sh'), BMUZ_LIVE_TRIES: '4', BMUZ_POLL_MS: '2000' }
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const json = f => { try { return JSON.parse(read(f) || 'null') } catch (e) { return null } }
    const git = (args, cwd = dir) => (spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout || '').trim()
    const allJournals = (d = dir) => {
      const out = []
      const root = join(d, '.bmuz', 'stages')
      if (existsSync(root)) for (const s of readdirSync(root).sort()) { const f = join(root, s, 'journal.jsonl'); if (existsSync(f)) out.push(...readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })) }
      return [...out, ...journalOf(d)]
    }
    // Develop finished with the milestone ready ("onward": deliver), as its look-back leaves it
    const develop = JSON.parse(readFileSync(join(plugin, 'pipelines', 'develop.json'), 'utf8'))
    const finishedDevelop = d => {
      mkdirSync(join(d, '.bmuz'), { recursive: true })
      writeFileSync(join(d, '.bmuz/state.json'), JSON.stringify({ ...E.freshState('develop'), finished: develop.steps.map(s => s.id), status: 'done', results: { onward: 'deliver', at: 'first' } }, null, 2))
      writeFileSync(join(d, 'bmuz.json'), JSON.stringify({ pipeline: 'develop' }, null, 2))
    }
    finishedDevelop(dir)
    const mainBefore = git(['rev-parse', 'main'])
    const shownIn = (out, js) => js.filter(j => j.ev === 'show').filter(j => { const t = read(j.path); return t && t.trim() && !plain(out).includes(plain(t)) })
    try {
      // run 1: the auto run (only auto-run.json's pre-approvals, as overnight)
      const out1 = (await runCollect(dir, 'bmuz go', null, () => (json('.bmuz/state.json') || {}).current === 'share', 1_500_000, extra))
      // (the run's words beside the project, not in it: the release scripts refuse files nobody committed)
      writeFileSync(`${dir}-run-output-1.txt`, out1)
      let js = allJournals()
      const started = [...new Set(js.filter(j => j.ev === 'step.start').map(j => j.step))]
      const st1 = json('.bmuz/state.json') || {}
      check('F219 (deliver): Develop\'s end hands over to Deliver, which runs 5.0 Welcome → 5.1 Release Check → 5.2 Polish & Stand-ins → 5.3 Safety & Legal → 5.4 Build & Share and stops at "Share it?" (the question noted)', (json('.bmuz/stages.json') || []).some(s => s.pipeline === 'develop') && st1.pipeline === 'deliver' && st1.current === 'share' && ['prep', 'welcome', 'check', 'decide', 'polish', 'polish-do', 'safety', 'build'].every(id => started.includes(id)) && js.some(j => j.ev === 'gate.pending' && j.step === 'share') && /Share it\?/.test(read('.bmuz/questions.md') || ''), `${JSON.stringify({ p: st1.pipeline, cur: st1.current })} | ${trailOf(js.slice(-20))}`)
      check('F219 (deliver): the auto run shared nothing: still on dev/vertical-slice, no tag, the local origin\'s main untouched, nothing on the stand-in host, version 0.0.0', git(['rev-parse', '--abbrev-ref', 'HEAD']) === 'dev/vertical-slice' && git(['tag']) === '' && git(['rev-parse', 'main'], origin) === mainBefore && !existsSync(join(host, 'garden-race')) && json('version.json').version === '0.0.0' && !js.some(j => j.ev === 'step.start' && j.step === 'publish'), `${git(['rev-parse', '--abbrev-ref', 'HEAD'])} tags: ${git(['tag'])}`)
      const said1 = js.filter(j => j.ev === 'line' && j.kind !== 'box').filter(kept(js)).filter(j => !plain(out1).includes(plain(j.text)))
      const unshown1 = shownIn(out1, js)
      check('F219 (deliver): every Stage 5 line of run 1 (the welcome, the Release Check, the stand-ins, Safety & Legal, the build card) is in Claude\'s words word for word', js.some(j => j.ev === 'line' && j.line === 'deliver.standins') && ['welcome', 'check', 'safety', 'build'].every(s => js.some(j => j.ev === 'show' && j.step === s)) && said1.length === 0 && unshown1.length === 0, `${said1.map(j => `${j.line}: ${plain(j.text).slice(0, 100)}`).join(' | ')} ${unshown1.map(j => j.step).join(',')}`)
      // run 2: the creative's own "Share it", then their playtest notes (as test answers)
      writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ ...(json('bmuz.json') || {}), pipeline: 'deliver', testAnswers: { notes: { 'Playtest Notes (what happened)': 'Played with my partner and two friends, four games. Three of four games came down to the last card and they asked for a rematch right away. Hail felt too strong late in the game. The rain card text was cut off on my small phone. Someone asked whether you can play weather on your own row. A seasons mode would be fun.' } } }, null, 2))
      const out2 = await runCollect(dir, 'bmuz approve Share it', null, () => (json('bmuz.json') || {}).pipeline === 'develop', 1_500_000, extra)
      writeFileSync(`${dir}-run-output-2.txt`, out2)
      js = allJournals()
      check('F219 (deliver): "bmuz approve Share it" (the creative\'s own words, journaled) ran publish: merged into main, v0.1.0 tagged, pushed to the local origin, deployed to the stand-in host, the live check passed', js.some(j => j.ev === 'gate.answer' && j.step === 'share' && j.answer === 'Share it') && js.some(j => j.ev === 'step.done' && j.step === 'publish') && git(['tag']) === 'v0.1.0' && git(['tag'], origin) === 'v0.1.0' && git(['rev-parse', 'main'], origin) === git(['log', '-1', '--format=%H', '--grep=^Live check for v0.1.0', 'main']) && /Merge dev\/vertical-slice into main/.test(git(['log', '--format=%s', 'main'])) && /version 0\.1\.0/.test(existsSync(join(host, 'garden-race', 'index.html')) ? readFileSync(join(host, 'garden-race', 'index.html'), 'utf8') : '') && /v0\.1\.0 http:\/\/127\.0\.0\.1/.test(read('.planning/live-pass') || ''), `${trailOf(js.filter(j => ['publish', 'share'].includes(j.step)))} | tags ${git(['tag'])}`)
      check('F219 (deliver): nothing reached anything real: the only remote is the folder on this machine, the "live" page is 127.0.0.1, no deploy workflow (no GitHub run)', git(['remote']) === 'origin' && git(['remote', 'get-url', 'origin']) === origin && /\bLive: http:\/\/127\.0\.0\.1:\d+\//.test(read('.planning/STATE.md') || '') && !/\bLive: https?:\/\/(?!127\.0\.0\.1)/.test(read('.planning/STATE.md') || '') && !existsSync(join(dir, '.github')), `${git(['remote', '-v'])}`)
      check('F219 (deliver): the playtest notes landed: each feeling checked, a tuning task and a rulebook question on the roadmap, a bug in BUGS.md (found in Deliver), an idea; the 5.5 lines word for word', js.some(j => j.ev === 'step.done' && j.step === 'notes-write') && /^- 🟢 F\d+ ✨ Tuning: /m.test(read('.planning/ROADMAP.md') || '') && /^### B\d{3} · P[0-3] · open · found \d{4}-\d\d-\d\d in Deliver · Playtest Notes/m.test(read('.planning/BUGS.md') || '') && /^Against the feelings you chose:/.test(read('.bmuz/deliver/say-notes.md') || '') && plain(out2).includes(plain(read('.bmuz/deliver/say-notes.md') || '~')) && js.some(j => j.ev === 'line' && j.line === 'deliver.notes'), `${(read('.bmuz/deliver/say-notes.md') || '').slice(0, 300)} | ${trailOf(js.filter(j => /notes/.test(j.step || '')))}`)
      const st2 = json('.bmuz/state.json') || {}
      check('F219 (deliver): back to Develop at Plan the Sprint (Deliver\'s record kept in .bmuz/stages/)', (json('bmuz.json') || {}).pipeline === 'develop' && st2.pipeline === 'develop' && (json('.bmuz/stages.json') || []).some(s => s.pipeline === 'deliver') && js.some(j => j.ev === 'stage.enter' && j.from === 'deliver' && j.to === 'develop'), JSON.stringify({ p: st2.pipeline, cur: st2.current }))
      const unsaid2 = js.filter(j => j.ev === 'line' && j.kind !== 'box' && /^deliver\./.test(j.line || '')).filter(kept(js)).filter(j => !plain(`${out1}\n${out2}`).includes(plain(j.text)))
      check('F219 (deliver): every Stage 5 fixed line of run 2 (It\'s live, the notes ask, the notes lines) is in Claude\'s words word for word', unsaid2.length === 0 && plain(out2).includes(plain(read('.bmuz/deliver/say-live.md') || '~')), unsaid2.map(j => j.line).join(', '))
    } finally {
      server.kill()
    }

    // run 3: not ready — F03 isn't approved yet; the creative says "finish it first"
    const nr = gardenScratch('bmuz-garden-deliver-nr')
    const { origin: origin3 } = setupDevelopedGarden(nr, { port: 1 })
    writeFileSync(join(nr, '.planning/ROADMAP.md'), readFileSync(join(nr, '.planning/ROADMAP.md'), 'utf8').replace('- ✅ F03 🎮 Weather cards', '- 🎛️ F03 🎮 Weather cards').replace('F03[✅ F03', 'F03[🎛️ F03'))
    spawnSync('git', ['commit', '-qam', 'F03 waits for its OK'], { cwd: nr })
    finishedDevelop(nr)
    writeFileSync(join(nr, 'bmuz.json'), JSON.stringify({ pipeline: 'develop', testAnswers: { notready: { 'Finish it first, or move it to the next stage?': 'Finish it first' } } }, null, 2))
    const out3 = await runCollect(nr, 'bmuz go', null, () => (JSON.parse(readFileSync(join(nr, 'bmuz.json'), 'utf8')).pipeline === 'develop' && existsSync(join(nr, '.bmuz/stages.json')) && /deliver/.test(readFileSync(join(nr, '.bmuz/stages.json'), 'utf8'))), 900_000, extra)
    writeFileSync(`${nr}-run-output.txt`, out3)
    const js3 = allJournals(nr)
    const check3 = existsSync(join(nr, '.bmuz/deliver/say-check.md')) ? readFileSync(join(nr, '.bmuz/deliver/say-check.md'), 'utf8') : ''
    const rm3 = readFileSync(join(nr, '.planning/ROADMAP.md'), 'utf8')
    check('F219 (deliver, not ready): the Release Check names F03 in "Not ready yet: … Want to finish it first, or move it to the next stage?" word for word; "finish it first" sends it back to Develop with v0.1 current again and nothing shared', /✗ 2 of 3 musts for this stage are done/.test(check3) && /Not ready yet: F03 — Weather cards isn't done\. Want to finish it first, or move it to the next stage\?/.test(check3) && plain(out3).includes(plain(check3)) && /^## v0\.1 — Vertical slice {2}← current/m.test(rm3) && !js3.some(j => j.ev === 'step.start' && ['safety', 'build', 'publish'].includes(j.step)) && (spawnSync('git', ['tag'], { cwd: nr, encoding: 'utf8' }).stdout || '').trim() === '' && (spawnSync('git', ['rev-parse', 'main'], { cwd: origin3, encoding: 'utf8' }).stdout || '').trim() === (spawnSync('git', ['rev-parse', 'main'], { cwd: nr, encoding: 'utf8' }).stdout || '').trim() && js3.some(j => j.ev === 'stage.enter' && j.from === 'deliver' && j.to === 'develop'), `${check3} | ${trailOf(js3.filter(j => j.ev !== 'line').slice(-16))}`)
  },

  // F230: Release on the garden race at Deliver's end with its 1.0 build made (tests/fixtures/garden-release-setup.mjs),
  // on STAND-IN platforms only: the release scripts are tests/fixtures/fake-release, the host is fake-host.mjs on
  // 127.0.0.1, itch.io's butler is fake-butler.mjs (copies onto that host), Steam is a page on that host, the research is
  // today's sourced stand-in reports (no research flow runs, no link is fetched). Nothing here reaches anything real.
  // Run 1, an auto run: Deliver's end hands over to Release, "Where should it go?" (test answers: the web, itch.io,
  // Steam), the web's Store & Launch, and it stops at "Release Garden Race on the web?" with nothing public.
  // Runs 2–4, the creative's own "bmuz approve Release it" at each platform's gate: the web goes live (v1.0.0, pushed to
  // the local origin, deployed, checked from outside); itch.io is uploaded and checked; Steam is walked through and
  // marked live only on the creative's link (test answers), then First Reactions → Update 1.1, Look Back → both lists,
  // and the project goes on to Develop for the update.
  async 'release-garden'() {
    const { setupReleaseGarden } = await import('./fixtures/garden-release-setup.mjs')
    const dir = gardenScratch('bmuz-garden-release')
    const port = 44000 + Math.floor(Math.random() * 1000)
    const { host, origin, research } = setupReleaseGarden(dir, { port, research: ['web', 'itch', 'steam'] })
    // the pretend Steam store page (the creative's own, once it's live there)
    mkdirSync(join(host, 'steam', 'garden-race'), { recursive: true })
    writeFileSync(join(host, 'steam', 'garden-race', 'index.html'), '<title>Garden Race on Steam (a stand-in page)</title>')
    const steamLink = `http://127.0.0.1:${port}/steam/garden-race/`
    const server = spawn(process.execPath, [join(here, 'fixtures', 'fake-host.mjs'), host, String(port)], { stdio: 'ignore' })
    const log = `${dir}-release.log`
    rmSync(log, { force: true }) // (an earlier run's calls are not this run's)
    const extra = { BMUZ_RELEASE_TOOLS: join(here, 'fixtures', 'fake-release', 'scripts'), BMUZ_BUTLER: join(here, 'fixtures', 'fake-butler.mjs'), BMUZ_FAKE_RELEASE_LOG: log, BMUZ_RESEARCH_STUB: research, BMUZ_SOURCES_OFFLINE: '1', BMUZ_RECIPES: join(here, 'fixtures', 'no-recipes') }
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const json = f => { try { return JSON.parse(read(f) || 'null') } catch (e) { return null } }
    const git = (args, cwd = dir) => (spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout || '').trim()
    const allJournals = () => {
      const out = []
      const root = join(dir, '.bmuz', 'stages')
      if (existsSync(root)) for (const s of readdirSync(root).sort((a, b) => parseInt(a) - parseInt(b))) { const f = join(root, s, 'journal.jsonl'); if (existsSync(f)) out.push(...readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })) }
      return [...out, ...journalOf(dir)]
    }
    const rec = () => json('.bmuz/release/run.json') || {}
    const atGate = key => () => { const st = json('.bmuz/state.json') || {}; return st.pipeline === 'release' && st.current === 'gate' && rec().current === key }
    // Deliver finished with its 1.0 build made: it hands over to Release from its first step (as its build step says)
    mkdirSync(join(dir, '.bmuz'), { recursive: true })
    const deliver = JSON.parse(readFileSync(join(plugin, 'pipelines', 'deliver.json'), 'utf8'))
    writeFileSync(join(dir, '.bmuz/state.json'), JSON.stringify({ ...E.freshState('deliver'), finished: deliver.steps.map(s => s.id), status: 'done', results: { onward: 'release', at: 'first' } }, null, 2))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({
      pipeline: 'deliver',
      testAnswers: {
        where: { 'Where should it go? (pick any)': ['The web', 'itch.io', 'Steam'] },
        page: { 'The store page, written from your pitch (change anything?)': 'Looks good, keep it as it is.' },
        walk: { 'Each step of the Steam walk-through': 'done', 'Is Garden Race live on Steam?': "Yes, it's live", 'When Steam shows Garden Race live, paste its link here.': steamLink },
        reactions: { 'First Reactions (what players are saying)': 'Reviews so far: five of them say games came down to the last card and they played again straight away. Two say hail is too strong late in the game. One says the rain card text is cut off on a small phone.' },
        lookback: { 'Look Back (change anything?)': 'Keep your two lists as they are.' },
      },
    }, null, 2))
    const mainBefore = git(['rev-parse', 'main'], origin)
    const outs = []
    try {
      // run 1: the auto run (only auto-run.json's pre-approvals, as overnight)
      outs.push(await runCollect(dir, 'bmuz go', null, atGate('web'), 1_500_000, extra))
      writeFileSync(`${dir}-run-output-1.txt`, outs[0])
      let js = allJournals()
      const st1 = json('.bmuz/state.json') || {}
      check('F230 (release): Deliver\'s 1.0 end hands over to Release: 6.0 "Where should it go?" (picked: the web, itch.io, Steam) → the web\'s Store & Launch, and the auto run stops at "Release Garden Race on the web?" (the question noted)', (json('.bmuz/stages.json') || []).some(s => s.pipeline === 'deliver') && st1.pipeline === 'release' && st1.current === 'gate' && JSON.stringify(rec().platforms) === '["web","itch","steam"]' && js.some(j => j.ev === 'gate.pending' && j.step === 'gate' && j.question === 'Release Garden Race on the web?') && /Release Garden Race on the web\?/.test(read('.bmuz/questions.md') || ''), `${JSON.stringify({ p: st1.pipeline, cur: st1.current, rec: rec().platforms })} | ${trailOf(js.slice(-16))}`)
      check('F230 (release): the auto run released nothing: no v1.0.0 tag, the local origin untouched, nothing on the stand-in host, no launch step, no research flow (today\'s research stood in)', !/v1\.0\.0/.test(git(['tag'])) && git(['rev-parse', 'main'], origin) === mainBefore && !existsSync(join(host, 'garden-race')) && !js.some(j => j.ev === 'step.start' && j.step === 'launch') && !js.some(j => j.step === 'research' && j.ev === 'step.start'), `tags: ${git(['tag'])}`)
      // runs 2–4: the creative's own "Release it", once per platform
      outs.push(await runCollect(dir, 'bmuz approve Release it', null, atGate('itch'), 1_500_000, extra))
      writeFileSync(`${dir}-run-output-2.txt`, outs[1])
      js = allJournals()
      check('F230 (release): "bmuz approve Release it" (journaled) put the web live: v1.0.0 tagged and pushed to the local origin, deployed to the stand-in host, checked from outside; "Garden Race is live: … I checked it from outside, and it loads and plays." word for word', js.some(j => j.ev === 'gate.answer' && j.step === 'gate' && j.answer === 'Release it') && git(['tag'], origin).split('\n').includes('v1.0.0') && /version 1\.0\.0/.test(existsSync(join(host, 'garden-race', 'index.html')) ? readFileSync(join(host, 'garden-race', 'index.html'), 'utf8') : '') && (rec().per || {}).web?.status === 'live' && plain(outs[1]).includes(plain(`Garden Race is live: http://127.0.0.1:${port}/garden-race/. I checked it from outside, and it loads and plays.`)) && /^- Live on the web: http:\/\/127\.0\.0\.1/m.test(read('.planning/STATE.md') || ''), `${trailOf(js.filter(j => ['launch', 'gate'].includes(j.step)))} | ${JSON.stringify(rec().per && rec().per.web)}`)
      outs.push(await runCollect(dir, 'bmuz approve Release it', null, atGate('steam'), 1_500_000, extra))
      writeFileSync(`${dir}-run-output-3.txt`, outs[2])
      const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
      check('F230 (release): itch.io, each platform its own Release run: its store page drafted from the pitch (kept), "Release it", 1.0 not released twice, butler (the stand-in) uploaded the build, the page checked from outside', (rec().per || {}).itch?.status === 'live' && /version 1\.0\.0/.test(existsSync(join(host, 'itch', 'garden-race', 'index.html')) ? readFileSync(join(host, 'itch', 'garden-race', 'index.html'), 'utf8') : '') && calls.filter(c => /^release /.test(c)).length === 1 && calls.some(c => /^butler push dist test\/garden-race:html5 --userversion 1\.0\.0$/.test(c)) && /^\*\*Garden Race\*\*$/m.test(read('.planning/release/itch-page.md') || '') && (json('.bmuz/stages.json') || []).filter(s => s.pipeline === 'release').length >= 2, `${calls.join(' | ')} | ${JSON.stringify(rec().per && rec().per.itch)}`)
      outs.push(await runCollect(dir, 'bmuz approve Release it', null, () => (json('bmuz.json') || {}).pipeline === 'develop', 1_800_000, extra))
      writeFileSync(`${dir}-run-output-4.txt`, outs[3])
      js = allJournals()
      const all = outs.join('\n')
      check('F230 (release): Steam walked through step by step (BMUZ uploaded nothing to it) and marked live only on the creative\'s own link, checked from outside', (rec().per || {}).steam?.status === 'live' && rec().per.steam.link === steamLink && js.some(j => j.ev === 'line' && j.line === 'release.walk') && js.some(j => j.ev === 'line' && j.line === 'release.walk.link') && js.some(j => j.ev === 'step.done' && j.step === 'walk-done') && !readFileSync(log, 'utf8').split('\n').some(l => /steam/i.test(l)), `${JSON.stringify(rec().per && rec().per.steam)} | ${trailOf(js.filter(j => /walk/.test(j.step || '')).slice(-12))}`)
      const rm = read('.planning/ROADMAP.md') || ''
      check('F230 (release): First Reactions read against the feelings; the fixes in an "Update 1.1" milestone (current), the bug in BUGS.md (found in Release); "Against your feelings: … Added to the roadmap as Update 1.1." word for word', /^## v1\.1 — Update 1\.1 {2}← current {2}\(→ update\)$/m.test(rm) && /^- 🟢 F\d+ ✨ .+ — must:update$/m.test(rm) && /^### B\d{3} · P[0-3] · open · found \d{4}-\d\d-\d\d in Release · First Reactions/m.test(read('.planning/BUGS.md') || '') && /^Against your feelings: .+ Added to the roadmap as Update 1\.1\.$/m.test(read('.bmuz/release/say-reactions.md') || '') && plain(all).includes(plain(read('.bmuz/release/say-reactions.md') || '~')), `${(read('.bmuz/release/say-reactions.md') || '').slice(0, 300)} | ${rm.split('\n').filter(l => /Update|must:update/.test(l)).join(' / ')}`)
      check('F230 (release): Look Back wrote both lists: the lessons for this game in STATE\'s Key facts, the ones for BMUZ in .planning/bmuz-suggestions.md; then on to Develop at Plan the Sprint for Update 1.1 ("Back to Develop to build Update 1.1.")', /^- Lesson: /m.test(read('.planning/STATE.md') || '') && /^## \d{4}-\d\d-\d\d · Garden Race\n- /m.test(read('.planning/bmuz-suggestions.md') || '') && (json('bmuz.json') || {}).pipeline === 'develop' && js.some(j => j.ev === 'stage.enter' && j.from === 'release' && j.to === 'develop') && plain(all).includes(plain('Back to Develop to build Update 1.1.')), `${trailOf(js.filter(j => /lookback|stage/.test(j.step || j.ev || '')).slice(-10))}`)
      const lines = js.filter(j => j.ev === 'line' && j.kind !== 'box' && /^release\./.test(j.line || '')).filter(kept(js))
      const unsaid = lines.filter(j => !plain(all).includes(plain(j.text)))
      const shownStore = ['the web', 'itch.io', 'Steam'].filter(p => plain(all).includes(plain(`**Store & Launch** · ${p}\nHere's what ${p} needs today:`)))
      const said = new Set(js.filter(j => j.ev === 'line').map(j => j.line))
      const must = ['release.where', 'release.page', 'release.walk', 'release.walk.link', 'release.reactions', 'release.lookback'].filter(id => !said.has(id))
      check('F230 (release): every Stage 6 fixed line found word for word — the welcome and "Nothing goes public without your clear OK.", each platform\'s Store & Launch card, the store page, the walk-through, "is live", First Reactions, Look Back', unsaid.length === 0 && shownStore.length === 3 && must.length === 0 && plain(all).includes(plain('Nothing goes public without your clear OK.')) && js.filter(j => j.ev === 'gate.pending' && j.step === 'gate').length >= 3, `unsaid: ${unsaid.map(j => j.line).join(', ')} · store cards: ${shownStore.join(', ')} · not said: ${must.join(', ')}`)
      check('F230 (release): nothing real was touched: the only remote is the folder on this machine, every live link is 127.0.0.1, butler was the stand-in, no deploy workflow, no research flow ran', git(['remote']) === 'origin' && git(['remote', 'get-url', 'origin']) === origin && !/\bLive( on [^:]+)?: https?:\/\/(?!127\.0\.0\.1)/.test(read('.planning/STATE.md') || '') && Object.values(rec().per || {}).every(p => /^http:\/\/127\.0\.0\.1:/.test(p.link || '')) && !existsSync(join(dir, '.github')) && !js.some(j => j.ev === 'flow.launched' || (j.step === 'research' && j.ev === 'step.start')), `${git(['remote', '-v'])} | ${JSON.stringify(Object.values(rec().per || {}).map(p => p.link))}`)
    } finally {
      server.kill()
    }
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
// Run only when named: `discover` (Discover is no longer a stage since 2026-11-10 — Ideate replaced it — and it searches
// the real web. The full run of 2026-11-10 blocked on cited pages that 404 or have expired certificates, three tries
// running; since F229 the research flow drops dead links itself before the source check — check-sources.mjs --dead,
// proven offline in tests/research-anywhere.node.test.mjs — so that block can't recur).
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
