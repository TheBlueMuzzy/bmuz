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

A step runs when everything it `needs` is finished. A step can only need steps **above** it.

## The four kinds

**talk** — Claude works in the chat, limited to the step's tools, then calls `step_done` with a result.
- `tools` (needed): the only tools Claude may use in this step. Everything else is refused and logged as a deviation.
- `craft` (needed): a `.md` note in the plugin telling Claude what to do, like `craft/review.md`.
- `handoff`: `true` = the step hands its work back to the creative. Its `step_done` result must carry a hand-off card's words (`card`, docs/handoff-card.md); a missing or empty part fails the step like a done-check. The engine writes the card and shows it at the end of the turn, then starts the next step. Talk steps only.
- `done`, `writes`: see below.

**gate** — the engine stops and asks the creative with buttons; nothing else runs until they answer.
- `question` (needed): the words, `{holes}` allowed.
- `options` (needed): 2 or more different answers. **The first one is what a stray Enter picks, so put the safe choice first.**
- `approve` (needed): the option that says yes, word for word. It can't be the first option. Any other answer goes back to `backTo`.
- An auto run (nobody can answer: `-p`, a background session, or `"auto": true` in bmuz.json) never answers a gate: the run stops there and the question goes into `.bmuz/questions.md`.
- `backTo`: an earlier step to redo when the creative doesn't approve. That step and the steps needing it are run again.

**script** — the engine runs a command itself, no Claude involved.
- `run` (needed): the command as a list, like `["node", "{plugin}/scripts/write-plan.mjs", "{project}", "{name}"]`. It runs in the project folder.
- `done`, `writes`.

**flow** — the engine launches a saved workflow with its inputs pinned (Claude can't change them) and reads its result. Every workflow a pipeline launches must be pre-approved in `plugin/settings/auto-run.json` (`Workflow(<plugin:name>)`), so an overnight run never stops at Claude Code's "run this workflow?" question; the check refuses a pipeline whose workflow isn't listed.
- `workflow` (needed): `plugin:name`, like `bmuz:hello-flow` → `plugin/workflows/hello-flow.js`.
- `args`: the workflow's inputs, `{holes}` allowed.
- `agentTools`: the only tools the workflow's helpers may use.
- `craft`, `done`, `writes`.

## Done-checks (`done`)
How the engine knows a step really finished. A failed check retries the step twice, then marks it BLOCKED and rolls back its `writes`.

| `type` | Settings | Passes when |
|---|---|---|
| `result-has` | `key` | the talk step's result has `key` (talk steps only: they are the only ones that hand back a result) |
| `file-contains` | `path`, `text` | the file exists and contains the text |
| `file-json-has` | `path`, `key` | the file is JSON and has `key` |

No `done` = the step passes when it ends.

## Files a step writes (`writes`)
The project files the step may create or change. Before the step's first try the engine saves them (a checkpoint); a BLOCKED step puts them back, or deletes the ones that didn't exist.
Because the engine may delete them, each path must stay inside the project: relative, forward slashes, no `..`, not in `.bmuz/`, and no `{holes}`.
The engine checks this again right before it saves or puts back a file, so a hand-edited checkpoint can't reach outside the project either.

## `{holes}`
Text in `question`, `run`, `args` and a done-check's `path` / `text` can carry `{holes}`, filled in when the step runs:
- `{project}`: the project folder; `{plugin}`: the plugin folder.
- A result from a talk step this step needs, directly or through other steps: `{name}` if an earlier talk step's done-check is `result-has` `name`.

Any other hole is refused (a typo like `{nmae}` would otherwise reach the script as it is).
A filled-in path that leaves the project (a result holding `../`) is refused when the step is checked.

## Example
`plugin/pipelines/hello.json`: talk "name" → gate "approve" → script "plan" → flow "hello" → talk "review" (read-only; hands back the card).
