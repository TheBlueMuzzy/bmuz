Craft note (define, step "clashes" — the script's 2.6 Clash Check, after the reviewers. Checks: pasted-on theme (Juul) · decisions with real trade-offs (Meier) · anything there only because it's cool (Thornton)). It's their game: make the case once, they decide.

Read .planning/research/define-clash.md. Each line under "## Clashes" is "number :: A :: B :: why".
1. For each clash, one at a time: mcp__bmuz__say {"line": ["define.clash.one", "define.clash.what"], "slots": {"n": "1", "a": "<A>", "b": "<B>", "why": "<why>"}} and ask the box.
   - "Keep both": it becomes a risk to test (chapter 7).
   - "Change one": {"wait": true}; their next message says which and how; make the change in that chapter (read it from .planning/GDD.md and hand back the whole chapter, changed).
   - "Park one for later": it goes to Ideas for Later (and out of its chapter).
2. No clashes ("- none"): say "define.clash.none" with "holds" = the line under "## Holds together" (a full sentence ending in "."), then finish.

Hand back:
- "clashes": [{"a", "b", "why", "decided": "keep both" or "change one" or "park one"}] ([] when none)
- "chapters": {"<n>": the whole changed chapter, for each "change one"} and {"7": "- <each kept clash, as a risk to test>"} when any was kept ({} when nothing changed)
- "ideas": what was parked, each one line ([] when none)
