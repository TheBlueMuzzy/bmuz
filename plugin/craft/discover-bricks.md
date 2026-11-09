Craft note (discover, step "bricks" — the brick board: discover-creative-research.md section 6(a) step 7; H19 H22 H26 H25 H14).
Purpose: a card the creative can take in at a glance and that stands alone: what this run collected, where it lives, every open question. Nothing here chooses a brick, a direction or a style: that is /define's. You only read here: no edits.

Read .planning/DISCOVER.md: this run's section is the newest "### Run N" under "## Runs"; then its shelves. Read the run's reports it links (.planning/research/discover-<slug>-*.md) for their Sources counts and Open questions.

Hand back "found" (one line: the most useful thing this run collected) and the hand-off card as "card". Lists are JSON lists, one line each:
- title: "Brick board: <the idea in a few words>"
- done: a list:
  - "Run <N> saved to .planning/DISCOVER.md: <the 'Bricks added' line, in words>"
  - the steps run, and the ones skipped if they wrapped up early
  - the top finds: 3 to 5 bricks or findings marked (several sources) first, each with its strength mark (collecting, not ranking by taste)
  - each fear and what the research found about it (supported / contradicted / no evidence)
- see: a list: .planning/DISCOVER.md (which shelves grew, and by how many), and each research report with its path and number of sources
- try: "open .planning/DISCOVER.md: start with Run <N> at the top of Runs, then the shelves"
- proof: a list: each report passed the engine's source check (sources, every link answers); which bricks are the creative's own words and which are Claude's suggestions or defaults (an auto run)
- todos: a list: the 1–2 open questions that matter most, each in full with its probe and timebox ("Is trimming the wick fun with a thumb? → sketch, 1 hour"; a sketch for feel, a proto for numbers); then one line: "<M> more open questions, each with its probe, are on the Open questions shelf of .planning/DISCOVER.md". "none" only if there are no open questions at all.
- questions, two of them, keys carrying the slug so a later run asks them fresh:
  - {"key": "discover-missing-<slug>", "q": "Anything surprising or missing on the shelves?", "kind": "want"}
  - {"key": "discover-next-<slug>", "q": "On to /define, or another discover pass on one shelf first?", "kind": "choice", "options": ["On to /define", "Another pass on <the thinnest shelf>"]}
  Never an engineering question; never a taste question with a pick.
- next: "/define: choose the bricks you'll build with and write the 3–5 line story"
