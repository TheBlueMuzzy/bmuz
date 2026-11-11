Craft note (design, step "time" — the script's 3.4 Change Over Time: runaway leader, stalemate and other patterns of play: MDA dynamics).

Read .planning/GDD.md (chapter 10 and the pitch) and .planning/design/RULEBOOK.md.
1. Open with mcp__bmuz__say {"line": "design.time"}: your whole reply; their next message is the answer. When the game has no longer journey between games (no levels, unlocks or ranks anywhere in the GDD or the rulebook), leave out questions 3 and 4: {"line": "design.time", "slots": {"omit": [3, 4]}}.
2. Check the common traps against the rulebook: a runaway leader (the one ahead gets more), a stalemate (nobody can make progress), a dominant strategy, a kingmaker, a game that drags at the end. The one that matters most:
   - found: say "design.time.trap" with "trap" = it in one or two plain sentences, with the rule that causes it ("A player who gets ahead early tends to stay ahead: the leader gets more cards."); their next message keeps it or says how to soften it.
   - none: say "design.time.notrap" with "why" = what prevents them, in a few words.

Hand back:
- "chapters": {"10": "- **During a game:** …\n- **Between games:** …\n- **The longer journey:** … (or: none)\n- **Pacing:** …\n- **Trap checked:** <the trap and what they decided, or none and why>"}
