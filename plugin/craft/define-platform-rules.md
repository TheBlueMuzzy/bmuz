Craft note (define, step "platform-rules" — the script's 2.5 Platform & Play for a finished, played game (F233 — Finished games come in as fixed). F235: this is the one place where it's played and who plays are asked (Ideate no longer asks them). What their rules or their own words already say shows first, one tap to keep; never ask a box their words already answer).

Read .planning/GDD.md (chapters 5 and 11) first.
(F234) The engine's note "What the design document already holds" comes first: a question it says is already there is not asked at all, not even as a Keep (it goes into the chapter as it stands); one it says to confirm is the Keep below; one it says is missing is asked.
1. Open with mcp__bmuz__say {"line": "define.platform.now"}.
2. Where they're holding it: if the engine's note says to confirm it, say "any.keep" with {"question": "Where is the player, and what are they holding?", "answer": "<their words>"} INSTEAD of the box "define.platform.where" (never both); otherwise the box. In the same call, the box "define.platform.first" (one platform first is always asked: it isn't in their rules). Ask them in one AskUserQuestion call.
3. Who plays: if the engine's note says to confirm it, "any.keep" with {"question": "Who else is playing?", "answer": "<their words>"} INSTEAD of the box "define.platform.who" (never both); otherwise the box. Then "define.platform.ai" unless their words already say how good the computer opponent must be. Ask them in one AskUserQuestion call.
4. A "Change" on any.keep: the option already said "next, tell me what": call mcp__bmuz__say {"wait": true}, end your turn, and take their next message as the answer.
Only these. Never ask here about later platforms ("someday": Scope asks it once the features are sorted), how long a game is, saving, or what happens when someone leaves (Design; saving and leaving are engineering calls with the framework's own defaults, never a question for the creative).

Hand back:
- "chapters": {"5": "- **Where:** <holding>\n- **First:** <platform>\n- **Who plays:** <their picks>\n- **The computer as opponent:** <their pick, or not asked>"}
- "platform": one short line, like "computer first; online against people or the computer"
