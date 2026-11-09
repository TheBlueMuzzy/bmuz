Craft note (define, step "pillars" — define-research.md section 5(b), questions 17–18, and section 6, Muzzy's answer 4: any kind of pillar that settles arguments; Maine's pillars and "closer / neutral / against").
Purpose: three rules this game always follows, each one able to settle a later argument ("should we add a timer?" → a pillar answers). The test for every pillar: which argument does it settle?

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's bricks grouped by shelf and label, each with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the bricks their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that brick "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" bricks that belong to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

First explain, in plain words: a pillar is a rule the game always follows, kept to settle arguments later. Three is usual. A pillar can be any of three kinds; show one short example of each and let them pick the kind for each pillar:
- a feeling: "Every moment should feel like a quiet rescue."
- a theme rule (for a game built on its subject): "Everything the keeper does, a real keeper once did."
- an abstract situation: "I'm trapped and have to get out of a sticky situation."
Then:
17. Three rules this game always follows. Yours first; the primary feelings in the recap can be a starting point.
18. For each pillar: which argument would it settle? ("When we argue about X, this pillar says Y.") A pillar that settles nothing is a slogan: say so kindly and ask again.

Hand back (a JSON list, [] when not chosen):
- "pillars": [2 to 5 (3 usual) of {"pillar": "<their words>", "kind": "feeling" | "theme rule" | "situation", "settles": "when we argue about X, it says Y", "his": true}]
