# BMUZ — Bugs
Open: 1 (P0 0 · P1 1 · P2 0 · P3 0)

## Open
### B001 · P1 · open · found 2026-11-15 in Sirius Smugglers, Define · 7 of 8 · Scope, First Pass
<!-- bmuz bug:b001 · ca4a3552 -->
"Noted" line check loops after it was written word for word
Steps: 1. Define, step scope: record two decisions in passing with mcp__bmuz__decision 2. Write both returned 'Noted in your design document: …' lines word for word, then finish the step with step_done (accepted) 3. The engine then says the any.noted lines were not written word for word; write them again exactly, alone in the reply · Expected: The check passes once the lines are written exactly, and the next step starts · Actual: The same 'not written word for word' message comes back each time, even when the reply is just the two lines copied exactly. The step can't move on. Earlier, AskUserQuestion was also refused until an already-written Noted line was written again. · How often: every time
<!-- /bmuz bug:b001 -->

## Fixed (newest first)
