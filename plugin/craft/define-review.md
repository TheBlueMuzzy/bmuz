Craft note (define, step "review" — define-research.md section 5(a) step 13 and 5(d): the concept card; question 30; Ryan: documents are "discussion pieces … not carved in stone").
Purpose: hand the concept to the creative on one card: what was chosen, what is still open, where to read it, and the concept review's findings as numbered questions. You choose nothing here.

Read:
- .planning/GDD.md, "## Part 1 — The concept" (about one page) and the newest lines under "## Changes"
- .planning/research/define-check.md: the concept review. Each line under "## Findings" is already a question, with its key in backticks, its kind and its options. "## Not checked (open parts)" lists what was still open.
- .planning/research/define-fit.md if it exists (what the fit check found)

Changes the creative asks for: when they ask for a change (now, or after "Not yet: change something" at the lock, which brings the run back here), ask what to change, their words first (AskUserQuestion), and make it with Edit in .planning/GDD.md Part 1 only. Keep the layout the lint checks: "**Label:** …" lines, one "- " line per item (pillars numbered "1. "), "— settles: …" on a pillar, "— why: …" on a won't, "→ test: …" on a risk, "open — not chosen yet" for what's still open. Then add one line at the end of "## Changes": "- <YYYY-MM-DD> · <part>: <what changed> · why: <their reason> · Define review". Never edit another file. In an auto run, or when nothing was asked, change nothing.

Hand back "found" (one line: the most useful thing the review found, or "the concept agrees with itself") and the hand-off card as "card". Lists are JSON lists, one line each:
- title: "Concept: <the pitch, or the idea in a few words>"
- done: a list:
  - "Define run <N> wrote the concept: GDD Part 1 (about one page)"
  - what was chosen, part by part, in a few words each (the story's first line, the primary feelings, the pillars, the first release's musts)
  - what is still open: each field marked "open — not chosen yet", by name ("none" if nothing)
  - "<M> pieces of material marked → chosen in <IDEATE.md, or DISCOVER.md in an older project>; nothing removed" (the Part 1 "From the shelves" line names the file)
- see: a list: .planning/GDD.md Part 1 (its eight headings); .planning/research/define-check.md (the review); .planning/research/define-fit.md (the fit check)
- try: "open .planning/GDD.md and read Part 1: it fits on about one page"
- proof: a list: the concept lint passed (the engine ran it in the step before this one, and runs it again on this step's end: every part there or marked open, the counts right); the review's checks that agree; which choices are the creative's own words and which were picked from the shelves
- todos: if the story, the primary feelings, the pillars or the first release's musts are still open: "Not ready to lock: <those parts> still open. Answer 'Not yet: change something' at the lock, or 'bmuz undo <step>' to choose them". Otherwise "none".
- questions: every finding in define-check.md, as given: {"key": "<its key>", "q": "<its question>", "kind": "<its kind>", "options": [...]}. Leave out any key already decided (the decisions list above). Never an engineering question; a taste question never carries a "pick".
- next: "Answer the questions by number, then the lock: 'Lock it: on to Design' moves the GDD to Design; 'Not yet: change something' comes back here"
