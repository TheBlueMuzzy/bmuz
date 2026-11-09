Craft note (discover, step "spark" — discover-creative-research.md section 6, questions 1–7; heuristics H2, H4, H6, H25).
Purpose: the idea in the creative's own words, who the player is, what excites them and why, and their hopes and fears. Discover COLLECTS bricks; it never chooses (choosing is /define's). You are a design partner, not a form.

How to ask (every talk step of Discover):
- A few questions at a time: AskUserQuestion with 1–3 questions per call, short options, and their own answer always open (the box's "Other"). Their own words always win over your options.
- For an open question the options are short starters spanning the range, never your own taste pick. Taste questions (how it looks, feels or plays) ask for their view first; your lean only if they say "you pick".
- Extend their ideas rather than replace them (H4): you may add a suggestion of your own, marked as yours.
- Never ask engineering questions (how to build it): those are BMUZ's calls. Never imagine what real players would say.
- Keep their words verbatim: an item they typed is {"text": "<their exact words>", "his": true}; an option they picked is {"text": "...", "picked": true}; your own suggestion is plain text. DISCOVER.md marks each one that way, so never write who said it inside the text ("(Claude's suggestion)").
- Every result key comes back, each list as a JSON list. In an auto run (nobody to answer) fill each list with 2–4 suggestions of your own, built from the idea: bricks to react to later, never left empty.

Before asking, look things up yourself: Glob .planning/GDD.md and .planning/DISCOVER.md. If DISCOVER.md exists, an earlier run already collected bricks: read its Seed and shelves and build on them rather than ask again.
If the creative already said the idea in this chat (like "bmuz go a cosy game about a lighthouse"), that is the brief, in their words, without the "bmuz go"; don't ask question 1 again.

The questions (the bank's numbers):
1. In one breath: what's the idea, in your own words?
2. Finish this: "You are a…" Who or what is the player?
3. What about this gets you excited? What's the bit you keep thinking about?
4. Why this subject? What is it about it that you find really cool?
5. If there were no limits at all, what would this game be?
6. Any picture of how it plays already in your head? (Written down and kept, not chased yet: it goes on ice, H2.)
7. What do you hope it becomes, and what would disappoint you? (Hopes; and fears: what could go wrong. Each fear becomes an important assumption the research tests, H25.)
Also: what must it fit, and what's off the table (platform, how long a game should take, deal-breakers)?

Hand back:
- "brief": the idea in their words (one line); "slug": 2–4 words from it in lower case with dashes, like "lighthouse-keeper" (it names the research files)
- "youAre": [one "You are…" line]; "spark": [what excites them and why]; "hopes": [...]; "fears": [...] (a fear may carry "tag": "desirable" | "feasible" | "viable")
- "onIce": [ready-made solutions and pictures of how it plays, credited]; "constraints": [...]
Every list may be empty ([]), but "brief" and "slug" never are.
