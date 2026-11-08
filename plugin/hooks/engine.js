// BMUZ engine core: pure logic, no Claude Code API. The mod (register.ts),
// motor B (bin/bmuz.mjs) and the no-Claude tests all use this one file.

export const KINDS = ['talk', 'gate', 'script', 'flow']
export const MAX_RETRIES = 2
export const ENGINE_TOOL = 'mcp__bmuz__step_done'

// The pipeline file format this engine reads (docs/pipeline-format.md).
export const FORMAT_VERSION = 1
// Pipeline ids, step ids and pipeline names in bmuz.json: lower case, digits, dashes.
export const NAME_RE = /^[a-z][a-z0-9-]*$/
const TOP_KEYS = ['id', 'version', 'description', 'watchdogMs', 'steps']
const STEP_KEYS = {
  common: ['id', 'kind', 'needs', 'description', 'timeoutMs'],
  talk: ['tools', 'craft', 'done', 'writes'],
  gate: ['question', 'options', 'backTo'],
  script: ['run', 'writes', 'done'],
  flow: ['workflow', 'args', 'agentTools', 'writes', 'craft', 'done'],
}
const DONE_KEYS = {
  'result-has': ['type', 'key'],
  'file-contains': ['type', 'path', 'text'],
  'file-json-has': ['type', 'path', 'key'],
}
const BUILT_IN_HOLES = ['project', 'plugin']

// A path the engine may read, write or delete inside the project (or plugin):
// relative, forward slashes, no "..", not the engine's own .bmuz folder.
// The motor re-checks this right before it acts, not only when the file is checked.
export function isSafePath(path) {
  if (typeof path !== 'string' || !path.trim()) return false
  if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  const parts = path.split('/')
  return !parts.some(p => p === '..' || p === '' || p === '.') && parts[0] !== '.bmuz'
}

const isList = v => Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim())
const isPositive = v => typeof v === 'number' && Number.isFinite(v) && v > 0
const holesIn = v => {
  const found = []
  const walk = x => {
    if (typeof x === 'string') for (const m of x.matchAll(/\{(\w+)\}/g)) found.push(m[1])
    else if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') Object.values(x).forEach(walk)
  }
  walk(v)
  return found
}

// Checks a pipeline file. Returns a list of problems in plain words (empty = fine).
// The engine refuses to run a pipeline with any problem.
export function checkPipeline(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['the pipeline file is not a JSON object']
  const problems = []
  for (const k of Object.keys(p)) if (!TOP_KEYS.includes(k)) problems.push(`the pipeline has an unknown setting "${k}" (allowed: ${TOP_KEYS.join(', ')})`)
  if (typeof p.id !== 'string' || !NAME_RE.test(p.id)) problems.push('the pipeline needs an "id" in lower case letters, digits and dashes')
  if (p.version !== FORMAT_VERSION) problems.push(`the pipeline's "version" must be ${FORMAT_VERSION} (this engine reads format ${FORMAT_VERSION})`)
  if (p.description !== undefined && typeof p.description !== 'string') problems.push('the pipeline\'s "description" must be text')
  if (p.watchdogMs !== undefined && !isPositive(p.watchdogMs)) problems.push('"watchdogMs" must be a number of milliseconds above 0')
  if (!Array.isArray(p.steps) || p.steps.length === 0) return [...problems, 'the pipeline has no steps list']

  const byId = new Map()
  p.steps.forEach((s, i) => {
    const at = s && typeof s.id === 'string' && s.id ? `step "${s.id}"` : `step ${i + 1}`
    if (!s || typeof s !== 'object' || Array.isArray(s)) { problems.push(`${at} is not an object`); return }
    if (typeof s.id !== 'string' || !NAME_RE.test(s.id)) problems.push(`${at} needs an "id" in lower case letters, digits and dashes`)
    else if (byId.has(s.id)) problems.push(`step id "${s.id}" is used twice`)
    if (!KINDS.includes(s.kind)) {
      problems.push(`${at}: kind "${s.kind}" is not one of ${KINDS.join(', ')}`)
      byId.set(s.id, s)
      return
    }
    const allowed = [...STEP_KEYS.common, ...STEP_KEYS[s.kind]]
    for (const k of Object.keys(s)) if (!allowed.includes(k)) problems.push(`${at} (${s.kind}) has an unknown setting "${k}" (allowed: ${allowed.join(', ')})`)
    if (s.needs !== undefined && !Array.isArray(s.needs)) problems.push(`${at}: "needs" must be a list of step ids`)
    for (const n of Array.isArray(s.needs) ? s.needs : []) if (!byId.has(n)) problems.push(`${at} needs "${n}", which is not an earlier step`)
    if (s.description !== undefined && typeof s.description !== 'string') problems.push(`${at}: "description" must be text`)
    if (s.timeoutMs !== undefined && !isPositive(s.timeoutMs)) problems.push(`${at}: "timeoutMs" must be a number of milliseconds above 0`)
    if (s.craft !== undefined && !(isSafePath(s.craft) && s.craft.endsWith('.md'))) problems.push(`${at}: "craft" must be a .md file inside the plugin, like craft/${s.id}.md`)
    if (s.writes !== undefined) {
      if (!isList(s.writes)) problems.push(`${at}: "writes" must be a list of file paths`)
      else for (const f of s.writes) {
        if (!isSafePath(f)) problems.push(`${at}: "writes" path "${f}" must stay inside the project (relative, forward slashes, no "..", not .bmuz)`)
        else if (/[{}]/.test(f)) problems.push(`${at}: "writes" path "${f}" can't use {holes}; name the file`)
      }
    }
    if (s.done !== undefined) {
      const d = s.done
      const keys = d && DONE_KEYS[d.type]
      if (!keys) problems.push(`${at}: done-check type "${d && d.type}" is not one of ${Object.keys(DONE_KEYS).join(', ')}`)
      else {
        for (const k of Object.keys(d)) if (!keys.includes(k)) problems.push(`${at}: done-check "${d.type}" has an unknown setting "${k}"`)
        for (const k of keys.slice(1)) if (typeof d[k] !== 'string' || !d[k]) problems.push(`${at}: done-check "${d.type}" needs "${k}"`)
        if (typeof d.path === 'string' && d.path && !isSafePath(d.path)) problems.push(`${at}: done-check path "${d.path}" must stay inside the project`)
        if (d.type === 'result-has' && s.kind !== 'talk') problems.push(`${at}: only talk steps hand back a result, so "result-has" can't check a ${s.kind} step`)
      }
    }
    if (s.kind === 'talk') {
      if (!isList(s.tools)) problems.push(`${at} (talk) needs "tools": the list of tools Claude may use in it`)
      if (!s.craft) problems.push(`${at} (talk) needs a "craft" note telling Claude what to do`)
    }
    if (s.kind === 'gate') {
      if (typeof s.question !== 'string' || !s.question.trim()) problems.push(`${at} (gate) needs a "question"`)
      if (!isList(s.options) || s.options.length < 2) problems.push(`${at} (gate) needs 2 or more "options"`)
      else if (new Set(s.options).size !== s.options.length) problems.push(`${at} (gate): two options have the same words`)
      if (s.backTo !== undefined && !byId.has(s.backTo)) problems.push(`${at} (gate): "backTo" "${s.backTo}" is not an earlier step`)
    }
    if (s.kind === 'script' && (!isList(s.run) || s.run.length === 0)) problems.push(`${at} (script) needs "run": the command as a list, like ["node", "{plugin}/scripts/x.mjs"]`)
    if (s.kind === 'flow') {
      if (typeof s.workflow !== 'string' || !/^[a-z0-9-]+:[a-z0-9-]+$/.test(s.workflow)) problems.push(`${at} (flow) needs "workflow" as plugin:name, like bmuz:hello-flow`)
      if (s.args !== undefined && (!s.args || typeof s.args !== 'object' || Array.isArray(s.args))) problems.push(`${at} (flow): "args" must be an object`)
      if (s.agentTools !== undefined && !isList(s.agentTools)) problems.push(`${at} (flow): "agentTools" must be a list of tool names`)
    }
    // {holes} may name the project, the plugin, or a result an earlier talk step this one needs hands back.
    const known = new Set(BUILT_IN_HOLES)
    const seen = new Set()
    const walk = id => {
      if (seen.has(id) || !byId.has(id)) return
      seen.add(id)
      const n = byId.get(id)
      if (n.kind === 'talk' && n.done && n.done.type === 'result-has') known.add(n.done.key)
      for (const m of Array.isArray(n.needs) ? n.needs : []) walk(m)
    }
    for (const n of Array.isArray(s.needs) ? s.needs : []) walk(n)
    const filled = { question: s.question, run: s.run, args: s.args, path: s.done && s.done.path, text: s.done && s.done.text }
    for (const h of new Set(holesIn(filled))) if (!known.has(h)) problems.push(`${at}: {${h}} isn't known here (known: ${[...known].map(k => `{${k}}`).join(', ')}); a result comes from a talk step this step needs`)
    if (typeof s.id === 'string' && !byId.has(s.id)) byId.set(s.id, s)
  })
  return problems
}

// Plugin files a pipeline names (craft notes); the caller checks they exist.
export function pluginFiles(p) {
  return (Array.isArray(p && p.steps) ? p.steps : []).filter(s => s && typeof s.craft === 'string' && isSafePath(s.craft)).map(s => s.craft)
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
  // step_done only closes an open talk step; called between steps, it has nothing to finish.
  if (call.tool === ENGINE_TOOL && !call.agentId && !(state.status === 'working' && (stepById(p, state.current) || {}).kind === 'talk')) {
    return { allow: false, why: 'BMUZ engine: no talk step is open, so there is nothing to finish. End your turn; the engine starts the next step itself.' }
  }
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
  if (!isSafePath(path)) return { ok: false, why: `${path} is outside the project; the engine won't read it` }
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
  return d && d.path ? [fill(d.path, vars)].filter(isSafePath) : []
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
