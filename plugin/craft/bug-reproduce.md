Craft note (bug pipeline, step "reproduce"): make the bug fail in a test, so we know it's real. Never guess-fix.

1. Read `.planning/bugs/current.json` (the bug being fixed: its id and title) and its entry in `.planning/BUGS.md` (steps, expected, actual).
2. Find the code it lives in (Read, Glob, Grep). Read how the project's existing tests are written (`package.json` "test", the `tests/` folder) and write the new test the same way.
3. Write ONE new test file that fails *because of this bug*: it checks what should happen (the "Expected"), so it fails now and passes once the bug is fixed. Rules or logic → a unit test. Name it after the bug, like `tests/b001-score-off-by-one.test.mjs`. If the logic is buried in a big file with no way to test it, you may pull that piece out into a small pure function first, with no change in behaviour.
4. Do NOT fix the bug in this step, and change nothing else. Test only what the bug report describes; the same mistake elsewhere is looked for later, each place with a test of its own.
5. Finish with step_done, result `{"test": "<the test file, a project path like tests/b001-....test.mjs>"}`.

The engine then runs your test itself. If it passes, the step is refused (a test that passes doesn't show the bug): make it fail because of the bug and finish again. A test that crashes before testing anything (a typo, a wrong import) is refused too.
Can't reproduce it at all? Say so in one line and finish with `{"test": ""}`: the step is refused rather than guessed.
