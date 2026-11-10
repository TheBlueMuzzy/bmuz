Craft note (define, step "scope" — stages.md: need 8, the smallest version worth playing; define-research.md section 5(b), questions 22–26: MoSCoW and its cancel test, Yu's smallest version, Ryan's technical evaluation as a fact, Unpub's box information).
Purpose: what the player can do and feel in each release (not features, not tech): the first release's musts, later releases, should and could, what's never in this game and why, and where it's played. Your size read is a fact to react to, never a question.

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
22. What's the smallest version that still gives the primary feeling (recap)? That's the first release. Start from the Smallest version shelf: a Fixed line is one tap to keep, their Ideas are the options.
23. For each thing in the first release: if it were missing, would the game be pointless? Yes = a must; otherwise it's a should or a could.
24. What comes in later releases, and what's never in this game? A reason for each "never".
25. The frame was chosen in the direction step (the recap's "product"): show it in one line and confirm it in one tap ("Keep" first). Ask only a part still open.
26. Your size read, as a fact: small / medium / big, and the risky items, in plain words ("medium: online play is the risky part"). Then ask: does the first release still feel right at that size? It is a rough read; Design's build plan replaces it.

Hand back (each list a JSON list, [] when not chosen):
- "musts": [what the player can do or feel in the first release]; "later": [later releases]; "should": [...]; "could": [...]
- "wont": [{"what": "...", "why": "<their reason>"}]
- "size": [your rough read, one line: yours to give, even in an auto run]
- "product": the frame's parts changed or newly chosen here, in the direction step's shape ({} when kept as it was: the direction step's choice stands)
