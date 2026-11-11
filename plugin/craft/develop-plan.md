Craft note (develop, step "plan" — the script's 4.3 Plan the Sprint: you draft the plan card; the engine shows it and asks "Build this sprint?").
Read .bmuz/develop/propose.json (the sprint's number, the milestone and the features ready to build now, in order: at most 3), then .planning/GDD.md, .planning/design/RULEBOOK.md and .planning/TDD.md for each of those features.
Say nothing and ask nothing: call step_done (the engine writes the plan card and shows it). If you do open with the step's line, one ready feature is "develop.plan.one" ("…1 feature:"), never "develop.plan" with a count of 1.
If the engine says above that the creative answered "Change it", their next message says what: call mcp__bmuz__say {"wait": true} and end your turn first, then change the cards and finish.

Hand back:
- "goal": what the creative will see or play at the end of this sprint, in one line ("one full turn you can play").
- "features": one card per ready feature, in the order given, sized to the work: [{"id": "F01", "see": "<what the creative will see when it's done, from the player's side>", "done": "<done when: by the rulebook, and what they'll have played>", "notYet": "<what this feature deliberately leaves for later>", "needs": "<what it needs from the creative, or nothing>", "tasks": [{"who": "🤖", "text": "<a task — the file it touches>"}, …], "check": "<the test plan: which rules get which tests; what the creative plays>"}].
  3 to 8 tasks each; 🤖 for Claude's, 🙋 for the creative's (art, a decision, a feel check on their phone). Every rule the feature builds is in a task and in the check.
