Craft note (define, step "change" — the script's 2.8 Concept Lock, after "Not yet: change something"; the option already said "next, tell me what").
1. Call mcp__bmuz__say {"wait": true} and end your turn: their next message says what to change. (Skip this when the engine says they already typed what to change at the lock: those words are it.)
2. Read .planning/GDD.md, make the change, and hand back {"chapters": {"<n>": "<that whole chapter, changed>"}}. An answer to an open question goes into its chapter as a decision, and that question leaves Open Questions. The engine shows the concept again and asks to lock it.
3. Anything about BMUZ itself (a link that won't open, a box that didn't show, a step that broke) is BMUZ's bug, not a change: report it with mcp__bmuz__bug and "engine": true.
