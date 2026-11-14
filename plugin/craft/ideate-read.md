Craft note (ideate, step "read" — the script's 1.3 The Game So Far, the reading; framework .planning/research/bmuz-vision/bmuz-design-doc.html, "The GDD's chapters" and "How the GDD grows").
Purpose: read everything they shared and sort it into the GDD's chapters, so the creative sees their own game written back clearer than they walked in with it. This step asks nothing and says nothing to the creative: read, sort, call step_done. The engine writes the GDD and shows "The Game So Far" itself.

Read, all of it (Read with offset/limit for a long file; never skim): .planning/research/shared.md (their idea, pasted text, files, folders, Drive and GitHub docs, then what was only listed by name and what couldn't be read).

The chapters (the keys of "sofar") and what goes in each:
- "1" The Feelings: the feeling it's after, moments they want players to have, how we'd know
- "3" The Pitch: what the game is, in their words; the familiar part and the new part
- "4" The Core Loop: what the player does, over and over
- "5" Platform & Play Structure: where it's played (phone, computer…), solo / together / online / by turns / against the computer, how long a game lasts
- "6" Scope: the smallest version, what's in or out
- "7" Risks & Unknowns: what they fear it becomes, what they're unsure about
- "8" Rulebook: components, setup, how a turn goes, scoring, how it ends, how to win
- "10" Change Over Time: what changes within a game and between games
- "11" Players & Opponents: a computer opponent, online people, saves and accounts
- "12" Look & Sound: style, references, audio mood
- "9" Content & Balance, "13" Screens & Menus, "14" Teaching: only if the material really says something about them
Never "2" (The 3 Pillars): pillars stay empty in Ideate on purpose; Define makes them.

For each chapter the material touches, three lists:
- "fixed": what's already clear — facts and limits they brought, said as settled. A prototype's code is material too.
- "ideas": their ideas, half-formed welcome. An idea stays an idea even when it's specific: choosing is Define's.
- "open": what this game needs here that the material doesn't say yet, each one short plain question in their terms ("How does a game end?"). Things they said they can't remember become open questions.

Rules:
- Their words, exactly: a fixed item or an idea in their words is {"text": "<their exact words>", "his": true} (cut long ones with "…"; never reword, never fix spelling). The script checks every quote against what they wrote; one it can't find is shown as "my reading". Your own summary of something spread over a page is plain text (shown as "my reading").
- Never invent: nothing that isn't in the material. A chapter the material doesn't touch gets open questions only where this game obviously needs it (how a game ends, where it's played), or nothing.
- The game's own terms; no jargon. Each item once, in the chapter it feeds most.
- What was only listed (a .unity, a .psd) is a fixed fact in plain words in the chapter it belongs to ("a Unity project exists: the scene itself wasn't read"), never as if you read it.

A finished game (F233 — Finished games come in as fixed; framework research/bmuz-vision/conversion-research.md). Decide it from what you read, never by asking. It is finished when BOTH hold:
- written rules that cover setup, how a turn goes and how a game ends or is won, and
- it has been played as it is, or made: they say they've played it ("played it hundreds of times", "it's finished", "I'm converting it to digital"), or there are board / card art files made for a physical version.
A draft they're still unsure about ("draft 3", "I'm not sure yet", "trimming felt like busywork") is not finished: it's "a concept with some rules written down".
When it is finished:
- Every rule the rulebook states goes in "fixed" (mostly chapter "8"; its setting and tone in "3" or "12"), as their exact words with "source": the shared file's name as shared.md heads it, without "Drive · " ({"text": "…", "his": true, "source": "Sirius Smugglers - Rules"}). Read it all: at least the components, setup, a turn, how it ends and how to win, each its own item.
- A rulebook's intro or flavour text ("Welcome to the system, smuggler…") is the game's setting and tone: "fixed", in "3" or "12". Never in "ideas". "ideas" holds only what they say they'd like to change or add (their messages, their own comments in the file).
- "open" holds only what the rules really leave open: read the rules for it before you write a question, and never ask what they already say. Each one names what the rules DO say first: "Your rules say a tie for least Evidence is a shared win. Is there a tie-breaker?" A rule that leans on people at a table ("decide between yourselves", talking, interrupting) is open for the digital version. Never the digital-only gaps (where it's played, online, against the computer): Define's Platform & Play asks those once, where they're used (F235).
- (F234) A rule that answers one of Define's frame questions also gets "field", so Define never asks it again: "platform.where" (where it's played, what the player holds), "platform.first" (the one platform first), "platform.someday" (later platforms), "players.who" (who plays: solo, friends on one screen, online live or by turns), "computer.ai" (a computer opponent, and how good it must be). Example: {"text": "Play it online, two players taking turns", "his": true, "source": "rules.md", "field": "players.who"}. Rules written for a table answer none of these: then leave "field" out. Never guess one.
- "1" The Feelings and "4" The Core Loop: what the rules show (the goal, the tension, a turn in a line) as "fixed" items or your own reading; no "open" questions there.

Hand back:
- "sofar": {"5": {"fixed": [...], "ideas": [...], "open": ["...?"]}, "8": {...}, …} (only the chapters with something)
- "stands": where the game stands, in a few plain words: "nothing yet", "a concept", "a concept with some rules written down", "written rules", "a finished game: written rules, played", "a prototype" (worked out, never asked)
- "finished": true when it's a finished game as above, else false
- "played": (F234) true when the creative says the game is finished or has been played as it is ("we've played it loads", "it's finished", "I'm converting it to digital"), whether or not its rules were in what they shared; else false. Finished and played but no rules read: the engine asks them once for the rules.
- "name": the game's name if the material gives one, else ""
Nothing shared and no idea yet: "sofar" holds open questions that help find one (in "1", "4" and "3").
