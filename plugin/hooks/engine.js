// BMUZ engine core: pure logic, no Claude Code API. The mod (register.ts),
// motor B (bin/bmuz.mjs) and the no-Claude tests all use this one file.

export const KINDS = ['talk', 'gate', 'script', 'flow']
export const MAX_RETRIES = 2
export const ENGINE_TOOL = 'mcp__bmuz__step_done'

// Checks a pipeline file's shape. Returns a list of problems (empty = fine).
export function checkPipeline(p) {
  const problems = []
  if (!p || !Array.isArray(p.steps)) return ['pipeline has no steps list']
  const ids = new Set()
  for (const s of p.steps) {
    if (!s.id) problems.push('a step has no id')
    if (ids.has(s.id)) problems.push(`step id ${s.id} is used twice`)
    ids.add(s.id)
    if (!KINDS.includes(s.kind)) problems.push(`step ${s.id}: kind ${s.kind} is not one of ${KINDS.join('/')}`)
    for (const n of s.needs || []) if (!ids.has(n)) problems.push(`step ${s.id} needs ${n}, which is not an earlier step`)
    if (s.kind === 'gate' && !(s.options && s.options.length >= 2)) problems.push(`gate ${s.id} needs 2+ options`)
    if (s.kind === 'script' && !Array.isArray(s.run)) problems.push(`script ${s.id} needs a run list`)
    if (s.kind === 'flow' && !s.workflow) problems.push(`flow ${s.id} needs a workflow name`)
  }
  return problems
}

export function freshState(pipelineId) {
  return { pipeline: pipelineId, current: null, status: 'idle', results: {}, retries: {}, finished: [], blocked: null, startedAt: null }
}

export function stepById(p, id) {
  return p.steps.find(s => s.id === id)
}

// The first step not yet finished whose needs are all finished.
export function nextStep(p, state) {
  for (const s of p.steps) {
    if (state.finished.includes(s.id)) continue
    if ((s.needs || []).every(n => state.finished.includes(n))) return s
  }
  return null
}

// Fills {name}-style holes from the step results and extra values.
export function fill(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m))
}

export function fillDeep(v, vars) {
  if (typeof v === 'string') return fill(v, vars)
  if (Array.isArray(v)) return v.map(x => fillDeep(x, vars))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, vars)]))
  return v
}

// Decides one tool call. Returns { allow: true } or { allow: false, why }.
// call = { tool, agentId?, workflowName? }
export function judgeTool(p, state, call) {
  if (state.status === 'done' || state.status === 'idle') return { allow: true }
  const step = stepById(p, state.current)
  if (!step) return { allow: false, why: `BMUZ engine: no current step (state says ${state.current}); run /bmuz-doctor` }
  if (state.status === 'blocked') return { allow: false, why: `BMUZ engine: step ${step.id} is BLOCKED; nothing runs until the creative decides` }
  if (state.status === 'waiting') {
    if (call.tool === 'AskUserQuestion') return { allow: true }
    return { allow: false, why: `BMUZ engine: waiting at gate "${step.id}" for the creative; no tools until they answer` }
  }
  if (call.agentId) {
    const ok = step.kind === 'flow' && (step.agentTools || []).includes(call.tool)
    return ok ? { allow: true } : { allow: false, why: `BMUZ engine: a helper may not use ${call.tool} in step ${step.id}` }
  }
  if (call.tool === ENGINE_TOOL) {
    return step.kind === 'talk' ? { allow: true } : { allow: false, why: `BMUZ engine: step ${step.id} is a ${step.kind} step; the engine finishes it itself` }
  }
  if (call.tool === 'Workflow' && step.kind === 'flow') {
    return { allow: true, rewriteWorkflow: true }
  }
  if ((step.tools || []).includes(call.tool)) return { allow: true }
  return { allow: false, why: `BMUZ engine: step ${step.id} (${step.kind}) may use only ${(step.tools || []).join(', ') || 'no tools'}; ${call.tool} is out of order` }
}

// Done-check. `look` = what the mod read: { result, files: { path: text|null } }.
export function doneCheck(step, vars, look) {
  const d = step.done
  if (!d) return { ok: true }
  if (d.type === 'result-has') {
    const v = look.result && look.result[d.key]
    return v ? { ok: true } : { ok: false, why: `the result has no "${d.key}"; give it in step_done's result` }
  }
  const path = fill(d.path, vars)
  const text = look.files ? look.files[path] : undefined
  if (text === null || text === undefined) return { ok: false, why: `${path} does not exist; the step must write it` }
  if (d.type === 'file-contains') {
    const want = fill(d.text, vars)
    return text.includes(want) ? { ok: true } : { ok: false, why: `${path} does not contain "${want}"` }
  }
  if (d.type === 'file-json-has') {
    try {
      const j = JSON.parse(text)
      return j[d.key] ? { ok: true } : { ok: false, why: `${path} has no "${d.key}"` }
    } catch (err) {
      return { ok: false, why: `${path} is not JSON` }
    }
  }
  return { ok: false, why: `unknown done-check type ${d.type}` }
}

// The files a done-check needs read.
export function checkFiles(step, vars) {
  const d = step.done
  return d && d.path ? [fill(d.path, vars)] : []
}

// After a failed done-check: retry (up to MAX_RETRIES) or block.
export function onFail(state, step, why) {
  const n = (state.retries[step.id] || 0) + 1
  const retries = { ...state.retries, [step.id]: n }
  if (n > MAX_RETRIES) {
    return { state: { ...state, retries, status: 'blocked', blocked: { step: step.id, why } }, action: 'block' }
  }
  return { state: { ...state, retries }, action: 'retry', attempt: n + 1 }
}

export function finish(state, step, result) {
  return {
    ...state,
    finished: state.finished.includes(step.id) ? state.finished : [...state.finished, step.id],
    results: result ? { ...state.results, ...result } : state.results,
    current: null,
    status: 'idle',
    startedAt: null,
  }
}

export function begin(state, step, now) {
  const status = step.kind === 'gate' ? 'waiting' : 'working'
  return { ...state, current: step.id, status, startedAt: now }
}

// Gate answer: the first option approves; any other sends the creative back to
// the step named in `step.backTo` (its result cleared).
export function answerGate(p, state, step, answer) {
  if (answer === step.options[0]) return { state: finish(state, step), approved: true }
  const back = step.backTo
  if (!back) return { state, approved: false }
  const drop = new Set([back, ...p.steps.filter(s => (s.needs || []).includes(back)).map(s => s.id)])
  return { state: { ...state, finished: state.finished.filter(id => !drop.has(id)), current: null, status: 'idle', startedAt: null }, approved: false }
}

// Watchdog: is the current step past its time limit?
export function isStalled(p, state, now, defaultMs) {
  if (state.status !== 'working' || !state.startedAt) return false
  const step = stepById(p, state.current)
  const limit = (step && step.timeoutMs) || defaultMs
  return now - state.startedAt > limit
}

// The status band's words.
export function bandText(p, state, now) {
  const total = p.steps.length
  if (state.status === 'done') return `BMUZ · ${p.id} · all ${total} steps done`
  if (state.status === 'idle' && state.finished.length === 0) return `BMUZ · ${p.id} · ready · /bmuz-go to start`
  const step = stepById(p, state.current) || nextStep(p, state)
  const n = step ? p.steps.indexOf(step) + 1 : state.finished.length
  const word = { working: 'working', waiting: 'waiting for you', blocked: 'BLOCKED', idle: 'next up', stalled: 'stalled' }[state.status] || state.status
  const timed = typeof state.startedAt === 'number'
  const secs = timed ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  return `BMUZ · step ${n} of ${total} · ${step ? step.id : '?'} · ${word}${timed ? ' · ' + clock : ''}`
}

// Doctor: rebuilds "where are we" from the journal lines alone.
export function rebuildFromJournal(pipelineId, lines) {
  let s = freshState(pipelineId)
  for (const raw of lines) {
    if (!raw.trim()) continue
    let j
    try { j = JSON.parse(raw) } catch (err) { continue }
    if (j.ev === 'step.start') s = { ...s, current: j.step, status: j.kind === 'gate' ? 'waiting' : 'working', startedAt: j.t }
    if (j.ev === 'step.done') s = { ...s, finished: s.finished.includes(j.step) ? s.finished : [...s.finished, j.step], results: { ...s.results, ...(j.result || {}) }, current: null, status: 'idle', startedAt: null }
    if (j.ev === 'gate.back') s = { ...s, finished: s.finished.filter(id => !(j.dropped || []).includes(id)), current: null, status: 'idle' }
    if (j.ev === 'blocked') s = { ...s, status: 'blocked', blocked: { step: j.step, why: j.why } }
    if (j.ev === 'pipeline.done') s = { ...s, status: 'done', current: null }
  }
  return s
}

// Reads the flow result out of a task-notification text.
export function parseTaskNotification(text) {
  if (!/<task-notification>/.test(text)) return null
  const get = tag => {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
    return m ? m[1].trim() : undefined
  }
  let result = get('result')
  try { result = result !== undefined ? JSON.parse(result) : undefined } catch (err) { /* keep text */ }
  return { taskId: get('task-id'), toolUseId: get('tool-use-id'), status: get('status'), result }
}
