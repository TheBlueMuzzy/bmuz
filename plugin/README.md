# BMUZ plugin

BMUZ runs a game project's process — Discover, Define, Develop, Deliver — one step at a time from a pipeline file.
In a project with a `bmuz.json`, the engine starts each step itself, hands Claude only that step's craft note,
limits each step to its own tools, stops at gates to ask the creative with buttons, runs script and workflow steps,
checks each step's result, retries twice then marks the step BLOCKED and rolls back, and keeps a journal so a
closed window resumes at the right step. A status band above the prompt shows the step, its state and the time.
Projects without a `bmuz.json` are left alone.

Try it: in a project folder with `{"pipeline": "hello"}` in `bmuz.json`, start `claude --plugin-dir <this folder>` and type `bmuz go`.
