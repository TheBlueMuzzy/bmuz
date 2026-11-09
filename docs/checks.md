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

The discover pipeline (F217): the source check and its "script-ok" done-check in `tests/check-sources.node.test.mjs`, the research flow run with fake helpers in `tests/research-flow.node.test.mjs`, the "F217:" plugin tests (a flow's source check finishes, retries, BLOCKS and rolls back), and headless `discover` (a scratch project in `dev/.scratch/bmuz-discover-test`, or `BMUZ_DISCOVER_PROJECT`; ~2 min on haiku with real web research; ends with the engine's card and a report whose every link answers).
