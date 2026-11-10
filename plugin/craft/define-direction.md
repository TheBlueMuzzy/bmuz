Craft note (define, step "direction" — stages.md: frame first, then the feel target; design-gaps-evidence.md: orientation was redone in all three of Muzzy's games and online leaving/joining cost an 8-phase milestone, so the frame is chosen before anything is built on it; define-research.md section 5(b), questions 1–7: Fullerton's experience goals, MDA, Schell's lenses #1 and #12, the d.school point of view).
Purpose: first the frame (where and how it is played, by whom, online or not, how long, the controls), then the heart of the game. Who the player is (when it has one), the dream it fulfils, the one or two feelings that ARE this game, how we'll know a player feels them, what it must never become, and who it's for. Everything Define chooses later is checked against this.

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

Define makes the game's building blocks from the game so far (IDEATE.md's lines, or an older DISCOVER.md's shelf pieces, each with an id); nothing in the material is thrown away. The engine opens Define with its own short intro, so don't add one: go straight to the first question.

First the frame (the Frame shelf; one or two calls) — it gets more expensive with every screen built on it. Only the parts the Frame shelf doesn't already fix (Fixed lines are one tap to keep):
F1. Where is it played, and which way up? (phone upright, phone sideways, desktop, several)
F2. Who plays: how many, against whom (other people, the computer), together in the room or online?
F3. If online: what happens when someone leaves, goes quiet, comes back or joins late? Can the room play again? (only when online is in)
F4. How long is one game? What does each finger, key or button do? (controls)

Then the heart of the game (one to three questions per call):
1. Of the moments in the material (the Feel shelf; or Experience goals), which one or two ARE this game? Pick up to 2, or say another.
2. Which feeling matters most, in your words? Ask it open first. Only after their answer, offer MDA words so they can mark the one it matches. (MDA's "Aesthetics" means what players feel, not look and feel.)
3. "You are a…": only when the game has a player character or a fiction, or the material has a "You are" line. Keep one, mix two, or write a new one. An abstract game: skip it ([]).
4. Which dream does it fulfil ("I want to …")? Same rule: only with a fiction or a dream in the material.
5. How will we know a player feels it? What would you see them do or say? (The Feel shelf's "how we'll know" lines first.)
6. What is this game NOT? A feeling or kind of game it should never become. (Their fears are the best prompt: "too chaotic" → "not unreadable chaos".)
7. Who is it for? Only when the material says something about players; otherwise skip it ([]).

Hand back (each a JSON list, [] when not chosen):
- "product": {"platform": "...", "orientation": "...", "played": "alone / together in the room / online / against the computer", "players": "how many", "online": "what happens when someone leaves, goes quiet or joins late", "session": "how long one game lasts", "controls": "..."} — only the parts chosen ({} when none); a Fixed line kept in one tap goes in as its words
- "youAre": [one "You are…" line]
- "fantasy": [the dream, "I want to …"]
- "primaries": [1 or 2 feelings, in the player's words, each with the moment it lives in: {"text": "<feeling> — <the moment>", "his": true, "brick": "FE2", "mda": "Challenge"}]
- "knowWhen": [what we'd see a player do or say]
- "notThis": [what it must never become]
- "audience": [the one player pictured]
