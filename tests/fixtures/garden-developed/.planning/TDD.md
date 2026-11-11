# Garden Race — Technical Design Document (TDD)

> How the game is built. Plain English first. Living document: Design starts it, Develop keeps it true. BMUZ writes between its marks (<!-- bmuz … -->); anything you write outside them is yours and is always kept.

## 1. At a glance
<!-- bmuz td:glance · 9164470a -->
- **Platforms:** phones first
- **Stack:** plain JavaScript modules, node --test
<!-- /bmuz td:glance -->

## 2. How it fits together
<!-- bmuz td:fits · ed488cf8 -->
src/garden.js holds the game state and the rules; content/ holds every number.
<!-- /bmuz td:fits -->

## 2b. Game-specific systems
<!-- bmuz td:players · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:players -->

## 3. Data the game reads (editable by you, in Obsidian or the Dev Kit)
<!-- bmuz td:data · a18bd34d -->
| File | What's in it | Edited with |
|---|---|---|
| `content/data/*.json` | the content tables | the Dev Kit |
| `content/tuning/*.json` | the settings | Dev Kit → Tuning |
<!-- /bmuz td:data -->

## 4. Standards
<!-- bmuz td:standards · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:standards -->

## 5. Budgets
<!-- bmuz td:budgets · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:budgets -->

## 6. Security & fairness
<!-- bmuz td:security · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:security -->

## 7. Compliance & legal
<!-- bmuz td:compliance · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:compliance -->

## 8. Decisions log
<!-- bmuz td:decisions · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:decisions -->

## 9. Third-party stuff
<!-- bmuz td:third · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:third -->

## 10. Risks & open questions
<!-- bmuz td:risks · 85c8ec64 -->
open: nothing yet
<!-- /bmuz td:risks -->
