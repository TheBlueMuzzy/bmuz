Craft note (ideate, step "show" — framework .planning/research/bmuz-vision/stages.md: Ideate starts with "show me what you have"; discover-live-review-2026-11-09.md: the free "in one breath" answer held nearly everything by minute 3, and his real material sat in a Drive folder nobody read).
Purpose: get everything the creative already has, in one or two taps: the idea in their own words, and every file, folder and Google Drive link. You read nothing here (the next step, a script, reads it all); you only ask and collect where it is.

Asking (every Ideate step):
- Every question goes through the question box (AskUserQuestion). Never ask anything in plain text: a question in plain chat isn't seen as a question and the run waits (it stalled 18 minutes once). Their own words always go in the box's "Other".
- Nothing they must read goes in plain text in the same turn as the box: it ends up hidden behind it. Put it inside the question or the options' descriptions. At most one short line before the box.
- The engine opens Ideate with its own short intro: don't add one, go straight to the box.

First look: Glob this folder for anything that looks like their material (*.md, *.txt, *.pdf, *.docx, *.psd, *.png, *.unity, folders like Assets/ or docs/), leaving out .bmuz, .planning, node_modules, .git. Then read .planning/research/intake.json if it exists: the start already read what's in its "sources" (and "unreadable" names what it couldn't, like a Drive link).

Material (links, notes, any long text) never goes through the question box: call mcp__bmuz__ask_paste with { question, folder: this folder's full path } and end your turn with no text. The engine draws its own panel above the prompt — a real field to paste into, "Look in this folder: <the full path>", "Never mind — let's take another approach" (live look 2026-11-10: the box's "Type something." was missed, paste didn't reach it, and every "I'll paste it" option ended the question with nothing typed). Never an option that means "I'll paste it" or "a link"; options are only real answers, no filler.

Then:
- When the start already read something (intake.json has sources): ask_paste, question "I've read <the sources' names, short>. Anything else to show me — more text, or Google Drive folder or doc links?" ("never mind" here means that's everything). Don't ask for the idea again: what they gave the start is their one-breath answer.
- When the start read nothing but its notes say the material is in Google Drive (or intake.json lists a Drive link as unreadable): ask_paste, question "Your material is in Google Drive — paste the link (one or more folders or docs)." Don't ask "where is it?" first: they already told the start. "Never mind" → ask the idea question below in the box.
- Otherwise first ONE AskUserQuestion, header "The idea": "In one breath: what's the idea, in your own words? A rough half-memory is fine — type it in 'Type something.'" Options: "Nothing yet — help me find one" (description: "we'll start from what you like"), "It's all in my files or Drive" (description: "the next question takes the links"). Then (unless they picked "Nothing yet") ask_paste, question "Anything I should read? Google Drive folder or doc links, or the text itself." (when the first look found files, start it "I'll read <their names, up to 3>. Anything else?" and put those files in "files").
Their answer comes as the engine's next message:
- "The creative pasted: …": collect it, one item per link (a paste may hold several), the rest as pasted text.
- "chose: look in the folder": Glob again; new files → collect them. Still nothing → ask_paste again with the question "Nothing in <the full path> yet." and end your turn.
- "chose: never mind" or "closed the paste panel": carry on with what you have.
- A Drive link, a pasted text or a path typed in 'Type something.' is material too: collect it.

Hand back (each a JSON list, [] when none):
- "breath": [{"text": "<their exact words for the idea>", "his": true}] — never reworded; [] for "Nothing yet"
- "pasted": [any text they pasted, exactly as given, one item per paste] (not the one-breath answer, not links)
- "files": [paths inside this folder, relative, files or folders: the ones they named or picked]
- "links": [every URL they gave: Google Drive folders, docs, files, any other link]

Auto run (nobody to answer): ask nothing; hand back every key as [], unless a test run's answers say otherwise (then their words are the answers to the questions above).
