export const meta = {
  name: 'build-flow',
  description: 'Develop build & prove (the script\'s 4.4): one fresh builder helper builds one feature from its brief, every rule with a test; separately, a read-only reviewer checks it and a second helper confirms each finding; the confirmed findings go back to a builder once. The engine\'s script proves it (the tests run and pass), never a helper\'s word',
  whenToUse: 'Started by the BMUZ engine in the feature pipeline; args { mode: "build" | "review" | "fix", brief, tries, review }',
  phases: [
    { title: 'Build', detail: 'one fresh builder: code, a test for every rule, screenshots when there is a UI' },
    { title: 'Review', detail: 'a reviewer who did not build it, reading only; each finding confirmed by another reader' },
    { title: 'Fix', detail: 'the confirmed findings, once' },
  ],
}

// The design: the approved script's 4.4 Build & Prove ("Every rule gets a test, and every screen size gets a
// screenshot"), the /develop skill's unattended runs (one fresh helper per feature, briefed with the feature's sprint
// section; tests in the foreground with a timeout) and the clash flow's separate reviewers (they didn't write it).
// The engine runs each mode as its own step, so each gets only its own tools: the builder may use Bash (inside the
// project, the engine checks), Write and Edit; the reviewer and the confirmer only Read, Glob and Grep. "Done" is
// sprint.mjs prove, run by the engine after the build and after the fix: the tests run and pass, or it isn't done.

let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = {} } }
a = a || {}
const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const list = v => (Array.isArray(v) ? v : v ? [v] : [])
const brief = text(a.brief) || '.bmuz/develop/brief.md'
const tries = text(a.tries) || '.bmuz/develop/tries.md'
const review = text(a.review) || '.bmuz/develop/review.md'

const REPORT = {
  type: 'object',
  properties: {
    tests: { type: 'array', items: { type: 'object', properties: { rule: { type: 'string' }, file: { type: 'string' }, name: { type: 'string' } }, required: ['rule', 'file', 'name'] } },
    changed: { type: 'array', items: { type: 'string' } },
    try: { type: 'string' },
    pc: { type: 'string' },
    phone: { type: 'string' },
    screens: { type: 'array', items: { type: 'object', properties: { size: { type: 'string' }, file: { type: 'string' } }, required: ['size', 'file'] } },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['tests', 'changed', 'try'],
}
const RULES = [
  'Rules:',
  `- Read ${brief} first (the feature: what the creative will see, when it is done, what it is not doing yet, its tasks), then the files it names. The rulebook is the single truth.`,
  '- Change files inside this project only (relative paths). Never touch the .bmuz folder, never commit or push: the engine commits.',
  '- Every rule this feature builds gets a test (node --test unless package.json says otherwise), named "<feature id> <the rule in a few words>". Tests check behaviour, not wording.',
  '- Every number a designer could tune (speeds, counts, odds) lives in content/ JSON (content/tuning/*.json or content/data/*.json), never written in the code.',
  '- Run the tests in the foreground with a timeout (npm test), never start one in the background and wait. Fix until they pass.',
  '- If the project has a UI (an index.html, or a "dev" script in package.json), take a screenshot of each screen this feature changes at phone size (390×844) and desktop size (1280×800), saved as .planning/screens/<feature id>-<screen>-phone.png and -desktop.png (Playwright through npx, if it is there).',
  '- Human-readable code, small changes, nothing beyond the feature.',
  '- Your answer: "tests" (each {rule, file, name}: the exact test name), "changed" (up to 3 short lines from the player\'s side: what they can now do or see), "try" (one thing for the creative to try), "pc" and "phone" (how to play it: a link or a command; leave out if none), "screens" ({size: "phone"|"desktop", file}), "files" (what you changed).',
].join('\n')

if (a.mode === 'review') {
  phase('Review')
  const FOUND = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' } }, required: ['file', 'what', 'why'] } } }, required: ['findings'] }
  const found = await agent([
    `You review a feature another helper just built in this game project. You did not build it. Read ${brief} (what it should do) and the rulebook, then the code and tests it changed (git is not available to you: use Read, Glob and Grep).`,
    'Look for: a rule of the brief or the rulebook the code gets wrong or leaves out; a rule with no test, or a test that would pass even if the rule were broken; a tunable number written in the code instead of content/; anything outside the feature.',
    'Only real problems, the most important first, at most 5. None is a fine answer. Use only Read, Glob and Grep. Each finding: the file, what is wrong, why it matters, in plain words.',
  ].join('\n'), { label: 'review', phase: 'Review', schema: FOUND })
  const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, why: { type: 'string' } }, required: ['real', 'why'] }
  const findings = list(found && found.findings).filter(f => text(f.what)).slice(0, 5)
  const judged = await parallel(findings.map((f, i) => () => agent([
    `Another reviewer says this about a feature just built in this project (the feature is in ${brief}): in ${text(f.file)}: ${text(f.what)} (${text(f.why)}).`,
    'Check it yourself in the files (Read, Glob, Grep only). Is it a real problem that should be fixed now? If you are not sure, say real: false.',
  ].join('\n'), { label: `confirm ${i + 1}`, phase: 'Review', schema: VERDICT })))
  const confirmed = findings.filter((f, i) => judged[i] && judged[i].real).map(f => ({ file: text(f.file), what: text(f.what), why: text(f.why) }))
  if (findings.length > confirmed.length) log(`${findings.length - confirmed.length} finding(s) not confirmed, dropped`)
  return { findings: confirmed, found: findings.length }
}

if (a.mode === 'fix') {
  phase('Fix')
  const got = await agent([
    `A reviewer who didn't build it checked the feature in ${brief}. Read ${review}: its confirmed findings. If it says there are none, change nothing and answer with the tests as they are (read them from the test files).`,
    'Otherwise fix each finding, keep every test passing, and add a test where a finding says a rule has none.',
    RULES,
  ].join('\n\n'), { label: 'fix the findings', phase: 'Fix', schema: REPORT })
  if (!got) throw new Error('the builder fixing the findings did not come back')
  return got
}

phase('Build')
const got = await agent([
  'You are the builder for one feature of a game. The creative (a game designer, not an engineer) will play it and approve it.',
  `If ${tries} has anything in it, an earlier try failed the engine's check: read why first, and after two failed tries take a simpler way.`,
  RULES,
].join('\n\n'), { label: 'build the feature', phase: 'Build', schema: REPORT })
if (!got) throw new Error('the builder did not come back')
return got
