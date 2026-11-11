// The mod under `claude plugin test`: the real hooks, a fake project in memory beneath them.
import { expect, mock, test } from 'claude-code/testing'

const PIPE = {
  id: 'hello',
  version: 1,
  steps: [
    { id: 'name', kind: 'talk', needs: [], tools: ['AskUserQuestion'], craft: 'craft/name.md', done: { type: 'result-has', key: 'name' } },
    { id: 'approve', kind: 'gate', needs: ['name'], question: 'Approve {name}?', options: ['Change the name', 'Approve'], approve: 'Approve', backTo: 'name' },
    { id: 'plan', kind: 'script', needs: ['approve'], run: ['node', 'x.mjs'], writes: ['plan.json'], done: { type: 'file-json-has', path: 'plan.json', key: 'name' } },
    { id: 'review', kind: 'talk', needs: ['plan'], tools: ['Read', 'Glob', 'Grep'], craft: 'craft/review.md', handoff: true, done: { type: 'result-has', key: 'verdict' } },
  ],
}

// A hand-off card with every part (F213, docs/handoff-card.md).
const CARD = { title: 'Hello page for Moon Goat', done: 'it matches the plan', see: 'a heading', try: 'open hello.html', proof: ['read both files'], todos: 'none', next: 'nothing to type' }

function state(over: Record<string, unknown>) {
  return JSON.stringify({ pipeline: 'hello', current: null, status: 'idle', results: { name: 'Moon Goat' }, retries: {}, finished: [], blocked: null, startedAt: 1, ...over })
}

// F215 review fix 3: a crash part way through: the n-th write or delete inside /proj/.bmuz/ from now on fails (and so
// does everything after it in that run), as if the window closed there. 0 = no crash.
const crash = { at: 0, seen: 0, down: false }
function crashes(path: string) {
  if (!crash.at || !path.startsWith('/proj/.bmuz/')) return false
  if (crash.down) return true
  crash.seen += 1
  if (crash.seen >= crash.at) crash.down = true
  return crash.down
}

// A fake disk and session beneath the plugin. Returns the files, the calls the tools got, and the runs.
// onRun: what a command answers (default: exit 0, "{}").
function world(on: any, files: Record<string, string>, onRun?: (argv: string[]) => { exitCode: number, stdout: string }) {
  const reached: string[] = []
  const runs: string[][] = []
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('session.id', () => ({ value: 'test-session' }))
  // the plugin reads its pipeline from its own folder: any path ending in pipelines/hello.json is PIPELINE
  // (the engine hands paths over in the platform's spelling, C:\proj\... on Windows)
  const key = (p: string) => {
    const unix = p.split(String.fromCharCode(92)).join('/').replace(/^[A-Za-z]:/, '')
    if (/pipelines.hello[.]json$/.test(unix)) return 'PIPELINE'
    // (F225: other pipelines, for stage switches, are PIPELINE:<name>)
    const other = unix.match(/plugin\/pipelines\/([\w-]+)[.]json$/) || unix.match(/\/pipelines\/([\w-]+)[.]json$/)
    if (other && !unix.startsWith('/proj/')) return `PIPELINE:${other[1]}`
    // (F232: the plugin's script, <root>/script.md, is SCRIPT)
    if (/\/script[.]md$/.test(unix) && !unix.startsWith('/proj/')) return 'SCRIPT'
    // craft notes live in the plugin too: <root>/craft/x.md is craft/x.md
    const craft = unix.match(/(craft\/[\w-]+[.]md)$/)
    return craft ? craft[1] : unix
  }
  on('fs.exists', (_: any, e: any) => ({ value: key(e.path) in files }))
  on('fs.read', (_: any, e: any) => (key(e.path) in files ? { value: files[key(e.path)] } : { deny: 'ENOENT' }))
  on('fs.write', (_: any, e: any) => {
    if (crashes(key(e.path))) return { deny: 'the window was closed (test crash)' }
    files[key(e.path)] = e.text
    return { value: undefined }
  })
  on('tool.register', (_: any, e: any) => ({ value: { tool: `mcp__bmuz__${e.name}` } }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_: any, e: any) => {
    runs.push([...e.argv])
    // the engine's own delete (rollback, a stage switch moving checkpoints away) really deletes on the fake disk
    if (/rm[.]mjs$/.test(String(e.argv[1] ?? ''))) {
      if (crashes(key(String(e.argv[2])))) return { deny: 'the window was closed (test crash)' }
      delete files[key(String(e.argv[2]))]
    }
    const said = onRun ? onRun([...e.argv]) : { exitCode: 0, stdout: '{}' }
    return { value: { ...said, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', (_: any, e: any) => { reached.push(String(e.tool)); return { result: 'ran' } })
  files['/proj/bmuz.json'] = '{"pipeline":"hello","watchdogTickMs":3600000}'
  return { files, reached, runs }
}

// A refusal reaches a plugin's own call as { deny }, a session's as an errored result.
function refused(r: any) {
  return typeof r?.deny === 'string' || r?.isError === true
}

function why(r: any) {
  return String(r?.deny ?? r?.text)
}

function base(over: Record<string, unknown>) {
  return { PIPELINE: JSON.stringify(PIPE), 'craft/name.md': 'Ask the name.', 'craft/review.md': 'Review it.', '/proj/.bmuz/state.json': state(over) } as Record<string, string>
}

async function start($: any, interactive: boolean) {
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: interactive })
}

test('check 1: a tool from a later step is refused, and the deviation is journaled', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  // a live window: someone is there to answer, so the step's question is allowed
  await start($, true)
  const write: any = await $.tool.call({ tool: 'Write', file_path: '/proj/x.txt', content: 'x' } as any)
  expect(refused(write)).toBe(true)
  expect(why(write)).toMatch(/out of order/)
  const ask: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(ask)).toBe(false)
  expect(w.reached).toEqual(['AskUserQuestion'])
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"deviation".*"tool":"Write"/)
})

test('check 15 (fix 1): an auto run never asks; its questions land in questions.md with the default taken', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, false) // nobody can answer: an auto run
  const ask: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(ask)).toBe(true)
  expect(why(ask)).toMatch(/auto run, nobody is here to answer/)
  const done: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { name: 'Moon Goat', asks: [{ question: 'Name the game?', picked: 'Moon Goat' }] } } as any)
  expect(refused(done)).toBe(false)
  expect(w.files['/proj/.bmuz/questions.md']).toMatch(/- \[ \] \d{4}-\d\d-\d\d · step name: Name the game\? — went with: Moon Goat/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).results).toEqual({ name: 'Moon Goat' }) // "asks" isn't a result
})

test('check 15 (fix 1): an auto run whose turn ends without step_done is told nobody is coming, then BLOCKS', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, false)
  for (let i = 0; i < 3; i++) await $.turn.complete({ answer: 'Red or blue?', durationMs: 1, isAborted: false, turnId: `t${i}` } as any)
  expect(prompts.filter(p => /nobody will answer/.test(p)).length).toBe(2)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.status).toBe('blocked')
})

test('check 15: a session that lists the question tool but refuses it (a background session) turns into an auto run', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'not available in this session', isError: true }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, true) // says it's interactive, like a background session does
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"auto.detected"/)
  await $.turn.complete({ answer: 'What is your game called?', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  expect(prompts.some(p => /nobody will answer/.test(p))).toBe(true) // the turn-end rule keeps it moving
})

test('live check 2026-11-08: a person pressing Esc on the question does not make the session an auto run', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: "The user doesn't want to proceed with this tool use. The tool use was rejected.", isError: true }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, true)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(w.files['/proj/.bmuz/journal.jsonl']).not.toMatch(/"ev":"auto.detected"/)
  // still a person's window: plan mode may hand in its plan
  const exit: any = await $.tool.call({ tool: 'ExitPlanMode' } as any)
  expect(refused(exit)).toBe(false)
})

// The refusal Claude Code gave in the live run (2026-11-10 14:37, Ideate's gaps), word for word.
const SHAPE_REFUSAL = '<tool_use_error>InputValidationError: This call included a question with fewer than 2 options, so it was rejected and the person never saw it. A question with a single option has no decision in it. Do not retry this call and do not invent a filler second option. Instead, state the one path you were going to offer as the approach you are taking, then continue with the task.\n\n[\n  {\n    "origin": "array",\n    "code": "too_small",\n    "minimum": 2,\n    "inclusive": true,\n    "path": [\n      "questions",\n      3,\n      "options"\n    ],\n    "message": "Too small: expected array to have >=2 items"\n  }\n]</tool_use_error>'

test('F231: a question box Claude Code refuses for its shape is a failed ask, never "nobody is here" (live run: the rest ran unattended)', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: SHAPE_REFUSAL, isError: true }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, true)
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Who plays?', options: [{ label: 'Two people' }, { label: 'Four' }] }] } as any)
  expect(JSON.stringify(r)).toMatch(/fewer than 2 options/) // handed back to Claude as it is
  expect(w.files['/proj/.bmuz/journal.jsonl']).not.toMatch(/"ev":"auto.detected"/)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"ask.refused","step":"name"/)
  // still a live window: the next question goes through, not "auto run, nobody is here"
  const again: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(why(again)).not.toMatch(/auto run/)
})

// A live talk step with a 1 s watchdog ticking every 500 ms; prompts recorded.
function stallWorld(on: any) {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push(String(e.text)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('turn.start', (_: any, e: any) => ({ text: e.text, turnId: e.turnId }))
  const w = world(on, base({ current: 'name', status: 'working', startedAt: 1000 }))
  w.files['/proj/bmuz.json'] = '{"pipeline":"hello","watchdogMs":1000,"watchdogTickMs":500}'
  const evs = (ev: string) => (w.files['/proj/.bmuz/journal.jsonl'] || '').split('\n').filter(l => l.includes(`"ev":"${ev}"`)).length
  return { w, prompts, evs }
}

// A live start picks the run up from a timer: let that turn end, so the step is running before the test begins.
async function pickedUp($: any, clock: any) {
  await clock.advance(1600)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't0' } as any)
}

test('F231: the watchdog never counts a step as stalled while its question box waits on the creative; the clock restarts at their answer', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let answer: (v: any) => void = () => {}
  on('tool.call', { tool: 'AskUserQuestion' }, () => new Promise(res => { answer = res }))
  const { evs } = stallWorld(on)
  await start($, true)
  const asked: any = $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Where is your game?', options: [{ label: 'a' }, { label: 'b' }] }] } as any)
  await clock.advance(10_000) // the creative is away; the box stays open
  expect(evs('watchdog')).toBe(0)
  answer({ result: 'Your questions have been answered: "Where is your game?"="a".' })
  await asked
  await clock.advance(600) // just answered: not stalled
  expect(evs('watchdog')).toBe(0)
  await clock.advance(2000) // then nothing for longer than the limit: a stall as before
  expect(evs('watchdog')).toBe(1)
})

test('F231: a stall seen while a turn runs is held to that turn\'s end, and dropped when the creative answered meanwhile', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const { prompts, evs } = stallWorld(on)
  await start($, true)
  await pickedUp($, clock)
  await $.turn.start({ text: '', turnId: 't1' } as any)
  await clock.advance(5000)
  expect(evs('watchdog.held')).toBe(1)
  expect(evs('retry')).toBe(0) // no restart sent behind the running turn
  await $.prompt.submit({ text: 'here are my notes' } as any) // the creative answers
  const before = prompts.length
  await $.turn.complete({ answer: 'Thanks.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(evs('watchdog.dropped')).toBe(1)
  expect(evs('retry')).toBe(0)
  expect(prompts.slice(before).some(p => /^BMUZ step "name"/.test(p))).toBe(false)
})

test('F231: a held stall with no answer meanwhile restarts the step at the turn\'s end', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const { prompts, evs } = stallWorld(on)
  await start($, true)
  await pickedUp($, clock)
  await $.turn.start({ text: '', turnId: 't1' } as any)
  await clock.advance(5000)
  expect(evs('retry')).toBe(0)
  await $.turn.complete({ answer: 'Working on it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(evs('retry')).toBe(1)
  expect(prompts.some(p => /^BMUZ step "name"/.test(p))).toBe(true)
})

test('F231: the engine refuses a question with one option (or more than 4) itself, plainly, before Claude Code sees it', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, true)
  const one: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Which frame?', header: 'Frame', options: [{ label: 'The arcade one' }] }] } as any)
  expect(why(one)).toMatch(/"Frame" has 1 option; the question box takes 2 to 4 real options/)
  const five: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Pick', options: ['a', 'b', 'c', 'd', 'e'].map(label => ({ label })) }] } as any)
  expect(why(five)).toMatch(/has 5 options/)
  expect(w.reached).not.toContain('AskUserQuestion')
  const two: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Pick', options: [{ label: 'a' }, { label: 'b' }] }] } as any)
  expect(refused(two)).toBe(false)
})

test('live look 2026-11-10: a question box closed without an answer (an empty "Type something.") is not nudged; the next open turn is', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let reply: any = { result: 'User rejected tool use', isError: true }
  on('tool.call', { tool: 'AskUserQuestion' }, () => reply)
  const { w, prompts } = shown(on)
  await start($, true)
  const nudged = () => prompts.filter(p => /^BMUZ engine — this message comes from the BMUZ engine, not the creative \(step "ask"\)/.test(p)).length
  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Your material?' }] } as any)
  expect(w.files['/proj/.bmuz/journal.jsonl']).not.toMatch(/"ev":"auto.detected"/)
  await $.turn.complete({ answer: 'Nothing came through. Paste it as your next message, or say carry on.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(nudged()).toBe(0)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"ask.declined"/)
  // a later turn that stalls without the box is nudged as before
  await $.turn.complete({ answer: 'Some thoughts.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  expect(nudged()).toBe(1)
})

// ---- F232 task 2: the script — Claude asks for a line by id, the engine hands back the exact words; free answers in
// the chat (the next message is the answer, F228's ask for links generalised), choices in the script's own boxes ----
const SAY = 'mcp__bmuz__say'
const ASK = 'Share your links — paste them with Alt+V. I can read Google Drive folder and/or doc links, GitHub links, and even folder and file links from your computer. If you don\'t want to share any links, just say "never mind".'
const BAND = { component: 'AbovePrompt', props: { bodyColumns: 120, hasSurvey: false, isWorking: false, maxRows: 30 } }
// A small script, in the plugin's format (plugin/script.md).
const SCRIPT = [
  '# Test script', '',
  '## ideate.material · free', '**Your Material**', ASK, '',
  '## ideate.idea · free', '**Your Idea**', 'Tell me about your game in your own words.', '',
  '## define.pitch · say', '**The Pitch**', 'The game in a few lines, so anyone gets it in ten seconds.', '',
  '## define.pitch.how · box', '? How\'s that?', 'header: The pitch', '- Keep it', '- Change something — next, tell me what', '',
  '## define.long · say', 'x '.repeat(200).trim(), '',
  '## define.lock.box · box', '? Lock the concept?', 'header: Lock', '- Not yet: change something — next, tell me what', '- Lock it: on to Design', '',
].join(String.fromCharCode(10))

// The "shown" world, its step "ask" saying script lines; every prompt keeps its context lines (prompts[i]).
function sayWorld(on: any, opening: string[] | null = null) {
  const s = shown(on)
  const p = JSON.parse(s.w.files.PIPELINE)
  p.steps[0].lines = ['ideate.material', 'ideate.idea', 'define.pitch', 'define.pitch.how', 'define.long']
  if (opening) p.steps[0].opening = opening
  s.w.files.PIPELINE = JSON.stringify(p)
  s.w.files.SCRIPT = SCRIPT
  return s
}
const nudges = (prompts: string[]) => prompts.filter(p => /^BMUZ engine — this message comes from the BMUZ engine, not the creative \(step "ask"\)/.test(p)).length
const events = (w: any) => w.files['/proj/.bmuz/journal.jsonl'].split('\n').filter(Boolean).map((l: string) => JSON.parse(l))
const said = (r: any) => JSON.parse(String(r.result))

test('F232: a free line comes back word for word and opens "the next message is the answer"; said as written, the turn ends open with no nudge', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  await start($, true)
  const r: any = await $.tool.call({ tool: SAY, line: 'ideate.material' } as any)
  expect(refused(r)).toBe(false)
  expect(said(r).say).toBe(`**Your Material**${String.fromCharCode(10)}${ASK}`)
  expect(said(r).then).toMatch(/whole reply .* end your turn\. The creative's next chat message is the answer/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).ask).toMatchObject({ step: 'ask', line: 'ideate.material' })
  const ui = await $.ui.mount({ plugin: 'bmuz', surface: 'terminal', ...BAND } as any)
  expect(await ui.find({ type: 'Text', text: /^BMUZ · / })).toBeDefined()
  expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
  await ui.unmount()
  await $.turn.complete({ answer: `Your Material${String.fromCharCode(10)}${ASK}`, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(nudges(prompts)).toBe(0)
  expect(events(w).find((j: any) => j.ev === 'said')).toMatchObject({ lines: ['ideate.material'], missing: [] })
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"ask.waiting"/)
})

test('F232: the creative\'s next message is the answer — journaled with its line, the question closed, Claude told to take its links', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  await start($, true)
  await $.tool.call({ tool: SAY, line: 'ideate.material' } as any)
  const links = 'https://drive.google.com/drive/folders/abc1234567\nhttps://github.com/TheBlueMuzzy/lamp C:\\Users\\Muzzy\\notes'
  await $.prompt.submit({ text: links } as any)
  expect(events(w).find((j: any) => j.ev === 'answer')).toMatchObject({ step: 'ask', line: 'ideate.material', via: 'typed', text: links })
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).ask).toBeNull()
  const last = prompts[prompts.length - 1]
  expect(last.startsWith(links)).toBe(true)
  expect(last).toMatch(/this message answers your ask for links/)
  // any other free line: told which line it answers
  await $.tool.call({ tool: SAY, line: 'ideate.idea' } as any)
  await $.prompt.submit({ text: 'A card game about gardens.' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/the creative's answer to the script line "ideate\.idea"/)
})

test('F232: "never mind" closes the ask for links as no material', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  await start($, true)
  await $.tool.call({ tool: SAY, line: 'ideate.material' } as any)
  await $.prompt.submit({ text: '"Never mind."' } as any)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).ask).toBeNull()
  expect(prompts[prompts.length - 1]).toMatch(/said "never mind" to sharing links: carry on with the step with no material/)
  expect(events(w).find((j: any) => j.ev === 'ask.closed')).toMatchObject({ never: true })
})

test('F232: an open question survives a new window, and a "bmuz go" resume says the same words again', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  const open = { step: 'ask', line: 'ideate.material', text: `**Your Material**\n${ASK}` }
  w.files['/proj/.bmuz/state.json'] = JSON.stringify({ ...JSON.parse(w.files['/proj/.bmuz/state.json']), ask: open })
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  expect(prompts.some(p => p.includes(`Your question (script line "ideate.material") is still open: write exactly this as your whole reply and end your turn — **Your Material**\n${ASK}`))).toBe(true)
  // ("bmuz go" itself is not the answer)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).ask).toEqual(open)
})

test('F232: a line not written word for word gets the engine\'s correction with the exact words (at most twice)', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  await start($, true)
  await $.tool.call({ tool: SAY, line: 'define.pitch' } as any)
  await $.turn.complete({ answer: 'The Pitch: the game in a few short lines.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const fix = prompts[prompts.length - 1]
  expect(fix).toMatch(/The script line "define\.pitch" was not written word for word\. Write exactly this, nothing changed, then carry on:/)
  expect(fix).toMatch(/\*\*The Pitch\*\*\nThe game in a few lines, so anyone gets it in ten seconds\.$/)
  expect(events(w).find((j: any) => j.ev === 'said')).toMatchObject({ lines: ['define.pitch'], missing: ['define.pitch'] })
  // the corrected turn passes
  await $.turn.complete({ answer: 'The Pitch\nThe game in a few lines, so anyone gets it in ten seconds.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  expect(events(w).filter((j: any) => j.ev === 'said')[1]).toMatchObject({ missing: [] })
})

test('F232: a box comes from the script — asked exactly it reaches the creative; reworded, or with no line asked for, it is refused', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = sayWorld(on)
  await start($, true)
  const none: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Happy?', header: 'x', options: [{ label: 'Yes' }, { label: 'No' }] }] } as any)
  expect(why(none)).toMatch(/every question box in this step comes from the script/)
  const r: any = await $.tool.call({ tool: SAY, line: 'define.pitch.how' } as any)
  const box = said(r).box
  expect(box).toEqual({ question: 'How\'s that?', header: 'The pitch', multiSelect: false, options: [{ label: 'Keep it', description: '' }, { label: 'Change something', description: 'next, tell me what' }] })
  const reworded: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ ...box, options: [{ label: 'Keep it' }, { label: 'Change it' }] }] } as any)
  expect(why(reworded)).toMatch(/must have exactly the script's options/)
  const ok: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [box] } as any)
  expect(refused(ok)).toBe(false)
  expect(w.reached).toContain('AskUserQuestion')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).boxes).toEqual([])
})

test('F232: a step with an opening says it first — step_done, a box or another line before it are refused', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = sayWorld(on, ['ideate.idea'])
  await start($, true)
  expect(why(await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { priorArt: 'no' } } as any))).toMatch(/opens with its script line first: call mcp__bmuz__say with \{"line": "ideate\.idea"\}/)
  expect(why(await $.tool.call({ tool: SAY, line: 'define.pitch' } as any))).toMatch(/this step opens with "ideate\.idea": say that first/)
  expect(why(await $.tool.call({ tool: SAY, line: 'nope' } as any))).toMatch(/isn't one of this step's lines/)
  const r: any = await $.tool.call({ tool: SAY, line: 'ideate.idea' } as any)
  expect(refused(r)).toBe(false)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).opened).toBe('ask')
})

test('F232: a long line is shown in a turn of its own; at its end the engine carries the step on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  await start($, true)
  const r: any = await $.tool.call({ tool: SAY, line: 'define.long' } as any)
  expect(said(r).then).toMatch(/no question box in this turn/)
  await $.turn.complete({ answer: 'x '.repeat(200).trim(), durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/^BMUZ engine — this message comes from the BMUZ engine, not the creative: carry on with step "ask"/)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"continue","step":"ask"/)
})

test('F232 review: a long line said again and again without step_done is carried on twice at most, then left to the stall path', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = sayWorld(on)
  await start($, true)
  const carry = () => prompts.filter(p => /^BMUZ engine — this message comes from the BMUZ engine, not the creative: carry on with step "ask"/.test(p)).length
  for (let i = 1; i <= 4; i++) {
    await $.tool.call({ tool: SAY, line: 'define.long' } as any)
    await $.turn.complete({ answer: 'x '.repeat(200).trim(), durationMs: 1, isAborted: false, turnId: `t${i}`, reason: 'answer' } as any)
  }
  expect(carry()).toBe(2)
  expect(w.files['/proj/.bmuz/journal.jsonl'].match(/"ev":"continue","step":"ask"/g)?.length).toBe(2)
})

// (headless design-garden 2026-11-11: Players & Opponents finished after its opening, its other lines never said)
for (const live of [true, false]) {
  test(`F232 review: step_done before the step's "must" lines were said is refused, naming them (${live ? 'live' : 'auto'} run); said, it passes`, async ($, on) => {
    mock.clock(on, { now: 1000 })
    const { w } = sayWorld(on)
    const p = JSON.parse(w.files.PIPELINE)
    p.steps[0].must = ['define.pitch', 'define.pitch.how']
    w.files.PIPELINE = JSON.stringify(p)
    await start($, live)
    await $.tool.call({ tool: SAY, line: 'define.pitch' } as any)
    const early: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { priorArt: 'no' } } as any)
    expect(String(early.result)).toMatch(/^Not done: the step isn't finished: the script's line "define\.pitch\.how" was never said\. Say it with mcp__bmuz__say/)
    expect(JSON.parse(w.files['/proj/.bmuz/state.json']).finished).toEqual([])
    await $.tool.call({ tool: SAY, line: 'define.pitch.how' } as any)
    const ok: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { priorArt: 'no' } } as any)
    expect(String(ok.result)).toMatch(/^Recorded/)
    expect(JSON.parse(w.files['/proj/.bmuz/state.json']).said).toBe(null)
  })
}

test('F232: in an auto run a free line opens no question (nobody will type) and the box is never asked', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = sayWorld(on)
  await start($, true)
  await $.prompt.submit({ text: 'bmuz auto' } as any)
  const r: any = await $.tool.call({ tool: SAY, line: 'ideate.material' } as any)
  expect(said(r).then).toMatch(/^Auto run: write exactly the "say" text now, as text in your reply before any other tool call; then take the creative.s answer from the test answers/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).ask ?? null).toBeNull()
  const b: any = await $.tool.call({ tool: SAY, line: 'define.pitch.how' } as any)
  expect(said(b).then).toMatch(/Auto run: nobody can answer the box/)
  expect(why(await $.tool.call({ tool: 'AskUserQuestion', questions: [said(b).box] } as any))).toMatch(/auto run, nobody is here to answer/)
})

test('F232: the say tool in a step without script lines is refused', async ($, on) => {
  mock.clock(on, { now: 1000 })
  shown(on)
  await start($, true)
  expect(why(await $.tool.call({ tool: SAY, line: 'define.pitch' } as any))).toMatch(/has no script lines to say/)
})

test('F232: a gate with a script box asks its words: an auto run notes the script\'s question; "bmuz approve" takes the box\'s options', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push(String(e.text)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: null, status: 'idle', finished: ['name'] }))
  w.files.SCRIPT = SCRIPT
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: [PIPE.steps[0], { id: 'approve', kind: 'gate', needs: ['name'], line: 'define.lock.box', approve: 'Lock it: on to Design', backTo: 'name' }] })
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  expect(events(w).find((j: any) => j.ev === 'gate.pending')).toMatchObject({ step: 'approve', question: 'Lock the concept?', options: ['Not yet: change something', 'Lock it: on to Design'] })
  await $.prompt.submit({ text: 'bmuz approve Lock it: on to Design' } as any)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).finished).toContain('approve')
})

test('F232: a pipeline naming a line the script doesn\'t have refuses to run, with the reason', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = sayWorld(on)
  const p = JSON.parse(w.files.PIPELINE)
  p.steps[0].lines.push('define.nope')
  w.files.PIPELINE = JSON.stringify(p)
  await start($, true)
  expect(why(await $.tool.call({ tool: 'Read', file_path: '/proj/x' } as any))).toMatch(/the line "define\.nope" isn't in the script/)
})

test('F231: the engine\'s own tool rows draw as one dim line, never their raw JSON (ctrl+o still shows all)', async ($, on) => {
  mock.clock(on, { now: 1000 })
  world(on, base({ current: 'name', status: 'working' }))
  await start($, true)
  const row = (tool: string, output: unknown, more: Record<string, unknown> = {}) => ({ tool_use_id: 'toolu_1', tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, output, ...more })
  const cases: [string, unknown, string][] = [
    [SAY, JSON.stringify({ say: ASK, then: 'Write exactly the "say" text' }), 'BMUZ · script line'],
    ['mcp__bmuz__step_done', 'Step name done.', 'BMUZ · step recorded'],
    ['mcp__bmuz__step_done', 'Not done: the result has no "name". Fix it and call mcp__bmuz__step_done again (retry 1 of 2).', 'BMUZ · step not done yet'],
  ]
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const [tool, output, label] of cases) {
      const ui = await $.ui.mount({ plugin: 'bmuz', surface, component: 'ToolUse', props: row(tool, output) } as any)
      const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)
      expect(texts).toEqual([label])
      await ui.unmount()
      const res = await $.ui.mount({ plugin: 'bmuz', surface, component: 'ToolResult', props: { tool_use_id: 'toolu_1', tool, output, isErrored: false } } as any)
      expect(await res.findAll({ type: 'Text' })).toHaveLength(0)
      expect(await res.find({ key: 'bmuz-quiet' })).toBeDefined() // the engine's own (empty) drawing, not a skipped hook
      await res.unmount()
    }
  }
})


test('live check 2026-11-08: "bmuz go" while this try\'s flow launch is on its way does not ask again', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: null, status: 'idle', finished: ['name', 'approve', 'plan'] }))
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: [...PIPE.steps.slice(0, 3), { id: 'hello', kind: 'flow', needs: ['plan'], workflow: 'bmuz:hello-flow', args: { name: '{name}' } }, { ...PIPE.steps[3], needs: ['hello'] }] })
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const asks = () => prompts.filter(p => /Call the Workflow tool/.test(p)).length
  expect(asks()).toBe(1)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2' } as any)
  expect(asks()).toBe(1)
  expect(w.files['/proj/.bmuz/journal.jsonl']).not.toMatch(/"ev":"resume"/)
})

test('outside a BMUZ project, a typed "bmuz go" is told plainly that BMUZ is off here', async ($, on) => {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  const w = world(on, {})
  delete w.files['/proj/bmuz.json']
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.prompt.submit({ text: 'make me a sandwich' } as any)
  expect(prompts[0]).toMatch(/off in this folder: there is no bmuz.json here/)
  expect(prompts[1]).toBe('make me a sandwich')
})

test('"bmuz auto" makes the session an auto run from then on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, true)
  await $.prompt.submit({ text: 'bmuz auto' } as any)
  const ask: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(why(ask)).toMatch(/auto run/)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"auto.on"/)
})

test('fix 7: a window closed at a gate is journaled as a crash at the next start', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'approve', status: 'waiting', finished: ['name'] }))
  w.files['/proj/.bmuz/lock.json'] = JSON.stringify({ step: 'approve', status: 'waiting', session: 'old', closed: true, endReason: 'other' })
  await start($, false)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"crash.detected","lockStep":"approve","lockStatus":"waiting","lockSession":"old","endReason":"other"/)
})

test('check 12: the review step reads but cannot edit, write or run commands', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'review', status: 'working', finished: ['name', 'approve', 'plan'] }))
  await start($, false)
  for (const tool of ['Edit', 'Write', 'Bash', 'PowerShell']) {
    const r: any = await $.tool.call({ tool, file_path: '/proj/hello.html', old_string: 'a', new_string: 'b', content: 'x', command: 'echo' } as any)
    expect(refused(r), tool).toBe(true)
  }
  const read: any = await $.tool.call({ tool: 'Read', file_path: '/proj/hello.html' } as any)
  expect(refused(read)).toBe(false)
  expect(w.reached).toEqual(['Read'])
})

test('check 6: an error inside the mod refuses the call instead of letting it through', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'review', status: 'working', finished: ['name', 'approve', 'plan'] }))
  await start($, false)
  w.files['/proj/.bmuz/test-fault'] = 'boom'
  const read: any = await $.tool.call({ tool: 'Read', file_path: '/proj/hello.html' } as any)
  expect(refused(read)).toBe(true)
  expect(why(read)).toMatch(/error in its own code/)
  expect(w.reached).toEqual([])
})

test('check 6b: a broken pipeline file refuses every tool', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  w.files.PIPELINE = '{"steps": [{"id": "a", "kind": "dance"}]}'
  await start($, false)
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(r)).toBe(true)
  expect(w.reached).toEqual([])
})

test('check 6c: a missing craft note or a bad pipeline name in bmuz.json refuses every tool', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  delete w.files['craft/name.md']
  await start($, false)
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(r)).toBe(true)
  expect(why(r)).toMatch(/craft note craft\/name.md is missing/)
  expect(w.reached).toEqual([])
})

test('check 6d: bmuz.json naming a pipeline outside the plugin refuses every tool', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  w.files['/proj/bmuz.json'] = '{"pipeline":"../../evil/hello","watchdogTickMs":3600000}'
  await start($, false)
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(r)).toBe(true)
  expect(why(r)).toMatch(/must be a pipeline name/)
  expect(w.reached).toEqual([])
})

test('check 6e: an error while reading a prompt refuses it instead of letting it through unread', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const seen: string[] = []
  on('prompt.submit', (_: any, e: any) => { seen.push(String(e.text)); return { text: e.text } })
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, false)
  w.files['/proj/.bmuz/test-fault-prompt'] = 'boom'
  const r: any = await $.prompt.submit({ text: 'bmuz go' } as any)
  expect(JSON.stringify(r)).toMatch(/held it back to be safe/)
  expect(seen).toEqual([])
  // and from then on every tool is refused until the doctor runs
  const t: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(t)).toBe(true)
  expect(why(t)).toMatch(/reading a prompt; run \/bmuz-doctor/)
})

test('check 6f: an error while starting up keeps the engine on and refusing, until /bmuz-doctor gets it going', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  w.files['/proj/.bmuz/test-fault-start'] = 'boom'
  await start($, true)
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(r)).toBe(true)
  expect(why(r)).toMatch(/failed to start/)
  expect(w.reached).toEqual([])
  delete w.files['/proj/.bmuz/test-fault-start']
  const d: any = await $.command.run({ command: 'bmuz-doctor', args: '' } as any)
  expect(JSON.stringify(d)).toMatch(/BMUZ doctor/)
  const again: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(again)).toBe(false)
})

test('review 5: after a broken start, typing "bmuz doctor" retries the start and the engine runs again', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  w.files['/proj/.bmuz/test-fault-start'] = 'boom'
  await start($, false)
  delete w.files['/proj/.bmuz/test-fault-start']
  const said: any = await $.prompt.submit({ text: 'bmuz doctor' } as any)
  expect(String(said.text)).toMatch(/BMUZ doctor/)
  // back as an auto run (this session can't answer), so asking stays refused
  const ask: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(why(ask)).toMatch(/auto run/)
})

test('review 10 (F225): an unfinished run left by another pipeline is refused, not counted as finished; "bmuz stage" moves on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({ pipeline: 'other', current: 'review', status: 'working', finished: ['name', 'approve', 'plan'] }))
  await start($, true)
  const r: any = await $.tool.call({ tool: 'Write', file_path: '/proj/x.txt', content: 'x' } as any)
  expect(refused(r)).toBe(true)
  expect(why(r)).toMatch(/holds a "other" run that isn't finished, but bmuz.json says "hello". Say "bmuz stage hello" to move on/)
  const said: any = await $.prompt.submit({ text: 'bmuz stage hello' } as any)
  expect(String(said.text)).toMatch(/moved on to hello/)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect([st.pipeline, st.finished, st.status]).toEqual(['hello', [], 'idle'])
  expect(JSON.parse(w.files['/proj/.bmuz/stages/1-other/state.json']).finished).toEqual(['name', 'approve', 'plan'])
  const ask: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(ask)).toBe(false) // the engine runs again
})

test('review 10 (F225): bmuz.json changed by hand after a FINISHED run moves on: the old record is archived, the new stage starts fresh', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ pipeline: 'other', current: null, status: 'done', finished: ['name', 'approve', 'plan', 'review'] }))
  w.files['/proj/.bmuz/journal.jsonl'] = '{"t":1,"ev":"pipeline.done"}\n'
  await start($, true)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect([st.pipeline, st.finished, st.status]).toEqual(['hello', [], 'idle'])
  expect(JSON.parse(w.files['/proj/.bmuz/stages/1-other/state.json']).status).toBe('done')
  expect(w.files['/proj/.bmuz/stages/1-other/journal.jsonl']).toMatch(/pipeline.done/)
  expect(JSON.parse(w.files['/proj/.bmuz/stages.json'])[0]).toMatchObject({ n: 1, pipeline: 'other', status: 'done', to: 'hello' })
  expect(w.files['/proj/.bmuz/journal.jsonl'].split('\n')[0]).toMatch(/"ev":"stage.enter","from":"other","to":"hello"/)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"stage.moved-on","from":"other"/)
})

test('review 7: a flow result from an earlier try (or before this try launched) is not taken as this try\'s', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({}))
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: PIPE.steps.map(s => (s.id === 'plan' ? { id: 'plan', kind: 'flow', needs: ['approve'], workflow: 'bmuz:hello-flow' } : s)) })
  w.files['/proj/.bmuz/state.json'] = state({ current: 'plan', status: 'working', finished: ['name', 'approve'], flow: { args: {}, toolUseId: null, taskId: null } })
  await start($, false)
  await $.prompt.submit({ text: '<task-notification>\n<task-id>old</task-id>\n<tool-use-id>tu-old</tool-use-id>\n<status>completed</status>\n<result>{}</result>\n</task-notification>', origin: { kind: 'task-notification' } } as any)
  expect(w.files['/proj/.bmuz/journal.jsonl'] ?? '').not.toMatch(/flow.result/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('working')
})

test('check 8: a flow launches once; a second Workflow call in the same try is refused', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'hello', status: 'working', finished: ['name', 'approve', 'plan'] }))
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: [...PIPE.steps.slice(0, 3), { id: 'hello', kind: 'flow', needs: ['plan'], workflow: 'bmuz:hello-flow', args: { name: '{name}' } }, { ...PIPE.steps[3], needs: ['hello'] }] })
  w.files['/proj/.bmuz/state.json'] = state({ current: 'hello', status: 'working', finished: ['name', 'approve', 'plan'], flow: { args: { name: 'Moon Goat' }, toolUseId: null, taskId: null } })
  await start($, true)
  const first: any = await $.tool.call({ tool: 'Workflow', name: 'something-else', args: { name: 'Sun Goat' }, tool_use_id: 'tu1' } as any)
  expect(refused(first)).toBe(false)
  const second: any = await $.tool.call({ tool: 'Workflow', name: 'bmuz:hello-flow', args: { name: 'Moon Goat' }, tool_use_id: 'tu2' } as any)
  expect(refused(second)).toBe(true)
  expect(why(second)).toMatch(/already running/)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"flow.launched","step":"hello","workflow":"bmuz:hello-flow","args":\{"name":"Moon Goat"\}/)
})

test('check 4: the watchdog stands down when the stopped helper had already finished (no failed try)', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('tool.call', { tool: 'TaskStop' }, () => ({ result: 'Task wf1 is not running (completed)' }))
  const w = world(on, base({}))
  w.files['/proj/bmuz.json'] = '{"pipeline":"hello","watchdogMs":1000,"watchdogTickMs":500}'
  w.files['/proj/.bmuz/state.json'] = state({ current: 'plan', status: 'working', finished: ['name', 'approve'], startedAt: 1000, flow: { args: {}, toolUseId: 'tu1', taskId: 'wf1' } })
  // a flow step in place of the script, so the watchdog stops a task
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: PIPE.steps.map(s => (s.id === 'plan' ? { id: 'plan', kind: 'flow', needs: ['approve'], workflow: 'bmuz:hello-flow' } : s)) })
  await start($, false) // no resume timer: only the watchdog acts
  await clock.advance(5000)
  const j = w.files['/proj/.bmuz/journal.jsonl'] ?? ''
  expect((j.match(/"ev":"watchdog.late"/g) || []).length).toBe(1) // once, not every tick
  expect(j).not.toMatch(/"ev":"retry"/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('working')
})

test('F218: a window opening mid-run kicks a talk step from its timer; the step itself starts at turn end, with its instructions attached', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  world(on, base({ current: 'name', status: 'working' }))
  await start($, true)
  await clock.advance(2000) // the resume timer fires
  // from the timer: only the short engine line, never the talk step's headline (its hook-attached notes would be lost)
  expect(prompts.some(p => /^BMUZ engine: picking up the run at step "name"/.test(p))).toBe(true)
  expect(prompts.some(p => /^BMUZ step "name"/.test(p))).toBe(false)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const talk = prompts.find(p => /^BMUZ step "name"/.test(p))!
  const [, ...hidden] = talk.split('\n')
  expect(hidden.join('\n')).toMatch(/Ask the name\./)
})

test('check 2: at a gate the engine asks with buttons and waits for the answer', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let asked: any = null
  let answer: (v: any) => void = () => {}
  on('tool.call', { tool: 'AskUserQuestion' }, (_: any, e: any) => {
    asked = e
    return new Promise(res => { answer = res })
  })
  const w = world(on, base({ current: 'approve', status: 'waiting', finished: ['name'] }))
  await start($, true)
  await clock.advance(2000) // the resume timer fires and the gate asks
  expect(asked?.questions?.[0]?.question).toBe('Approve Moon Goat?')
  expect(asked.questions[0].options.map((o: any) => o.label)).toEqual(['Change the name', 'Approve']) // Approve is never the pre-selected first button
  await clock.advance(60_000)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('waiting') // nothing moved while unanswered
  const steps = () => w.runs.filter(r => r[1] !== '-e') // not the start-up "unattended settings?" look
  expect(steps()).toEqual([])
  const q = asked.questions[0].question
  answer({ result: { questions: asked.questions, answers: { [q]: 'Approve' } } })
  await clock.advance(10)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"gate.answer","step":"approve","answer":"Approve"/)
  expect(steps().length).toBeGreaterThan(0) // the script step started after the yes
})

test('check 2b: an empty "bmuz approve" never says yes; only the approve option, word for word, does', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({ current: 'approve', status: 'waiting', finished: ['name'] }))
  await start($, false)
  const said: any = await $.prompt.submit({ text: 'bmuz approve' } as any)
  expect(String(said.text)).toMatch(/still open. Answer with one of: "bmuz approve Change the name" \/ "bmuz approve Approve"/)
  const cmd: any = await $.command.run({ command: 'bmuz-approve', args: '' } as any)
  expect(JSON.stringify(cmd)).toMatch(/still open/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('waiting')
  expect(w.files['/proj/.bmuz/journal.jsonl'] ?? '').not.toMatch(/gate.answer/)
})

test('check 13: a script whose done-check keeps failing retries twice, then BLOCKS and rolls back', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: null, status: 'idle', finished: ['name', 'approve'] }))
  await start($, false)
  // "bmuz go" as a typed prompt, then the turn ends: the engine runs the script step itself
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const j = w.files['/proj/.bmuz/journal.jsonl']
  expect((j.match(/"ev":"script.ran"/g) || []).length).toBe(3)
  expect((j.match(/"ev":"retry"/g) || []).length).toBe(2)
  expect(j).toMatch(/"ev":"blocked","step":"plan"/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('blocked')
  expect(w.runs.some(r => r.some(a => a.endsWith('rm.mjs')))).toBe(true) // rollback removed plan.json
})

test('check 13b: "bmuz retry" lifts the BLOCK and the step runs again with 2 fresh retries', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: 'plan', status: 'blocked', blocked: { step: 'plan', why: 'no plan.json' }, retries: { plan: 3 }, finished: ['name', 'approve'] }))
  await start($, false)
  const said: any = await $.prompt.submit({ text: 'bmuz retry' } as any)
  expect(String(said.text)).toMatch(/step "plan" gets 2 more tries/)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const j = w.files['/proj/.bmuz/journal.jsonl']
  expect(j).toMatch(/"ev":"unblock","step":"plan"/)
  expect((j.match(/"ev":"script.ran"/g) || []).length).toBe(3) // the fake script never writes plan.json: 3 tries again
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('blocked')
})

test('undo: "bmuz undo" lists the steps; "bmuz undo plan" puts back the files and reruns from there', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({ current: null, status: 'done', finished: ['name', 'approve', 'plan', 'review'] }))
  w.files['/proj/plan.json'] = '{"name":"Moon Goat","v":2}'
  w.files['/proj/.bmuz/checkpoint-plan.json'] = JSON.stringify({ 'plan.json': '{"name":"Old"}' })
  await start($, false)
  const menu: any = await $.prompt.submit({ text: 'bmuz undo' } as any)
  expect(String(menu.text)).toMatch(/- plan: go back to before "plan": puts back plan.json; runs 2 steps again/)
  const done: any = await $.prompt.submit({ text: 'bmuz undo plan' } as any)
  expect(String(done.text)).toMatch(/went back to before "plan". Put back: plan.json. Steps to run again: plan, review/)
  expect(w.files['/proj/plan.json']).toBe('{"name":"Old"}')
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.finished).toEqual(['name', 'approve'])
  expect(st.status).toBe('idle')
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"undo","to":"plan","redo":\["review","plan"\],"restored":\["plan.json"\]/)
})

test('undo: a hand-edited checkpoint that points outside the project is skipped', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({ current: null, status: 'done', finished: ['name', 'approve', 'plan', 'review'] }))
  w.files['/proj/.bmuz/checkpoint-plan.json'] = JSON.stringify({ '../outside.txt': 'x', 'plan.json': null })
  await start($, false)
  await $.prompt.submit({ text: 'bmuz undo plan' } as any)
  expect('/outside.txt' in w.files).toBe(false)
  expect(w.runs.filter(r => r.some(a => a.endsWith('rm.mjs'))).map(r => r[r.length - 1])).toEqual(['/proj/plan.json'])
})

// F227 review A6: the content steps write content/data/<table>.json, one file per table, named by the step's result;
// a "writes" path may end in a * file name (content/data/*.json): every file it matches is checkpointed, and an undo
// puts those back and deletes the ones the step made.
const PIPE_DATA = { ...PIPE, steps: PIPE.steps.map(s => (s.id === 'plan' ? { ...s, writes: ['plan.json', 'data/*.json'] } : s)) }
test('F227 review A6: a "writes" pattern checkpoints every file it matches, and the list of them', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  let w: any = null
  w = world(on, { ...base({ current: null, status: 'idle', finished: ['name', 'approve'] }), PIPELINE: JSON.stringify(PIPE_DATA) }, argv => {
    if (String(argv[1] ?? '').endsWith('ls.mjs')) return { exitCode: 0, stdout: JSON.stringify(Object.keys(w.files).filter(f => /^\/proj\/data\/[^/]*\.json$/.test(f)).map(f => f.slice(6))) }
    if (argv.includes('x.mjs')) { w.files['/proj/plan.json'] = '{"name":"Moon Goat"}'; w.files['/proj/data/a.json'] = '{"v":2}'; w.files['/proj/data/b.json'] = '{"new":1}' }
    return { exitCode: 0, stdout: '{}' }
  })
  w.files['/proj/data/a.json'] = '{"v":1}'
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  expect(JSON.parse(w.files['/proj/.bmuz/checkpoint-plan.json'])).toEqual({ 'plan.json': null, 'data/*.json': { pattern: ['data/a.json'] }, 'data/a.json': '{"v":1}' })
})
test('F227 review A6: undo of a step whose "writes" has a pattern puts its files back and deletes the ones the step made', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  let w: any = null
  w = world(on, { ...base({ current: null, status: 'done', finished: ['name', 'approve', 'plan', 'review'] }), PIPELINE: JSON.stringify(PIPE_DATA) }, argv => {
    if (String(argv[1] ?? '').endsWith('ls.mjs')) return { exitCode: 0, stdout: JSON.stringify(Object.keys(w.files).filter(f => /^\/proj\/data\/[^/]*\.json$/.test(f)).map(f => f.slice(6))) }
    return { exitCode: 0, stdout: '{}' }
  })
  Object.assign(w.files, { '/proj/plan.json': '{"name":"Moon Goat"}', '/proj/data/a.json': '{"v":2}', '/proj/data/b.json': '{"new":1}' })
  w.files['/proj/.bmuz/checkpoint-plan.json'] = JSON.stringify({ 'plan.json': null, 'data/*.json': { pattern: ['data/a.json'] }, 'data/a.json': '{"v":1}' })
  await start($, false)
  const undone: any = await $.prompt.submit({ text: 'bmuz undo plan' } as any)
  expect(String(undone.text)).toMatch(/went back to before "plan"/)
  expect(w.files['/proj/data/a.json']).toBe('{"v":1}')
  expect('/proj/data/b.json' in w.files).toBe(false)
  expect('/proj/plan.json' in w.files).toBe(false)
})

test('doctor: a damaged state file is rebuilt from the journal at start, and /bmuz-doctor says so plainly', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({}))
  w.files['/proj/.bmuz/state.json'] = '{"pipeline": "hel'
  w.files['/proj/.bmuz/journal.jsonl'] = [
    { t: 1, ev: 'step.start', step: 'name', kind: 'talk' },
    { t: 2, ev: 'step.done', step: 'name', result: { name: 'Moon Goat' } },
    { t: 3, ev: 'step.start', step: 'approve', kind: 'gate' },
  ].map(x => JSON.stringify(x)).join('\n') + '\n'
  await start($, false)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.current).toBe('approve')
  expect(st.status).toBe('waiting')
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"doctor.rebuilt","why":\["The state file was damaged/)
  const r: any = await $.command.run({ command: 'bmuz-doctor', args: '' } as any)
  expect(String(r.text ?? r.value?.text ?? JSON.stringify(r))).toMatch(/All good/)
})

test('check 5: the band above the prompt shows the step and its status', async ($, on) => {
  mock.clock(on, { now: 61_000 })
  const w = world(on, base({ current: 'approve', status: 'waiting', finished: ['name'], startedAt: 1000 }))
  await start($, false)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bmuz', surface, component: 'AbovePrompt', props: { bodyColumns: 80, hasSurvey: false } } as any)
    const t = await ui.find({ type: 'Text', text: /BMUZ/ })
    expect(t?.text).toBe('BMUZ · step 2 of 4 · approve · waiting for you') // no clock: nothing is running
    await ui.unmount()
  }
})

// ---- F213: the engine-written hand-off card ----

// At the review step (a hand-off step), with prompts and turn ends recorded.
function atReview(on: any, extra: Record<string, string> = {}) {
  mock.clock(on, { now: Date.UTC(2026, 10, 9) })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, { ...base({ current: 'review', status: 'working', finished: ['name', 'approve', 'plan'] }), ...extra })
  return { w, prompts }
}

const endTurn = ($: any, id: string) => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id } as any)

test('F213: a hand-off step\'s step_done without a full card is refused like a failed done-check', async ($, on) => {
  const { w } = atReview(on)
  await start($, false)
  const { see, ...noSee } = CARD
  const r: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { verdict: 'ok', card: noSee } } as any)
  expect(String(r.result ?? r.text ?? JSON.stringify(r))).toMatch(/Not done: the card's "see" is missing or empty.*retry 1 of 2/)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.status).toBe('working')
  expect(st.retries.review).toBe(1)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"retry","step":"review"/)
})

test('F213: a good card is shown by the engine\'s own message at turn.complete, then the pipeline finishes', async ($, on) => {
  const { w, prompts } = atReview(on)
  await start($, false)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { verdict: 'matches', card: CARD } } as any)
  expect(prompts).toEqual([]) // nothing is sent from inside the tool hook
  await endTurn($, 't1')
  expect(prompts.length).toBe(1)
  expect(prompts[0]).toMatch(/^BMUZ hand-off card — this message comes from the BMUZ engine/)
  // the message points at the saved card instead of carrying it, so the creative sees the card once
  expect(prompts[0]).toMatch(/Read \/proj\/\.bmuz\/last-card\.md and show the creative its text exactly as written/)
  expect(prompts[0]).not.toMatch(/ready for you to check/)
  expect(w.files['/proj/.bmuz/last-card.md']).toMatch(/^## Hello page for Moon Goat — ready for you to check\n\n\*\*Done:\*\* it matches the plan\n\n/)
  expect(w.files['/proj/.bmuz/last-card.md']).toMatch(/\*\*Questions:\*\* none\n\n\*\*Next:\*\* nothing to type\n$/)
  // between steps every other tool waits, but reading the saved card is allowed
  const read: any = await $.tool.call({ tool: 'Read', file_path: '/proj/.bmuz/last-card.md' } as any)
  expect(refused(read)).toBe(false)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('idle') // the card turn comes first
  await endTurn($, 't2')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('done')
  expect(prompts.length).toBe(1)
})

test('F213: every card lists the open questions with their numbers; one shown in 2 cards already is parked', async ($, on) => {
  const old = [
    { n: 1, key: 'heading-font', q: 'Which heading font?', kind: 'choice', options: ['serif', 'sans'], askedIn: 2, status: 'open', addedAt: '2026-11-01' },
    { n: 2, key: 'page-colour', q: 'What colour should the page be?', kind: 'taste', options: ['white', 'black'], askedIn: 1, status: 'open', addedAt: '2026-11-02' },
  ]
  const { w, prompts } = atReview(on, { '/proj/.bmuz/questions.json': JSON.stringify(old) })
  await start($, false)
  const card = { ...CARD, questions: [{ key: 'greeting', q: 'Should it say hello or welcome?', kind: 'want', options: ['hello', 'welcome'], pick: 'welcome' }] }
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { verdict: 'matches', card } } as any)
  await endTurn($, 't1')
  const shown = w.files['/proj/.bmuz/last-card.md']
  expect(shown).toMatch(/\*\*Questions:\*\*\n2\. What colour should the page be\?\n {3}What's your view\?\n {3}- white\n {3}- black\n3\. Should it say hello or welcome\?\n {3}- welcome \(my pick\)\n {3}- hello\n\n\*\*Next:\*\*/)
  expect(shown).not.toMatch(/heading font/)
  const list = JSON.parse(w.files['/proj/.bmuz/questions.json'])
  expect(list.map((q: any) => [q.n, q.status, q.askedIn])).toEqual([[1, 'parked', 2], [2, 'open', 2], [3, 'open', 1]])
  expect(w.files['/proj/.bmuz/questions.md']).toMatch(/## Parked — decide when the feature that needs it is planned\n.*\n- 1\. Which heading font\?/)
})

test('F213: "1 yes" records a decision and passes the message on with the engine\'s note; other messages pass untouched', async ($, on) => {
  const open = [{ n: 1, key: 'greeting', q: 'Should it say welcome?', kind: 'want', options: ['yes', 'no'], askedIn: 1, status: 'open', addedAt: '2026-11-09' }]
  const { w, prompts } = atReview(on, { '/proj/.bmuz/questions.json': JSON.stringify(open) })
  await start($, true)
  await $.prompt.submit({ text: 'looks fine' } as any)
  expect(prompts[0]).toBe('looks fine')
  await $.prompt.submit({ text: '1 yes' } as any)
  expect(prompts[1]).toMatch(/^1 yes\n\(BMUZ engine: answers recorded for 1 \(in .bmuz\/decisions.md\)/)
  expect(JSON.parse(w.files['/proj/.bmuz/decisions.json'])).toEqual([{ key: 'greeting', q: 'Should it say welcome?', answer: 'yes', at: '2026-11-09' }])
  expect(w.files['/proj/.bmuz/decisions.md']).toMatch(/Should it say welcome\? — \*\*yes\*\*/)
  expect(JSON.parse(w.files['/proj/.bmuz/questions.json'])[0].status).toBe('answered')
  await $.prompt.submit({ text: '1 no' } as any) // answered now: not taken again
  expect(prompts[2]).toBe('1 no')
})

test('F213: a card asking a question already decided is refused with the earlier answer', async ($, on) => {
  const decided = [{ key: 'orientation', q: 'Portrait or landscape?', answer: 'portrait', at: '2026-11-03' }]
  const { w } = atReview(on, { '/proj/.bmuz/decisions.json': JSON.stringify(decided) })
  await start($, false)
  const card = { ...CARD, questions: [{ key: 'orientation', q: 'Portrait or landscape?', kind: 'choice', options: ['portrait', 'landscape'] }] }
  const r: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { verdict: 'ok', card } } as any)
  expect(String(r.result ?? r.text ?? JSON.stringify(r))).toMatch(/already answered on 2026-11-03: portrait — use it, don't ask again/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).retries.review).toBe(1)
})

test('F213: a damaged questions.json is said plainly; the message still goes through and the engine stays on', async ($, on) => {
  const { prompts } = atReview(on, { '/proj/.bmuz/questions.json': '[{"n": 1,' })
  await start($, true)
  await $.prompt.submit({ text: '1 yes' } as any)
  expect(prompts[0]).toMatch(/^1 yes\n\(BMUZ engine: .bmuz\/questions.json or decisions.json is damaged/)
  await $.prompt.submit({ text: 'hello' } as any)
  expect(prompts[1]).toBe('hello')
  const read: any = await $.tool.call({ tool: 'Read', file_path: '/proj/hello.html' } as any)
  expect(refused(read)).toBe(false)
})

// F217: a flow step whose done-check is a command (the research flow's source check).
function sourcedFlow(on: any, exitCodes: number[]) {
  // the source check's answers, in order; other commands pass
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  const w = world(on, base({}), argv => {
    const code = /check-sources/.test(argv.join(' ')) ? (exitCodes.shift() ?? 0) : 0
    return { exitCode: code, stdout: code ? '✘ r.md: 1 source problem\n  - source 2 (https://x.test/gone) is a dead link: answered 404' : '✔ r.md' }
  })
  const ran = w.runs
  const research = { id: 'research', kind: 'flow', needs: ['approve'], workflow: 'bmuz:research-flow', args: { topic: '{name}', out: 'r.md' }, writes: ['r.md'], done: { type: 'script-ok', run: ['node', '{plugin}/scripts/check-sources.mjs', 'r.md'] } }
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: PIPE.steps.map(s => (s.id === 'plan' ? research : s.id === 'review' ? { ...s, needs: ['research'] } : s)) })
  w.files['/proj/.bmuz/state.json'] = state({ current: 'research', status: 'working', finished: ['name', 'approve'], flow: { args: { topic: 'Moon Goat', out: 'r.md' }, toolUseId: 'tu1', taskId: 'wf1' } })
  const result = () => $result('wf1', 'tu1')
  return { w, ran, result }
}
const $result = (task: string, tu: string) => ({ text: `<task-notification>\n<task-id>${task}</task-id>\n<tool-use-id>${tu}</tool-use-id>\n<status>completed</status>\n<result>{"wrote":"r.md"}</result>\n</task-notification>`, origin: { kind: 'task-notification' } })

test('F217: a flow\'s "script-ok" check runs its command in the project; exit 0 finishes the step', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, ran, result } = sourcedFlow(on, [0])
  await start($, false)
  await $.prompt.submit(result() as any)
  const check = ran.find(r => /check-sources/.test(r.join(' ')))!
  expect(check.slice(-1)).toEqual(['r.md'])
  expect(check[1]).toMatch(/scripts.check-sources\.mjs$/) // {plugin} filled in
  const j = w.files['/proj/.bmuz/journal.jsonl']
  expect(j).toMatch(/"ev":"check.ran","step":"research","exitCode":0/)
  expect(j).toMatch(/"ev":"step.done","step":"research"/)
})

test('F217: a failing source check is a failed try (the check\'s words as the reason); 3 fails BLOCK and roll back the report', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, result } = sourcedFlow(on, [1, 1, 1])
  w.files['/proj/.bmuz/checkpoint-research.json'] = JSON.stringify({ 'r.md': null }) // no report before the step
  w.files['/proj/r.md'] = '## Summary\n- a claim [2]\n'
  await start($, false)
  await $.prompt.submit(result() as any)
  const j = () => w.files['/proj/.bmuz/journal.jsonl']
  expect(j()).toMatch(/"ev":"retry","step":"research","attempt":2,"why":"the check node check-sources\.mjs said: ✘ r\.md: 1 source problem\\n  - source 2 \(https:\/\/x\.test\/gone\) is a dead link: answered 404"/)
  // two more tries come back failing the same way
  for (const tu of ['tu2', 'tu3']) {
    const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
    w.files['/proj/.bmuz/state.json'] = JSON.stringify({ ...st, current: 'research', status: 'working', flow: { args: {}, toolUseId: tu, taskId: 'wf' } })
    await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: false })
    await $.prompt.submit($result('wf', tu) as any)
  }
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.status).toBe('blocked')
  expect(st.blocked.why).toMatch(/dead link/)
  expect(j()).toMatch(/"ev":"blocked","step":"research".*"rolledBack":\["r\.md"\]/)
})

// F217: talk steps that hand back several keys ("results"), a slug naming the flow's file, lists as flow args.
function framed(on: any) {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({}))
  w.files.PIPELINE = JSON.stringify({
    id: 'hello', version: 1, steps: [
      { id: 'frame', kind: 'talk', tools: ['Read'], craft: 'craft/name.md', results: ['brief', 'slug', 'assumptions'] },
      { id: 'research', kind: 'flow', needs: ['frame'], workflow: 'bmuz:research-flow', args: { brief: '{brief}', assumptions: '{assumptions}', out: 'r/discover-{slug}.md' }, writes: ['r/discover-{slug}.md'] },
      { id: 'review', kind: 'talk', needs: ['research'], tools: ['Read'], craft: 'craft/review.md', done: { type: 'result-has', key: 'verdict' } },
    ],
  })
  w.files['/proj/.bmuz/state.json'] = JSON.stringify({ pipeline: 'hello', current: 'frame', status: 'working', results: {}, retries: {}, finished: [], blocked: null, startedAt: 1 })
  return { w, prompts }
}

test('F217: a step_done missing a "results" key is a failed try; a slug that is not a slug is too', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = framed(on)
  await start($, false)
  const short: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { brief: 'punchy shake', slug: 'punchy-shake' } } as any)
  expect(String(short.result)).toMatch(/Not done: the result has no "assumptions"/)
  const bad: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { brief: 'punchy shake', slug: '../escape', assumptions: [] } } as any)
  expect(String(bad.result)).toMatch(/"slug" names a file, so it must be a short slug/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).retries.frame).toBe(2)
})

test('F217: the flow gets list results as lists, and its slug-named file is checkpointed', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = framed(on)
  await start($, false)
  const done: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { brief: 'punchy shake', slug: 'punchy-shake', assumptions: [{ text: 'more is more', important: true }] } } as any)
  expect(String(done.result)).toMatch(/Recorded/)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  expect(prompts.some(p => p.includes('"assumptions":[{"text":"more is more","important":true}]') && p.includes('"out":"r/discover-punchy-shake.md"'))).toBe(true)
  expect(JSON.parse(w.files['/proj/.bmuz/checkpoint-research.json'])).toEqual({ 'r/discover-punchy-shake.md': null })
})

// F217: wrapping up early. A talk step with "wrapTo" that hands back "wrap": true skips the steps up to it;
// an "always" step still runs.
test('F217: "wrap": true skips to the wrapTo step, journaled; an "always" step still runs; "wrap" is not kept as a result', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = framed(on)
  w.files.PIPELINE = JSON.stringify({
    id: 'hello', version: 1, steps: [
      { id: 'frame', kind: 'talk', tools: ['Read'], craft: 'craft/name.md', results: ['brief', 'slug'], wrapTo: 'review' },
      { id: 'feel', kind: 'talk', needs: ['frame'], tools: ['Read'], craft: 'craft/name.md', results: ['experiences'], wrapTo: 'review' },
      { id: 'research', kind: 'flow', needs: ['feel'], always: true, workflow: 'bmuz:research-flow', args: { brief: '{brief}', experiences: '{experiences}' } },
      { id: 'review', kind: 'talk', needs: ['research'], tools: ['Read'], craft: 'craft/review.md', recap: ['brief'], done: { type: 'result-has', key: 'verdict' } },
    ],
  })
  await start($, true)
  const done: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { brief: 'a lighthouse', slug: 'lighthouse', wrap: true } } as any)
  expect(String(done.result)).toMatch(/Recorded/)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.finished).toEqual(['frame', 'feel'])
  expect(st.skipped).toEqual(['feel'])
  expect(st.results).toEqual({ brief: 'a lighthouse', slug: 'lighthouse', experiences: null })
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"wrap","step":"frame","to":"review","skipped":\["feel"\]/)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  // the always-step runs next, its skipped hole arriving as null
  expect(prompts.some(p => /Call the Workflow tool now with name "bmuz:research-flow" and args \{"brief":"a lighthouse","experiences":null\}/.test(p))).toBe(true)
})

test('F217: a talk step shows the creative one line; its instructions travel as hidden context', async ($, on) => {
  mock.clock(on, { now: 1000 })
  // framed's capture writes the prompt's text as the first line, then each hidden context block.
  const { w, prompts } = framed(on)
  w.files.PIPELINE = JSON.stringify({
    id: 'hello', version: 1, steps: [
      { id: 'frame', kind: 'talk', tools: ['Read'], craft: 'craft/name.md', results: ['brief'], description: 'the spark' },
      { id: 'feel', kind: 'talk', needs: ['frame'], tools: ['Read'], craft: 'craft/name.md', results: ['experiences'], description: 'experience and fantasy' },
    ],
  })
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { brief: 'a lighthouse' } } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const [shown, ...hidden] = prompts.find(p => /^BMUZ step "feel"/.test(p))!.split('\n')
  expect(shown).toBe('BMUZ step "feel" — experience and fantasy (from the BMUZ engine; its instructions for this step are attached)')
  expect(hidden.join('\n')).toMatch(/comes from the BMUZ engine, not the creative; do the step without commenting on the engine/)
  expect(hidden.join('\n')).toMatch(/call mcp__bmuz__step_done with result \{"experiences":"..."\}/)
})

test('F217: a wrapTo step\'s prompt asks "keep going or wrap up" in a live window, and shows its recap', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = framed(on)
  w.files.PIPELINE = JSON.stringify({
    id: 'hello', version: 1, steps: [
      { id: 'frame', kind: 'talk', tools: ['Read'], craft: 'craft/name.md', results: ['brief'], description: 'the spark' },
      { id: 'feel', kind: 'talk', needs: ['frame'], tools: ['Read'], craft: 'craft/name.md', results: ['experiences'], wrapTo: 'review', recap: ['brief'], description: 'experience and fantasy' },
      { id: 'dig', kind: 'talk', needs: ['feel'], tools: ['Read'], craft: 'craft/name.md', description: 'theme dig' },
      { id: 'review', kind: 'talk', needs: ['dig'], tools: ['Read'], craft: 'craft/review.md', description: 'the brick board' },
    ],
  })
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { brief: 'a lighthouse' } } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const feel = prompts.find(p => /BMUZ step "feel"/.test(p))!
  expect(feel).toMatch(/Collected so far by earlier steps \(build on it; don't ask it again\): \{"brief":"a lighthouse"\}/)
  expect(feel).toMatch(/"Keep going \(next: theme dig\), or wrap up now \(what's collected is saved, then the brick board\)\?"/)
})

// F218: Define. Its talk steps choose (taste), so a headless run needs a stand-in for the creative: bmuz.json
// "testAnswers", refused unless the session runs with BMUZ_TEST=1.
test('F218: "testAnswers" in bmuz.json without BMUZ_TEST=1 refuses every tool, in plain words', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  w.files['/proj/bmuz.json'] = '{"pipeline":"hello","watchdogTickMs":3600000,"testAnswers":{"name":"Moon Goat"}}'
  await start($, true)
  const ask: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(refused(ask)).toBe(true)
  expect(why(ask)).toMatch(/"testAnswers", a setting for BMUZ's own tests only .* only when BMUZ_TEST=1/)
})

test('F218: with BMUZ_TEST=1 the talk step\'s hidden instructions carry the test answers as the creative\'s words', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: null, status: 'idle', finished: [] }), argv => ({ exitCode: 0, stdout: argv.join(' ').includes('BMUZ_TEST') ? '1' : '{}' }))
  w.files['/proj/bmuz.json'] = '{"pipeline":"hello","watchdogTickMs":3600000,"testAnswers":{"name":{"What is it called?":"Moon Goat"}}}'
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const talk = prompts.find(p => /^BMUZ step "name"/.test(p))!
  expect(talk).toMatch(/Test run: these are the creative's own answers to this step's questions, as if they had typed them in the chat: \{"What is it called\?":"Moon Goat"\}/)
})

test('F218: a script that refuses says why; its words are the failed try\'s reason and the BLOCK\'s', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const said = '✘ Not ready for Design: the pillars (step "pillars") is still open.'
  const w = world(on, base({ current: null, status: 'idle', finished: ['name', 'approve'] }), argv => (argv.includes('x.mjs') ? { exitCode: 1, stdout: said } : { exitCode: 0, stdout: '{}' }))
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1' } as any)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.status).toBe('blocked')
  expect(st.blocked.why).toBe(`script exited 1: ${said}`)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"retry","step":"plan","attempt":2,"why":"script exited 1: ✘ Not ready for Design/)
})

// ---- F225: one project runs the stages in order ----
const IDEATE = {
  id: 'ideate', version: 1, next: { pipeline: 'define' }, steps: [
    { id: 'spark', kind: 'talk', tools: ['Read'], craft: 'craft/name.md', results: ['brief', 'slug', 'youAre'] },
    { id: 'experience', kind: 'talk', needs: ['spark'], tools: ['Read'], craft: 'craft/name.md', results: ['experiences'], recap: ['brief', 'youAre'] },
    { id: 'bricks', kind: 'talk', needs: ['experience'], tools: ['Read'], craft: 'craft/review.md', results: ['found'], writes: ['notes.md'] },
  ],
}
const DEFINE = {
  id: 'define', version: 1, next: { pipeline: 'design' }, steps: [
    { id: 'digest', kind: 'script', always: true, run: ['node', 'digest.mjs'] },
    { id: 'direction', kind: 'talk', needs: ['digest'], tools: ['Read'], craft: 'craft/name.md', results: ['primaries', 'youAre'] },
    { id: 'bricks', kind: 'talk', needs: ['direction'], tools: ['Read'], craft: 'craft/review.md', results: ['coreVerbs'] },
  ],
}
const START = {
  id: 'start', version: 1, next: { pipeline: '{stage}', at: '{at}', carry: '.planning/research/intake.json', ask: false }, steps: [
    { id: 'propose', kind: 'talk', tools: ['Read'], craft: 'craft/name.md', results: ['stage', 'at'] },
  ],
}

// A project in stage `pipeline`, with the stage pipelines in the plugin and the prompts captured.
function staged(on: any, pipeline: string, st: Record<string, unknown>) {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({}))
  w.files['PIPELINE:ideate'] = JSON.stringify(IDEATE)
  w.files['PIPELINE:define'] = JSON.stringify(DEFINE)
  w.files['PIPELINE:start'] = JSON.stringify(START)
  w.files['/proj/bmuz.json'] = JSON.stringify({ pipeline, watchdogTickMs: 3600000 })
  w.files['/proj/.bmuz/state.json'] = JSON.stringify({ pipeline, current: null, status: 'idle', results: {}, retries: {}, finished: [], blocked: null, startedAt: null, ...st })
  return { w, prompts }
}
const turn = ($: any, id: string) => $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id } as any)
const DEFINE_INTRO = /^We're in Define: making the blocks from the game so far/

test('F225: a stage\'s end offers the next stage; "On to Define" archives Ideate\'s record and Define starts with its intro, once', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', { tool: 'AskUserQuestion' }, (_: any, e: any) => ({ result: { questions: e.questions, answers: { [e.questions[0].question]: 'On to Define' } } }))
  const { w, prompts } = staged(on, 'ideate', { current: 'bricks', status: 'working', finished: ['spark', 'experience'], results: { brief: 'a lighthouse', slug: 'lighthouse' }, resultsBy: { spark: { brief: 'a lighthouse', slug: 'lighthouse' } } })
  w.files['/proj/.bmuz/checkpoint-bricks.json'] = '{"notes.md":null}'
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { found: 'a storm' } } as any)
  await turn($, 't1')
  // the record moved, Ideate's "bricks" checkpoint with it (Define has a "bricks" step too)
  expect(JSON.parse(w.files['/proj/bmuz.json']).pipeline).toBe('define')
  expect(JSON.parse(w.files['/proj/bmuz.json']).watchdogTickMs).toBe(3600000) // the rest of bmuz.json kept
  expect(JSON.parse(w.files['/proj/.bmuz/stages/1-ideate/state.json'])).toMatchObject({ pipeline: 'ideate', status: 'done' })
  expect(w.files['/proj/.bmuz/stages/1-ideate/checkpoint-bricks.json']).toBe('{"notes.md":null}')
  expect(w.files['/proj/.bmuz/checkpoint-bricks.json']).toBeUndefined()
  expect(w.files['/proj/.bmuz/switch.json']).toBeUndefined()
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/^\{[^\n]*"ev":"stage.enter","from":"ideate","to":"define"/)
  // Define ran its script, then its first talk step opened with the stage intro above the step's line
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect([st.pipeline, st.current, st.finished]).toEqual(['define', 'direction', ['digest']])
  const direction = prompts.find(p => /BMUZ step "direction"/.test(p))!
  expect(direction).toMatch(DEFINE_INTRO)
  expect(direction.split('\n\n')[1]).toMatch(/^BMUZ step "direction" \(from the BMUZ engine; its instructions for this step are attached\)/)
  expect(direction).toMatch(/already showed the creative this stage's short intro/)
  // the next talk step: no intro (once per stage per run)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { primaries: ['calm'], youAre: ['a keeper'] } } as any)
  await turn($, 't2')
  const bricks = prompts.find(p => /BMUZ step "bricks"/.test(p) && /coreVerbs/.test(p))!
  expect(bricks).not.toMatch(/We're in Define/)
  // undo and the doctor see only Define's own steps, and agree with the state
  const undo: any = await $.command.run({ command: 'bmuz-undo', args: '' } as any)
  expect(String(undo.text)).toMatch(/- direction:/)
  expect(String(undo.text)).not.toMatch(/spark|experience/)
  const doc: any = await $.command.run({ command: 'bmuz-doctor', args: '' } as any)
  expect(String(doc.text)).toMatch(/All good/)
})

test('F225: in an auto run the offer is noted, not asked; "bmuz go" on the finished stage moves on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = staged(on, 'ideate', { current: 'bricks', status: 'working', finished: ['spark', 'experience'] })
  await start($, false)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { found: 'a storm' } } as any)
  await turn($, 't1')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'ideate', status: 'done' })
  expect(w.files['/proj/.bmuz/questions.md']).toMatch(/Ideate is done. On to Define\? \(say "bmuz go" to move on\)/)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't2')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'define', current: 'direction' })
  expect(prompts.some(p => DEFINE_INTRO.test(p))).toBe(true)
})

test('F225: a next stage not on the engine yet is said plainly, and nothing moves', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = staged(on, 'define', { current: 'bricks', status: 'working', finished: ['digest', 'direction'] })
  await start($, false)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { coreVerbs: ['tend'] } } as any)
  await turn($, 't1')
  expect(prompts.some(p => /Define is done. Design isn't on the BMUZ engine yet \(it comes with F227 — Design pipeline\)\. For now use today's \/define skill for the design work/.test(p))).toBe(true)
  expect(JSON.parse(w.files['/proj/bmuz.json']).pipeline).toBe('define')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).status).toBe('done')
  expect(w.files['/proj/.bmuz/stages.json']).toBeUndefined()
})

test('F225: the start moves straight into the chosen stage at the chosen step; earlier steps are filled from the intake, never "{hole}"', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = staged(on, 'start', { current: 'propose', status: 'working' })
  w.files['/proj/.planning/research/intake.json'] = JSON.stringify({ given: { brief: 'a lighthouse', slug: 'lighthouse', youAre: [{ text: 'You are a keeper', his: true }], experiences: [{ text: 'tea in a storm', his: true }] } })
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { stage: 'ideate', at: 'experience' } } as any)
  await turn($, 't1')
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect([st.pipeline, st.current, st.finished, st.skipped]).toEqual(['ideate', 'experience', ['spark'], ['spark']])
  expect(st.results).toEqual({ brief: 'a lighthouse', slug: 'lighthouse', youAre: [{ text: 'You are a keeper', his: true }] })
  expect(st.entered).toEqual({ at: 'experience', skipped: ['spark'] })
  const exp = prompts.find(p => /BMUZ step "experience"/.test(p))!
  expect(exp).toMatch(/^We're in Ideate: gathering the material/)
  expect(exp).toMatch(/Collected so far by earlier steps \(build on it; don't ask it again\): \{"brief":"a lighthouse","youAre":\[\{"text":"You are a keeper","his":true\}\]\}/)
  expect(exp).toMatch(/Already chosen in the creative's own material .*\{"experiences":\[\{"text":"tea in a storm","his":true\}\]\}.*"Keep" as the first option/)
  expect(JSON.parse(w.files['/proj/.bmuz/stages/1-start/state.json']).results).toEqual({ stage: 'ideate', at: 'experience' })
  const undo: any = await $.command.run({ command: 'bmuz-undo', args: '' } as any)
  expect(String(undo.text)).toMatch(/- spark: go back to before "spark" \(answered by your material when this stage started\)/)
})

test('F225: a stage switch cut short by a crash is finished at the next start', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = staged(on, 'ideate', { status: 'done', finished: ['spark', 'experience', 'bricks'] })
  w.files['/proj/.bmuz/switch.json'] = JSON.stringify({ from: 'ideate', to: 'define', at: null, given: {}, n: 1, archive: 'stages/1-ideate', checkpoints: ['checkpoint-bricks.json'] })
  await start($, true)
  expect(JSON.parse(w.files['/proj/bmuz.json']).pipeline).toBe('define')
  expect(JSON.parse(w.files['/proj/.bmuz/stages/1-ideate/state.json']).status).toBe('done')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'define', finished: [], status: 'idle' })
  expect(w.files['/proj/.bmuz/switch.json']).toBeUndefined()
  const r: any = await $.tool.call({ tool: 'Read', file_path: '/proj/x' } as any)
  expect(refused(r)).toBe(false)
})

test('F225, F232: "bmuz new" in a folder without bmuz.json makes it a BMUZ project that starts Ideate (the start is folded in); "bmuz go" there only says how', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, { 'craft/name.md': 'Say the welcome, then ask for the idea.' })
  w.files['PIPELINE:ideate'] = JSON.stringify({ id: 'ideate', version: 1, steps: [{ id: 'idea', kind: 'talk', no: '1.1', title: 'Your Idea', tools: ['Read'], craft: 'craft/name.md', results: ['idea'] }] })
  delete w.files['/proj/bmuz.json']
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  expect(prompts[0]).toMatch(/"bmuz new" starts a game here — it begins with their idea/)
  expect(w.files['/proj/bmuz.json']).toBeUndefined()
  await $.prompt.submit({ text: 'bmuz new' } as any)
  expect(JSON.parse(w.files['/proj/bmuz.json'])).toEqual({ pipeline: 'ideate' })
  expect(prompts[1]).toMatch(/now a BMUZ project/)
  await turn($, 't1')
  expect(prompts.some(p => /BMUZ step "idea" — Ideate · 1 of 1 · Your Idea/.test(p) && /Say the welcome, then ask for the idea\./.test(p))).toBe(true)
  expect(prompts.some(p => /Where's your game right now/.test(p))).toBe(false)
  const done: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { idea: 'A garden race' } } as any)
  expect(String(done.result)).toMatch(/Recorded/)
})

// ---- F228: a script step's "show" file in a turn of its own; a "when" step only on a yes ----
function shown(on: any) {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({}))
  w.files.PIPELINE = JSON.stringify({
    id: 'hello', version: 1, steps: [
      { id: 'ask', kind: 'talk', tools: ['Read', 'AskUserQuestion'], craft: 'craft/name.md', results: ['priorArt'] },
      { id: 'look', kind: 'script', needs: ['ask'], when: '{priorArt}', run: ['node', 'look.mjs'], writes: ['so-far.md'], show: 'so-far.md' },
      { id: 'after', kind: 'talk', needs: ['look'], tools: ['Read'], craft: 'craft/review.md', results: ['found'] },
    ],
  })
  w.files['/proj/so-far.md'] = '## The game so far\n- Fixed: “standard pong”'
  w.files['/proj/.bmuz/state.json'] = JSON.stringify({ pipeline: 'hello', current: 'ask', status: 'working', results: {}, retries: {}, finished: [], blocked: null, startedAt: 1 })
  return { w, prompts }
}

test('F228: a script step\'s "show" file goes to the creative in a turn of its own; the next step starts at that turn\'s end', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = shown(on)
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { priorArt: 'yes' } } as any)
  await turn($, 't1')
  expect(w.runs.some(r => r[1] === 'look.mjs')).toBe(true)
  expect(w.files['/proj/.bmuz/last-shown.md']).toBe('## The game so far\n- Fixed: “standard pong”\n')
  expect(prompts[prompts.length - 1]).toMatch(/^BMUZ engine — this message comes from the BMUZ engine[^\n]*Read \/proj\/\.bmuz\/last-shown\.md and show the creative its text exactly as written/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ finished: ['ask', 'look'], current: null, status: 'idle' })
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"show","step":"look","path":"so-far.md"/)
  // Claude reads the shown copy between steps (allowed), then the turn ends and the next step starts
  const r: any = await $.tool.call({ tool: 'Read', file_path: '/proj/.bmuz/last-shown.md' } as any)
  expect(refused(r)).toBe(false)
  // F232: the shown text is checked word for word like a script line — a turn that didn't show it gets the correction
  await turn($, 't2')
  expect(prompts[prompts.length - 1]).toMatch(/The script line "show:so-far\.md" was not written word for word/)
  expect(prompts.some(p => /^BMUZ step "after"/.test(p))).toBe(false)
  await $.turn.complete({ answer: '## The game so far\n- Fixed: "standard pong"', durationMs: 1, isAborted: false, turnId: 't3' } as any)
  expect(prompts.some(p => /^BMUZ step "after"/.test(p))).toBe(true)
})

test('F228: a "when" step whose result says no is skipped (journaled), and the run goes on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = shown(on)
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { priorArt: 'no' } } as any)
  await turn($, 't1')
  expect(w.runs.some(r => r[1] === 'look.mjs')).toBe(false)
  expect(w.files['/proj/.bmuz/last-shown.md']).toBeUndefined()
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"step.skip","step":"look","when":"\{priorArt\}"/)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect([st.finished, st.skipped, st.current]).toEqual([['ask', 'look'], ['look'], 'after'])
  expect(prompts.some(p => /^BMUZ step "after"/.test(p))).toBe(true)
  const doc: any = await $.command.run({ command: 'bmuz-doctor', args: '' } as any)
  expect(String(doc.text)).toMatch(/All good/)
})

test('F228: the creative\'s answer to the question box is journaled, so a script can check their "own words"', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'User has answered your questions: "How does it end?"="first to 11"' }))
  const { w } = shown(on)
  await start($, true)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'How does it end?' }] } as any)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"answer","step":"ask","text":"User has answered your questions: \\"How does it end\?\\"=\\"first to 11\\""/)
})

// ---- F228 task 3: asking only through the question box ----
test('F228: a live talk step whose turn ends with a plain-text question is nudged at once (twice at most), not left to the watchdog', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = shown(on)
  await start($, true)
  const done = (id: string, answer: string, more: any = {}) => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: id, reason: 'answer', ...more } as any)
  await done('t1', 'Here is what I read.\n\nTell me the concept in your own words?')
  expect(prompts[prompts.length - 1]).toMatch(/^BMUZ engine — this message comes from the BMUZ engine, not the creative \(step "ask"\)\. The last message asked "Tell me the concept in your own words\?" in plain text/)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"nudge","step":"ask","n":1,"question":"Tell me the concept in your own words\?"/)
  await done('t2', 'Fine.')
  expect(prompts[prompts.length - 1]).toMatch(/ended without the question box or step_done/)
  const before = prompts.length
  await done('t3', 'Still here?')
  expect(prompts.length).toBe(before) // two nudges used: the watchdog covers it from here
  // an Esc, or the creative's own "bmuz doctor" turn, is never nudged
  await done('t4', 'What next?', { isAborted: true, reason: 'aborted' })
  await $.prompt.submit({ text: 'bmuz doctor' } as any)
  await done('t5', 'BMUZ doctor · all good. Anything else?')
  expect(prompts.filter(p => /^BMUZ engine — this message comes from the BMUZ engine, not the creative \(step "ask"\)/.test(p)).length).toBe(2)
})

test('F228: a question box with a wall of plain text before it in the same turn is refused (the box would cover it); one short line is fine', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let rows: any[] = []
  on('session.messages', () => ({ value: rows }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'User has answered your questions: "Q?"="A"' }))
  const { w } = shown(on)
  await start($, true)
  rows = [
    { role: 'user', text: 'BMUZ step "ask"', toolUses: [] },
    { role: 'assistant', text: 'Those 5 research questions:\n1. What made Pong feel good?\n2. Readability?\n3. Comebacks?\n4. Online?\n5. Portals?', toolUses: [{ tool_use_id: 'tu1', tool: 'AskUserQuestion', input: {} }] },
  ]
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Keep them?' }] } as any)
  expect(refused(r)).toBe(true)
  expect(why(r)).toMatch(/came before this question box in the same turn, and the box covers them/)
  rows = [rows[0], { role: 'assistant', text: 'Two quick gaps, frame first.', toolUses: [{ tool_use_id: 'tu2', tool: 'AskUserQuestion', input: {} }] }]
  const ok: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Q?' }] } as any)
  expect(refused(ok)).toBe(false)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"answer","step":"ask"/)
})

test('live look 2026-11-10: a question box with an "I\'ll paste it" option is refused, even when the transcript can\'t be read', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('session.messages', () => { throw new Error('no transcript') })
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'User has answered your questions: "Q?"="A"' }))
  const { w } = shown(on)
  await start($, true)
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Your material?', options: [{ label: 'Nothing to share yet' }, { label: "I'll paste the link" }] }] } as any)
  expect(refused(r)).toBe(true)
  expect(why(r)).toMatch(/stands in for typing/)
  const ok: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: "Paste the link in 'Type something' below", options: [{ label: 'Nothing to share yet' }, { label: 'Look in this folder again' }] }] } as any)
  expect(refused(ok)).toBe(false)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"deviation","step":"ask","tool":"AskUserQuestion"/)
})

test('F228 review: the creative\'s clarifying question answered in plain text is not nudged; a reply that asks them something is', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { prompts } = shown(on)
  await start($, true)
  const done = (id: string, answer: string) => $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: id, reason: 'answer' } as any)
  const nudged = () => prompts.filter(p => /^BMUZ engine — this message comes from the BMUZ engine, not the creative \(step "ask"\)/.test(p)).length
  await $.prompt.submit({ text: 'what do you mean by frame?' } as any)
  await done('t1', 'The frame is how the game is held and played: phone or desktop, which way up, who plays.')
  expect(nudged()).toBe(0)
  await $.prompt.submit({ text: 'ok, and smallest version?' } as any)
  await done('t2', 'The smallest version you would still enjoy playing. Want to answer that now?')
  expect(nudged()).toBe(1)
  expect(prompts[prompts.length - 1]).toMatch(/asked "The smallest version you would still enjoy playing\. Want to answer that now\?" in plain text/)
})

test('F228 review: "the game so far" shown in its own turn, then the next step\'s box with one short line, is not refused', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let rows: any[] = []
  on('session.messages', () => ({ value: rows }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'User has answered your questions: "Frame?"="desktop"' }))
  const { w } = shown(on)
  await start($, true)
  const soFar = ['## The game so far — Xong (version 1: what you shared)', '', '**Frame** — platform …', '- Open: phone or desktop?', '', '**Core loop** — …', '- Fixed: “standard pong”', '- Ideas: “0s are portals”', '', '**Rules** — …', '- Open: how does a match end?'].join('\n')
  rows = [
    { role: 'user', text: 'BMUZ engine — … Read /proj/.bmuz/last-shown.md and show the creative its text exactly as written …', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'r1', tool: 'Read', input: {} }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'r1', text: soFar }] },
    { role: 'assistant', text: soFar, toolUses: [] },
    { role: 'user', text: 'BMUZ step "ask" — The gaps (from the BMUZ engine; its instructions for this step are attached)', toolUses: [] },
    { role: 'assistant', text: 'Two quick gaps, frame first.', toolUses: [{ tool_use_id: 'q1', tool: 'AskUserQuestion', input: {} }] },
  ]
  const r: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Frame — phone or desktop?' }] } as any)
  expect(refused(r)).toBe(false)
  expect(w.files['/proj/.bmuz/journal.jsonl']).not.toMatch(/came before this question box/)
})

test('F232: an "onBack" step is skipped on the way through; "Not yet" at the gate runs it, told what the creative answered', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(String.fromCharCode(10))); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_: any, e: any) => ({ result: { questions: e.questions, answers: { [e.questions[0].question]: 'Not yet: change something' } } }))
  const w = world(on, base({ current: null, status: 'idle', finished: ['name'] }))
  w.files.SCRIPT = ['## define.lock.box · box', '? Lock the concept?', 'header: Lock', '- Not yet: change something — next, tell me what', '- Lock it: on to Design', ''].join(String.fromCharCode(10))
  w.files.PIPELINE = JSON.stringify({ ...PIPE, steps: [PIPE.steps[0],
    { id: 'change', kind: 'talk', needs: ['name'], onBack: true, tools: ['Read'], craft: 'craft/name.md', results: ['chapters'] },
    { id: 'lock', kind: 'gate', needs: ['change'], line: 'define.lock.box', approve: 'Lock it: on to Design', backTo: 'change' }] })
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  const js = () => w.files['/proj/.bmuz/journal.jsonl'].split('\n').filter(Boolean).map((l: string) => JSON.parse(l))
  expect(js().find((j: any) => j.ev === 'step.skip' && j.step === 'change')).toMatchObject({ onBack: true })
  expect(js().find((j: any) => j.ev === 'gate.back')).toMatchObject({ step: 'lock', back: { step: 'change', answer: 'Not yet: change something' } })
  expect(prompts.some(p => /^BMUZ step "change"/.test(p) && /The creative answered "Not yet: change something" at "define\.lock\.box", so this step runs again/.test(p))).toBe(true)
})

// ---- F215: stepping in with a bug (a side trip that leaves the step as it was) and the fix run beside the stage ----
const NL = String.fromCharCode(10)
const BUG_LINES = [
  '## bug.logged · say', "Logged as a bug: {bug}. It doesn't block what we're doing, so I'll fix it {when}.", '',
  '## bug.now · say · added', "Logged as a bug: {bug}. It blocks what we're doing, so I'll fix it now.", '',
  '## bug.often · box · added', '? Does it happen every time, or just once?', 'header: How often', '- Every time', '- Just once', '- Not sure', '',
  '## bug.none · say · added', 'Nothing to fix: there are no open bugs.', '',
  '## bug.how · say', "**Something broken**: say so, or type /bug. If it blocks what we're doing, I fix it now; otherwise it's logged and fixed in order.", '',
].join(NL)
const B004 = 'B004 · Score cut off on phone · P2 — annoying, not blocking'
const REPORT = { tool: 'mcp__bmuz__bug', title: 'Score cut off on phone', level: 'P2', steps: ['Open it on a phone'], expected: 'the whole score', actual: 'the last digit is cut off' }
const LOGGED = `Logged as a bug: ${B004}. It doesn't block what we're doing, so I'll fix it after F07.`
// bugs.mjs as the fake disk answers it: "add" logs B004, "next" hands B004 out (or nothing, when none = true).
function bugRuns(none = false) {
  return (argv: string[]) => {
    if (!/bugs[.]mjs$/.test(String(argv[1] ?? ''))) return { exitCode: 0, stdout: '{}' }
    if (argv[2] === 'add') return { exitCode: 0, stdout: JSON.stringify({ ok: true, id: 'B004', bug: B004 }) }
    if (argv[2] === 'next') return { exitCode: 0, stdout: JSON.stringify(none ? { ok: false, none: true } : { ok: true, id: 'B004', level: 'P2', bug: B004 }) }
    return { exitCode: 0, stdout: JSON.stringify({ ok: true, bug: B004 }) }
  }
}
function bugWorld(on: any, over: Record<string, unknown> = {}, opts: { none?: boolean } = {}) {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push([String(e.text), ...(e.context ?? [])].join(NL)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base(over), bugRuns(opts.none))
  const p = JSON.parse(w.files.PIPELINE)
  p.steps[0] = { ...p.steps[0], lines: ['define.pitch', 'define.pitch.how'], done: undefined, results: ['name'] }
  w.files.PIPELINE = JSON.stringify(p)
  w.files.SCRIPT = SCRIPT + NL + BUG_LINES
  w.files['/proj/.planning/SPRINT.md'] = ['# Sprint 3', '## F06 Seeds', '- [x] done', '## F07 Weather cards', '- [ ] 1. the hail card'].join(NL)
  return { w, prompts }
}
const keep = (s: any) => ({ current: s.current, status: s.status, results: s.results, retries: s.retries, said: s.said, finished: s.finished, opened: s.opened })
const PITCH_BOX = { question: "How's that?", header: 'The pitch', multiSelect: false, options: [{ label: 'Keep it', description: '' }, { label: 'Change something', description: 'next, tell me what' }] }
const talked = (prompts: string[]) => prompts.filter(p => /step "name"/.test(p)).length

test('F215: a bug that comes as the answer to a question box is logged; the line comes back word for word; the step\'s record is untouched and the box is asked again', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'name', status: 'working', retries: { name: 1 } })
  await start($, true)
  const box: any = await $.tool.call({ tool: SAY, line: 'define.pitch.how' } as any)
  expect(refused(box)).toBe(false)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [PITCH_BOX] } as any)
  const before = keep(JSON.parse(w.files['/proj/.bmuz/state.json']))
  const r: any = await $.tool.call(REPORT as any)
  expect(refused(r)).toBe(false)
  const out = JSON.parse(String(r.result))
  expect(out.say).toBe(LOGGED)
  expect(out.then).toMatch(/carry on with step "name" exactly where it was: the bug came in place of an answer, so ask the step's open question again/)
  expect(w.runs.some(a => /bugs[.]mjs$/.test(a[1]) && a[2] === 'add' && JSON.parse(a[3]).report.title === 'Score cut off on phone')).toBe(true)
  expect(keep(JSON.parse(w.files['/proj/.bmuz/state.json']))).toEqual(before)
  expect(events(w).find((j: any) => j.ev === 'bug')).toMatchObject({ id: 'B004', level: 'P2', now: false, step: 'name' })
  // said word for word at the turn's end: no correction; asked again, the box passes the script check
  await $.turn.complete({ answer: out.say, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(events(w).filter((j: any) => j.ev === 'said').pop()).toMatchObject({ lines: ['bug.logged'], missing: [] })
  expect(prompts.some(p => /was not written word for word/.test(p))).toBe(false)
  await $.tool.call({ tool: SAY, line: 'define.pitch.how' } as any)
  const again: any = await $.tool.call({ tool: 'AskUserQuestion', questions: [PITCH_BOX] } as any)
  expect(refused(again)).toBe(false)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).retries).toEqual({ name: 1 })
})

test('F215: a bug typed while a free question is open: told to ask that question again; "bmuz bug <words>" is the same step-in and leaves the question open', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'name', status: 'working' })
  const p = JSON.parse(w.files.PIPELINE)
  p.steps[0].lines = ['ideate.idea', 'define.pitch']
  w.files.PIPELINE = JSON.stringify(p)
  await start($, true)
  await $.tool.call({ tool: SAY, line: 'ideate.idea' } as any)
  await $.turn.complete({ answer: `Your Idea${NL}Tell me about your game in your own words.`, durationMs: 1, isAborted: false, turnId: 't0', reason: 'answer' } as any)
  await $.prompt.submit({ text: 'the score text is cut off on my phone' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/if this message reports something broken, it is a step-in, not an answer to the step/)
  const r: any = await $.tool.call(REPORT as any)
  expect(JSON.parse(String(r.result)).then).toMatch(/ask the step's open question again, the way you asked it/)
  await $.turn.complete({ answer: JSON.parse(String(r.result)).say, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await $.tool.call({ tool: SAY, line: 'ideate.idea' } as any)
  await $.prompt.submit({ text: 'bmuz bug the menu button overlaps' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/the creative stepped in to report a bug: "the menu button overlaps"/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).ask).toMatchObject({ line: 'ideate.idea' })
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).current).toBe('name')
})

test('F215: an auto run\'s turn that ends on a step-in is no failed try: a step this session started carries on; one waiting from an earlier session stays as it was', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'name', status: 'working' })
  await start($, false)
  await $.tool.call(REPORT as any)
  await $.turn.complete({ answer: LOGGED, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  let st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st).toMatchObject({ current: 'name', status: 'working', retries: {} })
  expect(events(w).some((j: any) => j.ev === 'stepin.left' && j.step === 'name')).toBe(true)
  expect(events(w).some((j: any) => j.ev === 'retry')).toBe(false)
  // a step started in this session: the step-in's turn end carries it on (its instructions again), still no failed try
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't2')
  const n = talked(prompts)
  await $.tool.call(REPORT as any)
  await $.turn.complete({ answer: LOGGED, durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' } as any)
  st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st).toMatchObject({ current: 'name', status: 'working', retries: {} })
  expect(events(w).some((j: any) => j.ev === 'stepin.back' && j.step === 'name')).toBe(true)
  expect(talked(prompts)).toBeGreaterThan(n)
})

// A tiny bug pipeline for the side trip: a script step, then a talk step.
const BUG_PIPE = { id: 'bug', version: 1, steps: [
  { id: 'pick', kind: 'script', needs: [], run: ['node', 'pick.mjs'] },
  { id: 'fix', kind: 'talk', needs: ['pick'], tools: ['Read'], craft: 'craft/review.md', results: ['files'] },
] }

test('F215: "bmuz bug" parks the stage where it is, runs the bug pipeline, and comes back to the same step with its record intact', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'name', status: 'working', retries: { name: 1 }, said: { step: 'name', lines: ['define.pitch'] }, opened: 'name' })
  w.files['PIPELINE:bug'] = JSON.stringify(BUG_PIPE)
  w.files['/proj/.bmuz/checkpoint-name.json'] = '{"x.txt":null}'
  await start($, true)
  const before = keep(JSON.parse(w.files['/proj/.bmuz/state.json']))
  await $.prompt.submit({ text: 'bmuz bug' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/fixing B004 · Score cut off on phone · P2 — annoying, not blocking now/)
  await turn($, 't1')
  // parked: the stage's record, as it was; the bug run has its own
  expect(keep(JSON.parse(w.files['/proj/.bmuz/parked/state.json']))).toEqual(before)
  expect(w.files['/proj/.bmuz/parked/checkpoint-name.json']).toBe('{"x.txt":null}')
  expect(w.files['/proj/.bmuz/checkpoint-name.json']).toBeUndefined()
  expect(JSON.parse(w.files['/proj/.bmuz/side.json'])).toMatchObject({ pipeline: 'bug', bug: 'B004', from: 'hello', phase: 'on', n: 1 })
  let st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st).toMatchObject({ pipeline: 'bug', current: 'fix', status: 'working', given: { bug: 'B004' }, finished: ['pick'] })
  expect(w.runs.some(a => a[1] === 'pick.mjs')).toBe(true)
  expect(prompts.some(p => /^BMUZ step "fix"/.test(p))).toBe(true)
  // the fix run finishes: its record is kept, the stage's is back, and its step carries on
  const done: any = await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { files: ['src/score.js'] } } as any)
  expect(refused(done)).toBe(false)
  await turn($, 't2')
  st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(keep(st)).toEqual(before)
  expect(w.files['/proj/.bmuz/side.json']).toBeUndefined()
  expect(w.files['/proj/.bmuz/parked/state.json']).toBeUndefined()
  expect(w.files['/proj/.bmuz/checkpoint-name.json']).toBe('{"x.txt":null}')
  expect(JSON.parse(w.files['/proj/.bmuz/bug-runs/1-B004/state.json'])).toMatchObject({ pipeline: 'bug', status: 'done', finished: ['pick', 'fix'] })
  expect(JSON.parse(w.files['/proj/.bmuz/bug-runs.json'])).toMatchObject([{ n: 1, bug: 'B004', from: 'hello', outcome: 'done' }])
  const js = events(w)
  expect(js.find((j: any) => j.ev === 'side.back')).toMatchObject({ bug: 'B004', outcome: 'done', step: 'name' })
  expect(js.find((j: any) => j.ev === 'resume')).toMatchObject({ step: 'name' })
  expect(prompts[prompts.length - 1]).toMatch(/step "name"/)
})

test('F215: a fix-now report (P0) says the "fix it now" line and the fix starts at the turn\'s end; "bmuz bug stop" puts it aside and the stage carries on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'name', status: 'working' })
  w.files['PIPELINE:bug'] = JSON.stringify(BUG_PIPE)
  await start($, true)
  const r: any = await $.tool.call({ ...REPORT, level: 'P0' } as any)
  expect(JSON.parse(String(r.result)).say).toBe(`Logged as a bug: ${B004}. It blocks what we're doing, so I'll fix it now.`)
  await $.turn.complete({ answer: JSON.parse(String(r.result)).say, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'bug', current: 'fix' })
  await $.prompt.submit({ text: 'bmuz bug stop' } as any)
  expect(w.runs.some(a => a[2] === 'status' && a[3] === 'B004' && a[4] === 'open')).toBe(true)
  await turn($, 't2')
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'hello', current: 'name', status: 'working' })
  expect(JSON.parse(w.files['/proj/.bmuz/bug-runs.json'])[0]).toMatchObject({ outcome: 'stopped' })
  expect(prompts[prompts.length - 1]).toMatch(/step "name"/)
})

test('F215: "bmuz bug" with nothing open says the script\'s two lines; the bug tool works at a gate too, leaving it waiting', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'approve', status: 'waiting', finished: ['name'] }, { none: true })
  await start($, true)
  await $.prompt.submit({ text: 'bmuz bug' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/Nothing to fix: there are no open bugs\.\n\n\*\*Something broken\*\*: say so, or type \/bug\./)
  const r: any = await $.tool.call(REPORT as any)
  expect(refused(r)).toBe(false)
  expect(JSON.parse(String(r.result)).then).toMatch(/Then end your turn\./)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ current: 'approve', status: 'waiting' })
})

// Review fix 3: coming back from a fix run is safe to run again after a crash at any point: the stage's record (its
// state, journal, last card and checkpoints) ends exactly as it was, and nothing of the fix run is left in its place.
for (let at = 1; at <= 24; at++) {
  test(`F215 review fix 3: a crash at write or delete ${at} on the way back from a fix run, then a new window: the stage's record is back, intact`, async ($, on) => {
    mock.clock(on, { now: 1000 })
    const { w } = bugWorld(on, { current: 'name', status: 'working', retries: { name: 1 }, said: { step: 'name', lines: ['define.pitch'] }, opened: 'name' })
    w.files['PIPELINE:bug'] = JSON.stringify(BUG_PIPE)
    w.files['/proj/.bmuz/checkpoint-name.json'] = '{"x.txt":null}'
    w.files['/proj/.bmuz/last-card.md'] = 'THE STAGE CARD\n'
    await start($, true)
    const before = keep(JSON.parse(w.files['/proj/.bmuz/state.json']))
    const journalBefore = w.files['/proj/.bmuz/journal.jsonl']
    await $.prompt.submit({ text: 'bmuz bug' } as any)
    await turn($, 't1')
    // (the fix run leaves a card and a checkpoint of its own, which must not end up in the stage's record)
    w.files['/proj/.bmuz/last-card.md'] = 'THE FIX RUN CARD\n'
    await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { files: ['src/score.js'] } } as any)
    crash.at = at
    crash.seen = 0
    crash.down = false
    try { await turn($, 't2') } catch (err) { /* the window closed */ }
    const crashed = crash.down
    crash.at = 0
    crash.down = false
    await start($, true)
    const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
    expect({ crashed, pipeline: st.pipeline, ...keep(st) }).toEqual({ crashed, pipeline: 'hello', ...before })
    expect(w.files['/proj/.bmuz/last-card.md']).toBe('THE STAGE CARD\n')
    expect(w.files['/proj/.bmuz/checkpoint-name.json']).toBe('{"x.txt":null}')
    expect(w.files['/proj/.bmuz/checkpoint-fix.json']).toBeUndefined()
    expect(w.files['/proj/.bmuz/side.json']).toBeUndefined()
    expect(Object.keys(w.files).filter(f => f.startsWith('/proj/.bmuz/parked/'))).toEqual([])
    expect(w.files['/proj/.bmuz/journal.jsonl'].startsWith(journalBefore.trimEnd())).toBe(true)
    expect(JSON.parse(w.files['/proj/.bmuz/bug-runs/1-B004/state.json'])).toMatchObject({ pipeline: 'bug' })
    expect(w.files['/proj/.bmuz/bug-runs/1-B004/last-card.md']).toBe('THE FIX RUN CARD\n')
  })
}

// Review fix 6: an auto run can't loop on step-ins; a sweep takes only the bugs open when it started.
test('F215 review fix 6: in an auto run, a step this session started gets at most 2 step-in turns for free; the third counts as a failed try', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = bugWorld(on, { current: null, status: 'idle', finished: [] })
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't0')
  for (let i = 1; i <= 3; i++) {
    await $.tool.call(REPORT as any)
    await $.turn.complete({ answer: LOGGED, durationMs: 1, isAborted: false, turnId: `t${i}`, reason: 'answer' } as any)
  }
  const js = events(w)
  expect(js.filter((j: any) => j.ev === 'stepin.back').length).toBe(2)
  expect(js.filter((j: any) => j.ev === 'retry' && j.step === 'name').length).toBe(1)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).retries).toEqual({ name: 1 })
})

test('F215 review fix 6: "bmuz bug sweep" fixes the open P0–P2 bugs it started with, one after the other, and never one logged after it began', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push(String(e.text)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: 'name', status: 'working' }), (argv: string[]) => {
    if (!/bugs[.]mjs$/.test(String(argv[1] ?? ''))) return { exitCode: 0, stdout: '{}' }
    const one = (id: string) => ({ exitCode: 0, stdout: JSON.stringify({ ok: true, id, level: 'P2', bug: `${id} · x · P2 — annoying, not blocking` }) })
    if (argv[2] === 'open') return { exitCode: 0, stdout: JSON.stringify({ ok: true, ids: ['B004', 'B005'] }) }
    // (a bug logged during the sweep, B006, comes first by number for "next" without an id: it must never be taken)
    if (argv[2] === 'next') return one(argv[3] || 'B006')
    return { exitCode: 0, stdout: '{"ok":true}' }
  })
  w.files['PIPELINE:bug'] = JSON.stringify(BUG_PIPE)
  await start($, true)
  await $.prompt.submit({ text: 'bmuz bug sweep' } as any)
  await turn($, 't1')
  for (let i = 2; i <= 6; i++) {
    const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
    if (st.pipeline !== 'bug') break
    await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { files: [] } } as any)
    await turn($, `t${i}`)
  }
  const runs = JSON.parse(w.files['/proj/.bmuz/bug-runs.json'])
  expect(runs.map((r: any) => r.bug)).toEqual(['B004', 'B005'])
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'hello', current: 'name' })
})

test('F215 review fix 7: "bmuz stage" during a fix run is refused: finish or stop the bug fix first; the side trip is left as it was', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = bugWorld(on, { current: 'name', status: 'working' })
  w.files['PIPELINE:bug'] = JSON.stringify(BUG_PIPE)
  w.files['PIPELINE:define'] = JSON.stringify({ id: 'define', version: 1, steps: [{ id: 'welcome', kind: 'talk', tools: ['Read'], craft: 'craft/name.md' }] })
  await start($, true)
  await $.prompt.submit({ text: 'bmuz bug' } as any)
  await turn($, 't1')
  await $.prompt.submit({ text: 'bmuz stage define' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/didn't move: finish or stop the bug fix first \(bmuz bug stop\)/)
  const cmd: any = await $.command.run({ command: 'bmuz-stage', args: 'define' } as any)
  expect(String(cmd?.text ?? cmd?.value?.text ?? JSON.stringify(cmd))).toMatch(/finish or stop the bug fix first/)
  expect(JSON.parse(w.files['/proj/.bmuz/side.json'])).toMatchObject({ phase: 'on', bug: 'B004' })
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'bug' })
  expect(JSON.parse(w.files['/proj/bmuz.json']).pipeline).toBe('hello')
})

const OFTEN_BOX = { question: 'Does it happen every time, or just once?', header: 'How often', multiSelect: false, options: [{ label: 'Every time', description: '' }, { label: 'Just once', description: '' }, { label: 'Not sure', description: '' }] }
test('F215 review fix 9: the step-in\'s "how often" box is kept apart from the step\'s record: the step\'s own box is still pending after it, and an unasked one is dropped at the turn\'s end', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = bugWorld(on, { current: 'name', status: 'working' })
  await start($, true)
  await $.tool.call({ tool: SAY, line: 'define.pitch.how' } as any)
  const boxes = () => JSON.parse(w.files['/proj/.bmuz/state.json']).boxes.map((b: any) => b.id)
  expect(boxes()).toEqual(['define.pitch.how'])
  const r: any = await $.tool.call({ tool: 'mcp__bmuz__bug', ask: true } as any)
  expect(JSON.parse(String(r.result)).box.question).toBe(OFTEN_BOX.question)
  expect(boxes()).toEqual(['define.pitch.how'])
  expect(events(w).some((j: any) => j.ev === 'line' && j.line === 'bug.often')).toBe(false)
  expect(events(w).find((j: any) => j.ev === 'stepin.box')).toMatchObject({ during: 'name' })
  expect(refused(await $.tool.call({ tool: 'AskUserQuestion', questions: [OFTEN_BOX] } as any))).toBe(false)
  expect(boxes()).toEqual(['define.pitch.how'])
  expect(refused(await $.tool.call({ tool: 'AskUserQuestion', questions: [PITCH_BOX] } as any))).toBe(false)
  // one handed out but never asked goes at the turn's end
  await $.tool.call({ tool: 'mcp__bmuz__bug', ask: true } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(refused(await $.tool.call({ tool: 'AskUserQuestion', questions: [OFTEN_BOX] } as any))).toBe(true)
})

test('F215 review fix 9: the answer to the step-in box is journaled as the bug report\'s, not as the step\'s own answer', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w } = bugWorld(on, { current: 'name', status: 'working' })
  await start($, true)
  await $.tool.call({ tool: 'mcp__bmuz__bug', ask: true } as any)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [OFTEN_BOX] } as any)
  expect(events(w).some((j: any) => j.ev === 'answer' && j.step === 'name')).toBe(false)
  expect(events(w).some((j: any) => j.ev === 'stepin.answer' && j.during === 'name')).toBe(true)
})

// ---- F216: Develop's loop: a "loop" script step runs the feature pipeline once per feature, each run kept ----
const LOOP_PIPE = { id: 'hello', version: 1, steps: [
  { id: 'features', kind: 'script', needs: [], run: ['node', 'sprint.mjs', 'next', '{auto}'], loop: 'feature' },
  { id: 'after', kind: 'script', needs: ['features'], run: ['node', 'after.mjs'] },
] }
const FEAT_PIPE = { id: 'feature', version: 1, steps: [
  { id: 'build', kind: 'script', needs: [], run: ['node', 'build.mjs'] },
  { id: 'approve', kind: 'talk', needs: ['build'], tools: ['Read'], craft: 'craft/review.md', results: ['answer'] },
] }
const WAITING_LINE = ['', '## develop.waiting · say · added', 'Every feature of this sprint I could build is built. Waiting for your OK on: {features}. Say "bmuz go" when you\'re back, and I\'ll show you each one.', ''].join(String.fromCharCode(10))
// answers: what "sprint.mjs next" says, call after call; build: what build.mjs exits with
function loopWorld(on: any, answers: any[], build: () => number = () => 0) {
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push(String(e.text)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const nexts: string[][] = []
  const w = world(on, base({}), (argv: string[]) => {
    if (argv[1] === 'sprint.mjs' && argv[2] === 'next') { nexts.push(argv); return { exitCode: 0, stdout: JSON.stringify(answers.shift() ?? { done: true }) } }
    if (argv[1] === 'build.mjs') { const code = build(); return { exitCode: code, stdout: code ? 'the tests fail' : 'ok' } }
    return { exitCode: 0, stdout: '{}' }
  })
  w.files.PIPELINE = JSON.stringify(LOOP_PIPE)
  w.files['PIPELINE:feature'] = JSON.stringify(FEAT_PIPE)
  w.files.SCRIPT = SCRIPT + WAITING_LINE
  w.files['/proj/.bmuz/state.json'] = JSON.stringify({ pipeline: 'hello', current: null, status: 'idle', results: {}, retries: {}, finished: [], blocked: null, startedAt: null })
  return { w, prompts, nexts }
}

test('F216: the loop runs one kept feature run per feature (one may start at a step), comes back to the same step each time, and passes when the script says done', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts, nexts } = loopWorld(on, [{ start: { feature: 'F01', at: null } }, { start: { feature: 'F02', at: 'approve' } }, { done: true }])
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  // F01's run: the stage parked at the loop step, the feature run given its feature
  expect(JSON.parse(w.files['/proj/.bmuz/side.json'])).toMatchObject({ pipeline: 'feature', feature: 'F01', from: 'hello', phase: 'on', n: 1 })
  expect(JSON.parse(w.files['/proj/.bmuz/parked/state.json'])).toMatchObject({ pipeline: 'hello', current: 'features', status: 'working' })
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'feature', current: 'approve', given: { feature: 'F01' }, finished: ['build'] })
  expect(nexts[0][3]).toBe('live')
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { answer: 'approved' } } as any)
  await turn($, 't2')
  // F02's run starts at "approve": the build above it counts as done
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'feature', current: 'approve', given: { feature: 'F02' } })
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).entered).toMatchObject({ at: 'approve', skipped: ['build'] })
  await $.tool.call({ tool: 'mcp__bmuz__step_done', result: { answer: 'approved' } } as any)
  await turn($, 't3')
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st).toMatchObject({ pipeline: 'hello', status: 'done' })
  expect(st.finished).toEqual(['features', 'after'])
  expect(JSON.parse(w.files['/proj/.bmuz/feature-runs.json'])).toMatchObject([{ n: 1, feature: 'F01', outcome: 'done', record: '.bmuz/feature-runs/1-F01' }, { n: 2, feature: 'F02', startAt: 'approve', outcome: 'done' }])
  expect(JSON.parse(w.files['/proj/.bmuz/feature-runs/2-F02/state.json'])).toMatchObject({ pipeline: 'feature', status: 'done' })
  expect(w.files['/proj/.bmuz/side.json']).toBeUndefined()
  expect(nexts.length).toBe(3)
  expect(events(w).filter((j: any) => j.ev === 'side.back').map((j: any) => j.feature)).toEqual(['F01', 'F02'])
  expect(prompts.some(p => /step "approve"/.test(p))).toBe(true)
})

test('F216: an auto run never stalls and never approves: when only approvals are left, the question is noted, the waiting line said, and the run ends between steps', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts, nexts } = loopWorld(on, [{ wait: ['F01', 'F02'], features: ['F01 — Turn engine', 'F02 — Seed cards'] }])
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  expect(nexts[0][3]).toBe('auto')
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st).toMatchObject({ pipeline: 'hello', current: null, status: 'idle', finished: [] })
  expect(w.files['/proj/.bmuz/questions.md']).toMatch(/F01 — Turn engine, F02 — Seed cards: built and waiting for your OK/)
  expect(prompts[prompts.length - 1]).toMatch(/Waiting for your OK on: F01 — Turn engine, F02 — Seed cards\. Say "bmuz go" when you're back/)
  expect(events(w).find((j: any) => j.ev === 'loop.waiting')).toMatchObject({ features: ['F01', 'F02'] })
  expect(events(w).some((j: any) => j.ev === 'line' && j.line === 'develop.waiting')).toBe(true)
})

test('F216: an auto run moves past a feature run that BLOCKS: back to the loop, the feature marked BLOCKED, the next feature built', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let builds = 0
  const { w } = loopWorld(on, [{ start: { feature: 'F01', at: null } }, { start: { feature: 'F02', at: null } }, { wait: ['F01', 'F02'], features: ['F01', 'F02'] }], () => (++builds <= 3 ? 1 : 0))
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  // F01's build failed three times: BLOCKED, rolled back, and the run went back to the loop, which started F02
  const runs = JSON.parse(w.files['/proj/.bmuz/feature-runs.json'])
  expect(runs[0]).toMatchObject({ feature: 'F01', outcome: 'blocked', status: 'blocked' })
  expect(w.runs.some(a => a[1].endsWith('sprint.mjs') && a[2] === 'status' && a[3] === 'F01' && a[4] === 'blocked')).toBe(true)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'feature', given: { feature: 'F02' }, current: 'approve' })
})

test('F216: "bmuz park" sets the feature being built aside and the loop goes on', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = loopWorld(on, [{ start: { feature: 'F01', at: null } }, { done: true }])
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  await $.prompt.submit({ text: 'bmuz park' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/F01 is parked/)
  await turn($, 't2')
  expect(JSON.parse(w.files['/proj/.bmuz/feature-runs.json'])[0]).toMatchObject({ feature: 'F01', outcome: 'parked' })
  expect(w.runs.some(a => a[1].endsWith('sprint.mjs') && a[2] === 'status' && a[3] === 'F01' && a[4] === 'parked')).toBe(true)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json'])).toMatchObject({ pipeline: 'hello', status: 'done' })
})

test('F216: a gate with "auto": "carry" is noted and passed in an auto run (nothing approved)', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const prompts: string[] = []
  on('prompt.submit', (_: any, e: any) => { prompts.push(String(e.text)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({}))
  const p = JSON.parse(w.files.PIPELINE)
  p.steps[1] = { ...p.steps[1], auto: 'carry' }
  w.files.PIPELINE = JSON.stringify(p)
  w.files['/proj/.bmuz/state.json'] = state({ finished: ['name'] })
  await start($, false)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  const js = events(w)
  expect(js.find((j: any) => j.ev === 'gate.carried')).toMatchObject({ step: 'approve', question: 'Approve Moon Goat?' })
  expect(js.some((j: any) => j.ev === 'gate.answer')).toBe(false)
  expect(w.files['/proj/.bmuz/questions.md']).toMatch(/Approve Moon Goat\? \(an auto run carried on with the plan as it stands; nothing was approved for you\. To change it, say "bmuz undo name"\)/)
  expect(JSON.parse(w.files['/proj/.bmuz/state.json']).finished).toContain('approve')
})

test('F216: a new idea goes through the engine\'s idea tool (sprint.mjs idea) and its line comes back word for word; the step is untouched', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  w.files.SCRIPT = SCRIPT + ['', '## develop.idea · say · added', 'Noted on Ideas for Later: {idea}. It comes back at the milestone where it fits.', ''].join(String.fromCharCode(10))
  await start($, true)
  const before = JSON.parse(w.files['/proj/.bmuz/state.json'])
  const r: any = await $.tool.call({ tool: 'mcp__bmuz__idea', idea: 'seasons' } as any)
  expect(JSON.parse(String(r.result)).say).toBe('Noted on Ideas for Later: seasons. It comes back at the milestone where it fits.')
  expect(w.runs.some(a => a[1].endsWith('sprint.mjs') && a[2] === 'idea' && a[3] === 'seasons')).toBe(true)
  const after = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect({ current: after.current, status: after.status, retries: after.retries }).toEqual({ current: before.current, status: before.status, retries: before.retries })
})

test('F216: while a pipeline runs, Bash stays inside the project (a helper\'s and Claude\'s)', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const w = world(on, base({ current: 'name', status: 'working' }))
  const p = JSON.parse(w.files.PIPELINE)
  p.steps[0] = { ...p.steps[0], tools: ['Bash'] }
  w.files.PIPELINE = JSON.stringify(p)
  await start($, true)
  expect(refused(await $.tool.call({ tool: 'Bash', command: 'npm test' } as any))).toBe(false)
  const out: any = await $.tool.call({ tool: 'Bash', command: 'cat ../secrets.txt' } as any)
  expect(refused(out)).toBe(true)
  expect(why(out)).toMatch(/Bash stays inside this project/)
  expect(refused(await $.tool.call({ tool: 'Bash', command: 'rm .bmuz/state.json' } as any))).toBe(true)
  expect(refused(await $.tool.call({ tool: 'Bash', command: 'git push origin main' } as any))).toBe(true)
})

test('F216 review fix 4: during a feature run, "bmuz bug stop" is refused (no bug fix is running: "bmuz park" sets the feature aside), and "bmuz stage" names "bmuz park"', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const { w, prompts } = loopWorld(on, [{ start: { feature: 'F01', at: null } }, { done: true }])
  w.files['PIPELINE:define'] = JSON.stringify({ id: 'define', version: 1, steps: [{ id: 'welcome', kind: 'talk', tools: ['Read'], craft: 'craft/name.md' }] })
  await start($, true)
  await $.prompt.submit({ text: 'bmuz go' } as any)
  await turn($, 't1')
  await $.prompt.submit({ text: 'bmuz bug stop' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/no bug fix is running; say "bmuz park" to set this feature aside/)
  expect(JSON.parse(w.files['/proj/.bmuz/side.json'])).toMatchObject({ feature: 'F01', phase: 'on' })
  expect(w.runs.some(a => String(a[1]).endsWith('sprint.mjs') && a[2] === 'status')).toBe(false)
  await $.prompt.submit({ text: 'bmuz stage define' } as any)
  expect(prompts[prompts.length - 1]).toMatch(/finish building F01 first, or say "bmuz park" to set it aside/)
})
