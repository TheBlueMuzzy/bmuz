# BMUZ

- The plan for this repo lives in the framework repo until BMUZ has its own planner: `../framework/.planning/` (ROADMAP — milestone "BMUZ 1.0 — The rebuild", SPRINT, STATE). Read the framework STATE ▶ RESUME HERE first.
- Design: `../framework/.planning/research/bmuz-vision/` — VISION.md (what), ARCHITECTURE.md (how), proof-results.md (what the proof showed + the 7 live must-fixes), REBUILD-PLAN.md (order R1–R14).
- The three rules from the proof: engine work happens at `turn.complete` (or a timer in a live window), never inside a command or prompt hook · flows start through a saved plugin workflow command with the guard pinning its input · every gating hook refuses on its own error, and a gate never treats silence as an answer.
- Step logic stays in `plugin/hooks/engine.js` (no Claude Code API) so the motor can be swapped.
- Checks: `npm run check:fast`. Headless runs: `tests/run.sh "<prompt>"` (sets `MSYS_NO_PATHCONV=1`).
