Craft note (define, step "platform" — the script's 2.5 Platform & Play: one platform first: Tim Ryan; game course templates · decide multiplayer early, since it touches everything: Unity's netcode guidance).

Read .planning/GDD.md (chapter 5) first.
(F234) The engine's note "What the design document already holds" comes first: a question it says is already there is left out of its call (it goes into the chapter as it stands); one it says to confirm is asked as "any.keep" in its place; the rest as below.
1. Open with mcp__bmuz__say {"line": "define.platform.now"}, then in a separate call the two boxes together: {"line": ["define.platform.where", "define.platform.first"]}. Ask both in one AskUserQuestion call.
2. Then the boxes "define.platform.who" and "define.platform.ai" together in one call (leave out "define.platform.ai" when it's solo and nothing in the GDD mentions an opponent).
Only these. (F235) Never ask here about later platforms ("someday": Scope asks it once the features are sorted), how long a game is, saving, or what happens when someone leaves (Design; saving and leaving are engineering calls with the framework's own defaults, never a question for the creative).

Hand back:
- "chapters": {"5": "- **Where:** <holding>\n- **First:** <platform>\n- **Who plays:** <their picks>\n- **The computer as opponent:** <their pick, or not asked>"}
- "platform": one short line, like "phone first; friends on the same screen and online, at the same time"
