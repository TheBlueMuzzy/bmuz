Craft note (define, step "bricks" — define-research.md section 5(b), questions 12–16, and section 6, Muzzy's answer 2: the creative's own mechanism idea first, the shelf's candidates beside it, a backup offered and never required; Ryan's verb check, Anthropy's "develop existing verbs fully", verb bloat).
Purpose: choose what the game is made of: the core verbs (3 or fewer), a way each one works in play (a mechanism), the things players act on, the theme and the tone.

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's bricks grouped by shelf and label, each with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the bricks their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that brick "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" bricks that belong to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

The questions:
12. Which verbs are the core, the ones the game is about? Up to 3. Show the Verbs shelf as the digest groups it ("theme word → outcome"; the Skill groups first), and say that fewer, deeper verbs usually beat many.
13. For each core verb: is it fun on its own? What makes it fun? (Their view, their words.)
14. Mechanisms, their idea first: for each core verb ask first "Do you already have a way in mind for how this works in play?" Their idea leads. Only then show, beside it, the shelf's candidates for that verb (Mechanism shelf: "Feels like the verb" and the research bricks), at most 4. Offer a backup ("want a second way to test against it?"); never require one. A verb with no idea and no pick stays open.
15. Which things in the world does the player act on? (The Nouns shelf.) These become the game's pieces.
16. Theme and tone: which words from the Theme shelf, and which tone (the Tone bricks)?
Never present BoardGameGeek's mechanics list as a catalogue or authority: name mechanisms in designers' words.

Hand back (each a JSON list, [] when not chosen):
- "coreVerbs": [1 to 3 of {"verb": "trim", "outcome": "keep a resource from running down", "fun": "<their words>", "brick": "VE2"}]
- "mechanisms": [one per core verb: {"verb": "trim", "lead": "<their idea, or the shelf candidate they took>", "backup": "<only if they wanted one>", "leadBrick": "ME3", "backupBrick": "ME7"} (the brick ids only when that one came from the shelf)]
- "interactables": [the things players act on]
- "theme": [theme words]; "tone": [tone words]
