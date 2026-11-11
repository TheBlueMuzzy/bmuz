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

// The define scenario's stand-in for the creative (bmuz.json "testAnswers"): their answers per talk step, in plain
// words, the way a creative would type them. Claude still has to map them onto the shelves and the result keys.
const DEFINE_ANSWERS = {
  direction: {
    'Where is it played, and which way up?': 'Phone browser, held upright.',
    'Who plays, and against whom?': 'One player, alone. No opponents.',
    'How long is one game, and the controls?': 'About ten minutes; tap to tend, drag to aim the light.',
    'Which moments ARE this game?': 'Waiting out a storm inside the tower with a cup of tea while the lamp keeps turning: that one, from the shelf.',
    'Which feeling matters most?': 'Quiet care: being the calm one who keeps everyone safe. Submission, I think.',
    'You are a…': 'Keep the shelf\'s line: a lighthouse keeper on a small rocky island, looking after the light and the boats.',
    'Which dream?': 'I want to be the keeper of a light that others depend on.',
    'How will we know a player feels it?': 'They stay after the boat is safe, just watching the light turn.',
    'What is it NOT?': 'Not a stressful time-management game. No overlapping timers.',
    'Who is it for?': 'Someone unwinding after work, ten minutes before bed.',
  },
  story: {
    'Write my own, or be guided?': 'Guide me.',
    'What do you do, moment to moment?': 'Tend the lamp: trim, wind and polish.',
    'What gets in your way?': 'Fog and storms.',
    'What does it feel like when it goes well?': 'A boat makes it home and the night goes quiet.',
    'How does one sitting end?': 'Dawn comes and you put the lamp out.',
    'The pitch': 'A cosy lighthouse game where care, not speed, brings the boats home.',
    'Hook and anchor': 'Hook: the light\'s pattern is yours to set. Anchor: a daily tending routine, like a cosy job sim.',
    'Does it feel right?': 'Yes, keep it.',
    'Look at the closest games first (prior art)?': 'No, keep going.',
  },
  bricks: {
    'Core verbs': 'Tend (trim, wind and polish together) and guide boats with the light. Two is enough.',
    'Fun on its own?': 'Tending is fun because the lamp visibly brightens; guiding is fun because the boat answers you.',
    'A mechanism for tend?': 'My own idea: a slow routine you can do in any order, nothing timed.',
    'A mechanism for guide?': 'Take the shelf\'s one about timing the light\'s flash if it is there; no backup needed.',
    'What does the player act on?': 'The lamp, the lens, the fog horn, the boats.',
    'How does a night end, and how does it score?': 'Dawn ends it; you count the boats that made it home. Nobody loses.',
    'What does a good player do that a new one doesn\'t?': 'Knows when to tend the lamp and when to watch the sea.',
    'Theme and tone': 'Lighthouse keeping; cosy and a little lonely.',
  },
  pillars: {
    'Your pillars': '1. Every moment feels like quiet care (a feeling): when we argue about timers, it says no rush. 2. Everything the keeper does, a real keeper once did (a theme rule): when we argue about magic tools, it says keep it real. 3. The storm is weather, never an enemy (a situation): when we argue about losing, it says nobody loses.',
  },
  tensions: {
    'Each tension': 'Keep both, unless it is about timers: then park the timer.',
    'On-ice ideas that fit now': 'Bring in a radio to talk to ships if it is on the shelf; keep everything else on ice.',
    'Anything there because it is cool?': 'No.',
  },
  scope: {
    'The smallest version': 'One night: tend the lamp and guide one boat through fog.',
    'Musts': 'Tending the lamp through one night; guiding one boat in fog.',
    'Later': 'Seasons; more boats; the cottage.',
    'Never': 'Combat, because it breaks quiet care; a fail screen, because nobody loses.',
    'Where and how long': 'Phone browser, alone, about ten minutes, one player.',
    'Your size read': 'Fine at that size.',
  },
  risks: {
    'What could stop it being great?': 'Tending turns into a chore.',
    'The cheapest test': 'A sketch of one night of tending, one hour.',
    'What would make you rethink it?': 'Testers skip the routine to get to the boats.',
  },
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
// Where the script's growth chart says each chapter ends (bmuz-design-doc.html "4 · How the GDD grows").
const CHART = {
  ideate: { 1: 'loose', 2: 'empty', 3: 'loose', 4: 'loose', 5: 'loose', 6: 'loose', 7: 'loose', 8: 'loose', 9: 'empty', 10: 'loose', 11: 'loose', 12: 'loose', 13: 'empty', 14: 'empty' },
  define: { 1: 'chosen', 2: 'chosen', 3: 'chosen', 4: 'chosen', 5: 'chosen', 6: 'chosen', 7: 'chosen', 8: 'loose', 9: 'empty', 10: 'loose', 11: 'loose', 12: 'loose', 13: 'empty', 14: 'empty' },
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

  // F218: the define pipeline end to end in its own scratch project, from a committed lighthouse DISCOVER.md
  // (tests/fixtures/lighthouse-discover: a headless discover run's .planning/, 2026-11-09, kept whole so the shelves
  // are as big as a real run's). A fixture, not another scenario's leftovers: the define check runs alone, the same
  // every time. Define's choices are taste, which an auto run never makes, so bmuz.json "testAnswers"
  // stands in for the creative (allowed only with BMUZ_TEST=1, set here). The run goes digest → … → the concept card →
  // the lock gate (an auto run stops there); "bmuz approve Lock it: on to Design" in a second session runs stage.
  async define() {
    const dir = process.env.BMUZ_DEFINE_PROJECT || join(here, '..', '..', '.scratch', 'bmuz-define-headless')
    const seed = join(here, 'fixtures', 'lighthouse-discover')
    rmSync(join(dir, '.bmuz'), { recursive: true, force: true })
    rmSync(join(dir, '.planning'), { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    cpSync(seed, join(dir, '.planning'), { recursive: true })
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const before = read('.planning/DISCOVER.md')
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'define', testAnswers: DEFINE_ANSWERS }, null, 2))
    const all = () => (read('.bmuz/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
    const run = prompt => {
      const took = Date.now()
      const r = spawnSync('claude', ['-p', prompt, ...base, '--allowedTools', `${TOOLS} ToolSearch`], { cwd: dir, env: { ...env, BMUZ_TEST: '1' }, encoding: 'utf8', input: '', timeout: 3_000_000 })
      const out = (r.stdout || '') + (r.stderr || '')
      console.log(`      (${Math.round((Date.now() - took) / 1000)} s; last lines: ${out.trim().split('\n').slice(-4).join(' / ').slice(0, 400)})`)
      return out
    }
    const out = run('bmuz go')
    const trail = () => all().map(j => j.ev + (j.step ? ':' + j.step : '') + (j.why ? ` (${String(j.why).slice(0, 160)})` : '')).join(' ')
    const UP_TO_LOCK = ['digest', 'direction', 'story', 'bricks', 'pillars', 'fit-check', 'tensions', 'scope', 'risks', 'write', 'concept-lint', 'concept-review', 'review', 'lock']
    const starts = () => [...new Set(all().filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F218: the engine ran every define step in order and stopped at the lock gate (an auto run never answers it)', JSON.stringify(starts()) === JSON.stringify(UP_TO_LOCK) && all().some(j => j.ev === 'gate.pending' && j.step === 'lock'), trail())
    const done = id => (all().find(j => j.ev === 'step.done' && j.step === id) || {}).result || {}
    const n = v => (Array.isArray(v) ? v.length : 0)
    const r = Object.fromEntries(['direction', 'story', 'bricks', 'pillars', 'scope', 'risks'].map(id => [id, done(id)]))
    check('F218: the talk steps chose from the test answers: 1–2 feelings, a 3–5 line story, ≤3 core verbs with mechanisms, 3 pillars that settle arguments, musts and won\'ts, a risk with a test', n(r.direction.primaries) >= 1 && n(r.direction.primaries) <= 2 && n(r.story.story) >= 3 && n(r.story.story) <= 5 && n(r.bricks.coreVerbs) >= 1 && n(r.bricks.coreVerbs) <= 3 && n(r.bricks.mechanisms) >= 1 && n(r.pillars.pillars) === 3 && r.pillars.pillars.every(p => p && p.settles) && n(r.scope.musts) >= 1 && n(r.scope.wont) >= 1 && n(r.risks.risks) >= 1 && r.risks.risks.every(x => x && x.test), JSON.stringify(r).slice(0, 900))
    check('F218: the digest grouped the shelves with brick ids', /^Define run: 1 \(the first Define run\)$/m.test(read('.planning/research/define-digest.md') || '') && /\n- \[EX1\] /.test(read('.planning/research/define-digest.md') || ''))
    check('F218: the fit check wrote its report (tensions, choosing nothing)', /## Tensions\n/.test(read('.planning/research/define-fit.md') || ''), (read('.planning/research/define-fit.md') || '').slice(0, 400))
    check('F218: the concept review wrote its findings', /## Findings\n/.test(read('.planning/research/define-check.md') || ''), (read('.planning/research/define-check.md') || '').slice(0, 400))
    const card = read('.bmuz/last-card.md') || ''
    check('F218: it ended with the engine\'s concept card, naming GDD Part 1 and the lock', /^## Concept.* — ready for you to check\n/.test(card) && /GDD\.md/.test(card) && /\*\*Next:\*\* .*Lock it/.test(card) && out.includes(card.trim().split('\n')[0]), card.slice(0, 600))
    run('bmuz approve Lock it: on to Design')
    check('F218: after "Lock it" the stage step ran and the pipeline finished', all().some(j => j.ev === 'step.done' && j.step === 'stage') && all().some(j => j.ev === 'pipeline.done'), trail())
    const gdd = read('.planning/GDD.md') || ''
    const lint = spawnSync('node', [join(plugin, 'scripts', 'concept-lint.mjs'), '.planning/GDD.md'], { cwd: dir, encoding: 'utf8' })
    check('F218: GDD Part 1 passes the concept lint, nothing core left open, and the GDD is in Design', lint.status === 0 && !/still open: .*(Story|Primary feelings|Pillars|First release)/.test(lint.stdout) && /^Current phase: Design · concept locked \d{4}-\d\d-\d\d \(Define run 1\)$/m.test(gdd) && /\n## Part 2 — The game\n/.test(gdd) && /\n## Changes\n[\s\S]*Concept locked; on to Design/.test(gdd), `${lint.stdout}\n${gdd.slice(0, 600)}`)
    // F218 task 8: the needs spine reached the concept — the frame (asked first, in direction), the rules' shape, the real skill
    check('F218 task 8: the frame was chosen first and the rules\' shape and the real skill reached GDD Part 1', /\*\*Platform:\*\* (?!open)/.test(gdd) && /\*\*Which way up:\*\* (?!open)/.test(gdd) && /\*\*Rules \(shape\):\*\*\n- /.test(gdd) && /\*\*The real skill:\*\*\n- /.test(gdd) && all().filter(j => j.ev === 'step.skip').map(j => j.step).join() === 'prior-art', gdd.slice(gdd.indexOf('### Made of'), gdd.indexOf('### Risks')).slice(0, 1200))
    const after = (read('.planning/DISCOVER.md') || '').split('\n')
    const kept = before.split('\n').every((l, i) => after[i] === l || after[i].startsWith(`${l.trimEnd()} · `))
    const marked = after.filter(l => /→ (chosen|brought in) \(Define run 1\b/.test(l)).length
    check('F218: DISCOVER.md was never trimmed (every line kept, marks only added at line ends) and chosen bricks are marked', kept && marked > 0 && after.length === before.split('\n').length, `kept: ${kept}, marked: ${marked}, lines ${before.split('\n').length} → ${after.length}`)
    const files = []
    const walk = d => { for (const e of readdirSync(join(dir, d), { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name).split('\\').join('/')) }
    walk('.')
    const outside = files.filter(f => !/^(\.bmuz\/|\.planning\/|bmuz\.json$)/.test(f))
    check('F218: nothing was written outside .planning/ and the engine\'s .bmuz/', outside.length === 0, outside.join(', '))
    console.log(`      GDD Part 1: ${(gdd.split('## Part 1 — The concept')[1] || '').split('## Part 2')[0].split('\n').filter(l => /^\*\*/.test(l)).length} fields · DISCOVER.md marks: ${marked} · lint: ${lint.stdout.trim().split('\n')[0]}`)
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
