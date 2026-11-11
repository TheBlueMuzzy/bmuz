export const meta = {
  name: 'sketch-flow',
  description: 'Design sketches (the script\'s 3.1 and 3.7): one fresh helper per sketch builds its page from the /sketch starter (knobs, 3 presets, "Copy values for Claude"), a numbers question gets a simulation instead; or, for Look & Sound, the look sketches side by side at real phone size. They decide nothing',
  whenToUse: 'Started by the BMUZ engine in the design pipeline; args { plan, dir } (sketches) or { mode: "look", looks, refs, game, out }',
  phases: [{ title: 'Build', detail: 'one helper per sketch, each alone, writing only its own file' }],
}

// The design: the approved script's 3.1 Sketches, Round 1 ("each sketch is built … and added as a tab on the project
// page"; "a question about numbers or odds gets a simulation or the math instead of a sketch") and 3.7 Look & Sound
// ("look sketches, side by side at real phone size"). Rules from the /sketch skill: start from the starter, keep its
// sketch kit (knobs panel, presets, "Copy values for Claude", the help lines and number boxes); one mechanic per
// sketch (GMTK); decide how you'll know before building (Schell). The pages were copied from the starter by
// design.mjs sketch-prep; each helper changes only its own file.

let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch (e) { a = {} } }
a = a || {}
const text = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
const list = v => (Array.isArray(v) ? v : v ? [v] : [])
const safe = (p, ext) => typeof p === 'string' && p.endsWith(ext) && !/^[\/\\]|^[A-Za-z]:|\\/.test(p) &&
  p.split('/').every(x => x && x !== '..' && x !== '.') && p.split('/')[0].toLowerCase() !== '.bmuz'
const dir = safe(`${a.dir || ''}/x.html`, '.html') ? a.dir : '.planning/research/sketches'
// (the same names design.mjs sketch-prep gave the files)
const slug = s => text(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sketch'
const RULES = [
  'Rules:',
  '- Change only the one file named here. Plain HTML, CSS and JavaScript in that one file; nothing loaded from the network.',
  '- The person who plays it is a game designer, not an engineer: on-screen words are short and plain.',
  '- It must work on a phone (touch) and on a desktop (mouse) at any size.',
  '- Use the Read tool, then the Write tool (the whole file) or the Edit tool. Reply with just the word built.',
].join('\n')

phase('Build')
if (a.mode === 'look') {
  const out = safe(a.out, '.html') ? a.out : `${dir}/look-sketches.html`
  const looks = list(a.looks).map(l => (l && typeof l === 'object' ? { id: text(l.id), name: text(l.name), describe: text(l.description || l.describe) } : { id: '', name: text(l), describe: '' })).filter(l => l.name)
  if (!looks.length) throw new Error('the look sketches need "looks": the 3 looks to show')
  const said = await agent([
    `Write a new file ${out}: ${looks.length} look sketches for the game "${text(a.game) || 'this game'}", side by side, each one a phone-sized frame (390 × 844 CSS pixels, scaled down to fit when the window is narrower) showing the same moment of play in a different visual style.`,
    `The looks:\n${looks.map((l, i) => `${l.id || String.fromCharCode(65 + i)}: ${l.name}${l.describe ? ` — ${l.describe}` : ''}`).join('\n')}`,
    list(a.refs).length || text(a.refs) ? `The designer's references: ${list(a.refs).map(text).join('; ') || text(a.refs)}` : '',
    'Each frame is a <section data-look="A"> (B, C…) with the look\'s letter and name above it, drawn with CSS shapes, gradients and system fonts (no images, no network), showing the game\'s main pieces at their real size so the designer can judge readability.',
    RULES,
  ].filter(Boolean).join('\n\n'), { label: 'build the look sketches', phase: 'Build' })
  return { out, looks: looks.length, said: text(said) }
}

const plan = list(a.plan).filter(x => x && text(x.name))
const jobs = plan.map((x, i) => {
  const id = /^S\d{2,}$/.test(text(x.id)) ? text(x.id) : `S${String(i + 1).padStart(2, '0')}`
  const base = `${dir}/${id}-${slug(x.name)}`
  const numbers = x.numbers === true || /^(yes|true)$/i.test(text(x.numbers))
  const knobs = list(x.knobs).map(text).filter(Boolean)
  if (numbers) {
    return { id, label: `simulate ${id}`, prompt: [
      `Write the file ${base}.sim.mjs (replace what is there): a Node.js script with no packages that answers this numbers question by simulation or exact math: "${text(x.question)}". It is for the game "${text(a.game) || 'this game'}"; read .planning/design/RULEBOOK.md and .planning/GDD.md (the rules) with the Read tool first, if they exist.`,
      'It must run in under 30 seconds and print, as its LAST line, one line of JSON: {"how": "<what was run, like 10,000 simulated games>", "found": "<the answer in one plain sentence, with the numbers>"}.',
      RULES,
    ].join('\n\n') }
  }
  return { id, label: `build ${id}`, prompt: [
    `Build the sketch in ${base}.html. It is a copy of the BMUZ sketch starter: read it first.`,
    `The sketch: ${id} ${text(x.name)}, for the game "${text(a.game) || 'this game'}". It answers one question: "${text(x.question)}". How we'll know: ${text(x.test) || 'the designer can tell by playing it'}.`,
    'Read .planning/design/RULEBOOK.md and .planning/GDD.md with the Read tool for what the game is, if they exist.',
    `Replace the demo (the goo blob: the GOO values, KNOBS, KNOB_HELP and the part marked "The sketch itself (replace this demo)") with a small playable mock of just this question.${knobs.length ? ` Its knobs: ${knobs.join(', ')} (each with a sensible min, max and step and a one-line help in KNOB_HELP).` : ' Give it 2 to 6 knobs that change what the question is about.'} Rename GOO if you like, but keep the knobs in one object.`,
    'KEEP the sketch kit exactly as it is: the top bar, the Knobs panel, the 3 presets, the "Copy values for Claude" button, the knob help lines and the number boxes, and window.sketch at the end. Set the <title> to "' + id + ': ' + text(x.name) + '" and the description meta to what to look for when playing.',
    RULES,
  ].join('\n\n') }
})
if (!jobs.length) return { built: 0 }
const got = await parallel(jobs.map(j => () => agent(j.prompt, { label: j.label, phase: 'Build' })))
const failed = jobs.filter((_, i) => !got[i]).map(j => j.id)
if (failed.length) log(`no answer from: ${failed.join(', ')}`)
return { built: jobs.length - failed.length, failed }
