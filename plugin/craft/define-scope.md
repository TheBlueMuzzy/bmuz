Craft note (define, step "scope" — define-research.md section 5(b), questions 22–26: MoSCoW and its cancel test, Yu's smallest version, Ryan's technical evaluation as a fact, Unpub's box information).
Purpose: what the player can do and feel in each release (not features, not tech): the first release's musts, later releases, should and could, what's never in this game and why, and where it's played. Your size read is a fact to react to, never a question.

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's bricks grouped by shelf and label, each with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the bricks their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that brick "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" bricks that belong to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

The questions:
22. What's the smallest version that still gives the primary feeling (recap)? That's the first release.
23. For each thing in the first release: if it were missing, would the game be pointless? Yes = a must; otherwise it's a should or a could.
24. What comes in later releases, and what's never in this game? A reason for each "never".
25. Where is it played, and how long does one game last? Alone or together, online or in the room? What the Spark shelf already says (Must fit / off the table): confirm it, don't ask it again.
26. Your size read, as a fact: small / medium / big, and the risky items, in plain words ("medium: the weather system is the risky part"). Then ask: does the first release still feel right at that size? It is a rough read; Design's build plan replaces it.

Hand back (each list a JSON list, [] when not chosen):
- "musts": [what the player can do or feel in the first release]; "later": [later releases]; "should": [...]; "could": [...]
- "wont": [{"what": "...", "why": "<their reason>"}]
- "size": [your rough read, one line: yours to give, even in an auto run]
- "product": {"platform": "...", "played": "alone / together in the room / online", "session": "how long one game lasts", "players": "how many"} ({} when not chosen)
