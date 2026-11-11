Craft note (ideate, step "show" — framework .planning/research/bmuz-vision/stages.md: Ideate starts with "show me what you have"; discover-live-review-2026-11-09.md: the free "in one breath" answer held nearly everything by minute 3, and his real material sat in a Drive folder nobody read).
Purpose: get everything the creative already has, in one or two taps: the idea in their own words, and every file, folder and Google Drive link. You read nothing here (the next step, a script, reads it all); you only ask and collect where it is.

Asking (every Ideate step):
- Every question goes through the question box (AskUserQuestion). Never ask anything in plain text: a question in plain chat isn't seen as a question and the run waits (it stalled 18 minutes once). Their own words always go in the box's "Other".
- Nothing they must read goes in plain text in the same turn as the box: it ends up hidden behind it. Put it inside the question or the options' descriptions. At most one short line before the box.
- The engine opens Ideate with its own short intro: don't add one, go straight to the box.

First look: Glob this folder for anything that looks like their material (*.md, *.txt, *.pdf, *.docx, *.psd, *.png, *.unity, folders like Assets/ or docs/), leaving out .bmuz, .planning, node_modules, .git. Then read .planning/research/intake.json if it exists: the start already read what's in its "sources" (and "unreadable" names what it couldn't, like a Drive link).

Material (links, notes, any long text) never goes through the question box: call mcp__bmuz__ask_paste and write exactly the text it returns as your whole reply — nothing before or after it — then end your turn: "Share your links — paste them with Alt+V. I can read Google Drive folder and/or doc links, GitHub links, and even folder and file links from your computer. If you don't want to share any links, just say "never mind"." (the creative's own words, live look 2026-11-10: the box's "Type something." was missed and paste didn't reach it). Never an option that means "I'll paste it" or "a link"; options are only real answers, no filler.

Then:
- When the start already took their material — intake.json has "sources", or "unreadable" items marked "later": true (links and paths Ideate reads next) — never ask for material again (live run 2026-11-10: the Drive link given at the start was asked for a second time). Write ONE short line saying what will be read next, by name (e.g. "I'll read your Google Drive folder and rules.md next."), then:
  - their idea is already in their own words (intake.json "brief" or "pasted" isn't empty): call step_done at once, every key [] (the reading step takes the start's material from intake.json itself);
  - the idea itself is missing (no brief, nothing pasted: only links or files): ask ONLY the one-breath question below ("The idea"), then step_done. "It's all in my files or Drive" means that's fine: "breath" [].
- When the start read nothing but its notes say the material is in Google Drive (and no link came through): ask_paste. Don't ask "where is it?" first: they already told the start. "never mind" → ask the idea question below in the box.
- Otherwise first ONE AskUserQuestion, header "The idea": "In one breath: what's the idea, in your own words? A rough half-memory is fine — type it in 'Type something.'" Options: "Nothing yet — help me find one" (description: "we'll start from what you like"), "It's all in my files or Drive" (description: "next I'll ask for the links"). Then (unless they picked "Nothing yet") ask_paste. Files the first look found that weren't read yet go in "files" either way.
Their next chat message is the answer:
- Links and paths (Google Drive, GitHub, other web links, files or folders on their computer — inside this folder or not, several at once): every URL in "links", every path in "files", exactly as given, one item each. Any other text in it goes in "pasted".
- "never mind": carry on with what you have.
- A Drive link, a pasted text or a path typed in 'Type something.' is material too: collect it.

Hand back (each a JSON list, [] when none):
- "breath": [{"text": "<their exact words for the idea>", "his": true}] — never reworded; [] for "Nothing yet"
- "pasted": [any text they pasted, exactly as given, one item per paste] (not the one-breath answer, not links)
- "files": [paths, files or folders, exactly as given: inside this folder (relative) or anywhere on their computer (C:\..., ~/..., a file:/// link)]
- "links": [every URL they gave: Google Drive folders, docs, files, GitHub, any other link]

Auto run (nobody to answer): ask nothing; hand back every key as [], unless a test run's answers say otherwise (then their words are the answers to the questions above).
