Craft note (define, step "decides" — F233 — Finished games come in as fixed: "What Your Rulebook Decides", in place of 2.1 The Feelings to 2.4 The Core Loop for a finished, played game). Studios adapting a finished board game read its pillars from the game itself and keep them (framework .planning/research/bmuz-vision/conversion-research.md: Asmodee Digital "we first identify the pillars of the game… we will use also in the digital adaptation"). The rules are decided: you draft, the creative confirms or corrects, in one pass. Ask nothing else.

1. Read .planning/GDD.md (every chapter: the "Fixed:" lines are the rules, with their source) and the rules themselves in .planning/research/shared.md, all of it.
2. Draft the four from the rules (never invent what the rules don't support; your reading is fine, it's shown for them to correct):
   - The Feelings: the one or two feelings the rules create, as a kind of fun (the senses, make-believe, drama, challenge, being together, discovery, self-expression, simply passing time) and what it is here ("feelings"), and a sign you'd see in a player ("know"), from the rules or their playtest notes.
   - The 3 Pillars: three, each one to three words and a line on what it means here, read from what the rules put at the centre.
   - The Pitch: 3–5 lines written to "you" ("lines", a list) and one line ("oneliner").
   - The Core Loop: "You ___, then ___, so you can ___." from how a turn goes ("loop").
3. Say mcp__bmuz__say {"line": "define.rules", "slots": {"feelings": "...", "know": "...", "pillars": ["**<Pillar>**: <what it means here>", …], "oneliner": "...", "lines": ["You …", …], "loop": "..."}}. It's long, so it's your whole reply; end your turn (the engine carries the step on).
4. Then say "define.rules.ok" and ask its box.
   - "Yes, that's it": call step_done.
   - "Change some": call mcp__bmuz__say {"wait": true} and end your turn (the option already said "next, tell me what"). Their next message is what to change: change only that, then say "define.rules" again with the new draft (end your turn), then "define.rules.ok" again.
5. In an auto run, take the test answers (or keep the draft, and list the question in "asks").

Hand back (the same chapters the new-idea path writes, so Design reads them the same way):
- "chapters": {"1": "**The feeling:** <the feeling> — <kind of fun>: <meaning>\n**We'll know when:** <the sign>\n**Not this game:** <what the rules deliberately leave out, or none>", "2": "- **<Pillar>**: <what it means here>. When we argue about <x>, it says <y>.\n- …" (three lines), "3": "<the 3–5 lines, one per line>\n**One line:** <the one-liner>", "4": "**<the loop>**\n- **Most often:** <the one verb>\n- **Each step:** <what's in the way, what you do, what you get>"}
- "feelings": the one or two feelings, short (a list; the lock page shows them)
- "feeling": the main feeling in a few words (Scope asks for the smallest version that still gives it)
- "pillars": [{"name": "...", "means": "...", "settles": "..."}, …] (three)
- "oneliner": the one-liner, as kept
- "loop": the loop, as kept
