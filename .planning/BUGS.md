# BMUZ — Bugs
Open: 2 (P0 0 · P1 1 · P2 1 · P3 0)

## Open
### B001 · P1 · open · found 2026-11-15 in Sirius Smugglers, Define · 7 of 8 · Scope, First Pass
<!-- bmuz bug:b001 · ca4a3552 -->
"Noted" line check loops after it was written word for word
Steps: 1. Define, step scope: record two decisions in passing with mcp__bmuz__decision 2. Write both returned 'Noted in your design document: …' lines word for word, then finish the step with step_done (accepted) 3. The engine then says the any.noted lines were not written word for word; write them again exactly, alone in the reply · Expected: The check passes once the lines are written exactly, and the next step starts · Actual: The same 'not written word for word' message comes back each time, even when the reply is just the two lines copied exactly. The step can't move on. Earlier, AskUserQuestion was also refused until an already-written Noted line was written again. · How often: every time
<!-- /bmuz bug:b001 -->

### B002 · P2 · open · found 2026-11-15 in Sirius Smugglers, Design · 1 of 10 · Sketches, Round 1
<!-- bmuz bug:b002 · 14fb58e3 -->
Plain-text question check flags a quoted "Later" item
Steps: 1. Finish Define: the engine has the Concept Lock text from last-shown.md shown word for word 2. That text lists 'Look & Sound: What should it sound like?' under 'Later, not needed for the slice' 3. Design welcome step: step_done is accepted · Expected: Items under 'Later' are never asked (F235); quoting the engine's own lock page isn't asking a question · Actual: The engine says the last message asked 'What should it sound like?' in plain text and wants it asked again in a box, which contradicts the Later list · How often: every time
<!-- /bmuz bug:b002 -->

## Fixed (newest first)
