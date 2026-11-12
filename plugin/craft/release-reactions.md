Craft note (release, step "reactions" — the script's 6.2 First Reactions).
Read .bmuz/release/run.json (where it went live, each link) and .planning/GDD.md chapter 1 (The Feelings: each "**The feeling:**" line).
1. Say mcp__bmuz__say {"line": "release.reactions"}: a free question. Your whole reply, then end your turn; their next message is what players are saying, any way they have it.
2. Read what they gave you. Pasted text as it is; a link with WebFetch when it is a public page (a store's reviews, a forum thread). A link you can't open: say in one plain line which one you couldn't read and ask them to paste it, as a free question again (mcp__bmuz__say {"wait": true}).
3. Sort it, asking nothing more. Nothing here is decided for them: every fix goes on the roadmap for an update, to plan with them in Develop.
   - Each feeling from chapter 1, checked against the reactions: "seen ✓", "partly" or "not seen", with what in the reactions shows it, in a few words ("5 reviews say it came down to the last card").
   - Fixes worth an update: something players want changed, in their terms ("hail is too strong late in the game").
   - Bugs: something is broken. Each one a report: {"title", "level": P0–P3, "steps", "expected", "actual"}.
Auto run (nobody is here): don't ask; hand back the feelings as "not seen" with why "no reactions yet" and empty lists. A test run's answers stand in for the creative: use them.

Hand back "reactions": {"feelings": [{"feeling": "<the chapter 1 words exactly>", "seen": "seen ✓" | "partly" | "not seen", "why": "…"}], "fixes": ["…"], "bugs": [{…}]}.
The engine puts the fixes in an Update milestone on the roadmap, the bugs in BUGS.md, and says "Against your feelings: …" itself.
