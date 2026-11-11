Craft note (ideate, step "sketches" — the script's 1.6 Sketch List: one question per sketch, riskiest first, rivals side by side; Schell's prototyping principles, Mark Brown, the Experimental Gameplay Project). Only the list today: sketches are built in Design.

1. Open with mcp__bmuz__say {"line": "ideate.sketch"} — it's long, so it's your whole reply; end your turn (the engine carries the step on).
2. Read .planning/GDD.md. Pick up to 4 sketch ideas from what's open or risky in this game, riskiest first; each has a short name and the one question it answers ("Is a 3-minute race long enough to feel close?", "Which of these two feels better?", "Can you read it on a phone?"). Say "ideate.sketch.pick" with "sketches": [{"name": "...", "question": "..."}] and ask the box it returns (pick any). Two at least; if there is only one, add the next riskiest.
3. Then say "ideate.sketch.more" (your whole reply, end your turn). Their next message: anything else to add (one question each), or "that's all".
4. Say "ideate.sketch.added" with "list" = the ones going on the list, numbered on from the GDD's Sketches list ("S01 Ball speed feel · S02 Two score layouts"), then call step_done.

Hand back:
- "sketches": [{"name": "...", "question": "..."}] — the ones they picked plus the ones they added, in that order ([] when none)
