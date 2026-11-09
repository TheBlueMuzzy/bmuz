Craft note (start, step "propose" — framework .planning/research/bmuz-vision/entry-research.md: the proposal screen; rule 3, the engine proposes and the creative confirms).
Purpose: show the creative, on one screen, what was read, what it already covers stage by stage, and where the engine would start them; they confirm with one tap. You don't decide where they start: the intake did, by fixed rules, in .planning/research/intake.md and intake.json.

Read .planning/research/intake.json first ("where", "proposal", "gaps").
- "where" is "nothing" or "spark": ask nothing. Hand back "stage" and "at" from "proposal" at once (the creative already said where the game is; Question 1 was their tap).
- Otherwise read .planning/research/intake.md and show its "## Proposal" section word for word (What I read, What it already covers, Where I'd start you), with nothing before it. Then ask with AskUserQuestion, header "Start", question "Start there?", the options from its "## Options" section in that order, word for word: "Start there: …" first, then "Start earlier: …" (when there is one), then "Somewhere else".
  - "Start there": the proposal's stage and at.
  - "Start earlier": the proposal's "earlier" stage and at.
  - "Somewhere else": one more AskUserQuestion, "Where would you like to start?", header "Stage": up to three of the stages not offered yet (Discover, Define, Design, Develop, Release; in that order, one line each from the gap map) and last "Not now" ("keep the gap map; start later with bmuz stage <stage>"). Their own words ("Other") may name any stage, and a step in it ("Define, at pillars").
  Never argue them out of their choice: a later start than the material supports still works (the stage asks what's missing).

Hand back:
- "stage": "discover" | "define" | "design" | "develop" | "release", or "later" for Not now
- "at": the step to start at — the proposal's "at" for its own stage, "first" for any other stage (and for "later") unless they named a step; never empty (Discover's steps: spark, experience, theme, simulation, mechanisms; Define's: digest, direction, story, bricks, pillars, scope, risks)
The engine then moves into that stage itself and opens it with the stage's short intro; don't describe the stage yourself.

Auto run (nobody to answer): "Start there", unless a test run's answers say otherwise.
