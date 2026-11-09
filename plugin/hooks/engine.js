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
  gate: ['question', 'options', 'approve', 'backTo'],
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
  // Windows ignores case and a trailing dot or space: ".BMUZ" and ".bmuz." are the engine's own folder too.
  if (parts.some(p => p === '..' || p === '' || p === '.' || /[. ]$/.test(p))) return false
  return parts[0].toLowerCase() !== '.bmuz'
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
      // The first option is the one a stray Enter picks, so it must be the safe one (live check L1).
      else if (typeof s.approve !== 'string' || !s.options.includes(s.approve)) problems.push(`${at} (gate) needs "approve": the option that says yes, word for word`)
      else if (s.options[0] === s.approve) problems.push(`${at} (gate): "${s.approve}" can't be the first option; a stray Enter would approve it. Put the safe choice first`)
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
  return { pipeline: pipelineId, current: null, status: 'idle', results: {}, resultsBy: {}, retries: {}, finished: [], blocked: null, startedAt: null }
}

// The results the next steps can use: each finished step's result, in the order they finished.
function mergeResults(finished, resultsBy) {
  return Object.assign({}, ...finished.map(id => (resultsBy && resultsBy[id]) || {}))
}

// Takes steps off the finished list (undo, a gate sending the creative back): their results
// and retry counts go too, so they run fresh.
function dropSteps(state, drop) {
  const finished = state.finished.filter(id => !drop.has(id))
  const resultsBy = Object.fromEntries(Object.entries(state.resultsBy || {}).filter(([id]) => !drop.has(id)))
  const retries = Object.fromEntries(Object.entries(state.retries || {}).filter(([id]) => !drop.has(id)))
  return { ...state, finished, resultsBy, retries, results: state.resultsBy ? mergeResults(finished, resultsBy) : state.results }
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

// How a session ended, from session.end's reason. Only these are a clean end; anything else
// (a closed window reports "other"; a kill reports nothing) is read as a crash at the next start.
export const CLEAN_ENDS = ['prompt_input_exit', 'clear', 'logout', 'resume']

// Did the last session die? lock = .bmuz/lock.json as read.
export function diedLastTime(lock, sessionId) {
  if (!lock || !lock.step || lock.session === sessionId) return false
  return !lock.closed || !CLEAN_ENDS.includes(lock.endReason)
}

// An auto run's questions, as the lines that go in .bmuz/questions.md.
export function askLines(stepId, asks, day) {
  return (Array.isArray(asks) ? asks : [])
    .map(a => (typeof a === 'string' ? { question: a } : a))
    .filter(a => a && typeof a.question === 'string' && a.question.trim())
    .map(a => `- [ ] ${day} · step ${stepId}: ${a.question.trim()}${a.picked ? ` — went with: ${String(a.picked).trim()}` : ''}`)
}

// The words that start a talk step. An auto run gets the never-ask rule up front.
export function talkPrompt(step, craft, why, auto) {
  const lines = [`BMUZ step "${step.id}" — this message comes from the BMUZ engine, not the creative; do the step without commenting on the engine.`]
  if (why) lines.push(`The last try did not pass: ${why}.`)
  if (auto) lines.push(`Auto run: the creative is away. Never ask and never wait for an answer, with AskUserQuestion or in plain text. Where you would ask, pick the sensible default, list it in the result's "asks" as {"question": "...", "picked": "..."}, and carry on.`)
  lines.push(craft)
  lines.push(`When it is done, call ${ENGINE_TOOL} with result ${JSON.stringify({ [(step.done && step.done.key) || 'ok']: '...' })} and end your turn.`)
  return lines.join('\n')
}

// The words that launch a flow step's workflow. They come as the engine's own message (live check L3:
// the old route, running the workflow's /command, showed in the chat as if the creative had typed it).
// The guard pins the Workflow call's name and inputs to these whatever Claude sends.
// tryNo: 1 for the first try. A retry says so: the same words twice looked like the engine asking again
// for a run already going, and Claude refused the real retry (live check 2026-11-08).
export function flowPrompt(step, args, tryNo = 1) {
  return [
    `BMUZ step "${step.id}" — this message comes from the BMUZ engine, not the creative; don't comment on it or offer to stop it.`,
    ...(tryNo > 1 ? [`This is try ${tryNo} of ${MAX_RETRIES + 1}: the engine itself stopped the last try (it ran too long or failed its check), so no earlier run is still going. Start this fresh one.`] : []),
    `Call the Workflow tool now with name "${step.workflow}" and args ${JSON.stringify(args)}. Then end your turn; the engine checks the result itself.`,
  ].join('\n')
}

// ---- The hand-off card (docs/handoff-card.md) ----
// A hand-off step returns the card's words as data; the engine writes the card itself, so it has the
// same shape every time (V29). The labels are today's card (~/.claude/config/bmuz/templates/handoff.md).
export const CARD_PARTS = [
  ['done', 'Done'],
  ['see', "You'll see"],
  ['try', 'Try it'],
  ['proof', 'Proof'],
  ['todos', 'Your to-dos'],
  // (Questions come here, from the open-questions list)
  ['next', 'Next'],
]

const hasWords = v => (typeof v === 'string' && v.trim() !== '') || (isList(v) && v.length > 0)

// Checks a card. Returns { ok: true } or { ok: false, why } naming every missing or empty part.
export function checkCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { ok: false, why: 'the result has no "card": give it as {"title", "done", "see", "try", "proof", "todos", "questions", "next"}' }
  const missing = []
  if (typeof card.title !== 'string' || !card.title.trim()) missing.push('title')
  for (const [key] of CARD_PARTS) if (!hasWords(card[key])) missing.push(key)
  const problems = []
  if (missing.length) problems.push(`the card's ${missing.map(k => `"${k}"`).join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing or empty (write "none" where there is nothing)`)
  if (card.questions !== undefined && !Array.isArray(card.questions)) problems.push('the card\'s "questions" must be a list (or left out when there are none)')
  else for (const [i, q] of (card.questions || []).entries()) problems.push(...questionProblems(q, i + 1))
  return problems.length ? { ok: false, why: problems.join('; ') } : { ok: true }
}

// What is wrong with one of a card's questions (empty = fine). i = its place in the card, for the message.
function questionProblems(q, i) {
  const at = `question ${i}`
  if (!q || typeof q !== 'object' || Array.isArray(q)) return [`${at} must be {"key", "q", "kind", "options"}`]
  const out = []
  // A Questions section holds only questions (V30): each one ends in "?".
  if (typeof q.q !== 'string' || !q.q.trim()) out.push(`${at} has no "q" (the question's words)`)
  else if (!q.q.trim().endsWith('?')) out.push(`${at} ("${q.q.trim()}") must be a question ending in "?"`)
  if (q.options !== undefined && !isList(q.options)) out.push(`${at}: "options" must be a list of answers`)
  return out
}

// One card part: a string stays on the label's line; a list goes under it, one "- " line each.
function cardLine(label, v) {
  if (Array.isArray(v)) return [`**${label}:**`, ...v.map(x => `- ${String(x).trim()}`)].join('\n')
  return `**${label}:** ${String(v).trim()}`
}

// The card as markdown, with today's labels in today's order. openQuestions = the questions to list
// (from the open-questions list, each with its number n), numbered so the creative can answer by number.
export function renderCard(card, openQuestions = []) {
  const lines = [`## ${card.title.trim().replace(/\s*—\s*ready for you to check\s*$/i, '')} — ready for you to check`]
  for (const [key, label] of CARD_PARTS) {
    if (key === 'next') lines.push(questionsBlock(openQuestions))
    lines.push(cardLine(label, card[key]))
  }
  return lines.join('\n')
}

function questionsBlock(qs) {
  if (!qs.length) return '**Questions:** none'
  const out = ['**Questions:**']
  for (const q of qs) {
    out.push(`${q.n}. ${q.q.trim()}`)
    const opts = Array.isArray(q.options) ? q.options.slice() : []
    // The pick goes first, marked (choice and want questions only; checkCard keeps it off taste ones).
    if (q.pick && opts.includes(q.pick)) {
      opts.splice(opts.indexOf(q.pick), 1)
      opts.unshift(q.pick)
    }
    for (const o of opts) out.push(`   - ${o}${o === q.pick ? ' (my pick)' : ''}`)
  }
  return out.join('\n')
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

// A refused question that a person refused (Esc, or "no" on the box): Claude Code's fixed wording for a
// tool use the user rejected. Only other refusals mean nobody can answer in this session.
export function isPersonDeclining(res) {
  // (the whole result is read: which field carries the words isn't in the mod docs)
  const text = JSON.stringify(res ?? '')
  return /doesn't want to proceed|tool use was rejected/i.test(text)
}

// Plan mode's own moves: loading and calling ExitPlanMode, and writing its plan file
// (~/.claude/plans/*.md, outside the project). A mod can't switch plan mode off, so the engine lets
// these through and nothing else; the work itself still waits for the step's own tools
// (live check L4: Claude couldn't even hand in its plan).
export function isPlanModeMove(call) {
  if (call.tool === 'ExitPlanMode' || call.tool === 'EnterPlanMode') return true
  const input = call.input || {}
  if (call.tool === 'ToolSearch') return /^select:\s*(ExitPlanMode|EnterPlanMode)\s*$/.test(String(input.query || ''))
  if (call.tool === 'Write' || call.tool === 'Edit') return /[\\/]\.claude[\\/]plans[\\/][^\\/]+\.md$/.test(String(input.file_path || ''))
  return false
}

// Decides one tool call. Returns { allow: true } or { allow: false, why }.
// call = { tool, agentId?, input? }; opts.auto = an unattended run (nobody to answer).
export function judgeTool(p, state, call, opts = {}) {
  // (not in an auto run: leaving plan mode waits for a person's OK)
  if (!call.agentId && !opts.auto && isPlanModeMove(call)) return { allow: true }
  if (opts.auto && call.tool === 'AskUserQuestion') {
    return { allow: false, why: `BMUZ engine: auto run, nobody is here to answer. Don't ask: pick the sensible default, add {"question": "...", "picked": "..."} to the "asks" list in ${ENGINE_TOOL}'s result, and carry on.` }
  }
  // step_done only closes an open talk step; called between steps, it has nothing to finish.
  if (call.tool === ENGINE_TOOL && !call.agentId && !(state.status === 'working' && (stepById(p, state.current) || {}).kind === 'talk')) {
    return { allow: false, why: 'BMUZ engine: no talk step is open, so there is nothing to finish. End your turn; the engine starts the next step itself.' }
  }
  // Everything is open only before the pipeline starts and after it ends. Between steps (after a
  // step_done, an undo, a gate going back, a retry about to start) the engine owns the next move.
  if (state.status === 'done') return { allow: true }
  if (state.status === 'idle' && !state.current && state.finished.length === 0) return { allow: true }
  if (state.status === 'idle') return { allow: false, why: `BMUZ engine: between steps; the engine starts the next one itself. End your turn (or the creative says "bmuz go").` }
  const step = stepById(p, state.current)
  if (!step) return { allow: false, why: `BMUZ engine: no current step (state says ${state.current}); run /bmuz-doctor` }
  if (state.status === 'blocked') return { allow: false, why: `BMUZ engine: step ${step.id} is BLOCKED; nothing runs until the creative decides ("bmuz retry" for 2 more tries, or "bmuz undo" to go back)` }
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

// A step passed: it joins the finished list with its result; its retry count starts over
// (so a later re-run, after an undo or a gate going back, gets its own 2 retries and checkpoint).
export function finish(state, step, result) {
  const retries = { ...(state.retries || {}) }
  delete retries[step.id]
  return {
    ...state,
    finished: state.finished.includes(step.id) ? state.finished : [...state.finished, step.id],
    results: result ? { ...state.results, ...result } : state.results,
    resultsBy: result ? { ...(state.resultsBy || {}), [step.id]: result } : (state.resultsBy || {}),
    retries,
    flow: null, // a finished flow's launch record (and a "late" mark) must not follow the next step
    current: null,
    status: 'idle',
    startedAt: null,
  }
}

// The plain-words undo list: one line per finished step, newest first.
// Going back to before a step puts back the files it and every later step wrote (their `writes`)
// and runs them again. Changes outside `writes` (a commit, a push) are not undone; the line says so.
export function undoList(p, state) {
  const out = []
  state.finished.forEach((id, i) => {
    const s = stepById(p, id)
    if (!s) return
    const later = state.finished.slice(i).map(x => stepById(p, x)).filter(Boolean)
    const files = [...new Set(later.flatMap(x => x.writes || []))]
    const untracked = later.filter(x => (x.kind === 'script' || x.kind === 'flow') && !(x.writes || []).length).map(x => x.id)
    const what = s.description ? `${s.id} (${s.description})` : s.id
    let line = `go back to before "${what}"`
    line += files.length ? `: puts back ${files.join(', ')}` : ': no files to put back'
    line += `; runs ${later.length === 1 ? 'that step' : `${later.length} steps`} again`
    if (untracked.length) line += `; anything ${untracked.join(', ')} changed outside its files stays as it is`
    out.unshift({ step: id, line, files, redo: later.map(x => x.id) })
  })
  return out
}

// Undo: back to before `stepId`. Returns { state, redo } (redo = the steps taken off, newest first,
// the order their checkpoints are put back in), or { error } in plain words.
export function undoTo(p, state, stepId) {
  if (state.status === 'working') return { error: `step "${state.current}" is still running; undo once it has finished or is BLOCKED` }
  const i = state.finished.indexOf(stepId)
  if (i < 0) return { error: `"${stepId}" isn't a finished step; pick one of: ${state.finished.join(', ') || 'none yet'}` }
  const redo = state.finished.slice(i).reverse()
  const dropped = dropSteps(state, new Set(redo))
  return { state: { ...dropped, current: null, status: 'idle', startedAt: null, blocked: null }, redo }
}

// The creative's "try again" on a BLOCKED step: the block is lifted and the step gets 2 fresh retries.
export function unblock(state) {
  if (state.status !== 'blocked' || !state.blocked) return { error: 'nothing is BLOCKED' }
  const retries = { ...(state.retries || {}) }
  delete retries[state.blocked.step]
  return { state: { ...state, retries, status: 'idle', current: null, startedAt: null, blocked: null }, step: state.blocked.step }
}

export function begin(state, step, now) {
  const status = step.kind === 'gate' ? 'waiting' : 'working'
  return { ...state, current: step.id, status, startedAt: now }
}

// Gate answer: the `approve` option approves; any other sends the creative back to
// the step named in `step.backTo` (its result cleared).
export function answerGate(p, state, step, answer) {
  if (answer === step.approve) return { state: finish(state, step), approved: true }
  const back = step.backTo
  if (!back) return { state, approved: false }
  // the step and everything that needs it, directly or through other steps
  const drop = new Set([back])
  for (let grew = true; grew;) {
    grew = false
    for (const s of p.steps) if (!drop.has(s.id) && (s.needs || []).some(n => drop.has(n))) { drop.add(s.id); grew = true }
  }
  return { state: { ...dropSteps(state, drop), current: null, status: 'idle', startedAt: null }, approved: false }
}

// TaskStop's answer when the task had already finished (proof run 9: "not running (completed)").
export function taskAlreadyEnded(text) {
  return /not running|already (finished|completed|stopped)|\(completed\)/i.test(String(text || ''))
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
  // The clock counts only while something is running (Muzzy 2026-11-09: a clock still ticking on BLOCKED
  // read as "it's doing something").
  const timed = state.status === 'working' && typeof state.startedAt === 'number'
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
    // A starting point: a state the journal didn't see being made (kept from a state file when the
    // journal was empty). Everything before it is replaced by it.
    if (j.ev === 'baseline' && j.state) s = { ...freshState(pipelineId), ...j.state }
    if (j.ev === 'step.start') s = { ...s, current: j.step, status: j.kind === 'gate' ? 'waiting' : 'working', startedAt: j.t }
    if (j.ev === 'step.done') s = finish(s, { id: j.step }, j.result || null)
    if (j.ev === 'retry') s = { ...s, retries: { ...s.retries, [j.step]: (s.retries[j.step] || 0) + 1 } }
    if (j.ev === 'gate.back') s = { ...dropSteps(s, new Set(j.dropped || [])), current: null, status: 'idle', startedAt: null }
    if (j.ev === 'undo') s = { ...dropSteps(s, new Set(j.redo || [])), current: null, status: 'idle', startedAt: null, blocked: null }
    if (j.ev === 'blocked') s = { ...s, status: 'blocked', blocked: { step: j.step, why: j.why }, retries: { ...s.retries, [j.step]: MAX_RETRIES + 1 } }
    if (j.ev === 'unblock') s = unblock(s).state || s
    if (j.ev === 'pipeline.done') s = { ...s, status: 'done', current: null, startedAt: null }
  }
  return s
}

// The parts of the state the journal decides; the doctor compares only these.
// Retries too: a crash between the journal's "retry" line and the state write must not hand out a free try.
const decided = s => JSON.stringify({ finished: s.finished, current: s.current, status: s.status, blocked: s.blocked && s.blocked.step, results: s.results, retries: s.retries || {} })

// Doctor: checks "where are we" against the journal, and says what went wrong, in plain words.
// stateText = .bmuz/state.json as read (null = missing). Returns { lines, state, fixed }:
// `state` is the one to keep (the journal's when they disagree), `fixed` says it changed.
export function doctor(p, stateText, journalLines, lock, sessionId, now) {
  const lines = []
  const rebuilt = rebuildFromJournal(p.id, journalLines)
  let kept = null
  if (stateText === null) lines.push('The state file was missing: rebuilt it from the journal.')
  else {
    try { kept = JSON.parse(stateText) } catch (err) { lines.push('The state file was damaged (not JSON): rebuilt it from the journal.') }
  }
  const events = journalLines.filter(l => l.trim()).map(l => { try { return JSON.parse(l) } catch (err) { return null } })
  const torn = events.filter(x => x === null).length
  if (torn) lines.push(`${torn} journal line${torn > 1 ? 's were' : ' was'} unreadable and skipped.`)
  let fixed = !kept
  const anyEvents = events.some(x => x && x.ev)
  // `baseline` = the caller should journal the kept state as a starting point, so a later rebuild
  // starts from it instead of redoing steps the journal never saw (headless check 3 found this).
  let baseline = false
  if (kept && !anyEvents) {
    if (kept.finished && kept.finished.length) lines.push('The journal is empty: kept the state file as it is.')
    baseline = (kept.finished && kept.finished.length > 0) || !!kept.current
  } else if (kept && decided(kept) !== decided(rebuilt)) {
    lines.push(`The state file disagreed with the journal (state: ${kept.status} at ${kept.current || 'no step'}, ${kept.finished.length} finished; journal: ${rebuilt.status} at ${rebuilt.current || 'no step'}, ${rebuilt.finished.length} finished): went with the journal.`)
    fixed = true
  }
  const state = fixed ? { ...rebuilt, flow: kept && kept.flow } : kept
  if (lock && lock.step && !lock.closed && lock.session !== sessionId) lines.push(`The last session (${String(lock.session).slice(0, 8)}) ended without closing, during step "${lock.step}" (${lock.status}).`)
  if (state.status === 'blocked' && state.blocked) lines.push(`Step "${state.blocked.step}" is BLOCKED: ${state.blocked.why}. Say "bmuz retry" to give it 2 more tries, or "bmuz undo" to go back further.`)
  for (const [id, n] of Object.entries(state.retries || {})) if (n && !(state.blocked && state.blocked.step === id)) lines.push(`Step "${id}" has used ${n} of its ${MAX_RETRIES} retries.`)
  const devs = events.filter(x => x && x.ev === 'deviation')
  if (devs.length) {
    lines.push(`${devs.length} out-of-order action${devs.length > 1 ? 's were' : ' was'} refused; the last ${Math.min(5, devs.length)}:`)
    for (const d of devs.slice(-5)) lines.push(`  - in step "${d.step}": ${d.tool}${d.agentId ? ' (a helper)' : ''}`)
  }
  const fails = events.filter(x => x && (x.ev === 'watchdog.restart-failed' || x.ev === 'watchdog.stop-failed' || x.ev === 'crash.detected'))
  for (const f of fails.slice(-3)) lines.push(`Earlier trouble: ${f.ev} at step "${f.step || f.lockStep}".`)
  if (!lines.length) lines.push('All good: the state file matches the journal and nothing went wrong.')
  lines.unshift(`BMUZ doctor · ${bandText(p, state, now)}`)
  return { lines, state, fixed, baseline }
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
