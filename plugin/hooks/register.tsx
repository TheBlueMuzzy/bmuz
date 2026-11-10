// BMUZ engine: runs the pipeline file named in <project>/bmuz.json.
// The step logic lives in engine.js; this file is the motor that talks to Claude Code.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { BmuzBand } from '../types'
import * as E from './engine.js'

const band = atom({ plugin: 'bmuz', key: 'band' } as const, null)

// Rebuilt from project files at every session start (a reload loses module values).
let ctx: any = null
// { card }: a hand-off card to show at the end of this turn; the next step starts after it is shown.
// "go": the creative's "bmuz go" (a resume that also moves a finished stage on to the next).
let pending: null | "advance" | "resume" | "go" | "retry" | { undo: string } | { card: string } = null
let watchdogBusy = false
let sessionInteractive = false
let sessionAuto = false // "bmuz auto" typed: this session runs unattended
// A talk step's full instructions, waiting for the engine's own short message to carry them as hidden
// context (Muzzy's live look 2026-11-09: the wall of grey step notes "is the user supposed to do something
// with this? can it be hidden?"). The creative sees one line; Claude reads the rest beside it.
let hiddenNotes: string | null = null
// The flow try this session already asked Claude to launch ("hello#2"). A "bmuz go" while it is on its
// way must not ask again (live check 2026-11-08: the second ask made Claude refuse the next real try).
let flowAskedHere = ''
// F228 task 3: a live talk step's turn that ends with neither the question box nor step_done gets the engine's nudge
// (a plain-text question stalled a live run 18.6 minutes, until the watchdog). Counted per step try; an answered
// box starts the count over. quietTurn: the creative's own "bmuz doctor / undo / …" turn, which ends open on purpose.
let nudges = { key: '', n: 0 }
let quietTurn = false
// creativeTurn: the turn began with the creative's own typed message (not the engine's, not a bmuz command)
let creativeTurn = false

const SAFE_DENY = 'BMUZ engine hit an error in its own code, so it refused this action to be safe. Run /bmuz-doctor.'

async function readText($: any, path: string) {
  if (!(await $.fs.exists(path))) return null
  return String(await $.fs.read(path))
}

// $.fs has no append, so a journal line is a read + a rewrite. Hooks and timers run side by side,
// so the writes go one at a time through this queue, or one would overwrite another's line.
let journalQueue: Promise<void> = Promise.resolve()
function journal($: any, entry: any) {
  const path = `${ctx.dir}/.bmuz/journal.jsonl`
  const sessionId = ctx.sessionId
  const run = journalQueue.then(async () => {
    const old = (await readText($, path)) ?? ''
    const line = JSON.stringify({ t: await $.clock.now(), session: sessionId, ...entry })
    await $.fs.write(path, old + line + '\n')
  })
  journalQueue = run.catch(() => {})
  return run
}

async function save($: any) {
  await $.fs.write(`${ctx.dir}/.bmuz/state.json`, JSON.stringify(ctx.state, null, 2))
  const lock = ctx.state.current
    ? { step: ctx.state.current, status: ctx.state.status, startedAt: ctx.state.startedAt, session: ctx.sessionId }
    : { step: null, status: ctx.state.status, session: ctx.sessionId }
  await $.fs.write(`${ctx.dir}/.bmuz/lock.json`, JSON.stringify(lock))
  await showBand($)
}

// Called after every state save, and every second by a timer (live check L3: the band stayed on
// "working" after BLOCKED until the turn ended). Only a changed text is sent on.
let lastBand = ''
async function showBand($: any) {
  if (!ctx) return
  const text = E.bandText(ctx.pipeline, ctx.state, await $.clock.now())
  if (text === lastBand) return
  lastBand = text
  await update($, band, () => ({ text, status: ctx.state.status }))
  $.ui.status(text)
}

function vars() {
  return { ...ctx.state.results, project: ctx.dir, plugin: ctx.root }
}

// Reads and checks one pipeline file of the plugin. Returns { pipeline, problems } (problems in plain words).
async function loadPipeline($: any, root: string, name: string) {
  if (typeof name !== 'string' || !E.NAME_RE.test(name)) throw new Error(`bmuz.json's "pipeline" must be a pipeline name like hello, not ${JSON.stringify(name)}`)
  const pipeline = JSON.parse(String(await $.fs.read(`${root}/pipelines/${name}.json`)))
  const problems = E.checkPipeline(pipeline)
  if (!problems.length && pipeline.id !== name) problems.push(`the file pipelines/${name}.json says its id is "${pipeline.id}"`)
  for (const f of problems.length ? [] : E.pluginFiles(pipeline)) if (!(await $.fs.exists(`${root}/${f}`))) problems.push(`the craft note ${f} is missing`)
  return { pipeline, problems }
}

async function readJson($: any, path: string) {
  const text = await readText($, path)
  if (text === null) return null
  try { return JSON.parse(text) } catch (err) { return null }
}

// ---- Stages (F225): one project runs the stages in order ----
// Moving on archives the finished stage's record (.bmuz/state.json, journal, last card, checkpoints) into
// .bmuz/stages/<n>-<pipeline>/, lists it in .bmuz/stages.json, points bmuz.json at the next stage and starts its
// journal with the new stage's first state. The questions and decisions lists stay: they belong to the project.
// The plan is written to .bmuz/switch.json first and the file removed last, so a crash half way is finished
// at the next start instead of leaving bmuz.json and the state disagreeing.
async function planSwitch($: any, dir: string, root: string, from: string, to: string, at: string | null, given: any) {
  const stages = (await readJson($, `${dir}/.bmuz/stages.json`)) || []
  const n = (Array.isArray(stages) ? stages.length : 0) + 1
  // Checkpoints are named by step id, and two stages can share one ("bricks"): all of them move with the record.
  const ids = new Set<string>()
  for (const name of [from, to]) {
    try { for (const s of (await loadPipeline($, root, name)).pipeline.steps || []) ids.add(String(s.id)) } catch (err) { /* a pipeline that won't load has no checkpoints to move */ }
  }
  return { from, to, at: at || null, given: given || {}, n, archive: `stages/${n}-${from}`, checkpoints: [...ids].filter(id => E.NAME_RE.test(id)).map(id => `checkpoint-${id}.json`) }
}

async function finishSwitch($: any, dir: string, root: string, sw: any, sessionId: string | null = null) {
  const bmuz = `${dir}/.bmuz`
  // Re-checked here, right before anything is copied or deleted (a crash-recovery pass reads it from disk).
  const bad = E.switchProblem(sw)
  if (bad) throw new Error(`the stage-switch plan .bmuz/switch.json can't be used: ${bad}. Nothing was moved or deleted; take the file out of .bmuz (or fix it), then start again`)
  await $.fs.write(`${bmuz}/switch.json`, JSON.stringify(sw))
  const { pipeline, problems } = await loadPipeline($, root, sw.to)
  if (problems.length) throw new Error(`pipeline ${sw.to} has problems: ${problems.join('; ')}`)
  const entered = E.enterAt(pipeline, E.freshState(sw.to), sw.at, sw.given)
  if (entered.error) throw new Error(entered.error)
  // 1. The old record, copied once (a second pass after a crash must not copy the NEW state over it).
  const arch = `${bmuz}/${sw.archive}`
  const files = ['state.json', 'journal.jsonl', 'last-card.md', ...sw.checkpoints]
  if (!(await $.fs.exists(`${arch}/state.json`))) {
    for (const f of files) {
      const text = await readText($, `${bmuz}/${f}`)
      if (text !== null) await $.fs.write(`${arch}/${f}`, text)
    }
  }
  for (const f of files.slice(2)) if (await $.fs.exists(`${bmuz}/${f}`)) await $.process.run(['node', `${root}/scripts/rm.mjs`, `${bmuz}/${f}`])
  // 2. The stage list, 3. bmuz.json, 4. the new stage's state and the first line of its journal.
  const stages = (await readJson($, `${bmuz}/stages.json`)) || []
  const now = await $.clock.now()
  if (!stages.some((s: any) => s.n === sw.n)) {
    const old = await readJson($, `${arch}/state.json`)
    stages.push({ n: sw.n, pipeline: sw.from, status: old?.status ?? null, finished: old?.finished?.length ?? 0, record: `.bmuz/${sw.archive}`, movedOn: now, to: sw.to, at: sw.at })
    await $.fs.write(`${bmuz}/stages.json`, JSON.stringify(stages, null, 2))
  }
  const cfg = (await readJson($, `${dir}/bmuz.json`)) || {}
  await $.fs.write(`${dir}/bmuz.json`, JSON.stringify({ ...cfg, pipeline: sw.to }, null, 2))
  await $.fs.write(`${bmuz}/state.json`, JSON.stringify(entered.state, null, 2))
  await journalQueue
  await $.fs.write(`${bmuz}/journal.jsonl`, JSON.stringify({ t: now, session: sessionId, ev: 'stage.enter', from: sw.from, to: sw.to, at: sw.at, skipped: entered.skipped, record: `.bmuz/${sw.archive}`, state: entered.state }) + '\n')
  await $.process.run(['node', `${root}/scripts/rm.mjs`, `${bmuz}/switch.json`])
}

async function loadCtx($: any) {
  const dir = String(await $.session.cwd()).replace(/\\/g, '/')
  if ((await readText($, `${dir}/bmuz.json`)) === null) return null
  const root = String($.plugin.root).replace(/\\/g, '/')
  const c: any = { dir, root, sessionId: await $.session.id(), broken: null }
  // A stage switch cut short by a crash is finished first (it may still have bmuz.json to point on).
  const sw = await readJson($, `${dir}/.bmuz/switch.json`)
  if (sw && sw.from && sw.to) await finishSwitch($, dir, root, sw, c.sessionId)
  const cfgText = String(await readText($, `${dir}/bmuz.json`))
  try {
    c.cfg = JSON.parse(cfgText)
    const loaded = await loadPipeline($, root, c.cfg.pipeline)
    c.pipeline = loaded.pipeline
    const problems = loaded.problems
    if (problems.length) c.broken = `pipeline ${c.cfg.pipeline} has problems: ${problems.join('; ')}`
    // Test only: let flow helpers use extra tools (the stall test's helper runs Bash sleep).
    for (const s of c.pipeline.steps) if (s.kind === 'flow' && c.cfg.testAgentTools) s.agentTools = [...(s.agentTools || []), ...c.cfg.testAgentTools]
    // Test only: answers that stand in for the creative at talk steps, refused without BMUZ_TEST=1.
    const answersProblem = c.cfg.testAnswers === undefined ? null : E.testAnswersProblem(c.cfg, await envValue($, 'BMUZ_TEST'))
    if (answersProblem && !c.broken) c.broken = answersProblem
  } catch (err) {
    c.broken = `could not load the pipeline: ${String(err)}`
    c.pipeline = { id: '?', steps: [] }
    c.cfg = {}
  }
  // The state belongs to the pipeline that made it: switching bmuz.json to another pipeline must not count its
  // own steps as finished just because the ids match. Read from the state file itself, before the doctor (whose
  // rebuild would stamp it with bmuz.json's pipeline). A FINISHED run moves on: its record is archived and the
  // new stage starts (F225: a project that ran discover can go on to define). An unfinished one is kept and the
  // creative is told how to move on.
  const raw = await readJson($, `${dir}/.bmuz/state.json`)
  if (!c.broken && raw && typeof raw.pipeline === 'string' && raw.pipeline !== c.pipeline.id) {
    if (raw.status === 'done') {
      await finishSwitch($, dir, root, await planSwitch($, dir, root, raw.pipeline, c.pipeline.id, null, {}), c.sessionId)
      c.movedOn = raw.pipeline
    } else {
      c.mismatch = { from: raw.pipeline, to: c.pipeline.id }
      c.broken = `this project's .bmuz folder holds a "${raw.pipeline}" run that isn't finished, but bmuz.json says "${c.pipeline.id}". Say "bmuz stage ${c.pipeline.id}" to move on (the ${raw.pipeline} run is kept in .bmuz/stages/), or set bmuz.json back to "${raw.pipeline}"`
    }
  }
  // Doctor at every start: the journal is the record, so a missing, damaged or lagging state file
  // (a crash between writing the journal and the state) is rebuilt from it.
  try { c.lock = JSON.parse((await readText($, `${dir}/.bmuz/lock.json`)) ?? 'null') } catch (err) { c.lock = null }
  const report = await runDoctor($, c)
  c.state = report.state
  if (report.fixed) c.rebuilt = report.lines
  c.baseline = report.baseline
  return c
}

// Loads the project into ctx. A start-up error used to leave the engine off, so every tool was allowed
// in a BMUZ project; now the engine stays on and refuses everything until /bmuz-doctor gets it going.
// Returns true when it is ready to run. Also used by the doctor to try again.
async function startEngine($: any) {
  const dir = String(await $.session.cwd()).replace(/\\/g, '/')
  try {
    if (await $.fs.exists(`${dir}/.bmuz/test-fault-start`)) throw new Error('injected fault (test)')
    ctx = await loadCtx($)
  } catch (err) {
    ctx = { dir, broken: `the engine failed to start (${String(err).slice(0, 160)}); run /bmuz-doctor`, pipeline: { id: '?', steps: [] }, cfg: {}, state: E.freshState('?') }
  }
  if (!ctx) return false
  ctx.interactive = sessionInteractive
  ctx.canAsk = (await questionToolExists($)) && !(await unattendedSettings($))
  // An auto run never asks: a session nobody can answer, or bmuz.json "auto": true, or "bmuz auto" typed.
  // A background session says it is interactive (headless check 15, 2026-11-08) but has no question
  // tool, so "can anyone answer?" is read from the tool list, not from the session's word.
  ctx.auto = !ctx.interactive || !ctx.canAsk || ctx.cfg.auto === true || sessionAuto
  return !ctx.broken
}

// Started with settings/auto-run.json? It sets BMUZ_AUTO=1 in the session's environment, which a
// child process sees. Unknown (it can't be read) counts as no.
async function unattendedSettings($: any) {
  return (await envValue($, 'BMUZ_AUTO')) === '1'
}

// One environment variable of the session, read by a child process ('' when unset or unreadable).
async function envValue($: any, name: string) {
  try {
    const ran: any = await $.process.run(['node', '-e', `process.stdout.write(process.env.${name} || "")`], { timeoutMs: 10000 })
    return String(ran?.stdout ?? '').trim()
  } catch (err) {
    return ''
  }
}

// Is AskUserQuestion in this session's tool list? Unknown (the list can't be read) counts as yes,
// so a normal window never loses its questions; the other signs still catch -p.
async function questionToolExists($: any) {
  try {
    const list: any = await $.tool.list()
    const names = (Array.isArray(list) ? list : (list?.tools ?? list?.value ?? [])).map((t: any) => (typeof t === 'string' ? t : t?.name))
    return names.length === 0 ? true : names.includes('AskUserQuestion')
  } catch (err) {
    return true
  }
}

async function registerAll($: any) {
  await $.tool.register({
    name: 'step_done',
    description: 'BMUZ engine: call this when the current talk step is finished, with its result object (for example {"name": "Moon Goat"}).',
    inputSchema: { type: 'object', properties: { result: { type: 'object' } }, required: ['result'] },
    isDeferred: false,
  })
  await $.command.register({ name: 'bmuz-go', description: 'BMUZ: start or resume the pipeline' })
  await $.command.register({ name: 'bmuz-approve', description: 'BMUZ: answer the open gate', argumentHint: '<option>' })
  await $.command.register({ name: 'bmuz-status', description: 'BMUZ: where are we' })
  await $.command.register({ name: 'bmuz-doctor', description: 'BMUZ: check the state against the journal and say what went wrong' })
  await $.command.register({ name: 'bmuz-undo', description: 'BMUZ: the undo list, or go back to before a step', argumentHint: '[step]' })
  await $.command.register({ name: 'bmuz-retry', description: 'BMUZ: give a BLOCKED step 2 more tries' })
  await $.command.register({ name: 'bmuz-stage', description: 'BMUZ: move to another stage (the current one\'s record is kept)', argumentHint: '<stage> [step]' })
}

// The doctor, from /bmuz-doctor or "bmuz doctor": a broken start is tried again first.
async function doctorCommand($: any) {
  if (ctx.broken && !(await startEngine($))) return `BMUZ engine: ${ctx.broken}`
  return doctorNow($)
}

async function runDoctor($: any, c: any) {
  const stateText = await readText($, `${c.dir}/.bmuz/state.json`)
  const lines = ((await readText($, `${c.dir}/.bmuz/journal.jsonl`)) ?? '').split('\n')
  return E.doctor(c.pipeline, stateText, lines, c.lock, c.sessionId, await $.clock.now())
}

async function craftOf($: any, step: any) {
  if (!step.craft) return ''
  return (await readText($, `${ctx.root}/${step.craft}`)) ?? ''
}

// Saves the step's `writes` files as they are before its first try. Retries and resumes keep it,
// so a rollback or an undo always goes back to before the step began.
async function checkpoint($: any, step: any) {
  // (a "writes" path may carry a slug from an earlier result: .planning/research/discover-{slug}.md)
  const files = E.writesOf(step, vars())
  if (!files.length) return
  const saved: Record<string, string | null> = {}
  for (const f of files) saved[f] = await readText($, `${ctx.dir}/${f}`)
  await $.fs.write(`${ctx.dir}/.bmuz/checkpoint-${step.id}.json`, JSON.stringify(saved))
  await journal($, { ev: 'checkpoint', step: step.id, files: Object.keys(saved) })
}

async function rollback($: any, step: any) {
  const text = await readText($, `${ctx.dir}/.bmuz/checkpoint-${step.id}.json`)
  if (text === null) return []
  let saved: any
  try { saved = JSON.parse(text) } catch (err) { return [] }
  const undone: string[] = []
  for (const [f, body] of Object.entries(saved)) {
    // The checkpoint file can be hand-edited: re-check each path right before writing or deleting.
    if (!E.isSafePath(f)) continue
    if (body === null) await $.process.run(['node', `${ctx.root}/scripts/rm.mjs`, `${ctx.dir}/${f}`])
    else await $.fs.write(`${ctx.dir}/${f}`, String(body))
    undone.push(f)
  }
  return undone
}

async function look($: any, step: any, result: any) {
  const files: Record<string, string | null> = {}
  for (const f of E.checkFiles(step, vars())) files[f] = await readText($, `${ctx.dir}/${f}`)
  // A "script-ok" check runs its command in the project folder (the research flow's source check
  // fetches every link: a few seconds, up to a couple of minutes for a long list).
  const argv = E.checkRun(step, vars())
  let ran = null
  if (argv) {
    try {
      ran = await $.process.run(argv, { cwd: ctx.dir, timeoutMs: 180000 })
    } catch (err) {
      ran = { exitCode: -1, stdout: `the check could not run: ${String(err).slice(0, 200)}` }
    }
    await journal($, { ev: 'check.ran', step: step.id, exitCode: ran.exitCode, stdout: String(ran.stdout ?? '').trim().slice(0, 600) })
  }
  return { result, files, ran }
}

// A step's done-check passed or failed: finish, retry or block. Returns 'next' | 'retry' | 'stop'.
async function settle($: any, step: any, verdict: any, result: any) {
  if (verdict.ok) {
    const ms = typeof ctx.state.startedAt === 'number' ? (await $.clock.now()) - ctx.state.startedAt : null
    ctx.state = E.finish(ctx.state, step, result)
    await journal($, { ev: 'step.done', step: step.id, kind: step.kind, result: result ?? null, ms })
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
  $.ui.toast(`BMUZ: step ${step.id} is BLOCKED${E.retriesOf(step) ? ` after ${E.retriesOf(step)} retries` : ``}: ${verdict.why}`)
  return 'stop'
}

// Moves the project on to stage `to` (at step `at`, with `given` from the intake) inside this session: the
// finished stage's record is archived and the engine carries on in the new pipeline. Returns null when done,
// else the plain-words reason it didn't move.
async function switchStage($: any, to: string, at: string | null, given: any) {
  if (!E.NAME_RE.test(String(to))) return E.notOnEngineLine(String(to))
  if (!ctx.mismatch && ctx.state.status === 'working') return `step "${ctx.state.current}" is still running; move on once it has finished or is BLOCKED`
  if (!(await $.fs.exists(`${ctx.root}/pipelines/${to}.json`))) return E.notOnEngineLine(to)
  const from = ctx.mismatch ? ctx.mismatch.from : ctx.pipeline.id
  try {
    const { pipeline, problems } = await loadPipeline($, ctx.root, to)
    if (problems.length) return `pipeline ${to} has problems: ${problems.join('; ')}`
    if (at && !E.stepById(pipeline, at)) return `"${at}" isn't a step of ${to} (its steps: ${pipeline.steps.map((s: any) => s.id).join(', ')})`
    await finishSwitch($, ctx.dir, ctx.root, await planSwitch($, ctx.dir, ctx.root, from, to, at, given), ctx.sessionId)
  } catch (err) {
    return `the move to ${to} failed (${String(err).slice(0, 160)}); run /bmuz-doctor`
  }
  // The new stage, loaded the same way as at a session start.
  flowAskedHere = ''
  hiddenNotes = null
  // (a session found to be unattended stays unattended in the new stage)
  const wasAuto = ctx.auto
  const ok = await startEngine($)
  if (ctx) ctx.auto = ctx.auto || wasAuto
  if (!ok) return ctx ? ctx.broken : 'bmuz.json went missing'
  await save($)
  return null
}

// The current pipeline in words: a stage's name ("Discover"), else "the <id> pipeline" (the start).
function stageWords() {
  const s = E.stageOf(ctx.pipeline.id)
  return s ? s.name : ctx.pipeline.id === 'start' ? 'The start' : `the ${ctx.pipeline.id} pipeline`
}

// The carried material of a "next" (its "carry" file's "given"), or {} when there is none.
async function carried($: any, nx: any) {
  if (!nx || !nx.carry || !E.isSafePath(nx.carry)) return {}
  const j = await readJson($, `${ctx.dir}/${nx.carry}`)
  return j && j.given && typeof j.given === 'object' && !Array.isArray(j.given) ? j.given : {}
}

// A pipeline finished: offer its next stage (F225). go = the creative already said to move on ("bmuz go" on a
// finished stage). Returns true when the project moved on (the caller carries on in the new stage), false when
// it stays (not now, an auto run, a stage not on the engine yet: each said plainly).
async function offerNext($: any, go: boolean) {
  const nx = E.nextOf(ctx.pipeline, ctx.state.results)
  if (!nx) return false
  const stage = E.stageOf(nx.pipeline)
  // (a pipeline that isn't a stage — Discover since F228 — still reads as a name: "Discover is done. On to Define?")
  const from = E.stageOf(ctx.pipeline.id)?.name ?? ctx.pipeline.id.charAt(0).toUpperCase() + ctx.pipeline.id.slice(1)
  const to = stage?.name ?? nx.pipeline
  if (!(await $.fs.exists(`${ctx.root}/pipelines/${nx.pipeline}.json`)) || !stage) {
    await journal($, { ev: 'stage.not-on-engine', to: nx.pipeline })
    await $.prompt.submit({ text: `BMUZ engine: ${stageWords()} is done. ${E.notOnEngineLine(nx.pipeline)}. Tell the creative that in one or two plain lines, then end your turn.` })
    return false
  }
  if (nx.ask && !go) {
    const question = `${from} is done. On to ${to}?`
    const yes = `On to ${to}`
    let answer: string | null = null
    if (!ctx.auto) {
      try { answer = await $.ui.ask(question, [`Not yet: stay in ${from}`, yes]) } catch (err) { answer = null }
    }
    await journal($, { ev: 'stage.offer', to: nx.pipeline, answer })
    if (answer !== yes) {
      if (ctx.auto) await addQuestions($, ctx.pipeline.id, [{ question: `${question} (say "bmuz go" to move on)` }])
      return false
    }
  }
  const why = await switchStage($, nx.pipeline, nx.at, await carried($, nx))
  if (why) {
    await journal($, { ev: 'stage.refused', to: nx.pipeline, why })
    await $.prompt.submit({ text: `BMUZ engine: couldn't move on to ${to}: ${why}. Tell the creative in one plain line, then end your turn.` })
    return false
  }
  return true
}

async function startTalk($: any, step: any, why: string) {
  const craft = await craftOf($, step)
  // A hand-off step is told what is already decided, so it doesn't ask it again.
  const decided = step.handoff ? await readList($, 'decisions.json') : []
  const recap = Object.fromEntries((step.recap || []).map((k: string) => [k, ctx.state.results[k]]))
  const answers = ctx.cfg.testAnswers ? ctx.cfg.testAnswers[step.id] : undefined
  // A stage's first talk step opens with the stage's short intro, once per run (F225).
  const intro = E.introFor(ctx.pipeline, ctx.state)
  if (intro) {
    ctx.state = { ...ctx.state, introShown: true }
    await journal($, { ev: 'intro', step: step.id, stage: ctx.pipeline.id })
    await save($)
  }
  const given = E.givenFor(step, ctx.state.given)
  hiddenNotes = E.talkPrompt(step, craft, why, ctx.auto, decided, { recap, wrap: wrapWords(step), answers, intro: !!intro, given })
  await $.prompt.submit({ text: E.talkHeadline(step, intro) })
  // The prompt hook takes the notes as it attaches them. Still here = they never went out: say so in the journal
  // rather than let Claude guess the step from its headline.
  if (hiddenNotes !== null) {
    hiddenNotes = null
    await journal($, { ev: 'deviation', step: step.id, why: 'the step\'s instructions were not attached to its message (the prompt hook did not run)' })
    $.ui.toast(`BMUZ: step ${step.id} started without its instructions; type "bmuz retry" if Claude seems lost`)
  }
}

// The wrap-up question's words: what comes next if they keep going, and where wrapping up goes.
function wrapWords(step: any) {
  if (!step.wrapTo) return null
  const steps = ctx.pipeline.steps
  const next = steps[steps.indexOf(step) + 1]
  const to = E.stepById(ctx.pipeline, step.wrapTo)
  const say = (s: any) => (s ? s.description || s.id : 'the end')
  return { next: say(next), to: say(to) }
}

// The creative wrapped up after `step`: the steps up to its wrapTo are skipped (an "always" step still
// runs), journaled, and the run goes on from there.
async function wrapUp($: any, step: any) {
  const skipped = E.wrapSkips(ctx.pipeline, ctx.state, step)
  const empties = E.wrapEmpties(ctx.pipeline, ctx.state, skipped)
  ctx.state = E.applyWrap(ctx.state, skipped, empties)
  await journal($, { ev: 'wrap', step: step.id, to: step.wrapTo, skipped, empties })
  await save($)
}

// The creative's answers by number ("1 yes"): recorded in the decisions list and marked answered.
// Returns the engine's note for the message, or null when the message answers nothing.
async function recordAnswerLines($: any, text: string) {
  let questions: any[]
  let decisions: any[]
  // A hand-damaged list is not an engine fault: say so plainly and let the message through, rather than
  // holding back every message (the doctor can't mend these files).
  try {
    questions = await readList($, 'questions.json')
    decisions = await readList($, 'decisions.json')
  } catch (err) {
    return /^\s*\d/m.test(text) ? `BMUZ engine: .bmuz/questions.json or decisions.json is damaged (${String(err).slice(0, 80)}), so no answers were recorded. Tell the creative in one line.` : null
  }
  const answers = E.matchAnswers(text, questions)
  if (!answers.length) return null
  const day = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const out = E.recordAnswers(questions, decisions, answers, day)
  await $.fs.write(`${ctx.dir}/.bmuz/decisions.json`, JSON.stringify(out.decisions, null, 2))
  await $.fs.write(`${ctx.dir}/.bmuz/decisions.md`, E.decisionsMd(out.decisions))
  await saveQuestions($, out.list)
  await journal($, { ev: 'answers', answered: answers.map((a: any) => ({ n: a.n, key: a.key, answer: a.answer })) })
  return E.answersNote(answers)
}

async function startFlow($: any, step: any) {
  // (fillArgs: a whole-hole arg like "{assumptions}" reaches the workflow as the list itself)
  const args = E.fillArgs({ ...step.args, ...(ctx.cfg.flowArgs || {}) }, vars())
  ctx.state = { ...ctx.state, flow: { args, toolUseId: null, taskId: null } }
  await save($)
  await $.prompt.submit({ text: E.flowPrompt(step, args, (ctx.state.retries[step.id] || 0) + 1) })
}

async function runScript($: any, step: any) {
  const argv = E.fillDeep(step.run, vars())
  const ran = await $.process.run(argv, { cwd: ctx.dir, timeoutMs: 60000 })
  await journal($, { ev: 'script.ran', step: step.id, exitCode: ran.exitCode, stdout: ran.stdout.trim().slice(0, 300) })
  // A script that refuses says why in its output (Define's stage: "Not ready for Design: the pillars are still
  // open…"): those words are the reason, in place of a done-check that could only say a file lacks a line.
  if (ran.exitCode !== 0) {
    const said = String(ran.stdout || ran.stderr || '').trim()
    return { ok: false, why: `script exited ${ran.exitCode}${said ? `: ${said.length > 600 ? said.slice(0, 600) + '…' : said}` : ''}` }
  }
  return E.doneCheck(step, vars(), await look($, step, null))
}

async function askGate($: any, step: any) {
  if (ctx.auto) {
    // A gate is the creative's own OK: an auto run never answers it, and never opens a dialog that waits.
    await journal($, { ev: 'gate.pending', step: step.id, why: 'auto run: nobody to ask; answer with "bmuz approve <option>"' })
    await addQuestions($, step.id, [{ question: `${E.fill(step.question, vars())} (the run stopped here; answer with "bmuz approve ${step.approve}" or another option)` }])
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
// opts.timer: called from a timer (a window opening mid-run, /bmuz-go, /bmuz-approve, /bmuz-retry). A message the
// plugin sends from a timer skips the plugin's own prompt hook (Claude Code runs every hook "but the calling one"),
// so a talk step's hidden instructions would never be attached: Muzzy's live look 2026-11-09, a window that picked
// up a run mid-way got the one-line headline only, and Claude guessed the step. From a timer, a talk step is only
// kicked: a short engine line, and the step itself starts at that turn's end (turn.complete), where the hook runs.
// opts.go: the creative said "bmuz go": on a finished stage that is their OK to move on to the next one.
async function advance($: any, resume: boolean, opts: { timer?: boolean, go?: boolean } = {}) {
  for (let guard = 0; guard < 40; guard++) {
    const s = ctx.state
    if (s.status === 'blocked') return
    if (s.status === 'done') {
      // A finished stage moves on only with the creative's word ("bmuz go"); the offer itself came at its end.
      if (opts.go && (await offerNext($, true))) { opts = { ...opts, go: false }; resume = false; continue }
      return
    }
    let step = s.current ? E.stepById(ctx.pipeline, s.current) : null
    const isRestart = !!step
    if (!step) {
      step = E.nextStep(ctx.pipeline, s)
      if (!step) {
        ctx.state = { ...s, status: 'done', current: null, startedAt: null }
        await journal($, { ev: 'pipeline.done' })
        await save($)
        // F225: a stage's end offers the next stage; the start moves straight into the one the creative chose.
        if (await offerNext($, false)) continue
        return
      }
    } else if (s.status === 'working' && !resume && step.kind !== 'script') {
      return // a talk or flow step is already under way
    } else if (s.status === 'working' && step.kind === 'flow' && flowAskedHere === `${step.id}#${s.retries[step.id] || 0}`) {
      return // this session already asked for this try's launch; the watchdog covers it if it never comes
    }
    // A step with "when" runs only when the earlier result it names says yes (research offered, never forced):
    // otherwise it is skipped like a wrapped-up step, journaled, and the run goes on.
    if (!isRestart && !E.isWanted(step, vars())) {
      const empties = E.wrapEmpties(ctx.pipeline, ctx.state, [step.id])
      ctx.state = E.applyWrap(ctx.state, [step.id], empties)
      await journal($, { ev: 'step.skip', step: step.id, when: step.when, empties })
      await save($)
      continue
    }
    if (isRestart && resume) await journal($, { ev: 'resume', step: step.id, status: s.status })
    ctx.state = E.begin(ctx.state, step, await $.clock.now())
    // The checkpoint comes before the step.start line: a crash between them then retakes it (the files
    // haven't changed yet), instead of resuming with a stale checkpoint or none.
    if (!isRestart || !(await $.fs.exists(`${ctx.dir}/.bmuz/checkpoint-${step.id}.json`))) await checkpoint($, step)
    await journal($, { ev: 'step.start', step: step.id, kind: step.kind, attempt: (ctx.state.retries[step.id] || 0) + 1 })
    await save($)
    resume = false

    if (step.kind === 'talk' && opts.timer) {
      pending = 'resume'
      await $.prompt.submit({ text: E.kickLine(step) })
      return
    }
    if (step.kind === 'talk') return startTalk($, step, '')
    if (step.kind === 'flow') {
      flowAskedHere = `${step.id}#${ctx.state.retries[step.id] || 0}`
      return startFlow($, step)
    }
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
      // F228: a script step's "show" file goes to the creative in a turn of its own; the run goes on at its end.
      if (next === 'next' && step.show && (await showFile($, step))) return
      continue
    }
  }
}

// Shows a script step's "show" file: a copy goes to .bmuz/last-shown.md and the engine's own message asks Claude to
// show it word for word. Returns false (nothing shown, the run goes on) when the file isn't there.
async function showFile($: any, step: any) {
  // (the path is from the plugin's own pipeline file, checked at load; re-checked right before it is read)
  if (!E.isSafePath(step.show)) return false
  const text = await readText($, `${ctx.dir}/${step.show}`)
  if (text === null || !text.trim()) {
    await journal($, { ev: 'show.missing', step: step.id, path: step.show })
    return false
  }
  await $.fs.write(`${ctx.dir}/.bmuz/last-shown.md`, text.endsWith('\n') ? text : text + '\n')
  await journal($, { ev: 'show', step: step.id, path: step.show })
  pending = 'advance'
  await $.prompt.submit({ text: E.showPrompt(`${ctx.dir}/.bmuz/last-shown.md`) })
  return true
}

// An auto run's questions go to .bmuz/questions.md for the creative, each with the default it took.
async function addQuestions($: any, stepId: string, asks: any) {
  const day = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const lines = E.askLines(stepId, asks, day)
  if (!lines.length) return
  const path = `${ctx.dir}/.bmuz/questions.md`
  // (the parked questions stay at the end of the file, below these lines)
  await $.fs.write(path, E.questionsMd(await readText($, path), lines))
  await journal($, { ev: 'ask', step: stepId, count: lines.length })
}

// The project's questions and decisions lists. A damaged file throws: the hook then refuses to be safe,
// rather than starting an empty list over the creative's answers.
async function readList($: any, name: string) {
  const text = await readText($, `${ctx.dir}/.bmuz/${name}`)
  if (text === null) return []
  const list = JSON.parse(text)
  if (!Array.isArray(list)) throw new Error(`.bmuz/${name} is not a list`)
  return list
}

async function saveQuestions($: any, list: any[]) {
  await $.fs.write(`${ctx.dir}/.bmuz/questions.json`, JSON.stringify(list, null, 2))
  const path = `${ctx.dir}/.bmuz/questions.md`
  const old = await readText($, path)
  // (no file is made just to say there is nothing parked)
  if (old !== null || list.some((q: any) => q.status === 'parked')) await $.fs.write(path, E.questionsMd(old, [], list))
}

// A hand-off step passed: the engine writes its card, listing every open question (kept in
// .bmuz/last-card.md too, in case the session ends before it is shown). Returns the card's text.
async function handOff($: any, step: any, card: any, questions: any[]) {
  const day = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const { list, shown } = E.questionsForCard(E.addCardQuestions(questions, card.questions, day))
  await saveQuestions($, list)
  const text = E.renderCard(card, shown)
  await $.fs.write(`${ctx.dir}/.bmuz/last-card.md`, text + '\n')
  await journal($, { ev: 'card', step: step.id, questions: shown.map((q: any) => q.n), parked: list.filter((q: any) => q.status === 'parked').map((q: any) => q.n) })
  return text
}

async function stepDone($: any, e: any) {
  const step = E.stepById(ctx.pipeline, ctx.state.current)
  // ("wrap": the creative chose to wrap up; it is an instruction to the engine, not a result)
  const { asks, card, wrap, ...result } = e.result && typeof e.result === 'object' ? e.result : ({} as any)
  await addQuestions($, step.id, asks)
  // A hand-off step without a good card is not done, the same as a failed done-check (retries, then BLOCKED).
  // The lists are read before anything is settled, so a damaged one refuses the call with nothing half done.
  const questions = step.handoff ? await readList($, 'questions.json') : []
  const decisions = step.handoff ? await readList($, 'decisions.json') : []
  const cardVerdict = step.handoff ? E.checkCard(card, decisions) : { ok: true }
  // Every key in the step's "results" list must come back (a slug that names a file must be a slug).
  const missing = E.resultProblems(ctx.pipeline, step, result)
  const firstVerdict = !cardVerdict.ok ? cardVerdict : missing ? { ok: false, why: missing } : null
  const verdict = firstVerdict ?? E.doneCheck(step, vars(), await look($, step, result))
  const next = await settle($, step, verdict, result)
  if (next === 'next' && step.wrapTo && wrap === true) await wrapUp($, step)
  if (next === 'next' && step.handoff) {
    pending = { card: await handOff($, step, card, questions) }
    return { result: 'Recorded. End your turn now; the BMUZ engine shows the hand-off card itself.' }
  }
  if (next === 'next') {
    pending = "advance"
    return { result: 'Recorded. End your turn now; the BMUZ engine starts the next step itself.' }
  }
  if (next === 'retry') {
    ctx.state = { ...ctx.state, current: step.id }
    await save($)
    return { result: `Not done: ${verdict.why}. Fix it and call ${E.ENGINE_TOOL} again (retry ${ctx.state.retries[step.id]} of ${E.retriesOf(step)}).` }
  }
  return { result: `BLOCKED: ${verdict.why}. Stop and tell the creative in one line.` }
}

// The creative's "go back to before <step>": puts back each later step's checkpoint, newest first,
// so the files end as they were before <step> began. Returns plain words for the chat.
async function doUndo($: any, stepId: string) {
  const out = E.undoTo(ctx.pipeline, ctx.state, stepId)
  if (out.error) return `BMUZ engine: can't undo: ${out.error}.`
  const restored: string[] = []
  for (const id of out.redo) {
    const step = E.stepById(ctx.pipeline, id)
    if (step) restored.push(...(await rollback($, step)))
  }
  ctx.state = out.state
  await journal($, { ev: 'undo', to: stepId, redo: out.redo, restored })
  await save($)
  const files = [...new Set(restored)]
  return `BMUZ engine: went back to before "${stepId}". ${files.length ? `Put back: ${files.join(', ')}.` : 'No files to put back.'} Steps to run again: ${out.redo.slice().reverse().join(', ')}. Say "bmuz go" to carry on from there.`
}

async function doRetry($: any) {
  const out = E.unblock(ctx.state)
  if (out.error) return { text: `BMUZ engine: ${out.error}.`, ok: false }
  ctx.state = out.state
  await journal($, { ev: 'unblock', step: out.step })
  await save($)
  return { text: `BMUZ engine: step "${out.step}" gets 2 more tries.`, ok: true }
}

function undoMenu() {
  const list = E.undoList(ctx.pipeline, ctx.state)
  if (!list.length) return 'BMUZ: nothing to undo yet.'
  return ['BMUZ undo list (newest first). Say "bmuz undo <step>":', ...list.map((u: any) => `- ${u.step}: ${u.line}`)].join('\n')
}

async function doctorNow($: any) {
  const report = await runDoctor($, ctx)
  if (report.fixed) {
    ctx.state = report.state
    await journal($, { ev: 'doctor.fixed', why: report.lines.slice(1) })
    await save($)
  }
  return report.lines.join('\n')
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
  if (!ctx || ctx.broken || watchdogBusy) return
  watchdogBusy = true
  try {
    const limit = ctx.cfg.watchdogMs ?? ctx.pipeline.watchdogMs ?? 1200000
    const now = await $.clock.now()
    // The helper finished; its result is on the way. If it hasn't come in 5 minutes, it was lost: a stall after all.
    if (ctx.state.flow?.late && now - ctx.state.flow.late < 300000) return
    if (!E.isStalled(ctx.pipeline, ctx.state, now, limit)) return
    const step = E.stepById(ctx.pipeline, ctx.state.current)
    // Each await below lets a step_done or a flow result finish the step; act only if it is still this try.
    const stillThisTry = () => ctx.state.current === step.id && ctx.state.status === 'working'
    await journal($, { ev: 'watchdog', step: step.id, limitMs: limit, taskId: ctx.state.flow?.taskId ?? null })
    $.ui.toast(`BMUZ watchdog: step ${step.id} ran past ${Math.round(limit / 1000)}s; stopping it`)
    // (a "late" mark past its 5 minutes skips the stop: the task already ended, its result never came)
    if (step.kind === 'flow' && ctx.state.flow?.taskId && !ctx.state.flow.late) {
      try {
        const stopped: any = await $.tool.call({ tool: 'TaskStop', task_id: ctx.state.flow.taskId } as any)
        const said = String(stopped.text ?? stopped.result ?? '')
        if (!stillThisTry()) return
        // Run 9's race: the helper finished as the watchdog fired. Its result is on the way; no failed try.
        if (E.taskAlreadyEnded(said)) {
          ctx.state = { ...ctx.state, flow: { ...ctx.state.flow, late: now } }
          await journal($, { ev: 'watchdog.late', step: step.id, text: said.slice(0, 160) })
          await save($)
          return
        }
        await journal($, { ev: 'watchdog.stopped', step: step.id, deny: stopped.deny ?? null, text: said.slice(0, 160) })
      } catch (err) {
        await journal($, { ev: 'watchdog.stop-failed', step: step.id, why: String(err).slice(0, 200) })
      }
    }
    if (!stillThisTry()) return
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

// The step_done tool, the commands and the timers: once per session start (or at "bmuz new" mid-session).
async function armSession($: any) {
  await registerAll($)
  $.clock.every(ctx.cfg.watchdogTickMs ?? 15000, () => { watchdog($) })
  $.clock.every(1000, () => { showBand($).catch(() => {}) })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    lastBand = ''
    sessionInteractive = (e as any).isInteractive === true
    sessionAuto = false
    flowAskedHere = ''
    const ok = await startEngine($)
    if (!ctx) return r
    // Commands and timers exist even when the start failed, so /bmuz-doctor is there to get it going.
    await armSession($)
    if (!ok) return r
    if (ctx.movedOn) await journal($, { ev: 'stage.moved-on', from: ctx.movedOn, why: 'bmuz.json named another stage and the last one was finished: its record is kept in .bmuz/stages/' })
    // What kind of session this is, for the record (and the doctor): an unattended run must be known as one.
    await journal($, { ev: 'session', interactive: ctx.interactive, canAsk: ctx.canAsk, auto: ctx.auto, fields: Object.fromEntries(Object.entries(e as any).filter(([, v]) => typeof v !== 'object')) })
    // A window closed at a gate used to look like a clean stop (live check L2); only a clean end counts as one now.
    if (E.diedLastTime(ctx.lock, ctx.sessionId)) {
      await journal($, { ev: 'crash.detected', lockStep: ctx.lock.step, lockStatus: ctx.lock.status, lockSession: ctx.lock.session, endReason: ctx.lock.endReason ?? null })
    }
    if (ctx.rebuilt) await journal($, { ev: 'doctor.rebuilt', why: ctx.rebuilt.slice(1), state: ctx.state })
    if (ctx.baseline) await journal($, { ev: 'baseline', why: 'the journal was empty; this state file is the starting point', state: ctx.state })
    await save($)
    if (ctx.interactive && ctx.state.status !== 'done' && ctx.state.finished.length + (ctx.state.current ? 1 : 0) > 0) {
      $.clock.after(1500, () => { advance($, true, { timer: true }) })
    }
    return r
  })

  // A clean exit marks the lock closed; a lock left open means the window was killed.
  on('session.end', async ($, e, next) => {
    if (ctx) {
      const lock = JSON.parse((await readText($, `${ctx.dir}/.bmuz/lock.json`)) ?? '{}')
      // The reason tells a clean /exit from a closed window ("other"), which counts as a crash next time.
      await $.fs.write(`${ctx.dir}/.bmuz/lock.json`, JSON.stringify({ ...lock, closed: true, endReason: (e as any).reason ?? null }))
    }
    return next(e)
  })

  // The guard: every tool call, the model's and its helpers', is judged against the current step.
  on('tool.call', async ($, e, next) => {
    if (!ctx) return next(e)
    if (await $.fs.exists(`${ctx.dir}/.bmuz/test-fault`)) throw new Error('injected fault (test)')
    if (ctx.broken) return { deny: `BMUZ engine: ${ctx.broken}` }
    const call = { tool: String(e.tool), agentId: (e as any).agentId, input: e }
    const verdict = E.judgeTool(ctx.pipeline, ctx.state, call, { auto: ctx.auto })
    if (!verdict.allow) {
      await journal($, { ev: 'deviation', step: ctx.state.current, tool: call.tool, agentId: call.agentId ?? null, why: verdict.why })
      return { deny: verdict.why }
    }
    if (call.tool === E.ENGINE_TOOL) return stepDone($, e)
    if (call.tool === 'AskUserQuestion' && !ctx.auto) {
      // A background session lists the question tool but refuses it (headless check 15): then nobody
      // can answer, so from here this session is an auto run and the turn-end rule keeps it moving.
      // A person pressing Esc on the question is someone saying no, not nobody being there (live check
      // 2026-11-08: Esc turned a live window into an auto run, which then blocked plan mode's hand-in).
      // F228 task 3 (b): plain text written before the box in the same turn is covered by it (live run #20b). The
      // transcript is read to find it; when it can't be read the box goes ahead (a soft check: the step's own tool
      // limits still hold) and the journal says it went unchecked.
      const cur = E.stepById(ctx.pipeline, ctx.state.current)
      if (cur && cur.kind === 'talk' && ctx.state.status === 'working') {
        // An option standing in for typing ("I'll paste the link") never gets through (live look 2026-11-10).
        const fake = E.fakeTypeOptionProblem((e as any).questions)
        if (fake) {
          await journal($, { ev: 'deviation', step: cur.id, tool: 'AskUserQuestion', agentId: null, why: fake })
          return { deny: fake }
        }
        let rows: any = null
        try { rows = await $.session.messages() } catch (err) { rows = null }
        if (!Array.isArray(rows)) await journal($, { ev: 'ask.unchecked', step: cur.id, why: 'the transcript could not be read' })
        else {
          const hidden = E.hiddenTextProblem(E.turnText(rows))
          if (hidden) {
            await journal($, { ev: 'deviation', step: cur.id, tool: 'AskUserQuestion', agentId: null, why: hidden })
            return { deny: hidden }
          }
        }
      }
      const res: any = await next(e)
      if (!res?.deny && !res?.isError) nudges = { key: '', n: 0 }
      if ((res?.deny || res?.isError) && !E.isPersonDeclining(res)) {
        ctx.auto = true
        await journal($, { ev: 'auto.detected', why: 'the question tool was refused: nobody can answer in this session' })
      } else if (!res?.deny && !res?.isError) {
        // F228: the creative's answer, as the box returned it: a script checks the creative's "own words" against
        // these (ideate-doc.mjs), so a quote Claude hands back as theirs is checked, not trusted.
        await journal($, { ev: 'answer', step: ctx.state.current, text: E.answerText(res).slice(0, 6000) })
      }
      return res
    }
    if (verdict.rewriteWorkflow) {
      const step = E.stepById(ctx.pipeline, ctx.state.current)
      // One launch per try: a second Workflow call would run the helpers twice.
      if (ctx.state.flow?.toolUseId) {
        const why = `BMUZ engine: step ${step.id}'s workflow is already running; end your turn and the engine reads its result`
        await journal($, { ev: 'deviation', step: step.id, tool: 'Workflow', agentId: null, why })
        return { deny: why }
      }
      const want = ctx.state.flow?.args ?? E.fillArgs(step.args, vars())
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
    if (!ctx) {
      // Outside a BMUZ project the engine stays off, but a typed "bmuz go" gets a plain answer, not a guess
      // (Muzzy 2026-11-08: "if I type bmuz go into the normal cli, is the expected result the same?").
      const typed = String((e as any).text)
      const origin = (e as any).origin?.kind
      const typedHere = origin !== 'plugin' && origin !== 'peer' && origin !== 'task-notification'
      // F225: "bmuz new" makes this folder a BMUZ project and opens with "Where's your game right now?". Only this
      // typed command does it: a stray "bmuz go" in some other folder never writes a file.
      if (typedHere && /^\s*bmuz new\s*$/i.test(typed)) {
        const dir = String(await $.session.cwd()).replace(/\\/g, '/')
        await $.fs.write(`${dir}/bmuz.json`, JSON.stringify({ pipeline: 'start' }, null, 2))
        const ok = await startEngine($)
        if (!ctx) return next(e)
        await armSession($)
        if (!ok) return next({ ...(e as any), text: `${typed}\n(BMUZ engine: wrote bmuz.json but couldn't start: ${ctx.broken}. Tell the creative in one plain line.)` })
        await journal($, { ev: 'session', interactive: ctx.interactive, canAsk: ctx.canAsk, auto: ctx.auto, via: 'bmuz new' })
        await save($)
        pending = 'resume'
        return next({ ...(e as any), text: `${typed}\n(BMUZ engine: this folder is now a BMUZ project (bmuz.json written). Reply with one short line; the engine asks the first question itself.)` })
      }
      if (typedHere && /^\s*bmuz (go|approve|auto|undo|retry|doctor|stage)\b/i.test(typed)) {
        return next({ ...(e as any), text: `${typed}\n(BMUZ engine: off in this folder: there is no bmuz.json here, so nothing runs. Tell the creative that in plain words: BMUZ steps run inside a BMUZ project folder, and "bmuz new" starts a game here — it asks where the game is right now and puts them in at the right stage.)` })
      }
      return next(e)
    }
    if (await $.fs.exists(`${ctx.dir}/.bmuz/test-fault-prompt`)) throw new Error('injected fault (test)')
    const kind = (e as any).origin?.kind
    const text = String((e as any).text)
    if (kind === 'task-notification') {
      const n = E.parseTaskNotification(text)
      const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
      if (!n || !step || step.kind !== 'flow') return next(e)
      // Only this try's launch counts: an earlier try's helper finishing late is not this try's result.
      if (!ctx.state.flow?.toolUseId || n.toolUseId !== ctx.state.flow.toolUseId) return next(e)
      await flowFinished($, n)
      pending = 'advance'
      return next({ ...(e as any), text: `BMUZ engine: the "${step.id}" helper finished and the engine checked its work. Reply with one short line; the engine starts the next step itself.` })
    }
    // The engine's own talk-step line: its instructions ride along as context the creative never sees.
    if (kind === 'plugin' && (e as any).origin?.name === 'bmuz' && hiddenNotes && E.isTalkHeadline(text)) {
      const notes = hiddenNotes
      hiddenNotes = null
      return next({ ...(e as any), context: [...((e as any).context ?? []), notes] })
    }
    if (kind === 'plugin' || kind === 'peer') return next(e)
    quietTurn = false
    creativeTurn = true
    const say = (words: string) => {
      quietTurn = true
      return next({ ...(e as any), text: `${text}\n(${words}\nShow the creative these lines as they are, then end your turn.)` })
    }
    if (/^\s*bmuz new\s*$/i.test(text)) return say(`BMUZ engine: this folder is already a BMUZ project (bmuz.json says "${ctx.cfg?.pipeline ?? '?'}"). "bmuz go" carries on; "bmuz stage <stage>" moves to another stage.`)
    // "bmuz stage <stage> [step]": move to any stage (the current one's record is kept in .bmuz/stages/). Works while a
    // half-finished run of another pipeline holds the folder (bmuz.json changed by hand), which refuses all else.
    const st = text.match(/^\s*bmuz stage\s*([a-z0-9-]*)\s*([a-z0-9-]*)\s*$/i)
    if (st) {
      if (ctx.broken && !ctx.mismatch) return say(`BMUZ engine: ${ctx.broken}`)
      const to = st[1].toLowerCase()
      if (!to) return say(`BMUZ engine: say "bmuz stage <stage>", one of ${E.STAGES.map(s => s.id).join(', ')} (now: ${ctx.mismatch ? ctx.mismatch.from : ctx.pipeline.id}).`)
      const why = await switchStage($, to, st[2].toLowerCase() || null, await carried($, ctx.pipeline.next ?? null))
      if (why) return say(`BMUZ engine: didn't move: ${why}.`)
      pending = 'advance'
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: moved on to ${E.stageOf(to)?.name ?? to}; the last stage's record is kept in .bmuz/stages/. Reply with one short line; the engine starts the stage itself.)` })
    }
    const cmd = text.match(/^\s*bmuz (undo|retry|doctor)\b\s*(.*)$/i)
    if (cmd) {
      const what = cmd[1].toLowerCase()
      if (what === 'doctor') return say(await doctorCommand($))
      if (ctx.broken) return say(`BMUZ engine: ${ctx.broken}`)
      if (what === 'undo') return say(cmd[2].trim() ? await doUndo($, cmd[2].trim()) : undoMenu())
      const out = await doRetry($)
      if (out.ok) pending = 'advance'
      return say(out.text)
    }
    // "bmuz auto": run unattended from here (overnight, "just go"), then start like "bmuz go".
    if (/^\s*bmuz auto\s*$/i.test(text) && !ctx.broken) {
      sessionAuto = true
      ctx.auto = true
      await journal($, { ev: 'auto.on' })
      pending = 'resume'
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: unattended run. Nobody will answer questions now; take sensible defaults and note them. Reply with one short line; the engine runs the steps itself.)` })
    }
    const go = text.match(/^\s*bmuz (go|approve)\s*(.*)$/i)
    if (go && go[1].toLowerCase() === 'approve') {
      const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
      if (!step || step.kind !== 'gate') return say('BMUZ engine: no gate is open.')
      // No default answer: the creative names the option (an empty "bmuz approve" must never say yes).
      const answer = go[2].trim()
      if (!step.options.includes(answer)) return say(`BMUZ engine: the gate is still open. Answer with one of: ${step.options.map((o: string) => `"bmuz approve ${o}"`).join(' / ')}`)
      await applyGate($, step, answer)
      pending = 'advance'
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: gate answered. Reply with one short line; the engine runs the next step itself.)` })
    }
    if (go) {
      pending = 'go'
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: starting. Reply with one short line; the engine runs the step itself.)` })
    }
    // Answers to the card's numbered questions ("1 yes", "2: the first one"); any other message passes untouched.
    const noted = ctx.broken ? null : await recordAnswerLines($, text)
    if (noted) return next({ ...(e as any), text: `${text}\n(${noted})` })
    return next(e)
    // Without this, an error here let the prompt through unread (proof check 6), so a flow's result could
    // be lost. Now the prompt is dropped (it goes back to the input with the reason) and every tool is
    // refused until /bmuz-doctor. A prompt hook refuses with { drop } (mods docs, events: prompt.submit).
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    if (ctx) ctx.broken = 'the engine hit an error in its own code reading a prompt; run /bmuz-doctor'
    return { drop: 'BMUZ engine hit an error in its own code reading this prompt, so it held it back to be safe. Run /bmuz-doctor, then send it again.' }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!ctx || (e as any).agentId) return r
    if (pending && typeof pending === 'object' && 'card' in pending) {
      // The hand-off card, as the engine's own message; the next step starts when that turn ends.
      // (handOff already saved the card's text in .bmuz/last-card.md; the message points Claude at it)
      pending = 'advance'
      await $.prompt.submit({ text: E.cardPrompt(`${ctx.dir}/.bmuz/last-card.md`) })
    } else if (pending) {
      const resume = pending === 'resume' || pending === 'go'
      const go = pending === 'go'
      pending = null
      await advance($, resume, { go })
    } else if (ctx.state.status === 'working') {
      const step = E.stepById(ctx.pipeline, ctx.state.current)
      if (step && step.kind === 'talk') {
        await journal($, { ev: 'turn.ended-open', step: step.id })
        // Auto run: a turn that ends without step_done is Claude waiting on someone (live check L5: it asked
        // "red or blue?" in plain text and stopped). The engine answers "nobody's coming" and counts it as a failed try.
        if (ctx.auto) {
          const outcome = await settle($, step, { ok: false, why: 'the turn ended without step_done; in an auto run nobody will answer, so take the default and finish' }, null)
          if (outcome === 'retry') {
            ctx.state = { ...ctx.state, current: step.id }
            await save($)
            await startTalk($, step, 'the turn ended without step_done; in an auto run nobody will answer, so take the default and finish')
          }
        } else if (!quietTurn && (e as any).reason === 'answer' && !(e as any).isAborted && (!creativeTurn || E.plainQuestion(String((e as any).answer ?? '')))) {
          // (a turn the creative started — "what do you mean?" — answered in plain text is a conversation, not a stall:
          // nudged only when the reply itself asks them something in plain text)
          // A live window: nobody types into a plain-text question they didn't notice. The engine says so at once
          // (at most MAX_NUDGES times per try) instead of waiting for the watchdog. Not after the creative's own
          // "bmuz doctor / undo" (those turns end open on purpose) or an Esc.
          const key = `${step.id}#${ctx.state.retries[step.id] || 0}`
          if (nudges.key !== key) nudges = { key, n: 0 }
          const text = E.nudgeFor(step, String((e as any).answer ?? ''), nudges.n)
          if (text) {
            nudges.n += 1
            await journal($, { ev: 'nudge', step: step.id, n: nudges.n, question: E.plainQuestion(String((e as any).answer ?? '')) })
            await $.prompt.submit({ text })
          }
        }
      }
    }
    quietTurn = false
    creativeTurn = false
    return r
  })

  // Slash commands for a live window: they hand the work to a timer, since a
  // command hook may not start a turn itself.
  on('command.run', { command: 'bmuz-go' }, async $ => {
    if (!ctx) return { text: 'No bmuz.json here: BMUZ is off in this folder.' }
    if (ctx.broken) return { text: `BMUZ engine: ${ctx.broken}` }
    $.clock.after(50, () => { advance($, true, { timer: true, go: true }) })
    return { text: 'BMUZ engine: starting.' }
  })

  on('command.run', { command: 'bmuz-stage' }, async ($, e) => {
    if (!ctx) return { text: 'No bmuz.json here: say "bmuz new" to start a game in this folder.' }
    if (ctx.broken && !ctx.mismatch) return { text: `BMUZ engine: ${ctx.broken}` }
    const [to = '', at = ''] = String((e as any).args || '').trim().toLowerCase().split(/\s+/)
    if (!to) return { text: `Say /bmuz-stage <stage>, one of ${E.STAGES.map(s => s.id).join(', ')}.` }
    const why = await switchStage($, to, at || null, await carried($, ctx.pipeline.next ?? null))
    if (why) return { text: `BMUZ engine: didn't move: ${why}.` }
    $.clock.after(50, () => { advance($, false, { timer: true }) })
    return { text: `BMUZ engine: moved on to ${E.stageOf(to)?.name ?? to}; the last stage's record is kept in .bmuz/stages/.` }
  })

  on('command.run', { command: 'bmuz-approve' }, async ($, e) => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
    if (!step || step.kind !== 'gate') return { text: 'No gate is open.' }
    const answer = String((e as any).args || '').trim()
    if (!step.options.includes(answer)) return { text: `The gate is still open. Pick one of: ${step.options.join(' / ')}` }
    await applyGate($, step, answer)
    $.clock.after(50, () => { advance($, false, { timer: true }) })
    return { text: `BMUZ engine: gate answered "${answer}".` }
  })

  on('command.run', { command: 'bmuz-status' }, async $ => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    return { text: `${E.bandText(ctx.pipeline, ctx.state, await $.clock.now())}\n${JSON.stringify(ctx.state)}` }
  })

  on('command.run', { command: 'bmuz-doctor' }, async $ => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    return { text: await doctorCommand($) }
  })

  on('command.run', { command: 'bmuz-undo' }, async ($, e) => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    if (ctx.broken) return { text: `BMUZ engine: ${ctx.broken}` }
    const to = String((e as any).args || '').trim()
    return { text: to ? await doUndo($, to) : undoMenu() }
  })

  on('command.run', { command: 'bmuz-retry' }, async $ => {
    if (!ctx) return { text: 'No bmuz.json here.' }
    if (ctx.broken) return { text: `BMUZ engine: ${ctx.broken}` }
    const out = await doRetry($)
    if (out.ok) $.clock.after(50, () => { advance($, false, { timer: true }) })
    return { text: out.text }
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
