Craft note (deliver, step "notready" — the script's 5.1 Release Check, when something isn't met).
The Release Check and its "Not ready yet: … Want to finish it first, or move it to the next stage?" were just shown, word for word. The question is already asked.
1. Call mcp__bmuz__say {"wait": true} and end your turn: their next message is the answer. Say nothing else.
2. Read their answer as one of two:
   - "finish": finish it first. Deliver goes back to Develop, and the milestone is current again.
   - "move": move what isn't done to the next stage (only a must can move; a blocking bug or a failing check is always "finish").
   If it is neither, ask once more in one plain line as a free question (mcp__bmuz__say {"wait": true} after it).
Auto run (nobody is here): hand back "finish". Moving a must changes the plan, and that is the creative's call; the engine refuses "move" from an auto run. A test run's answers stand in for the creative: use them.

Hand back "choice": "finish" | "move".
