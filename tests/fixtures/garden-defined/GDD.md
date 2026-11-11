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

Level: chosen
<!-- bmuz 3 · a91bbfac -->
You and a friend each grow a garden, one seed card at a time.
Plant well and your rows fill up fast.
Weather can wreck either garden, so keep something back to guard your best row.
A close race that's decided at the very end, in about three minutes.
**One line:** Plant a garden, weather a rival's rows, and race to the last bloom.
**The familiar part and the new part:** The weather is your weapon, and it is fair.
<!-- /bmuz 3 -->

### 4 · The Core Loop
*what you do over and over, in plain words*

Level: chosen
<!-- bmuz 4 · b9fc4a7d -->
**You draw → you plant (or play weather) → you score blooms → (again)**
- **Most often:** plant
- **Each step:** bad draws get in your way; you plan your rows; you get blooms, and the next draw sets up the next row.
- **3 s / 30 s / 3 min:** a card in 3 seconds, a row in 30, a whole game in 3 minutes.
- **Different next time:** the deck order makes every game different.
- **The verbs:** plant: fun when a row comes together; a good player knows when to play weather, which a new player doesn't yet.
<!-- /bmuz 4 -->

### 5 · Platform & Play Structure
*where it's played first · solo, together, online, by turns, against the computer*

Level: chosen
<!-- bmuz 5 · a8c68b4b -->
- **Where:** a phone
- **First:** the web
- **Someday:** phone app stores
- **Who plays:** friends on the same screen; online, at the same time
- **The computer as opponent:** nice to have
<!-- /bmuz 5 -->

### 6 · Scope
*must / should / could / won't · effort vs impact · the vertical slice*

Level: chosen
<!-- bmuz 6 · 81a31032 -->
**Must:** planting and scoring rows · weather cards
**Should:** online play
**Could:** computer opponent · seasons
**Won't:** card packs to collect (collecting is not this game)
**Smallest version that still gives "a close race you win at the end":** two players on one phone, one seed deck, three weather cards.
**Vertical slice:** two players on one phone, one seed deck, and the three weather cards. You plant, play weather, score blooms, and the race gets close at the end, with the hailstorm moment included.

| Idea | MoSCoW | Effort | Impact | Box |
|---|---|---|---|---|
| Planting and scoring rows | Must | high | high | big project |
| Weather cards | Must | low | high | quick win |
| Online play | Should | high | medium | big project |
| Computer opponent | Could | low | low | fill-in |
| Seasons | Could | low | low | fill-in |
| Card packs to collect | Won't | n/a | n/a | avoid |
<!-- /bmuz 6 -->

### 7 · Risks & Unknowns
*what could stop it being great · what needs research or a sketch*

Level: chosen
<!-- bmuz 7 · 45730609 -->
- Friends sharing one small phone screen may not both be able to read each other's rows at once.
- Online play is in the platform chapter, but the first cut leaves it out.
- The garden theme may be mostly a coat of paint over the loop.
- A player may have little to protect before weather arrives, so the guard pillar may never come into play.
- Needs research: how two players read each other's hands on one small phone screen
<!-- /bmuz 7 -->

## Part 2 · The game

### 8 · Rulebook
*overview, components, how to win, setup, the flow, each action, game end, scoring, keywords, development log*

Level: loose
<!-- bmuz 8 · c62cdc69 -->
- Open: How does a game end, and how is the winner decided?
- Idea: "A game ends when the seed deck runs out, about three minutes; the most blooming flowers wins."
<!-- /bmuz 8 -->

### 9 · Content & Balance
*a summary and link to the content tables*

Level: empty
<!-- bmuz 9 · 85c8ec64 -->
open: nothing yet
<!-- /bmuz 9 -->

### 10 · Change Over Time
*what changes within a game and between games · progression · pacing*

Level: loose
<!-- bmuz 10 · 0dc1d6df -->
- Idea: "Games get tenser as the deck thins; seasons could come later."
<!-- /bmuz 10 -->

## Part 3 · The digital game (starts the TDD)

### 11 · Players & Opponents
*the computer opponent's personality · online people (leaving, joining, idling) · saves, accounts*

Level: loose
<!-- bmuz 11 · fae427ee -->
- Idea: "A computer opponent would be nice for playing alone."
<!-- /bmuz 11 -->

### 12 · Look & Sound
*style, references, audio mood*

Level: loose
<!-- bmuz 12 · bcbf2336 -->
- Idea: "The look: bright hand-drawn flowers and soft rain sounds."
<!-- /bmuz 12 -->

### 13 · Screens & Menus
*UI style · the screen map · what the player must see (HUD) · names of things*

Level: empty
<!-- bmuz 13 · 85c8ec64 -->
open: nothing yet
<!-- /bmuz 13 -->

### 14 · Teaching
*what a new player must learn (notes in Design; the tutorial itself is built in Develop after playtests)*

Level: empty
<!-- bmuz 14 · 85c8ec64 -->
open: nothing yet
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
