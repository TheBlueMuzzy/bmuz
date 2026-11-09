Craft note (start, step "opening" — framework .planning/research/bmuz-vision/entry-research.md: the rules for the opening, Question 1 and Question 2).
Purpose: find out where the game is right now, in at most two taps, and read what the creative already has. The labels describe the GAME, never the person: never ask how experienced they are. The engine (not you) then works out where they really are and where to start; you only ask and read.

Ask with AskUserQuestion, one question per call, their own words always open (the box's "Other"). No intro line before it: the question is the opening.

Question 1 — "Where's your game right now?" (header "Your game"). These four options, in this order, word for word:
1. "Nothing yet" — description: "I want to make something but don't know what"
2. "A spark" — description: "a theme, a mechanism, a feeling or a what-if"
3. "A concept" — description: "I can describe it in a few sentences"
4. "Something written or played" — description: "notes, a pitch, a rulebook, a GDD, or a prototype I've played"
(AskUserQuestion takes four options at most, so the design's fifth, "a prototype I've played", is part of the fourth; the reading tells the engine whether there's a prototype.)

Then, by answer:
- "Nothing yet": ask nothing more. Hand back at once.
- "A spark": ask in plain words "Type it: the theme, mechanism, feeling or what-if, in your own words." Wait for their reply. No Question 2.
- "A concept" or "Something written or played": Question 2 — "What do you want from this pass?" (header "This pass"), these options word for word:
  1. "Open it up" — "find more options before choosing"
  2. "Pin it down" — "choose what it's made of and what's in the first release"
  3. "Work it out" — "rules, systems, playtests"
  4. "Build it"
  Then ask in plain words for the material: "Paste it here, or name the files in this folder. I can read text and markdown files in this folder; Google Docs links and PDFs aren't readable yet — paste their text instead. For a prototype, say how it plays and add any playtest notes."
  Before asking, Glob this folder for *.md and *.txt (leave out .bmuz, .planning/research, node_modules): if some look like their notes, name them in the question ("I see rules.md and notes.txt here: read those?").
- An "Other" answer to Question 1 IS material in their words (a pasted concept, an idea): treat it as "A concept" and still ask Question 2.

Read the material: Read every file they named (inside this folder; text only). Their pasted text is material too. Then sort what it says onto the keys below as QUOTES: copy their words exactly (you may cut a quote short; never reword, never fix spelling). Each item is {"text": "<their exact words>", "his": true}. Something that matters but has no quotable line (a rule spread over a page): your own short words, plain text without "his" — the intake marks it as your reading. Never invent what isn't there; a key the material doesn't touch is simply left out.
Sort it wide, not only into "rules": a rulebook or a GDD is full of Discover material too — the things in its world ("nouns": the lamp, the weather cards, the boats), what players do ("verbs": trim the wick, wind the clockwork), the decisions it gives them ("choices"), how it should feel and how playtesters said it felt ("experiences", "aesthetics"), what it's like ("reminds"). The same quote may sit under two keys (a rule under "rules" and its verb under "verbs").

Keys (each a JSON list of items):
- Discover's material: "spark" (what excites them), "youAre" (a "You are…" line: who the player is), "hopes", "fears", "onIce" (ready-made solutions, pictures of how it plays), "constraints" (platform, length, deal-breakers), "experiences" (situations a player is in), "stories" (what a player would tell afterwards), "fantasies" ("I want to…"), "aesthetics" (feelings, MDA words), "players" (who it's for), "senses" (seen, heard, touched), "known" (what everyone already knows of the subject), "tone", "nouns" (the things in the world), "verbs" (what players do), "choices" (decisions players make), "problems" (what players solve), "reminds" (games it reminds them of), "feelsRight" (mechanisms that fit), "hooks", "anchors", "twists".
- Define's blocks, only when the material already CHOSE them (a pitch, a pillars list, a scope list): "primaries" (the one or two feelings that ARE this game), "story" (the game in 3–5 lines, one item per line), "pitch" (one line), "pillars" (design rules that settle arguments), "coreVerbs", "mechanisms", "musts" (what's in the first release), "wont" (what it will never have), "notThis" (what the game must never become).
- Design and beyond: "rules" (written rules or systems: one item per rule or section), "playtests" (what happened when it was played), "built" (a digital prototype or build that exists), "released" (something already out in public).

Hand back:
- "where": "nothing" | "spark" | "concept" | "written" (Question 1)
- "goal": "open" | "pin" | "work" | "build" (Question 2), or "none" when it wasn't asked
- "brief": the idea in one line, in their words ("" for nothing yet); "slug": 2–4 words of it, lower case with dashes, like "lighthouse-keeper" ("" for nothing yet)
- "pasted": [their pasted text, exactly as given, one item per paste] ([] when none); "files": [the paths you read, relative to this folder] ([] when none); a Drive link or a PDF they named goes in "files" too (the intake says it can't read it yet)
- "material": { key: [items] } as above ({} for nothing yet)

Auto run (nobody to answer): take "Nothing yet" unless a test run's answers say otherwise.
