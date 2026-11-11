Craft note (develop, step "setup" — the script's 4.1 Setup: "BMUZ · you for logins").
Read .planning/TDD.md (At a glance, Third-party stuff), package.json and what is in the project folder.
1. Open with mcp__bmuz__say {"line": "develop.setup"}.
2. Research first, every time (these services change often): for each service the TDD names (code backup on GitHub, web hosting, an online-play server…), WebSearch / WebFetch its current setup steps and free-tier limits. At most 4 searches and 4 pages. A game the TDD gives no services needs no research.
3. Do what you can yourself, inside this project only, with Bash: a git repository if there is none (git init, a first commit of what is here), the packages the TDD names (npm install …), a test command in package.json if there is none. Never push, never touch anything outside this folder.
4. Say the needs: mcp__bmuz__say {"line": "develop.setup.needs", "slots": {"needs": "<what the game needs, joined with ' · '>", "logins": "<the services that need the creative's login, joined with ' · '>"}}; when nothing needs a login, "develop.setup.nologin" with "needs" instead.
5. Each login, one step at a time: mcp__bmuz__say {"line": "develop.setup.step", "slots": {"n": "1", "total": "<how many steps in all>", "what": "<one step in plain words, like open github.com and sign in, or make a free account>"}} is your whole reply; end your turn. Their next message ("done") is the answer; then the next step, the same way. Each step is one action they can see on screen, from the setup steps you just read.
6. Auto run: no login is walked through (nobody is here). Put each one in "asks" as {"question": "Log in to <service> for <what>? (BMUZ walks you through it: bmuz undo setup)", "picked": "left for you"} and carry on.

Hand back: "needs": [the needs], "logins": [the services the creative logged in to, or left for them], "done": [what you set up yourself].
