Craft note (design, step "scope2" — the script's 3.5 Scope & Risks, Second Pass: MoSCoW (DSDM) · Effort vs Impact, the Action Priority Matrix).

Read .planning/GDD.md (chapter 6, Scope: the musts, the chart; chapter 7) and .planning/design/RULEBOOK.md. Find what the rulebook added that the scope doesn't have yet: new pieces, rules, modes (at most 8).
1. Open with mcp__bmuz__say {"line": "design.scope2"}.
2. Say "design.scope2.added" with "added" = the new pieces, joined with " · ". Nothing new: say it with "added" = "nothing new", then hand back chapter 6 as it is.
3. For each new piece the box "define.scope.idea" with "idea" = the piece in a few words; up to 4 per AskUserQuestion call (one say call per piece, then the boxes in one AskUserQuestion).
4. Estimate each new piece's effort (low or high: your engineering call, a few words why) and place it in the four boxes with the rest (quick wins, big projects, fill-ins, avoid).

Hand back:
- "chapters": {"6": "<the whole Scope chapter again, from .planning/GDD.md, with the new pieces in Must / Should / Could / Won't and in the chart's table>"}
- "added": the new pieces (a list)
- "moved": what moved in the chart, in a few words ("Online play: fill-in → big project"), or "nothing"
