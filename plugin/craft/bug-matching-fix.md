Craft note (bug pipeline, step "matching-fix"): fix each matching place you marked "fix", the same way as the bug itself.

1. The hits are in the recap above. No hit marked "fix" (only "log" ones)? Change nothing and finish with `{"alsoFiles": []}`. For each "fix" hit, change the code at that place (Edit), the smallest change that makes it right. Never change a test.
2. Finish with step_done, result `{"alsoFiles": ["<every project file you changed in this step>"]}`.

The engine then runs each hit's test (it must pass now, unchanged), the bug's own test, the suite and check:fast. Anything failing refuses the step with the reason: fix it and finish again.
