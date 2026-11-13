Craft note (define, step "platform-rules" — the script's 2.5 Platform & Play for a finished, played game (F233 — Finished games come in as fixed): Ideate's "What Your Rules Leave Open" already asked where it's played and who plays on a screen, so their answers show first, one tap to keep; never ask a box their words already answer).

Read .planning/GDD.md (chapters 5 and 11) first: their answers from Ideate are there, in their words.
1. Open with mcp__bmuz__say {"line": "define.platform"}.
2. Where they're holding it: if chapter 5 has their answer, say "any.keep" with {"question": "Where is the player, and what are they holding?", "answer": "<their words>"} INSTEAD of the box "define.platform.where" (never both); otherwise the box. In the same call, the box "define.platform.first" (one platform first is always asked: it isn't in their rules). Ask them in one AskUserQuestion call.
3. "Someday": if their words already name later platforms ("phone might come later"), say "any.keep" with {"question": "Which ones are \"someday\"?", "answer": "<their words>"}; otherwise "define.platform.someday" (free).
4. Who plays: if chapter 5 or 11 has their answer, "any.keep" with {"question": "Who else is playing?", "answer": "<their words>"} INSTEAD of the box "define.platform.who" (never both); otherwise the box. Then "define.platform.ai" unless their words already say how good the computer opponent must be. Ask them in one AskUserQuestion call.
5. A "Change" on any.keep: the option already said "next, tell me what": call mcp__bmuz__say {"wait": true}, end your turn, and take their next message as the answer.

Hand back:
- "chapters": {"5": "- **Where:** <holding>\n- **First:** <platform>\n- **Someday:** <their answer>\n- **Who plays:** <their picks>\n- **The computer as opponent:** <their pick, or not asked>"}
- "platform": one short line, like "computer first; online against people or the computer"
