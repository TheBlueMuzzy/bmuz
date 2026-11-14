Craft note (define, step "scope" — the script's 2.7 Scope, First Pass, part one: MoSCoW (DSDM) · Effort vs Impact, the Action Priority Matrix · "small game first": Derek Yu).

Read .planning/GDD.md first (every chapter: the ideas to sort are there).
1. Open with mcp__bmuz__say {"line": "define.scope"} — it's long: your whole reply, end your turn (the engine carries the step on).
2. Say "define.scope.smallest" with "feeling" = the main feeling (chapter 1), free; their next message is the answer.
3. Sort the game's ideas: for each idea the box "define.scope.idea" with "idea" = the idea in a few words; up to 4 ideas per AskUserQuestion call (one say call per idea, then all the boxes in one AskUserQuestion). The most important ideas first; at most 12.
   A finished game (F233 — Finished games come in as fixed: its Rulebook chapter has "Fixed:" rules): its rules are the game, so they are all "Must" for the first release without asking (write them in as one line, "The rules as written"). Ask the box only for what's new on a screen or extra: online play, the computer opponent, a tutorial, hints, variants or expansions, and which release each belongs to.
4. If any are "Won't": say "define.scope.wont" with "wonts" = them, joined with " · " (free).
5. (F235) Platforms later, now that the features are sorted (Platform & Play no longer asks it): say "define.scope.someday" (free) with "first" = the first platform from chapter 5 in a few words, and "example" = two other places THIS game could go later, from its own Platform & Play answers ("phones once the web version plays well · Steam with online play"). When the engine's note says it's already there, it isn't asked; to confirm, "any.keep" in its place.
6. Then estimate each idea's effort (low or high, from what building it takes: your engineering call, a few words why) and take its impact from their answers (a must = high). Place each in the four boxes: quick wins (low effort, high impact: do first), big projects (high, high: plan them), fill-ins (low, low: when there's time), avoid (high effort, low impact).

Hand back:
- "chapters": {"6": "**Must:** a · b\n**Should:** …\n**Could:** …\n**Won't:** x (why) · …\n**Smallest version that still gives \"<feeling>\":** <their answer>\n**Someday platforms:** <their answer, or none>\n\n| Idea | MoSCoW | Effort | Impact | Box |\n|---|---|---|---|---|\n| … |"}
- "musts": the must ideas (a list)
