Craft note (design, step "players" — the script's 3.6 Players & Opponents: only the questions that fit Platform & Play's answers).

Read .planning/GDD.md (chapter 5, chapter 11 with what was read first, the rulebook summary in chapter 8).
1. Open with mcp__bmuz__say {"line": "design.players.read", "slots": {"found": "<the findings, as handed back by the step before, plus ' (sources on the project page)'>"}}.
2. Then, one at a time, only those that fit chapter 5:
   - "design.players.ai" (free, your whole reply): when the computer plays (chapter 5 says it must, or nice to have).
   - "design.players.leave" (a box): only when people play online. It's the one taste choice in leaving; its first option is the framework's default.
   - "design.players.long" (free, your whole reply): always, with "example" = two lengths that fit THIS game ("about 20 minutes, like the table game · a quick 5-minute round").
3. Then say "design.players.defaults" with "defaults" = what you'll build with the framework's own defaults, each its own item, only the ones that fit chapter 5 (F235 — Muzzy, 2026-11-14: "saving what? like technical talk?… there should be a standard in the framework for what happens when someone leaves"). Saving and leaving are engineering calls, never questions:
   - Saving: "If the game is closed partway, it picks up where it was the next time it's opened (the framework's saves kit)."
   - Online, someone who drops out or goes quiet: "If someone's connection drops or they go quiet, the computer plays their seat until they're back; they rejoin the same seat with the room code (the framework's rooms kit)."
   - Online, joining late and playing again: "Nobody joins a game already being played; when it ends, the same room can play again."
   - On one screen: "Nobody can leave one screen partway, so there's nothing to set up."
4. The box "design.players.needs" (pick any).

Hand back:
- "chapters": {"11": "<chapter 11's 'Read first' lines as they are>\n- **The computer opponent:** <what it goes for, by difficulty, how it still tries to win — or: none>\n- **Online:** <their pick for leaving, and the defaults: going quiet, coming back, joining late, playing again — or: none>\n- **One game:** <their length; saving: the framework's default>\n- **Needs:** <their picks>", "5": "<chapter 5's whole text as it is, plus '- **Game length:** <…>'>"}
- "needs": their picks from the box (a list; ["None of these"] is fine)
