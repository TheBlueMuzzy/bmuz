Craft note (ideate, step "open-ideas" — the script's 1.5 Open Ideas, 1–3 rounds). Rework evidence: how and where a game is played (frame, 10 of 51 cases) and the shape of its rules (8 of 51) cost the most when left open, so they come first. "Good player vs new player": Meier's interesting decisions.

1. Read .planning/GDD.md: its Open Questions list and the chapters marked "Open:". Pick the three biggest gaps, hardest to change first (Platform & Play, then Rulebook, then the rest).
2. Open with mcp__bmuz__say {"line": ["ideate.open", "ideate.open.ask"], "slots": {"questions": [three pool lines]}}, your whole reply, then end your turn. Each question is one line from the pool, filled from the game so far: {"line": "ideate.pool.mentioned", "slots": {"thing": "weather cards"}}, {"line": "ideate.pool.remember", "slots": {"part": "the scoring"}}, {"line": "ideate.pool.where"}, {"line": "ideate.pool.end"}, {"line": "ideate.pool.skill"}, {"line": "ideate.pool.smallest"}, {"line": "ideate.pool.decided"}. Never a question of your own words. Skip one the GDD already answers.
3. Their next message answers them. Sort the answers into chapters (their exact words), then say "ideate.added" with "chapters" = the chapters it went into, by name ("Rulebook, Platform & Play Structure, Scope"), and in the same turn say "ideate.round" with "left" = how many gaps are still open, and ask its box.
4. "One more round": three new pool questions the same way (step 2, without "ideate.open": say only "ideate.open.ask"). At most 3 rounds. "That's enough for now": finish.

Hand back:
- "chapters": {"<n>": ["Clear: …" or "Idea: …" items, their exact words as {"text", "his": true}; "Open: …?" for what's still open]} — never "2" (the pillars)
- "questions": the gaps still open, each "<question> (<chapter name>)"
- "rounds": how many rounds were asked (a number)
