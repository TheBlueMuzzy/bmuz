// BMUZ engine: runs the pipeline file named in <project>/bmuz.json.
// The step logic lives in engine.js; this file is the motor that talks to Claude Code.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { BmuzBand } from '../types'
import * as E from './engine.js'

const band = atom({ plugin: 'bmuz', key: 'band' } as const, null)

// Rebuilt from project files at every session start (a reload loses module values).
let ctx: any = null
let pending: null | "advance" | "resume" = null
let watchdogBusy = false

const SAFE_DENY = 'BMUZ engine hit an error in its own code, so it refused this action to be safe. Run /bmuz-doctor.'

async function readText($: any, path: string) {
  if (!(await $.fs.exists(path))) return null
  return String(await $.fs.read(path))
}

async function journal($: any, entry: any) {
  const path = `${ctx.dir}/.bmuz/journal.jsonl`
  const old = (await readText($, path)) ?? ''
  const line = JSON.stringify({ t: await $.clock.now(), session: ctx.sessionId, ...entry })
  await $.fs.write(path, old + line + '\n')
}

async function save($: any) {
  await $.fs.write(`${ctx.dir}/.bmuz/state.json`, JSON.stringify(ctx.state, null, 2))
  const lock = ctx.state.current
    ? { step: ctx.state.current, status: ctx.state.status, startedAt: ctx.state.startedAt, session: ctx.sessionId }
    : { step: null, status: ctx.state.status, session: ctx.sessionId }
  await $.fs.write(`${ctx.dir}/.bmuz/lock.json`, JSON.stringify(lock))
  await showBand($)
}

async function showBand($: any) {
  const text = E.bandText(ctx.pipeline, ctx.state, await $.clock.now())
  await update($, band, () => ({ text, status: ctx.state.status }))
  $.ui.status(text)
}

function vars() {
  return { ...ctx.state.results, project: ctx.dir, plugin: ctx.root }
}

async function loadCtx($: any) {
  const dir = String(await $.session.cwd()).replace(/\\/g, '/')
  const cfgText = await readText($, `${dir}/bmuz.json`)
  if (cfgText === null) return null
  const root = String($.plugin.root).replace(/\\/g, '/')
  const c: any = { dir, root, sessionId: await $.session.id(), broken: null }
  try {
    c.cfg = JSON.parse(cfgText)
    c.pipeline = JSON.parse(String(await $.fs.read(`${root}/pipelines/${c.cfg.pipeline}.json`)))
    const problems = E.checkPipeline(c.pipeline)
    if (problems.length) c.broken = `pipeline ${c.cfg.pipeline} has problems: ${problems.join('; ')}`
    // Test only: let flow helpers use extra tools (the stall test's helper runs Bash sleep).
    for (const s of c.pipeline.steps) if (s.kind === 'flow' && c.cfg.testAgentTools) s.agentTools = [...(s.agentTools || []), ...c.cfg.testAgentTools]
  } catch (err) {
    c.broken = `could not load the pipeline: ${String(err)}`
    c.pipeline = { id: '?', steps: [] }
    c.cfg = {}
  }
  const stateText = await readText($, `${dir}/.bmuz/state.json`)
  if (stateText !== null) {
    c.state = JSON.parse(stateText)
  } else {
    // Doctor: no state file, so rebuild it from the journal (or start fresh).
    const lines = ((await readText($, `${dir}/.bmuz/journal.jsonl`)) ?? '').split('\n')
    c.state = E.rebuildFromJournal(c.pipeline.id, lines)
    c.rebuilt = true
  }
  c.lock = JSON.parse((await readText($, `${dir}/.bmuz/lock.json`)) ?? 'null')
  return c
}

async function craftOf($: any, step: any) {
  if (!step.craft) return ''
  return (await readText($, `${ctx.root}/${step.craft}`)) ?? ''
}

async function checkpoint($: any, step: any) {
  if (ctx.state.retries[step.id]) return // a retry keeps the checkpoint from before the first try
  const saved: Record<string, string | null> = {}
  for (const f of step.writes || []) saved[f] = await readText($, `${ctx.dir}/${f}`)
  await $.fs.write(`${ctx.dir}/.bmuz/checkpoint-${step.id}.json`, JSON.stringify(saved))
}

async function rollback($: any, step: any) {
  const text = await readText($, `${ctx.dir}/.bmuz/checkpoint-${step.id}.json`)
  if (text === null) return []
  const saved = JSON.parse(text)
  const undone: string[] = []
  for (const [f, body] of Object.entries(saved)) {
    if (body === null) await $.process.run(['node', `${ctx.root}/scripts/rm.mjs`, `${ctx.dir}/${f}`])
    else await $.fs.write(`${ctx.dir}/${f}`, String(body))
    undone.push(f)
  }
  return undone
}

async function look($: any, step: any, result: any) {
  const files: Record<string, string | null> = {}
  for (const f of E.checkFiles(step, vars())) files[f] = await readText($, `${ctx.dir}/${f}`)
  return { result, files }
}

// A step's done-check passed or failed: finish, retry or block. Returns 'next' | 'retry' | 'stop'.
async function settle($: any, step: any, verdict: any, result: any) {
  if (verdict.ok) {
    ctx.state = E.finish(ctx.state, step, result)
    await journal($, { ev: 'step.done', step: step.id, kind: step.kind, result: result ?? null })
    await save($)
    return 'next'
  }
  const out = E.onFail(ctx.state, step, verdict.why)
  ctx.state = out.state
  if (out.action === 'retry') {
    await journal($, { ev: 'retry', step: step.id, attempt: out.attempt, why: verdict.why })
    await save($)
    return 'retry'
  }
  const undone = await rollback($, step)
  await journal($, { ev: 'blocked', step: step.id, why: verdict.why, rolledBack: undone })
  await save($)
  $.ui.toast(`BMUZ: step ${step.id} is BLOCKED after ${E.MAX_RETRIES} retries: ${verdict.why}`)
  return 'stop'
}

async function startTalk($: any, step: any, why: string) {
  const craft = await craftOf($, step)
  const lead = why ? `The last try did not pass: ${why}.\n` : ''
  await $.prompt.submit({
    text: `BMUZ step "${step.id}".\n${lead}${craft}\nWhen it is done, call ${E.ENGINE_TOOL} with result ${JSON.stringify({ [step.done?.key ?? 'ok']: '...' })} and end your turn.`,
  })
}

async function startFlow($: any, step: any) {
  await checkpoint($, step)
  const args = E.fillDeep({ ...step.args, ...(ctx.cfg.flowArgs || {}) }, vars())
  ctx.state = { ...ctx.state, flow: { args, toolUseId: null, taskId: null } }
  await save($)
  await $.command.run({ command: step.workflow, args: JSON.stringify(args) })
}

async function runScript($: any, step: any) {
  await checkpoint($, step)
  const argv = E.fillDeep(step.run, vars())
  const ran = await $.process.run(argv, { cwd: ctx.dir, timeoutMs: 60000 })
  await journal($, { ev: 'script.ran', step: step.id, exitCode: ran.exitCode, stdout: ran.stdout.trim().slice(0, 300) })
  const verdict = E.doneCheck(step, vars(), await look($, step, null))
  if (verdict.ok && ran.exitCode !== 0) return { ok: false, why: `script exited ${ran.exitCode}` }
  return verdict
}

async function askGate($: any, step: any) {
  if (!ctx.interactive) {
    await journal($, { ev: 'gate.pending', step: step.id, why: 'no one to ask in this session; answer with /bmuz-approve' })
    return null
  }
  try {
    const answer = await $.ui.ask(E.fill(step.question, vars()), step.options)
    if (step.options.includes(answer)) return answer
    // An empty or typed answer (or an away-from-keyboard timeout) is no decision: keep waiting.
    await journal($, { ev: 'gate.pending', step: step.id, why: `answer was not an option: ${JSON.stringify(answer).slice(0, 80)}` })
    return null
  } catch (err) {
    await journal($, { ev: 'gate.pending', step: step.id, why: `ask closed: ${String(err).slice(0, 120)}` })
    return null
  }
}

async function applyGate($: any, step: any, answer: string) {
  await journal($, { ev: 'gate.answer', step: step.id, answer })
  const out = E.answerGate(ctx.pipeline, ctx.state, step, answer)
  const before = ctx.state.finished
  ctx.state = out.state
  if (out.approved) await journal($, { ev: 'step.done', step: step.id, kind: 'gate', result: null })
  else await journal($, { ev: 'gate.back', step: step.id, dropped: before.filter((id: string) => !ctx.state.finished.includes(id)) })
  await save($)
}

// Runs steps until one has to wait (a talk turn, a gate, a flow, a block).
async function advance($: any, resume: boolean) {
  for (let guard = 0; guard < 20; guard++) {
    const s = ctx.state
    if (s.status === 'blocked' || s.status === 'done') return
    let step = s.current ? E.stepById(ctx.pipeline, s.current) : null
    const isRestart = !!step
    if (!step) {
      step = E.nextStep(ctx.pipeline, s)
      if (!step) {
        ctx.state = { ...s, status: 'done', current: null, startedAt: null }
        await journal($, { ev: 'pipeline.done' })
        await save($)
        return
      }
    } else if (s.status === 'working' && !resume && step.kind !== 'script') {
      return // a talk or flow step is already under way
    }
    if (isRestart && resume) await journal($, { ev: 'resume', step: step.id, status: s.status })
    ctx.state = E.begin(ctx.state, step, await $.clock.now())
    await journal($, { ev: 'step.start', step: step.id, kind: step.kind, attempt: (ctx.state.retries[step.id] || 0) + 1 })
    await save($)
    resume = false

    if (step.kind === 'talk') return startTalk($, step, '')
    if (step.kind === 'flow') return startFlow($, step)
    if (step.kind === 'gate') {
      const answer = await askGate($, step)
      if (answer === null) return
      await applyGate($, step, answer)
      continue
    }
    if (step.kind === 'script') {
      const verdict = await runScript($, step)
      const next = await settle($, step, verdict, null)
      if (next === 'stop') return
      if (next === 'retry') ctx.state = { ...ctx.state, current: step.id }
      continue
    }
  }
}

async function stepDone($: any, e: any) {
  const step = E.stepById(ctx.pipeline, ctx.state.current)
  const result = e.result && typeof e.result === 'object' ? e.result : {}
  const verdict = E.doneCheck(step, vars(), await look($, step, result))
  const next = await settle($, step, verdict, result)
  if (next === 'next') {
    pending = "advance"
    return { result: 'Recorded. End your turn now; the BMUZ engine starts the next step itself.' }
  }
  if (next === 'retry') {
    ctx.state = { ...ctx.state, current: step.id }
    await save($)
    return { result: `Not done: ${verdict.why}. Fix it and call ${E.ENGINE_TOOL} again (retry ${ctx.state.retries[step.id]} of ${E.MAX_RETRIES}).` }
  }
  return { result: `BLOCKED: ${verdict.why}. Stop and tell the creative in one line.` }
}

async function flowFinished($: any, n: any) {
  const step = E.stepById(ctx.pipeline, ctx.state.current)
  await journal($, { ev: 'flow.result', step: step.id, status: n.status, taskId: n.taskId, result: n.result ?? null })
  const verdict = n.status === 'completed'
    ? E.doneCheck(step, vars(), await look($, step, n.result))
    : { ok: false, why: `the workflow ended ${n.status}` }
  const next = await settle($, step, verdict, null)
  if (next === 'retry') {
    ctx.state = { ...ctx.state, current: step.id, status: 'idle' }
    await save($)
  }
  return next // the caller lets turn.complete run the next step
}

async function watchdog($: any) {
  if (!ctx || watchdogBusy) return
  watchdogBusy = true
  try {
    const limit = ctx.cfg.watchdogMs ?? ctx.pipeline.watchdogMs ?? 1200000
    if (!E.isStalled(ctx.pipeline, ctx.state, await $.clock.now(), limit)) return
    const step = E.stepById(ctx.pipeline, ctx.state.current)
    await journal($, { ev: 'watchdog', step: step.id, limitMs: limit, taskId: ctx.state.flow?.taskId ?? null })
    $.ui.toast(`BMUZ watchdog: step ${step.id} ran past ${Math.round(limit / 1000)}s; stopping it`)
    if (step.kind === 'flow' && ctx.state.flow?.taskId) {
      try {
        const stopped: any = await $.tool.call({ tool: 'TaskStop', task_id: ctx.state.flow.taskId } as any)
        await journal($, { ev: 'watchdog.stopped', step: step.id, deny: stopped.deny ?? null, text: String(stopped.text ?? '').slice(0, 160) })
      } catch (err) {
        await journal($, { ev: 'watchdog.stop-failed', step: step.id, why: String(err).slice(0, 200) })
      }
    }
    const next = await settle($, step, { ok: false, why: `stalled past ${Math.round(limit / 1000)}s (watchdog)` }, null)
    if (next === 'retry') {
      ctx.state = { ...ctx.state, current: step.id, status: 'idle' }
      await save($)
      try {
        await advance($, false)
      } catch (err) {
        await journal($, { ev: 'watchdog.restart-failed', step: step.id, why: String(err).slice(0, 200) })
      }
    }
  } finally {
    watchdogBusy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    ctx = await loadCtx($)
    if (!ctx) return r
    ctx.interactive = (e as any).isInteractive === true
    if (ctx.lock && ctx.lock.step && !ctx.lock.closed && ctx.lock.session !== ctx.sessionId) {
      await journal($, { ev: 'crash.detected', lockStep: ctx.lock.step, lockStatus: ctx.lock.status, lockSession: ctx.lock.session })
    }
    if (ctx.rebuilt) await journal($, { ev: 'doctor.rebuilt', state: ctx.state })
    await $.tool.register({
      name: 'step_done',
      description: 'BMUZ engine: call this when the current talk step is finished, with its result object (for example {"name": "Moon Goat"}).',
      inputSchema: { type: 'object', properties: { result: { type: 'object' } }, required: ['result'] },
      isDeferred: false,
    })
    await $.command.register({ name: 'bmuz-go', description: 'BMUZ: start or resume the pipeline' })
    await $.command.register({ name: 'bmuz-approve', description: 'BMUZ: answer the open gate', argumentHint: '<option>' })
    await $.command.register({ name: 'bmuz-status', description: 'BMUZ: where are we' })
    await save($)
    $.clock.every(ctx.cfg.watchdogTickMs ?? 15000, () => { watchdog($) })
    if (ctx.interactive && ctx.state.status !== 'done' && ctx.state.finished.length + (ctx.state.current ? 1 : 0) > 0) {
      $.clock.after(1500, () => { advance($, true) })
    }
    return r
  })

  // A clean exit marks the lock closed; a lock left open means the window was killed.
  on('session.end', async ($, e, next) => {
    if (ctx) {
      const lock = JSON.parse((await readText($, `${ctx.dir}/.bmuz/lock.json`)) ?? '{}')
      await $.fs.write(`${ctx.dir}/.bmuz/lock.json`, JSON.stringify({ ...lock, closed: true }))
    }
    return next(e)
  })

  // The guard: every tool call, the model's and its helpers', is judged against the current step.
  on('tool.call', async ($, e, next) => {
    if (!ctx) return next(e)
    if (await $.fs.exists(`${ctx.dir}/.bmuz/test-fault`)) throw new Error('injected fault (test)')
    if (ctx.broken) return { deny: `BMUZ engine: ${ctx.broken}` }
    const call = { tool: String(e.tool), agentId: (e as any).agentId }
    const verdict = E.judgeTool(ctx.pipeline, ctx.state, call)
    if (!verdict.allow) {
      await journal($, { ev: 'deviation', step: ctx.state.current, tool: call.tool, agentId: call.agentId ?? null, why: verdict.why })
      return { deny: verdict.why }
    }
    if (call.tool === E.ENGINE_TOOL) return stepDone($, e)
    if (verdict.rewriteWorkflow) {
      const step = E.stepById(ctx.pipeline, ctx.state.current)
      const want = ctx.state.flow?.args ?? E.fillDeep(step.args, vars())
      const ran: any = await next({ ...(e as any), name: step.workflow, args: want, script: undefined, scriptPath: undefined })
      const res = ran.result || {}
      ctx.state = { ...ctx.state, flow: { args: want, toolUseId: (e as any).tool_use_id, taskId: res.taskId ?? null } }
      await journal($, { ev: 'flow.launched', step: step.id, workflow: step.workflow, args: want, taskId: res.taskId ?? null, runId: res.runId ?? null, deny: ran.deny ?? null })
      await save($)
      return ran
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: SAFE_DENY }))

  // Prompts: a flow's result arrives as a task notification (the engine takes it);
  // the creative's "bmuz go" / "bmuz approve <option>" are read here too, so they
  // work in every session kind. The engine's own work then runs at turn.complete,
  // the one place where starting a turn, a command or a question is allowed.
  on('prompt.submit', async ($, e, next) => {
    if (!ctx) return next(e)
    const kind = (e as any).origin?.kind
    const text = String((e as any).text)
    if (kind === 'task-notification') {
      const n = E.parseTaskNotification(text)
      const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
      if (!n || !step || step.kind !== 'flow') return next(e)
      if (ctx.state.flow?.toolUseId && n.toolUseId !== ctx.state.flow.toolUseId) return next(e)
      await flowFinished($, n)
      pending = 'advance'
      return next({ ...(e as any), text: `BMUZ engine: the "${step.id}" helper finished and the engine checked its work. Reply with one short line; the engine starts the next step itself.` })
    }
    if (kind === 'plugin' || kind === 'peer') return next(e)
    const go = text.match(/^\s*bmuz (go|approve)\s*(.*)$/i)
    if (go && go[1].toLowerCase() === 'approve') {
      const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
      if (step && step.kind === 'gate') {
        const answer = go[2].trim() || step.options[0]
        if (step.options.includes(answer)) {
          await applyGate($, step, answer)
          pending = 'advance'
        }
      }
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: gate answered. Reply with one short line; the engine runs the next step itself.)` })
    }
    if (go) {
      pending = 'resume'
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: starting. Reply with one short line; the engine runs the step itself.)` })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!ctx || (e as any).agentId) return r
    if (pending) {
      const resume = pending === 'resume'
      pending = null
      await advance($, resume)
    } else if (ctx.state.status === 'working') {
      const step = E.stepById(ctx.pipeline, ctx.state.current)
      if (step && step.kind === 'talk') await journal($, { ev: 'turn.ended-open', step: step.id })
    }
    return r
  })

  // Slash commands for a live window: they hand the work to a timer, since a
  // command hook may not start a turn itself.
  on('command.run', { command: 'bmuz-go' }, async $ => {
    if (!ctx) return { text: 'No bmuz.json here: BMUZ is off in this folder.' }
    if (ctx.broken) return { text: `BMUZ engine: ${ctx.broken}` }
    $.clock.after(50, () => { advance($, true) })
    return { text: 'BMUZ engine: starting.' }
  })

  on('command.run', { command: 'bmuz-approve' }, async ($, e) => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
    if (!step || step.kind !== 'gate') return { text: 'No gate is open.' }
    const answer = String((e as any).args || '').trim() || step.options[0]
    if (!step.options.includes(answer)) return { text: `Pick one of: ${step.options.join(' / ')}` }
    await applyGate($, step, answer)
    $.clock.after(50, () => { advance($, false) })
    return { text: `BMUZ engine: gate answered "${answer}".` }
  })

  on('command.run', { command: 'bmuz-status' }, async $ => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    return { text: `${E.bandText(ctx.pipeline, ctx.state, await $.clock.now())}\n${JSON.stringify(ctx.state)}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = (await read($, band)) as BmuzBand | null
    if (!b) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const color = b.status === 'blocked' ? 'red' : b.status === 'waiting' ? 'yellow' : b.status === 'done' ? 'green' : 'cyan'
    return (
      <Box>
        <Text color={color}>{b.text}</Text>
      </Box>
    )
  })
}
