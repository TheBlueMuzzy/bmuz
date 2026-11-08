// The mod under `claude plugin test`: the real hooks, a fake project in memory beneath them.
import { expect, mock, test } from 'claude-code/testing'

const PIPE = {
  id: 'hello',
  version: 1,
  steps: [
    { id: 'name', kind: 'talk', needs: [], tools: ['AskUserQuestion'], craft: 'craft/name.md', done: { type: 'result-has', key: 'name' } },
    { id: 'approve', kind: 'gate', needs: ['name'], question: 'Approve {name}?', options: ['Change the name', 'Approve'], approve: 'Approve', backTo: 'name' },
    { id: 'plan', kind: 'script', needs: ['approve'], run: ['node', 'x.mjs'], writes: ['plan.json'], done: { type: 'file-json-has', path: 'plan.json', key: 'name' } },
    { id: 'review', kind: 'talk', needs: ['plan'], tools: ['Read', 'Glob', 'Grep'], craft: 'craft/review.md', done: { type: 'result-has', key: 'verdict' } },
  ],
}

function state(over: Record<string, unknown>) {
  return JSON.stringify({ pipeline: 'hello', current: null, status: 'idle', results: { name: 'Moon Goat' }, retries: {}, finished: [], blocked: null, startedAt: 1, ...over })
}

// A fake disk and session beneath the plugin. Returns the files, the calls the tools got, and the runs.
function world(on: any, files: Record<string, string>) {
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
    // craft notes live in the plugin too: <root>/craft/x.md is craft/x.md
    const craft = unix.match(/(craft\/[\w-]+[.]md)$/)
    return craft ? craft[1] : unix
  }
  on('fs.exists', (_: any, e: any) => ({ value: key(e.path) in files }))
  on('fs.read', (_: any, e: any) => (key(e.path) in files ? { value: files[key(e.path)] } : { deny: 'ENOENT' }))
  on('fs.write', (_: any, e: any) => { files[key(e.path)] = e.text; return { value: undefined } })
  on('tool.register', (_: any, e: any) => ({ value: { tool: `mcp__bmuz__${e.name}` } }))
  on('command.register', (_: any, e: any) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_: any, e: any) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '{}', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
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
  on('prompt.submit', (_: any, e: any) => { prompts.push(String(e.text)); return { text: e.text } })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  const w = world(on, base({ current: 'name', status: 'working' }))
  await start($, false)
  for (let i = 0; i < 3; i++) await $.turn.complete({ answer: 'Red or blue?', durationMs: 1, isAborted: false, turnId: `t${i}` } as any)
  expect(prompts.filter(p => /nobody will answer/.test(p)).length).toBe(2)
  const st = JSON.parse(w.files['/proj/.bmuz/state.json'])
  expect(st.status).toBe('blocked')
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
  expect(w.runs).toEqual([])
  const q = asked.questions[0].question
  answer({ result: { questions: asked.questions, answers: { [q]: 'Approve' } } })
  await clock.advance(10)
  expect(w.files['/proj/.bmuz/journal.jsonl']).toMatch(/"ev":"gate.answer","step":"approve","answer":"Approve"/)
  expect(w.runs.length).toBeGreaterThan(0) // the script step started after the yes
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
    expect(t?.text).toBe('BMUZ · step 2 of 4 · approve · waiting for you · 01:00')
    await ui.unmount()
  }
})
