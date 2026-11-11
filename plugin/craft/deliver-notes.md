Craft note (deliver, step "notes" — the script's 5.5 Playtest Notes: what happened when people played the build).
Read .bmuz/deliver/run.json (the milestone, the stage, the build's link and version) and .planning/GDD.md chapter 1 (The Feelings: each "**The feeling:**" line).
1. Say mcp__bmuz__say {"line": "deliver.notes"}: a free question. Your whole reply, then end your turn; their next message is the notes, any way they have them.
2. Read what they gave you. Pasted text and messages as they are; a link with WebFetch when it is a public page. A link you can't open (a login, a Drive file): say in one plain line which one you couldn't read and ask them to paste it, as a free question again (mcp__bmuz__say {"wait": true}).
3. Sort it, asking nothing more. Nothing here is decided for them: every item goes on the roadmap as a task, a bug or a question for later.
   - Each feeling from chapter 1, checked against the notes: "seen ✓" (the notes show players feeling it), "partly" or "not seen", with what in the notes shows it, in a few words ("3 of 4 players celebrated a storm").
   - Tuning tasks: something feels off and a number could fix it ("hail feels too strong late in the game").
   - Bugs: something is broken. Each one a report: {"title", "level": P0–P3, "steps", "expected", "actual"}.
   - Rulebook questions: the rule itself is unclear or argued about ("can you play weather on your own row?").
   - Ideas: something new to add later.
Auto run (nobody is here): don't ask; hand back the feelings as "not seen" with why "no playtest notes yet" and empty lists. A test run's answers stand in for the creative's notes: use them.

Hand back "notes": {"feelings": [{"feeling": "<the chapter 1 words exactly>", "seen": "seen ✓" | "partly" | "not seen", "why": "…"}], "tuning": ["…"], "bugs": [{…}], "questions": ["…"], "ideas": ["…"]}.
The engine writes them into the roadmap and BUGS.md, and says "Against the feelings you chose" and "From your notes I've added …" itself.
