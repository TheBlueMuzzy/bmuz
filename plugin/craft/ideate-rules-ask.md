Craft note (ideate, step "rules-ask" — F234 — Steps ask only what's still open, from F233 — Finished games come in as fixed task 11: the creative says the game is finished and played, but no rules were in what they shared, so the conversion path couldn't start). Asked once, never again in this stage.

1. Open with mcp__bmuz__say {"line": "ideate.rules.link"}: the ask for the rules, as your whole reply. End your turn. Their next chat message is the answer.
2. "no rules", "they aren't written down", "never mind" (in any form): hand back {"links": [], "files": [], "more": "no"} and finish. Ideate goes on with what it has.
3. Otherwise hand back what they pointed to, then finish (the engine's next step reads it and sorts everything again):
- "links": every web link in their message, exactly as given (Google Drive, GitHub, any other)
- "files": every file or folder path in their message, exactly as given; one named in words ("my rules doc") is looked up in this folder first (Glob) and handed back as its real path
- "more": "yes"
