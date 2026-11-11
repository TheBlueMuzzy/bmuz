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
// The same count for the "carry on" after a long line (F232 review: it had no cap and could loop forever).
let continues = { key: '', n: 0 }
// '' | 'declined' (the creative closed the last question box without answering): their next chat message is the
// answer, so the turn's open end isn't nudged. (An open ask for links, state.paste, isn't nudged either.)
let quietWait = ''
let quietTurn = false
// F231 (live run 2026-11-10: the watchdog restarted the opening at 12:28 while its first question box waited on a
// creative away until 14:31; the restart message, queued behind the open turn, arrived after they had answered).
// asksOpen: question boxes in flight right now (a step waiting on the creative is not stalled). turnRunning: the main
// loop's turn is running (a restart sent now would queue behind it). heldStall: a stall seen while a turn ran, judged
// again at that turn's end — dropped if the creative answered meanwhile (state.activeAt), else the step restarts there.
let asksOpen = 0
let turnRunning = false
let heldStall: null | { step: string, at: number } = null
// creativeTurn: the turn began with the creative's own typed message (not the engine's, not a bmuz command)
let creativeTurn = false
// F232: the script lines said in this turn ({ id, text }), checked word for word at the turn's end; longSaid: one of
// them was long, so the step's next question comes in a turn of its own (the engine carries the step on).
let turnSaid: { step: string, lines: { id: string, text: string }[] } = { step: '', lines: [] }
let longSaid = false
let unwrittenAsked = ''
// F215: stepping in. stepInTurn: a bug was reported in this turn, so the turn's open end isn't the step stalling.
// askedThisTurn: a question box was answered in this turn (a bug that came as its answer means asking it again).
// pendingFix: the bug to fix at this turn's end, on a side trip ({ id: null } = the next in order; sweep = all P0–P2).
// talkStartedHere: the talk step try this session started ("flow#0"): only that one is carried on after a step-in.
let stepInTurn = false
let askedThisTurn = false
let askClosedThisTurn = false
// (review fix 9) the step-in's own question box ("how often"), handed out this turn: never one of the step's boxes
let stepInBox: null | { step: string, box: any } = null
let pendingFix: null | { id: string | null, sweep: string[] } = null
// (review fix 6) the step-in turns an auto run's step try has had: at most MAX_STEP_INS go free, then a failed try
let stepIns = { key: '', n: 0 }
const MAX_STEP_INS = 2
let talkStartedHere = ''

const SAFE_DENY = 'BMUZ engine hit an error in its own code, so it refused this action to be safe. Run /bmuz-doctor.'

async function readText($: any, path: string) {
  if (!(await $.fs.exists(path))) return null
  return String(await $.fs.read(path))
}

// $.fs has no append, so a journal line is a read + a rewrite. Hooks and timers run side by side,
// so the writes go one at a time through this queue, or one would overwrite another's line.
let journalQueue: Promise<void> = Promise.resolve()
// F216 review fix 2d: while a flow's helpers run, the engine's own files (the journal, the state, own.json) are kept as
// it last wrote them, and .bmuz/develop/ as it was at the launch; anything else changing them (a test script the run
// tool ran, say) is found at the next write or when the helpers finish, put back, and that try counts as failed.
let flowWatch: null | { step: string, files: Record<string, string>, develop: Record<string, string>, tampered: Set<string> } = null
async function watchedBase($: any, name: string) {
  const disk = (await readText($, `${ctx.dir}/.bmuz/${name}`)) ?? ''
  if (!flowWatch || flowWatch.files[name] === undefined) return disk
  if (disk !== flowWatch.files[name]) flowWatch.tampered.add(name)
  return flowWatch.files[name]
}
function journal($: any, entry: any) {
  const path = `${ctx.dir}/.bmuz/journal.jsonl`
  const sessionId = ctx.sessionId
  const run = journalQueue.then(async () => {
    const old = await watchedBase($, 'journal.jsonl')
    const line = JSON.stringify({ t: await $.clock.now(), session: sessionId, ...entry })
    await $.fs.write(path, old + line + '\n')
    if (flowWatch) flowWatch.files['journal.jsonl'] = old + line + '\n'
  })
  journalQueue = run.catch(() => {})
  return run
}

async function save($: any) {
  if (flowWatch) await watchedBase($, 'state.json')
  await $.fs.write(`${ctx.dir}/.bmuz/state.json`, JSON.stringify(ctx.state, null, 2))
  if (flowWatch) flowWatch.files['state.json'] = JSON.stringify(ctx.state, null, 2)
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
  return { ...ctx.state.results, project: ctx.dir, plugin: ctx.root, auto: ctx.auto ? 'auto' : 'live' }
}

// Reads and checks one pipeline file of the plugin. Returns { pipeline, problems } (problems in plain words).
async function loadPipeline($: any, root: string, name: string) {
  if (typeof name !== 'string' || !E.NAME_RE.test(name)) throw new Error(`bmuz.json's "pipeline" must be a pipeline name like hello, not ${JSON.stringify(name)}`)
  const pipeline = JSON.parse(String(await $.fs.read(`${root}/pipelines/${name}.json`)))
  const problems = E.checkPipeline(pipeline)
  if (!problems.length && pipeline.id !== name) problems.push(`the file pipelines/${name}.json says its id is "${pipeline.id}"`)
  for (const f of problems.length ? [] : E.pluginFiles(pipeline)) if (!(await $.fs.exists(`${root}/${f}`))) problems.push(`the craft note ${f} is missing`)
  // F232: the script lines its steps say must be in the script (plugin/script.md)
  const script = await loadScript($, root)
  if (!problems.length) problems.push(...script.problems.map((x: string) => `script.md: ${x}`), ...E.checkLines(pipeline, script))
  return { pipeline, problems, script }
}

// The script: every fixed line BMUZ says (plugin/script.md). A missing file is an empty script (a pipeline whose steps
// name lines then refuses to run, with the reason).
async function loadScript($: any, root: string) {
  const text = await readText($, `${root}/script.md`)
  return E.parseScript(text ?? '')
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

// ---- Side trips (F215): the bug pipeline runs beside the stage, then the stage carries on where it was ----
// Going in: the stage's record (state, journal, last card / shown file, checkpoints) moves to .bmuz/parked/ and the bug
// run starts its own; coming back: the bug run's record is kept in .bmuz/bug-runs/<n>-<bug>/ and the stage's record is
// put back as it was, so its step resumes with its results, retries and lines said intact. .bmuz/side.json is written
// first and carries the phase ("enter", "on", "leave"), so a crash half way is finished at the next start.
async function recordFiles($: any, root: string, pipelineId: string) {
  // (F216 review fixes 5–6: own.json, what each step's own calls changed, belongs to the run too)
  const files = ['state.json', 'journal.jsonl', 'last-card.md', 'last-shown.md', 'own.json']
  try {
    for (const s of (await loadPipeline($, root, pipelineId)).pipeline.steps || []) if (E.NAME_RE.test(String(s.id))) files.push(`checkpoint-${s.id}.json`)
  } catch (err) { /* a pipeline that won't load has no checkpoints to move */ }
  return files
}

// (state.json goes last: its copy is the mark that the whole record got there, which a crash re-run reads)
async function moveFiles($: any, root: string, from: string, to: string, files: string[], keep: string[] = []) {
  for (const f of [...files.filter(x => x !== 'state.json'), ...files.filter(x => x === 'state.json')]) {
    const text = await readText($, `${from}/${f}`)
    if (text === null) continue
    await $.fs.write(`${to}/${f}`, text)
    if (!keep.includes(f)) await $.process.run(['node', `${root}/scripts/rm.mjs`, `${from}/${f}`])
  }
}

async function enterSide($: any, dir: string, root: string, side: any, sessionId: string | null = null) {
  const bmuz = `${dir}/.bmuz`
  await $.fs.write(`${bmuz}/side.json`, JSON.stringify({ ...side, phase: 'enter' }))
  // (copied once: a second pass after a crash must not park the bug run's new state over the stage's)
  if (!(await $.fs.exists(`${bmuz}/parked/state.json`))) {
    await journalQueue
    // (a parked journal always exists, even empty, so coming back never leaves the bug run's journal in its place)
    if (!(await $.fs.exists(`${bmuz}/journal.jsonl`))) await $.fs.write(`${bmuz}/parked/journal.jsonl`, '')
    await moveFiles($, root, bmuz, `${bmuz}/parked`, await recordFiles($, root, side.from), ['state.json', 'journal.jsonl'])
  } else {
    for (const f of (await recordFiles($, root, side.from)).slice(2)) if (await $.fs.exists(`${bmuz}/${f}`)) await $.process.run(['node', `${root}/scripts/rm.mjs`, `${bmuz}/${f}`])
  }
  // (F216: a feature run of Develop's loop is given its feature, and may start at a step: a built feature shown again)
  const given = side.feature !== undefined ? { feature: side.feature } : { bug: side.bug }
  let state: any = { ...E.freshState(side.pipeline), given }
  if (side.at) {
    const entered = E.enterAt((await loadPipeline($, root, side.pipeline)).pipeline, state, side.at, given)
    if (entered.error) throw new Error(entered.error)
    state = entered.state
  }
  await $.fs.write(`${bmuz}/state.json`, JSON.stringify(state, null, 2))
  await $.fs.write(`${bmuz}/journal.jsonl`, JSON.stringify({ t: await $.clock.now(), session: sessionId, ev: 'stage.enter', side: true, from: side.from, to: side.pipeline, ...given, at: side.at ?? null, place: side.place ?? null, state }) + '\n')
  await $.fs.write(`${bmuz}/side.json`, JSON.stringify({ ...side, phase: 'on' }))
}

// Coming back is safe to run again after a crash at any point (review fix 3): nothing is deleted whose copy isn't safe.
// 1. The fix run's record is COPIED to its archive (state.json last: its copy marks the archive whole).
// 2. While parked/state.json is there, the stage's record isn't fully back: the fix run's own files that the stage has
//    no parked copy of are deleted, then every parked file is copied back (state.json last). The parked copies stay.
// 3. parked/state.json goes first (its going marks "everything is back"), then the other parked copies.
async function leaveSide($: any, dir: string, root: string, side: any, outcome: string = 'done') {
  const bmuz = `${dir}/.bmuz`
  const rm = (p: string) => $.process.run(['node', `${root}/scripts/rm.mjs`, p])
  await $.fs.write(`${bmuz}/side.json`, JSON.stringify({ ...side, phase: 'leave', outcome: side.outcome ?? outcome }))
  // (F216: a feature run's record goes to .bmuz/feature-runs/<n>-<feature>/, listed in feature-runs.json)
  const record = E.sideRecord(side)
  await journalQueue
  const mine = await recordFiles($, root, side.pipeline)
  const stage = await recordFiles($, root, side.from)
  if (!(await $.fs.exists(`${bmuz}/${record}/state.json`))) await moveFiles($, root, bmuz, `${bmuz}/${record}`, mine, mine)
  if (await $.fs.exists(`${bmuz}/parked/state.json`)) {
    for (const f of [...new Set([...mine, ...stage])]) {
      if (f === 'state.json' || f === 'journal.jsonl') continue
      if (!(await $.fs.exists(`${bmuz}/parked/${f}`)) && (await $.fs.exists(`${bmuz}/${f}`))) await rm(`${bmuz}/${f}`)
    }
    await moveFiles($, root, `${bmuz}/parked`, bmuz, stage, stage)
    await rm(`${bmuz}/parked/state.json`)
  }
  for (const f of stage) if (await $.fs.exists(`${bmuz}/parked/${f}`)) await rm(`${bmuz}/parked/${f}`)
  const list = `${bmuz}/${E.sideRuns(side)}.json`
  const runs = (await readJson($, list)) || []
  if (Array.isArray(runs) && !runs.some((r: any) => r.n === side.n)) {
    const old = await readJson($, `${bmuz}/${record}/state.json`)
    const item = side.feature !== undefined ? { feature: side.feature, startAt: side.at ?? null } : { bug: side.bug }
    runs.push({ n: side.n, ...item, from: side.from, status: old?.status ?? null, outcome: side.outcome ?? outcome, record: `.bmuz/${record}`, at: await $.clock.now() })
    await $.fs.write(list, JSON.stringify(runs, null, 2))
  }
  // (F216 review fix 3: a feature run that ended blocked or parked gets that status here, on the way back — side.json
  // carries it, so a window closed half way applies it at the next start; a status that won't apply is told)
  const ended = side.outcome ?? outcome
  if (side.feature !== undefined && ended !== 'done') {
    let ran: any
    try {
      ran = await $.process.run(['node', `${root}/scripts/sprint.mjs`, 'status', side.feature, ended], { cwd: dir, timeoutMs: 60000 })
    } catch (err) {
      ran = { exitCode: -1, stdout: String(err).slice(0, 200) }
    }
    if (ran?.exitCode !== 0) sideStatusFailed = { feature: side.feature, status: ended, why: String(ran?.stdout ?? '').trim().slice(0, 300) }
  }
  await $.process.run(['node', `${root}/scripts/rm.mjs`, `${bmuz}/side.json`])
}
// (a feature run's status that sprint.mjs refused on the way back, to be told once the engine is loaded again)
let sideStatusFailed: null | { feature: string, status: string, why: string } = null
// Journals it and returns the words for the creative (null when nothing failed); the caller says them its own way.
async function statusFailedWords($: any) {
  const f = sideStatusFailed
  sideStatusFailed = null
  if (!f) return null
  await journal($, { ev: 'side.status-failed', ...f })
  return `couldn't mark ${f.feature} ${f.status} in the sprint: ${f.why}. Tell the creative in one plain line (.bmuz/develop/sprint.json may need a look)`
}

// bugs.mjs in the project folder; its answer is one JSON line ({ ok, … }), or plain words when it says something else.
async function runBugs($: any, args: string[]) {
  try {
    const ran: any = await $.process.run(['node', `${ctx.root}/scripts/bugs.mjs`, ...args], { cwd: ctx.dir, timeoutMs: 60000 })
    const out = String(ran?.stdout ?? '').trim()
    try { return JSON.parse(out.split('\n').pop() || '{}') } catch (err) { return { ok: ran?.exitCode === 0, text: out } }
  } catch (err) {
    return { ok: false, say: `bugs.mjs could not run (${String(err).slice(0, 160)})` }
  }
}

// Starts a fix run: the stage parks, the bug pipeline runs. id = the bug to fix (null = the next in order: P0 → P3).
// Returns null when it started, { none: true } when nothing is open, else { why } in plain words.
// sweep (review fix 6): the bugs still to fix after this one, fixed when the sweep started (one logged during it waits).
async function startSide($: any, id: string | null, sweep: string[] = []) {
  if (ctx.side) return { why: ctx.side.feature !== undefined ? `${ctx.side.feature} is being built (a feature run); the fix can start once it's done, or after "bmuz park" sets it aside` : `already fixing ${ctx.side.bug}; say "bmuz bug stop" to put it aside` }
  const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
  if (step && step.kind === 'flow' && ctx.state.status === 'working') return { why: `the "${step.id}" helpers are still working; the fix can start once they're done` }
  if (!(await $.fs.exists(`${ctx.root}/pipelines/bug.json`))) return { why: 'the bug pipeline is missing from the plugin' }
  const next = await runBugs($, ['next', ...(id ? [id] : [])])
  if (next.none) return { none: true }
  if (!next.ok) return { why: next.say || next.text || 'bugs.mjs said no' }
  const runs = (await readJson($, `${ctx.dir}/.bmuz/bug-runs.json`)) || []
  const side = { pipeline: 'bug', bug: next.id, from: ctx.pipeline.id, n: (Array.isArray(runs) ? runs.length : 0) + 1, phase: 'enter', place: E.placeWords(ctx.pipeline, ctx.state), sweep: sweep.filter(x => x !== next.id) }
  await journal($, { ev: 'side.start', bug: next.id, sweep: side.sweep, step: ctx.state.current ?? null, status: ctx.state.status })
  try {
    await enterSide($, ctx.dir, ctx.root, side, ctx.sessionId)
  } catch (err) {
    return { why: `the fix run couldn't start (${String(err).slice(0, 160)}); run /bmuz-doctor` }
  }
  return reload($)
}

// Back from a fix run: its record is kept, the stage's put back, and the engine carries on in the stage. outcome =
// "done" (the bug is fixed) or "stopped" (the creative put it aside: the bug goes back to open). Returns null or { why }.
async function endSide($: any, outcome: string) {
  const side = ctx.side
  if (!side) return { why: 'no fix run is going on' }
  if (side.feature !== undefined) return endFeatureRun($, side, outcome)
  if (outcome === 'stopped') {
    // (a step half done gives back what it wrote; the bug goes back to open)
    const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
    if (step && ctx.state.status === 'working') await rollback($, step)
    const st = await runBugs($, ['status', side.bug, 'open'])
    await journal($, { ev: 'side.stop', bug: side.bug, step: ctx.state.current ?? null, reopened: !!st.ok })
  }
  try {
    await leaveSide($, ctx.dir, ctx.root, side, outcome)
  } catch (err) {
    return { why: `the way back from the fix run failed (${String(err).slice(0, 160)}); run /bmuz-doctor` }
  }
  const out = await reload($)
  if (out) return out
  await journal($, { ev: 'side.back', bug: side.bug, outcome, record: `.bmuz/bug-runs/${side.n}-${side.bug}`, step: ctx.state.current ?? null, status: ctx.state.status })
  // A sweep goes on to the next of the bugs it started with that is still open (review fix 6: never one logged since).
  const rest = Array.isArray(side.sweep) ? side.sweep : []
  if (outcome === 'done') {
    for (let i = 0; i < rest.length; i++) {
      const next = await runBugs($, ['next', rest[i]])
      if (next.ok && ['P0', 'P1', 'P2'].includes(next.level)) return startSide($, rest[i], rest.slice(i + 1))
    }
  }
  return null
}

// ---- Develop's loop (F216): a "loop" script step runs another pipeline once per item, each run a kept side trip ----
// The step's script (sprint.mjs next) names the next feature to run. The stage parks at the loop step (its record in
// .bmuz/parked/, as for a fix run), the feature run goes with its own record, and when it finishes the stage comes back
// to the same step, which asks its script again: the next feature, "wait" (an auto run: what's left waits for the
// creative's OK) or "done" (the step passes). Each feature run's record is kept in .bmuz/feature-runs/<n>-<feature>/;
// .bmuz/side.json carries the phase, so a crash on the way in or out is finished at the next start.
async function runSprint($: any, args: string[]) {
  try {
    const ran: any = await $.process.run(['node', `${ctx.root}/scripts/sprint.mjs`, ...args], { cwd: ctx.dir, timeoutMs: 60000 })
    return { ok: ran?.exitCode === 0, text: String(ran?.stdout ?? '').trim() }
  } catch (err) {
    return { ok: false, text: `sprint.mjs could not run (${String(err).slice(0, 160)})` }
  }
}

// Runs a loop step: 'started' (a feature run is under way: ctx is now its pipeline), 'next' / 'retry' / 'stop' as settle.
async function loopStep($: any, step: any) {
  const argv = E.fillDeep(step.run, vars())
  let ran: any
  try {
    ran = await $.process.run(argv, { cwd: ctx.dir, timeoutMs: 60000 })
  } catch (err) {
    ran = { exitCode: -1, stdout: `the loop script could not run: ${String(err).slice(0, 200)}` }
  }
  await journal($, { ev: 'script.ran', step: step.id, exitCode: ran.exitCode, stdout: String(ran.stdout ?? '').trim().slice(0, 300) })
  const a = ran.exitCode === 0 ? E.loopAnswer(ran.stdout) : { error: `script exited ${ran.exitCode}: ${String(ran.stdout || ran.stderr || '').trim().slice(0, 600)}` }
  if (a.error) return settle($, step, { ok: false, why: a.error }, null)
  if (a.start) {
    const out = await startFeatureRun($, step, a.start)
    if (!out) return 'started'
    await journal($, { ev: 'loop.refused', step: step.id, feature: a.start.feature, why: out.why })
    return settle($, step, { ok: false, why: out.why }, null)
  }
  if (a.wait) {
    // Nothing more an auto run may do in this sprint: what's left waits for the creative's OK. The step is put back
    // (between steps, nothing finished), the question noted, and the run ends here; "bmuz go" asks the loop again.
    await journal($, { ev: 'loop.waiting', step: step.id, features: a.wait })
    await addQuestions($, step.id, [{ question: `${a.features.join(', ')}: built and waiting for your OK (or blocked). Say "bmuz go" in a window and BMUZ shows you each one` }])
    ctx.state = { ...ctx.state, current: null, status: 'idle', startedAt: null }
    await save($)
    const r = E.renderLine(ctx.script, 'develop.waiting', { features: a.features.join(', ') })
    if (!r.error) {
      await journal($, { ev: 'line', step: step.id, line: r.id, kind: 'say', text: r.text })
      turnSaid = { step: step.id, lines: [{ id: r.id, text: r.text }] }
      await $.prompt.submit({ text: `BMUZ engine — this message comes from the BMUZ engine, not the creative. Write this to the creative, word for word, then end your turn:\n\n${r.text}` })
    }
    return 'stop'
  }
  return settle($, step, E.doneCheck(step, vars(), await look($, step, null)), null)
}

async function startFeatureRun($: any, step: any, pick: any) {
  if (ctx.side) return { why: 'a side trip is already going on' }
  if (!(await $.fs.exists(`${ctx.root}/pipelines/${step.loop}.json`))) return { why: `the ${step.loop} pipeline is missing from the plugin` }
  const runs = (await readJson($, `${ctx.dir}/.bmuz/feature-runs.json`)) || []
  const side = { pipeline: step.loop, feature: pick.feature, at: pick.at ?? null, from: ctx.pipeline.id, n: (Array.isArray(runs) ? runs.length : 0) + 1, phase: 'enter', place: E.placeWords(ctx.pipeline, ctx.state) }
  await journal($, { ev: 'side.start', feature: pick.feature, at: side.at, step: ctx.state.current ?? null, status: ctx.state.status })
  try {
    await enterSide($, ctx.dir, ctx.root, side, ctx.sessionId)
  } catch (err) {
    return { why: `the ${pick.feature} run couldn't start (${String(err).slice(0, 160)}); run /bmuz-doctor` }
  }
  return reload($)
}

// Back from a feature run: "done" (it ran to its end: approved, tuned, or waiting for the OK — the sprint record
// says which), "blocked" (an auto run moves on past a block: the creative decides later) or "parked" ("bmuz park").
async function endFeatureRun($: any, side: any, outcome: string) {
  if (outcome === 'parked') {
    // (a step half done gives back what it wrote)
    const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
    if (step && ctx.state.status === 'working') await rollback($, step)
  }
  try {
    await leaveSide($, ctx.dir, ctx.root, side, outcome)
  } catch (err) {
    return { why: `the way back from the ${side.feature} run failed (${String(err).slice(0, 160)}); run /bmuz-doctor` }
  }
  const out = await reload($)
  if (out) return out
  await journal($, { ev: 'side.back', feature: side.feature, outcome, record: `.bmuz/${E.sideRecord(side)}`, step: ctx.state.current ?? null, status: ctx.state.status })
  const failed = await statusFailedWords($)
  return failed ? { failed } : null
}

// The engine loaded again after a side trip's move (like a session start).
async function reload($: any) {
  flowAskedHere = ''
  hiddenNotes = null
  turnSaid = { step: '', lines: [] }
  const wasAuto = ctx.auto
  const ok = await startEngine($)
  if (ctx) ctx.auto = ctx.auto || wasAuto
  if (!ok) return { why: ctx ? ctx.broken : 'bmuz.json went missing' }
  await save($)
  return null
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
  // F215: a side trip (the bug pipeline) cut short by a crash on its way in or out is finished first; one under way
  // runs instead of the stage, which waits in .bmuz/parked/ with its record intact.
  const side0 = await readJson($, `${dir}/.bmuz/side.json`)
  if (side0 && !E.sideProblem(side0) && side0.phase === 'enter') await enterSide($, dir, root, side0, c.sessionId)
  if (side0 && !E.sideProblem(side0) && side0.phase === 'leave') await leaveSide($, dir, root, side0)
  const side = await readJson($, `${dir}/.bmuz/side.json`)
  if (side && E.sideProblem(side)) throw new Error(`the side trip's record .bmuz/side.json can't be used: ${E.sideProblem(side)}`)
  c.side = side && side.phase === 'on' ? side : null
  try {
    c.cfg = JSON.parse(cfgText)
    const loaded = await loadPipeline($, root, c.side ? c.side.pipeline : c.cfg.pipeline)
    c.pipeline = loaded.pipeline
    c.script = loaded.script
    const problems = loaded.problems
    if (problems.length) c.broken = `pipeline ${c.cfg.pipeline} has problems: ${problems.join('; ')}`
    // Test only: let flow helpers use extra tools (the stall test's helper runs Bash sleep).
    for (const s of c.pipeline.steps) if (s.kind === 'flow' && c.cfg.testAgentTools) s.agentTools = [...(s.agentTools || []), ...c.cfg.testAgentTools]
    // Test only: answers that stand in for the creative at talk steps, refused without BMUZ_TEST=1.
    const answersProblem = c.cfg.testAnswers === undefined ? null : E.testAnswersProblem(c.cfg, await envValue($, 'BMUZ_TEST'))
    if (answersProblem && !c.broken) c.broken = answersProblem
  } catch (err) {
    c.broken = `could not load the pipeline: ${String(err)}`
    c.script = E.parseScript('')
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
  // (review fix 3: a fix run that finished but whose way back never started — the window closed right at its end — goes
  // back now, so the stage isn't left waiting behind a finished fix run)
  if (c.side && !c.broken && (c.state.status === 'done' || (c.state.status === 'idle' && c.state.finished.length && !E.nextStep(c.pipeline, c.state)))) {
    await leaveSide($, dir, root, c.side, 'done')
    return loadCtx($)
  }
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
    ctx = { dir, broken: `the engine failed to start (${String(err).slice(0, 160)}); run /bmuz-doctor`, pipeline: { id: '?', steps: [] }, cfg: {}, state: E.freshState('?'), script: E.parseScript('') }
  }
  if (!ctx) return false
  ctx.interactive = sessionInteractive
  ctx.canAsk = (await questionToolExists($)) && !(await unattendedSettings($))
  // An auto run never asks: a session nobody can answer, or bmuz.json "auto": true, or "bmuz auto" typed.
  // A background session says it is interactive (headless check 15, 2026-11-08) but has no question
  // tool, so "can anyone answer?" is read from the tool list, not from the session's word.
  ctx.auto = !ctx.interactive || !ctx.canAsk || ctx.cfg.auto === true || sessionAuto
  if (!ctx.broken) await restoreGitExclude($)
  return !ctx.broken
}

// F219 review fix 6: Deliver hides the engine's own files from git while the release scripts run (.git/info/exclude,
// with a restore note in .bmuz/deliver/ first). A run stopped there (the 10-minute cap, a closed window) leaves the
// note; the next start and the doctor put the file back as it was.
async function restoreGitExclude($: any) {
  if (!(await $.fs.exists(`${ctx.dir}/.bmuz/deliver/exclude-restore.json`))) return
  let ran: any = null
  try { ran = await $.process.run(['node', `${ctx.root}/scripts/deliver.mjs`, 'restore-exclude'], { cwd: ctx.dir, timeoutMs: 60000 }) } catch (err) { ran = { exitCode: -1, stdout: String(err) } }
  await journal($, { ev: 'exclude.restored', exitCode: ran?.exitCode ?? null, stdout: String(ran?.stdout ?? '').trim().slice(0, 200) })
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
  await $.tool.register({
    name: 'say',
    description: 'BMUZ engine: say one of the current step\'s script lines (or several at once), word for word. Give its id ("line") and the game-specific parts ("slots"). Returns the exact words ("say") or the question box to ask ("box"), and what to do next ("then"). "wait": true = say nothing more and end your turn; the creative\'s next message is the answer.',
    inputSchema: { type: 'object', properties: { line: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, slots: { type: 'object' }, wait: { type: 'boolean' } } },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'bug',
    description: `BMUZ engine: the creative stepped in with something broken. Report it as a bug (written to .planning/BUGS.md): {"title": "a few words", "level": "P0".."P3", "steps": ["..."], "expected": "...", "actual": "...", "often": "every time / once / not sure"} (${E.BUG_LEVELS}). Add "now": "P0" | "blocks" | "quick" only for a P0, a bug that blocks the current step, or a minutes-long fix in code being changed right now. {"ask": true} first hands you the one question box (how often), if that is essential and missing. Returns the line to say word for word and what to do next.`,
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, level: { type: 'string' }, steps: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, expected: { type: 'string' }, actual: { type: 'string' }, often: { type: 'string' }, evidence: { type: 'string' }, now: { type: 'string' }, ask: { type: 'boolean' } } },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'idea',
    description: 'BMUZ engine (Develop): the creative brought a new idea, not for now. Note it on the roadmap\'s Ideas: {"idea": "their idea in a few words"}. Returns the line to say word for word.',
    inputSchema: { type: 'object', properties: { idea: { type: 'string' } }, required: ['idea'] },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'run',
    description: 'BMUZ engine (Develop\'s builder): run one of a fixed list in the project folder, and see its output: {"what": "test"} (the project\'s tests; add "file": "tests/x.test.mjs" for one file), {"what": "check"} (npm run check:fast), {"what": "install"} (npm install), {"what": "screenshot", "url": "http://localhost:5173/", "out": ".planning/screens/F01-main-phone.png", "size": "phone" | "desktop"} (when the project has Playwright). Nothing else runs: no git, no other commands.',
    inputSchema: { type: 'object', properties: { what: { type: 'string', enum: E.RUN_WHAT }, file: { type: 'string' }, url: { type: 'string' }, out: { type: 'string' }, size: { type: 'string' } }, required: ['what'] },
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
  const saved: Record<string, any> = {}
  for (const f of files) {
    if (!E.isPattern(f)) { saved[f] = await readText($, `${ctx.dir}/${f}`); continue }
    // (a pattern, content/data/*.json: the files it matches now are saved, and the list, so an undo can delete new ones)
    const found = await matching($, f)
    saved[f] = { pattern: found }
    for (const g of found) saved[g] = await readText($, `${ctx.dir}/${g}`)
  }
  await $.fs.write(`${ctx.dir}/.bmuz/checkpoint-${step.id}.json`, JSON.stringify(saved))
  await journal($, { ev: 'checkpoint', step: step.id, files: Object.keys(saved) })
}

// The project files a "writes" pattern matches (scripts/ls.mjs), each re-checked: inside the project, matching it.
async function matching($: any, pattern: string) {
  try {
    const ran: any = await $.process.run(['node', `${ctx.root}/scripts/ls.mjs`, ctx.dir, pattern], { timeoutMs: 10000 })
    const list = JSON.parse(String(ran?.stdout ?? '[]'))
    return Array.isArray(list) ? list.filter((g: any) => typeof g === 'string' && E.isSafePath(g) && E.matchesPattern(pattern, g)) : []
  } catch (err) {
    return []
  }
}

// ---- Own edits (F216 review fixes 5–6): .bmuz/own.json, { steps: { <step>: { <file>: entry } } } (engine.js ownEntry) ----
async function readOwn($: any) {
  let j: any = null
  try { j = JSON.parse(await watchedBase($, 'own.json')) } catch (err) { j = null }
  return j && typeof j === 'object' && j.steps && typeof j.steps === 'object' ? j : { steps: {} }
}
async function recordOwn($: any, stepId: string, file: string, before: string | null, after: string | null) {
  if (before === after) return
  const own = await readOwn($)
  const mine = own.steps[stepId] || {}
  mine[file] = E.ownEntry(mine[file] || null, before, after)
  own.steps[stepId] = mine
  await writeOwn($, own)
}
async function writeOwn($: any, own: any) {
  await $.fs.write(`${ctx.dir}/.bmuz/own.json`, JSON.stringify(own, null, 2))
  if (flowWatch) flowWatch.files['own.json'] = JSON.stringify(own, null, 2)
}
// The flow's watch starts at its launch: the engine's own files as they are, and every file in .bmuz/develop/.
async function startWatch($: any, step: any) {
  await journalQueue
  const files: Record<string, string> = {}
  for (const name of ['journal.jsonl', 'state.json', 'own.json']) files[name] = (await readText($, `${ctx.dir}/.bmuz/${name}`)) ?? ''
  flowWatch = { step: step.id, files, develop: await developFiles($), tampered: new Set() }
}
async function developFiles($: any) {
  const out: Record<string, string> = {}
  let names: string[] = []
  try { names = JSON.parse(String((await $.process.run(['node', `${ctx.root}/scripts/ls.mjs`, ctx.dir, '.bmuz/develop/*'], { timeoutMs: 10000 }))?.stdout ?? '[]')) } catch (err) { names = [] }
  for (const n of Array.isArray(names) ? names : []) if (/^\.bmuz\/develop\/[\w.-]+$/.test(String(n))) out[n] = (await readText($, `${ctx.dir}/${n}`)) ?? ''
  return out
}
// When the helpers finish: anything else that changed the engine's own files is put back. Returns the files, or [].
async function endWatch($: any) {
  const w = flowWatch
  if (!w) return []
  await journalQueue
  for (const [name, text] of Object.entries(w.files)) {
    const disk = (await readText($, `${ctx.dir}/.bmuz/${name}`)) ?? ''
    if (disk !== text) { w.tampered.add(name); await $.fs.write(`${ctx.dir}/.bmuz/${name}`, text) }
  }
  const now = await developFiles($)
  for (const [f, text] of Object.entries(w.develop)) if (now[f] !== text) { w.tampered.add(f); await $.fs.write(`${ctx.dir}/${f}`, text) }
  for (const f of Object.keys(now)) if (!(f in w.develop)) { w.tampered.add(f); await $.process.run(['node', `${ctx.root}/scripts/rm.mjs`, `${ctx.dir}/${f}`]) }
  flowWatch = null
  return [...w.tampered]
}

async function rollback($: any, step: any) {
  const text = await readText($, `${ctx.dir}/.bmuz/checkpoint-${step.id}.json`)
  if (text === null) return []
  let saved: any
  try { saved = JSON.parse(text) } catch (err) { return [] }
  const undone: string[] = []
  // (F216 review fix 5: a talk or flow step changes files through its own Write / Edit calls, and those are recorded:
  // only they are put back — a file it never touched, or a value the creative changed meanwhile, like a Dev Kit save,
  // stays theirs. A step that may run Bash (Setup) can change files unseen, so it is put back the old way, whole.)
  const ownOnly = (step.kind === 'talk' || step.kind === 'flow') && !(step.tools || []).includes('Bash') && !(step.agentTools || []).includes('Bash')
  const own = ownOnly ? ((await readOwn($)).steps?.[step.id] || {}) : null
  for (const [f, body] of Object.entries(saved)) {
    // The checkpoint file can be hand-edited: re-check each path right before writing or deleting.
    if (!E.isSafePath(f)) continue
    if (own && !(body && typeof body === 'object')) {
      const r = E.ownRollback(own[f] || null, body === null ? null : String(body), await readText($, `${ctx.dir}/${f}`))
      if (r.keep) { if (own[f]) await journal($, { ev: 'rollback.kept', step: step.id, file: f, why: 'changed by someone else since this step wrote it' }); continue }
      if (r.remove) await $.process.run(['node', `${ctx.root}/scripts/rm.mjs`, `${ctx.dir}/${f}`])
      else await $.fs.write(`${ctx.dir}/${f}`, String(r.text))
      undone.push(f)
      continue
    }
    if (body && typeof body === 'object') {
      // a pattern: a file it matches now that wasn't there before the step was made by the step, so it goes
      const had = Array.isArray(body.pattern) ? body.pattern : []
      for (const g of await matching($, f)) {
        if (had.includes(g)) continue
        // (review fix 5: only a file the step's own calls made, unchanged since)
        if (own && !E.ownRollback(own[g] || null, null, await readText($, `${ctx.dir}/${g}`)).remove) continue
        await $.process.run(['node', `${ctx.root}/scripts/rm.mjs`, `${ctx.dir}/${g}`])
        undone.push(g)
      }
      continue
    }
    if (body === null) await $.process.run(['node', `${ctx.root}/scripts/rm.mjs`, `${ctx.dir}/${f}`])
    else await $.fs.write(`${ctx.dir}/${f}`, String(body))
    undone.push(f)
  }
  return undone
}

// The holes a step's done-check fills from: the results so far, and (F215) a talk step's own result.
function checkVars(step: any, result: any) {
  return step.kind === 'talk' && result && typeof result === 'object' ? E.checkVarsOf(vars(), result) : vars()
}

async function look($: any, step: any, result: any) {
  const files: Record<string, string | null> = {}
  for (const f of E.checkFiles(step, checkVars(step, result))) files[f] = await readText($, `${ctx.dir}/${f}`)
  // A "script-ok" check runs its command in the project folder (the research flow's source check
  // fetches every link: a few seconds, up to a couple of minutes for a long list).
  const argv = E.checkRun(step, checkVars(step, result))
  let ran = null
  if (argv) {
    // (F216 review fix 10: three test runs' worth of time, from bmuz.json "testTimeoutMs" or 10 minutes each; a check
    // stopped at its limit says so plainly and is neither a pass nor a fail)
    // (Claude Code runs a mod's command for 10 minutes at most: "init.timeoutMs is a whole number of ms, 1 to 600000")
    const limit = Math.min(E.HOST_RUN_MAX_MS, 3 * E.testTimeoutOf(ctx.cfg))
    try {
      ran = await $.process.run(argv, { cwd: ctx.dir, timeoutMs: limit })
    } catch (err) {
      ran = { exitCode: -1, stdout: `the check could not run: ${String(err).slice(0, 200)}` }
    }
    const late = E.checkTimedOutWhy(ran, limit)
    if (late) ran = { ...ran, exitCode: -1, stdout: late }
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
  // F216: an auto run never stalls on a block in a feature run: the feature is marked BLOCKED and the loop goes on to
  // the next one (advance ends the side trip); the creative decides about it later.
  if (ctx.auto && ctx.side && ctx.side.feature !== undefined) pending = 'advance'
  return 'stop'
}

// Moves the project on to stage `to` (at step `at`, with `given` from the intake) inside this session: the
// finished stage's record is archived and the engine carries on in the new pipeline. Returns null when done,
// else the plain-words reason it didn't move.
async function switchStage($: any, to: string, at: string | null, given: any) {
  // (F215 review fix 7: a fix run holds the stage's record in .bmuz/parked/; moving on now would leave it there)
  if (ctx.side) return ctx.side.feature !== undefined ? `finish building ${ctx.side.feature} first, or say "bmuz park" to set it aside` : 'finish or stop the bug fix first (bmuz bug stop)'
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
  // F232 (headless run 2026-11-11: an auto run picked "On to Define" at Ideate's "Ready for Define?" by itself): a
  // stage the creative picks at a step ("next": "{onward}") is their call — an auto run moves on only with their
  // answer for that step (a test run's stand-in); otherwise it asks the engine's way, which notes the question.
  const hole = typeof ctx.pipeline.next?.pipeline === 'string' ? (ctx.pipeline.next.pipeline.match(/^\{(\w+)\}$/) || [])[1] : null
  const chooser = hole ? ctx.pipeline.steps.find((s: any) => s.kind === 'talk' && (s.results || []).includes(hole)) : null
  const pickedForThem = ctx.auto && !go && !nx.ask && chooser && !(ctx.cfg.testAnswers && ctx.cfg.testAnswers[chooser.id] !== undefined)
  if ((nx.ask || pickedForThem) && !go) {
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
  const back = ctx.state.back && ctx.state.back.step === step.id ? ctx.state.back : null
  talkStartedHere = `${step.id}#${ctx.state.retries[step.id] || 0}`
  hiddenNotes = E.talkPrompt(step, craft, why, ctx.auto, decided, { recap, wrap: wrapWords(step), answers, intro: !!intro, given, script: ctx.script, opened: ctx.state.opened === step.id, back })
  // (F216: in Develop a new idea is noted, never built now)
  if (['develop', 'feature'].includes(ctx.pipeline.id)) hiddenNotes += `\n${E.IDEA_RULE}`
  // A resume (a new window, "bmuz go") while a free question is open: Claude says the same question again.
  const open = E.askOpen(ctx.state)
  if (open) hiddenNotes += `\n${E.askResumeLine(open)}`
  await $.prompt.submit({ text: E.talkHeadline(step, intro, E.stepPlace(ctx.pipeline, step)) })
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
  const tryNo = (ctx.state.retries[step.id] || 0) + 1
  await startWatch($, step)
  // F216: stuck twice (the script's 4.4 line, written by the done-check): said word for word before the last try
  const stuck = step.stuck && tryNo === E.retriesOf(step) + 1 && E.isShowPath(step.stuck) ? ((await readText($, `${ctx.dir}/${step.stuck}`)) ?? '').trim() : ''
  if (stuck) {
    await journal($, { ev: 'line', step: step.id, line: 'develop.stuck', kind: 'say', text: stuck })
    turnSaid = { step: step.id, lines: [{ id: 'develop.stuck', text: stuck }] }
  }
  await $.prompt.submit({ text: E.flowPrompt(step, args, tryNo, stuck) })
}

async function runScript($: any, step: any) {
  const argv = E.fillDeep(step.run, vars())
  // (F219: a script step with its own "timeoutMs" — Deliver's release check runs the tests and the build, its publish
  // the release scripts — gets that long, up to the 10 minutes Claude Code allows a mod's command; others 1 minute)
  const ran = await $.process.run(argv, { cwd: ctx.dir, timeoutMs: Math.min(Number(step.timeoutMs) || 60000, E.HOST_RUN_MAX_MS) })
  await journal($, { ev: 'script.ran', step: step.id, exitCode: ran.exitCode, stdout: ran.stdout.trim().slice(0, 300) })
  // A script that refuses says why in its output (Define's stage: "Not ready for Design: the pillars are still
  // open…"): those words are the reason, in place of a done-check that could only say a file lacks a line.
  if (ran.exitCode !== 0) {
    const said = String(ran.stdout || ran.stderr || '').trim()
    return { ok: false, why: `script exited ${ran.exitCode}${said ? `: ${said.length > 600 ? said.slice(0, 600) + '…' : said}` : ''}` }
  }
  // (F216 review fix 11: a script step with "results" hands them back in its last line of JSON, for a later "when")
  const sr = E.scriptResults(step, ran.stdout)
  if (sr.error) return { ok: false, why: sr.error }
  const verdict = E.doneCheck(step, vars(), await look($, step, null))
  return sr.result ? { ...verdict, result: sr.result } : verdict
}

async function askGate($: any, step: any) {
  // (F232: a gate with a script "line" asks the script's box, word for word)
  const words = E.gateWords(step, ctx.script, vars())
  if (ctx.auto) {
    // A gate is the creative's own OK: an auto run never answers it, and never opens a dialog that waits.
    await journal($, { ev: 'gate.pending', step: step.id, question: words.question, options: words.options, why: 'auto run: nobody to ask; answer with "bmuz approve <option>"' })
    await addQuestions($, step.id, [{ question: `${words.question} (the run stopped here; answer with "bmuz approve ${step.approve}" or another option)` }])
    return null
  }
  try {
    const answer = await $.ui.ask(words.question, step.line ? { options: words.options, header: ctx.script.lines[step.line].box.header } : words.options)
    if (words.options.includes(answer)) return answer
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
  else await journal($, { ev: 'gate.back', step: step.id, dropped: before.filter((id: string) => !ctx.state.finished.includes(id)), back: ctx.state.back ?? null })
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
    if (s.status === 'blocked') {
      // F216: an auto run moves past a feature run that BLOCKED: back to Develop's loop, the feature marked BLOCKED
      if (!(ctx.auto && ctx.side && ctx.side.feature !== undefined)) return
      const why = await endSide($, 'blocked')
      // (review fix 3: the BLOCKED status didn't apply: noted for the creative; the loop still goes on)
      if (why && why.failed) await addQuestions($, 'features', [{ question: `BMUZ ${why.failed}` }])
      else if (why) {
        await $.prompt.submit({ text: `BMUZ engine: ${why.why}. Tell the creative in one plain line, then end your turn.` })
        return
      }
      resume = true
      continue
    }
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
        // F215: a fix run's end goes back to the stage it left, which carries on where it was (a sweep takes the next bug).
        if (ctx.side) {
          const why = await endSide($, 'done')
          if (why) {
            await $.prompt.submit({ text: `BMUZ engine: ${why.why}. Tell the creative in one plain line, then end your turn.` })
            return
          }
          resume = true
          opts = { ...opts, go: false }
          continue
        }
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
    // (F232: an "onBack" step runs only when a gate sent the creative back to it)
    if (!isRestart && (!E.isWanted(step, vars()) || E.onBackSkips(step, ctx.state))) {
      const empties = E.wrapEmpties(ctx.pipeline, ctx.state, [step.id])
      ctx.state = E.applyWrap(ctx.state, [step.id], empties)
      await journal($, { ev: 'step.skip', step: step.id, ...(step.when ? { when: step.when } : { onBack: true }), empties })
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
    if (step.kind === 'gate' && ctx.auto && step.auto === 'carry') {
      // F216: a gate an auto run carries on past (Develop's "Start with …?" and "Build this sprint?", so a night's run
      // builds): the question is noted for the creative, nothing is approved for them, and the plan stands as it is.
      const words = E.gateWords(step, ctx.script, vars())
      await addQuestions($, step.id, [{ question: `${words.question} (an auto run carried on with the plan as it stands; nothing was approved for you. To change it, say "bmuz undo ${step.backTo || step.id}")` }])
      ctx.state = E.finish(ctx.state, step, null)
      await journal($, { ev: 'gate.carried', step: step.id, question: words.question })
      await journal($, { ev: 'step.done', step: step.id, kind: 'gate', result: null, carried: true })
      await save($)
      continue
    }
    if (step.kind === 'gate') {
      const answer = await askGate($, step)
      if (answer === null) return
      await applyGate($, step, answer)
      continue
    }
    if (step.kind === 'script' && step.loop) {
      // F216: Develop's loop: a feature run starts beside the stage (the loop carries on inside it), or the step ends
      const next = await loopStep($, step)
      if (next === 'started') { opts = { ...opts, go: false }; continue }
      if (next === 'stop') return
      if (next === 'retry') ctx.state = { ...ctx.state, current: step.id }
      continue
    }
    if (step.kind === 'script') {
      const verdict = await runScript($, step)
      const next = await settle($, step, verdict, verdict.ok ? verdict.result ?? null : null)
      // (F216: an auto run's feature run that BLOCKED goes straight back to Develop's loop: the top of this loop)
      if (next === 'stop' && pending === 'advance' && ctx.state.status === 'blocked') { pending = null; continue }
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
  if (!E.isShowPath(step.show)) return false
  const text = await readText($, `${ctx.dir}/${step.show}`)
  if (text === null || !text.trim()) {
    await journal($, { ev: 'show.missing', step: step.id, path: step.show })
    return false
  }
  await $.fs.write(`${ctx.dir}/.bmuz/last-shown.md`, text.endsWith('\n') ? text : text + '\n')
  await journal($, { ev: 'show', step: step.id, path: step.show })
  // (F232: checked word for word at that turn's end, like a script line)
  turnSaid = { step: step.id, lines: [{ id: `show:${step.show}`, text: text.trim() }] }
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
  // The lines the step always says ("must") were all handed out, live or auto (a wrap-up is the creative's choice).
  const unsaid = wrap === true ? null : E.mustProblem(step, ctx.state)
  const firstVerdict = unsaid ? { ok: false, why: unsaid } : !cardVerdict.ok ? cardVerdict : missing ? { ok: false, why: missing } : null
  const verdict = firstVerdict ?? E.doneCheck(step, checkVars(step, result), await look($, step, result))
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
  await restoreGitExclude($)
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
  // (review fix 2d: the engine's own files, as it left them, before anything reads them)
  const tampered = await endWatch($)
  if (tampered.length) await journal($, { ev: 'tamper', step: step.id, files: tampered })
  const verdict = tampered.length
    ? { ok: false, why: `something changed BMUZ's own files (${tampered.join(', ')}) while the helpers ran; they were put back, and this try counts as failed` }
    : n.status === 'completed'
      ? E.doneCheck(step, vars(), await look($, step, n.result))
      : { ok: false, why: `the workflow ended ${n.status}` }
  const next = await settle($, step, verdict, null)
  if (next === 'retry') {
    ctx.state = { ...ctx.state, current: step.id, status: 'idle' }
    await save($)
  }
  return next // the caller lets turn.complete run the next step
}

// ---- The script (F232 task 2): Claude asks for a line by id; the engine hands back the exact words ----
// A "free" line opens "the next message is the answer" (state.ask; F228's ask for links, generalised); a "box" line is
// kept until AskUserQuestion asks exactly it (state.boxes); every line said is checked word for word at the turn's end.
async function sayTool($: any, e: any) {
  const step = E.stepById(ctx.pipeline, ctx.state.current)
  if (!step || step.kind !== 'talk' || ctx.state.status !== 'working' || !step.lines) {
    return { deny: 'BMUZ engine: no talk step with script lines is open, so there is nothing to say. End your turn.' }
  }
  const deny = async (why: string) => {
    await journal($, { ev: 'deviation', step: step.id, tool: E.SAY_TOOL, agentId: null, why })
    return { deny: why }
  }
  if (e.wait === true) {
    if (ctx.auto) return { result: JSON.stringify({ say: '', then: 'Auto run: nobody will type. Take the creative\'s answer from the test answers (or the sensible default) and carry on in this turn.' }) }
    ctx.state = { ...ctx.state, ask: { step: step.id, line: 'wait', text: '' } }
    await journal($, { ev: 'ask.open', step: step.id, line: 'wait' })
    await save($)
    return { result: JSON.stringify({ say: '', then: 'Write nothing more and end your turn: the creative\'s next chat message is the answer.' }) }
  }
  // (an id sent with its own quotes, '"ideate.material"', is the same id: headless run 2026-11-11)
  const ids: string[] = (Array.isArray(e.line) ? e.line : [e.line]).map((x: any) => String(x ?? '').trim().replace(/^["'“‘]+|["'”’]+$/g, ''))
  if (!ids.length || ids.some(id => !id)) return deny(`BMUZ engine: say which line: {"line": "<id>"} (this step's lines: ${step.lines.join(', ')}).`)
  const notHere = ids.filter(id => !step.lines.includes(id))
  if (notHere.length) return deny(`BMUZ engine: ${notHere.map(id => `"${id}"`).join(', ')} ${notHere.length > 1 ? "aren't" : "isn't"} one of this step's lines (${step.lines.join(', ')}).`)
  // The step opens with its opening lines, said first, together.
  const opened = ctx.state.opened === step.id
  if (step.opening && !opened && JSON.stringify(ids.slice(0, step.opening.length)) !== JSON.stringify(step.opening)) {
    return deny(`BMUZ engine: this step opens with ${JSON.stringify(step.opening.length === 1 ? step.opening[0] : step.opening)}: say that first (one ${E.SAY_TOOL} call).`)
  }
  const slots = e.slots && typeof e.slots === 'object' && !Array.isArray(e.slots) ? e.slots : {}
  const rendered = ids.map(id => E.renderLine(ctx.script, id, slots))
  const bad = rendered.find((r: any) => r.error)
  if (bad) return deny(`BMUZ engine: ${bad.error}.`)
  const boxes = rendered.filter((r: any) => r.kind === 'box')
  const words = rendered.filter((r: any) => r.kind !== 'box')
  // Words before a box in one call are fine when they are short and none is a free question ("Got it: added to …"
  // then "Another round?"); a long text or a free question gets a turn of its own (a box covers what's above it).
  if (boxes.length && words.length) {
    const before = words.map((r: any) => r.text).join('\n\n')
    if (rendered.findIndex((r: any) => r.kind === 'box') < words.length || words.some((r: any) => r.kind === 'free') || E.isLongSay(before)) {
      return deny('BMUZ engine: a box comes last, after at most a short line of words (no free question, nothing long: a box covers text written above it). Say the words on their own first.')
    }
  }
  // (the lines handed out in this step, for its "must"; saved with the rest of this call below)
  const had = ctx.state.said && ctx.state.said.step === step.id && Array.isArray(ctx.state.said.lines) ? ctx.state.said.lines : []
  ctx.state = { ...ctx.state, said: { step: step.id, lines: [...new Set([...had, ...ids])] } }
  if (words.length) {
    for (const r of words) await journal($, { ev: 'line', step: step.id, line: r.id, kind: r.kind, text: r.text })
    if (turnSaid.step !== step.id) turnSaid = { step: step.id, lines: [] }
    turnSaid.lines.push(...words.map((r: any) => ({ id: r.id, text: r.text })))
  }
  // (each box handed out gets a number, so the same box can be asked twice: Scope's "[idea]: …?" per idea)
  let n = (ctx.state.boxes || []).reduce((m: number, b: any) => Math.max(m, b.n || 0), 0)
  if (boxes.length) {
    const add = boxes.map((r: any) => ({ id: r.id, n: ++n, box: r.box }))
    ctx.state = { ...ctx.state, boxes: [...(ctx.state.boxes || []), ...add], opened: step.id }
    for (const r of boxes) await journal($, { ev: 'line', step: step.id, line: r.id, kind: 'box', box: r.box })
    await save($)
    const then = E.sayNext(boxes[0], ctx.auto)
    const say = words.length ? { say: words.map((r: any) => r.text).join('\n\n'), first: 'Write exactly the "say" text first.' } : {}
    return { result: JSON.stringify(boxes.length === 1 ? { ...say, box: boxes[0].box, then } : { ...say, boxes: boxes.map((r: any) => r.box), then: `${then} (All ${boxes.length} questions in one AskUserQuestion call, in this order.)` }) }
  }
  const text = words.map((r: any) => r.text).join('\n\n')
  const last = rendered[rendered.length - 1]
  const kind = rendered.some((r: any) => r.kind === 'free') ? 'free' : 'say'
  ctx.state = { ...ctx.state, opened: step.id, ...(kind === 'free' && !ctx.auto ? { ask: { step: step.id, line: last.kind === 'free' ? last.id : ids[ids.length - 1], text } } : {}) }
  if (kind === 'free' && !ctx.auto) await journal($, { ev: 'ask.open', step: step.id, line: last.id })
  if (kind === 'say' && E.isLongSay(text) && !ctx.auto) longSaid = true
  await save($)
  return { result: JSON.stringify({ say: text, then: E.sayNext({ kind, text }, ctx.auto) }) }
}

// ---- Stepping in (F215 task 3): a bug report is a side trip; the step it interrupts keeps its record ----
// The report goes into .planning/BUGS.md (bugs.mjs, committed "Bug B004: …" when the project is a git repository), the
// script's line comes back to be said word for word, and the step carries on where it was: nothing in its state moves
// (results, retries, the lines said, its open question). A fix-now bug (P0, blocks this step, a minutes-long fix) runs
// the bug pipeline at this turn's end, then comes back here.
async function bugTool($: any, e: any) {
  const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
  const talkOpen = !!step && step.kind === 'talk' && ctx.state.status === 'working'
  stepInTurn = true
  if (e.ask === true) {
    // (the one question at most: how often. Only inside a talk step, where a question box may be asked)
    const r = E.renderLine(ctx.script, 'bug.often', {})
    if (ctx.auto || r.error || !talkOpen) return { result: JSON.stringify({ then: `No question here${ctx.auto ? ' (auto run: nobody to ask)' : ''}: report it now with what you have ("often": "not sure").` }) }
    // (review fix 9: kept apart from the step's own pending boxes and journal lines, and dropped at the turn's end if
    // it was never asked)
    stepInBox = { step: step.id, box: r.box }
    await journal($, { ev: 'stepin.box', during: step.id, box: r.box })
    return { result: JSON.stringify({ box: r.box, then: `Call AskUserQuestion now with exactly this box, then report the bug with ${E.BUG_TOOL}.` }) }
  }
  const report = { title: e.title, level: typeof e.level === 'string' ? e.level.trim().toUpperCase() : e.level, steps: e.steps, expected: e.expected, actual: e.actual, often: e.often, evidence: e.evidence, now: e.now }
  let now = E.isFixNow(report)
  // A fix run already going on takes a new bug in order; a running helper can't be stopped for it.
  if (now && ctx.side) now = false
  if (now && step && step.kind === 'flow' && ctx.state.status === 'working') {
    return { deny: `BMUZ engine: the "${step.id}" helpers are still working, so nothing can be fixed now. Report it without "now"; it is fixed after this step ("bmuz bug").` }
  }
  const where = E.placeWords(ctx.pipeline, ctx.state)
  const ran = await runBugs($, ['add', JSON.stringify({ report, where })])
  if (!ran.ok) {
    await journal($, { ev: 'deviation', step: ctx.state.current ?? null, tool: E.BUG_TOOL, agentId: null, why: `not logged: ${ran.say || ran.text}` })
    return { deny: `BMUZ engine: the bug wasn't logged: ${ran.say || ran.text}. Fix the report and call ${E.BUG_TOOL} again.` }
  }
  const sprint = E.sprintFeature((await readText($, `${ctx.dir}/.planning/SPRINT.md`)) ?? '')
  const when = ctx.side ? `after ${ctx.side.bug}` : E.bugWhen(ctx.pipeline, ctx.state, sprint)
  const line = E.renderLine(ctx.script, now ? 'bug.now' : 'bug.logged', { bug: ran.bug, when })
  if (line.error) return { deny: `BMUZ engine: ${line.error}` }
  await journal($, { ev: 'bug', id: ran.id, level: report.level, now, step: ctx.state.current ?? null, place: where, commit: ran.commit ?? null })
  await journal($, { ev: 'line', step: ctx.state.current ?? null, line: line.id, kind: 'say', text: line.text })
  const sid = ctx.state.current || ''
  if (turnSaid.step !== sid) turnSaid = { step: sid, lines: [] }
  turnSaid.lines.push({ id: line.id, text: line.text })
  await markActive($)
  let then = 'Write exactly the "say" text now, as text in your reply.'
  if (now) {
    pendingFix = { id: ran.id, sweep: [] }
    then += ' Then end your turn: the engine starts the fix itself, and comes back to this step after it.'
  } else if (talkOpen) {
    // (the report came as the answer to a question box, or to an open free question: that question is asked again)
    const again = askedThisTurn || askClosedThisTurn
    then += ` Then carry on with step "${step.id}" exactly where it was${again ? ': the bug came in place of an answer, so ask the step\'s open question again, the way you asked it (a script line through say)' : ''}.`
  } else then += ' Then end your turn.'
  return { result: JSON.stringify({ say: line.text, id: ran.id, then }) }
}

// F216: a new idea mid-loop goes on the roadmap's Ideas (sprint.mjs idea, the GDD's Ideas for Later too) and the step
// carries on where it was; the script's line comes back to be said word for word. Nothing in the step's state moves.
async function ideaTool($: any, e: any) {
  const words = String(e.idea ?? '').replace(/\s+/g, ' ').trim()
  if (!words) return { deny: 'BMUZ engine: give the idea in a few words: {"idea": "..."}' }
  stepInTurn = true
  const ran = await runSprint($, ['idea', words])
  if (!ran.ok) return { deny: `BMUZ engine: the idea wasn't noted: ${ran.text}` }
  const line = E.renderLine(ctx.script, 'develop.idea', { idea: words })
  if (line.error) return { deny: `BMUZ engine: ${line.error}` }
  await journal($, { ev: 'idea', idea: words, step: ctx.state.current ?? null })
  await journal($, { ev: 'line', step: ctx.state.current ?? null, line: line.id, kind: 'say', text: line.text })
  const sid = ctx.state.current || ''
  if (turnSaid.step !== sid) turnSaid = { step: sid, lines: [] }
  turnSaid.lines.push({ id: line.id, text: line.text })
  const step = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
  const talkOpen = !!step && step.kind === 'talk' && ctx.state.status === 'working'
  return { result: JSON.stringify({ say: line.text, then: `Write exactly the "say" text now, as text in your reply.${talkOpen ? ` Then carry on with step "${step.id}" exactly where it was.` : ' Then end your turn.'}` }) }
}

// F216 review fix 2a: the run tool. Only run.mjs's fixed list, in the project folder; the files a run changed (a
// package-lock.json, a screenshot) are recorded as the step's own, so the feature's commit takes them.
async function runTool($: any, e: any) {
  const what = String(e.what ?? '')
  if (!E.RUN_WHAT.includes(what)) return { deny: `BMUZ engine: "what" is one of ${E.RUN_WHAT.join(', ')}` }
  const args = what === 'test' ? (e.file ? [String(e.file)] : []) : what === 'screenshot' ? [String(e.url ?? ''), String(e.out ?? ''), String(e.size ?? '')] : []
  let ran: any
  try {
    ran = await $.process.run(['node', `${ctx.root}/scripts/run.mjs`, what, ...args], { cwd: ctx.dir, timeoutMs: E.HOST_RUN_MAX_MS })
  } catch (err) {
    return { result: `the run could not start: ${String(err).slice(0, 200)}` }
  }
  const out = String(ran?.stdout ?? '').trim()
  let last: any = {}
  try { last = JSON.parse(out.split('\n').pop() || '{}') } catch (err) { last = {} }
  const stepId = ctx.state.current
  if (stepId && Array.isArray(last.changed)) {
    const own = await readOwn($)
    const mine = own.steps[stepId] || {}
    for (const f of last.changed.map(String).filter((x: string) => E.isSafePath(x))) mine[f] = { after: E.textSha(await readText($, `${ctx.dir}/${f}`)), keys: null, created: !!(mine[f] && mine[f].created), run: true }
    own.steps[stepId] = mine
    await writeOwn($, own)
  }
  await journal($, { ev: 'run', step: stepId ?? null, what, args, exitCode: last.exitCode ?? ran?.exitCode ?? null, changed: last.changed ?? [] })
  return { result: out.split('\n').slice(0, -1).join('\n').slice(-4000) || '(no output)' }
}

// The creative did something (answered a box, closed it, typed a message): a talk step's stall clock starts again.

async function markActive($: any) {
  if (!ctx || ctx.state.status !== 'working') return
  ctx.state = { ...ctx.state, activeAt: await $.clock.now() }
  await save($)
}

async function watchdog($: any) {
  if (!ctx || ctx.broken || watchdogBusy) return
  watchdogBusy = true
  try {
    const limit = ctx.cfg.watchdogMs ?? ctx.pipeline.watchdogMs ?? 1200000
    const now = await $.clock.now()
    // The helper finished; its result is on the way. If it hasn't come in 5 minutes, it was lost: a stall after all.
    if (ctx.state.flow?.late && now - ctx.state.flow.late < 300000) return
    if (!E.isStalled(ctx.pipeline, ctx.state, now, limit, { askOpen: asksOpen > 0 })) return
    const step = E.stepById(ctx.pipeline, ctx.state.current)
    // A talk step's turn still running: a restart sent now would queue behind it and arrive whenever it ends (live
    // run: two hours later, after the creative had answered). Held, and judged again at that turn's end.
    if (step.kind === 'talk' && turnRunning) {
      if (!heldStall) {
        heldStall = { step: step.id, at: now }
        await journal($, { ev: 'watchdog.held', step: step.id, limitMs: limit })
      }
      return
    }
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
    await restartStalled($, step, limit)
  } finally {
    watchdogBusy = false
  }
}

// A stalled step: a failed try, then (retries left) started again.
async function restartStalled($: any, step: any, limit: number) {
  const next = await settle($, step, { ok: false, why: `stalled past ${Math.round(limit / 1000)}s (watchdog)` }, null)
  // (F216: an auto run's feature run that BLOCKED goes back to Develop's loop now: no turn end is coming to do it)
  if (next === 'stop' && pending === 'advance' && !turnRunning) {
    pending = null
    try { await advance($, false) } catch (err) { await journal($, { ev: 'watchdog.restart-failed', step: step.id, why: String(err).slice(0, 200) }) }
    return
  }
  if (next === 'retry') {
    ctx.state = { ...ctx.state, current: step.id, status: 'idle' }
    await save($)
    try {
      await advance($, false)
    } catch (err) {
      await journal($, { ev: 'watchdog.restart-failed', step: step.id, why: String(err).slice(0, 200) })
    }
  }
}

// At a turn's end: a stall held while it ran restarts the step now, unless the creative answered meanwhile, the step
// moved on, or its ask for links is open (then it's dropped). Returns true when it restarted the step.
async function judgeHeldStall($: any) {
  const h = heldStall
  heldStall = null
  if (!h || !ctx) return false
  const limit = ctx.cfg.watchdogMs ?? ctx.pipeline.watchdogMs ?? 1200000
  const now = await $.clock.now()
  const step = E.stepById(ctx.pipeline, ctx.state.current)
  const same = step && step.id === h.step && ctx.state.status === 'working'
  if (!same || !E.isStalled(ctx.pipeline, ctx.state, now, limit, { askOpen: asksOpen > 0 })) {
    await journal($, { ev: 'watchdog.dropped', step: h.step, why: !same ? 'the step moved on' : 'the creative answered (or the ask is open)' })
    return false
  }
  await journal($, { ev: 'watchdog', step: step.id, limitMs: limit, taskId: null })
  $.ui.toast(`BMUZ watchdog: step ${step.id} ran past ${Math.round(limit / 1000)}s; stopping it`)
  await restartStalled($, step, limit)
  return true
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
    asksOpen = 0
    turnRunning = false
    heldStall = null
    sessionInteractive = (e as any).isInteractive === true
    sessionAuto = false
    flowAskedHere = ''
    pendingFix = null
    stepInTurn = false
    talkStartedHere = ''
    stepInBox = null
    stepIns = { key: '', n: 0 }
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
    const verdict = E.judgeTool(ctx.pipeline, ctx.state, call, { auto: ctx.auto, dir: ctx.dir })
    if (!verdict.allow) {
      await journal($, { ev: 'deviation', step: ctx.state.current, tool: call.tool, agentId: call.agentId ?? null, why: verdict.why })
      return { deny: verdict.why }
    }
    // F232: a script step says its opening before it asks or finishes anything.
    const cur0 = E.stepById(ctx.pipeline, ctx.state.current)
    if (cur0 && cur0.kind === 'talk' && cur0.opening && ctx.state.status === 'working' && ctx.state.opened !== cur0.id && (call.tool === E.ENGINE_TOOL || call.tool === 'AskUserQuestion') && !call.agentId) {
      const why = `BMUZ engine: this step opens with its script line first: call ${E.SAY_TOOL} with {"line": ${JSON.stringify(cur0.opening.length === 1 ? cur0.opening[0] : cur0.opening)}}.`
      await journal($, { ev: 'deviation', step: cur0.id, tool: call.tool, agentId: null, why })
      return { deny: why }
    }
    // F232 (headless run 2026-11-11: Claude asked for the lines, then finished the step without writing them): the
    // script's words said this turn are written before the step finishes or a box opens. Once per set of lines; the
    // turn's end checks again.
    if ((call.tool === E.ENGINE_TOOL || call.tool === 'AskUserQuestion') && !call.agentId && turnSaid.lines.length && turnSaid.step === ctx.state.current) {
      const key = `${turnSaid.step}:${turnSaid.lines.map(l => l.id).join(',')}:${turnSaid.lines.length}`
      if (unwrittenAsked !== key) {
        let rows: any = null
        try { rows = await $.session.messages() } catch (err) { rows = null }
        const missing = Array.isArray(rows) ? E.unsaid(turnSaid.lines, E.turnText(rows)) : []
        if (missing.length) {
          unwrittenAsked = key
          const why = `BMUZ engine: write the script's words first, exactly as given, then ${call.tool === E.ENGINE_TOOL ? 'finish the step' : 'ask the box'}:\n\n${missing.map((l: any) => l.text).join('\n\n')}`
          await journal($, { ev: 'deviation', step: turnSaid.step, tool: call.tool, agentId: null, why: `unwritten: ${missing.map((l: any) => l.id).join(', ')}` })
          return { deny: why }
        }
      }
    }
    if (call.tool === E.ENGINE_TOOL) return stepDone($, e)
    if (call.tool === E.SAY_TOOL) return sayTool($, e)
    if (call.tool === E.BUG_TOOL) return bugTool($, e)
    if (call.tool === E.IDEA_TOOL) return ideaTool($, e)
    if (call.tool === E.RUN_TOOL) return runTool($, e)
    if (call.tool === 'AskUserQuestion' && !ctx.auto) {
      // A background session lists the question tool but refuses it (headless check 15): then nobody
      // can answer, so from here this session is an auto run and the turn-end rule keeps it moving.
      // A person pressing Esc on the question is someone saying no, not nobody being there (live check
      // 2026-11-08: Esc turned a live window into an auto run, which then blocked plan mode's hand-in).
      // F228 task 3 (b): plain text written before the box in the same turn is covered by it (live run #20b). The
      // transcript is read to find it; when it can't be read the box goes ahead (a soft check: the step's own tool
      // limits still hold) and the journal says it went unchecked.
      const cur = E.stepById(ctx.pipeline, ctx.state.current)
      let stepInAsk = false
      if (cur && cur.kind === 'talk' && ctx.state.status === 'working') {
        // An option standing in for typing ("I'll paste the link") never gets through (live look 2026-11-10).
        const fake = E.optionCountProblem((e as any).questions) || E.fakeTypeOptionProblem((e as any).questions)
        if (fake) {
          await journal($, { ev: 'deviation', step: cur.id, tool: 'AskUserQuestion', agentId: null, why: fake })
          return { deny: fake }
        }
        // F232: in a step with script lines, every box is one the script handed out, asked exactly.
        // (F215 review fix 9: the step-in's own box, asked exactly, passes without touching the step's pending boxes)
        const own = stepInBox && stepInBox.step === cur.id && !E.boxProblem([{ id: 'bug.often', n: 0, box: stepInBox.box }], (e as any).questions).why
        if (own) { stepInBox = null; stepInAsk = true }
        if (cur.lines && !own) {
          const m = E.boxProblem(ctx.state.boxes || [], (e as any).questions)
          if (m.why) {
            await journal($, { ev: 'deviation', step: cur.id, tool: 'AskUserQuestion', agentId: null, why: m.why })
            return { deny: m.why }
          }
          ctx.state = { ...ctx.state, boxes: (ctx.state.boxes || []).filter((b: any) => !m.used.includes(`${b.id}#${b.n}`)) }
          await save($)
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
      let res: any
      asksOpen += 1
      try {
        res = await next(e)
      } finally {
        asksOpen = Math.max(0, asksOpen - 1)
      }
      // (answered or closed by the creative: the stall clock counts from now)
      if ((!res?.deny && !res?.isError) || E.isPersonDeclining(res)) await markActive($)
      if (!res?.deny && !res?.isError) { nudges = { key: '', n: 0 }; continues = { key: '', n: 0 }; quietWait = ''; askedThisTurn = true }
      if ((res?.deny || res?.isError) && E.isPersonDeclining(res)) quietWait = 'declined'
      if ((res?.deny || res?.isError) && !E.isPersonDeclining(res)) {
        // F231: only "the tool can't be used here" means nobody can answer; a shape refusal (too few options) or any
        // other refusal is a failed ask, handed back to Claude as it is (it reads why and asks again).
        if (E.isNobodyToAsk(res)) {
          ctx.auto = true
          await journal($, { ev: 'auto.detected', why: 'the question tool was refused: nobody can answer in this session' })
        } else {
          await journal($, { ev: 'ask.refused', step: ctx.state.current, why: E.answerText(res).slice(0, 300) })
        }
      } else if (!res?.deny && !res?.isError) {
        // F228: the creative's answer, as the box returned it: a script checks the creative's "own words" against
        // these (ideate-doc.mjs), so a quote Claude hands back as theirs is checked, not trusted.
        // (review fix 9: the step-in box's answer is the bug report's, never the step's own words)
        if (stepInAsk) await journal($, { ev: 'stepin.answer', during: ctx.state.current, text: E.answerText(res).slice(0, 600) })
        else await journal($, { ev: 'answer', step: ctx.state.current, text: E.answerText(res).slice(0, 6000) })
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
    // F216 review fixes 5–6: a step's own Write / Edit (Claude's or a helper's): the file before and after is recorded
    // (.bmuz/own.json), so an undo puts back only that and a commit takes only that
    if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(call.tool) && ctx.state.status === 'working' && ctx.state.current) {
      const rel = E.projectPath(ctx.dir, (e as any).file_path ?? (e as any).notebook_path)
      if (rel) {
        const stepId = ctx.state.current
        const before = await readText($, `${ctx.dir}/${rel}`)
        // (F216 review fix 2b: a protected step's helper — Develop's builder — can't change the plan files,
        // package.json's scripts, or empty an existing test)
        const cur = E.stepById(ctx.pipeline, stepId)
        if (call.agentId && cur && cur.kind === 'flow' && cur.protect === true) {
          const why = E.protectProblem(rel, before, E.editedText({ ...(e as any), tool: call.tool }, before))
          if (why) {
            await journal($, { ev: 'deviation', step: stepId, tool: call.tool, agentId: call.agentId, why })
            return { deny: `BMUZ engine: ${why}` }
          }
        }
        const res: any = await next(e)
        if (!res?.deny && !res?.isError) await recordOwn($, stepId, rel, before, await readText($, `${ctx.dir}/${rel}`))
        return res
      }
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
      // F225, F232: "bmuz new" makes this folder a BMUZ project and starts Ideate (Welcome to BMUZ, then "Your Idea";
      // where the game stands is worked out, never asked). Only this
      // typed command does it: a stray "bmuz go" in some other folder never writes a file.
      if (typedHere && /^\s*bmuz new\s*$/i.test(typed)) {
        const dir = String(await $.session.cwd()).replace(/\\/g, '/')
        await $.fs.write(`${dir}/bmuz.json`, JSON.stringify({ pipeline: 'ideate' }, null, 2))
        const ok = await startEngine($)
        if (!ctx) return next(e)
        await armSession($)
        if (!ok) return next({ ...(e as any), text: `${typed}\n(BMUZ engine: wrote bmuz.json but couldn't start: ${ctx.broken}. Tell the creative in one plain line.)` })
        await journal($, { ev: 'session', interactive: ctx.interactive, canAsk: ctx.canAsk, auto: ctx.auto, via: 'bmuz new' })
        await save($)
        pending = 'resume'
        return next({ ...(e as any), text: `${typed}\n(BMUZ engine: this folder is now a BMUZ project (bmuz.json written). Reply with one short line; the engine asks the first question itself.)` })
      }
      if (typedHere && /^\s*bmuz (go|approve|auto|undo|retry|doctor|stage|bug)\b/i.test(typed)) {
        return next({ ...(e as any), text: `${typed}\n(BMUZ engine: off in this folder: there is no bmuz.json here, so nothing runs. Tell the creative that in plain words: BMUZ steps run inside a BMUZ project folder, and "bmuz new" starts a game here — it begins with their idea and whatever they want to share.)` })
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
    if (!ctx.broken && ctx.state.status === 'working') await markActive($)
    // The creative's message while a free question is open is its answer (their words, journaled for the scripts'
    // quote checks); the question closes and Claude is told, beside it, what it answers ("never mind" = no material).
    const openAsk = !ctx.broken && E.askOpen(ctx.state)
    // F215: a message that may report something broken carries the step-in note beside it (Claude judges whether it is one).
    const brokenHint = !ctx.broken && E.soundsBroken(text) ? [E.stepInNote(text, { auto: ctx.auto })] : []
    if (openAsk && !/^\s*bmuz\b/i.test(text)) {
      await journal($, { ev: 'answer', step: openAsk.step, line: openAsk.line, via: 'typed', text })
      ctx.state = { ...ctx.state, ask: null }
      await journal($, { ev: 'ask.closed', step: openAsk.step, line: openAsk.line, never: E.isNeverMind(text) })
      await save($)
      askClosedThisTurn = true
      return next({ ...(e as any), context: [...((e as any).context ?? []), E.answerNote(openAsk, text), ...brokenHint] })
    }
    const say = (words: string) => {
      quietTurn = true
      return next({ ...(e as any), text: `${text}\n(${words}\nShow the creative these lines as they are, then end your turn.)` })
    }
    // (script lines the engine answers with itself: journaled, and checked word for word at the turn's end)
    const sayLines = async (lines: any[]) => {
      const ok = lines.filter((l: any) => l && !l.error)
      for (const l of ok) await journal($, { ev: 'line', step: ctx.state.current ?? null, line: l.id, kind: l.kind, text: l.text })
      turnSaid = { step: ctx.state.current || '', lines: ok.map((l: any) => ({ id: l.id, text: l.text })) }
      return say(ok.map((l: any) => l.text).join('\n\n'))
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
    // F215: "bmuz bug <words>" reports a bug (a side trip, like saying it); "bmuz bug" / "bmuz bug B004" / "bmuz bug sweep"
    // fix bugs on a side trip (the step we're on waits, then carries on); "list", "verified B004", "stop".
    const bc = E.bugCommand(text)
    if (bc) {
      if (ctx.broken) return say(`BMUZ engine: ${ctx.broken}`)
      if (bc.kind === 'report') return next({ ...(e as any), context: [...((e as any).context ?? []), E.stepInNote(bc.words, { typed: true, auto: ctx.auto })] })
      if (bc.kind === 'list') {
        const l = await runBugs($, ['list'])
        return say(l.text || l.say || 'BMUZ engine: no bug list here.')
      }
      if (bc.kind === 'verified') {
        const st = await runBugs($, ['status', bc.id, 'verified'])
        if (!st.ok) return say(`BMUZ engine: ${st.say || st.text}`)
        await journal($, { ev: 'bug.verified', id: bc.id })
        return sayLines([E.renderLine(ctx.script, 'bug.verified', { bug: st.bug })])
      }
      if (bc.kind === 'stop') {
        if (!ctx.side) return say('BMUZ engine: no fix run is going on.')
        // (F216 review fix 4: a feature run isn't a fix run; its way out is "bmuz park")
        if (ctx.side.feature !== undefined) return say(`BMUZ engine: no bug fix is running; say "bmuz park" to set this feature aside (${ctx.side.feature}).`)
        const out = await endSide($, 'stopped')
        if (out) return say(`BMUZ engine: ${out.why}`)
        pending = 'resume'
        return next({ ...(e as any), text: `${text}\n(BMUZ engine: the fix run was put aside (the bug is open again) and the work we were on carries on: ${E.placeWords(ctx.pipeline, ctx.state)}. Reply with one short line; the engine picks it up itself.)` })
      }
      if (ctx.side) return say(ctx.side.feature !== undefined ? `BMUZ engine: ${ctx.side.feature} is being built; the fix runs once it's done ("bmuz park" sets it aside first).` : `BMUZ engine: already fixing ${ctx.side.bug}. "bmuz bug stop" puts it aside.`)
      // (a sweep: the open P0–P2 bugs as they are now, the only ones it takes — review fix 6)
      const open = bc.kind === 'sweep' ? await runBugs($, ['open']) : null
      const ids: string[] = open && open.ok && Array.isArray(open.ids) ? open.ids : []
      if (open && !ids.length) return sayLines([E.renderLine(ctx.script, 'bug.none', {}), E.renderLine(ctx.script, 'bug.how', {})])
      const nx = await runBugs($, ['next', ...(bc.kind === 'fix' && bc.id ? [bc.id] : ids.length ? [ids[0]] : [])])
      if (nx.none) return sayLines([E.renderLine(ctx.script, 'bug.none', {}), E.renderLine(ctx.script, 'bug.how', {})])
      if (!nx.ok) return say(`BMUZ engine: ${nx.say || nx.text}`)
      const busy = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
      if (busy && busy.kind === 'flow' && ctx.state.status === 'working') return say(`BMUZ engine: the "${busy.id}" helpers are still working; say "bmuz bug" again once they're done.`)
      pendingFix = { id: nx.id, sweep: ids }
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: fixing ${nx.bug} now; what we were on waits and carries on after it. Reply with one short line; the engine runs the fix itself.)` })
    }
    // F216: "bmuz park": the feature being built is set aside (the 4.4 stuck line's "unless you'd rather I park it"):
    // its step gives back what it wrote, the sprint marks it parked, and Develop's loop goes on to the next feature.
    if (/^\s*bmuz park\s*$/i.test(text)) {
      if (ctx.broken) return say(`BMUZ engine: ${ctx.broken}`)
      if (!ctx.side || ctx.side.feature === undefined) return say('BMUZ engine: no feature is being built, so there is nothing to park.')
      const busy = ctx.state.current ? E.stepById(ctx.pipeline, ctx.state.current) : null
      if (busy && busy.kind === 'flow' && ctx.state.status === 'working') return say(`BMUZ engine: the "${busy.id}" helpers are still working; say "bmuz park" again once they're done.`)
      const parked = ctx.side.feature
      const out = await endSide($, 'parked')
      if (out && !out.failed) return say(`BMUZ engine: ${out.why}`)
      pending = 'resume'
      // (review fix 3: a status sprint.mjs refused is said, not ignored)
      if (out && out.failed) return next({ ...(e as any), text: `${text}\n(BMUZ engine: ${parked}'s run was set aside, but the engine ${out.failed}. Then end your turn; the engine picks the sprint up itself.)` })
      return next({ ...(e as any), text: `${text}\n(BMUZ engine: ${parked} is parked (the sprint says so; a later sprint takes it up again) and the sprint carries on. Reply with one short line; the engine picks it up itself.)` })
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
      const opts = E.gateWords(step, ctx.script, vars()).options
      if (!opts.includes(answer)) return say(`BMUZ engine: the gate is still open. Answer with one of: ${opts.map((o: string) => `"bmuz approve ${o}"`).join(' / ')}`)
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
    if (noted) return next({ ...(e as any), text: `${text}\n(${noted})`, ...(brokenHint.length ? { context: [...((e as any).context ?? []), ...brokenHint] } : {}) })
    if (brokenHint.length) return next({ ...(e as any), context: [...((e as any).context ?? []), ...brokenHint] })
    return next(e)
    // Without this, an error here let the prompt through unread (proof check 6), so a flow's result could
    // be lost. Now the prompt is dropped (it goes back to the input with the reason) and every tool is
    // refused until /bmuz-doctor. A prompt hook refuses with { drop } (mods docs, events: prompt.submit).
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    if (ctx) ctx.broken = 'the engine hit an error in its own code reading a prompt; run /bmuz-doctor'
    return { drop: 'BMUZ engine hit an error in its own code reading this prompt, so it held it back to be safe. Run /bmuz-doctor, then send it again.' }
  })

  on('turn.start', ($, e, next) => {
    if (!(e as any).agentId) turnRunning = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if ((e as any).agentId) return r
    turnRunning = false
    // (F215: this turn's step-in marks, read once; the next turn starts without them)
    const steppedIn = stepInTurn
    stepInTurn = false
    askedThisTurn = false
    stepInBox = null // (review fix 9: a step-in box never asked this turn is dropped)
    askClosedThisTurn = false
    if (!ctx) return r
    // F231: a stall the watchdog held while this turn ran is judged now (the engine's own work belongs here).
    if (heldStall && pending) heldStall = null
    if (heldStall && (await judgeHeldStall($))) {
      quietTurn = false
      creativeTurn = false
      return r
    }
    // F232: every script line said in this turn must be in what Claude wrote, word for word. A line that isn't gets the
    // engine's correction (at most MAX_NUDGES per step try); anything pending waits for that turn's end.
    const said = turnSaid
    const wasLong = longSaid
    turnSaid = { step: '', lines: [] }
    longSaid = false
    if (said.lines.length) {
      let rows: any = null
      try { rows = await $.session.messages() } catch (err) { rows = null }
      const written = Array.isArray(rows) ? E.turnText(rows) : String((e as any).answer ?? '')
      const missing = E.unsaid(said.lines, `${written}\n${String((e as any).answer ?? '')}`)
      await journal($, { ev: 'said', step: said.step, lines: said.lines.map(l => l.id), missing: missing.map((l: any) => l.id), checked: Array.isArray(rows) ? 'transcript' : 'answer' })
      if (missing.length && !(e as any).isAborted) {
        const key = `${said.step}#${ctx.state.retries[said.step] || 0}`
        if (nudges.key !== key) nudges = { key, n: 0 }
        const fix = E.unsaidNudge(E.stepById(ctx.pipeline, said.step) || { id: said.step }, missing, nudges.n)
        if (fix) {
          nudges.n += 1
          turnSaid = { step: said.step, lines: missing }
          await journal($, { ev: 'nudge', step: said.step, n: nudges.n, unsaid: missing.map((l: any) => l.id) })
          await $.prompt.submit({ text: fix })
          quietTurn = false
          creativeTurn = false
          return r
        }
      }
    }
    // A long line was shown and the step goes on: its next question comes in a turn of its own (a box would cover it).
    if (!pending && wasLong && ctx.state.status === 'working' && !E.askOpen(ctx.state) && !(e as any).isAborted) {
      const step = E.stepById(ctx.pipeline, ctx.state.current)
      const key = step ? `${step.id}#${ctx.state.retries[step.id] || 0}` : ''
      if (continues.key !== key) continues = { key, n: 0 }
      const text = step && step.kind === 'talk' ? E.continueLine(step, continues.n) : null
      if (step && text) {
        continues.n += 1
        await journal($, { ev: 'continue', step: step.id })
        await $.prompt.submit({ text })
        quietTurn = false
        creativeTurn = false
        return r
      }
    }
    // F215: a bug to fix now ("bmuz bug", or a fix-now report): the stage parks where it is and the bug pipeline runs; it
    // comes back here when the fix is done. (A hand-off card still to show goes first; the fix waits for that turn's end.)
    if (pendingFix && !(pending && typeof pending === 'object')) {
      const want = pendingFix
      pendingFix = null
      const out: any = await startSide($, want.id, want.sweep)
      if (out) {
        await journal($, { ev: 'side.refused', bug: want.id, why: out.why ?? 'no open bugs' })
        await $.prompt.submit({ text: `BMUZ engine: the fix couldn't start: ${out.why ?? 'there are no open bugs'}. Tell the creative in one plain line, then end your turn.` })
      } else {
        pending = null
        await advance($, false)
      }
      quietTurn = false
      creativeTurn = false
      return r
    }
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
        // F215: an auto run's turn that ended on a step-in (a bug reported) isn't the step failing: no failed try. A step
        // this session was running carries on where it was; one it never started (a new session, the step waiting from
        // an earlier one) stays as it is, record intact, until "bmuz go".
        const tryKey = `${step.id}#${ctx.state.retries[step.id] || 0}`
        // (review fix 6: at most MAX_STEP_INS such turns per step try, or an auto run could loop on them forever)
        if (steppedIn && ctx.auto && stepIns.key !== tryKey) stepIns = { key: tryKey, n: 0 }
        if (steppedIn && ctx.auto) stepIns.n += 1
        if (steppedIn && ctx.auto && stepIns.n <= MAX_STEP_INS) {
          const here = talkStartedHere === tryKey
          await journal($, { ev: here ? 'stepin.back' : 'stepin.left', step: step.id })
          if (here) await startTalk($, step, '')
        } else if (ctx.auto) {
        // Auto run: a turn that ends without step_done is Claude waiting on someone (live check L5: it asked
        // "red or blue?" in plain text and stopped). The engine answers "nobody's coming" and counts it as a failed try.
          const outcome = await settle($, step, { ok: false, why: 'the turn ended without step_done; in an auto run nobody will answer, so take the default and finish' }, null)
          if (outcome === 'retry') {
            ctx.state = { ...ctx.state, current: step.id }
            await save($)
            await startTalk($, step, 'the turn ended without step_done; in an auto run nobody will answer, so take the default and finish')
          } else if (outcome === 'stop' && pending === 'advance') {
            // (F216: a feature run that BLOCKED: back to Develop's loop, which goes on to the next feature)
            pending = null
            await advance($, false)
          }
        } else if (quietWait || E.askOpen(ctx.state)) {
          // The creative closed the question box (Esc, or "Type something" sent empty — Claude Code can't tell them
          // apart), or a free question is open. Their answer comes next: no nudge (live look 2026-11-10: two nudges
          // made Claude repeat "still paused" while the creative looked for a paste field).
          await journal($, { ev: E.askOpen(ctx.state) ? 'ask.waiting' : 'ask.declined', step: step.id })
          quietWait = ''
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
    const opts = E.gateWords(step, ctx.script, vars()).options
    if (!opts.includes(answer)) return { text: `The gate is still open. Pick one of: ${opts.join(' / ')}` }
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

  // F231: the engine's own tool rows (step_done, ask_paste) as one dim line, never their raw JSON. ctrl+o (expanded)
  // still shows everything; a refusal shows its reason as Claude Code draws it.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p: any = (e as any).props || {}
    const label = E.toolRowLabel(p.tool, p.output, p.isErrored)
    if (!label || p.isExpanded) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>{label}</Text>
      </Box>
    )
  })
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const p: any = (e as any).props || {}
    if (!E.toolRowLabel(p.tool, p.output, p.isErrored) || p.isExpanded) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box key="bmuz-quiet" />
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
