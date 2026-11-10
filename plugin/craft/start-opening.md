Craft note (start, step "opening" — framework .planning/research/bmuz-vision/entry-research.md: the rules for the opening, Question 1 and Question 2; stages.md: the stages are Ideate · Define · Design · Develop · Deliver · Release).
Purpose: find out where the game is right now, in at most two taps, and read what the creative already has. The labels describe the GAME, never the person: never ask how experienced they are. The engine (not you) then works out where they really are and where to start; you only ask and read.

Asking:
- Every question goes through the question box (AskUserQuestion), their own words always open (the box's "Other"). Never ask anything in plain text: a plain-text question isn't seen as a question and the run waits (live run 2026-11-09: it stalled 18 minutes).
- Nothing they must read goes in plain text in the same turn as the box: it ends up hidden behind it. Put it inside the question or the options' descriptions. No intro line: the question is the opening.
- Links and long text (their material) never go through the box: mcp__bmuz__ask_paste, then its exact words as your reply.

Question 1 — "Where's your game right now?" (header "Your game"). These four options, in this order, word for word:
1. "Nothing yet, or just a spark" — description: "a theme, a mechanism, a feeling or a what-if — or nothing yet"
2. "A concept" — description: "I can describe it in a few sentences"
3. "Something written" — description: "notes, a pitch, a rulebook or a GDD"
4. "A prototype I've played" — description: "paper or digital"
(AskUserQuestion takes four options at most: "Nothing yet" and "A spark" share one, since both start Ideate from the idea itself.)

Then, by answer:
- "Nothing yet, or just a spark": no Question 2 and no more questions here — Ideate's first step asks for the idea in their own words. "where": "nothing" (or "spark" when their answer carried words of a spark in "Other": those words are material).
- "A concept", "Something written" or "A prototype I've played": two more asks, one after the other:
  1. Question 2, in the box — "What do you want from this pass?" (header "This pass"), these options word for word: "Open it up" — "gather everything and see the game so far, before choosing"; "Pin it down" — "choose what it's made of and what's in the first release"; "Work it out" — "rules, systems, playtests"; "Build it".
  2. Your material, NOT in the box: first Glob this folder for *.md and *.txt (leave out .bmuz, .planning/research, node_modules); files that look like their notes → read them. Then call mcp__bmuz__ask_paste and write exactly the text it returns as your whole reply — nothing before or after it — and end your turn: "Share your links — paste them with Alt+V. I can read Google Drive folder and/or doc links, GitHub links, and even folder and file links from your computer. If you don't want to share any links, just say "never mind"." (the creative's own words, live look 2026-11-10: the box's "Type something." was missed and paste didn't reach it). Never ask for material with the box.
  Their next chat message is the answer:
  - Links and paths (Google Drive, GitHub, files or folders on their computer, inside this folder or not; several at once): each one is an item in "files", exactly as given (one per link or path). Read the ones inside this folder; the rest are read next (Drive, GitHub and paths elsewhere by Ideate's reading step). Any other text in it is "pasted".
  - "never mind": carry on with no material: "where" stays as they picked it, "material" {} (or what the files you read say), "pasted" [] and "files" [] (or just the files you read).
- An "Other" answer to Question 1 IS material in their words (a pasted concept, an idea): treat it as "A concept" and still ask Question 2 and for their material.

Read the material: Read every file they named (inside this folder; text only). Their pasted text is material too. A link (Google Drive, GitHub) or a path outside this folder isn't read here: put it in "files" as given (Ideate's reading step reads it). Then sort what it says onto the keys below as QUOTES: copy their words exactly (you may cut a quote short; never reword, never fix spelling). Each item is {"text": "<their exact words>", "his": true}. Something that matters but has no quotable line (a rule spread over a page): your own short words, plain text without "his" — the intake marks it as your reading. Never invent what isn't there; a key the material doesn't touch is simply left out.
Sort it wide, not only into "rules": a rulebook or a GDD is full of material too — the things in its world ("nouns": the lamp, the weather cards, the boats), what players do ("verbs": trim the wick, wind the clockwork), the decisions it gives them ("choices"), how it should feel and how playtesters said it felt ("experiences", "aesthetics"), what it's like ("reminds"). The same quote may sit under two keys (a rule under "rules" and its verb under "verbs").

Keys (each a JSON list of items):
- The material: "spark" (what excites them), "youAre" (a "You are…" line: who the player is), "hopes", "fears", "onIce" (ready-made solutions, pictures of how it plays), "constraints" (platform, length, deal-breakers), "experiences" (situations a player is in), "stories" (what a player would tell afterwards), "fantasies" ("I want to…"), "aesthetics" (feelings, MDA words), "players" (who it's for), "senses" (seen, heard, touched), "known" (what everyone already knows of the subject), "tone", "nouns" (the things in the world), "verbs" (what players do), "choices" (decisions players make), "problems" (what players solve), "reminds" (games it reminds them of), "feelsRight" (mechanisms that fit), "hooks", "anchors", "twists".
- Define's blocks, only when the material already CHOSE them (a pitch, a pillars list, a scope list): "primaries" (the one or two feelings that ARE this game), "story" (the game in 3–5 lines, one item per line), "pitch" (one line), "pillars" (design rules that settle arguments), "coreVerbs", "mechanisms", "musts" (what's in the first release), "wont" (what it will never have), "notThis" (what the game must never become).
- Design and beyond: "rules" (written rules or systems: one item per rule or section), "playtests" (what happened when it was played), "built" (a digital prototype or build that exists), "released" (something already out in public).

Hand back:
- "where": "nothing" | "spark" | "concept" | "written" | "prototype" (Question 1)
- "goal": "open" | "pin" | "work" | "build" (Question 2), or "none" when it wasn't asked
- "brief": the idea in one line, in their words ("" for nothing yet); "slug": 2–4 words of it, lower case with dashes, like "lighthouse-keeper" ("" for nothing yet)
- "pasted": [their pasted text, exactly as given, one item per paste, links taken out] ([] when none); "files": [the paths you read, relative to this folder] ([] when none); every link (Drive, GitHub), PDF or path outside this folder they named goes in "files" too, exactly as given, one item per link or path (Ideate's reading step reads them)
- "material": { key: [items] } as above ({} for nothing yet)

Auto run (nobody to answer): take "Nothing yet, or just a spark" with nothing typed ("where": "nothing"), unless a test run's answers say otherwise.
