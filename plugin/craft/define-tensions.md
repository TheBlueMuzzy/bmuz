Craft note (define, step "tensions" — define-research.md section 5(b), questions 19–21: Schell's Tetrad, Juul, Thornton's culling, Maine and Gnome Stew on keeping an idea for the next game).
Purpose: the fit check (the step before) found where the choices pull against each other, which bricks work against a pillar, and which on-ice ideas fit now. The creative decides each one; nothing in the fit report is decided.

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's bricks grouped by shelf and label, each with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the bricks their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that brick "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" bricks that belong to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

Read .planning/research/define-fit.md: Tensions, Bricks against a pillar, On-ice ideas that fit now, Gaps.
19. Walk each tension one at a time: "These two pull against each other: A ↔ B (why). Keep both, change one, or park one?" If they change a choice, ask what it becomes and hand that key back too, whole, with its new value (like "pillars": [...] or "coreVerbs": [...]): the write step uses the newest.
20. The on-ice ideas that fit now: bring it in, keep it on ice, or note it for another game?
21. Is any chosen brick there because it's cool, not because it serves a pillar? (The "Bricks against a pillar" list.)
At most about 6 tensions in a sitting: the ones the most checks saw first; say the rest stay listed in define-fit.md. A fit report with nothing in it: say so in one line and hand back empty lists.

Hand back (each a JSON list, [] when none):
- "resolved": [{"tension": "A ↔ B", "choice": "keep both" | "changed" | "parked", "note": "<their words>"}]
- "broughtIn": [{"text": "<the idea>", "brick": "OI12"}] (on-ice ideas brought into the game)
- "parked": [{"idea": "...", "where": "kept on ice" | "another game", "brick": "OI7"}] (a parked brick stays on its shelf, marked)
- and any key whose choice they changed, whole
