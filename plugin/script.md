# The BMUZ script — what BMUZ says, word for word

Every fixed line BMUZ says lives here, and only here (F232). The engine sends them: Claude asks for a line by its id,
the engine fills its slots and hands back the exact words, and checks they were said unchanged. The wording is the
approved script's (framework .planning/research/bmuz-vision/bmuz-design-doc.html, Stages 1–2); a test compares every
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

## ideate.idea · free
**Your Idea**
Tell me about your game in your own words: what it is, what you love about it, anything you remember. Half an idea is fine. If you're not sure yet, just say so.

## ideate.spark · free
No problem: lots of games start that way. Three quick questions to find a spark. Answer one, two or all three, in one message:
1. What kind of game do you love playing lately, and why?
2. A moment from a game, a film or your life that you'd love to turn into play?
3. A theme, a mechanism or a feeling you keep coming back to?

## ideate.material · free
**Your Material**
Share your links — paste them with Alt+V. I can read Google Drive folder and/or doc links, GitHub links, and even folder and file links from your computer. If you don't want to share any links, just say "never mind".

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

## ideate.next · box
? What next?
header: What next
- Carry on in Ideate (Recommended) — a few questions about what's still open, about 15 minutes
- [if jump] Jump to Define — {covers}
- I need to correct something — next, tell me what I got wrong

## ideate.correct · free
What did I get wrong? Tell me in your next message.

## ideate.feelings · free
**Feelings & Hopes**
Now, how playing it should feel. I'm only collecting here; Define is where you choose. Answer any of these in one message, and skip any you like:
1. Describe a moment you'd love a player to have. Not a feature: a situation they find themselves in.[[ You mentioned "{quote}": is that the moment, or is there another?]]
2. After a game, what would a player tell a friend about it?
3. What do you hope this game becomes, and what would disappoint you?

## ideate.open · say
**Open Ideas**
A few questions about the parts of your idea that are still half-formed. I start with what's hardest to change later: in past games, how and where a game is played, and the shape of its rules, caused the most rework. "Not sure yet" is always a fine answer.

## ideate.open.ask · free
{questions#}
Answer in one message, in any order.

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

## ideate.added · say
Got it: added to {chapters}.

## ideate.round · box
? Another round?
header: One more?
- One more round — {left} gaps left, about 3 minutes
- That's enough for now — the rest stay open; Define comes back to them

## ideate.sketch · say
**Sketch List**
A sketch is a small, throwaway playable page that answers one question: "Is this fun?", "Which of these two feels better?", "Can you read it on a phone?". Each one has sliders to tune, three saved presets, and a button to copy your settings back to me. We don't build the game from sketches; they settle questions before we build. Today I'm only making the list. We build them in Design.

## ideate.sketch.pick · box
? Which of these should we sketch? Pick any.
header: Sketches
many: yes
- [each sketches] {name} — answers: {question}

## ideate.sketch.more · free
Anything else you're unsure about, or torn between two ways of doing? Tell me and I'll add it, or say "that's all".

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

## define.feelings · say
**The Feelings**
The one or two feelings that are this game, and a sign we could actually see in a player. Every later decision gets checked against these.

## define.feelings.moments · box
? From Ideate, you described these moments. Which one or two ARE this game? (pick up to 2)
header: The moment
many: yes
- [each moments] "{.}"

## define.feelings.own · free
In your own words: what's the main feeling?

## define.feelings.match · say
That sounds closest to **{fun}**: {meaning}. Game designers often name eight kinds of fun: the senses, make-believe, drama, challenge, being together, discovery, self-expression, and simply passing time.

## define.feelings.right · box
? Is that the right match?
header: Kind of fun
- Yes, that's it
- Closer to another one — next, I'll show the eight to pick from

## define.feelings.eight · free · added
Which of the eight is closest: the senses, make-believe, drama, challenge, being together, discovery, self-expression, or simply passing time?

## define.feelings.know · free
How would we know a player feels it? What would you see them do or say? For example: "they ask for a rematch straight away".

## define.feelings.not · free
Last one: what would a game like this usually have that you deliberately don't want? Things that would be tempting to add, but aren't this game. "None I can think of" is fine.

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

## define.pillars.own · free
What are the three things {game} is really about? One to three words each, and a line on what each means here.

## define.pillars.test · free
If we took away "{pillar}", would it still be {game}? And finish this: "When we argue about ___, this pillar says ___."

## define.pillars.slogan · free
"{pillar}" doesn't settle anything yet; it's more of a slogan. Want to sharpen it, or swap it for another?

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

## define.pitch.write · free
Write it in 3–5 lines, as if the reader is the player: "You…". Then one line: who am I, what am I doing, and why is it cool?

## define.pitch.mine · say
Here's my take:
{lines}
One line: {oneliner}

## define.pitch.how · box
? How's that?
header: The pitch
- Keep it
- Change something — next, tell me what

## define.pitch.different · free
What's the one thing that makes it different from the nearest game you'd compare it to?

## define.pitch.meets · free
What exactly do you take from {x}, and what from {y}?

## define.pitch.breath · free
Last check: read the one-liner out loud. Can you say it in one breath? If not, what would you cut?

## define.loop · free
**The Core Loop**
The core loop is what players do over and over: the heartbeat of the game. We'll say it in plain words first. Later it becomes the "Flow" section of your rulebook.

1. What does the player do most often? One verb.
2. Fill in: "You ___, then ___, so you can ___."

## define.loop.steps · free
For each step: what's in your way, what do you do about it, and what do you get? And how does that set up the next round?

## define.loop.time · free
What happens in 3 seconds, in 30 seconds, and in 3 minutes? And what's different the next time round, so it doesn't feel the same?

## define.loop.verbs · free
For {verb}: is it fun on its own? What does a good player do with it that a new player doesn't?

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

## define.scope.smallest · free
What's the smallest version that still gives "{feeling}"?

## define.scope.idea · box
? {idea}: if it were missing, would the game be pointless?
header: Scope
- Must
- Should
- Could
- Won't

## define.scope.wont · free
For each "won't", a quick reason, so we remember why: {wonts}

## define.scope.chart · free
Here's the effort vs impact chart, on your project page now. Effort is my estimate from research; impact is yours to correct. Anything in the wrong box?

## define.scope.slice · say
Here's the vertical slice I'd build first: {slice}.

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

## define.lock.box · box
? Lock the concept?
header: Lock
- Not yet: change something — next, tell me what
- Lock it: on to Design

# Any stage

## any.keep · box · added
? {question}
header: Keep?
- Keep — {answer}
- Change — next, tell me what
