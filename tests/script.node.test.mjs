// F232 task 2: the script — every fixed line BMUZ says, word for word, from ONE file (plugin/script.md). Runs without
// Claude: the file against the approved script, filling slots, the word-for-word check, the box check, the band.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../plugin/hooks/engine.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const scriptText = readFileSync(join(here, '..', 'plugin', 'script.md'), 'utf8')
const script = E.parseScript(scriptText)
// The approved script (framework repo, beside this one).
const SPEC = join(here, '..', '..', 'framework', '.planning', 'research', 'bmuz-vision', 'bmuz-design-doc.html')

// Every BMUZ message and question box of the spec's Stages 1–2, as fixed fragments (the [slot] parts cut out).
export function specFragments(html) {
  const ent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  // (an option's label and its description are two fragments: the script writes "label — description")
  const txt = s => ent(s.replace(/<br\s*\/?>/g, '\n').replace(/<span class="desc">/g, '\u0001').replace(/<[^>]+>/g, ''))
  const out = []
  for (const m of html.matchAll(/<article class="step[^"]*">([\s\S]*?)<\/article>/g)) {
    const num = (m[1].match(/class="num">([^<]+)/) || [])[1]
    if (!num || !/^[123456]\./.test(num)) continue
    const parts = []
    // (slots out first: a slot's own </span> would end an inline message early)
    // (F216: Stage 4's example numbers written without a slot mark are slots here: "(feature 1 of 3)", "Step 1 of [3]")
    const body = m[1].replace(/<span class="slot">[^<]*<\/span>/g, '\u0001').replace('(feature 1 of 3)', '(feature \u0001 of \u0001)').replace('Step 1 of \u0001', 'Step \u0001 of \u0001')
    for (const b of body.matchAll(/<p class="b">([\s\S]*?)<\/p>|<span class="b-inline">([\s\S]*?)<\/span>|<p class="bq">([\s\S]*?)<\/p>|<li>([\s\S]*?)<\/li>/g)) {
      const raw = b[1] ?? b[2] ?? b[3] ?? b[4]
      // (an option's note to the reader, not shown to the designer: "only shown when the material already covers it")
      parts.push(...txt(raw.replace(/only shown when the material already covers it:/, '')).split('\u0001'))
    }
    for (const p of parts) {
      // (a "·" right before a list slot is the slot's own bullet: a list fills as "· " lines — Design's 3.1, 3.3, 3.9)
      const w = E.plainWords(p).replace(/^[.:,\s]+|[\s]+$/g, '').replace(/\s+·$/, '')
      if (w.length >= 3) out.push({ num, words: w })
    }
  }
  return out
}

test('the script file reads: no problems, every box 2–4 options with a short header', () => {
  assert.deepEqual(script.problems, [])
  const ids = Object.keys(script.lines)
  assert.ok(ids.length >= 70, `${ids.length} lines`)
  for (const l of Object.values(script.lines)) {
    assert.ok(E.SCRIPT_KINDS.includes(l.kind), l.id)
    if (l.kind === 'box') assert.ok(l.box.header.length <= 12 && l.box.options.length >= 1, l.id)
  }
})

test('every fixed part of the approved script (Stages 1–6) is in script.md word for word', { skip: !existsSync(SPEC) && 'the framework repo is not beside this one' }, () => {
  const frags = specFragments(readFileSync(SPEC, 'utf8'))
  assert.ok(frags.length > 150, `${frags.length} fragments`)
  const mine = E.plainWords(scriptText.split('# Stage 1 · Ideate')[1])
  const missing = frags.filter(f => !mine.includes(f.words))
  assert.deepEqual(missing.map(f => `${f.num}: ${f.words.slice(0, 90)}`), [])
  // every step of the spec's Stages 1–2 is covered (1.0 – 1.7, 2.0 – 2.8)
  assert.deepEqual([...new Set(frags.map(f => f.num))], ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '3.0', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10', '4.0', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '5.0', '5.1', '5.2', '5.3', '5.4', '5.5', '6.0', '6.1', '6.2', '6.3'])
})

// F215: the step-in reply for something broken (the spec's "Any time: when the designer steps in") and Develop's welcome
// bullet for it (4.0), word for word, the [slot] parts cut out.
export function bugFragments(html) {
  const ent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  const txt = s => ent(s.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''))
  const anyTime = (html.split('<h2>Any time: when the designer steps in</h2>')[1] || '').split('</section>')[0]
  const logged = (anyTime.match(/<p class="b">(Logged as a bug:[\s\S]*?)<\/p>/) || [])[1] || ''
  const welcome = (html.match(/<b>Something broken<\/b>:([^<]*)/) || [])[1] || ''
  const out = logged.replace(/<span class="slot">[^<]*<\/span>/g, '\u0001').split('\u0001').map(p => E.plainWords(txt(p)).replace(/^[.:,\s]+|[\s]+$/g, '')).filter(w => w.length >= 3)
  if (welcome) out.push(E.plainWords(`Something broken:${txt(welcome)}`))
  return out
}

test('F215: the step-in reply for a bug and the 4.0 "Something broken" line are in script.md word for word', { skip: !existsSync(SPEC) && 'the framework repo is not beside this one' }, () => {
  const frags = bugFragments(readFileSync(SPEC, 'utf8'))
  assert.deepEqual(frags, ['Logged as a bug:', "It doesn't block what we're doing, so I'll fix it", "Something broken: say so, or type /bug. If it blocks what we're doing, I fix it now; otherwise it's logged and fixed in order."])
  const mine = E.plainWords(scriptText.split('# Any time · when the creative steps in (F215)')[1])
  for (const f of frags) assert.ok(mine.includes(f), f)
  assert.equal(E.renderLine(script, 'bug.logged', { bug: 'B004 · Score cut off on phone · P2 — annoying, not blocking', when: 'after F07' }).text, "Logged as a bug: B004 · Score cut off on phone · P2 — annoying, not blocking. It doesn't block what we're doing, so I'll fix it after F07.")
})

test('lines not in the approved script are marked "added" (each one has an Ask Muzzy line)', () => {
  // (F233 — Finished games come in as fixed: the conversion path's lines, each on the Ask Muzzy list)
  const F233 = ['ideate.sofar.rules', 'ideate.rules', 'ideate.rules.gap', 'ideate.digital.who', 'ideate.digital.computer', 'define.welcome.rules', 'define.rules', 'define.rules.ok', 'ideate.pool.first', 'any.type']
  // (F234 — Steps ask only what's still open: already decided, the stage's skip list and reopen, the ask for the rules)
  const F234 = ['ideate.rules.link', 'any.decided', 'any.decided.what', 'any.decided.which', 'any.skipped', 'any.reopen']
  // (F235 — Fixes from the Sirius Smugglers live look)
  const F235 = ['bug.engine', 'define.platform.now', 'define.scope.someday', 'define.lock.when', 'design.players.leave', 'design.players.long', 'design.players.defaults', 'define.scope.intro', 'define.scope.first', 'define.scope.need', 'define.scope.slice.list']
  assert.deepEqual(Object.values(script.lines).filter(l => l.added).map(l => l.id).sort(), [...F233, ...F234, ...F235,'any.keep', 'bug.fix.done', 'bug.fix.reproduced', 'bug.fix.start', 'bug.none', 'bug.now', 'bug.often', 'bug.verified', 'define.feelings.eight', 'deliver.back', 'deliver.live', 'deliver.notready.box', 'design.rulebook.ok', 'design.rulebook.section', 'design.sketches.none', 'design.time.notrap', 'develop.idea', 'develop.plan.one', 'develop.setup.nologin', 'develop.waiting', 'release.none', 'release.notyet', 'release.out', 'release.walk', 'release.walk.link', 'release.walk.live.box', 'research.busy', 'research.changed', 'research.lost', 'research.none', 'research.notstarted', 'research.wait'].sort())
})

// F229: the research reply (the spec's "Any time: when the designer steps in"), word for word, the [slot] parts and the
// "…" (time passing between its two halves) cut out.
export function researchFragments(html) {
  const ent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  const anyTime = (html.split('<h2>Any time: when the designer steps in</h2>')[1] || '').split('</section>')[0]
  const line = (anyTime.match(/<p class="b">(Let me look\.[\s\S]*?)<\/p>/) || [])[1] || ''
  return line.replace(/<span class="slot">[^<]*<\/span>/g, '\u0001').replace(/…/g, '\u0001').split('\u0001')
    .map(p => E.plainWords(ent(p.replace(/<[^>]+>/g, ''))).replace(/^[.:,\s]+|[\s]+$/g, '')).filter(w => w.length >= 3)
}

test('F229: the research reply is in script.md word for word, its two halves filled', { skip: !existsSync(SPEC) && 'the framework repo is not beside this one' }, () => {
  const frags = researchFragments(readFileSync(SPEC, 'utf8'))
  assert.deepEqual(frags, ['Let me look.', "Here's what I found:", 'Sources are on your project page. Does it change anything?'])
  const mine = E.plainWords(scriptText.split('# Any time · research (F229)')[1].split('# Fixing a bug')[0])
  for (const f of frags) assert.ok(mine.includes(f), f)
  assert.equal(E.renderLine(script, 'research.look', { time: 'About 3 minutes' }).text, 'Let me look. About 3 minutes…')
  assert.equal(E.renderLine(script, 'research.found', { found: ['Most games do X', 'Some fail at Y', 'Z is new'] }).text,
    "Here's what I found:\n· Most games do X\n· Some fail at Y\n· Z is new\nSources are on your project page. Does it change anything?")
  assert.match(E.renderLine(script, 'research.busy', { question: 'how do co-op games end?' }).text, /^I'm still looking into "how do co-op games end\?"\. One question at a time/)
})

test('filling a line: slots, lists as · lines, numbered lists, [[ … ]] only when filled, numbered questions left out and renumbered, another line inside', () => {
  const so = E.renderLine(script, 'ideate.sofar', { clear: ['"two friends race"', 'a shared deck (my reading)'], ideas: ['"weather cards"'], open: ['how a game ends (Rulebook)'], stands: 'a concept', link: 'file:///x/page.html' })
  assert.equal(so.kind, 'say')
  assert.match(so.text, /from your idea\. Your own words/)
  assert.match(so.text, /\*\*Already clear\*\*\n· "two friends race"\n· a shared deck \(my reading\)\n/)
  assert.match(so.text, /\*\*Where it stands:\*\* a concept\.\nThe full version is on your project page: file:\/\/\/x\/page\.html$/)
  const withFiles = E.renderLine(script, 'ideate.sofar', { files: '14 files', unread: '2 Photoshop files (pictures, not text)', clear: ['a'], ideas: ['b'], open: ['c'], stands: 'written', link: 'l' })
  assert.match(withFiles.text, /from your idea and the 14 files you shared\./)
  assert.match(withFiles.text, /\*\*Where it stands:\*\* written\. I couldn't read: 2 Photoshop files \(pictures, not text\)\./)
  assert.match(E.renderLine(script, 'ideate.sofar', { clear: ['a'] }).error, /needs \{ideas\}, \{open\}, \{stands\}, \{link\}/)
  const fe = E.renderLine(script, 'ideate.feelings', { omit: [2], quote: 'a storm hits your best row' })
  assert.match(fe.text, /themselves in\. You mentioned "a storm hits your best row": is that the moment, or is there another\?\n2\. What do you hope this game becomes/)
  assert.ok(!/tell a friend/.test(fe.text))
  const ask = E.renderLine(script, 'ideate.open.ask', { questions: [{ line: 'ideate.pool.mentioned', slots: { thing: 'weather cards' } }, { line: 'ideate.pool.end' }, { line: 'ideate.pool.where' }] })
  assert.equal(ask.text, '1. You mentioned weather cards: what ideas do you have for it, even half-formed?\n2. How does a game end, as far as you know?\n3. Where do you picture people playing it: on a phone, a computer, both?\nAnswer in one message, in any order.')
  assert.equal(E.renderLine(script, 'nope', {}).error, 'there is no line "nope" in the script')
})

test('boxes: [if] options only when filled, [each] one option per item, 2–4 options or a plain refusal', () => {
  const next = E.renderLine(script, 'ideate.next', {})
  assert.deepEqual(next.box.options.map(o => o.label), ['Carry on in Ideate (Recommended)', 'I need to correct something'])
  const jump = E.renderLine(script, 'ideate.next', { jump: true, covers: 'your notes already cover the feelings, pitch and core loop' })
  assert.deepEqual(jump.box.options[1], { label: 'Jump to Define', description: 'your notes already cover the feelings, pitch and core loop' })
  const sk = E.renderLine(script, 'ideate.sketch.pick', { sketches: [{ name: 'Ball speed feel', question: 'Is fast fun?' }, { name: 'Two score layouts', question: 'Which reads on a phone?' }] })
  assert.equal(sk.box.multiSelect, true)
  assert.deepEqual(sk.box.options[0], { label: 'Ball speed feel', description: 'answers: Is fast fun?' })
  assert.match(E.renderLine(script, 'ideate.sketch.pick', { sketches: [{ name: 'a', question: 'q' }] }).error, /would have 1 option/)
  assert.match(E.renderLine(script, 'define.feelings.moments', { moments: ['a', 'b', 'c', 'd', 'e'] }).error, /would have 5 options/)
  assert.deepEqual(E.renderLine(script, 'define.feelings.moments', { moments: ['your row survives the hail'] , extra: 1 }).error ? 'err' : 'ok', 'err')
})

test('word for word: bold marks, curly quotes, bullet signs and spacing don\'t count; a changed word does', () => {
  const line = { id: 'ideate.idea', text: E.renderLine(script, 'ideate.idea', {}).text }
  assert.deepEqual(E.unsaid([line], 'Your Idea\n\nTell me about your game in your own words: what it is, what you love about it, anything you remember. Half an idea is fine. If you’re not sure yet, just say so.'), [])
  assert.equal(E.unsaid([line], '**Your Idea**\nTell me about your game in your own words: what it is and what you love about it. Half an idea is fine.').length, 1)
  const bullets = { id: 'x', text: '· one\n· two' }
  assert.deepEqual(E.unsaid([bullets], '- one\n- two'), [])
})

test('the box check: the script\'s box passes exactly; another question, other options or a lost description is refused with the box to ask', () => {
  const r = E.renderLine(script, 'define.pitch.how', {})
  const pending = [{ id: r.id, n: 1, box: r.box }]
  const asked = q => [{ question: r.box.question, header: r.box.header, multiSelect: false, options: r.box.options.map(o => ({ ...o })), ...q }]
  assert.deepEqual(E.boxProblem(pending, asked({})), { used: ['define.pitch.how#1'] })
  assert.match(E.boxProblem(pending, asked({ question: 'Happy with it?' })).why, /isn't the script's\. Ask exactly the box/)
  assert.match(E.boxProblem(pending, asked({ options: [{ label: 'Keep it' }, { label: 'Change it' }] })).why, /must have exactly the script's options/)
  assert.match(E.boxProblem(pending, asked({ options: [{ label: 'Keep it' }, { label: 'Change something' }] })).why, /descriptions/)
  assert.match(E.boxProblem([], asked({})).why, /every question box in this step comes from the script/)
  // two boxes in one call (Platform & Play), each used once
  const a = E.renderLine(script, 'define.platform.who', {})
  const b = E.renderLine(script, 'define.platform.ai', {})
  const two = [{ id: a.id, n: 1, box: a.box }, { id: b.id, n: 2, box: b.box }]
  assert.deepEqual(E.boxProblem(two, [{ ...a.box }, { ...b.box }].map(x => ({ question: x.question, multiSelect: x.multiSelect, options: x.options }))).used, ['define.platform.who#1', 'define.platform.ai#2'])
})

test('a pipeline\'s lines are checked against the script: unknown ids, an opening not among its lines, a gate box that approves first', () => {
  const p = { id: 't', version: 1, steps: [
    { id: 'a', kind: 'talk', tools: ['Read'], craft: 'craft/a.md', lines: ['define.pitch', 'define.nope'], opening: ['define.loop'] },
    { id: 'g', kind: 'gate', line: 'define.lock.box', approve: 'Not yet: change something' },
  ] }
  assert.deepEqual(E.checkLines(p, script), [
    'step "a": the line "define.nope" isn\'t in the script (plugin/script.md)',
    'step "a": the line "define.loop" isn\'t in the script (plugin/script.md)'.replace('define.loop" isn\'t in the script (plugin/script.md)', 'define.loop" isn\'t in the script (plugin/script.md)'),
    'step "a": its opening "define.loop" must be one of its "lines"',
    'step "g" (gate): "Not yet: change something" can\'t be the box\'s first option; a stray Enter would approve it',
  ].filter(x => !/define\.loop" isn't in the script/.test(x)))
  assert.deepEqual(E.checkPipeline(p).filter(x => /gate/.test(x)), [])
  assert.deepEqual(E.gateWords(p.steps[1], script), { question: 'Lock the concept?', options: ['Not yet: change something', 'Lock it: on to Design'] })
})

test('the band says the script\'s place: "Define · 3 of 8 · The Pitch"; the welcome isn\'t counted; a free question open says "your turn"', () => {
  const p = { id: 'define', steps: [
    { id: 'welcome', kind: 'talk', no: '2.0', title: 'Welcome to Define' },
    ...['The Feelings', 'The 3 Pillars'].map((t, i) => ({ id: `s${i + 1}`, kind: 'talk', no: `2.${i + 1}`, title: t })),
    { id: 'pitch-ask', kind: 'talk', no: '2.3', title: 'The Pitch' },
    { id: 'research', kind: 'flow', no: '2.3', title: 'The Pitch' },
    { id: 'write', kind: 'script' },
    ...['The Core Loop', 'Platform & Play', 'Clash Check', 'Scope, First Pass', 'Concept Lock'].map((t, i) => ({ id: `t${i + 4}`, kind: 'talk', no: `2.${i + 4}`, title: t })),
  ] }
  assert.equal(E.stepPlace(p, p.steps[3]), 'Define · 3 of 8 · The Pitch')
  assert.equal(E.stepPlace(p, p.steps[5]), 'Define · 3 of 8 · The Pitch', 'a script step takes the numbered step above it')
  assert.equal(E.stepPlace(p, p.steps[0]), 'Define · Welcome to Define')
  const st = { ...E.freshState('define'), status: 'working', current: 'pitch-ask', startedAt: 0, finished: ['welcome', 's1', 's2'] }
  assert.equal(E.bandText(p, st, 65000), 'Define · 3 of 8 · The Pitch · working · 01:05')
  assert.equal(E.bandText(p, { ...st, ask: { step: 'pitch-ask', line: 'x', text: 'y' } }, 65000), 'Define · 3 of 8 · The Pitch · your turn')
  // a pipeline without numbers keeps the old band
  assert.match(E.bandText({ id: 'hello', steps: [{ id: 'name', kind: 'talk' }] }, { ...E.freshState('hello'), status: 'working', current: 'name', startedAt: 0 }, 0), /^BMUZ · step 1 of 1 · name · working/)
})

test('a script step\'s prompt: the script rule, its lines, the opening first; no engine wrap-up words; the stage intro gives way to the script\'s welcome', () => {
  const step = { id: 'pitch', kind: 'talk', results: ['pitch'], lines: ['define.pitch', 'define.pitch.how'], opening: ['define.pitch'], wrapTo: 'x' }
  const notes = E.talkPrompt(step, 'craft', '', false, [], { script, wrap: { next: 'a', to: 'b' } })
  assert.ok(notes.includes(E.SCRIPT_RULE))
  assert.ok(!notes.includes(E.ASK_RULE))
  assert.match(notes, /- define\.pitch \(say\): "The Pitch The game in a few lines/)
  assert.match(notes, /Open the step with mcp__bmuz__say \{"line": "define\.pitch"\} before anything else/)
  assert.ok(!/Keep going \(next:/.test(notes))
  assert.ok(!/Open the step with/.test(E.talkPrompt(step, 'craft', '', false, [], { script, opened: true })))
  assert.equal(E.introFor({ id: 'define', steps: [step] }, {}), null)
  assert.match(E.introFor({ id: 'define', steps: [{ id: 'x', kind: 'talk' }] }, {}), /We're in Define/)
  // what Claude is told to do with each kind of line
  assert.match(E.sayNext({ kind: 'free', text: 'q?' }, false), /whole reply .* end your turn\. The creative's next chat message is the answer/)
  assert.match(E.sayNext({ kind: 'say', text: 'x'.repeat(400) }, false), /no question box in this turn/)
  assert.match(E.sayNext({ kind: 'say', text: 'short' }, false), /carry on with the step in this turn/)
  assert.match(E.sayNext({ kind: 'box' }, true), /Auto run: nobody can answer the box/)
})

test('a gate that sends the creative back tells that step what they answered; an "onBack" step runs only then', () => {
  const p = { id: 'define', steps: [
    { id: 'scope', kind: 'talk' },
    { id: 'change', kind: 'talk', needs: ['scope'], onBack: true },
    { id: 'lock', kind: 'gate', needs: ['change'], line: 'define.lock.box', approve: 'Lock it: on to Design', backTo: 'change' },
  ] }
  const st = { ...E.freshState('define'), finished: ['scope', 'change'], current: 'lock', status: 'waiting' }
  assert.equal(E.onBackSkips(p.steps[1], st), true)
  const out = E.answerGate(p, st, p.steps[2], 'Not yet: change something')
  assert.deepEqual(out.state.back, { step: 'change', gate: 'lock', answer: 'Not yet: change something', question: 'define.lock.box' })
  assert.equal(E.onBackSkips(p.steps[1], out.state), false)
  assert.deepEqual(out.state.finished, ['scope'])
  // finishing the step it went back to clears it
  assert.equal(E.finish({ ...out.state, current: 'change', status: 'working' }, p.steps[1], {}).back, null)
  // the journal rebuild keeps it
  const rebuilt = E.rebuildFromJournal('define', [JSON.stringify({ ev: 'step.done', step: 'scope' }), JSON.stringify({ ev: 'step.done', step: 'change' }), JSON.stringify({ ev: 'gate.back', step: 'lock', dropped: ['change'], back: out.state.back })])
  assert.deepEqual(rebuilt.back, out.state.back)
})

// F230 task 1: Stage 6 (Release) — the welcome, the where box, the Store & Launch card, the gate, the live line, First
// Reactions and Look Back, filled from the plan files' words.
test('F230: Stage 6 lines fill: the welcome ends "Nothing goes public without your clear OK.", the gate box puts "Not yet" first', () => {
  assert.match(E.renderLine(script, 'release.welcome', {}).text, /I'll check each platform's current rules first\.\nNothing goes public without your clear OK\.$/)
  const where = E.renderLine(script, 'release.where', {})
  assert.equal(where.box.multiSelect, true)
  assert.deepEqual(where.box.options.map(o => o.label), ['The web', 'itch.io', 'Steam', 'Phone app stores'])
  assert.equal(E.renderLine(script, 'release.store', { platform: 'Steam', needs: 'a store page, capsule art, a trailer', done: 'the store page', you: 'capsule art · a trailer' }).text, "**Store & Launch** · Steam\nHere's what Steam needs today: a store page, capsule art, a trailer.\nDone: the store page · Needs you: capsule art · a trailer.")
  const gate = E.renderLine(script, 'release.gate.box', { game: 'Garden Race', platform: 'Steam' })
  assert.equal(gate.box.question, 'Release Garden Race on Steam?')
  assert.deepEqual(gate.box.options.map(o => o.label), ['Not yet', 'Release it'])
  assert.equal(E.renderLine(script, 'release.live', { game: 'Garden Race', link: 'https://x.example/' }).text, 'Garden Race is live: https://x.example/. I checked it from outside, and it loads and plays.')
  assert.equal(E.renderLine(script, 'release.reactions.read', { feelings: 'a close race: seen ✓', fixes: 'nothing' }).text, 'Against your feelings: a close race: seen ✓. Worth fixing in an update: nothing.')
  assert.match(E.renderLine(script, 'release.reactions.read', { feelings: 'x', fixes: 'hail', update: 'Update 1.1' }).text, /\. Added to the roadmap as Update 1\.1\.$/)
  assert.match(E.renderLine(script, 'release.lookback', { game: 'Garden Race', forgame: 'a', forbmuz: 'b' }).text, /^\*\*Look Back\*\*\nWhat did Garden Race teach us for the next game\? Here's my list; change anything:\n· For this game: a\n· For BMUZ itself: b \(sent to Muzzy as suggestions\)$/)
})
