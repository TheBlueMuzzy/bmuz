Craft note (define, step "risks" — define-research.md section 5(b), questions 27–29: Schell's lens #14, Cerny and Kumar's "define your design risks", the Discover fears carried as assumptions).
Purpose: the 1 to 3 things most likely to stop this game being great, each with the cheapest way to find out early, and the result that would make the creative look again. The tests become the GDD's open questions; Design runs them.

How Define asks (every talk step) — the needs spine (framework .planning/research/bmuz-vision/stages.md: "which one is it?" per need, one answer each, building on Ideate's game so far):
- Read .planning/research/define-digest.md first. Its "Read:" line names the material: .planning/IDEATE.md (the game so far, one shelf per need — Frame, Core loop, Things in play, Rules, Decisions, Feel, Change over time, Smallest version, Look & sound, Also noted — each line labelled Fixed / Idea / Open, with an id like [FR2]) or, in an older project, DISCOVER.md's shelves (ids like [EX3]). Never ask again what an earlier step chose (the recap above).
- For each part this step chooses, start from what the material holds for that need:
  - Fixed (a fact or limit they brought): show it and confirm it in one tap — "Keep" first, "Change" second. Never ask it again as an open question.
  - Ideas (theirs): these ARE the options — "Which one is it?" with their ideas in their words, up to 4 (the box adds "Other" for a new one); multiSelect when several can be true at once. None marked as yours.
  - Open (not said yet), or nothing at all for that need: ask it plainly, with "Not decided yet — leave it open" as one option; their own answer in "Other".
  - An older DISCOVER.md: offer the shelf's pieces for that part as the options, the same way.
- Define chooses: one answer each. Never gather again ("what ideas do you have for…" was Ideate's question).
- Only through the question box (AskUserQuestion): 1–3 questions per call, at most 4 options each, in the needs' order (frame first). Nothing they must read goes in plain text beside the box: put it in the question or the options' descriptions.
- Their view first: on every taste question (how it looks, feels or plays) ask for theirs before anything of yours. Your lean only when they say "you pick": one option, marked as yours, with one line why.
- No engineering questions (how to build it): those are BMUZ's calls. A size read is yours, shown as a fact.
- No fiction questions for a game without fiction (an abstract game has no "who are you" or dream to choose): hand those keys back as [].
- Keep their words: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own wording is plain text. Add "brick": "<id>" when an item came from a line of the material ([FR2], [EX3]): the write step marks that line "→ chosen".
- A revision run (the digest's "Define run:" line says "a revision"): show this step's part from the digest's "Already locked" first, with "Keep" first and "Change". Keep = hand that key back as [] (the GDD keeps it exactly as it is). Show the "New since the last Define run" material that belongs to this step.
- Auto run (nobody to answer): choosing is taste, so choose nothing. Hand back every key as [] (the GDD marks it "open — not chosen yet") and put each question you would have asked in "asks" with "picked": "nothing: the creative chooses". A test run's answers, when given above, are the creative's own: use them instead.

The questions:
27. What could stop this game being great? Their worry first. Then show what the material holds: the fears (the Feel shelf's "not this" and worry lines, or an older DISCOVER.md's Hopes & fears with what research found), and the Open lines still unanswered after this run's choices — an open question that would sink the game if answered badly is a risk.
28. For each risk: what's the cheapest way to find out early? A sketch (a throwaway playable toy: for feel), a proto (a quick rules simulation: for numbers and balance), or a paper test. Give it a timebox ("1 hour", "half a day"). The Open questions shelf may already hold one.
29. What result would make you look at it again? ("We'd rethink it if…": kept soft.)

Hand back (a JSON list, [] when not chosen):
- "risks": [1 to 3 of {"risk": "<their words>", "test": "sketch: <what it tries> (1 hour)", "rethink": "<the result that would make them look again>", "status": "open", "brick": "OQ4"}]
