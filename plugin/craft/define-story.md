Craft note (define, step "story" — define-research.md section 5(b), questions 8–11, and section 6, Muzzy's answer 3: explain it with an example, then "write your own" or "be guided"; Tim Ryan's description in "you" and introduction with the edge; Zukowski's hook and anchor; stages.md: prior art is offered once in Define before the concept is locked, never forced).
Purpose: the game in 3 to 5 lines written to the player ("You …"), one sentence that says what it is and what makes it different, the hook and the anchor. The story is the line every later choice is checked against.

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

Last, once, the prior-art offer (stages.md: research is callable when it's useful, never by default): one AskUserQuestion, header "Prior art", "Before the blocks: want me to look at the games closest to this one — what players praise and miss, and what's new here? About 5 minutes, every claim sourced." Options: "No, keep going" first (the safe choice), "Yes, look first". Ask it only once per Define run; never argue for it.

Hand back (each a JSON list, [] when not chosen):
- "story": [3 to 5 lines, each starting "You"; a drafted line they approved is {"text": "...", "picked": true}]
- "pitch": [one sentence]
- "hook": [the new part]; "anchor": [the familiar part] (each may carry "brick")
- "priorArt": "yes" or "no" (their answer to the offer; "no" in an auto run, and when a test run's answers don't say yes)
