Craft note (ideate, step "show" — framework .planning/research/bmuz-vision/stages.md: Ideate starts with "show me what you have"; discover-live-review-2026-11-09.md: the free "in one breath" answer held nearly everything by minute 3, and his real material sat in a Drive folder nobody read).
Purpose: get everything the creative already has, in one or two taps: the idea in their own words, and every file, folder and Google Drive link. You read nothing here (the next step, a script, reads it all); you only ask and collect where it is.

Asking (every Ideate step):
- Every question goes through the question box (AskUserQuestion). Never ask anything in plain text: a question in plain chat isn't seen as a question and the run waits (it stalled 18 minutes once). Their own words always go in the box's "Other".
- Nothing they must read goes in plain text in the same turn as the box: it ends up hidden behind it. Put it inside the question or the options' descriptions. At most one short line before the box.
- The engine opens Ideate with its own short intro: don't add one, go straight to the box.

First look: Glob this folder for anything that looks like their material (*.md, *.txt, *.pdf, *.docx, *.psd, *.png, *.unity, folders like Assets/ or docs/), leaving out .bmuz, .planning, node_modules, .git. Then read .planning/research/intake.json if it exists: the start already read what's in its "sources" (and "unreadable" names what it couldn't, like a Drive link).

Then ONE AskUserQuestion call:
- When the start already read something (intake.json has sources): one question, header "Anything else?": "I've read <the sources' names, short>. Anything else to show me — more text, or Google Drive folder or doc links?" Options: "That's everything" first; "Paste links or text" (description: "next, into the chat — Ctrl+V works there"); "Read <the files you found that weren't read yet, up to 3 names>" when there are some. Don't ask for the idea again: what they gave the start is their one-breath answer.
- When the start read nothing but its notes say the material is in Google Drive (or intake.json lists a Drive link as unreadable): one question, header "Drive link": "Your material is in Google Drive — can I have the link (one or more folders or docs)?" Options: "Paste links or text" first (description: "next, into the chat — Ctrl+V works there"); "No link — ask me the idea instead" (description: "the idea in one breath, next"). Don't ask "where is it?" first: they already told the start.
- Otherwise two questions in the same call:
  1. header "The idea": "In one breath: what's the idea, in your own words? A rough half-memory is fine — type it in 'Type something.'" Options: "Nothing yet — help me find one" (description: "we'll start from what you like"), "It's all in my files or Drive" (description: "the next question takes the links").
  2. header "Your material": "Anything I should read? Google Drive folder or doc links, files here, or the text itself." Options: "Paste links or text" first (description: "next, into the chat — Ctrl+V works there"); "Read <the files you found, up to 3 names>" when there are some, else "Look in this folder again" (description: "put your files in <this folder's full Windows path> first, then pick this"); "Nothing to read".
- "Paste links or text" picked: write ONE line — "Paste your links or text now (Ctrl+V), then press Enter." — and end your turn. Their next message is the material; collect it, one item per link (a paste may hold several).
- "Look in this folder again" and still nothing there: ask the same material question again, starting "Nothing in <the full path> yet." — the way back to the paste option, never a new set of options.
- Never another option that means "I'll paste it" or "a link" (picking one ends the question with nothing typed — live look 2026-11-10: four screens of "I'll paste it", never a field). Options are only real answers; no filler.
- A Drive link, a pasted text or a path typed in 'Type something.' is material too: collect it. If they said "It's all in my files or Drive" and gave no path or link, ask once more with the "Drive link" question above.

Hand back (each a JSON list, [] when none):
- "breath": [{"text": "<their exact words for the idea>", "his": true}] — never reworded; [] for "Nothing yet"
- "pasted": [any text they pasted, exactly as given, one item per paste] (not the one-breath answer, not links)
- "files": [paths inside this folder, relative, files or folders: the ones they named or picked]
- "links": [every URL they gave: Google Drive folders, docs, files, any other link]

Auto run (nobody to answer): ask nothing; hand back every key as [], unless a test run's answers say otherwise (then their words are the answers to the questions above).
