# Pipeline file format (version 1)

A pipeline is one process (develop a feature, fix a bug, release…) written as data: a list of steps the engine runs in order.
It lives in `plugin/pipelines/<id>.json`. A project picks one in its `bmuz.json`: `{ "pipeline": "<id>" }`.

The engine checks the file at every session start. **A file with any problem runs nothing:** every tool is refused, with the problems in plain words.
Check before shipping: `npm run check:pipelines` (also part of `npm run check:fast`). It runs the same check, plus: the id matches the file name, and every craft note, workflow and `{plugin}/…` script it names exists.

## The file

| Setting | Needed | What |
|---|---|---|
| `id` | yes | the pipeline's name; lower case, digits, dashes; same as the file name |
| `version` | yes | the format version: `1` |
| `description` | no | one line, for people |
| `watchdogMs` | no | how long a working step may run before the watchdog stops it (default 20 min); a project's `bmuz.json` can override it |
| `next` | no | the stage that follows this one (see "Stages") |
| `steps` | yes | the list of steps, in order |

Any other setting is refused (a typo like `stpes` would otherwise be ignored silently).

## Every step

| Setting | Needed | What |
|---|---|---|
| `id` | yes | lower case, digits, dashes; unique in the file |
| `kind` | yes | `talk`, `gate`, `script` or `flow` (below) |
| `needs` | no | earlier step ids that must be finished first |
| `description` | no | one line, for people |
| `timeoutMs` | no | this step's own watchdog limit |
| `retries` | no | how many times the step runs again after a failed check before it BLOCKS: 0 to 2 (default 2). Use 0 for a step whose refusal is a verdict, not a flake — running it again would only say the same (Define's `stage`) |
| `always` | no | `true` = the step still runs when the creative wraps up early (below) |
| `when` | no | `"{key}"`: the step runs only when that earlier talk result says yes (`true`, or text starting "yes"); otherwise the engine skips it like a wrapped-up step (journaled `step.skip`, counts as finished, hands back nothing). For something offered, never forced — Define's prior-art research (F218). The key must come from a talk step this step needs |

| `no`, `title` | no | (F232) the script's step number (`"2.3"`) and name (`"The Pitch"`). The band then says `Define · 3 of 8 · The Pitch`; a `.0` step (a stage's welcome) isn't counted, and a step without them shows the numbered step above it |
| `onBack` | no | (F232) `true` = the step runs only when a gate sent the creative back to it (Define's "Not yet: change something"); otherwise it is skipped like a `when` that says no. The step is told what they answered at the gate |

A step runs when everything it `needs` is finished. A step can only need steps **above** it.

## The script (F232): what BMUZ says, word for word
Every fixed line BMUZ says lives in ONE file, `plugin/script.md` (its head explains the format: `## <id> · say|free|box`, `{slots}`, `[[ … ]]`, `[if x]` / `[each x]` options). A node test holds it to the approved script (framework research/bmuz-vision/bmuz-design-doc.html): every fixed part of Stages 1–2 must be in it word for word; lines not in the approved script are marked `· added`.
- A talk step's `lines`: the script lines it may say. `opening`: the ones it says first, in one call, before any box or `step_done`.
- Claude never writes a fixed line itself: it calls `mcp__bmuz__say` with `{"line": "<id>" or [ids], "slots": {…}}` and gets back the exact words (`say`) or the box (`box`), and what to do next (`then`). The engine journals each line (`line`).
- **say**: written as is; a long one (over 300 characters or 3 lines) is shown in a turn of its own, and the engine carries the step on at that turn's end (`continue`), so no box covers it.
- **free**: Claude's whole reply, then the turn ends; the creative's next chat message is the answer (`state.ask`; journaled as `answer` with its line; no nudge and no watchdog stall while it waits; said again after a new window). The ask for links, `ideate.material`, is one: "never mind" = no material. `{"wait": true}` opens one with nothing said (an option's description already asked, like "next, tell me what").
- **box**: the box to ask with AskUserQuestion, exactly; in a step with `lines` the engine refuses any other box (another question, other options or lost descriptions).
- At the turn's end every line said in it must be in what Claude wrote, word for word (bold marks, curly quotes, bullet signs and spacing don't count): one that isn't gets the engine's correction with the exact words (at most 2 per try; journaled `said` with what was missing). A script step's `show` file is checked the same way.
- A gate's `line` (instead of `question` + `options`): the gate asks that script box; `approve` is one of its options, never the first.
- In an auto run a free line opens nothing and boxes are never asked: the step takes the test answers or the default.
- `npm run check:pipelines` and the engine's start refuse a pipeline naming a line the script doesn't have.

## The four kinds

**talk** — Claude works in the chat, limited to the step's tools, then calls `step_done` with a result.
- `tools` (needed): the only tools Claude may use in this step. Everything else is refused and logged as a deviation.
- `craft` (needed): a `.md` note in the plugin telling Claude what to do, like `craft/review.md`.
- `handoff`: `true` = the step hands its work back to the creative. Its `step_done` result must carry a hand-off card's words (`card`, docs/handoff-card.md); a missing or empty part fails the step like a done-check. The engine writes the card and shows it at the end of the turn, then starts the next step. Talk steps only.
- `results`: the keys the step's result must carry, like `["brief", "goal", "slug", "assumptions"]`. A missing key (or empty text; an empty list is fine) fails the step like a done-check. Each key is a `{hole}` for later steps. A key used in a later `writes` path must come back as a slug (lower case letters, digits, dashes, at most 60), or the step fails.
- `recap`: result keys from earlier talk steps (ones this step needs) to show in the step's prompt, like `["brief", "verbs"]`. The step then builds on what was collected even in a new session or a compacted chat. Empty ones are left out.
- `wrapTo`: a later step to jump to when the creative wraps up (see "Wrapping up early").
- Asking (F228, every live talk step, whatever its craft says): the engine's prompt carries `ASK_RULE` — every question through AskUserQuestion, never in plain text, nothing the creative must read written beside the box. Two engine checks back it: (1) a live talk step's turn that ends with neither the box nor `step_done` gets the engine's nudge at once (naming the plain-text question when there is one; at most 2 per try, then the watchdog as before; never after an Esc or the creative's own "bmuz doctor / undo" turn; a turn the creative started with their own message — "what do you mean?" — is nudged only when the reply asks them something in plain text); (2) an AskUserQuestion call with more than one short line of plain text before it in the same turn (over 300 characters or 3 lines, read from the transcript) is refused with the reason, so Claude asks again with the text inside the question. If the transcript can't be read the box goes ahead and the journal says `ask.unchecked`. Each answered box is journaled (`answer`), so a script can check the creative's own words.
- `done`, `writes`: see below.

**gate** — the engine stops and asks the creative with buttons; nothing else runs until they answer.
- `question` (needed): the words, `{holes}` allowed.
- `options` (needed): 2 or more different answers. **The first one is what a stray Enter picks, so put the safe choice first.**
- `approve` (needed): the option that says yes, word for word. It can't be the first option. Any other answer goes back to `backTo`.
- An auto run (nobody can answer: `-p`, a background session, or `"auto": true` in bmuz.json) never answers a gate: the run stops there and the question goes into `.bmuz/questions.md`.
- `backTo`: an earlier step to redo when the creative doesn't approve. That step and the steps needing it are run again.

**script** — the engine runs a command itself, no Claude involved.
- `run` (needed): the command as a list, like `["node", "{plugin}/scripts/write-plan.mjs", "{project}", "{name}"]`. It runs in the project folder.
- A command that exits with an error is a failed try, and what it printed is the reason (the retry, the BLOCK and the band say it). A script that refuses should print why in plain words, like Define's stage: "Not ready for Design: the pillars (step "pillars") is still open…".
- `show` (F228): a `.md` file inside the project (no `{holes}`) the script wrote. After the step passes, the engine copies it to `.bmuz/last-shown.md` and its own message asks Claude to show it word for word, asking nothing, in a turn of its own; the next step starts when that turn ends. For anything the creative must read before the next question (Ideate's "the game so far", the start's proposal): text written in the same turn as a question box ends up hidden behind the box (live review 2026-11-09). A missing or empty file shows nothing (journaled `show.missing`) and the run goes on.
- `done`, `writes`.

**flow** — the engine launches a saved workflow with its inputs pinned (Claude can't change them) and reads its result. Every workflow a pipeline launches must be pre-approved in `plugin/settings/auto-run.json` (`Workflow(<plugin:name>)`), so an overnight run never stops at Claude Code's "run this workflow?" question; the check refuses a pipeline whose workflow isn't listed.
- `workflow` (needed): `plugin:name`, like `bmuz:hello-flow` → `plugin/workflows/hello-flow.js`.
- `args`: the workflow's inputs, `{holes}` allowed.
- `agentTools`: the only tools the workflow's helpers may use.
- `craft`, `done`, `writes`.

## Wrapping up early (`wrapTo`, `always`)
A way out of the middle of a pipeline, like Discover's "keep going or wrap up?" after each step.
- A talk step with `"wrapTo": "<later step id>"` gets the engine's own wrap-up words in its prompt: when its questions are done, ask "Keep going (next: …), or wrap up now?" with "Keep going" first (the safe choice). An auto run always keeps going.
- If the creative wraps up (there, or in their own words any time during the step), the step finishes with what it has and its `step_done` result carries `"wrap": true` (an instruction to the engine, not kept as a result).
- The engine then **skips** every unfinished step after it and before `wrapTo`, except steps with `"always": true`, which still run (Discover's first research and its save step). A skipped step counts as finished, so the steps after it can run, but it hands back nothing: a `{hole}` from it fills in as nothing (empty text; a whole-hole flow arg gets `null`).
- The wrap is journaled (`"ev": "wrap"`, with the skipped steps), so the doctor rebuilds it. The undo list marks skipped steps; going back to before one runs it for real.
- The check refuses a `wrapTo` that isn't a later step, and an `always` that isn't true or false.

## Stages (`next`; F225, F228)
One project runs the stages in order (framework research/bmuz-vision/stages.md) — Ideate gathers the material, Define makes the blocks, Design assembles them, Develop makes the production model, Deliver makes it ready to hand over, Release lets the public experience it — each a pipeline named like its stage (`ideate`, `define`, …). `bmuz.json` names the current one. Discover is no longer a stage: `discover.json` stays on disk (its research flow becomes F229 — Research, callable anywhere) and still runs if `bmuz.json` names it, without a stage intro.
- `"next": { "pipeline": "define" }`: when this pipeline finishes, the engine offers the next stage. A live window asks "Ideate is done. On to Define?" ("Not yet: stay in Ideate" first, the safe choice); an auto run notes the question in `.bmuz/questions.md` instead. "bmuz go" on a finished stage is the creative's yes.
- Moving on keeps the finished stage's record: `.bmuz/state.json`, the journal, the last card and the checkpoints move to `.bmuz/stages/<n>-<pipeline>/`, `.bmuz/stages.json` lists every stage run, `bmuz.json` points at the new stage, and the new journal starts with a `stage.enter` line carrying the new stage's first state (the doctor rebuilds from it; undo lists only the current stage's steps). The questions and decisions lists belong to the project and stay. The plan is written to `.bmuz/switch.json` first and removed last, so a crash half way is finished at the next start.
- `"pipeline"` may be one `{hole}` from a talk step's result (the start's `{stage}`); `"later"` or an empty hole means no next. `"at"`: the step to start at (a step id, a `{hole}`, or `"first"`). `"carry"`: a project `.json` file whose `"given"` object goes into the new stage (the start's intake). `"ask": false`: move on at once (the creative already chose).
- **Starting at a step:** every step above it counts as finished and skipped ("answered by your material"), except `always` steps, which still run; a skipped talk step's keys are filled from `given`, else `null`, so a `{hole}` never stays `{hole}`. The undo list marks them; going back before one runs it for real.
- **Already chosen:** a talk step whose result keys `given` answers gets them in its prompt from the engine, to show first with "Keep" as the first option (one tap) — Define's revision pattern.
- **Stage intros:** a stage pipeline's first talk step opens with the stage's short intro paragraph (engine.js `STAGES`, Muzzy's wording) above the step's line, once per stage run (`introShown`, journaled as `intro`).
- A stage whose pipeline isn't on the engine yet (Develop, Deliver: F219, Release: F230) is said plainly, with what to use for now; nothing moves.
- `bmuz.json` changed by hand: a FINISHED run of the old pipeline moves on the same way; an unfinished one is refused until the creative says `bmuz stage <stage>`.
- **Ideate** (`plugin/pipelines/ideate.json`, F232 — the approved script's Stage 1; the start is folded in, so `bmuz new` starts here and where the game stands is worked out, never asked): `idea` (1.0 Welcome to BMUZ + 1.1 Your Idea; the spark questions only when they're not sure) → `material` (1.2, the ask for links; "Reading …") → `fetch` (`ideate-fetch.mjs`: files, folders, Drive through `gws`, GitHub through `gh`, all read-only; the rest listed by what it appears to be) → `read` (sorted into the GDD's chapters, nothing asked) → `so-far` (`ideate.mjs so-far`: quotes checked against their words, GDD version 1 with every chapter loose or plainly open and the pillars empty, the 1.3 message composed from the script and `show`n) → `next` (1.3's box; "Jump to Define" only when their own words cover the feelings, pitch and core loop: a wrap to `page`) → `feelings` (1.4) → `open-ideas` (1.5, pool questions only) → `sketches` (1.6, S01… into the GDD) → `page` (1.7: the project page opened, the message composed and shown) → `ready` (1.7's box). A `<step>-gdd` script step after each gathering step adds its result to the GDD (`ideate.mjs add <step>`). Its `next` is `{onward}` without asking again; an auto run moves on only with the test answers' pick.
- **Define** (`plugin/pipelines/define.json`, F232 — the script's Stage 2): `welcome` (2.0) → `feelings` → `pillars` → `pitch-ask` (research first?) → `prior-art` (the research flow, only on a yes) → `pitch` → `loop` → `platform` → `clash` → `clash-review` (`bmuz:clash-flow`, separate reviewers) → `clashes` → `scope` → `slice` → `change` (`onBack`) → `lock-show` (`define.mjs lock-show`: the concept page composed from the script, shown) → `lock` (a gate asking the script's box) → `locked`. Each deciding step writes its chapter as chosen (`gdd.mjs step <id> chosen`). Its `next` is Design.
- **Design** (`plugin/pipelines/design.json`, F227 — the script's Stage 3): `welcome` (3.0) → `sketches` (3.1: the list and how we'll know; `plan` + `build`) → `sketch-prep` (`design.mjs`: each page a copy of the /sketch starter, a numbers question a `.sim.mjs`) → `sketch-build` (`bmuz:sketch-flow`, one fresh helper per sketch; done = `design.mjs sketches-check`) → `sims` → `sketch-play` (ready + did it answer?) — all four only `when` the list isn't empty → `rules-ask` (3.2, research first?) → `rules-research` (only on a yes) → `flow` → `flow-rb` (`rulebook.mjs step`) → `flow-check` (shown back; chapter 4 worked out) → `sections` (outward, each with Yes / Change) → `sections-rb` (chapter 8 worked out) → `rules-done` (`rulebook.mjs done-show`: TBD and Rule A / Rule B counted from the file, shown) → `content` (3.3) → `content-fill` (`tables.mjs step`: content/data/*.json, the Playtesting table, chapter 9) → `balance` → `time` (3.4) → `scope2` (3.5, Define's own MoSCoW box) → `scope2-report` (the pitch box; "Rework the pitch" reworks it there with The Pitch's lines) → `players-read` (3.6, research) → `players` → `tdd-start` (`design.mjs`: .planning/TDD.md begun, with the content tables decision) → `look` (3.7) → `look-build` (`bmuz:sketch-flow` mode look: three looks side by side at phone size) → `look-pick` → `screens` (3.8; chapter 13 worked out, 14 Teaching loose: `design.mjs gdd screens "worked out" 14=loose`) → `plan` (3.9, told: research, then the TDD and roadmap as data) → `plan-write` (`design.mjs`: TDD.md + ROADMAP.md, the messages composed from the script, shown) → `change` (`onBack`) → `review-show` (3.10, the first sprint's three features) → `review` (a gate asking the script's box; Approve never first) → `approved`. The rulebook (`.planning/design/RULEBOOK.md`), the tables, the TDD and the roadmap keep hand edits (marks.mjs; the tables cell by cell). Content tables: JSON is the one source; `tables.mjs link / pull / push / status` mirror a table with a Google Sheet. Its `next` is Develop (not on the engine yet: said plainly).
- **Bug** (`plugin/pipelines/bug.json`, F215 — not a stage: a side trip, see "Stepping in"): `pick` (`bugs.mjs pick`: the one named or the next open P0 → P3, marked fixing; the script's "Fixing a bug" line shown) → `reproduce` (a test that fails because of the bug; its done-check `bugs.mjs repro {test}` runs it and records the failing exit and the test's fingerprint in `.bmuz/bug/B###.json` (with the current-bug pointer and the shown lines, out of Claude's Write / Edit reach, so the proof can't be faked and nothing is left in the project); "reproduced" only when the runner ran a named test and reported it failing — a hang, a timeout, a missing runner, no tests or a top-level throw is refused) → `repro-show` ("Reproduced: …") → `cause` (the root cause written down, the archive checked for a repeat, a don't re-break rule) → `fix` (done-check `bugs.mjs verify`: the same test, unchanged, passes; `npm test` and `npm run check:fast` green when the project has them) → `matching` (the same mistake searched for; each hit to fix gets its own test, proven failing by `bugs.mjs hits-fail`, or is logged as a new bug) → `matching-fix` (when the hits list has any — worked out from the hits, no separate flag; `bugs.mjs hits-pass`) → `record` (`bugs.mjs record`: first every proof runs again — the bug's test and each hit's test unchanged and passing, `npm test` green — or it is refused; then BUGS.md fixed + Guarded by, the hits' bugs logged, a Don't re-break line in `.planning/STATE.md`, committed `Fix B###: …` with only the files this run changed (files, never folders; a file the creative had unsaved changes in before the run is left out, and the closing line says so), then `Bug B###: fixed in <hash>`; the closing line shown, "Back to …").
- Commands: `bmuz stage <stage> [step]` (or `/bmuz-stage`) moves to any stage, keeping the current record; `bmuz new` in a folder without `bmuz.json` makes it a BMUZ project on the `ideate` pipeline (the only way the engine writes `bmuz.json`; a stray `bmuz go` elsewhere only says how).

## Stepping in: a bug (F215)
At any moment of any pipeline (a step, between steps, a gate, BLOCKED), the creative may say something is broken, in their own words or as `bmuz bug <words>`.
- Claude reports it with the engine's tool `mcp__bmuz__bug` (`{title, level: P0–P3, steps, expected, actual, often}`; at most one question first: `{"ask": true}` hands out the script's "how often" box). The engine writes it into `.planning/BUGS.md` (`scripts/bugs.mjs`, PROJECT-FILES' format, hand edits kept; committed `Bug B004: …` when the project is a git repository) and hands back the script's line, checked word for word: "Logged as a bug: B004 · … · P2 — annoying, not blocking. It doesn't block what we're doing, so I'll fix it after F07." ("after" = the open sprint feature in `.planning/SPRINT.md`, else the step we're on.)
- The step it interrupts keeps its record: results, retries, the lines said and its opening stay as they were. A bug that came as the answer to a question box (or an open free question) means Claude asks that question again. Every talk step is told this (`STEP_IN_RULE`), and a typed message that sounds broken carries a note beside it.
- An auto run's turn that ends on a step-in is no failed try: a step this session started carries on (its instructions again); one waiting from an earlier session stays as it was until "bmuz go". At most 2 such turns per step try; after that one counts as a failed try (no endless loop). The step-in's "how often" box is never one of the step's boxes or lines, and one never asked is dropped at the turn's end.
- Fix now only by the focus rule: a P0, a bug that blocks the current step, or a minutes-long fix in code being changed (`"now": "P0" | "blocks" | "quick"`): the line says "I'll fix it now" and the fix run starts at the turn's end.
- **The fix run is a side trip.** `bmuz bug` (the next open bug, P0 → P3), `bmuz bug B004`, `bmuz bug sweep` (the open P0–P2 bugs as they were when it started, one after the other) park the stage where it is: its record (state, journal, last card / shown file, checkpoints) moves to `.bmuz/parked/` and the `bug` pipeline runs with its own. When it finishes, its record is kept in `.bmuz/bug-runs/<n>-<bug>/` (listed in `.bmuz/bug-runs.json`), the stage's record is put back, and its step resumes where it was. `bmuz bug stop` puts a fix run aside (its step's files put back, the bug open again). `.bmuz/side.json` carries the phase, so a crash on the way in or out is finished at the next start (coming back copies first and deletes only what is safe, so it can run again after a crash at any point). Not while a flow's helpers are working; `bmuz stage` is refused during one.
- `bmuz bug list` shows the list; `bmuz bug verified B004` is the creative's check (fixed → verified).
- While a pipeline runs, `Write` / `Edit` (Claude's or a helper's) may only change files inside the project, never in `.bmuz/`.

## Done-checks (`done`)
How the engine knows a step really finished. A failed check retries the step twice, then marks it BLOCKED and rolls back its `writes`.

| `type` | Settings | Passes when |
|---|---|---|
| `result-has` | `key` | the talk step's result has `key` (talk steps only: they are the only ones that hand back a result) |
| `file-contains` | `path`, `text` | the file exists and contains the text |
| `file-json-has` | `path`, `key` | the file is JSON and has `key` |
| `script-ok` | `run` | the command (a list, `{holes}` allowed, run in the project folder) exits 0; its output is the reason when it doesn't. Like the research flow's `["node", "{plugin}/scripts/check-sources.mjs", ".planning/research/discover.md"]` |

No `done` = the step passes when it ends.
A talk step's done-check may also use its own results as `{holes}` (F215: the bug pipeline's `reproduce` runs `bugs.mjs repro {test}`, the test it just wrote). A command argument that is one whole hole holding a list or an object goes as JSON (`hits-fail {hits}`).

## Files a step writes (`writes`)
The project files the step may create or change. Before the step's first try the engine saves them (a checkpoint); a BLOCKED step puts them back, or deletes the ones that didn't exist.
Because the engine may delete them, each path must stay inside the project: relative, forward slashes, no `..`, not in `.bmuz/`. The only `{holes}` allowed are keys from a needed talk step's `results` (they are checked as slugs), like `.planning/research/discover-{slug}.md`; the engine fills them before it saves or puts back a file, and leaves out any path that would leave the project.
The engine checks this again right before it saves or puts back a file, so a hand-edited checkpoint can't reach outside the project either.

## `{holes}`
Text in `question`, `run`, `args` and a done-check's `path` / `text` / `run` can carry `{holes}`, filled in when the step runs:
- `{project}`: the project folder; `{plugin}`: the plugin folder.
- A result from a talk step this step needs, directly or through other steps: `{name}` if an earlier talk step's done-check is `result-has` `name`, or any key in its `results`.
- In a flow's `args`, a value that is one whole hole (`"{assumptions}"`) gets the result itself, so a list or an object reaches the workflow as a list or an object; holes inside longer text fill as text.

Any other hole is refused (a typo like `{nmae}` would otherwise reach the script as it is).
A filled-in path that leaves the project (a result holding `../`) is refused when the step is checked.

## Test-only settings in bmuz.json
For BMUZ's own tests; never in a real project.
- `testAgentTools`: extra tools a flow's helpers may use (the stall test's helper runs Bash).
- `testAnswers`: `{ "<talk step id>": <the creative's answers> }`. The engine adds them to that talk step's hidden instructions as the creative's own words, so a pipeline whose talk steps choose (Define: taste, which an auto run never does) can run end to end headless. **Refused unless the session runs with `BMUZ_TEST=1`** (the headless harness sets it): without it every tool is refused and the engine says why, so a stray setting can never choose for the creative.

## Example
`plugin/pipelines/hello.json`: talk "name" → gate "approve" → script "plan" → flow "hello" → talk "review" (read-only; hands back the card).
