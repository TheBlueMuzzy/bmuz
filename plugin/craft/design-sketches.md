Craft note (design, step "sketches" — the script's 3.1 Sketches, Round 1, before building: decide how you'll know before building: Schell · one mechanic per sketch: Mark Brown (GMTK)).

Read .planning/GDD.md first: its "## Sketches" list (S01 …) and the chapters each sketch is about.
1. Open with mcp__bmuz__say {"line": "design.sketches"}.
2. The list is empty: say "design.sketches.none", then call step_done with {"plan": [], "build": "no"}.
3. Otherwise say "design.sketches.list" with "list" = the sketches as on the list, joined with " · " ("S01 Ball speed feel · S02 Two score layouts"), and "tests" = one line per sketch, "<id>: <how we'll know: what the creative will see or pick, one plain line>". Then, in a second call, the box "design.sketches.order" (a box never shares a call with a long line), and ask it.
   - "Change the order or the tests": {"wait": true}; their next message says what; change it, say the list again with the box.
4. For each sketch, decide (your call, not asked): is it a numbers question (odds, balance, first-player advantage: answered by simulation or the math, not a page to play)? And its knobs: the 2–6 things the creative will want to move ("Speed", "Speed-up per hit").

Hand back:
- "plan": [{"id": "S01", "name": "Ball speed feel", "question": "which speed feels fast but readable?", "test": "you pick a speed that still feels readable after a minute", "numbers": false, "knobs": ["Speed", "Speed-up per hit"]}, …] in the agreed order
- "build": "yes" (or "no" when the list is empty)
