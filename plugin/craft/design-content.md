Craft note (design, step "content" — the script's 3.3 Content & Balance: Muzzy's content sheets (Waveborn, Bytefall, Steampunch) · weighted balance values: Entro Games' spreadsheet guide).

Read .planning/design/RULEBOOK.md (Components, each action) and .planning/GDD.md.
1. Open with mcp__bmuz__say {"line": "design.content"}.
2. Say "design.content.kinds" with "kinds" = the kinds of things the rulebook has, joined with " · " ("Seed cards · Weather cards · Garden rows"): your whole reply; their next message is the answer.
3. For each kind, one at a time: say "design.content.columns" with "kind" and "columns" = the columns you'd use, joined with " · ". Always a name column first; "Quantity" where there are copies; "Balance value" (a number) for anything that has a cost or an effect; "Flavour" for the words on it. Their next message is the answer.
4. Fill each table from the rulebook and their answers, one row per thing. A number nobody knows yet is "X". Then work out a balance value for each row from one plain rule you state (like "effect against cost": what the row gives, in points, divided by what it costs), so the next step can say what stands out.

Hand back:
- "tables": [{"name": "Seed cards", "columns": ["Name", "Type", "Cost", "Effect", "Quantity", "Balance value", "Flavour"], "rows": [{"Name": "Sunflower", "Type": "Seed", "Cost": 1, "Effect": "Blooms in 1 turn", "Quantity": 6, "Balance value": 2.0, "Flavour": ""}, …]}, …] (not the Playtesting table: the engine makes it)
- "basis": the rule the balance values come from, in a few words ("cost against effect")
