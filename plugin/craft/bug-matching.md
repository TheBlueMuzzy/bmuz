Craft note (bug pipeline, step "matching"): the same mistake, looked for in matching places.

1. The cause is in the recap above. Search the project's code for the same mistake elsewhere (Grep, Glob, Read): code copied from the place you fixed, the same pattern or calculation, the same wrong assumption. Skip tests, node_modules and .planning.
2. For each real hit, decide:
   - **fix**: it is the same bug in another place. Write a NEW test file of its own for it (like `tests/b001-also-<place>.test.mjs`) that fails because of it. Don't fix the code yet: the engine runs each new test first and refuses the step if one passes.
   - **log**: it is related but a different problem, or too big to fix now: it becomes a new bug of its own.
3. Finish with step_done, result:
   `{"hits": [{"where": "src/x.js:12", "what": "the same off-by-one", "action": "fix", "test": "tests/b001-also-x.test.mjs"}, {"where": "src/y.js:40", "what": "…", "action": "log", "title": "a few words", "level": "P2"}]}`
   No hits at all: `{"hits": []}`. Change no code and no test after this step's tests were shown failing: the record step runs every one of them again before it commits.
