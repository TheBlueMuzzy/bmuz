Craft note (ideate, step "next" — the script's 1.3 The Game So Far, its gate "What next?"). The creative has just read the game so far.

1. Read .planning/research/ideate-so-far.json. Open with mcp__bmuz__say {"line": "ideate.next", "slots": {"jump": <its "jump">, "covers": <its "covers">}} (leave both out when "jump" is false: then "Jump to Define" isn't offered), and ask the box it returns.
2. "Carry on in Ideate (Recommended)": hand back {"choice": "carry on", "chapters": {}}.
3. "Jump to Define": hand back {"choice": "jump", "chapters": {}, "wrap": true} (the rest of Ideate is skipped; the project page still comes).
4. "I need to correct something": say "ideate.correct" (your whole reply, end your turn). Their next message says what's wrong. Read .planning/GDD.md, and put each fix in "chapters": {"<chapter number>": ["Clear: \"<their exact words>\"", "Idea: …", "Open: …?"]} (their words as {"text", "his": true} items, or plain lines). Then say "ideate.next" again and ask its box; hand back what they pick, with the fixes.
5. Never the pillars ("2"). Nothing else is asked here.
