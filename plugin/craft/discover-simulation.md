Craft note (discover, step "simulation" — discover-creative-research.md sections 5 and 6, questions 20–27 and 30: Anthropy's verbs and objects, IVW's entities with motivation and conflict, systems thinking, Meier's interesting decisions).
Purpose: break the theme down the way a simulation would: the things in this world (nouns) with the states they can be in, what acts on them, and for living things what they want and what stops them; the verbs, written twice; a verb × noun grid; skills; the player's choices and their costs. In Define the verbs become mechanisms and the nouns the interactables. Collect, never choose.

First read the theme dig's report: .planning/research/discover-<slug>-theme.md (the slug is in the recap; Glob .planning/research/discover-*-theme.md if unsure). Its "Bricks" section has the research's nouns and verbs with their sources. Their view comes first: ask questions 20 and 21 BEFORE you show what the research found, then add the research's nouns and verbs they didn't name.

Ask the way the earlier steps did: a few at a time (AskUserQuestion, 1–3 per call, short options, their own answer always open), their words verbatim ({"text": "...", "his": true} typed, {"text": "...", "picked": true} chosen, plain text = yours).

The questions:
20. What does the player do in this world? Say the verbs you'd use.
21. What things are in this world? Which does the player act on, and which act on their own?
22. For each thing: what state can it be in (full/empty, calm/angry, whole/broken)?
23. For the living things: what do they want, and what stops them?
27. Here are the outcome versions of your verbs ("stitch → join two pieces into one"). Do they still mean what you meant? Write every verb twice: the theme word and its outcome (what it changes in the game, one outcome per verb). The outcome form finds the mechanisms; the theme word keeps the fantasy.
24. Which of your verbs are really one verb, and which combine into a skill? (Group duplicates; don't cut: a short list, developed in depth.)
25. Where does the player have to choose, and what does each choice cost?
26. What problems does the player solve here?
30. Before the research looks for games like this: any games this reminds you of already? What do you love or hate in them?
Then build the verb × noun grid yourself (the main verbs × the main nouns): what each verb does to each noun. Flag a cell "empty" when the verb does nothing to it, "surprising" when it does something unexpected: those cells are where new mechanisms come from. Show the flagged cells and ask if any spark something.

Every key comes back as a JSON list. Never write who said it inside an item's text (DISCOVER.md marks that). In an auto run (nobody to answer) fill each list with 2–4 suggestions of your own, built from the idea and the recap: bricks to react to later, never left empty.
Hand back (lists, [] when empty):
- "nouns": [{"thing", "states": [...], "acts": "acts on / acted on by …", "wants", "stops", "his"?}] (wants/stops for living things)
- "verbs": [{"theme": "trim", "outcome": "keep a resource from running down", "combines": "...", "his"?}]
- "skills": [{"skill", "verbs": [...]}]; "grid": [{"verb", "noun", "does", "flag": "empty" | "surprising" | ""}]
- "choices": [{"choice", "cost"}]; "problems": [...]; "reminds": [games it reminds them of, with what they love or hate]
