Craft note (define, step "risks" — define-research.md section 5(b), questions 27–29: Schell's lens #14, Cerny and Kumar's "define your design risks", the Discover fears carried as assumptions).
Purpose: the 1 to 3 things most likely to stop this game being great, each with the cheapest way to find out early, and the result that would make the creative look again. The tests become the GDD's open questions; Design runs them.

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's material grouped by shelf and label, each piece with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the pieces their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that piece of material "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" material that belongs to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

The questions:
27. What could stop this game being great? Their worry first. Then show the fears on the Hopes & fears shelf with what the research found about each (supported / contradicted / no evidence).
28. For each risk: what's the cheapest way to find out early? A sketch (a throwaway playable toy: for feel), a proto (a quick rules simulation: for numbers and balance), or a paper test. Give it a timebox ("1 hour", "half a day"). The Open questions shelf may already hold one.
29. What result would make you look at it again? ("We'd rethink it if…": kept soft.)

Hand back (a JSON list, [] when not chosen):
- "risks": [1 to 3 of {"risk": "<their words>", "test": "sketch: <what it tries> (1 hour)", "rethink": "<the result that would make them look again>", "status": "open", "brick": "OQ4"}]
