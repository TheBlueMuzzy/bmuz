// BMUZ engine core: pure logic, no Claude Code API. The mod (register.ts),
// motor B (bin/bmuz.mjs) and the no-Claude tests all use this one file.

export const KINDS = ['talk', 'gate', 'script', 'flow']
export const MAX_RETRIES = 2
export const ENGINE_TOOL = 'mcp__bmuz__step_done'

// The pipeline file format this engine reads (docs/pipeline-format.md).
export const FORMAT_VERSION = 1
// Pipeline ids, step ids and pipeline names in bmuz.json: lower case, digits, dashes.
export const NAME_RE = /^[a-z][a-z0-9-]*$/
const TOP_KEYS = ['id', 'version', 'description', 'watchdogMs', 'next', 'steps']
// "next": the stage that follows this pipeline (docs/pipeline-format.md, "Stages").
const NEXT_KEYS = ['pipeline', 'at', 'carry', 'ask']

// ---- Stages (F225, F228; framework research/bmuz-vision/stages.md): one project runs them in order, each a
// pipeline named like its stage. Muzzy 2026-11-10: "Ideate > Define > Design > Develop > Deliver > Release with
// research being callable anywhere." Ideate GATHERS the material (nothing chosen), Define MAKES the blocks ("which
// one is it?"), Design ASSEMBLES them, Develop makes the production model, Deliver makes it ready to hand over,
// Release lets the public experience it. Intros in Muzzy's wording (entry-research.md 2026-11-09, stages.md).
// Discover is no longer a stage: its pipeline file stays on disk (its research flow becomes F229 — Research).
// forNow: what to use while a stage isn't on the engine yet (its pipeline file doesn't exist).
export const STAGES = [
  { id: 'ideate', name: 'Ideate', intro: "We're in Ideate: gathering the material — your loose idea, captured. Show me everything you have; I'll read all of it and write back the game so far: what's already fixed, the ideas you have, and what's still open. Then a few questions about the gaps only — nothing gets chosen here; that's Define." },
  { id: 'define', name: 'Define', intro: "We're in Define: making the blocks from the game so far — for each part of the game, which one is it? One answer each: what's fixed is one tap to keep, your ideas are the options, and only what's open is asked. It ends with one page, the concept." },
  { id: 'design', name: 'Design', intro: "We're in Design: assembling the blocks in whatever way feels right — cutting some, tweaking others — into rules and systems, tested with sketches and paper playtests. It ends with the blueprint: the full design and the build plan.", feature: 'F227 — Design pipeline', forNow: "today's /define skill for the design work (rules, systems, the rest of the GDD), then /develop" },
  { id: 'develop', name: 'Develop', intro: "We're in Develop: building the production model from the blueprint, in short sprints you play and approve one piece at a time.", forNow: 'today\'s /develop skill' },
  { id: 'deliver', name: 'Deliver', intro: "We're in Deliver: making the finished product ready to hand over — final checks, polish, versions, and a build for each platform.", feature: 'F219 — Deliver pipeline', forNow: "today's /deliver skill (nothing is renamed until F226)" },
  { id: 'release', name: 'Release', intro: "We're in Release: letting the public start experiencing it — the launch, the live link, and players' first reactions.", feature: 'F230 — Release pipeline', forNow: "today's /deliver skill (nothing is renamed until F226)" },
]
export const stageOf = id => STAGES.find(s => s.id === id) || null
// A "next" that names one of these means "no stage now" (the start's "Not now": the creative starts later).
export const NO_STAGE = ['later', 'none', '']

// The engine's words when a stage isn't on the engine yet (its pipeline file is missing).
export function notOnEngineLine(id) {
  const s = stageOf(id)
  if (!s) return `"${id}" isn't a stage (the stages are ${STAGES.map(x => x.id).join(', ')})`
  return `${s.name} isn't on the BMUZ engine yet${s.feature ? ` (it comes with ${s.feature})` : ''}. For now use ${s.forNow || 'the matching /command'}`
}

// The filled "next" of a finished pipeline: { pipeline, at, carry, ask } or null (no next, or "not now").
// A {hole} fills from the run's results; a hole a wrap-up left empty means no next.
export function nextOf(p, results = {}) {
  const n = p && p.next
  if (!n || typeof n !== 'object') return null
  const one = v => (typeof v === 'string' ? fill(v, results).trim() : '')
  const pipeline = one(n.pipeline)
  if (NO_STAGE.includes(pipeline) || /\{\w+\}/.test(pipeline)) return null
  // ("first" = the stage's first step, the usual way in)
  const at = one(n.at)
  return { pipeline, at: at && at !== 'first' && !/\{\w+\}/.test(at) ? at : null, carry: n.carry || null, ask: n.ask !== false }
}

// Starts a pipeline at a named step (F225): every step above it counts as finished and SKIPPED ("done by
// material"), except "always" steps, which still run. A skipped talk step's keys are filled from `given`
// (what the intake found), else null, so a later {hole} fills as nothing and never as "{hole}".
// `given` is kept in the state: a later talk step whose keys it answers shows them as already chosen.
// Returns { state, skipped } or { error } in plain words.
export function enterAt(p, state, at, given = {}) {
  const g = given && typeof given === 'object' && !Array.isArray(given) ? given : {}
  if (!at) return { state: { ...state, given: g, entered: null }, skipped: [] }
  const i = p.steps.findIndex(s => s.id === at)
  if (i < 0) return { error: `"${at}" isn't a step of ${p.id} (its steps: ${p.steps.map(s => s.id).join(', ')})` }
  const skipped = p.steps.slice(0, i).filter(s => !s.always).map(s => s.id)
  const empties = {}
  for (const id of skipped) {
    const s = stepById(p, id)
    const keys = resultKeysOf(s)
    empties[id] = Object.fromEntries(keys.map(k => [k, g[k] !== undefined && g[k] !== '' ? g[k] : null]))
  }
  return { state: { ...applyWrap(state, skipped, empties), given: g, entered: { at, skipped } }, skipped }
}

// The part of `given` a talk step's own keys answer (empty lists and texts left out).
export function givenFor(step, given) {
  if (!given || step.kind !== 'talk') return {}
  const keys = [...(step.results || []), ...(step.done && step.done.key ? [step.done.key] : [])]
  const has = v => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length)
  return Object.fromEntries(keys.filter(k => has(given[k])).map(k => [k, given[k]]))
}
const STEP_KEYS = {
  // always: the step still runs when the creative wraps up early (a talk step's "wrapTo")
  // retries: how many times a failed step runs again before it BLOCKS (0..MAX_RETRIES, default MAX_RETRIES);
  // 0 for a step whose refusal is a verdict, not a flake (Define's stage: running it again says the same)
  // when: "{key}" — the step runs only when that earlier talk result says yes (F218: research offered, never forced);
  // otherwise it is skipped like a wrapped-up step (it counts as finished and hands back nothing)
  // no + title (F232): the script's step number ("2.3") and name ("The Pitch"), for the band ("Define · 3 of 8 · The
  // Pitch"); onBack: the step runs only when a gate sent the creative back to it (Define's Concept Lock "Not yet")
  common: ['id', 'kind', 'needs', 'description', 'timeoutMs', 'always', 'retries', 'when', 'no', 'title', 'onBack'],
  // lines (F232): the script lines the step may say (plugin/script.md); opening: the ones it must say first;
  // must: the ones it always says, so step_done is refused until each was handed out (the rest depend on the game)
  talk: ['tools', 'craft', 'done', 'writes', 'handoff', 'results', 'wrapTo', 'recap', 'lines', 'opening', 'must'],
  // line (F232): the gate's question and options come from that script box
  gate: ['question', 'options', 'approve', 'backTo', 'line', 'auto'],
  // show: a .md file the script wrote; after the step passes, the engine shows it to the creative word for word
  // in a turn of its own (F228: Ideate's "the game so far"), then goes on
  // loop (F216): the step runs another pipeline once per item its script names, each run a kept side trip (Develop's
  // feature runs); the step finishes when the script names none
  // results (F216 review fix 11): keys the script hands back in its last line of JSON ({"results": {…}}), for a later "when"
  script: ['run', 'writes', 'done', 'show', 'loop', 'results'],
  // stuck (F216): a .md file the done-check writes when the step is stuck twice; said before the last try
  // protect (F216 review fix 2b): true = its helpers can't change the plan files, package.json's scripts, or empty a test
  flow: ['workflow', 'args', 'agentTools', 'writes', 'craft', 'done', 'stuck', 'protect'],
}
const DONE_KEYS = {
  'result-has': ['type', 'key'],
  'file-contains': ['type', 'path', 'text'],
  'file-json-has': ['type', 'path', 'key'],
  // A command the engine runs after the step (like the research flow's source check): passes on exit 0.
  'script-ok': ['type', 'run'],
}
// (F216: {auto} is "auto" in an auto run, else "live": a script that must never answer for the creative needs to know)
const BUILT_IN_HOLES = ['project', 'plugin', 'auto']

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

// A script step's "show" file: inside the project, or (F215 review fix 8) one of the bug pipeline's own lines in
// .bmuz/bug/, which the engine's scripts write so nothing of a fix run is left in the creative's project; (F216) and
// Develop's lines in .bmuz/develop/, written by sprint.mjs; (F219) Deliver's in .bmuz/deliver/, written by deliver.mjs;
// (F230) Release's in .bmuz/release/, written by launch.mjs.
export function isShowPath(path) {
  return isSafePath(path) || /^\.bmuz\/(bug|develop|deliver|release)\/[a-z0-9-]+\.md$/.test(String(path))
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
  if (p.next !== undefined) problems.push(...nextProblems(p))

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
        else if (isPattern(f) && f.split('/').slice(0, -1).some(p => p.includes('*'))) problems.push(`${at}: "writes" path "${f}" may have a * only in its file name, like content/data/*.json`)
        // (a {hole} in a "writes" path is checked below, once the step's known holes are worked out)
      }
    }
    if (s.results !== undefined && !(isList(s.results) && s.results.every(k => /^\w+$/.test(k)))) problems.push(`${at}: "results" must be a list of result keys (letters, digits, _)`)
    // (F216 review fix 8: a result key may never stand in for one of the engine's own holes)
    for (const k of isList(s.results) ? s.results.filter(k => BUILT_IN_HOLES.includes(k)) : []) problems.push(`${at}: result key "${k}" is one of the engine's own holes ({${BUILT_IN_HOLES.join('}, {')}}); name it something else`)
    if (s.results !== undefined && s.kind !== 'talk' && s.kind !== 'script') problems.push(`${at}: only talk and script steps hand back a result, so "results" can't be on a ${s.kind} step`)
    if (s.done !== undefined) {
      const d = s.done
      const keys = d && DONE_KEYS[d.type]
      if (!keys) problems.push(`${at}: done-check type "${d && d.type}" is not one of ${Object.keys(DONE_KEYS).join(', ')}`)
      else {
        for (const k of Object.keys(d)) if (!keys.includes(k)) problems.push(`${at}: done-check "${d.type}" has an unknown setting "${k}"`)
        if (d.type === 'script-ok') {
          if (!isList(d.run) || d.run.length === 0) problems.push(`${at}: done-check "script-ok" needs "run": the command as a list, like ["node", "{plugin}/scripts/check.mjs"]`)
        } else for (const k of keys.slice(1)) if (typeof d[k] !== 'string' || !d[k]) problems.push(`${at}: done-check "${d.type}" needs "${k}"`)
        if (typeof d.path === 'string' && d.path && !isSafePath(d.path)) problems.push(`${at}: done-check path "${d.path}" must stay inside the project`)
        if (d.type === 'result-has' && s.kind !== 'talk') problems.push(`${at}: only talk steps hand back a result, so "result-has" can't check a ${s.kind} step`)
      }
    }
    if (s.always !== undefined && typeof s.always !== 'boolean') problems.push(`${at}: "always" must be true or false`)
    if (s.retries !== undefined && !(Number.isInteger(s.retries) && s.retries >= 0 && s.retries <= MAX_RETRIES)) problems.push(`${at}: "retries" must be a whole number from 0 to ${MAX_RETRIES}`)
    if (s.kind === 'talk') {
      if (s.handoff !== undefined && typeof s.handoff !== 'boolean') problems.push(`${at}: "handoff" must be true or false`)
      // (wrapTo must name a LATER step: checked once every step is known, below)
      if (s.wrapTo !== undefined && (typeof s.wrapTo !== 'string' || !NAME_RE.test(s.wrapTo))) problems.push(`${at}: "wrapTo" must be a later step's id`)
      if (s.recap !== undefined && !(isList(s.recap) && s.recap.every(k => /^\w+$/.test(k)))) problems.push(`${at}: "recap" must be a list of result keys from earlier steps`)
      if (!isList(s.tools)) problems.push(`${at} (talk) needs "tools": the list of tools Claude may use in it`)
      if (!s.craft) problems.push(`${at} (talk) needs a "craft" note telling Claude what to do`)
    }
    if (s.no !== undefined && !(typeof s.no === 'string' && /^\d+\.\d+$/.test(s.no))) problems.push(`${at}: "no" must be the script's step number, like "2.3"`)
    if (s.title !== undefined && !(typeof s.title === 'string' && s.title.trim())) problems.push(`${at}: "title" must be the step's name, like "The Pitch"`)
    if (s.onBack !== undefined && typeof s.onBack !== 'boolean') problems.push(`${at}: "onBack" must be true or false`)
    if (s.lines !== undefined && !(isList(s.lines) && s.lines.every(id => /^[a-z][a-z0-9.-]*$/.test(id)))) problems.push(`${at}: "lines" must be a list of script line ids, like ["define.pitch"]`)
    if (s.opening !== undefined && !(isList(s.opening) && s.opening.length)) problems.push(`${at}: "opening" must be a list of the line ids the step says first`)
    if (s.must !== undefined) {
      if (!(isList(s.must) && s.must.length)) problems.push(`${at}: "must" must be a list of the line ids the step always says`)
      else for (const id of s.must) if (!(s.lines || []).includes(id)) problems.push(`${at}: "must" line "${id}" isn't one of the step's "lines"`)
    }
    if (s.kind === 'gate' && s.line !== undefined) {
      if (typeof s.line !== 'string' || !/^[a-z][a-z0-9.-]*$/.test(s.line)) problems.push(`${at} (gate): "line" must be a script box id`)
      if (s.question !== undefined || s.options !== undefined) problems.push(`${at} (gate): a gate with a script "line" takes its question and options from it; leave out "question" and "options"`)
      if (typeof s.approve !== 'string' || !s.approve) problems.push(`${at} (gate) needs "approve": the box's option that says yes, word for word`)
      if (s.backTo !== undefined && !byId.has(s.backTo)) problems.push(`${at} (gate): "backTo" "${s.backTo}" is not an earlier step`)
    } else if (s.kind === 'gate') {
      if (typeof s.question !== 'string' || !s.question.trim()) problems.push(`${at} (gate) needs a "question"`)
      if (!isList(s.options) || s.options.length < 2) problems.push(`${at} (gate) needs 2 or more "options"`)
      else if (new Set(s.options).size !== s.options.length) problems.push(`${at} (gate): two options have the same words`)
      // The first option is the one a stray Enter picks, so it must be the safe one (live check L1).
      else if (typeof s.approve !== 'string' || !s.options.includes(s.approve)) problems.push(`${at} (gate) needs "approve": the option that says yes, word for word`)
      else if (s.options[0] === s.approve) problems.push(`${at} (gate): "${s.approve}" can't be the first option; a stray Enter would approve it. Put the safe choice first`)
      if (s.backTo !== undefined && !byId.has(s.backTo)) problems.push(`${at} (gate): "backTo" "${s.backTo}" is not an earlier step`)
    }
    if (s.kind === 'gate' && s.auto !== undefined && !['stop', 'carry'].includes(s.auto)) problems.push(`${at} (gate): "auto" must be "stop" (an auto run stops at the gate, the default) or "carry" (it notes the question and carries on with the plan as it stands)`)
    if (s.kind === 'script' && s.loop !== undefined && !(typeof s.loop === 'string' && NAME_RE.test(s.loop))) problems.push(`${at} (script): "loop" must be the name of the pipeline it runs for each item, like "feature"`)
    if (s.kind === 'flow' && s.protect !== undefined && typeof s.protect !== 'boolean') problems.push(`${at} (flow): "protect" must be true or false`)
    if (s.kind === 'flow' && s.stuck !== undefined && !(isShowPath(s.stuck) && s.stuck.endsWith('.md'))) problems.push(`${at} (flow): "stuck" must be a .md file the done-check writes, like .bmuz/develop/say-stuck.md`)
    if (s.show !== undefined && !(isShowPath(s.show) && s.show.endsWith('.md') && !/\{/.test(s.show))) problems.push(`${at}: "show" must be a .md file inside the project with no {holes}, like .planning/research/so-far.md`)
    if (s.when !== undefined && !(typeof s.when === 'string' && /^\{\w+\}$/.test(s.when))) problems.push(`${at}: "when" must be one {hole}: a result of a talk step this step needs, like "{priorArt}"`)
    if (s.kind === 'script' && (!isList(s.run) || s.run.length === 0)) problems.push(`${at} (script) needs "run": the command as a list, like ["node", "{plugin}/scripts/x.mjs"]`)
    if (s.kind === 'flow') {
      if (typeof s.workflow !== 'string' || !/^[a-z0-9-]+:[a-z0-9-]+$/.test(s.workflow)) problems.push(`${at} (flow) needs "workflow" as plugin:name, like bmuz:hello-flow`)
      if (s.args !== undefined && (!s.args || typeof s.args !== 'object' || Array.isArray(s.args))) problems.push(`${at} (flow): "args" must be an object`)
      if (s.agentTools !== undefined && !isList(s.agentTools)) problems.push(`${at} (flow): "agentTools" must be a list of tool names`)
    }
    // {holes} may name the project, the plugin, or a result an earlier talk step this one needs hands back.
    const known = new Set(BUILT_IN_HOLES)
    const listed = new Set() // keys named in a needed talk step's "results": the only holes a "writes" path may use
    const seen = new Set()
    const walk = id => {
      if (seen.has(id) || !byId.has(id)) return
      seen.add(id)
      const n = byId.get(id)
      if (n.kind === 'talk' && n.done && n.done.type === 'result-has') known.add(n.done.key)
      if ((n.kind === 'talk' || n.kind === 'script') && isList(n.results)) for (const k of n.results) { known.add(k); listed.add(k) }
      for (const m of Array.isArray(n.needs) ? n.needs : []) walk(m)
    }
    for (const n of Array.isArray(s.needs) ? s.needs : []) walk(n)
    // (F215: a talk step's own done-check may use its own results: the bug pipeline's "reproduce" runs the test it wrote)
    if (s.kind === 'talk' && isList(s.results)) for (const k of s.results) known.add(k)
    const filled = { question: s.question, run: s.run, args: s.args, path: s.done && s.done.path, text: s.done && s.done.text, check: s.done && s.done.run, when: s.when }
    for (const h of new Set(holesIn(filled))) if (!known.has(h)) problems.push(`${at}: {${h}} isn't known here (known: ${[...known].map(k => `{${k}}`).join(', ')}); a result comes from a talk step this step needs`)
    // A recap shows earlier results in the step's prompt: each key must be one a needed talk step hands back.
    for (const k of isList(s.recap) ? s.recap : []) if (!known.has(k) || BUILT_IN_HOLES.includes(k)) problems.push(`${at}: "recap" key "${k}" isn't a result of a talk step this step needs`)
    // A file the engine may delete can be named by a result only when that result is checked as a slug
    // (resultProblems): a "writes" hole must be a key in a needed talk step's "results".
    for (const f of isList(s.writes) ? s.writes : []) {
      for (const h of new Set(holesIn(f))) if (!listed.has(h)) problems.push(`${at}: "writes" path "${f}" can use only {holes} a needed talk step lists in "results" (their values are checked as slugs); {${h}} isn't one`)
    }
    if (typeof s.id === 'string' && !byId.has(s.id)) byId.set(s.id, s)
  })
  // Wrapping up jumps forward, never back: "wrapTo" names a step below this one.
  const ids = p.steps.map(s => s && s.id)
  p.steps.forEach((s, i) => {
    if (!s || typeof s.wrapTo !== 'string' || !NAME_RE.test(s.wrapTo)) return
    const j = ids.indexOf(s.wrapTo)
    if (j <= i) problems.push(`step "${s.id}": "wrapTo" "${s.wrapTo}" is not a later step`)
  })
  return problems
}

// What is wrong with a pipeline's "next" (empty = fine). A {hole} must be a result some talk step hands back.
function nextProblems(p) {
  const n = p.next
  if (!n || typeof n !== 'object' || Array.isArray(n)) return ['"next" must be an object like {"pipeline": "define"}']
  const out = []
  for (const k of Object.keys(n)) if (!NEXT_KEYS.includes(k)) out.push(`"next" has an unknown setting "${k}" (allowed: ${NEXT_KEYS.join(', ')})`)
  const hole = v => typeof v === 'string' && /^\{\w+\}$/.test(v)
  if (!(typeof n.pipeline === 'string' && (hole(n.pipeline) || NAME_RE.test(n.pipeline)))) out.push('"next" needs "pipeline": a stage like "define", or one {hole} a talk step hands back')
  else if (!hole(n.pipeline) && !stageOf(n.pipeline)) out.push(`"next" pipeline "${n.pipeline}" isn't a stage (${STAGES.map(s => s.id).join(', ')})`)
  if (n.at !== undefined && !(typeof n.at === 'string' && (hole(n.at) || NAME_RE.test(n.at)))) out.push('"next" "at" must be a step id of the next pipeline, or one {hole}')
  if (n.carry !== undefined && !(isSafePath(n.carry) && n.carry.endsWith('.json'))) out.push('"next" "carry" must be a .json file inside the project, like .planning/research/intake.json')
  if (n.ask !== undefined && typeof n.ask !== 'boolean') out.push('"next" "ask" must be true or false')
  const known = new Set((Array.isArray(p.steps) ? p.steps : []).filter(Boolean).flatMap(resultKeysOf))
  for (const h of new Set(holesIn([n.pipeline, n.at]))) if (!known.has(h)) out.push(`"next": {${h}} isn't a result any talk step hands back`)
  return out
}

// Plugin files a pipeline names (craft notes); the caller checks they exist.
export function pluginFiles(p) {
  return (Array.isArray(p && p.steps) ? p.steps : []).filter(s => s && typeof s.craft === 'string' && isSafePath(s.craft)).map(s => s.craft)
}

export function freshState(pipelineId) {
  return { pipeline: pipelineId, current: null, status: 'idle', results: {}, resultsBy: {}, retries: {}, finished: [], skipped: [], blocked: null, startedAt: null }
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
  const out = { ...state, finished, resultsBy, retries, ask: null, boxes: [], opened: null, said: null, results: state.resultsBy ? mergeResults(finished, resultsBy) : state.results }
  // A skipped step taken off the finished list runs for real next time.
  if (state.skipped) out.skipped = state.skipped.filter(id => !drop.has(id))
  return out
}

// ---- Wrapping up early (a talk step's "wrapTo") ----
// The creative may wrap up after a step: everything collected so far is kept, and the run jumps to the
// "wrapTo" step (Discover's brick board). The steps in between are SKIPPED: they count as finished, so
// later steps that need them can run, but they hand back nothing. A step marked "always" still runs.

// The steps a wrap from `step` skips: every unfinished step after it and before its wrapTo, except "always" ones.
export function wrapSkips(p, state, step) {
  const from = p.steps.indexOf(step)
  const to = p.steps.findIndex(s => s.id === step.wrapTo)
  if (from < 0 || to <= from) return []
  return p.steps.slice(from + 1, to).filter(s => !state.finished.includes(s.id) && !s.always).map(s => s.id)
}

// The result keys a skipped step would have handed back, as empty (null) where no earlier step gave them:
// a later {hole} naming one fills in as nothing (text "" / a flow arg null), never as the "{hole}" itself.
export function wrapEmpties(p, state, skipped) {
  const out = {}
  for (const id of skipped) {
    const s = stepById(p, id)
    const keys = resultKeysOf(s)
    out[id] = Object.fromEntries(keys.filter(k => state.results[k] === undefined).map(k => [k, null]))
  }
  return out
}

// Marks steps skipped (used by the motor and by the journal rebuild, so both end the same).
export function applyWrap(state, skipped, empties = {}) {
  const resultsBy = { ...(state.resultsBy || {}) }
  let results = { ...state.results }
  for (const id of skipped) {
    resultsBy[id] = empties[id] || {}
    results = { ...resultsBy[id], ...results }
  }
  return {
    ...state,
    finished: [...state.finished, ...skipped.filter(id => !state.finished.includes(id))],
    skipped: [...new Set([...(state.skipped || []), ...skipped])],
    resultsBy,
    results,
  }
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
// decided = the project's decisions list (a hand-off step is told them, so it doesn't ask them again).
// more.recap = earlier results to show (the step's "recap" keys); more.wrap = { next, to }: the words for the
// wrap-up question when the step has "wrapTo".
export function talkPrompt(step, craft, why, auto, decided = [], more = {}) {
  const lines = [`BMUZ step "${step.id}" — this message comes from the BMUZ engine, not the creative; do the step without commenting on the engine.`]
  if (why) lines.push(`The last try did not pass: ${why}.`)
  if (auto) lines.push(`Auto run: the creative is away. Never ask and never wait for an answer, with AskUserQuestion or in plain text. Where you would ask, pick the sensible default, list it in the result's "asks" as {"question": "...", "picked": "..."}, and carry on.${step.lines ? ` Every script line this step would say is still said: call ${SAY_TOOL} for it and write its words, exactly where a live run would say it (a free question or a box included), then take the answer and carry on.` : ''}`)
  else lines.push(step.lines ? SCRIPT_RULE : ASK_RULE)
  lines.push(STEP_IN_RULE)
  // F232: the step's script lines, and the ones it opens with (said before anything else).
  if (step.lines && more.script) {
    lines.push(`This step's script lines (say them through ${SAY_TOOL}, filling the slots from the game so far and the creative's own words):\n${linesList(more.script, step.lines)}`)
    if (step.opening && !more.opened) lines.push(`Open the step with ${SAY_TOOL} {"line": ${JSON.stringify(step.opening.length === 1 ? step.opening[0] : step.opening)}} before anything else.`)
  }
  if (more.back) lines.push(`The creative answered "${more.back.answer}" at "${more.back.question}", so this step runs again: ask what they want changed (their next message), make the change in the result, and finish.`)
  // The recap carries what earlier steps collected, so the step works the same after a new session or a
  // compacted chat (the conversation alone would forget it).
  const recap = Object.fromEntries(Object.entries(more.recap || {}).filter(([, v]) => v !== undefined && v !== null))
  if (Object.keys(recap).length) lines.push(`Collected so far by earlier steps (build on it; don't ask it again): ${JSON.stringify(recap)}`)
  if (more.intro) lines.push(`The engine already showed the creative this stage's short intro with this step's message; don't repeat or rephrase it. Start the step.`)
  // F225: what the creative's own material already answers (the start's intake), shown first, one tap to keep.
  if (more.given && Object.keys(more.given).length) lines.push(`Already chosen in the creative's own material (the start's intake read it; "his": true marks their exact words): ${JSON.stringify(more.given)}. For these keys, show what their material says first and ask once, with "Keep" as the first option and "Change" second: Keep hands those items back exactly as given (one tap). Ask the usual questions only for the keys their material leaves open. These are the creative's own choices, so in an auto run (or when a test run's answers don't touch them) keep them.`)
  // A test run's stand-in for the creative (bmuz.json "testAnswers", only with BMUZ_TEST=1: testAnswersProblem).
  if (more.answers !== undefined && more.answers !== null) lines.push(`Test run: these are the creative's own answers to this step's questions, as if they had typed them in the chat: ${JSON.stringify(more.answers)}. Treat them exactly as the creative's words ({"text": "...", "his": true}; a brick they named keeps its id). They replace the auto run's rule for the keys they answer; don't ask anything.`)
  lines.push(craft)
  const result = {}
  for (const k of step.results || []) result[k] = '...'
  if ((step.done && step.done.key) || !(step.results || []).length) result[(step.done && step.done.key) || 'ok'] = '...'
  if (step.handoff) {
    // The engine writes the card from these words (docs/handoff-card.md); Claude doesn't write it in the chat.
    result.card = { title: '...', done: '...', see: '...', try: '...', proof: ['...'], todos: 'none', questions: [], next: '...' }
    lines.push(`This step hands back to the creative: put the hand-off card's words in the result's "card" (every part filled; "none" where there is nothing). Don't write the card in the chat: the engine shows it. Questions go in "questions" as {"key": "short-slug", "q": "...?", "kind": "taste" | "want" | "choice", "options": ["..."]}: taste = how it looks, feels or plays (no "pick": the creative's view comes first); want / choice may add "pick" (one of the options). Engineering calls are yours: decide them and say why in "done", never ask.`)
    if (decided.length) lines.push(`Already decided (use these, never ask them again): ${decided.map(d => `${d.key} = ${d.answer}`).join('; ')}.`)
  }
  // (a step with script lines asks its own way on: its boxes are the script's, never the engine's wrap-up words)
  if (step.wrapTo && more.wrap && !step.lines) {
    // The same words at every step, from the engine, so wrapping up is always offered the same way.
    lines.push(auto
      ? `Wrap-up: in an auto run keep going (leave "wrap" out of the result).`
      : `Wrap-up: the creative may wrap up at any point. When this step's own questions are done, ask one more with AskUserQuestion: "Keep going (next: ${more.wrap.next}), or wrap up now (what's collected is saved, then ${more.wrap.to})?" with the options "Keep going" first and "Wrap up". If they wrap up, here or earlier in their own words, finish the step with what you have and add "wrap": true to the result.`)
  } else if (step.wrapTo && step.lines) lines.push(`Jumping ahead: when the creative's answer skips the rest of this stage (the craft note says which), add "wrap": true to the result.`)
  // (headless define 2026-11-10: haiku copied the "..." placeholders' shape and handed every list back as one string —
  // a 5-line story as one line, pillars without their "settles")
  if ((step.results || []).length) lines.push('The "..." values below only name the keys: give each value the shape the note above asks for — a JSON list where it says list, an object where it says object — never a list or an object written out as text.')
  lines.push(`When it is done, call ${ENGINE_TOOL} with result ${JSON.stringify(result)} and end your turn.`)
  return lines.join('\n')
}

// ---- Test answers (bmuz.json "testAnswers": BMUZ's own tests only) ----
// A pipeline whose talk steps choose (Define: taste, so an auto run chooses nothing) can't be run end to end
// headless unless something stands in for the creative. "testAnswers" = { <talk step id>: <the creative's
// answers> } is that stand-in. It is refused unless the session runs with BMUZ_TEST=1 (the test harness sets
// it), so a real project can't have its choices made for it by a stray setting.
// Returns null when fine, else the plain-words problem.
export function testAnswersProblem(cfg, testEnv) {
  if (!cfg || cfg.testAnswers === undefined) return null
  if (testEnv !== '1') return 'bmuz.json has "testAnswers", a setting for BMUZ\'s own tests only (it answers talk steps in the creative\'s place); it works only when BMUZ_TEST=1. Take it out of bmuz.json'
  const a = cfg.testAnswers
  if (!a || typeof a !== 'object' || Array.isArray(a) || !Object.keys(a).every(k => NAME_RE.test(k))) return 'bmuz.json "testAnswers" must be an object of talk step ids, like {"direction": "..."}'
  return null
}

// A stage-switch plan (.bmuz/switch.json) names folders that get files copied in and files that get deleted, and
// it can be hand-edited or damaged: every value is re-checked right before the engine acts on it (a "../" in a
// checkpoint name would otherwise delete a file outside the project). Returns null when fine, else the problem.
export function switchProblem(sw) {
  if (!sw || typeof sw !== 'object') return 'the stage-switch plan is not an object'
  if (typeof sw.from !== 'string' || !NAME_RE.test(sw.from)) return 'its "from" is not a stage name'
  if (typeof sw.to !== 'string' || !NAME_RE.test(sw.to)) return 'its "to" is not a stage name'
  if (!(Number.isInteger(sw.n) && sw.n > 0)) return 'its "n" is not a whole number above 0'
  if (sw.archive !== `stages/${sw.n}-${sw.from}`) return `its "archive" is not stages/${sw.n}-${sw.from}`
  if (!Array.isArray(sw.checkpoints) || !sw.checkpoints.every(f => typeof f === 'string' && /^checkpoint-[a-z][a-z0-9-]*\.json$/.test(f))) return 'its "checkpoints" are not all checkpoint-<step>.json names'
  if (sw.at !== null && sw.at !== undefined && (typeof sw.at !== 'string' || !NAME_RE.test(sw.at))) return 'its "at" is not a step name'
  if (sw.given !== undefined && (typeof sw.given !== 'object' || sw.given === null || Array.isArray(sw.given))) return 'its "given" is not an object'
  return null
}

// The one line the creative sees when a talk step starts; talkPrompt's words travel with it as hidden context
// (register.tsx prompt.submit). It still says where it's from, so Claude never reads it as the creative's.
// intro: the stage's short paragraph (F225), shown above the headline at a stage's first talk step.
export function talkHeadline(step, intro = null, place = null) {
  // (F232: a script step names its place, "Define · 3 of 8 · The Pitch", as the band does)
  const what = place || step.description
  const line = `BMUZ step "${step.id}"${what ? ` — ${what}` : ''} (from the BMUZ engine; its instructions for this step are attached)`
  return intro ? `${intro}\n\n${line}` : line
}

// The stage intro a pipeline's first talk step shows, once per run (null: not a stage, or already shown).
export function introFor(p, state) {
  const s = stageOf(p && p.id)
  // (F232: a stage whose steps say the script's lines opens with the script's own welcome instead)
  if (p && Array.isArray(p.steps) && p.steps.some(x => x && x.lines)) return null
  return s && !state.introShown ? s.intro : null
}
// The engine's short line when a timer picks up a run at a talk step (register.tsx advance, opts.timer): the step
// itself starts at that turn's end, where its instructions can be attached.
export function kickLine(step) {
  return `BMUZ engine: picking up the run at step "${step.id}"${step.description ? ` — ${step.description}` : ''}. Reply with one short line; the engine starts the step itself.`
}

export function isTalkHeadline(text) {
  // (the last line: a stage's first step has its intro paragraph above the headline)
  const last = String(text).split('\n').pop()
  return /^BMUZ step "[a-z0-9-]+".* \(from the BMUZ engine; its instructions for this step are attached\)$/.test(last)
}

// A step with "when": does the earlier result it names say yes? (true / "yes" / "y" / "true"; a missing, empty or
// skipped result is no: research is offered, never forced.) A step without "when" always runs.
export function isWanted(step, vars) {
  if (!step || typeof step.when !== 'string') return true
  const m = step.when.match(/^\{(\w+)\}$/)
  if (!m) return false
  const v = vars ? vars[m[1]] : undefined
  // (F215 review fix 2a: a list of things, not of answers — the bug pipeline's matching places — is a yes when it has any)
  if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && x.text === undefined)) return true
  const one = Array.isArray(v) ? v[0] : v
  const said = one && typeof one === 'object' ? one.text : one
  return said === true || (typeof said === 'string' && /^\s*(yes|y|true)\b/i.test(said))
}

// The engine's own message that shows a file a script step wrote (its "show"), word for word, in a turn of its own.
// Like the card, it points at a copy (.bmuz/last-shown.md) instead of carrying the text: a message with the text in
// it showed it twice. Nothing is asked in that turn: the next step's question comes after it (live review
// 2026-11-09 #20b: plain text written in the same turn as a question box was hidden behind the box).
export function showPrompt(path) {
  return `BMUZ engine — this message comes from the BMUZ engine, not the creative. Read ${path} and show the creative its text exactly as written, word for word, with nothing before or after it. Ask nothing; then end your turn (the engine starts the next step itself).`
}

// The engine's own message that shows a hand-off card (sent at turn.complete, like every engine message).
// It points at the saved card instead of carrying it: a message with the card in it showed the card twice,
// once in the engine's message and once in Claude's copy (Muzzy's live look, 2026-11-09: "yes" show it once).
export function cardPrompt(path) {
  return [
    `BMUZ hand-off card — this message comes from the BMUZ engine, not the creative. Read ${path} and show the creative its text exactly as written, word for word, with nothing before or after it, then end your turn.`,
  ].join('\n')
}

// The words that launch a flow step's workflow. They come as the engine's own message (live check L3:
// the old route, running the workflow's /command, showed in the chat as if the creative had typed it).
// The guard pins the Workflow call's name and inputs to these whatever Claude sends.
// tryNo: 1 for the first try. A retry says so: the same words twice looked like the engine asking again
// for a run already going, and Claude refused the real retry (live check 2026-11-08).
// stuck (F216): the script's stuck-twice line, written to the creative word for word before the last try starts.
export function flowPrompt(step, args, tryNo = 1, stuck = '') {
  return [
    `BMUZ step "${step.id}" — this message comes from the BMUZ engine, not the creative; don't comment on it or offer to stop it.`,
    ...(tryNo > 1 ? [`This is try ${tryNo} of ${retriesOf(step) + 1}: the engine itself stopped the last try (it ran too long or failed its check), so no earlier run is still going. Start this fresh one.`] : []),
    ...(stuck ? [`First write this to the creative, word for word, as its own paragraph:\n\n${stuck}\n`] : []),
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
// decisions = the project's decisions list: a question already answered there is refused (V38).
export function checkCard(card, decisions = []) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { ok: false, why: 'the result has no "card": give it as {"title", "done", "see", "try", "proof", "todos", "questions", "next"}' }
  const missing = []
  if (typeof card.title !== 'string' || !card.title.trim()) missing.push('title')
  for (const [key] of CARD_PARTS) if (!hasWords(card[key])) missing.push(key)
  const problems = []
  if (missing.length) problems.push(`the card's ${missing.map(k => `"${k}"`).join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing or empty (write "none" where there is nothing)`)
  if (card.questions !== undefined && !Array.isArray(card.questions)) problems.push('the card\'s "questions" must be a list (or left out when there are none)')
  else {
    const keys = (card.questions || []).map(q => q && q.key)
    for (const [i, q] of (card.questions || []).entries()) {
      problems.push(...questionProblems(q, i + 1))
      if (q && q.key && keys.indexOf(q.key) !== i) problems.push(`question ${i + 1} has the same key "${q.key}" as an earlier one`)
      const had = q && decisions.find(d => d.key === q.key)
      if (had) problems.push(`question ${i + 1} ("${q.key}") was already answered on ${had.at}: ${had.answer} — use it, don't ask again`)
    }
  }
  return problems.length ? { ok: false, why: problems.join('; ') } : { ok: true }
}

// taste = how it looks, feels or plays; want = what the creative wants; choice = pick between options.
export const QUESTION_KINDS = ['taste', 'want', 'choice']

// What is wrong with one of a card's questions (empty = fine). i = its place in the card, for the message.
function questionProblems(q, i) {
  const at = `question ${i}`
  if (!q || typeof q !== 'object' || Array.isArray(q)) return [`${at} must be {"key", "q", "kind", "options"}`]
  const out = []
  // The key is how the lists know a question again: an open one isn't added twice, a decided one isn't asked again.
  if (typeof q.key !== 'string' || !NAME_RE.test(q.key)) out.push(`${at} needs a "key": a short slug in lower case letters, digits and dashes, like "orientation"`)
  // A Questions section holds only questions (V30): each one ends in "?".
  if (typeof q.q !== 'string' || !q.q.trim()) out.push(`${at} has no "q" (the question's words)`)
  else if (!q.q.trim().endsWith('?')) out.push(`${at} ("${q.q.trim()}") must be a question ending in "?"`)
  if (q.options !== undefined && !isList(q.options)) out.push(`${at}: "options" must be a list of answers`)
  // Only the creative's own calls are asked (V32b): engineering calls are BMUZ's own.
  if (!QUESTION_KINDS.includes(q.kind)) out.push(`${at} has kind "${q.kind}": engineering calls are BMUZ's own — decide it and log why (a question's kind is one of ${QUESTION_KINDS.join(', ')})`)
  // A taste question asks for the creative's view first; BMUZ's pick comes only on "you pick".
  else if (q.kind === 'taste' && q.pick !== undefined) out.push(`${at} is a taste question, so it can't carry a "pick": ask for the creative's view first`)
  else if (q.pick !== undefined && !(isList(q.options) && q.options.includes(q.pick))) out.push(`${at}: "pick" must be one of its options, word for word`)
  if (q.kind === 'choice' && !(isList(q.options) && q.options.length >= 2)) out.push(`${at} is a choice, so it needs 2 or more "options"`)
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
  // A blank line between parts: without it a part after a list slid into the list's last item and was
  // drawn indented, labels and all (Muzzy's live look, 2026-11-09).
  return lines.join('\n\n')
}

function questionsBlock(qs) {
  if (!qs.length) return '**Questions:** none'
  const out = ['**Questions:**']
  for (const q of qs) {
    out.push(`${q.n}. ${q.q.trim()}`)
    if (q.kind === 'taste') out.push("   What's your view?")
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

// ---- The open-questions list (.bmuz/questions.json): one list per project, carried in every card (V28b) ----
// Each entry: { n, key, q, kind, options, pick?, askedIn, status: 'open' | 'answered' | 'parked', addedAt }.
// A question shown in this many cards and still unanswered is parked: out of the cards, into questions.md.
export const PARK_AFTER = 2

// Adds a card's questions to the list, numbered on from the highest number used. A question already
// in the list (same key) isn't added twice; a parked one asked again opens again.
export function addCardQuestions(list, qs, day) {
  const out = list.map(x => ({ ...x }))
  let top = out.reduce((m, x) => Math.max(m, x.n || 0), 0)
  for (const q of Array.isArray(qs) ? qs : []) {
    const had = out.find(x => x.key === q.key)
    if (had) {
      if (had.status === 'parked') Object.assign(had, { status: 'open', askedIn: 0 })
      continue
    }
    top += 1
    const entry = { n: top, key: q.key, q: q.q.trim(), kind: q.kind, options: q.options || [], askedIn: 0, status: 'open', addedAt: day }
    if (q.pick) entry.pick = q.pick
    out.push(entry)
  }
  return out
}

// The questions the next card lists: every open one, old ones too, keeping their numbers. One already
// shown in PARK_AFTER cards is parked instead; each one shown counts one more card.
// Returns { list (updated), shown }.
export function questionsForCard(list) {
  const shown = []
  const out = list.map(x => {
    if (x.status !== 'open') return x
    if ((x.askedIn || 0) >= PARK_AFTER) return { ...x, status: 'parked' }
    const y = { ...x, askedIn: (x.askedIn || 0) + 1 }
    shown.push(y)
    return y
  })
  return { list: out, shown }
}

// .bmuz/questions.md holds an auto run's questions (askLines) and, at the end, the parked questions.
export const QUESTIONS_MD_HEAD = '# Questions for the creative\nAn auto run took the default where it would have asked. Change anything you disagree with.\n\n'
export const PARKED_HEADING = '## Parked — decide when the feature that needs it is planned'

function parkedSection(list) {
  const parked = list.filter(x => x.status === 'parked')
  if (!parked.length) return ''
  const lines = parked.map(x => `- ${x.n}. ${x.q}${x.options && x.options.length ? ` (options: ${x.options.join(' / ')})` : ''} — asked in ${x.askedIn} cards, first on ${x.addedAt}`)
  return [PARKED_HEADING, 'Answer by number any time ("3 blue"); until then no card asks them again.', ...lines].join('\n') + '\n'
}

// The new questions.md text. oldText = the file as read (null = none yet); addLines = an auto run's new
// lines (they go above the parked section); list = the questions list when the parked section changes.
export function questionsMd(oldText, addLines = [], list = null) {
  const text = oldText ?? QUESTIONS_MD_HEAD
  const at = text.indexOf(PARKED_HEADING)
  let top = at < 0 ? text : text.slice(0, at)
  if (at >= 0 && top !== QUESTIONS_MD_HEAD) top = top.replace(/\n\n$/, '\n') // the blank line put before the section
  if (addLines.length) top += addLines.join('\n') + '\n'
  const tail = list ? parkedSection(list) : (at < 0 ? '' : text.slice(at))
  return tail ? top + (top.endsWith('\n\n') ? '' : '\n') + tail : top
}

// ---- The decisions list (.bmuz/decisions.json): an answered question is never asked again (V38) ----
// Each entry: { key, q, answer, at }.

// The creative's answers by number in a plain message, one per line: "1 yes", "1. blue", "2: the first one".
// Only numbers of questions still waiting (open or parked) count. "1.5 seconds" is not an answer to 1.
// Returns [{ n, key, q, answer }], the first answer to each number.
export function matchAnswers(text, list) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)(?:\s*[:)]\s*|\s*\.(?!\d)\s*|\s+)(\S.*?)\s*$/)
    if (!m) continue
    const q = list.find(x => x.n === Number(m[1]) && (x.status === 'open' || x.status === 'parked'))
    if (q && !out.some(a => a.n === q.n)) out.push({ n: q.n, key: q.key, q: q.q, answer: m[2] })
  }
  return out
}

// Records answers: each question is marked answered and joins the decisions. Returns { list, decisions }.
export function recordAnswers(list, decisions, answers, at) {
  const byN = new Map(answers.map(a => [a.n, a]))
  const newList = list.map(x => (byN.has(x.n) ? { ...x, status: 'answered' } : x))
  const kept = decisions.filter(d => !answers.some(a => a.key === d.key))
  return { list: newList, decisions: [...kept, ...answers.map(a => ({ key: a.key, q: a.q, answer: a.answer, at }))] }
}

export function decisionsMd(decisions) {
  return ['# Decisions', 'Answered once; BMUZ checks here before asking, and never asks these again.', '', ...decisions.map(d => `- ${d.at} · ${d.q} — **${d.answer}** (\`${d.key}\`)`)].join('\n') + '\n'
}

// The short note the engine adds to the creative's message after recording answers.
export function answersNote(answers) {
  const nums = answers.map(a => a.n).join(', ')
  const yours = answers.filter(a => /^you pick\b/i.test(a.answer)).map(a => a.n)
  const lines = [`BMUZ engine: answers recorded for ${nums} (in .bmuz/decisions.md). Use them; don't ask them again.`]
  if (yours.length) lines.push(`For ${yours.join(', ')} the creative said "you pick": pick it yourself and say why in one line.`)
  return lines.join(' ')
}

// What is wrong with a talk step's result against its "results" list (null = fine): every listed key
// must be there (an empty list counts, an empty text doesn't), and a key some step names a file with
// ("writes": ".../discover-{slug}.md") must be a slug, so the file stays where the pipeline says.
// F216 review fix 10: how long one test run may take (a real game's suite can take minutes): 10 minutes, or the
// project's bmuz.json "testTimeoutMs". A done-check that runs tests gets three of them (a test file, the suite, check:fast).
export const TEST_TIMEOUT_MS = 600000
// Claude Code runs a mod's command for at most this long (its host check: "1 to 600000"), so a whole done-check does too.
export const HOST_RUN_MAX_MS = 600000
export function testTimeoutOf(cfg) {
  const n = cfg && cfg.testTimeoutMs
  return Number.isInteger(n) && n > 0 ? n : TEST_TIMEOUT_MS
}
// A check that ran past its limit: said plainly, and never a pass nor a "fails first". null when it didn't.
export function checkTimedOutWhy(ran, ms) {
  if (!ran || !(ran.timedOut || ran.exitCode === null || ran.exitCode === undefined)) return null
  const mins = Math.round(ms / 60000)
  return `the check ran past its ${mins >= 1 ? `${mins} minute${mins === 1 ? '' : 's'}` : `${Math.round(ms / 1000)} s`} and was stopped: that is neither a pass nor a fail. If the tests really need longer, set "testTimeoutMs" in bmuz.json`
}

// The holes a talk step's done-check fills from: the results so far, the step's own result, and the engine's own holes,
// which always win (F216 review fix 8: a result holding "auto": "live" could have let an auto run approve).
export function checkVarsOf(base, result) {
  const own = Object.fromEntries(BUILT_IN_HOLES.filter(k => base[k] !== undefined).map(k => [k, base[k]]))
  return { ...base, ...(result && typeof result === 'object' ? result : {}), ...own }
}

export function resultProblems(p, step, result) {
  const keys = step.results || []
  const r = result && typeof result === 'object' ? result : {}
  // (F216 review fix 8: a result can't stand in for the engine's own holes: {auto} decides who may approve)
  const shadow = Object.keys(r).filter(k => BUILT_IN_HOLES.includes(k))
  if (shadow.length) return `"${shadow[0]}" is one of the engine's own holes ({${BUILT_IN_HOLES.join('}, {')}}); leave it out of the result`
  if (!keys.length) return null
  // A step that writes chapters hands them back inside "chapters" (headless run 2026-11-11: Players & Opponents
  // put chapter 5 beside it, {"5": …}, and it was never written). A bare number key is never taken as a chapter.
  if (keys.includes('chapters')) {
    const shape = '{"chapters": {"5": "<chapter 5\'s whole text>", "11": "<chapter 11\'s whole text>"}, …} (each chapter by its number, inside "chapters")'
    const loose = Object.keys(r).filter(k => /^\d+$/.test(k))
    if (loose.length) return `${loose.map(k => `"${k}"`).join(', ')} ${loose.length > 1 ? 'are chapter numbers' : 'is a chapter number'} outside "chapters"; hand the chapters back as ${shape}`
    const c = r.chapters
    if (c !== undefined && c !== null && typeof c !== 'string' && (typeof c !== 'object' || Array.isArray(c))) return `"chapters" must be ${shape}`
  }
  const missing = keys.filter(k => r[k] === undefined || r[k] === null || (typeof r[k] === 'string' && !r[k].trim()))
  if (missing.length) return `the result has no ${missing.map(k => `"${k}"`).join(', ')}; give ${missing.length > 1 ? 'them' : 'it'} in step_done's result`
  const inPaths = new Set(p.steps.flatMap(s => (isList(s.writes) ? s.writes : []).flatMap(f => holesIn(f))))
  for (const k of keys) {
    if (inPaths.has(k) && !(typeof r[k] === 'string' && NAME_RE.test(r[k]) && r[k].length <= 60)) return `"${k}" names a file, so it must be a short slug in lower case letters, digits and dashes, like "screen-shake" (got ${JSON.stringify(r[k]).slice(0, 80)})`
  }
  return null
}

// A "writes" path with a * in its file name (content/data/*.json) stands for every file it matches in that one
// folder: the engine saves them all before the step, and an undo puts them back and deletes the ones it made (F227
// review: the content steps' tables, one file per table, weren't put back).
export const isPattern = f => String(f).includes('*')
export function matchesPattern(pattern, path) {
  const at = pattern.lastIndexOf('/')
  const folder = pattern.slice(0, at + 1)
  if (!String(path).startsWith(folder)) return false
  const name = String(path).slice(folder.length)
  const re = new RegExp(`^${pattern.slice(at + 1).split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`)
  return re.test(name)
}

// A step's "writes" paths with their {holes} filled. A path whose hole isn't a slug, or that ends up
// outside the project, is left out: the engine never saves or deletes it.
export function writesOf(step, vars) {
  const out = []
  for (const f of isList(step.writes) ? step.writes : []) {
    let ok = true
    const path = f.replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars[k]
      if (typeof v === 'string' && NAME_RE.test(v) && v.length <= 60) return v
      ok = false
      return m
    })
    if (ok && isSafePath(path)) out.push(path)
  }
  return out
}

// A flow's args: like fillDeep, but a value that is one whole hole ("{assumptions}") gets the result
// itself, so a list or an object reaches the workflow as a list or an object, not as text.
export function fillArgs(v, vars) {
  if (typeof v === 'string') {
    const whole = v.match(/^\{(\w+)\}$/)
    // (null = the step that gives it was skipped by a wrap-up: the workflow gets null, not the text "{hole}")
    if (whole && vars[whole[1]] === null) return null
    if (whole && typeof vars[whole[1]] === 'object') return JSON.parse(JSON.stringify(vars[whole[1]]))
    return fill(v, vars)
  }
  if (Array.isArray(v)) return v.map(x => fillArgs(x, vars))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillArgs(x, vars)]))
  return v
}

// Fills {name}-style holes from the step results and extra values.
export function fill(text, vars) {
  // (a null result, from a step skipped by a wrap-up, fills in as nothing)
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k] === null ? '' : String(vars[k])))
}

export function fillDeep(v, vars) {
  // (F215: a command's argument that is one whole hole holding a list or an object goes as JSON, never "[object Object]":
  // the bug pipeline's matching places reach bugs.mjs as the list itself)
  const whole = typeof v === 'string' ? v.match(/^\{(\w+)\}$/) : null
  if (whole && vars[whole[1]] && typeof vars[whole[1]] === 'object') return JSON.stringify(vars[whole[1]])
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
  return /doesn't want to proceed|tool use was rejected|user rejected tool use|interrupted by user/i.test(text)
}

// ---- Asking only through the question box (F228 task 3; discover-live-review-2026-11-09.md S3 and #20b) ----
// Every live talk step is told this, whatever its craft note says.
export const ASK_RULE = 'Asking: every question to the creative goes through AskUserQuestion (their own words go in its "Other"). Never ask anything in plain text: the creative doesn\'t see it as a question and the run waits (a live run stalled 18 minutes on one). Nothing they must read goes in plain text in the same turn as the question box: the box covers it. Put it inside the question or the options\' descriptions, with at most one short line before the box. A turn of a talk step ends only with the box answered and more to do, or with step_done. Options: only real answers, two is fine, never filler. Never an option that only means "I\'ll type or paste it" (picking an option ends the question with nothing typed). Links, notes or any long text: never the box — ask in one short line as your whole reply and end your turn; their next chat message is the answer: every link or path in it is material, one item each; "never mind" means none. (The box\'s own "Type something." field is easy to miss and paste doesn\'t reach it until it\'s selected — live look 2026-11-10.) Anything that asks them to put files in this folder gives the folder\'s full path, so they can find it. If the creative closes the box without an answer (Esc, or "Type something." sent empty — the same thing to you), write ONE short line: "Nothing came through. Paste it as your next message, or say carry on." and end your turn; their next message is the answer. Never repeat it.'
export const MAX_NUDGES = 2

// The question a message asks in plain text (one of its last lines ending in "?"), or null.
export function plainQuestion(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-8)
  for (let i = lines.length - 1; i >= 0; i--) if (/\?\s*["'”’)*_]*\s*$/.test(lines[i])) return lines[i].replace(/^[-*>\d.)\s]+/, '').slice(0, 200)
  return null
}

// What the engine says when a live talk step's turn ends with neither the box nor step_done (the run would wait for a
// message the creative doesn't know to type). n = nudges already sent for this try; null once MAX_NUDGES are used
// (the watchdog then covers it, as before).
export function nudgeFor(step, answer, n = 0) {
  if (n >= MAX_NUDGES) return null
  const q = plainQuestion(answer)
  const head = `BMUZ engine — this message comes from the BMUZ engine, not the creative (step "${step.id}").`
  return q
    ? `${head} The last message asked "${q}" in plain text, where the creative can miss it and the run waits. Ask it again with AskUserQuestion (their own words go in "Other"), with nothing else written outside the box.`
    : `${head} The turn ended without the question box or step_done, so the run would wait. Carry on with the step: ask with AskUserQuestion, or call ${ENGINE_TOOL} if it's finished.`
}

// The assistant's plain text in the current turn so far: every assistant message after the last real prompt (a user
// message that isn't only tool results). rows = $.session.messages()'s rows.
export function turnText(rows) {
  const out = []
  for (let i = (Array.isArray(rows) ? rows.length : 0) - 1; i >= 0; i--) {
    const m = rows[i]
    if (!m) continue
    if (m.role === 'user' && !(Array.isArray(m.toolResults) && m.toolResults.length)) break
    if (m.role === 'assistant' && typeof m.text === 'string' && m.text.trim()) out.unshift(m.text.trim())
  }
  return out.join('\n')
}

// Is there more plain text before a question box than one short line? Returns the refusal's words, or null.
export function hiddenTextProblem(text) {
  const t = String(text || '').trim()
  const lines = t.split(/\r?\n/).filter(l => l.trim()).length
  if (t.length <= 300 && lines <= 3) return null
  return `BMUZ engine: ${lines} line${lines === 1 ? '' : 's'} of plain text (${t.length} characters) came before this question box in the same turn, and the box covers them: the creative can't read them (live run: "i don't see 5 research questions that you're referring to"). Ask again with everything they need to read inside the question or the options' descriptions, and at most one short line before the box.`
}

// An option that stands in for typing ("I'll paste the link", "Write it here instead", "It's in Drive — paste it in
// Other"): picking it ends the question with nothing typed, so the creative is asked again and again (live look
// 2026-11-10: four screens of "I'll paste it", never a field to paste into). The box's own "Type something" is the
// only place to type. questions = AskUserQuestion's input.questions. Returns the refusal's words, or null.
const TYPE_WORD = '(paste|type|write|enter|drop|give|share|send)'
const FAKE_LABEL = [
  new RegExp(`\\b(i'?ll|i will|let me|i can|i want to)\\s+(just\\s+)?${TYPE_WORD}\\b`, 'i'),
  /^\s*(paste|type|write)\b/i,
  new RegExp(`\\b${TYPE_WORD}\\s+(it|them|that|the\\s+\\w+|a\\s+\\w+|my\\s+\\w+)\\s+(here|in|instead)\\b`, 'i'),
]
const FAKE_DESC = /\b(paste|type|write|enter)\b[^.]*\b(in|into)\s+["'“‘]?(other|type something)\b/i
export function fakeTypeOptionProblem(questions) {
  for (const q of Array.isArray(questions) ? questions : []) {
    for (const o of Array.isArray(q && q.options) ? q.options : []) {
      const label = String((o && o.label) || '')
      const desc = String((o && o.description) || '')
      if (FAKE_LABEL.some(r => r.test(label)) || FAKE_DESC.test(desc)) {
        return `BMUZ engine: the option "${label}" stands in for typing, but picking an option ends the question with nothing typed — the creative gets asked again and never gets a field to paste into (live look: four screens of "I'll paste it"). Drop that option. For links or long text ask in the chat instead of the box (their next chat message is the answer); keep only options that are real answers — two is fine, no filler.`
      }
    }
  }
  return null
}

// A question box with fewer than 2 or more than 4 options: Claude Code refuses it for its shape (live run 2026-11-10
// 14:37, Ideate's gaps: "fewer than 2 options"). The engine says so first, plainly. A question with no options list
// is left to Claude Code's own check. Returns the refusal's words, or null.
export function optionCountProblem(questions) {
  for (const q of Array.isArray(questions) ? questions : []) {
    const opts = q && q.options
    if (!Array.isArray(opts)) continue
    if (opts.length < 2 || opts.length > 4) {
      const what = String((q && (q.header || q.question)) || 'a question').slice(0, 80)
      return `BMUZ engine: "${what}" has ${opts.length} option${opts.length === 1 ? '' : 's'}; the question box takes 2 to 4 real options. ${opts.length < 2 ? 'With only one way forward there is nothing to choose: take it, say so in one line, and carry on (no filler second option).' : 'Keep the 4 that matter most.'} Ask the other questions again on their own.`
    }
  }
  return null
}

// What a refused question box means (F231, live run 2026-11-10: a shape refusal was read as "nobody is here", so the
// rest of Ideate and all of Define ran unattended). Only a refusal saying the tool can't be used in this session
// (a background session lists it but refuses it: headless check 15) means nobody can answer. A shape refusal
// (InputValidationError: too few options, too many) and any other refusal is a failed ask: Claude reads it and asks
// again. res = the tool's result.
export function isShapeRefusal(res) {
  return /InputValidationError|too_small|too_big|invalid_type|Too (small|big): expected/i.test(JSON.stringify(res ?? ''))
}
export function isNobodyToAsk(res) {
  if (isShapeRefusal(res)) return false
  return /not available in this session|(isn'?t|is not|not) available|unavailable|non-?interactive|no (one|user|person) (is )?(here |available )?to (answer|ask)|nobody (is )?(here|available) to|can(not|'t) ask (the )?(user|person)/i.test(JSON.stringify(res ?? ''))
}

/// ---- Free answers: "your next message is the answer" (F228's ask for links, generalised in F232 task 2) ----
// The question box's only text field is its last row, "Type something.": easy to miss, and paste doesn't reach it
// until it's selected (live looks 2026-11-10). So every free question is a script "free" line: Claude writes it as its
// whole reply and ends the turn; state.ask marks it open (no nudge, no watchdog stall, kept across a new window); the
// creative's next chat message is the answer. The ask for links (ideate.material) is one of them ("never mind" = none).
export const LINKS_LINE = 'ideate.material'

// The engine's own tool rows in the transcript, as one dim line instead of their raw JSON (F231, live look: "bmuz -
// ask_paste (MCP) { open: true, say: … }"). null = not the engine's tool, or a refusal (its reason is shown as is).
export function toolRowLabel(tool, output, isErrored) {
  if (isErrored) return null
  if (tool === ENGINE_TOOL) return /^\s*"?Not done/.test(typeof output === 'string' ? output : JSON.stringify(output ?? '')) ? 'BMUZ · step not done yet' : 'BMUZ · step recorded'
  if (tool === SAY_TOOL) return 'BMUZ · script line'
  if (tool === BUG_TOOL) return 'BMUZ · bug logged'
  return null
}

// The open free question, when it belongs to the step that is running now; else null (a finished or undone step's is
// stale). { step, line, text }
export function askOpen(state) {
  const p = state && state.ask
  return p && state.status === 'working' && p.step === state.current ? p : null
}

// "never mind" as typed: any case, trimmed, with or without quotes and a closing stop ("Never mind.", '"never mind"').
export function isNeverMind(text) {
  const t = String(text || '').trim().replace(/^["'“‘]+|["'”’]+$/g, '').replace(/[.!]+$/, '').replace(/^["'“‘]+|["'”’]+$/g, '').trim().toLowerCase()
  return t === 'never mind' || t === 'nevermind'
}

// What Claude is told beside the creative's answer (prompt context: the creative never sees it).
export function answerNote(ask, text) {
  if (ask && ask.line === LINKS_LINE) {
    return isNeverMind(text)
      ? 'BMUZ engine: the creative said "never mind" to sharing links: carry on with the step with no material from this ask (no links, files or pasted text).'
      : 'BMUZ engine: this message answers your ask for links: take every link and path in it as their material (one item per link or path), and any other text as pasted text, exactly as given.'
  }
  const q = plainWords(ask ? ask.text : '')
  return `BMUZ engine: this message is the creative's answer to the script line "${ask ? ask.line : '?'}" ("${q.slice(0, 80)}${q.length > 80 ? '…' : ''}"). Their own words, exactly: use them, then carry on with the step.`
}

// The line a talk step's notes get when it starts again (a new window, "bmuz go") with its question still open.
export function askResumeLine(ask) {
  return `Your question (script line "${ask.line}") is still open: write exactly this as your whole reply and end your turn — ${ask.text}`
}

// The text of a question box's answer, whatever field carries it (the mod docs don't fix the result's shape).
export function answerText(res) {
  if (res == null) return ''
  if (typeof res === 'string') return res
  for (const k of ['text', 'result', 'content', 'value']) {
    const v = res[k]
    if (typeof v === 'string' && v.trim()) return v
    if (Array.isArray(v)) {
      const t = v.map(x => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : '')).join('\n')
      if (t.trim()) return t
    }
    if (v && typeof v === 'object') { const t = answerText(v); if (t) return t }
  }
  return JSON.stringify(res)
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
  // Reading the saved hand-off card (cardPrompt) or a script step's shown file (showPrompt) is always allowed: the
  // engine asks for them between steps.
  if (!call.agentId && call.tool === 'Read' && /[\\/]\.bmuz[\\/]last-(card|shown)\.md$/.test(String((call.input || {}).file_path || ''))) return { allow: true }
  if (opts.auto && call.tool === 'AskUserQuestion') {
    return { allow: false, why: `BMUZ engine: auto run, nobody is here to answer. Don't ask: pick the sensible default, add {"question": "...", "picked": "..."} to the "asks" list in ${ENGINE_TOOL}'s result, and carry on.` }
  }
  // F215: the creative may step in with a bug at any moment (between steps, at a gate, during a helper's run): the report
  // is a side trip that leaves the step's record as it was (the motor writes it through bugs.mjs).
  if (call.tool === BUG_TOOL && !call.agentId) return { allow: true }
  // F216: so may a new idea, noted on the roadmap's Ideas (Develop)
  if (call.tool === IDEA_TOOL && !call.agentId) return { allow: true }
  // step_done only closes an open talk step; called between steps, it has nothing to finish.
  if (call.tool === ENGINE_TOOL && !call.agentId && !(state.status === 'working' && (stepById(p, state.current) || {}).kind === 'talk')) {
    return { allow: false, why: 'BMUZ engine: no talk step is open, so there is nothing to finish. End your turn; the engine starts the next step itself.' }
  }
  // Everything is open only before the pipeline starts and after it ends. Between steps (after a
  // step_done, an undo, a gate going back, a retry about to start) the engine owns the next move.
  if (state.status === 'done') return { allow: true }
  if (state.status === 'idle' && !state.current && state.finished.length === 0) return { allow: true }
  if (state.status === 'idle') return { allow: false, why: `BMUZ engine: between steps; the engine starts the next one itself. End your turn (or the creative says "bmuz go").` }
  // F215: while a pipeline runs, a file Claude or a helper writes or edits stays inside the project and out of the
  // engine's own .bmuz folder, whatever tools the step allows (the bug pipeline writes tests and fixes code there).
  if (opts.dir && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(call.tool)) {
    const target = (call.input || {}).file_path ?? (call.input || {}).notebook_path
    if (!projectPath(opts.dir, target)) return { allow: false, why: `BMUZ engine: ${call.tool} may only change files inside this project, and not in its .bmuz folder (${String(target ?? '').slice(0, 160)})` }
  }
  // F216: a Bash command (Develop's builder helper, Setup) stays inside the project too.
  if (opts.dir && call.tool === 'Bash') {
    const why = bashProblem(opts.dir, (call.input || {}).command)
    if (why) return { allow: false, why: `BMUZ engine: Bash stays inside this project while a pipeline runs, and this command ${why}: ${String((call.input || {}).command ?? '').slice(0, 160)}` }
  }
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
  // F232: every talk step with script lines may say them (the motor checks which).
  if (call.tool === SAY_TOOL) return step.kind === 'talk' && step.lines ? { allow: true } : { allow: false, why: `BMUZ engine: step ${step.id} has no script lines to say` }
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
  if (d.type === 'script-ok') {
    // look.ran = what the motor's run of the command gave: { exitCode, stdout }.
    if (!look.ran) return { ok: false, why: 'the check command did not run' }
    if (look.ran.exitCode === 0) return { ok: true }
    const said = String(look.ran.stdout || look.ran.stderr || '').trim()
    return { ok: false, why: `the check ${d.run.map(x => String(x).split('/').pop()).slice(0, 2).join(' ')} said: ${said.length > 600 ? said.slice(0, 600) + '…' : said || `exit ${look.ran.exitCode}`}` }
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

// The command a "script-ok" done-check runs, holes filled (null = this check runs nothing).
export function checkRun(step, vars) {
  const d = step.done
  return d && d.type === 'script-ok' ? fillDeep(d.run, vars) : null
}

// The files a done-check needs read.
export function checkFiles(step, vars) {
  const d = step.done
  return d && d.path ? [fill(d.path, vars)].filter(isSafePath) : []
}

// How many retries a step gets: its own "retries", else MAX_RETRIES.
// The keys a step hands back: a talk step's results (and its result-has key), a script step's results (F216 review fix 11).
export function resultKeysOf(s) {
  if (!s) return []
  if (s.kind === 'talk') return [...(isList(s.results) ? s.results : []), ...(s.done && s.done.key ? [s.done.key] : [])]
  if (s.kind === 'script') return isList(s.results) ? s.results : []
  return []
}

// A script step's result: the "results" object of its last line of JSON, with every key it names. { result } or { error }.
export function scriptResults(step, stdout) {
  if (!isList(step && step.results)) return { result: null }
  const last = String(stdout || '').trim().split('\n').pop() || ''
  let j = null
  try { j = JSON.parse(last) } catch (err) { j = null }
  const r = j && j.results && typeof j.results === 'object' && !Array.isArray(j.results) ? j.results : null
  const missing = step.results.filter(k => !r || r[k] === undefined || r[k] === null)
  if (missing.length) return { error: `the script hands back ${missing.map(k => `"${k}"`).join(', ')} in its last line of JSON ({"results": {…}}), and it didn't: ${last.slice(0, 160)}` }
  return { result: Object.fromEntries(step.results.map(k => [k, r[k]])) }
}

export function retriesOf(step) {
  return step && Number.isInteger(step.retries) ? step.retries : MAX_RETRIES
}

// After a failed done-check: retry (up to the step's retries) or block.
export function onFail(state, step, why) {
  const n = (state.retries[step.id] || 0) + 1
  const retries = { ...state.retries, [step.id]: n }
  if (n > retriesOf(step)) {
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
    ask: null, // nor a talk step's open free question, its script boxes or its opening mark (F232)
    boxes: [],
    opened: null,
    said: null, // (the lines this step handed out, for its "must")
    back: state.back && state.back.step === step.id ? null : state.back || null,
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
    const files = [...new Set(later.flatMap(x => writesOf(x, state.results || {})))]
    const untracked = later.filter(x => (x.kind === 'script' || x.kind === 'flow') && !(x.writes || []).length).map(x => x.id)
    const what = s.description ? `${s.id} (${s.description})` : s.id
    const byMaterial = state.entered && (state.entered.skipped || []).includes(id)
    let line = `go back to before "${what}"${byMaterial ? ' (answered by your material when this stage started)' : (state.skipped || []).includes(id) ? ' (skipped when you wrapped up)' : ''}`
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
  // (the script lines handed out in this step, for its "must"; a restart of the same step keeps them)
  const said = state.said && state.said.step === step.id ? state.said : { step: step.id, lines: [] }
  return { ...state, current: step.id, status, startedAt: now, said }
}

// A talk step's "must" lines not handed out yet (state.said): step_done is refused, naming them, until each was said
// (headless design-garden 2026-11-11: Players & Opponents finished after its opening alone). null = fine.
export function mustProblem(step, state) {
  const had = state && state.said && state.said.step === step.id && Array.isArray(state.said.lines) ? state.said.lines : []
  const left = (isList(step.must) ? step.must : []).filter(id => !had.includes(id))
  if (!left.length) return null
  const many = left.length > 1
  return `the step isn't finished: the script's line${many ? 's' : ''} ${left.map(id => `"${id}"`).join(', ')} ${many ? 'were' : 'was'} never said. Say ${many ? 'each' : 'it'} with ${SAY_TOOL} {"line": "<id>"} the way the craft note says (an auto run too: take the answer from the test answers), then call ${ENGINE_TOOL} again`
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
  // (F232: the step it goes back to is told what the creative answered, and an "onBack" step runs only then)
  return { state: { ...dropSteps(state, drop), current: null, status: 'idle', startedAt: null, back: { step: back, gate: step.id, answer, question: step.question || step.line || step.id } }, approved: false }
}

// A step with "onBack" runs only when a gate sent the creative back to it (Define's "Not yet: change something");
// otherwise it is skipped like a "when" that says no.
export function onBackSkips(step, state) {
  return !!(step && step.onBack && !(state && state.back && state.back.step === step.id))
}

// TaskStop's answer when the task had already finished (proof run 9: "not running (completed)").
export function taskAlreadyEnded(text) {
  return /not running|already (finished|completed|stopped)|\(completed\)/i.test(String(text || ''))
}

// Watchdog: is the current step past its time limit?
// opts.askOpen: a question box is open right now (the motor sees it in flight). F231 (live run 2026-11-10: the
// watchdog restarted the opening at 12:28 while its first box waited on a creative away until 14:31): a step waiting
// on the creative — a box open, or its ask for links open — is not stalled, and the clock counts from the creative's
// last answer (state.activeAt), not from the step's start.
export function isStalled(p, state, now, defaultMs, opts = {}) {
  if (state.status !== 'working' || !state.startedAt) return false
  if (opts.askOpen) return false
  // (a talk step with its ask for links open is waiting on the creative, not stalled)
  if (askOpen(state)) return false
  const step = stepById(p, state.current)
  const limit = (step && step.timeoutMs) || defaultMs
  const since = Math.max(state.startedAt, Number(state.activeAt) || 0)
  return now - since > limit
}

// The status band's words.
export function bandText(p, state, now) {
  const total = p.steps.length
  if (state.status === 'done') {
    // (F225: a finished stage says where "bmuz go" goes next)
    const nx = nextOf(p, state.results)
    const to = nx && stageOf(nx.pipeline)
    return `BMUZ · ${p.id} · all ${total} steps done${to && !to.forNow ? ` · bmuz go: on to ${to.name}` : ''}`
  }
  if (state.status === 'idle' && state.finished.length === 0) return `BMUZ · ${p.id} · ready · /bmuz-go to start`
  const step = stepById(p, state.current) || nextStep(p, state)
  const n = step ? p.steps.indexOf(step) + 1 : state.finished.length
  const word = { working: 'working', waiting: 'waiting for you', blocked: 'BLOCKED', idle: 'next up', stalled: 'stalled' }[state.status] || state.status
  // The clock counts only while something is running (Muzzy 2026-11-09: a clock still ticking on BLOCKED
  // read as "it's doing something").
  const timed = state.status === 'working' && typeof state.startedAt === 'number'
  const secs = timed ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  // F232: a stage with the script's step numbers says "Define · 3 of 8 · The Pitch" (the script's band); a free
  // question open says it is waiting for the creative, not working.
  const place = stepPlace(p, step)
  if (place) return `${place} · ${askOpen(state) ? 'your turn' : word}${timed && !askOpen(state) ? ' · ' + clock : ''}`
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
    // A stage switch (F225) starts the new stage's journal with its whole first state.
    if ((j.ev === 'baseline' || j.ev === 'stage.enter') && j.state) s = { ...freshState(pipelineId), ...j.state }
    if (j.ev === 'intro') s = { ...s, introShown: true }
    if (j.ev === 'step.start') s = { ...s, current: j.step, status: j.kind === 'gate' ? 'waiting' : 'working', startedAt: j.t }
    if (j.ev === 'step.done') s = finish(s, { id: j.step }, j.result || null)
    if (j.ev === 'wrap') s = applyWrap(s, j.skipped || [], j.empties || {})
    if (j.ev === 'step.skip') s = applyWrap(s, [j.step], j.empties || {})
    if (j.ev === 'retry') s = { ...s, retries: { ...s.retries, [j.step]: (s.retries[j.step] || 0) + 1 } }
    if (j.ev === 'gate.back') s = { ...dropSteps(s, new Set(j.dropped || [])), current: null, status: 'idle', startedAt: null, ...(j.back ? { back: j.back } : {}) }
    if (j.ev === 'undo') s = { ...dropSteps(s, new Set(j.redo || [])), current: null, status: 'idle', startedAt: null, blocked: null }
    if (j.ev === 'blocked') s = { ...s, status: 'blocked', blocked: { step: j.step, why: j.why }, retries: { ...s.retries, [j.step]: MAX_RETRIES + 1 } }
    if (j.ev === 'unblock') s = unblock(s).state || s
    if (j.ev === 'pipeline.done') s = { ...s, status: 'done', current: null, startedAt: null }
    // (F216: a loop step an auto run left waiting for the creative is put back between steps)
    if (j.ev === 'loop.waiting') s = { ...s, current: null, status: 'idle', startedAt: null }
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
  const state = fixed ? { ...rebuilt, flow: kept && kept.flow, ask: kept && kept.ask, boxes: (kept && kept.boxes) || [], opened: kept && kept.opened, said: (kept && kept.said) || null } : kept
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

// ---- The script (F232 task 2): every fixed line BMUZ says, word for word, from ONE file (plugin/script.md) ----
// The approved script (framework research/bmuz-vision/bmuz-design-doc.html, "How to read the scripts"): free answers go
// in the chat ("your next message is the answer"), choices in a question box, and every fixed line is said exactly.
// Claude never writes a fixed line itself: it asks the engine for it by id (SAY_TOOL) with the game-specific slots,
// and gets the exact words back; the engine checks at the turn's end that they were said unchanged, and refuses a
// question box that isn't the script's. A free line opens "the next message is the answer" (F228's ask for links,
// generalised): no nudge and no watchdog stall while it waits.
export const SAY_TOOL = 'mcp__bmuz__say'
export const SCRIPT_KINDS = ['say', 'free', 'box']
// A said line longer than this is shown in a turn of its own: a question box in the same turn covers it (live review
// 2026-11-09 #20b; the same limits as hiddenTextProblem).
export const LONG_SAY = { chars: 300, lines: 3 }

// Reads script.md. Returns { lines: { id: { id, kind, added, text, box? } }, problems: [plain words] }.
// A box: { question, header, many, options: [{ label, description, if?, each? }] }.
export function parseScript(text) {
  const lines = {}
  const problems = []
  let cur = null
  const close = () => {
    if (!cur) return
    const body = cur.body.join('\n').replace(/^\n+|\n+$/g, '')
    if (cur.kind !== 'box') {
      cur.text = body
      if (!body.trim()) problems.push(`line "${cur.id}" has no words`)
    } else {
      const box = { question: '', header: '', many: false, options: [] }
      for (const l of body.split('\n')) {
        if (/^\?\s/.test(l)) box.question = l.slice(2).trim()
        else if (/^header:\s*/.test(l)) box.header = l.replace(/^header:\s*/, '').trim()
        else if (/^many:\s*yes\s*$/.test(l)) box.many = true
        else if (/^- /.test(l)) {
          const m = l.slice(2).match(/^(?:\[(if|each) (\w+)\]\s+)?(.*?)(?: — (.*))?$/)
          box.options.push({ label: m[3].trim(), description: (m[4] || '').trim(), ...(m[1] ? { [m[1]]: m[2] } : {}) })
        } else if (l.trim()) problems.push(`box "${cur.id}": the line "${l.slice(0, 60)}" isn't "? question", "header:", "many: yes" or "- option"`)
      }
      if (!box.question) problems.push(`box "${cur.id}" has no "? question" line`)
      if (!box.header || box.header.length > 12) problems.push(`box "${cur.id}" needs a "header:" of 12 characters at most`)
      if (!box.options.length) problems.push(`box "${cur.id}" has no options`)
      if (box.options.filter(o => !o.if && !o.each).length > 4) problems.push(`box "${cur.id}" has more than 4 options`)
      cur.box = box
    }
    lines[cur.id] = { id: cur.id, kind: cur.kind, added: cur.added, ...(cur.kind === 'box' ? { box: cur.box } : { text: cur.text }) }
    cur = null
  }
  for (const raw of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const h = raw.match(/^## ([a-z][a-z0-9.-]*) · (say|free|box)( · added)?\s*$/)
    if (h) {
      close()
      if (lines[h[1]]) problems.push(`line "${h[1]}" is in the script twice`)
      cur = { id: h[1], kind: h[2], added: !!h[3], body: [] }
      continue
    }
    if (/^#{1,2} /.test(raw)) { close(); continue }
    if (cur) cur.body.push(raw)
  }
  close()
  return { lines, problems }
}

const filled = v => v !== undefined && v !== null && v !== false && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length)
const slotNames = t => [...String(t).matchAll(/\{([\w.]+)(#?)\}/g)].map(m => m[1]).filter(n => n !== '.')

// Fills one template. slots: the game-specific parts; a list fills as "· " lines ({x#}: "1. " lines); an item that is
// { line, slots } is another script line (Ideate's question pool). Returns { text } or { missing: [slot names] }.
function fillTemplate(t, slots, nested) {
  const missing = []
  const one = (name, numbered, ctx) => {
    const v = name === '.' ? ctx : ctx && typeof ctx === 'object' && !Array.isArray(ctx) && ctx[name] !== undefined ? ctx[name] : slots[name]
    if (!filled(v)) { missing.push(name); return '' }
    const item = x => (x && typeof x === 'object' && typeof x.line === 'string' ? nested(x) : typeof x === 'object' ? String(x.text ?? '') : String(x))
    // (an item that already carries its own number or bullet loses it: "1. 1. Draw two cards", F227)
    if (Array.isArray(v)) return v.map((x, i) => `${numbered ? `${i + 1}.` : '·'} ${item(x).trim().replace(/^(\d+[.)]|[-·•])\s+/, '')}`).join('\n')
    return item(v)
  }
  // [[ … ]]: said only when every slot inside it is filled
  let out = String(t).replace(/\[\[([\s\S]*?)\]\]/g, (m, inner) => (slotNames(inner).every(n => filled(slots[n])) ? inner : ''))
  out = out.replace(/\{([\w.]+)(#?)\}/g, (m, name, hash) => one(name, !!hash, null))
  // Numbered questions the material already answered are left out, the rest renumbered (Feelings & Hopes).
  const omit = Array.isArray(slots.omit) ? slots.omit.map(Number) : []
  if (omit.length) {
    let n = 0
    out = out.split('\n').filter(l => { const m = l.match(/^(\d+)\. /); return !(m && omit.includes(Number(m[1]))) })
      .map(l => (/^\d+\. /.test(l) ? l.replace(/^\d+\./, `${++n}.`) : l)).join('\n')
  }
  return missing.length ? { missing } : { text: out }
}

// A line ready to say: { id, kind, text } or, for a box, { id, kind: 'box', box: { question, header, multiSelect,
// options: [{ label, description }] } } — or { error } in plain words.
// (F230 item 9a) A slot whose value is only a placeholder — "<to fill>", "<milestones>" — or a list item that is: the
// first one as { slot, value }, else null. A line said with it would reach the creative unfilled.
export function placeholderSlot(slots = {}) {
  const isHole = v => typeof v === 'string' && /^\s*<[^<>]{1,60}>\s*$/.test(v)
  for (const [slot, v] of Object.entries(slots || {})) {
    const bad = (Array.isArray(v) ? v : [v]).find(isHole)
    if (bad) return { slot, value: bad.trim() }
  }
  return null
}

export function renderLine(script, id, slots = {}) {
  const line = script && script.lines && script.lines[id]
  if (!line) return { error: `there is no line "${id}" in the script` }
  const s = slots && typeof slots === 'object' && !Array.isArray(slots) ? slots : {}
  // (F219 review fix 10: "1 features" — one feature has its own line, wherever Plan the Sprint is said)
  if (id === 'develop.plan' && String(s.count).trim() === '1') return { error: 'one feature: say "develop.plan.one" instead ("Here\'s what I\'d build next, 1 feature:")' }
  const nested = x => {
    const r = renderLine(script, x.line, x.slots || {})
    return r.error ? `[${r.error}]` : r.kind === 'box' ? `[${x.line} is a box]` : r.text
  }
  if (line.kind !== 'box') {
    const f = fillTemplate(line.text, s, nested)
    return f.missing ? { error: `line "${id}" needs ${f.missing.map(n => `{${n}}`).join(', ')} in "slots"` } : { id, kind: line.kind, text: f.text }
  }
  const q = fillTemplate(line.box.question, s, nested)
  if (q.missing) return { error: `box "${id}" needs ${q.missing.map(n => `{${n}}`).join(', ')} in "slots"` }
  const options = []
  for (const o of line.box.options) {
    if (o.if && !filled(s[o.if])) continue
    const items = o.each ? (Array.isArray(s[o.each]) ? s[o.each] : []) : [null]
    if (o.each && !items.length) return { error: `box "${id}" needs {${o.each}}: the list its options are made from` }
    for (const it of items) {
      const ctxSlots = it && typeof it === 'object' ? { ...s, ...it } : it !== null ? { ...s, '.': it } : s
      const lab = fillTemplate(o.label.replace(/\{\.\}/g, it !== null && typeof it !== 'object' ? String(it) : '{.}'), ctxSlots, nested)
      const desc = fillTemplate(o.description, ctxSlots, nested)
      const miss = [...(lab.missing || []), ...(desc.missing || [])]
      if (miss.length) return { error: `box "${id}" needs ${[...new Set(miss)].map(n => `{${n}}`).join(', ')} for its options` }
      options.push({ label: lab.text.trim(), description: desc.text.trim() })
    }
  }
  if (options.length < 2 || options.length > 4) return { error: `box "${id}" would have ${options.length} option${options.length === 1 ? '' : 's'}; a question box takes 2 to 4 (give at most ${Math.max(0, 4 - line.box.options.filter(o => !o.each && !o.if).length)} items)` }
  return { id, kind: 'box', box: { question: q.text.trim(), header: line.box.header, multiSelect: line.box.many, options } }
}

// The words as compared: bold marks, curly quotes, bullet signs and spacing don't count (Markdown may draw them
// differently); every word and every other sign does.
export function plainWords(t) {
  return String(t ?? '').replace(/\r\n/g, '\n').replace(/\*\*|__/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/^[ \t]*[-*•·][ \t]+/gm, '· ').replace(/\s+/g, ' ').trim()
}
export const isLongSay = text => String(text).length > LONG_SAY.chars || String(text).split('\n').filter(l => l.trim()).length > LONG_SAY.lines

// Was each line said, word for word? said = [{ id, text }]; turn = everything Claude wrote this turn.
// Returns the lines that weren't (empty = all said).
export function unsaid(said, turn) {
  const have = plainWords(turn)
  return (Array.isArray(said) ? said : []).filter(l => l && l.text && !have.includes(plainWords(l.text)))
}

// Does a question box match the script's? pending = the boxes the engine handed out ({ id, box }); questions =
// AskUserQuestion's input.questions. Returns { used: [ids] } or { why } in plain words.
export function boxProblem(pending, questions) {
  const qs = Array.isArray(questions) ? questions : []
  if (!qs.length) return { why: 'BMUZ engine: the question box has no questions.' }
  const used = []
  for (const q of qs) {
    const p = (pending || []).find(b => !used.includes(b.id + '#' + b.n) && plainWords(b.box.question) === plainWords(q && q.question))
    if (!p) {
      const want = (pending || []).filter(b => !used.includes(b.id + '#' + b.n))
      return { why: want.length
        ? `BMUZ engine: the question "${String(q && q.question).slice(0, 120)}" isn't the script's. Ask exactly the box the engine gave you: ${JSON.stringify(want[0].box)}`
        : `BMUZ engine: every question box in this step comes from the script: call ${SAY_TOOL} with the box's line id first, then ask exactly the box it returns.` }
    }
    const labels = (q.options || []).map(o => plainWords(o && o.label))
    const descs = (q.options || []).map(o => plainWords(o && o.description))
    const wantLabels = p.box.options.map(o => plainWords(o.label))
    const wantDescs = p.box.options.map(o => plainWords(o.description))
    if (JSON.stringify(labels) !== JSON.stringify(wantLabels) || wantDescs.some((d, i) => d && d !== descs[i]) || !!q.multiSelect !== !!p.box.multiSelect) {
      return { why: `BMUZ engine: the box "${p.box.question.slice(0, 80)}" must have exactly the script's options, in order, with their descriptions${p.box.multiSelect ? ' (pick any: multiSelect true)' : ''}: ${JSON.stringify(p.box)}` }
    }
    used.push(p.id + '#' + p.n)
  }
  return { used }
}

// What is wrong with a pipeline's script lines (empty = fine): every step's "lines" and "opening" are lines of the
// script, an opening is among the step's lines, a gate's "line" is a box whose "approve" is one of its options but
// not the first (a stray Enter picks the first).
export function checkLines(p, script) {
  const out = []
  for (const s of Array.isArray(p && p.steps) ? p.steps : []) {
    const at = `step "${s && s.id}"`
    for (const id of [...(isList(s.lines) ? s.lines : []), ...(isList(s.opening) ? s.opening : [])]) {
      if (!script.lines[id]) out.push(`${at}: the line "${id}" isn't in the script (plugin/script.md)`)
    }
    for (const id of isList(s.opening) ? s.opening : []) if (!(s.lines || []).includes(id)) out.push(`${at}: its opening "${id}" must be one of its "lines"`)
    if (s.kind === 'gate' && typeof s.line === 'string') {
      const l = script.lines[s.line]
      if (!l || l.kind !== 'box') out.push(`${at} (gate): "line" "${s.line}" must be a box in the script`)
      else {
        const labels = l.box.options.map(o => o.label)
        if (!labels.includes(s.approve)) out.push(`${at} (gate): "approve" must be one of the box's options: ${labels.join(' / ')}`)
        else if (labels[0] === s.approve) out.push(`${at} (gate): "${s.approve}" can't be the box's first option; a stray Enter would approve it`)
      }
    }
  }
  return out
}

// A gate's question and options: from its script box ("line") when it has one, else its own words.
export function gateWords(step, script, vars = {}) {
  if (typeof step.line === 'string' && script && script.lines[step.line] && script.lines[step.line].kind === 'box') {
    const r = renderLine(script, step.line, vars)
    if (!r.error) return { question: r.box.question, options: r.box.options.map(o => o.label) }
  }
  return { question: fill(step.question, vars), options: step.options }
}

// Every live talk step with script lines is told this, in place of ASK_RULE.
export const SCRIPT_RULE = `The script: this step's fixed lines are BMUZ's own words, word for word, from its script. Never write one yourself and never reword one. To say a line, call ${SAY_TOOL} with {"line": "<id>", "slots": {…}} (a list of ids says several at once); it returns the exact words and what to do next. Free answers go in the chat: a "free" line is your whole reply, then end your turn; the creative's next chat message is the answer (Ctrl+V / Alt+V work there). Choices go in a question box: a "box" line returns the box to ask with AskUserQuestion, exactly as given (the engine refuses any other box). Between lines you may add one short sentence of your own only where the script has nothing to say (an example, a pointer to their own words); never a question in plain text. If the creative closes a box without an answer, write ONE short line: "Nothing came through. Paste it as your next message, or say carry on." and end your turn.`

// The step's lines as its prompt lists them: id, kind, slots and the first words.
export function linesList(script, ids) {
  return (isList(ids) ? ids : []).map(id => {
    const l = script && script.lines[id]
    if (!l) return `- ${id}: (missing from the script)`
    const words = l.kind === 'box' ? l.box.question : l.text
    const slots = [...new Set([...slotNames(l.kind === 'box' ? [l.box.question, ...l.box.options.map(o => `${o.label} ${o.description}`)].join(' ') : l.text), ...(l.kind === 'box' ? l.box.options.filter(o => o.each || o.if).map(o => o.each || o.if) : [])])]
    return `- ${id} (${l.kind}${slots.length ? `; slots: ${slots.join(', ')}` : ''}): "${plainWords(words).slice(0, 90)}${plainWords(words).length > 90 ? '…' : ''}"`
  }).join('\n')
}

// What Claude is told to do with a line it asked for (the say tool's answer). auto = nobody can answer.
export function sayNext(r, auto, last = false) {
  if (r.kind === 'box') return auto
    ? 'Auto run: nobody can answer the box. Take the creative\'s answer from the test answers (or the sensible default, listed in "asks") and carry on; don\'t call AskUserQuestion.'
    : 'Call AskUserQuestion now with exactly this box: the same question, header, options (label and description) and multiSelect, in this order. Nothing else written before it beyond one short line.'
  if (r.kind === 'free') return auto
    ? 'Auto run: write exactly the "say" text now, as text in your reply before any other tool call; then take the creative\'s answer from the test answers (or the sensible default, listed in "asks") and carry on in this turn.'
    : 'Write exactly the "say" text as your whole reply — nothing before or after it, no question box — and end your turn. The creative\'s next chat message is the answer.'
  if (isLongSay(r.text) && !auto) return 'Write exactly the "say" text as your reply. It is long, so no question box in this turn (it would cover the text): end your turn after it (the engine carries the step on), or call step_done if the step is finished.'
  return 'Write exactly the "say" text now, as text in your reply before any other tool call, then carry on with the step in this turn.'
}

// The engine's short message when a step's long line was shown and the step goes on (its next question comes in a
// turn of its own, so the box doesn't cover the text). null once MAX_NUDGES are used (F232 review: a step that keeps
// re-saying a long line without step_done looped forever; from there the stall path and the watchdog take it).
export function continueLine(step, n = 0) {
  if (n >= MAX_NUDGES) return null
  return `BMUZ engine — this message comes from the BMUZ engine, not the creative: carry on with step "${step.id}"${step.title ? ` (${step.title})` : ''} from where it is.`
}

// What the engine says when a line wasn't said word for word (the turn's end). null once MAX_NUDGES are used.
export function unsaidNudge(step, lines, n = 0) {
  if (n >= MAX_NUDGES || !lines.length) return null
  return `BMUZ engine — this message comes from the BMUZ engine, not the creative (step "${step.id}"). The script line${lines.length > 1 ? 's' : ''} ${lines.map(l => `"${l.id}"`).join(', ')} ${lines.length > 1 ? 'were' : 'was'} not written word for word. Write exactly this, nothing changed, then carry on:\n\n${lines.map(l => l.text).join('\n\n')}`
}

// The band's words for a step with a script number ("2.3") and title: "Define · 3 of 8 · The Pitch". The welcome
// ("2.0") isn't counted. Steps without a number take the nearest numbered step above them. null = not numbered.
export function stepPlace(p, step) {
  if (!p || !step) return null
  const steps = p.steps
  let s = step
  for (let i = steps.indexOf(step); i >= 0 && !(s && s.no && s.title); i--) s = steps[i]
  if (!s || !s.no || !s.title) return null
  const numbered = [...new Set(steps.filter(x => x.no && !/\.0$/.test(x.no)).map(x => x.no))]
  const stage = stageOf(p.id)
  const name = stage ? stage.name : p.id
  if (/\.0$/.test(s.no)) return `${name} · ${s.title}`
  return `${name} · ${numbered.indexOf(s.no) + 1} of ${numbered.length} · ${s.title}`
}

// ---- Stepping in (F215): something broken, said at any step, is logged as a bug on a side trip ----
// The approved script's "Any time: when the designer steps in" (framework research/bmuz-vision/bmuz-design-doc.html):
// "Logged as a bug: [B004 · Score cut off on phone · P2 — annoying, not blocking]. It doesn't block what we're doing, so
// I'll fix it [after F07]." The report never touches the step it interrupts: its record (results, retries, the lines
// said, the box it asked) stays as it was, and the step carries on where it was.
export const BUG_TOOL = 'mcp__bmuz__bug'
// F216: a new idea mid-loop (Develop's step-in list: "it goes on Ideas for Later and comes back at the milestone where
// it fits"): noted by the engine's tool, never built now.
export const IDEA_TOOL = 'mcp__bmuz__idea'
// F216 review fix 2a: the builder helper's only way to run anything (plugin/scripts/run.mjs): no Bash for it.
export const RUN_TOOL = 'mcp__bmuz__run'
export const RUN_WHAT = ['test', 'check', 'install', 'screenshot']
export const IDEA_RULE = `A new idea (the creative brings something new, not a tweak to what we're building and not a bug): it isn't built now. Note it with ${IDEA_TOOL} {"idea": "their idea in a few words"}, write the line it returns word for word, then carry on exactly where the step was.`
// The P-levels, from the /bug skill (the script itself names only "P2 — annoying, not blocking").
export const BUG_LEVELS = 'P0 = a crash, the game can\'t go on, data lost, or the live build broken · P1 = a feature doesn\'t work as designed · P2 = minor, or has a workaround · P3 = cosmetic'
// The focus rule (the /bug skill): fix now only for these; everything else is logged and fixed in order.
export const FIX_NOW = ['P0', 'blocks', 'quick']

// Every talk step is told this, live or auto, so a step-in is never mistaken for the step's own answer.
export const STEP_IN_RULE = `Stepping in: if the creative says something is broken (a bug, in their own words or "bmuz bug …"), that is a side trip, not an answer to this step. Report it with ${BUG_TOOL}: {"title": "a few words", "level": "P0".."P3", "steps": [...], "expected": "...", "actual": "...", "often": "..."} (${BUG_LEVELS}). Ask at most one question first, and only if something essential is missing: ${BUG_TOOL} {"ask": true} hands you the box. Fix now only for a P0, a bug that blocks this step, or a minutes-long fix in code being changed right now: add "now": "P0" | "blocks" | "quick". Write the line it returns word for word, then carry on with this step exactly where it was (its record is kept).`

// A plain message that may report something broken (a hint only: Claude judges whether it is a bug). Not "wrong":
// Ideate's "What did I get wrong?" is answered with it, and that is a correction, not a bug.
export function soundsBroken(text) {
  const t = String(text || '')
  if (/^\s*bmuz\b/i.test(t)) return false
  return /\b(bug|buggy|broken|breaks|crash(es|ed)?|glitch\w*|doesn'?t work|isn'?t working|not working|won'?t (load|open|start)|cut off|off by one|freez\w*|stuck)\b/i.test(t)
}

// "bmuz bug …" as typed: { kind: 'fix', id } (no words, an id, "fix [id]"), 'sweep', 'list', 'stop', 'verified' (id),
// or 'report' with the creative's words. null = not a bug command.
export function bugCommand(text) {
  const m = String(text || '').match(/^\s*bmuz bug\b\s*([\s\S]*)$/i)
  if (!m) return null
  const rest = m[1].trim()
  if (!rest) return { kind: 'fix', id: null }
  let x
  if ((x = rest.match(/^(?:fix\s*)?(B\d{3,})$/i))) return { kind: 'fix', id: x[1].toUpperCase() }
  if (/^fix$/i.test(rest)) return { kind: 'fix', id: null }
  if (/^sweep$/i.test(rest)) return { kind: 'sweep' }
  if (/^list$/i.test(rest)) return { kind: 'list' }
  if (/^stop$/i.test(rest)) return { kind: 'stop' }
  if ((x = rest.match(/^verified\s+(B\d{3,})$/i))) return { kind: 'verified', id: x[1].toUpperCase() }
  return { kind: 'report', words: rest }
}

// What Claude is told beside a step-in (prompt context, the creative never sees it). typed = "bmuz bug <words>".
export function stepInNote(words, { typed = false, auto = false } = {}) {
  const head = typed ? `BMUZ engine: the creative stepped in to report a bug: "${String(words).slice(0, 400)}".` : 'BMUZ engine: if this message reports something broken, it is a step-in, not an answer to the step.'
  return `${head} Report it with ${BUG_TOOL} (title, level, steps, expected, actual, how often; ${BUG_LEVELS}).${auto ? ' Auto run: ask nothing.' : ` Ask at most one question first, only if something essential is missing (${BUG_TOOL} {"ask": true} hands you the box).`} Add "now": "P0" | "blocks" | "quick" only for a P0, a bug that blocks the current step, or a minutes-long fix in code being changed right now. Write the line it returns word for word, then carry on where you were.`
}

// The current sprint's feature, from a BMUZ SPRINT.md ("## F07 … Weather cards" with a task still open): "F07", or null.
// (Develop isn't on the engine yet, so "fix it after [F07]" reads the plan file.)
export function sprintFeature(text) {
  const parts = String(text || '').replace(/\r\n/g, '\n').split(/^(?=## F\d+)/m)
  for (const p of parts) {
    const m = p.match(/^## (F\d+)\b/)
    if (m && /^- \[ \]/m.test(p)) return m[1]
  }
  return null
}

// "after F07" / "after The Rulebook" / "in the next bug fix run": when a logged bug gets fixed (the script's [after F07]).
export function bugWhen(p, state, sprint = null) {
  if (sprint) return `after ${sprint}`
  const step = state && state.current ? stepById(p, state.current) : null
  const place = step ? stepPlace(p, step) : null
  const title = place ? place.split(' · ').pop() : step ? step.description || step.id : null
  return title ? `after ${title}` : 'in the next bug fix run'
}

// Where a step-in came from and where it goes back to, in words: "Design · 2 of 10 · The Rulebook".
export function placeWords(p, state) {
  const step = state && state.current ? stepById(p, state.current) : null
  if (!step) return state && state.status === 'done' ? `${(stageOf(p.id) || {}).name || p.id} (finished)` : `${(stageOf(p.id) || {}).name || p.id}`
  return stepPlace(p, step) || `${(stageOf(p.id) || {}).name || p.id} · ${step.title || step.id}`
}

// Fix now? The creative's P0 is always now; "blocks" / "quick" only as the focus rule allows. Returns true / false.
export function isFixNow(report) {
  return !!report && (report.level === 'P0' || FIX_NOW.includes(report.now))
}

// The side trip's record: .bmuz/side.json { pipeline, bug, from, n, phase, place, sweep }. Problem in plain words, or null.
export function sideProblem(side) {
  if (!side || typeof side !== 'object') return 'it is not an object'
  if (!NAME_RE.test(String(side.pipeline)) || !NAME_RE.test(String(side.from))) return 'its "pipeline" or "from" is not a pipeline name'
  // (F216: a feature run of Develop's loop carries its feature, F07, instead of a bug)
  if (side.feature !== undefined ? !/^F\d+$/.test(String(side.feature)) : !/^B\d{3,}$/.test(String(side.bug))) return side.feature !== undefined ? 'its "feature" is not a feature number like F07' : 'its "bug" is not a bug number like B004'
  if (!['enter', 'on', 'leave'].includes(side.phase)) return 'its "phase" is not enter, on or leave'
  if (!Number.isInteger(side.n) || side.n < 1) return 'its "n" is not a run number'
  if (side.at !== undefined && side.at !== null && !NAME_RE.test(String(side.at))) return 'its "at" is not a step name'
  return null
}

// ---- Loops (F216): a script step with "loop" runs another pipeline once per item, each run a side trip ----
// What a side trip is about (a bug, or a feature of Develop's loop), its record folder and its list of runs.
export const sideItem = side => (side && side.feature !== undefined ? side.feature : side && side.bug)
export const sideRuns = side => (side && side.feature !== undefined ? 'feature-runs' : 'bug-runs')
export const sideRecord = side => `${sideRuns(side)}/${side.n}-${sideItem(side)}`

// A loop script's answer, its last line of JSON: { start: { feature, at } } (run the loop's pipeline for it) ·
// { wait: [ids], features: [names] } (nothing an auto run may do now: the rest waits for the creative) · { done: true }.
// Returns that, or { error } in plain words.
export function loopAnswer(stdout) {
  const last = String(stdout || '').trim().split('\n').pop() || ''
  let j
  try { j = JSON.parse(last) } catch (err) { return { error: `the loop script didn't answer with one line of JSON: ${last.slice(0, 160)}` } }
  if (j && j.start && /^F\d+$/.test(String(j.start.feature)) && (j.start.at == null || NAME_RE.test(String(j.start.at)))) return { start: { feature: j.start.feature, at: j.start.at || null } }
  if (j && Array.isArray(j.wait)) return { wait: j.wait.map(String), features: Array.isArray(j.features) ? j.features.map(String) : j.wait.map(String) }
  if (j && j.done === true) return { done: true }
  return { error: `the loop script's answer isn't start, wait or done: ${last.slice(0, 160)}` }
}

// F216: while a pipeline runs, a Bash command (the builder helper's, or a setup step's) stays inside the project: no
// path outside it, no "..", nothing in the engine's own .bmuz folder, no push, no home folder. A guard against
// mistakes, not a sandbox. Returns the reason it's refused, or null.
export function bashProblem(dir, command) {
  const c = String(command || '')
  const root = String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (!c.trim()) return null
  if (/(^|[\s"'=/])\.\.([\/\\\s"']|$)/.test(c)) return 'it reaches outside the project ("..")'
  // (reading Develop's brief, tries and review there is fine — the builder's own instructions — changing anything isn't)
  const writes = /(>|\b(rm|mv|cp|del|tee|touch|mkdir|rmdir|chmod|truncate|Remove-Item|Set-Content|Out-File|New-Item)\b|sed\s+-i)/i.test(c.replace(/\d?>\s*\/dev\/null/g, ''))
  const onlyDevelop = [...c.matchAll(/\.bmuz([\/\\][^\s"';|&)]*)?/gi)].every(m => /^[\/\\]develop[\/\\][\w.-]+\.(md|json)$/i.test(m[1] || ''))
  if (/(^|[\s"'=/\\])\.bmuz([\/\\\s"']|$)/i.test(c) && (writes || !onlyDevelop)) return 'it touches the engine\'s own .bmuz folder'
  if (/(^|[\s;&|(])(~|\$HOME|%USERPROFILE%|\$env:USERPROFILE)/i.test(c)) return 'it reaches the home folder'
  if (/\bgit\s+(push|remote|config\s+--global)\b/.test(c)) return 'pushing or changing git\'s remotes and settings is the creative\'s call'
  // an absolute path must be inside the project (Windows paths compare without case)
  const win = /^[A-Za-z]:/.test(root)
  for (const m of c.matchAll(/(?:^|[\s"'=(])((?:[A-Za-z]:)?[\/\\][^\s"';|&)]*)/g)) {
    const p = m[1].replace(/\\/g, '/')
    if (p === '/dev/null') continue
    const a = win ? p.toLowerCase() : p
    const r = win ? root.toLowerCase() : root
    // (git-bash writes C:\x as /c/x)
    const posix = win ? r.replace(/^([a-z]):/, '/$1') : r
    if (a === r || a.startsWith(r + '/') || a === posix || a.startsWith(posix + '/')) continue
    // (a flag like /c or a URL path is not a file path)
    if (/^\/[a-z]$/i.test(p) || /^\/\//.test(p)) continue
    return `it names a path outside the project (${p.slice(0, 80)})`
  }
  return null
}

// A file path Claude gave, as a project path ("src/score.js"), or null when it is outside the project or in .bmuz.
// dir = the project folder with forward slashes. Windows paths compare without case.
export function projectPath(dir, path) {
  if (typeof path !== 'string' || !path.trim()) return null
  const p = path.trim().replace(/\\/g, '/')
  const root = String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const abs = /^([A-Za-z]:)?\//.test(p)
  let rel = p
  if (abs) {
    const win = /^[A-Za-z]:/.test(root)
    const a = win ? p.toLowerCase() : p
    const r = win ? root.toLowerCase() : root
    if (!a.startsWith(r + '/')) return null
    rel = p.slice(root.length + 1)
  }
  rel = rel.replace(/^\.\//, '')
  return isSafePath(rel) ? rel : null
}

// ---- Own edits (F216 review fixes 5–6): what a step's own Write / Edit calls changed ----
// The engine reads a file before and after each Write / Edit a step makes (Claude's or a helper's) and keeps, per
// step and file, the text it left ("after", a fingerprint) and, for a JSON file, each value it changed (key: from →
// to). An undo then puts back only those (never a value the creative changed meanwhile, like a Dev Kit save), a
// tune's "one setting" is counted from them, and a feature's commit takes only those files.
export function textSha(text) {
  // (FNV-1a, 32 bits: enough to tell "the text the step left" from "changed since")
  let h = 0x811c9dc5
  for (const ch of String(text ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
const parseJson = t => { try { const v = JSON.parse(String(t)); return v && typeof v === 'object' ? v : null } catch (err) { return null } }
const leafMap = (v, at = '', out = new Map()) => {
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) leafMap(x, at ? `${at}.${k}` : k, out) } else out.set(at, JSON.stringify(v))
  return out
}
// The record after one more own write: prev (or null), the text before the call, the text after it.
export function ownEntry(prev, before, after) {
  const created = prev ? !!prev.created : before === null
  const a = parseJson(after)
  const b = parseJson(before)
  let keys = null
  if (a && (b || before === null) && (!prev || prev.keys)) {
    keys = { ...((prev && prev.keys) || {}) }
    const was = leafMap(b || {})
    const now = leafMap(a)
    for (const k of new Set([...was.keys(), ...now.keys()])) {
      if (was.get(k) === now.get(k)) continue
      const from = k in keys ? keys[k].from : was.has(k) ? JSON.parse(was.get(k)) : null
      const to = now.has(k) ? JSON.parse(now.get(k)) : null
      if (JSON.stringify(from) === JSON.stringify(to)) delete keys[k]
      else keys[k] = { from, to }
    }
  }
  return { after: textSha(after), keys, created }
}
const valueAt = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
function setAt(obj, key, v) {
  const parts = key.split('.')
  let o = obj
  for (const k of parts.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k] }
  if (v === null || v === undefined) delete o[parts[parts.length - 1]]
  else o[parts[parts.length - 1]] = v
}
// The step's own changes still standing in the file now: [{ key, from, to }] (a value changed again since is theirs).
export function ownChanges(entry, now) {
  if (!entry || !entry.keys) return []
  const cur = parseJson(now)
  return Object.entries(entry.keys).filter(([k, c]) => cur && JSON.stringify(valueAt(cur, k) ?? null) === JSON.stringify(c.to)).map(([key, c]) => ({ key, from: c.from, to: c.to }))
}
// What an undo does with one file: { text } (write it), { remove } (the step made it), { keep } (someone else's now).
export function ownRollback(entry, checkpointText, now) {
  if (!entry) return { keep: true }
  if (now === null) return { keep: true }
  if (textSha(now) === entry.after) return checkpointText === null ? { remove: true } : { text: checkpointText }
  if (entry.created || !entry.keys) return { keep: true }
  const cur = parseJson(now)
  if (!cur) return { keep: true }
  const mine = ownChanges(entry, now)
  if (!mine.length) return { keep: true }
  for (const c of mine) setAt(cur, c.key, c.from)
  return { text: JSON.stringify(cur, null, 2) + '\n' }
}

// ---- Protected writes (F216 review fix 2b): Develop's builder can't change what proves its work ----
// A test file, as the proof counts them: under tests/, test/ or __tests__/, or named *.test.* / *.spec.*.
export const isTestFile = f => /(^|\/)(tests?|__tests__)\//.test(String(f)) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(String(f))
// The text a Write / Edit / MultiEdit would leave in a file whose text is `before` (null: not there yet).
export function editedText(call, before) {
  const one = (text, e) => {
    const from = String(e.old_string ?? '')
    if (!from) return String(e.new_string ?? '')
    return e.replace_all ? text.split(from).join(String(e.new_string ?? '')) : text.replace(from, () => String(e.new_string ?? ''))
  }
  if (call.tool === 'Write') return String(call.content ?? '')
  if (call.tool === 'Edit') return one(String(before ?? ''), call)
  if (call.tool === 'MultiEdit') return (Array.isArray(call.edits) ? call.edits : []).reduce(one, String(before ?? ''))
  return null
}
// Why a protected step's helper may not make this change (null = it may): the plan files (.planning/: the roadmap, the
// sprint and the plans change only through sprint.mjs), package.json's "scripts" (the test command is the proof's), and
// an existing test emptied.
export function protectProblem(rel, before, after) {
  const f = String(rel || '')
  if (/^\.planning\//.test(f)) return `${f} is a plan file: the roadmap, the sprint and the plans change only through the engine`
  if (f === 'package.json' && before !== null && after !== null) {
    const a = parseJson(before)
    const b = parseJson(after)
    if (!b) return 'package.json would no longer be valid JSON'
    if (JSON.stringify((a && a.scripts) || {}) !== JSON.stringify(b.scripts || {})) return 'package.json\'s "scripts" (the test command among them) are not the builder\'s to change'
  }
  if (isTestFile(f) && before !== null && String(after ?? '').trim() === '') return `this empties the existing test ${f}: a test is never deleted to make the build pass`
  return null
}
