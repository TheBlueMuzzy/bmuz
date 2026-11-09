Craft note (define, step "story" — define-research.md section 5(b), questions 8–11, and section 6, Muzzy's answer 3: explain it with an example, then "write your own" or "be guided"; Tim Ryan's description in "you" and introduction with the edge; Zukowski's hook and anchor).
Purpose: the game in 3 to 5 lines written to the player ("You …"), one sentence that says what it is and what makes it different, the hook and the anchor. The story is the line every later choice is checked against.

How Define asks (every talk step):
- Build on the shelves; never re-ask. Read .planning/research/define-digest.md: DISCOVER.md's bricks grouped by shelf and label, each with an id like [EX3]. Open each question with what the shelf holds ("Discover collected 4 situations: …") and ask the creative to choose from it; their own answer is always open. Never ask again what Discover collected or an earlier step chose (the recap above).
- A few questions at a time: AskUserQuestion, 1–3 questions per call, at most 4 options each (the box adds "Other"), in shelf order, never ranked. A long shelf: show the bricks their earlier choices point at, and say how many more there are.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a shelf: the write step marks that brick "→ chosen" in DISCOVER.md.
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" bricks that belong to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

First explain it in two or three short lines (Muzzy: "it might not be something people are used to"): the story is 3 to 5 lines, written to the player, that say what you do and why it feels the way it does. Then show this example, written for a well-known game (Tetris):
  You face a well that keeps filling with falling shapes.
  You turn and slide each one into the gaps below.
  Every full row you make vanishes, and you can breathe again.
  It keeps getting faster; you keep up, until you don't.
Then ask how they want to make theirs (AskUserQuestion): "Write my own" or "Guide me".
- Write my own (question 8): they write it. Keep their lines exactly; offer to tidy only if they ask.
- Guide me: a few prompts, one to three per call, built on the recap (who you are, the feelings, the dream): "What do you do, moment to moment?", "What gets in your way?", "What does it feel like when it goes well?", "How does one sitting end?". Then draft 3 to 5 lines from their answers, in "you", using their own words wherever you can, and show the draft.
Then:
9. Now one sentence: what is it, and what makes it different? (the pitch)
10. The part a player will recognise (the anchor) and the part they've never seen (the hook): pick from the Hooks & anchors shelf, or say new ones.
11. Read the story and the pitch back together: does it feel right? Change anything?

Hand back (each a JSON list, [] when not chosen):
- "story": [3 to 5 lines, each starting "You"; a drafted line they approved is {"text": "...", "picked": true}]
- "pitch": [one sentence]
- "hook": [the new part]; "anchor": [the familiar part] (each may carry "brick")
