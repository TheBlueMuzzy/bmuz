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
const LIGHTHOUSE_CONCEPT = 'Lamplight: a cosy game about keeping a lighthouse. You are the keeper of a lighthouse on a small rocky island. The feeling I want most is quiet care: being the calm one who keeps everyone safe. Each night you trim the wick, wind the clockwork and polish the lens while storms roll in, and you guide the fishing boats home with the light. It is not a stressful time-management game: no timers racing you. It reminds me of Unpacking and A Short Hike.'
const ENTRY_CONCEPT_ANSWERS = {
  opening: {
    "Where's your game right now?": 'A concept',
    'What do you want from this pass?': 'Pin it down',
    'Paste it here, or name the files': LIGHTHOUSE_CONCEPT,
  },
  propose: { 'Start there?': 'Start there' },
  ...DEFINE_ANSWERS,
  // (the lighthouse answers gave their own wording for "You are" and "not this", which the concept also says: a run that
  // followed the answers kept nothing word for word — headless 2026-11-10. Here the creative keeps the concept's lines.)
  direction: { ...DEFINE_ANSWERS.direction, 'You are a…': "Keep my concept's own line, word for word.", 'What is it NOT?': "Keep my concept's own line, word for word.", 'Anything my concept already says': 'Keep it, exactly as my concept says it.' },
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
const ENTRY_RULEBOOK_ANSWERS = {
  opening: {
    "Where's your game right now?": 'Something written',
    'What do you want from this pass?': 'Work it out',
    'Paste it here, or name the files': 'Read rules.md in this folder: that is my rulebook, with my playtest notes at the end.',
  },
  propose: { 'Start there?': 'Somewhere else', 'Where would you like to start?': 'Not now' },
}

// ---- F228: Ideate's scenarios (each in its own .scratch/bmuz-ideate-* folder) ----
const IDEATE_GAPS = {
  'Frame — where and how is it played?': 'Phone browser, held upright. One player, alone. About ten minutes a night.',
  'Rules — how does a night end?': 'Dawn ends it; you count the boats that made it home. Nobody loses.',
  'Skill — what does a good player do that a new one doesn\'t?': 'Knows when to tend the lamp and when to watch the sea.',
  'Smallest — the smallest version worth playing?': 'One night, one boat, one storm.',
}
const IDEATE_NOTHING_ANSWERS = {
  opening: { "Where's your game right now?": 'Nothing yet, or just a spark' },
  propose: { 'Start there?': 'Start there' },
  show: { 'In one breath: what\'s the idea?': 'Nothing yet — help me find one', 'Anything I should read?': 'Nothing to read' },
  gaps: {
    'Your ideas — what games do you love playing lately?': 'Cosy games like A Short Hike, and old lighthouse stories.',
    'Feel — a feeling you\'d like a game to give?': 'Quiet care: being the calm one who keeps everyone safe.',
    ...IDEATE_GAPS,
  },
}
const IDEATE_CONCEPT_ANSWERS = {
  opening: { "Where's your game right now?": 'A concept', 'What do you want from this pass?': 'Open it up', 'Your material': LIGHTHOUSE_CONCEPT },
  propose: { 'Start there?': 'Start there' },
  show: { 'Anything else to show me?': "That's everything" },
  gaps: IDEATE_GAPS,
  ...DEFINE_ANSWERS, // (for the second "bmuz go": Define builds on this run's IDEATE.md)
}
const IDEATE_RULEBOOK_ANSWERS = {
  opening: { "Where's your game right now?": 'Something written', 'What do you want from this pass?': 'Open it up', 'Your material': 'Read rules.md in this folder: that is my rulebook, with my playtest notes at the end.' },
  propose: { 'Start there?': 'Start there' },
  show: { 'Anything else to show me?': 'Read the art folder too.' },
  gaps: IDEATE_GAPS,
}
// What every Ideate run must reach: the start moved into Ideate; show → fetch → read → so-far → gaps → save in order;
// version 1 and version 2 of the game so far shown by the engine; IDEATE.md per need with Fixed / Idea / Open lines
// and the creative's words marked; the offer of Define noted (an auto run never answers it).
function ideateChecks(dir, out, { from, quotedBy }) {
  const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
  const all = journalOf(dir)
  const trail = () => all.map(j => j.ev + (j.step ? ':' + j.step : '') + (j.why ? ` (${String(j.why).slice(0, 140)})` : '')).join(' ')
  const starts = [...new Set(all.filter(j => j.ev === 'step.start').map(j => j.step))]
  check(`F228 (${from}): the start moved into Ideate, which ran show → fetch → read → so-far → gaps → save and finished`, JSON.parse(read('bmuz.json') || '{}').pipeline === 'ideate' && all[0]?.ev === 'stage.enter' && JSON.stringify(starts) === JSON.stringify(['show', 'fetch', 'read', 'so-far', 'gaps', 'save']) && all.some(j => j.ev === 'pipeline.done'), trail())
  check(`F228 (${from}): Ideate opened with its intro, once`, all.filter(j => j.ev === 'intro').length === 1 && all.find(j => j.ev === 'intro')?.step === 'show')
  check(`F228 (${from}): the engine showed the game so far twice, each in a turn of its own (version 1 and version 2)`, all.filter(j => j.ev === 'show').map(j => j.step).join(',') === 'so-far,save' && /version 2: with your answers/.test(out) && /\(version 1: what you shared\)/.test(out), trail())
  const so = read('.planning/research/ideate-so-far.md') || ''
  check(`F228 (${from}): version 2 names every need, frame first, with fixed / ideas / open lines and the open questions that matter most`, /^## The game so far.*\(version 2: with your answers\)/.test(so) && so.indexOf('**Frame**') > 0 && so.indexOf('**Frame**') < so.indexOf('**Core loop**') && /\n- (Fixed|Ideas|Open): /.test(so) && /\*\*The open questions that matter most\*\*\n(1\. |- none)/.test(so), so.slice(0, 900))
  const doc = read('.planning/IDEATE.md') || ''
  check(`F228 (${from}): IDEATE.md holds the game so far per need, the creative's own words marked "${quotedBy}"`, /\n### Frame — /.test(doc) && /\n- (Fixed|Idea): .* — run 1 · /.test(doc) && new RegExp(` — run 1 · ${quotedBy.replace(/'/g, "'")}`).test(doc), doc.split('## Runs')[0].slice(-900))
  check(`F228 (${from}): the gap questions added the creative's answers (frame, how it ends)`, /Frame —[^\n]*\n(- [^\n]*\n)*- (Fixed|Idea): "[^"]*(upright|Phone|ten minutes)/i.test(doc) || /(upright|ten minutes)/i.test(so), so.slice(0, 600))
  check(`F228 (${from}): Ideate ended with the offer of Define (an auto run notes it for the creative)`, /Ideate is done\. On to Define\? \(say "bmuz go" to move on\)/.test(read('.bmuz/questions.md') || '') && all.some(j => j.ev === 'stage.offer' && j.to === 'define'), (read('.bmuz/questions.md') || '').slice(0, 400))
  check(`F228 (${from}): no research ran in Ideate`, !all.some(j => j.ev === 'flow.launched'))
}

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

  // F225 (a): "bmuz new" in an empty folder → the start's opening (an auto run takes "Nothing yet") → no proposal
  // question (nothing to read) → Discover's first step, opened with Discover's intro. Stopped there: the rest is the
  // discover scenario's (an hour of research).
  async 'entry-nothing'() {
    const dir = scratch('bmuz-entry-nothing')
    rmSync(join(dir, 'bmuz.json'), { force: true })
    const child = spawn('claude', ['-p', 'bmuz new', ...base, '--allowedTools', TOOLS], { cwd: dir, env, stdio: 'ignore' })
    const took = Date.now()
    const evsIn = () => journalOf(dir)
    for (let i = 0; i < 900 && !evsIn().some(j => j.ev === 'intro') && child.exitCode === null; i++) await wait(1000)
    child.kill('SIGKILL')
    await wait(2000)
    console.log(`      (${Math.round((Date.now() - took) / 1000)} s)`)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const start = (read('.bmuz/stages/1-start/journal.jsonl') || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch (e) { return {} } })
    const trail = js => js.map(j => j.ev + (j.step ? ':' + j.step : '') + (j.why ? ` (${String(j.why).slice(0, 120)})` : '')).join(' ')
    check('F225: "bmuz new" made the folder a BMUZ project and ran the start: opening → intake → propose', JSON.stringify([...new Set(start.filter(j => j.ev === 'step.done').map(j => j.step))]) === JSON.stringify(['opening', 'intake', 'propose']), trail(start))
    const opening = (start.find(j => j.ev === 'step.done' && j.step === 'opening') || {}).result || {}
    const propose = (start.find(j => j.ev === 'step.done' && j.step === 'propose') || {}).result || {}
    check('F228: "Nothing yet" (the auto run\'s pick) went straight to Ideate, nothing read', opening.where === 'nothing' && propose.stage === 'ideate' && ['first', 'show'].includes(propose.at) && /Nothing to read yet/.test(read('.planning/research/intake.md') || '') && !existsSync(join(dir, '.planning/DISCOVER.md')), JSON.stringify({ opening, propose }))
    const now = evsIn()
    const intro = now.find(j => j.ev === 'intro')
    check('F228: the project moved on to Ideate (start\'s record kept) and its first step opened with the intro', JSON.parse(read('bmuz.json') || '{}').pipeline === 'ideate' && now[0]?.ev === 'stage.enter' && now[0]?.from === 'start' && intro?.step === 'show' && intro?.stage === 'ideate' && JSON.parse(read('.bmuz/stages.json') || '[]')[0]?.pipeline === 'start', trail(now))
  },

  // F225 (b): a pasted lighthouse concept, "Pin it down" → the proposal says Define → Define runs with what the concept
  // already chose shown as one-tap Keep, every step in order to the lock gate (an auto run never answers it).
  async 'entry-concept'() {
    const dir = scratch('bmuz-entry-concept')
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'start', testAnswers: ENTRY_CONCEPT_ANSWERS }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch`)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const all = journalOf(dir)
    const trail = () => all.map(j => j.ev + (j.step ? ':' + j.step : '') + (j.why ? ` (${String(j.why).slice(0, 140)})` : '')).join(' ')
    const intake = JSON.parse(read('.planning/research/intake.json') || '{}')
    // Every stage's line is there; how much Define it already covers is the model's reading of the concept ("the
    // feeling I want most" went once to Define's picks, once to Discover's shelf — full check 2026-11-09), so not asserted.
    check('F225: the concept was read and the proposal said Define (pin it down), with the gap map for all six stages', intake.proposal?.stage === 'define' && /## Proposal\n[\s\S]*Ideate \(the material\): [\s\S]*Define \(the blocks\): [\s\S]*Design \(assembling them\): [\s\S]*Develop \(the production model\): [\s\S]*Deliver \(ready to hand over\): [\s\S]*Release \(the public\): /.test(read('.planning/research/intake.md') || ''), JSON.stringify(intake.proposal))
    const discover = read('.planning/DISCOVER.md') || ''
    check('F225: the concept\'s material is on DISCOVER.md\'s shelves in the creative\'s own words, marked "from your material"', (discover.match(/ — run 1 · from your material$/gm) || []).length >= 2 && /\n- From your material: pasted text\n/.test(discover), discover.split('## Runs')[0].slice(-800))
    const UP_TO_LOCK = ['digest', 'direction', 'story', 'bricks', 'pillars', 'fit-check', 'tensions', 'scope', 'risks', 'write', 'concept-lint', 'concept-review', 'review', 'lock']
    const starts = [...new Set(all.filter(j => j.ev === 'step.start').map(j => j.step))]
    check('F225: the project moved on to Define, which ran every step in order to the lock gate', JSON.parse(read('bmuz.json') || '{}').pipeline === 'define' && all[0]?.ev === 'stage.enter' && JSON.stringify(starts) === JSON.stringify(UP_TO_LOCK) && all.some(j => j.ev === 'gate.pending' && j.step === 'lock'), trail())
    check('F225: Define opened with its intro, once', all.filter(j => j.ev === 'intro').length === 1 && all.find(j => j.ev === 'intro')?.step === 'direction')
    // Keep: an item the concept already chose comes back in Define's result, word for word
    const state = JSON.parse(read('.bmuz/state.json') || '{}')
    const given = state.given || {}
    const texts = v => (Array.isArray(v) ? v : [v]).map(x => String(x && typeof x === 'object' ? x.text : x || '').toLowerCase())
    const kept = Object.entries(given).filter(([k, v]) => Array.isArray(v) && v.length && Object.values(state.resultsBy || {}).some(r => r && r[k] !== undefined && texts(r[k]).some(t => texts(v).includes(t))))
    check('F225: what the concept already chose was kept (one tap) in Define\'s results', kept.length >= 1, `given keys: ${Object.keys(given).join(', ')}; direction: ${JSON.stringify((state.resultsBy || {}).direction).slice(0, 300)}`)
    const card = read('.bmuz/last-card.md') || ''
    check('F225: it ended with Define\'s concept card', /^## Concept.* — ready for you to check\n/.test(card) && out.includes(card.trim().split('\n')[0]), card.slice(0, 300))
  },

  // F225 (c): a short rulebook in the folder → read → the proposal screen with its gap map (Design partly: rules
  // written), shown to the creative; "Somewhere else → Not now" stops there, nothing moves.
  async 'entry-rulebook'() {
    const dir = scratch('bmuz-entry-rulebook')
    writeFileSync(join(dir, 'rules.md'), RULEBOOK)
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'start', testAnswers: ENTRY_RULEBOOK_ANSWERS }, null, 2))
    const out = runIn(dir, 'bmuz go', TOOLS, true)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const all = journalOf(dir)
    const trail = () => all.map(j => j.ev + (j.step ? ':' + j.step : '') + (j.why ? ` (${String(j.why).slice(0, 140)})` : '')).join(' ')
    const intake = JSON.parse(read('.planning/research/intake.json') || '{}')
    const md = read('.planning/research/intake.md') || ''
    check('F225: the rulebook file was read (rules.md is the source) and the gap map covers all six stages, Design at least partly', (intake.sources || []).some(s => s.name === 'rules.md') && ['ideate', 'define', 'design', 'develop', 'deliver', 'release'].every(s => intake.gaps?.[s]) && intake.gaps.design !== 'not yet', JSON.stringify({ sources: intake.sources, gaps: intake.gaps }))
    check('F225: the proposal screen: what I read, what it covers, where I\'d start you with one line why, "Start there" first', /\*\*What I read:\*\*\n- "/.test(md) && /\*\*Where I'd start you:\*\* \w+.* — .+/.test(md) && /## Options\n- Start there: /.test(md), md.slice(0, 900))
    check('F225: the rulebook\'s own words are on the shelves, marked "from your material"', /from your material$/m.test(read('.planning/DISCOVER.md') || ''), (read('.planning/DISCOVER.md') || '').slice(0, 400))
    check('F225: the creative was shown the proposal (the engine\'s own turn, F228); "Not now" kept them in the start, nothing moved', /What it already covers/.test(out) && all.some(j => j.ev === 'show' && j.step === 'intake') && JSON.parse(read('bmuz.json') || '{}').pipeline === 'start' && all.some(j => j.ev === 'pipeline.done') && !existsSync(join(dir, '.bmuz/stages.json')) && (all.find(j => j.ev === 'step.done' && j.step === 'propose') || {}).result?.stage === 'later', `${trail()}\n      out: ${out.slice(-400)}`)
  },

  // F228 (a): "Nothing yet" → Ideate helps find one: the game so far from the gap answers alone, then the offer of Define.
  async 'ideate-nothing'() {
    const dir = scratch('bmuz-ideate-nothing')
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'start', testAnswers: IDEATE_NOTHING_ANSWERS }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch`, true)
    ideateChecks(dir, out, { from: 'nothing', quotedBy: "the creative's words" })
  },

  // F228 (b): a pasted concept, "Open it up" → Ideate: the concept's own words on the needs, a gap round, version 2.
  async 'ideate-concept'() {
    const dir = scratch('bmuz-ideate-concept')
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'start', testAnswers: IDEATE_CONCEPT_ANSWERS }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch`, true)
    ideateChecks(dir, out, { from: 'concept', quotedBy: 'from your material' })
    // Then "bmuz go" (the creative's yes to the offer): Define builds on IDEATE.md, frame first, to the lock gate.
    runIn(dir, 'bmuz go', `${TOOLS} ToolSearch`)
    const read = f => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null)
    const all = journalOf(dir)
    const digest = read('.planning/research/define-digest.md') || ''
    check('F228 → F218: "bmuz go" moved on to Define, whose digest reads IDEATE.md by need (frame first), and it reached the lock gate', JSON.parse(read('bmuz.json') || '{}').pipeline === 'define' && /^Read: \.planning\/IDEATE\.md through Ideate run 1/m.test(digest) && /\n### Frame \[FR\]/.test(digest) && all.some(j => j.ev === 'gate.pending' && j.step === 'lock'), `${digest.slice(0, 400)}\n      ${all.map(j => j.ev + (j.step ? ':' + j.step : '')).join(' ').slice(-600)}`)
    const ideate = read('.planning/IDEATE.md') || ''
    const lint = spawnSync('node', [join(plugin, 'scripts', 'concept-lint.mjs'), '.planning/GDD.md'], { cwd: dir, encoding: 'utf8' })
    check('F228 → F218: the concept lint passes against IDEATE.md\'s marks; what Define chose is marked there, nothing removed', lint.status === 0 && /→ chosen \(Define run 1/.test(ideate) && /from IDEATE\.md's shelves/.test(read('.planning/GDD.md') || ''), `${lint.stdout}`)
  },

  // F228 (c): a rulebook file and an art folder → Ideate reads the text, lists the art by what it appears to be.
  async 'ideate-rulebook'() {
    const dir = scratch('bmuz-ideate-rulebook')
    writeFileSync(join(dir, 'rules.md'), RULEBOOK)
    mkdirSync(join(dir, 'art'), { recursive: true })
    writeFileSync(join(dir, 'art', 'lamp.psd'), Buffer.from([56, 66, 80, 83, 0, 1, 0, 0]))
    writeFileSync(join(dir, 'bmuz.json'), JSON.stringify({ pipeline: 'start', testAnswers: IDEATE_RULEBOOK_ANSWERS }, null, 2))
    const out = runIn(dir, 'bmuz go', `${TOOLS} ToolSearch`, true)
    ideateChecks(dir, out, { from: 'rulebook', quotedBy: 'from your material' })
    const shared = readFileSync(join(dir, '.planning/research/shared.md'), 'utf8')
    check('F228: the rulebook was read and the art listed by what it appears to be, not read', /\n- rules\.md \(\d+ characters/.test(shared) && /\n- art\/lamp\.psd — a Photoshop file \(art\)/.test(shared), shared.slice(0, 700))
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
