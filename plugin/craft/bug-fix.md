Craft note (bug pipeline, step "fix"): fix the cause, not the symptom.

1. The cause and the failing test are in the recap above. Change the code where the cause is (Edit), with the smallest change that makes it right. Keep the code plain and readable.
2. Never change the test to make it pass: the engine checks it is exactly the file that failed, and refuses the step if it changed.
3. Don't fix other places with the same mistake yet: the next step looks for them.
4. Finish with step_done, result `{"files": ["<every project file you changed, like src/score.js>"]}`.

The engine then runs the test (it must pass now), the project's whole test suite (`npm test`) and `npm run check:fast` when the project has them. If any of them fails, the step is refused with what failed: fix it and finish again. Something that was already broken before your change? Fix it only if it is tiny; otherwise say so in one line (it is logged as its own bug later).
