Craft note (release, step "where" — the script's 6.0 Welcome to Release: "Where should it go? (pick any)").
Read .planning/GDD.md chapter 5 (Platform & Play Structure) and .planning/STATE.md (its "Release:" and "Live:" lines), to know where the game was meant to go.
1. Say mcp__bmuz__say {"line": ["release.welcome", "release.where"]}: the welcome, word for word, then ask the box it returns, exactly (pick any).
2. Their picks are the answer, exactly the box's labels: "The web", "itch.io", "Steam", "Phone app stores". Nothing goes public here: each place has its own "Release it" later.
   The engine checks your answer against the options they picked in the box: hand back exactly those labels.
Auto run (nobody is here): never answer the box for them; hand back the place chapter 5 and STATE's Release line point to ("The web" when they name none), and list it in "asks" as {"question": "Where should it go?", "picked": "<the labels>"}. The run stops at that place's "Release it?" anyway. A test run's answers stand in for the creative: hand back the labels they name.

Hand back "platforms": the labels they picked, exactly as the box shows them (a list).
The engine takes each one in turn: its current requirements researched, Store & Launch, its own "Release it?".
