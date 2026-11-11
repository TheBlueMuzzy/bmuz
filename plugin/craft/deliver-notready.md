Craft note (deliver, step "notready" — the script's 5.1 Release Check, when something isn't met).
The Release Check and its "Not ready yet: … Want to finish it first, or move it to the next stage?" were just shown, word for word.
1. Say mcp__bmuz__say {"line": "deliver.notready.box"} and ask the box it returns, exactly.
2. Their pick is the answer, word for word: "Finish it first" (Deliver goes back to Develop, the milestone current again) or "Move it to the next stage" (only a must can move; a blocking bug or a failing check stays, and it goes back to Develop for those).
   The engine checks your answer against the option they picked in the box: hand back exactly that label, never your reading of something they typed.
Auto run (nobody is here): never answer the box for them; hand back "Finish it first". Moving a must changes the plan, and that is the creative's call: the engine refuses "Move it to the next stage" from an auto run. A test run's answers stand in for the creative: hand back the label they name.

Hand back "choice": "Finish it first" | "Move it to the next stage".
