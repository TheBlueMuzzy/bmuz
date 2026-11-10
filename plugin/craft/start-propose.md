Craft note (start, step "propose" — framework .planning/research/bmuz-vision/entry-research.md: the proposal screen; rule 3, the engine proposes and the creative confirms; stages.md: the six stages).
Purpose: show the creative, on one screen, what was read, what it already covers stage by stage, and where the engine would start them; they confirm with one tap. You don't decide where they start: the intake did, by fixed rules, in .planning/research/intake.md and intake.json.

Asking: every question goes through the question box (AskUserQuestion); never ask in plain text.

Read .planning/research/intake.json first ("where", "proposal", "gaps").
- "where" is "nothing" or "spark": ask nothing. Hand back "stage" and "at" from "proposal" at once (the creative already said where the game is; Question 1 was their tap).
- Otherwise the engine has just shown the creative the proposal (What I read, What it already covers, Where I'd start you) in a message of its own. Read .planning/research/intake.md, then ask with AskUserQuestion, header "Start", question "Start there? (<the proposal's stage and step, as in its "Where I'd start you" line>)". Write nothing in plain text before the box and don't repeat the proposal. The options are its "## Options" section in that order, word for word: "Start there: …" first, then "Start earlier: …" (when there is one), then "Somewhere else".
  - "Start there": the proposal's stage and at.
  - "Start earlier": the proposal's "earlier" stage and at.
  - "Somewhere else": one more AskUserQuestion, "Where would you like to start?", header "Stage": up to three of the stages not offered yet (Ideate, Define, Design, Develop, Deliver, Release; in that order, one line each from the gap map) and last "Not now" ("keep the gap map; start later with bmuz stage <stage>"). Their own words ("Other") may name any stage, and a step in it ("Define, at pillars").
  Never argue them out of their choice: a later start than the material supports still works (the stage asks what's missing).

Hand back:
- "stage": "ideate" | "define" | "design" | "develop" | "deliver" | "release", or "later" for Not now
- "at": the step to start at — the proposal's "at" for its own stage, "first" for any other stage (and for "later") unless they named a step; never empty (Ideate's first step: show; Define's steps: digest, direction, story, bricks, pillars, scope, risks)
The engine then moves into that stage itself and opens it with the stage's short intro; don't describe the stage yourself.

Auto run (nobody to answer): "Start there", unless a test run's answers say otherwise.
