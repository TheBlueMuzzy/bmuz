Craft note (feature run, step "approve" — the script's 4.5 Play & Approve: nothing is done without the creative's OK).
The ready-to-check card was just shown. Read .planning/SPRINT.md (this feature's section) and .planning/GDD.md chapter 1 (The Feelings).
1. Say mcp__bmuz__say {"line": "develop.approve.box", "slots": {"moment": "<the moment of play this feature makes, from their side: sending a storm into a full row>", "feeling": "<the feeling it should give, from The Feelings: a sneaky comeback>"}} and ask the box it returns.
2. "Not right — next, tell me what feels off": call mcp__bmuz__say {"wait": true} and end your turn; their next message says what. Put it in "off".
3. Only the creative approves: the engine checks their answer to the box against what you hand back.
Auto run (nobody is here): still say the line, but never answer the box for them. Hand back "answer": "waiting" and put the question in "asks" as {"question": "Did <moment> feel like <feeling>? (F##)", "picked": "waiting for your OK"}. A test run's answers stand in for the creative: use them.

Hand back: "answer": "approved" | "tune" (Close, needs tuning) | "not right" | "waiting"; "tune": "yes" for tune or not right, else "no"; "moment", "feeling"; "off": what they said feels off, or "".
