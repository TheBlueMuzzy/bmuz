# The 16 engine checks and where each is tested

From ARCHITECTURE.md "How we get sure" (framework repo, `.planning/research/bmuz-vision/`). Three kinds of test:
- **node**: no Claude, `npm run test:node` (in `check:fast`)
- **plugin**: the real hooks over a fake project, `claude plugin test plugin` (in `check:fast`)
- **headless**: real Claude sessions, `node tests/headless.mjs [scenario]` (~10 min, haiku; not in check:fast)
- **live**: needs a person at a real window; listed for the live re-check (F211 task 7)

| # | Check | node | plugin | headless | live |
|---|---|---|---|---|---|
| 1 | The engine starts each step itself; a step out of order is refused | steps in order, check 1 | check 1 | `full`, `guard` | — |
| 2 | Stops at a gate, asks with buttons, waits; Approve isn't pre-selected | gate answers, fix 3 | check 2, check 2b | `full` (stops at the gate) | buttons + 1 min wait |
| 3 | A killed window resumes at the right step | doctor, journal rebuild | doctor at start | `kill` | — |
| 4 | A frozen helper is caught by the watchdog | check 4, race | check 4 (race) | — (a relaunch needs a live window) | watchdog relaunch ×3 → BLOCKED, band goes red |
| 5 | The status band always shows working / done / waiting | check 5 | check 5 | — | band ticks, refreshes on BLOCKED |
| 6 | An error inside the engine refuses rather than lets through | — | check 6, 6b–6f | `fault` | — |
| 7 | A helper's answer comes back to the engine | — | — | — | not used: flows return through workflow results (check 8) |
| 8 | The engine starts a workflow with its inputs and gets the result | task notification | check 8 (one launch, pinned) | `full` | launch labelled as the engine's |
| 9 | The engine runs a script step and reads its result | — | check 13 | `full` | — |
| 10 | Resumes while waiting at a gate | fix 7 | fix 7 | `full` (2 sessions) | close the window at the gate |
| 11 | Plan mode can't go around the engine | fix 6 | — | `plan` | Shift+Tab plan mode, hands in its plan |
| 12 | A step's tool limit holds (review can't edit) | check 12 | check 12 | `guard` (default + bypass) | — |
| 13 | A failing done-check retries twice, then BLOCKS and rolls back | check 13, retry | check 13, 13b | `retry` | — |
| 14 | Loads when installed (not --plugin-dir) and in a background session | — | — | `nightly` (background) | F212: installed copy on both machines |
| 15 | An overnight run never stops to wait | fix 1 | check 15 ×2 | `full`, `nightly` | — |
| 16 | Motor B: `bmuz next` gives the right step from a shell | — | — | `motorb` | — |

The engine-written hand-off card (F213, docs/handoff-card.md): `tests/handoff-card.node.test.mjs`, the "F213:" plugin tests, and headless `card` (the review step ends with the engine's card; "1 blue" is recorded as a decision).

Memory and safety beyond the 16 (doctor, undo, retry after BLOCKED, pipeline file check): `tests/memory-safety.node.test.mjs`, `tests/pipeline-format.node.test.mjs`, and the undo/doctor plugin tests.

The discover pipeline (F217, design: framework .planning/research/bmuz-vision/discover-creative-research.md section 6, plus discover-research.md's heuristics): the source check (report sections, bricks, strength marks, citations, links) and its "script-ok" done-check in `tests/check-sources.node.test.mjs`; the four-lens research flow per topic (theme dig, mechanisms, prior art; the BGG rule in every prompt) run with fake helpers in `tests/research-flow.node.test.mjs`; the one Discover document (shelves only grow, hand edits kept, the creative's words marked, one section per run, a run saved twice adds nothing twice) in `tests/discover-doc.node.test.mjs`; wrapping up early (`wrapTo`, `always`, `recap`, the journal rebuild, undo) in `tests/wrap.node.test.mjs`; a talk step's "results" keys, slug-named files and list args in `tests/results.node.test.mjs`; the "F217:" plugin tests (wrap-up through the real hooks too); and headless `discover` (a scratch project in `dev/.scratch/bmuz-discover-headless` (its own folder: the live-look folder `bmuz-discover-test` is never reset by a check), or `BMUZ_DISCOVER_PROJECT`; "a cosy game about running a lighthouse", auto run on haiku with real web research, three research flows; ends with the engine's brick board card, a DISCOVER.md with its shelves filled, and three reports whose every link answers).

BMUZ follows the script (F232, design: framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stages 1–2): the GDD as one document — the 14 chapters, levels only going up, hand edits kept (moved out of the marks, never overwritten), the running lists, the project page — in `tests/gdd.node.test.mjs`; the script file against the approved script (every fixed fragment of Stages 1–2 word for word), filling slots, the word-for-word check, the box check, the band ("Define · 3 of 8 · The Pitch"), gates asking a script box and `onBack` in `tests/script.node.test.mjs`; Ideate 1.0–1.7 (pipeline shape, 1.3 composed from the script, quotes checked, Jump to Define only on their own words, the pillars never written, 1.7 counts) in `tests/ideate-script.node.test.mjs`; Define 2.0–2.8 (shape, research only on a yes, the lock gate, the lock page, the lock logged) in `tests/define-script.node.test.mjs`, the clash flow in `tests/define-flows.node.test.mjs`; the "F232:" plugin tests (the say tool: free lines open "the next message is the answer", a box only as the script gives it, the opening first, a line not written word for word corrected, a long line in a turn of its own, an auto run never asking). Headless: `ideate-garden` (the script's garden race: every line and shown file word for word, the chapters where the growth chart says, the sketch list, the page opened by a fake) and `ideate-rulebook` (not sure yet → the spark; a rules file and an art folder) in `.scratch/bmuz-garden-*`; `define-garden` (Ideate then "On to Define", then Define 2.0–2.8 to the lock gate on the same game, chapters 1–7 chosen). Retired with the old flows (F232): the F218 define-doc / digest / lint / stage tests, the F225 intake tests, the F228 IDEATE.md tests and the entry-* / ideate-* / define headless scenarios.

Asking only through the question box (F228 task 3; live run 2026-11-09 S3 stalled 18.6 min, #20b hid a list behind the box): the rule in every live talk prompt, `plainQuestion` / `nudgeFor` / `turnText` / `hiddenTextProblem` in `tests/ideate.node.test.mjs`; the plugin tests "a live talk step whose turn ends with a plain-text question is nudged" and "a question box with a wall of plain text before it is refused". Not provable headless (a `-p` run is an auto run: it never asks): whether `$.session.messages()` already holds the message that makes the call — live look.

