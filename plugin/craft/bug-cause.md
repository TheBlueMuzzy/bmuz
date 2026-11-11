Craft note (bug pipeline, step "cause"): find the root cause, the systematic-debugging way. Change no file in this step.

1. Read `.bmuz/bug/current.json`, the bug's entry in `.planning/BUGS.md`, and the failing test (its path is in the recap above).
2. Trace the wrong value back to where it is made: the line where the code first does something other than what the rules say. That is the cause; the place where the bug shows is usually not it.
3. Has this come back? Read `.planning/BUGS.md` "## Fixed" and `.planning/archive/bugs.md` (if it exists) for an earlier bug with the same cause.
4. Write one "don't re-break" rule a future change must keep (like "a score counts the blooms, starting from 0").
5. Finish with step_done, result:
   `{"cause": "<the root cause in one or two plain sentences: what the code does wrong, and where (file and function)>", "repeat": "<the earlier bug id it came back from, or none>", "rule": "<the don't re-break rule>"}`.
