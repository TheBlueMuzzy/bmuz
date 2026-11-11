Craft note (develop, step "teaching" — the script's 4.8 Teaching, only after playtests: the Playtesting table has games in it).
Read content/data/playtesting.json, .planning/GDD.md (chapter 14 Teaching's notes) and .planning/design/RULEBOOK.md.
1. Open with mcp__bmuz__say {"line": "develop.teaching"}.
2. Then mcp__bmuz__say {"line": "develop.teaching.ask"}: a free question, your whole reply; end your turn. Their next message answers the three questions.
3. Then mcp__bmuz__say {"line": "develop.teaching.plan", "slots": {"steps": "<3 short steps, joined with ' · ', each teaching one thing in the order players meet it>"}} and call step_done in the same turn.

Hand back: "steps": [the 3 steps], "learn": "<what a new player must understand in the first minute, from their answer>".
