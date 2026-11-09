# The hand-off card (engine-written)

Every finished piece of work is handed to the creative as one card (VISION V29). The step hands back the card's **words as data**; the engine checks them and writes the card itself, so it has the same shape every time.
The labels are today's card (`~/.claude/config/bmuz/templates/handoff.md`), unchanged.

## What a step hands back
A talk step with `"handoff": true` (docs/pipeline-format.md) adds `card` to its `step_done` result:

```json
{ "verdict": "matches the plan",
  "card": {
    "title": "Hello page for Moon Goat",
    "done": "checked hello.html against plan.json",
    "see": "a hello page with the game's name as its heading",
    "try": "open hello.html in the project folder",
    "proof": ["hello.html has the heading", "plan.json names Moon Goat"],
    "todos": "none",
    "questions": [
      { "key": "heading-colour", "q": "What colour should the heading be?", "kind": "taste", "options": ["blue", "black"] }
    ],
    "next": "nothing to type: the run is finished"
  } }
```

| Part | Label on the card | Needed |
|---|---|---|
| `title` | `## <title> — ready for you to check` | yes |
| `done` | **Done:** | yes |
| `see` | **You'll see:** | yes |
| `try` | **Try it:** | yes |
| `proof` | **Proof:** | yes |
| `todos` | **Your to-dos:** | yes (`"none"` when there are none) |
| `questions` | **Questions:** | no (left out or `[]` = none) |
| `next` | **Next:** | yes |

Each part is text, or a list of texts (shown one `- ` line each under the label).
A card with a missing or empty part is refused like a failed done-check: the step tries again (2 retries), then BLOCKS. The refusal names every missing part.

## Questions
One list per project, `.bmuz/questions.json`; the card shows it (VISION V28b):
- A card's new questions join the list, numbered on from the highest number used. **Every card lists every open question**, old ones too, with their numbers, so the creative answers by number.
- A question shown in 2 cards and still unanswered is **parked**: left out of the next cards and listed in `.bmuz/questions.md` under "## Parked — decide when the feature that needs it is planned". A later card asking it again opens it again.
- Each question: `key` (a short slug like `orientation`, needed), `q` (ends in `?`), `kind`, `options` (a list), `pick` (see kinds).

| `kind` | What it asks | `pick` |
|---|---|---|
| `taste` | how it looks, feels or plays | not allowed: the creative's view comes first (V32b). The card shows "What's your view?" before the options |
| `want` | what the creative wants | allowed: listed first with "(my pick)" |
| `choice` | pick between options | allowed: listed first with "(my pick)" |

Any other kind (`engineering`, `technical`…) is refused: engineering calls are BMUZ's own, decided and logged, not asked.

## Answers and decisions
The creative answers by number in a plain message: `1 yes`, `1. blue`, `2: the first one` (one answer per line).
The engine records each one in `.bmuz/decisions.json` (`{key, q, answer, at}`) and `.bmuz/decisions.md`, marks the question answered, and passes the message on with a short note. A message with no numbered answer lines passes untouched.
A later card asking a question whose `key` is already decided is refused with the earlier answer: an answered question is never asked again (V38). The talk step's prompt lists the decisions so Claude can use them.

## How it is shown
The engine saves the card in `.bmuz/last-card.md`. At the end of the hand-off step's turn it sends its own labelled message: read that file, show its text word for word, and end the turn. The message points at the file rather than carrying the card, so the creative sees the card once (a message carrying it showed it twice). Reading that one file is allowed between steps, when every other tool waits.
