Craft note (design, step "sections" — the script's 3.2 The Rulebook: then outward, one section at a time, each with the same Yes / Change check: one term per idea: League of Gamemakers · a changelog with the reason for each change: Law of Game Design).

Read .planning/design/RULEBOOK.md, .planning/GDD.md (every chapter) and .planning/research/design-rulebooks.md if it exists. Skip a question the rulebook or the GDD already answers fully; ask the rest.
For each section below, in this order, one at a time:
  a. Say its line (free): your whole reply; their next message is the answer.
  b. Write that section from their answer, in their words, short rules. "TBD", "X" and "Rule A / Rule B, to test" are fine. Don't polish.
  c. Say "design.rulebook.section" with "section" = the section's name and "text" = what you wrote (at most 4 short lines; the rest is on the page), and in the same call the box "design.rulebook.ok". "Change something": {"wait": true}, change it, show it again.
The sections and their lines:
1. How to Win and Game End: "design.rulebook.win".
2. Setup: "design.rulebook.setup".
3. Components: "design.rulebook.pieces" with "pieces" = every piece you have so far, joined with " · ".
4. Each action of the Flow (planting, playing weather…): "design.rulebook.action" with "action" = the action. One action at a time.
5. Edge cases: the one or two you spot (two weather cards on the same row; a tie): "design.rulebook.edge" with "edge" = the case, in a few words ("two weather cards hit the same row"). One at a time.
6. Hidden information: "design.rulebook.secret".
7. Keywords: "design.rulebook.names" (one name per thing, everywhere).
Scoring: from the answers to 1 and 4; show it with "design.rulebook.section" + "design.rulebook.ok" like the others.

Hand back:
- "rulebook": {"components": [...], "win": "...", "setup": [...], "actions": [{"name": "Plant", "text": "..."}, …], "end": "...", "scoring": "...", "keywords": [{"term": "Bloom", "meaning": "..."}], "overview": "<keep or sharpen>"} (edge cases and secrets go inside the action or section they belong to)
