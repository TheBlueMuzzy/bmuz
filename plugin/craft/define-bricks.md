Craft note (define, step "bricks" — stages.md: the needs spine (core loop, things in play, rules, decisions, change over time, look); design-gaps-evidence.md: the rules' shape and the real skill before any code (Goops v1's goal rule flipped 3 times, ~90 commits); define-research.md section 5(b), questions 12–16, and section 6, Muzzy's answer 2: the creative's own mechanism idea first, a backup offered and never required).
Purpose: make the game's building blocks from Discover's material: the core verbs (3 or fewer), a way each one works in play (a mechanism), the things players act on, the theme and the tone.

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

Prior art first, only when it ran: if the recap's "priorArt" is yes and .planning/research/define-prior-art.md exists, read its findings and open with ONE question (header "Prior art"): "Here's what I found: <3 short lines — the closest games, what players miss in them, what's new here>. Does it change anything?" Options: "No, carry on" and "Yes" (description: "say what in Other"). Never a menu of findings; never a pick between research items.

The questions, in the needs' order (one to three per call; each starts from its shelf in the digest):
12. Core loop: which verbs are the core, the ones the game is about? Up to 3 (fewer, deeper verbs usually beat many). The Core loop shelf's lines are the options (or the Verbs shelf in an older DISCOVER.md).
13. For each core verb: is it fun on its own? What makes it fun? (Their view, their words.)
14. Mechanisms, their idea first: for each core verb, "Do you already have a way in mind for how this works in play?" Their idea leads; an Idea line from the material is their idea. Only then offer, beside it, other candidates the material holds, at most 4. Offer a backup ("want a second way to test against it?"); never require one. A verb with no idea and no pick stays open.
15. Things in play: which things does the player act on, and what states can they be in? (The Things in play shelf; or Nouns.)
16. Rules' shape: how does a game end, and how does it score? (The Rules shelf: a Fixed line is one tap; their Ideas are the options.) The shape only — exact numbers are Design's.
17. The real skill: what does a good player do that a new player doesn't? Which decision is hard, and why? (The Decisions shelf.)
18. Over time: what changes during a game, and from game to game? (The Change over time shelf.) Only what the material raises or the game obviously needs; "Not decided yet" is fine.
19. Look and tone: which look and sound words, and which tone? (The Look & sound shelf; or Theme and Tone.)
Never present BoardGameGeek's mechanics list as a catalogue or authority: name mechanisms in designers' words.

Hand back (each a JSON list, [] when not chosen):
- "coreVerbs": [1 to 3 of {"verb": "hit", "outcome": "send the ball back past the other paddle", "fun": "<their words>", "brick": "LO2"}]
- "mechanisms": [one per core verb: {"verb": "...", "lead": "<their idea, or the candidate they took>", "backup": "<only if they wanted one>", "leadBrick": "LO3", "backupBrick": "..."} (the ids only when that one came from the material)]
- "interactables": [the things players act on, with their states]
- "theme": [look and theme words]; "tone": [tone words]
- also, each a JSON list (not required, [] when not chosen): "rules": [the rules' shape: how it ends, how it scores]; "decisions": [the real skill: the hard decision and why]; "change": [what changes over time]
