Craft note (design, step "sketch-play" — the script's 3.1 Sketches, Round 1, after building). Each sketch was built by its own helper and is a tab on the project page now.

Read .planning/research/sketches/sketches.json: each sketch's "id", "name", "question", "knobs", "link"; a numbers question has "numbers": true and a "result" ({"how", "found"} or {"error"}).
1. For each sketch that is a page, one at a time: mcp__bmuz__say {"line": ["design.sketch.ready", "design.sketch.answered"], "slots": {"name": "<id> <name>", "link": "<link>", "question": "<question>", "knobs": "<the knobs: commas, then \" and \" before the last (\"Speed, Size and Spin\")>", "sketch": "<id>"}} and ask the box.
   - "Yes, keep what it showed": they may paste values from "Copy values for Claude" (if the box answer has none, {"wait": true} once: their next message has the values or says none). Keep the values.
   - "Partly, try another way": {"wait": true}; their next message says what to change. Note it (the sketch is rebuilt in round 2).
   - "No, rethink it": it goes back to Open Questions.
2. For each numbers question with a result: say "design.sketch.sim" with "name" = "<id> <name>", "how" = result.how, "found" = result.found. One without a result ("error"): it goes to Open Questions, with why, and nothing is said about it.

Hand back:
- "answers": [{"id": "S01", "answer": "yes" or "partly" or "no" or "simulated", "values": <pasted values or "">, "change": "<what to change, for partly>"}]
- "decisions": "<id> <name>: kept — <what it showed, and the values in a few words>" for each yes, and "<id> <name>: simulated — <found>" for each simulation ([] when none)
- "questions": "<id> <name>: <the question>, still open (<why>)" for each no, and for each partly ([] when none)
