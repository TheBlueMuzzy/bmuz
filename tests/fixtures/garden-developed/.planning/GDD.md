# Garden Race — Game Design Document

The one design document for this game: 14 chapters, each marked empty, loose, chosen, worked out or built. BMUZ writes between its marks (<!-- bmuz … -->); anything you write outside them is yours and is always kept, and if you change BMUZ's text, your version is kept too.

## Part 1 · The concept (one page)

### 1 · The Feelings
*the one or two feelings that are this game · how we'll know a player feels them · what it deliberately won't have*

Level: chosen
<!-- bmuz 1 · 7e1fbfe3 -->
**The feeling:** The thrill of a close race that you win right at the end. — Challenge: overcoming something hard and getting better at it
**The moment:** "your best row survives the hailstorm."
**We'll know when:** They ask for a rematch straight away.
**Not this game:** No long campaigns and no collecting packs of cards.
<!-- /bmuz 1 -->

### 2 · The 3 Pillars
*three rules that settle arguments*

Level: chosen
<!-- bmuz 2 · 44b87082 -->
- **Quick rivalry**: every game is a short, close race between two friends. When we argue about game length, it says three minutes.
- **Grow, then guard**: you plant to grow your garden and keep something back to protect it. When we argue about attacks, it says you must have something to lose.
- **Weather is fair**: weather cards hit both players alike. When we argue about weather, it says it hits both sides.
<!-- /bmuz 2 -->

### 3 · The Pitch
*the game in 3–5 lines written to "you" · one line · the familiar part and the new part*

Level: worked out
<!-- bmuz 3 · 79d096f5 -->
Two friends race to grow the best garden on one phone or online. You plant seeds; your friend sends weather.
<!-- /bmuz 3 -->

### 4 · The Core Loop
*what you do over and over, in plain words*

Level: worked out
<!-- bmuz 4 · acd21850 -->
1. Draw two cards. 2. Play one: plant a seed in one of your rows, or send weather to a friend's row. 3. A row with three blooms scores and is cleared.
<!-- /bmuz 4 -->

### 5 · Platform & Play Structure
*where it's played first · solo, together, online, by turns, against the computer*

Level: worked out
<!-- bmuz 5 · ee5d5812 -->
Phones first, portrait; two players on one phone, online, or against the computer; turns.
<!-- /bmuz 5 -->

### 6 · Scope
*must / should / could / won't · effort vs impact · the vertical slice*

Level: worked out
<!-- bmuz 6 · fcd9f094 -->
- Must (vertical slice): the turn engine, seed cards, weather cards
- Should: the computer opponent
- Could: seasons
<!-- /bmuz 6 -->

### 7 · Risks & Unknowns
*what could stop it being great · what needs research or a sketch*

Level: worked out
<!-- bmuz 7 · 9d37a32e -->
- Hail may feel too mean (Rule A / Rule B to test)
- Three-minute games need a fast turn
<!-- /bmuz 7 -->

## Part 2 · The game

### 8 · Rulebook
*overview, components, how to win, setup, the flow, each action, game end, scoring, keywords, development log*

Level: worked out
<!-- bmuz 8 · 420b8824 -->
The rulebook: .planning/design/RULEBOOK.md (its own tab on the project page).
- **The Flow:** 4 steps: Draw two cards. Play one card. Rows with three blooms score. Your friend's turn.
<!-- /bmuz 8 -->

### 9 · Content & Balance
*a summary and link to the content tables*

Level: worked out
<!-- bmuz 9 · bb849589 -->
- **Seed cards** (content/data/seed-cards.json): 2 rows
- **Playtesting** (content/data/playtesting.json): 0 test games so far
<!-- /bmuz 9 -->

### 10 · Change Over Time
*what changes within a game and between games · progression · pacing*

Level: worked out
<!-- bmuz 10 · 67ca6ca0 -->
The deck thins and every card matters more; between games only the shuffle changes.
<!-- /bmuz 10 -->

## Part 3 · The digital game (starts the TDD)

### 11 · Players & Opponents
*the computer opponent's personality · online people (leaving, joining, idling) · saves, accounts*

Level: worked out
<!-- bmuz 11 · 0c4f1d3a -->
The computer goes for full rows and sends hail at your best row on hard.
<!-- /bmuz 11 -->

### 12 · Look & Sound
*style, references, audio mood*

Level: worked out
<!-- bmuz 12 · 397e22fe -->
Bright hand-drawn flowers, like a picture book; cards slide, blooms pop up.
<!-- /bmuz 12 -->

### 13 · Screens & Menus
*UI style · the screen map · what the player must see (HUD) · names of things*

Level: worked out
<!-- bmuz 13 · a41271d2 -->
Screens: title, who to play, the garden (your rows, your hand, the score), the end (both gardens side by side). Cozy style.
<!-- /bmuz 13 -->

### 14 · Teaching
*what a new player must learn (notes in Design; the tutorial itself is built in Develop after playtests)*

Level: loose
<!-- bmuz 14 · 605e84e1 -->
- Notes: a new player must learn that weather goes on your friend's rows.
<!-- /bmuz 14 -->

## Sketches
- S01 Weather fairness — answers: Do weather cards feel fair or just cruel when they wreck a row?
- S02 Deck tension — answers: Does the seed deck running thinner make the race feel tenser?

## Open Questions
- Do the two players sit together, or play apart online? (Platform & Play Structure)
- How does a game end, and how is the winner decided? (Rulebook)
- What moment should make the race feel tense? (The Feelings)

## Decisions

Answered once, never asked again.

## Ideas for Later

## Changes
- 2026-11-11 · Ideate · sketches: 2 on Sketches
- 2026-11-11 · Define · feelings: chapters 1 (chosen)
- 2026-11-11 · Define · pillars: chapters 2 (chosen)
- 2026-11-11 · Define · pitch: chapters 3 (chosen)
- 2026-11-11 · Define · loop: chapters 4 (chosen)
- 2026-11-11 · Define · platform: chapters 5 (chosen)
- 2026-11-11 · Define · clashes: chapters 7 (chosen)
- 2026-11-11 · Define · scope: chapters 6 (chosen)
- 2026-11-11 · Define · slice: chapters 6, 7 (chosen)
- 2026-11-11 · Design · fixture: chapters 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 (worked out)
- 2026-11-11 · Design · fixture: chapters 14 (loose)
