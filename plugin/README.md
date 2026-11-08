# BMUZ plugin

BMUZ runs a game project's process — Discover, Define, Develop, Deliver — one step at a time from a pipeline file.
In a project with a `bmuz.json`, the engine starts each step itself, hands Claude only that step's craft note,
limits each step to its own tools, stops at gates to ask the creative with buttons, runs script and workflow steps,
checks each step's result, retries twice then marks the step BLOCKED and rolls back, and keeps a journal so a
closed window resumes at the right step. A status band above the prompt shows the step, its state and the time.
Projects without a `bmuz.json` are left alone.

Try it: in a project folder with `{"pipeline": "hello"}` in `bmuz.json`, start `claude --plugin-dir <this folder>` and type `bmuz go`.

## What the creative can say (typed, or as /commands in a live window)
- `bmuz go` — start, or carry on from where it stopped
- `bmuz approve <option>` — answer the open gate (in a live window the gate asks with buttons)
- `bmuz undo` — the undo list, newest first: "go back to before <step>: puts back <files>; runs N steps again"
- `bmuz undo <step>` — go back to before that step: its files and every later step's are put back (only files listed in `writes`)
- `bmuz retry` — give a BLOCKED step 2 more tries
- `bmuz doctor` — check the state against the journal and say what went wrong (refused actions, a window that closed mid-step, a BLOCKED step)

## What it keeps in the project (`.bmuz/`)
- `journal.jsonl` — every step start and finish (with its time), retry, BLOCK, gate answer, refused action, undo: the record
- `state.json` — where we are; rebuilt from the journal at every start if it's missing, damaged or behind
- `lock.json` — the step under way; left open means the window was killed
- `checkpoint-<step>.json` — the step's `writes` files from before its first try

## Unattended runs (overnight, background)
A session nobody can answer (`claude -p`, `claude --bg`), or a project with `"auto": true` in `bmuz.json`, is an **auto run**:
- Claude never asks: the question tool is refused, and each talk step tells Claude to take the default and list the question in its result.
- Those questions go into `.bmuz/questions.md`, each with the default that was taken.
- A turn that ends without finishing its step counts as a failed try (2 retries, then BLOCKED), so a plain-text question can't stall the run.
- Gates are never answered: the run stops at the gate and the question goes into `questions.md`.
- Start it with the settings that pre-answer Claude Code's own questions: `--settings <plugin>/settings/auto-run.json`.

## Install
From this repo's folder on each machine (the plugin is read straight from it, so `git pull` updates it):
```
claude plugin marketplace add C:/Users/Muzzy/Documents/dev/bmuz
claude plugin install bmuz@bmuz
```
From GitHub instead (reads the default branch): `/plugin install bmuz --marketplace TheBlueMuzzy/bmuz`
