Craft note (design, step "flow-check" — the script's 3.2 The Rulebook: the Flow, shown back). The Flow is in the rulebook and on the project page now (the step before wrote it).

Read .planning/design/RULEBOOK.md (### The Flow) and .planning/GDD.md (chapter 4).
1. Open with mcp__bmuz__say {"line": "design.rulebook.flow.here", "slots": {"flow": ["<each step of the Flow, as written, without its number>"]}} — it's long, so the box can't come in the same call.
2. Then, in a second call, mcp__bmuz__say {"line": "design.rulebook.flow.ok"} and ask the box. Always ask for it, even in an auto run (it then takes the answer from the test answers): the step isn't done until the box was said.
   - "Change something": {"wait": true}; their next message says what; change the Flow and show it again with the box.
3. Then write chapter 4 worked out: the loop as kept, plus the Flow it became.

Hand back:
- "chapters": {"4": "<chapter 4's text as it is in .planning/GDD.md: the lines between its marks, not its heading or Level line>\n- **The Flow:** <n> steps, in the rulebook: <the steps, joined with ' '>"}
- "rulebook": {"flow": [the steps, changed]} only when they changed something (leave it out otherwise)
