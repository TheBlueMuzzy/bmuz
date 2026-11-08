# BMUZ

Muzzy's way of making games — Discover, Define, Develop, Deliver — run step by step by an engine inside Claude Code.

- `plugin/` — the BMUZ plugin (a Claude Code mod)
  - `hooks/register.tsx` — the motor: starts each step, guards tools, asks at gates, keeps the status band
  - `hooks/engine.js` — the step logic, plain JS with no Claude Code API (the motor, `bmuz next` and the tests share it)
  - `pipelines/*.json` — the steps, as data
  - `craft/*.md` — one note per step
  - `workflows/`, `scripts/` — what flow and script steps run
  - `bin/bmuz` — motor B, the fallback (`bmuz next`)
- `project/` — a fake game project the tests run in (state goes in `project/.bmuz/`)
- `tests/` — tests with no Claude (`node --test`), headless runs (`run.sh`), project setup (`setup.mjs`)
- `evidence/` — journals and output from the engine proof (2026-11-08); one is a test fixture

Checks: `npm run check:fast` (pipeline files + node tests + `claude plugin validate` + `claude plugin test`).
Pipeline file format: `docs/pipeline-format.md`.
Try it by hand: `cd project`, `node ../tests/setup.mjs fresh`, `claude --plugin-dir ../plugin`, type `bmuz go`.

Started from the engine proof: design and results in the framework repo, `.planning/research/bmuz-vision/` (VISION, ARCHITECTURE, proof-results, REBUILD-PLAN).
