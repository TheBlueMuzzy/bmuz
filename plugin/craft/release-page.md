Craft note (release, step "page" — the script's 6.1 Store & Launch: the store page, written from the pitch).
The Store & Launch card was just shown, word for word. Read .bmuz/release/page.md: the store page BMUZ drafted from the pitch (GDD chapters 1–5).
1. Say mcp__bmuz__say {"line": "release.page", "slots": {"draft": "<page.md's text, exactly as it is in the file>"}}: a free question. Your whole reply, then end your turn; their next message is the answer.
2. Nothing to change ("looks good", "no"): hand back "keep". Changes: make exactly the changes they asked for, nothing more, and hand back the whole page as it should be. Their words for the game win over yours. Something you're unsure of: one plain line, then mcp__bmuz__say {"wait": true} for their answer.
Auto run (nobody is here): hand back "keep" (the page waits for them at the gate anyway). A test run's answers stand in for the creative: use them.

Hand back "page": "keep", or the whole page as the creative wants it (markdown).
The engine saves it in .planning/release/<platform>-page.md and asks "Release <game> on <platform>?" next.
