# The BMUZ script — what BMUZ says, word for word

Every fixed line BMUZ says lives here, and only here (F232). The engine sends them: Claude asks for a line by its id,
the engine fills its slots and hands back the exact words, and checks they were said unchanged. The wording is the
approved script's (framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stages 1–6); a test compares every
fixed part of the script with this file.

How an entry reads:
- `## <id> · <kind>`: say (BMUZ says it), free (a question answered by the creative's next chat message), box (a
  question box). `· added` marks a line that isn't in the approved script yet (an Ask Muzzy line says why).
- `{slot}` is filled from the game so far; a list fills as "· " lines, `{slot#}` as "1. " lines. `[[ … ]]` is said
  only when every slot inside it is filled. Numbered questions the material already answered can be left out
  (the rest are renumbered).
- A box: `? the question`, `header:` (the short chip, 12 characters at most), `many: yes` for "pick any", then one
  option per `- ` line, `label — description`. `[if slot]` shows an option only when the slot is filled;
  `[each slot]` makes one option per item of a list (`{.}` is the item, `{field}` a field of it).
- (F235) `{example}` in a question: one or two short examples from THIS game, said right above where they type; the
  engine refuses the line without one. A list slot is given as a list (bullet points), never a run of semicolons.

# Stage 1 · Ideate

## ideate.welcome · say
**Welcome to BMUZ**
I'll help you take a game from an idea to something people can play. We'll go through six stages, in order:

1. **Ideate**: gather everything about your idea. Nothing gets decided yet.
2. **Define**: decide what the game is, on one page.
3. **Design**: work out the rules, the content and the screens, and test the risky parts with quick sketches.
4. **Develop**: build it in short sprints you play and approve.
5. **Deliver**: turn each finished piece into a build you can play and share.
6. **Release**: put it in front of the public.

A few things to know:
· I research before I suggest anything, and I'll show you where my answers come from.
· Say anything, any time: an idea, a worry, "stop", "go back". A small tweak, I'll just do. A new idea goes on your Ideas for Later list so it's never lost. If something's broken, I log it as a bug.
· Everything we decide goes into one design document, the GDD. You'll watch it fill in on your project page.

Let's start with your idea.

## ideate.idea · box · added
? **Your Idea**
Tell me about your game in your own words: what it is, what you love about it, anything you remember. Half an idea is fine. If you're not sure yet, just say so.
header: Your idea
- Not sure yet — help me find a spark first
- It's in my notes — read what I share next instead

## ideate.spark · box · added
? No problem: lots of games start that way. Three quick questions to find a spark. Answer one, two or all three, in one message:
1. What kind of game do you love playing lately, and why?
2. A moment from a game, a film or your life that you'd love to turn into play?
3. A theme, a mechanism or a feeling you keep coming back to?
header: A spark
- Surprise me — suggest a few sparks I can react to
- Nothing yet — carry on, and we'll find it as we go

## ideate.material · box · added
? **Your Material**
Share your links — paste them with Alt+V. I can read Google Drive folder and/or doc links, GitHub links, and even folder and file links from your computer. If you don't want to share any links, just say "never mind".
header: Material
- Never mind — no links to share, carry on
- In this folder — read what I put in this project's folder

## ideate.reading · say
Reading {what}…

## ideate.sofar · say
**The Game So Far**
Here's your game as I understand it, from your idea[[ and the {files} you shared]]. Your own words are in quotes; anything I've worked out myself is marked "my reading". Nothing here is decided yet.

**Already clear**
{clear}

**Your ideas**
{ideas}

**Still open**
{open}

**Where it stands:** {stands}.[[ I couldn't read: {unread}.]]
The full version is on your project page: {link}

## ideate.sofar.rules · say · added
**The Game So Far**
Here's your game as I understand it, from your idea[[ and the {files} you shared]]. It's a finished game, so what your rules say is fixed: I won't ask you to decide it again. Quotes are your own words, with where they came from; anything I've worked out myself is marked "my reading".

**Fixed by your rules**
{clear}

[[**Your ideas**
{ideas}

]]**What your rules leave open**
{open}

**Where it stands:** {stands}.[[ I couldn't read: {unread}.]]
The full version is on your project page: {link}

## ideate.rules.link · box · added
? **Your Rules**
You said the game is finished and played, but I didn't find its rules in what you shared. Paste a link to them (a Google Doc, a Drive file, a GitHub file) or the file's path, and I'll read them before we go on. If they aren't written down, say "no rules" and we'll carry on.
header: Your rules
- No rules — they aren't written down, carry on
- In this folder — read the rules I put in this project's folder

## ideate.next · box
? What next?
header: What next
- Carry on in Ideate (Recommended) — a few questions about what's still open, about 15 minutes
- [if jump] Jump to Define — {covers}
- I need to correct something — next, tell me what I got wrong

## ideate.correct · box · added
? What did I get wrong? Tell me in your next message.
header: Correct
- Never mind, it's right — carry on in Ideate
- Read it all again — you missed something in my material

## ideate.feelings · box · added
? **Feelings & Hopes**
Now, how playing it should feel. I'm only collecting here; Define is where you choose. Answer any of these in one message, and skip any you like:
1. Describe a moment you'd love a player to have. Not a feature: a situation they find themselves in.[[ You mentioned "{quote}": is that the moment, or is there another?]]
2. After a game, what would a player tell a friend about it?
3. What do you hope this game becomes, and what would disappoint you?
header: Feelings
- Not sure yet — skip these, Define asks again
- Show me your take — from what I've shared, for me to react to

## ideate.open · say
**Open Ideas**
A few questions about the parts of your idea that are still half-formed. I start with what's hardest to change later: in past games, how and where a game is played, and the shape of its rules, caused the most rework. "Not sure yet" is always a fine answer.

## ideate.open.ask · box · added
? {questions#}
Answer in one message, in any order.
header: Open ideas
- Not sure yet — leave these open for now
- Show me your take — ideas for each, for me to react to

## ideate.pool.mentioned · say
You mentioned {thing}: what ideas do you have for it, even half-formed?

## ideate.pool.remember · say
Anything you remember about {part}?

## ideate.pool.where · say
Where do you picture people playing it: on a phone, a computer, both?

## ideate.pool.end · say
How does a game end, as far as you know?

## ideate.pool.skill · say
What does a good player do that a new player doesn't?

## ideate.pool.smallest · say
What's the smallest version you'd want to play first?

## ideate.pool.decided · say
What's already decided, and what's off the table?

## ideate.pool.first · say · added
What's the smallest version you'd want to play first: which part of the game, and what can wait? For example: {example}.

## ideate.added · say
Got it: added to {chapters}.

## ideate.round · box
? Another round?
header: One more?
- One more round — {left} gaps left, about 3 minutes
- That's enough for now — the rest stay open; Define comes back to them

## ideate.rules · say · added
**What Your Rules Leave Open**
Your rules already answer most things, so I'll only ask what they don't, and what's new now that it's on a screen. "Not sure yet" is always a fine answer.

## ideate.rules.gap · say · added
Your rules say {says}. {asks}

## ideate.digital.who · say · added
Your rules are for {players} around a table. On a screen, who plays: people online (at the same time, or taking turns), friends on one screen, the computer, or a mix?

## ideate.digital.computer · say · added
At the table, players {chores} themselves. The computer can do all of that now. Anything it shouldn't do, or anything extra you'd like (a tutorial, hints, replays)?

## ideate.sketch · say
**Sketch List**
A sketch is a small, throwaway playable page that answers one question: "Is this fun?", "Which of these two feels better?", "Can you read it on a phone?". Each one has sliders to tune, three saved presets, and a button to copy your settings back to me. We don't build the game from sketches; they settle questions before we build. Today I'm only making the list. We build them in Design.

## ideate.sketch.pick · box
? Which of these should we sketch? Pick any.
header: Sketches
many: yes
- [each sketches] {name} — answers: {question}

## ideate.sketch.more · box · added
? Anything else you're unsure about, or torn between two ways of doing? Tell me and I'll add it, or say "that's all".
header: More?
- That's all — the list is complete
- You pick — add anything you think is risky

## ideate.sketch.added · say
Added to your sketch list: {list}.

## ideate.page · say
**Your Project Page**
This is your game's home page. It opens in your browser and updates itself after every step, so you never need to edit it. On it:

· **The game**: your design document, chapter by chapter, each marked empty, loose, chosen, worked out or built
· **Sketches**: each sketch gets its own tab once it's built
· **Plan**: milestones and their progress (from Design on)
· **Open questions** and **Ideas for Later**

Type /ppp any time to open it again.

**Ideate is done.** Since you started, {loose} chapters went from empty to loose, and {sketches} sketches are on the list.
The three questions that matter most for Define:
{top#}

## ideate.ready · box
? Ready for Define?
header: Define
- On to Define (Recommended) — decide what the game is, on one page, about 30–45 minutes
- One more thing first — next, tell me what to add or fix

# Stage 2 · Define

## define.welcome · say
**Welcome to Define**
In Ideate we gathered. In Define we decide, from the biggest ideas down to the specific ones:
1. **The Feelings**: how it should feel to play
2. **The 3 Pillars**: three rules that settle arguments later
3. **The Pitch**: the game in a few lines
4. **The Core Loop**: what you do, over and over
5. **Platform & Play**: where it's played, and who with
Then I check it all for clashes, we size up the scope, and you lock it.

Whatever your GDD already says shows up first, one tap to keep. Before each big decision I'll offer to research how other games handled it. Nothing here is final: the rulebook in Design will reopen some of this, and that's normal.
About 30–45 minutes. You can stop after any step; everything is saved.

## define.welcome.rules · say · added
**Welcome to Define**
In Ideate we gathered. In Define we decide, and your rules already decide most of it, so this is short:
1. **What Your Rulebook Decides**: the feelings, the 3 pillars, the pitch and the core loop, drafted from your rules for you to confirm or correct in one go
2. **Platform & Play**: where it's played, and who with
Then we size up the scope for each release, pick the smallest version to play first, list the risks, and you lock it.
About 15 minutes. You can stop after any step; everything is saved.

## define.rules · say · added
**What Your Rulebook Decides**
Here's what your rules already decide, as I read them:

**The Feelings:** {feelings}. We'll know a player feels it when {know}.
**The 3 Pillars:**
{pillars}
**The Pitch:** {oneliner}
{lines}
**The Core Loop:** {loop}

## define.rules.ok · box · added
? Is that your game?
header: Your rules
- Yes, that's it — these four go into your design document as decided
- Change some — next, tell me what

## define.feelings · say
**The Feelings**
The one or two feelings that are this game, and a sign we could actually see in a player. Every later decision gets checked against these.

## define.feelings.moments · box
? From Ideate, you described these moments. Which one or two ARE this game? (pick up to 2)
header: The moment
many: yes
- [each moments] "{.}"

## define.feelings.own · box · added
? In your own words: what's the main feeling?[[ For example: {example}.]]
header: Feeling
- Show me your take — from what we gathered in Ideate
- Not sure — help me with the eight kinds of fun

## define.feelings.match · say
That sounds closest to **{fun}**: {meaning}. Game designers often name eight kinds of fun: the senses, make-believe, drama, challenge, being together, discovery, self-expression, and simply passing time.

## define.feelings.right · box
? Is that the right match?
header: Kind of fun
- Yes, that's it
- Closer to another one — next, I'll show the eight to pick from

## define.feelings.eight · box · added
? Which of the eight is closest: the senses, make-believe, drama, challenge, being together, discovery, self-expression, or simply passing time?
header: Closest
- Show me your take — the one or two closest, from what I said
- None of them — it's something else

## define.feelings.know · box · added
? How would we know a player feels it? What would you see them do or say? For example: "they ask for a rematch straight away".
header: How we know
- Show me your take — signs you'd see in a playtest
- Not sure yet — we find out in playtests

## define.feelings.not · box · added
? Last one: what would a game like this usually have that you deliberately don't want? Things that would be tempting to add, but aren't this game. "None I can think of" is fine.
header: Not this
- None I can think of — nothing to leave out
- Show me your take — what games like this usually have

## define.pillars · say
**The 3 Pillars**
Pillars are three short rules about what this game is really about. Later, whenever we wonder "does this idea belong?", the pillars decide. Each is one to three words, plus a line on what it means here.
Two real examples:
· God of War (2018): Combat · Father & Son · Exploration
· Destiny: Enjoyable by the Impatient and Distracted · Shared with Other People

## define.pillars.take · box
? Want to see my take first?
header: Pillars
- Show me your take — built from your feelings and the game so far
- I'll write my own — next, in your own words

## define.pillars.own · box · added
? What are the three things {game} is really about? One to three words each, and a line on what each means here.[[ For example: {example}.]]
header: Pillars
- Show me your take — three pillars from what we gathered
- Not sure yet — help me find them one at a time

## define.pillars.test · box · added
? If we took away "{pillar}", would it still be {game}? And finish this: "When we argue about ___, this pillar says ___."
header: Pillar test
- It's needed — without it, it isn't {game}
- It could go — it's still {game} without it

## define.pillars.slogan · box · added
? "{pillar}" doesn't settle anything yet; it's more of a slogan. Want to sharpen it, or swap it for another?
header: Slogan
- Sharpen it — show me a sharper version
- Swap it — show me other pillars
- Keep it — it means enough to me

## define.pitch · say
**The Pitch**
The game in a few lines, so anyone gets it in ten seconds. Two parts: one line, and 3–5 lines that describe playing it, written to "you". It's built from your feelings and pillars.

## define.pitch.research · box
? Before we write it, want me to look at the closest games: what players love and miss in them, and what's new in {game}? About 5 minutes, every claim with a source.
header: Research
- Yes, research first (Recommended)
- No, write it now

## define.pitch.found · say
Here's what I found: {found}. Sources are on your project page.

## define.pitch.take · box
? Want to see my take on the pitch, or write your own?
header: The pitch
- Show me your take
- I'll write it — next, in your own words

## define.pitch.write · box · added
? Write it in 3–5 lines, as if the reader is the player: "You…". Then one line: who am I, what am I doing, and why is it cool?
header: The pitch
- Show me your take — a pitch from what we've decided
- Help me start — give me the first line

## define.pitch.mine · say
Here's my take:
{lines}
One line: {oneliner}

## define.pitch.how · box
? How's that?
header: The pitch
- Keep it
- Change something — next, tell me what

## define.pitch.different · box · added
? What's the one thing that makes it different from the nearest game you'd compare it to?[[ For example: {example}.]]
header: Different
- Show me your take — what stands out from the research
- Not sure yet — let's find it together

## define.pitch.meets · box · added
? What exactly do you take from {x}, and what from {y}?
header: X meets Y
- Show me your take — what I'd take from each
- Drop the comparison — it doesn't fit

## define.pitch.breath · box · added
? Last check: read the one-liner out loud. Can you say it in one breath? If not, what would you cut?
header: One breath
- Yes, one breath — keep it as it is
- Too long — show me a shorter version

## define.loop · box · added
? **The Core Loop**
The core loop is what players do over and over: the heartbeat of the game. We'll say it in plain words first. Later it becomes the "Flow" section of your rulebook.

1. What does the player do most often? One verb.
2. Fill in: "You ___, then ___, so you can ___."
header: Core loop
- Show me your take — the loop from what we've decided
- Not sure yet — help me with the verb first

## define.loop.steps · box · added
? For each step: what's in your way, what do you do about it, and what do you get? And how does that set up the next round?[[ For example: {example}.]]
header: Loop steps
- Show me your take — each step from the rules so far
- Not sure yet — Design works it out

## define.loop.time · box · added
? What happens in 3 seconds, in 30 seconds, and in 3 minutes? And what's different the next time round, so it doesn't feel the same?[[ For example: {example}.]]
header: Over time
- Show me your take — from the loop so far
- Not sure yet — Design works it out

## define.loop.verbs · box · added
? For {verb}: is it fun on its own? What does a good player do with it that a new player doesn't?[[ For example: {example}.]]
header: The verb
- Show me your take — what a good player does with it
- Not on its own — it's fun with the rest

## define.loop.here · say
Here's your core loop:
**{loop}**

## define.loop.ok · box
? Is that the heartbeat?
header: Core loop
- Yes, keep it
- Change something — next, tell me what

## define.platform · say
**Platform & Play**
Where it's played first, and who with. These change how the game is designed, so we decide the big ones now. The details (how long a game is, saving, what happens when someone leaves) come later, in Design.

## define.platform.now · say · added
**Platform & Play**
Where it's played first, and who with. These two change how the game is designed, so we decide them now. Everything else about the digital game comes later.

## define.platform.where · box
? Where is the player, and what are they holding? (pick any)
header: Holding
many: yes
- A phone
- A computer, mouse and keyboard
- A controller
- A tablet

## define.platform.first · box
? Which one platform first?
header: First
- The web — a link anyone can open
- Phone app stores
- Steam or another PC store
- itch.io

## define.platform.someday · free
And which ones are "someday"? Name them, or say "none".

## define.platform.who · box
? Who else is playing? (pick any)
header: Who plays
many: yes
- Nobody, it's solo
- Friends on the same screen
- Online, at the same time
- Online, taking turns

## define.platform.ai · box
? If there's an opponent: must the computer be able to play it?
header: Computer
- Yes, and it has to be good
- Nice to have
- No

## define.clash · say
**Clash Check**
Now I'll read everything we've decided, looking for things that pull against each other and problems that are hard to see from the inside. I'll tell you what I find and why. It's your game: I'll make my case once, and you decide.

## define.clash.one · say
{n}. {a} and {b} pull against each other: {why}.

## define.clash.what · box
? What should we do?
header: Clash
- Keep both — I'll note it as a risk to test
- Change one — next, tell me which and how
- Park one for later — it goes to Ideas for Later

## define.clash.none · say
Nothing clashes. {holds}

## define.scope · say
**Scope, First Pass**
Time to see the size of what we're building. Three tools, quickly:

· **Must / Should / Could / Won't**: for each idea, if it were missing, would the game be pointless? Yes means it's a must.
· **Effort vs Impact**: four boxes: quick wins (do first), big projects (plan them), fill-ins (when there's time), and ones to avoid.
· **Vertical slice**: a small piece of the game with a bit of everything that matters, at close to final quality. It's the first thing you'll play and share.

This is a first pass. The rulebook will add a lot, and we'll redo it in Design.

## define.scope.intro · say · added
**Scope, First Pass**
Time to see the size of what we're building, in three quick parts:

· **How much the game needs each idea**: must, should, could or won't.
· **Effort vs impact**: where each idea lands on a chart, so we know what to build first.
· **The first piece to play**: the smallest version you'd play and share first.

This is a first pass. The rulebook will add a lot, and we'll redo it in Design.

## define.scope.first · box · added
? **The first piece to play**
Before the whole game, we build one small piece you can play and share: a vertical slice, with a bit of everything that matters, at close to final quality. What's the smallest version that still gives "{feeling}"? For example: {example}.
header: First piece
- Show me your take — the slice I'd build first
- Not sure — show me two or three to pick from

## define.scope.need · box · added
? {idea}: how much does the game need it?
header: {idea}
- Must — the game doesn't work without it
- Should — it hurts to leave out, but the game still works
- Could — nice to have, if there's time
- Won't — not in this game (for now)

## define.scope.smallest · free
What's the smallest version that still gives "{feeling}"?

## define.scope.idea · box
? {idea}: if it were missing, would the game be pointless?
header: Scope
- Must
- Should
- Could
- Won't

## define.scope.wont · box · added
? For each "won't", a quick reason, so we remember why: {wonts}
header: Won't: why
- Show me your take — a reason for each, from what I said
- No reason needed — just keep them as won'ts

## define.scope.someday · box · added
? **Platforms later**
It starts on {first}. Now that the features are sorted: anywhere else you'd like it someday, once the musts are built? For example: {example}. Or say "none".
header: Later
- None — only {first} for now
- Show me your take — where it could go next

## define.scope.chart · free
Here's the effort vs impact chart, on your project page now. Effort is my estimate from research; impact is yours to correct. Anything in the wrong box?

## define.scope.slice · say
Here's the vertical slice I'd build first: {slice}.

## define.scope.chart.here · box · added
? **Effort vs impact**
{chart}

It's drawn on your project page too, as a real chart: {link}. Effort is my estimate from research; impact is yours to correct. Anything in the wrong box?
header: The chart
- All right — every idea is in the right box
- Move some — next, tell me which

## define.scope.slice.list · say · added
Here's the vertical slice I'd build first:
{slice}

## define.scope.slice.ok · box
? Does that slice feel like the game?
header: The slice
- Yes
- Change it — next, tell me what

## define.scope.report · say
My first report:
· Risks: {risks}
· Needs research: {research}
· New sketch ideas, added to your list: {sketches}

## define.lock · say
**Concept Lock**
Here's the concept, one page, on your project page now: {link}

✓ The Feelings: {feelings}
✓ The 3 Pillars: {pillars}
✓ The Pitch: {oneliner}
✓ The Core Loop: {loop}
✓ Platform & Play: {platform}
✓ Scope, first pass: {musts} musts, slice chosen

Still open: {open}. That's fine; Design fills these.

Locking means Design builds on this page. You can still change it later; every change is logged.

## define.lock.when · say · added
**Concept Lock**
Here's the concept, one page, on your project page now: {link}

✓ The Feelings: {feelings}
✓ The 3 Pillars: {pillars}
✓ The Pitch: {oneliner}
✓ The Core Loop: {loop}
✓ Platform & Play: {platform}
✓ Scope, first pass: {musts} musts, slice chosen
[[
**Needed before you lock**: type your answers in the box below, in its own field.
{now#}
]][[
**For Design**, nothing to answer now:
{design}
]][[
**Later**, not needed for the slice:
{later}
]]
Locking means Design builds on this page. You can still change it later; every change is logged.

## define.lock.box · box
? Lock the concept?
header: Lock
- Not yet: change something — next, tell me what
- Lock it: on to Design

# Stage 3 · Design

## design.welcome · say
**Welcome to Design**
The concept is locked. Now we work the game out in detail, in two halves.

**The game itself**
1. **Sketches**: we build the sketches on your list and play them
2. **The Rulebook**: the rules, written like a real rulebook
3. **Content & Balance**: every card, unit, ability and number, in tables
4. **Change Over Time**: what changes within a game and between games
5. **Scope & Risks, second pass**: the rulebook always adds things, so we size it up again

**The digital game around it**
6. **Players & Opponents**: the computer opponent, online play, saving
7. **Look & Sound**: the style, tested at real size
8. **Screens & Menus**: every screen and what's on it
9. **The Build Plan**: how it all gets built, and in what order

This is the longest stage, usually a few sittings. The rulebook is the heart of it and gets rewritten many times; that's how good rulebooks are made. You can stop after any step, and everything is saved.

## design.sketches · say
**Sketches, Round 1**
Time to build the sketches on your list. A reminder: these are only sketches, small throwaway pages that each answer one question. We won't build the game from them, only from what they prove.

## design.sketches.list · say
Your list: {list}. Before I build each one, here's how we'll know the answer:
{tests}

## design.sketches.none · say · added
Your sketch list is empty, so there's nothing to build in this round. A new sketch can be added any time.

## design.sketches.order · box
? Build them in this order?
header: Order
- Yes, build them
- Change the order or the tests — next, tell me what

## design.sketch.ready · say
**{name}** is ready: {link}
It answers: {question}
Try moving: {knobs}. When a setting feels right, press "Copy values for Claude" and paste them here.

## design.sketch.answered · box
? Did {sketch} answer the question?
header: Answered?
- Yes, keep what it showed — it goes into the design
- Partly, try another way — next, tell me what to change
- No, rethink it — it goes back to Open Questions

## design.sketch.sim · say
{name} is a numbers question, so I ran {how} instead of a sketch: {found}.

## design.rulebook · say
**The Rulebook**
The rules, written like a real rulebook. This becomes the single truth: the game, the tests and the tutorial all follow it.

This is a first pass, so we capture every rule and don't polish. "TBD", "X" for a number we don't know yet, and two rival rules side by side ("Rule A / Rule B, to test") are all fine. It'll be rewritten many times, and a dated development log at the end records what changed and why.

The structure, the same order your own rulebooks use:
Overview · Components · How to Win · Setup · Gameplay (the Flow, then each action) · Game End · Scoring · Keywords · Development Log

## design.rulebook.research · box
? Before we start, want me to read the rulebooks of the closest games, for how they explain similar rules?
header: Research
- Yes, research first (Recommended) — about 5 minutes, sources on your project page
- No, start now

## design.rulebook.flow · box · added
? We start with the heart: the Flow. Your core loop was: **{loop}**.
Walk me through one turn, step by step, as if you were teaching a friend at the table.
header: The Flow
- Show me your take — a turn, step by step, from the loop
- From my rules — read the turn from the rules I shared

## design.rulebook.flow.here · say
Here's the Flow as I've written it:
{flow#}
The full rulebook is on your project page now, as its own tab.

## design.rulebook.flow.ok · box
? Is that how a turn goes?
header: The Flow
- Yes
- Change something — next, tell me what

## design.rulebook.win · box · added
? How do you win, and how does a game end?[[ For example: {example}.]]
header: Winning
- Show me your take — from the rules so far
- Not decided yet — leave it open for a sketch

## design.rulebook.setup · box · added
? How is the game set up, before the first turn?[[ For example: {example}.]]
header: Setup
- Show me your take — from the rules so far
- Not decided yet — leave it open for a sketch

## design.rulebook.pieces · box · added
? What are all the pieces? Here's what I have so far: {pieces}. Anything missing?
header: Pieces
- That's all — nothing is missing
- Some are missing — next, tell me which

## design.rulebook.action · box · added
? For {action}: what exactly happens, and what can't you do?[[ For example: {example}.]]
header: The action
- Show me your take — from the rules so far
- Not decided yet — leave it open for a sketch

## design.rulebook.edge · box · added
? What happens when {edge}?[[ For example: {example}.]]
header: Edge case
- Show me your take — what most games do here
- Not decided yet — leave it open for a sketch

## design.rulebook.secret · box · added
? What's secret, from whom, and until when?
header: Secrets
- Nothing is secret — everyone sees everything
- Show me your take — from the rules so far

## design.rulebook.names · box · added
? What do players call each thing and each action? I'll keep one name per thing, everywhere.
header: Names
- Show me your take — one name per thing, from what we've said
- Keep the rules' words — the names my rules already use

## design.rulebook.section · say · added
Here's {section} as I've written it:
{text}

## design.rulebook.ok · box · added
? Is that right?
header: Rulebook
- Yes
- Change something — next, tell me what

## design.rulebook.done · say
First pass done. {tbd} rules are marked TBD and {ab} is a Rule A / Rule B to test. I've added a first Development Log entry:
{entry}
You can read and edit it any time, on your project page or in Obsidian. I keep your edits.

## design.content · say
**Content & Balance**
Every card, unit, ability, level and number, in tables: the second document beside the rulebook. One table per kind of thing, one row each. In the finished game these tables are the files the game reads, so you can tune them live later.

## design.content.kinds · box · added
? From the rulebook, the game has these kinds of things: {kinds}. Anything missing?
header: Kinds
- That's all — nothing is missing
- Some are missing — next, tell me which

## design.content.columns · box · added
? For {kind}, here are the columns I'd use: {columns}. Change any, then tell me the ones you already have in mind, even rough.
header: Columns
- These are fine — fill them in for me to check
- Change some — next, tell me which

## design.content.balance · box · added
? I've worked out a balance value for each row, from {basis}. These stand out:
{standouts}
Want me to suggest fixes, or would you rather adjust them yourself?
header: Balance
- Suggest fixes — show me what you'd change
- I adjust them — in the content tables myself

## design.content.playtest · say
There's also a Playtesting table for every test game: date, players, start, end, length, scores. I'll fill it in as you play.

## design.time · box · added
? **Change Over Time**
What changes during a game and between games, and how fast. This is what keeps the hundredth game from feeling like the first.

1. What's different at the end of a game compared with the start?
2. What changes from one game to the next, if anything?
3. If there's a longer journey (levels, unlocks, ranks): how long is it, and does each step bring something new?
4. What decides when a player moves up?
header: Over time
- Show me your take — from the rules and the loop
- Nothing changes — every game is the same, and that's the point

## design.time.trap · box · added
? I checked for the common traps. {trap} Want to keep that, or soften it?
header: The trap
- Soften it — show me how
- Keep it — it's part of the game

## design.time.notrap · say · added
I checked for the common traps and didn't find one: {why}.

## design.scope2 · say
**Scope & Risks, Second Pass**
The rulebook always turns up new pieces, new problems and new questions. So we size it all up again, with what we know now.

## design.scope2.added · say
The rulebook added these: {added}.

## design.scope2.report · say
The effort vs impact chart is redrawn on your project page. What moved: {moved}.
The vertical slice is now: {slice}.
New risks: {risks}. New sketches, added as round 2: {sketches}.

## design.scope2.pitch · box
? Does the pitch still say it right?
header: The pitch
- Yes
- Rework the pitch — back to The Pitch, then here again

## design.players · say
**Players & Opponents**
Now the digital game around the rules, starting with who you play with and against. Knowing the gameplay first makes these choices much easier. This also starts the technical plan, the TDD.

## design.players.read · say
I read how similar games handle this first: {found}.

## design.players.ai · box · added
? How should the computer opponent play: what does it go for, how does it change by difficulty, and how does it still try to win?
header: Computer
- Show me your take — how it plays, by difficulty
- Like a good player — it plays to win, as I would

## design.players.online · free
Online: what happens when someone leaves, goes quiet, comes back or joins late? Can the room play again?

## design.players.length · free
How long is one game? Can it be paused or saved halfway?

## design.players.leave · box · added
? Online, when someone leaves partway through a game, what should happen?
header: Leaving
- The computer plays their seat — the game goes on, and they can rejoin their seat later (BMUZ's usual way)
- The game waits for them — paused a few minutes, then the computer plays their seat
- The game ends for everyone — nobody wins that one

## design.players.long · box · added
? **One game**
How long is one game, roughly? For example: {example}. If it just ends when someone wins, say so.
header: One game
- It ends when someone wins — no set length
- Show me your take — from the rules so far

## design.players.defaults · say · added
The rest is mine to build, the way every BMUZ game does it, so there's nothing to decide:
{defaults}

## design.players.needs · box
? Which of these does the game need? (pick any)
header: Needs
many: yes
- Accounts — players sign in
- Friends or invites
- Leaderboards
- None of these

## design.look · say
**Look & Sound**
The style of the game, tested at the size it'll actually be played, before the full build.

## design.look.refs · box · added
? Share any pictures or games whose look you love: paste links, or describe them.
header: References
- None yet — show me some to react to
- In this folder — the pictures I put in this project's folder

## design.look.sketches · say
From your references, here are {n} look sketches, side by side at real phone size: {link}.

## design.look.pick · box
? Which look is closest?
header: The look
- [each looks] {.}
- None yet — next, tell me what's missing

## design.look.motion · box · added
? How do the pieces move: slide, snap, fly, bounce?
header: Motion
- Slide — smooth and calm
- Snap — quick and crisp
- Bounce — playful, with a little overshoot
- Show me your take — what fits the look

## design.look.sound · box · added
? What should it sound like? And is a simple placeholder sound good enough for the first playable version? Most games start that way.
header: Sound
- Placeholders are fine — simple sounds for the first version
- Show me your take — what it should sound like

## design.screens · say
**Screens & Menus**
Every screen in the game, and what's on each one.

## design.screens.map · box · added
? Here's the screen map: {map}. Anything missing?
header: Screens
- That's all — nothing is missing
- Some are missing — next, tell me which

## design.screens.eyes · box · added
? During play, where are the player's eyes? What must they see at a glance?
header: At a glance
- Show me your take — from the rules so far
- Not sure yet — the screens sketch shows it

## design.screens.choose · box · added
? What do players choose before a game, and what's a setting they change once?
header: Choices
- Show me your take — from the rules so far
- Nothing to choose — straight into a game

## design.screens.end · box · added
? At the end of a game, what does the screen show, and what does it celebrate?
header: Game end
- Show me your take — from the feelings we picked
- Just the winner — and a button to play again

## design.screens.style · box
? Which UI style fits? (all seven shown side by side on your project page)
header: UI style
- [each styles] {.}

## design.screens.teach · say
I'll also note what a new player will need to learn. The tutorial itself comes much later, after people have played it.

## design.plan · say
**The Build Plan**
Everything so far, turned into a plan for building. The technical choices are mine, so I won't ask you about them; I'll tell you what I picked and why, in plain words.

## design.plan.how · say
Here's how it'll be built:
{how}
The full technical plan, the TDD, is on your project page.

## design.plan.roadmap · say
And here's the roadmap, the order we'll build in:
{milestones#}
Each milestone lists its features and what each one needs first.

## design.review · say
**Blueprint Review**
Before anything is built, one full read-through. Everything is on your project page:
· The GDD, start to end
· The rulebook and the content tables
· The technical plan (TDD)
· The roadmap, with the first sprint it would start with: {sprint}

From here we start building. That's a loop: build a few pieces, you play them, we tune, and again. You can still change anything; changes are logged, and big ones may move the roadmap.

## design.review.box · box
? Ready to build?
header: Build?
- Not yet: change something — next, tell me what
- Approve: start building

# Stage 4 · Develop

## develop.welcome · say
**Welcome to Develop**
Now we build. From here on it's a loop:
1. **Plan the sprint**: a few features, each with what you'll see when it's done
2. **Build & prove**: I build and test them
3. **Play & approve**: you play each one; nothing is done without your OK
4. **Tune & revise**: we adjust until it feels right
5. **Look back**: three lines on how it went
…then the next sprint.

You can step in any time. Here's how I handle what you bring:
· **A tweak** to what we're building ("make it a bit faster"): I do it now.
· **A new idea**: it goes on Ideas for Later and comes back at the milestone where it fits, so we stay focused without losing it.
· **Something broken**: say so, or type /bug. If it blocks what we're doing, I fix it now; otherwise it's logged and fixed in order.
· **"Stop"** or **"go back"**: always works. Everything is saved after every step.

Your project page shows the roadmap and every milestone's progress. Each time a milestone is ready, we make a build you can play and share. That's Stage 5, Deliver, and then we come back here.

## develop.setup · say
**Setup**
Now that we know what the game needs, I'll set up the project, the tools and any accounts. I'll check the current setup steps for each one first, since these services change often.

## develop.setup.needs · say
The game needs: {needs}. Most of it I can do myself. These need you to log in: {logins}. I'll walk you through each, one step at a time.

## develop.setup.nologin · say · added
The game needs: {needs}. I can do all of it myself: nothing needs you to log in.

## develop.setup.step · box · added
? Step {n} of {total}: {what}. Say "done" when you're in.
header: Setup
- Done — I'm in
- Stuck — help me with this step

## develop.roadmap · say
**The Roadmap**
The whole journey ahead, on your project page: {link}
· Milestones, in order: {milestones}
· Each one's features, and what each needs first
· A % for each milestone, which can drop when we add something; that's normal
· Ideas for Later, kept apart so nothing is lost

We'll look at it together at the start of each milestone, and whenever something big changes.

## develop.roadmap.box · box
? Start with {first}?
header: Start
- Change the order first — next, tell me what
- Yes, start building

## develop.plan · say
**Plan the Sprint** · Sprint {n} · {milestone}
Here's what I'd build next, {count} features:

## develop.plan.one · say · added
**Plan the Sprint** · Sprint {n} · {milestone}
Here's what I'd build next, 1 feature:

## develop.plan.feature · say
**{feature}**
· You'll see: {see}
· Done when: {done}
· Not doing yet: {notyet}
· Needs from you: {needs}

## develop.plan.box · box
? Build this sprint?
header: Sprint
- Change it — next, tell me what
- Yes, build it

## develop.progress · say
⏳ {time}: building {feature} (feature {n} of {total}). Next update when it's done.

## develop.stuck · say
{piece} isn't working, and two tries haven't fixed it. Here's what I know: {know}. I'll {plan} unless you'd rather I park it.

## develop.ready · say
**{feature} — ready for you to check**
· What changed: {changed}
· Try it: {pc} · {phone}
· Try this: {try}
· Checked: {checked}

## develop.approve.box · box
? Did {moment} feel like {feeling}?
header: Approve?
- Yes, approve it
- Close, needs tuning
- Not right — next, tell me what feels off

## develop.waiting · say · added
Every feature of this sprint I could build is built. Waiting for your OK on: {features}. Say "bmuz go" when you're back, and I'll show you each one.

## develop.tune · box · added
? **Tune & Revise**
Let's find what feels off. In your words, what's wrong with it?
header: Tune
- Too slow — it drags
- Too hard — I can't keep up
- Too easy — nothing to think about
- Show me your take — what you see in it

## develop.tune.try · say
I think it's {cause}. One setting to try: {setting}. I expect {expect}. It's in the Dev Kit's Tuning tab, so you can move it while the game runs.

## develop.tune.keep · say
Values you save in the Dev Kit are decisions: I'll keep them.

## develop.tune.rule · box · added
? No setting will fix this; it's the rule itself. Want to look at the rule together? It goes back to the rulebook, with a dev log entry.
header: The rule
- Yes, look at the rule — back to the rulebook, with a dev log entry
- Not now — keep the rule, note it for later

## develop.lookback · box · added
? **Sprint {n} done** · {milestone} is {pct} done.
Three lines on how it went: what went well, what went wrong, and what we change next time. Here's my draft; your words win:
{draft}
header: Look back
- Keep the draft — those three lines are right
- Change some — next, tell me what

## develop.lookback.updated · say
I've updated the GDD, the rulebook and the technical plan to match what we built. Next sprint: {next}.

## develop.teaching · say
**Teaching**
Now that the game plays and people have tried it, we can design how a new player learns it. Studios do this late on purpose: you can only teach well once you've seen where people get stuck.

## develop.teaching.ask · box · added
? 1. In the playtests, where did people get stuck, or ask "what do I do?"
2. What must a new player understand in the first minute?
3. Could the first game teach it with no text at all?
header: Teaching
- Show me your take — from the playtest notes
- No playtests yet — skip to what you'd teach first

## develop.teaching.plan · say
Here's the tutorial I'd build: {steps}. Each one teaches one thing, in the order players meet it.

## develop.idea · say · added
Noted on Ideas for Later: {idea}. It comes back at the milestone where it fits.

# Stage 5 · Deliver

## deliver.welcome · say
**Welcome to Deliver**
{milestone} is built and approved, so it's time to turn it into something you can play and share. You'll come back here at each milestone:
· **Playable**: each vertical slice. A link for you, and one to share.
· **Alpha**: every must-have feature in, still rough. For friends and playtesters.
· **Beta**: basically finished. For wider testing.
· **1.0**: the release. Then Stage 6 takes it public.
The checks grow with each stage. After every build, playtest notes go back into Develop.

## deliver.check · say
**Release Check** · {stage}
{checks}

## deliver.notready · free
Not ready yet: {missing} isn't done. Want to finish it first, or move it to the next stage?

## deliver.notready.box · box · added
? Finish it first, or move it to the next stage?
header: Not ready
- Finish it first — back to Develop
- Move it to the next stage — only a must can move

## deliver.standins · say
**Polish & Stand-ins**
These are still placeholders: {standins}. For a {stage} build, placeholders are usually fine.

## deliver.standins.box · box
? Which should be polished before this build? (pick any)
header: Polish
many: yes
- [each standins] {.}
- None, ship it as it is

## deliver.safety · say
**Safety & Legal** · {stage}
{checks}
[[{later}]]

## deliver.build · say
**Build & Share**
The {stage} build is ready and tested on {tested}:
· For you: {local}
· To share: {share}

## deliver.share.box · box
? Share it?
header: Share
- Not yet — next, tell me what's missing
- Share it — the share link goes live

## deliver.live · say · added
It's live: {link} (version {version}).

## deliver.back · say · added
Back to Develop to {what}.

## deliver.notes · box · added
? **Playtest Notes**
Once people have played it, tell me what happened: what they did, what they said, where they got stuck. Paste notes, links or messages, any way you have them.
header: Playtests
- No playtests yet — carry on without notes
- In this folder — the notes I put in this project's folder

## deliver.notes.feelings · say
Against the feelings you chose:
{feelings}

## deliver.notes.added · say
From your notes I've added {added} to the roadmap. Back to Develop.

# Stage 6 · Release

## release.welcome · say
**Welcome to Release**
1.0 is ready. Now it goes public. What that takes depends on where it's going: a web link is one step; Steam and the phone stores need store pages, artwork, forms and a review that can take days. I'll check each platform's current rules first.
Nothing goes public without your clear OK.

## release.where · box
? Where should it go? (pick any)
header: Where
many: yes
- The web
- itch.io
- Steam
- Phone app stores

## release.store · say
**Store & Launch** · {platform}
Here's what {platform} needs today: {needs}.
Done: {done} · Needs you: {you}.

## release.page · box · added
? The store page, written from your pitch: {draft}. Change anything?
header: Store page
- Keep it — the page is right
- Change some — next, tell me what

## release.gate.box · box
? Release {game} on {platform}?
header: Release
- Not yet — next, tell me what's missing
- Release it — it goes public

## release.live · say
{game} is live: {link}. I checked it from outside, and it loads and plays.

## release.notyet · say · added
{platform} waits until this is done: {what}. It's on the roadmap. When it's ready, say "bmuz stage release platform" and we'll pick {platform} up again.

## release.walk · box · added
? **{platform}, step {n} of {all}:** {step}
Say "done" when it's done, or ask me anything about it.
header: This step
- Done — that step is finished
- Stuck — help me with this step

## release.walk.live.box · box · added
? Is {game} live on {platform}?
header: Live?
- Not yet — it isn't showing there yet
- Yes, it's live — next, I'll paste its link

## release.walk.link · box · added
? When {platform} shows {game} live, paste its link here. I'll check it from outside before I mark it released.
header: Live link
- Not live yet — wait until it is
- Can't find it — help me find the link

## release.reactions · box · added
? **First Reactions**
Share what players are saying: reviews, comments, messages. Paste links or text.
header: Reactions
- Nothing yet — no reactions to share
- In this folder — what I put in this project's folder

## release.reactions.read · say
Against your feelings: {feelings}. Worth fixing in an update: {fixes}.[[ Added to the roadmap as {update}.]]

## release.lookback · box · added
? **Look Back**
What did {game} teach us for the next game? Here's my list; change anything:
· For this game: {forgame}
· For BMUZ itself: {forbmuz} (sent to Muzzy as suggestions)
header: Look back
- Keep the list — it's right
- Change some — next, tell me what

## release.none · say · added
Nothing has gone out yet: {waiting}. Nothing is public. Back to "Where should it go?": pick again when it's ready, or say "stop" to leave it here.

## release.out · say · added
{game} is out. To start an update, tell me what to fix (it goes on the roadmap as an Update milestone), then say "bmuz stage develop plan".

# Any stage

## any.keep · box · added
? {question}
header: Keep?
- Keep — {answer}
- Change — next, tell me what

## any.type · say · added
Type your answer below.

## any.wait · say · added
**Your to-do:** {what}, in your next message.

## any.chat · say · added
Go ahead: type or paste your answer as your next message.

## any.noted · say · added
Noted in your design document: {decision}.

## any.decided · say · added
Noted: {what} is already decided ({answer}). I won't ask about it again.

## any.decided.what · free · added
What was decided? Tell me in a line and I'll write it down.

## any.decided.which · free · added
Which one is already decided: {options}? I'll still ask about the others.

## any.skipped · say · added
**What I didn't ask about**
{skipped#}
To bring one back, say "reopen" and its number.

## any.reopen · say · added
Back to {title}, so you can answer it yourself.

# Any time · when the creative steps in (F215)

## bug.logged · say
Logged as a bug: {bug}. It doesn't block what we're doing, so I'll fix it {when}.

## bug.how · say
**Something broken**: say so, or type /bug. If it blocks what we're doing, I fix it now; otherwise it's logged and fixed in order.

## bug.now · say · added
Logged as a bug: {bug}. It blocks what we're doing, so I'll fix it now.

## bug.engine · say · added
That's a bug in BMUZ itself, not in your game: {bug}. It's on BMUZ's own bug list now and gets fixed there, so we carry on.

## bug.often · box · added
? Does it happen every time, or just once?
header: How often
- Every time
- Just once
- Not sure

## bug.none · say · added
Nothing to fix: there are no open bugs.

## bug.verified · say · added
Marked {bug} as verified: you checked it and it's right.

# Any time · research (F229)

## research.look · say
Let me look. {time}…

## research.found · box · added
? Here's what I found:
{found}
Sources are on your project page. Does it change anything?
header: Research
- No, carry on — it changes nothing
- Yes — next, tell me what changes

## research.wait · say · added
The {helpers} helpers are still working, so I'll start looking once they're done: "{question}".

## research.busy · say · added
I'm still looking into "{question}". One question at a time: ask me this one again once that's back.

## research.none · say · added
I couldn't find sources I trust on "{question}", so I have nothing to add yet. Back to {back}.

## research.changed · say · added
Changed {file} for your answer: {what}.

## research.notstarted · say · added
The research on "{question}" didn't start. Ask again when you want it.

## research.lost · box · added
? Your research on "{question}" stopped {why}. Ask again?
header: Research
- Not now — carry on where we were
- Ask again — start the same research again

# Fixing a bug (F215: the bug pipeline)

## bug.fix.start · say · added
**Fixing a bug**
Fixing {bug}. First I make it fail in a test, so we know it's real. Then I find the cause, fix it, and look for the same mistake in other places.

## bug.fix.reproduced · say · added
Reproduced: {test} fails, as it should while the bug is there.

## bug.fix.done · say · added
**Fixed: {bug}**
· Cause: {cause}
· Guarded by: {test}, which fails if the bug ever comes back.
[[· The same mistake, also fixed: {also}]]
[[· Logged as new bugs: {logged}]]
[[· Committed: "{commit}"]]
[[· Not committed: {nogit}]]
[[· You had unsaved changes in {dirty}, so I left it out of the commit: the fix is in it too.]]
[[Check it yourself, then say "bmuz bug verified {check}".]]
Back to {back}.
