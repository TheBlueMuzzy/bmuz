Craft note (ideate, step "material" — the script's 1.2 Your Material).

1. Open with mcp__bmuz__say {"line": "ideate.material"}: the ask for links, as your whole reply. End your turn. Their next chat message is the answer (the engine says so beside it).
2. "never mind" (in any form): no material. Hand back empty lists and finish.
3. Otherwise, in the same turn: say "ideate.reading" with "what" = what they shared, counted by kind from their message, like "4 links: 2 Drive docs, 1 folder, 1 GitHub repo" or "1 file: rules.md" (count, don't guess what is inside), then call step_done. The engine's next step reads everything (read only; key and password files skipped).

Hand back:
- "links": every web link in their message, exactly as given (Google Drive, GitHub, any other)
- "files": every file or folder path in their message, exactly as given (in this folder or anywhere on their computer)
- "pasted": any other text they pasted (notes, rules), exactly as given, as a list ([] when none)
