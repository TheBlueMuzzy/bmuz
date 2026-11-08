// Scripted runs in real Claude sessions (claude -p, and one background session), judged from the
// engine's journal and files — the proof's 16 checks that need a real session (docs/checks.md).
// node tests/headless.mjs [scenario ...]   (no names = all; ~10 min; uses haiku)
// Runs one at a time in project/. Prints PASS/FAIL per check; exits 1 on any FAIL.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
for (const [name, run] of Object.entries(scenarios)) {
  if (pick.length && !pick.includes(name)) continue
  console.log(`--- ${name} (${new Date().toLocaleTimeString()})`)
  await run()
}
setup('fresh')
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed} pass, ${failed} fail`)
process.exit(failed ? 1 : 0)
