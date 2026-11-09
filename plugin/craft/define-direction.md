Craft note (define, step "direction" — define-research.md section 5(b), questions 1–7: Fullerton's experience goals, MDA, Schell's lenses #1 and #12, the d.school point of view, Unpub's "who is it for?").
Purpose: the heart of the game. Who the player is, the dream it fulfils, the one or two feelings that ARE this game, how we'll know a player feels them, what it must never become, and who it's for. Everything Define chooses later is checked against this.

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's bricks grouped by shelf and label, each with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the bricks their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that brick "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" bricks that belong to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

Start with one short line: Define chooses which of Discover's bricks to build with; nothing on the shelves is thrown away.

The questions (the bank's numbers; one to three per call):
1. Of the moments on the Experience goals shelf (Situation, Story a player tells), which one or two ARE this game? Pick up to 2, or say another.
2. Which feeling matters most, in your words? Ask it open first. Only after their answer, show the MDA words on the shelf (Aesthetic (MDA)) so they can mark the one it matches. (MDA's "Aesthetics" means what players feel, not look and feel.)
3. Finish it: "You are a…". Show the "You are…" lines collected (the Seed, the Spark shelf): keep one, mix two, or write a new one.
4. Which dream does it fulfil? Pick from the Fantasy bricks ("I want to …").
5. How will we know a player feels it? What would you see them do or say?
6. What is this game NOT? A feeling or kind of game it should never become. (The "Feels pasted on" bricks and the fears can prompt it.)
7. Who is it for? Picture one player (the Player bricks).

Hand back (each a JSON list, [] when not chosen):
- "youAre": [one "You are…" line]
- "fantasy": [the dream, "I want to …"]
- "primaries": [1 or 2 feelings, in the player's words, each with the moment it lives in: {"text": "<feeling> — <the moment>", "his": true, "brick": "EX2", "mda": "Submission"}]
- "knowWhen": [what we'd see a player do or say]
- "notThis": [what it must never become]
- "audience": [the one player pictured]
