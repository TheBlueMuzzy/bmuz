Craft note (develop, step "lookback" — the script's 4.7 Sprint Look-Back).
Read .bmuz/develop/lookback.json (the sprint's number, the milestone and its %, "onward", "playtested", the sprint's notes and each feature's runs and tries), .planning/SPRINT.md, and what was built (the code and tests the sprint's features changed).
1. Say mcp__bmuz__say {"line": "develop.lookback", "slots": {"n": "<the sprint's number>", "milestone": "<the milestone>", "pct": "<its %, like 60%>", "draft": ["well: …", "wrong: …", "change: …"]}}: your draft of the three lines, from the notes (a tune, a block, a retry, a finding fixed). It is a free question: your whole reply, then end your turn; their next message is their words, and their words win ("fine" or "yes" keeps your draft).
2. Then, asking nothing more: what the sprint built, set down in the documents.

Hand back:
- "retro": {"well": "…", "wrong": "…", "change": "…"} (their words where they gave them)
- "built": the GDD chapter numbers whose part of the game is now in the game and played (often 4 The Core Loop), [] when none is whole yet
- "gdd": {"chapters": {"<n>": "<that chapter's whole text, as built>"}} only for chapters the build changed, else {}
- "rulebook": {"log": "<what the build changed in the rules, and why>", plus any section that changed: "flow": […], "actions": [{"name", "text"}]}, or {} when the rules held
- "tdd": {"fits": "<how it fits together now>"} only for parts the build changed, else {}
- "onward": exactly lookback.json's "onward"; "playtested": exactly its "playtested"
The engine writes them, archives the sprint and says the second line itself.
