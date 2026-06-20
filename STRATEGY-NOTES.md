# Strategy & Direction Notes — Handoff for Next Session

_Last updated: 2026-06-20_

This is a thinking-out-loud strategy doc, not a spec. No code changes were made
in the session that produced it. The goal: capture the ideas and open questions
we discussed so the next session can pick up without re-deriving everything.

---

## Where this started

The project is a Pokémon-style game ("pokedex-quest"): explore zones, encounter
creatures, catch them, fill a dex, plus a bunch of supporting systems (an
in-browser **world/level editor**, NPCs + dialogue, **gate/lock puzzles**,
save slots, day/night cycle, a world map / fast-travel, badges/collectibles,
multiplayer scaffolding, and educational side-apps for math/strings/etc.).

The question on the table was: **how do we turn this into something sellable /
standout — something that is NOT just a Pokémon clone?**

## The core tension

- The **catch-the-creatures + fill-the-dex loop** is the most clone-like,
  IP-shaped part. It's a legal/originality liability and it's the part that
  reads as "Pokémon knockoff."
- BUT that same loop is the **engagement engine** — the "one more, gotta
  complete the set" compulsion that makes the game sticky. It's doing huge,
  invisible motivational work.
- So you can't just delete it. Removing it leaves a **hole in the "why do I
  keep playing" loop** that something else must fill. This is the crux.

## What's actually the asset (vs. what's the liability)

- **Asset:** the engine, the in-browser **editor**, the **gate/puzzle**
  system, NPCs/dialogue, save/day-night/map systems, and — most importantly —
  the **tone** we landed on (see below).
- **Liability / shed it:** the dex, catching, "PokéBalls," type chart, the
  catch mini-game framing, the "151 creatures to collect" framing.
- **Reframe the buddy:** the creature-that-follows-you-and-opens-paths-with-
  its-ability is a lovely ORIGINAL primitive. Keep it. Just drop the "it's one
  of N you collected" framing — it's simply *a friend you found*, and friends
  have abilities.

## The most ownable idea: TONE, not mechanics

The single most defensible thing here isn't code — it's a **stance**:
**"befriend with kindness, never battle / never be cruel to anything."**

- Mechanics get cloned; a values/tone stance doesn't.
- Cozy / wholesome / non-violent is a real and growing category (the
  Animal Crossing / Stardew emotional lane).
- "Pokémon clone" is instantly dismissible. "The gentle game where you're never
  cruel to anything" is something a parent remembers and chooses.
- This tone is **portable onto any direction** below — it's the brand layer.

## A tool/editor alone is NOT a moat

If we go "make-your-own-game tool," we're competing with Roblox, Scratch,
Flowlab, Bitsy, etc. — on distribution and network effects, which is brutal.
A 2D editor existing is not a differentiator. The wedge would have to be:
- a very specific **who** (e.g. ages 5–8 who can't read well yet — that changes
  the whole UX), and/or
- **near-zero friction** (no login, no install, share-a-link — genuinely rare
  for kids' tools), and/or
- a **specific vibe/tone** nobody else owns (see above).

**The strongest combination:** tool + tone = "kids build and share *gentle
little worlds*." That's neither "another game maker" nor "Pokémon."

## The three candidate directions

1. **Cozy/wholesome game** — lean into tone; consumer product economics
   (cheap, viral, or free-with-a-hook). Fun, lottery-like.
2. **Creation tool (build + share worlds)** — the editor is both content and
   engagement. Note: tool and game collapse into the same thing if the loop is
   "make worlds for friends and play theirs."
3. **Educational product** — clearest *buyer* (parents/schools pay), but the
   longest, least-fun road: trust, standards, a content treadmill, sales. A
   different business entirely. (We already have math/strings side-apps as seeds.)

## The replacement engagement loop (the real homework)

Once collecting is gone, pick the new compulsion loop. Candidates, roughly in
order of how original/defensible they are here:

1. **Authoring + sharing** — keep playing in order to *make* worlds for friends
   and play theirs. (Collapses the tool and game paths into one.)
2. **Helping / transforming a world** — arrive somewhere drab; your actions
   visibly change it (a town heals, a garden grows). Classic cozy-game engine.
3. **Puzzle progression** — the **gate system** as the actual game: a
   Zelda-lite of "find the friend / item / answer that opens the next door."

> Key insight: if we can't name which of these is the engagement engine, no
> amount of art or tone will make it sell. The three directions basically fall
> out of whichever loop we choose.

## Lowest-regret next move (recommended)

Build a **small, original, playable-AND-shareable vertical slice** with the
catch loop removed. It serves the portfolio, consumer, and "kid actually loves
it" goals simultaneously, and it de-risks the company version by proving the
non-clone is actually fun before betting on distribution.

Concretely, from what's already in the repo:
- **Keep:** tile engine, zone graph, seams/portals, **gate system** (best
  non-clone mechanic — it's just puzzle locks), NPCs + dialogue, save slots,
  day/night, world map, and the whole **editor**.
- **Cut:** dex, catching, PokéBalls, type chart, the encounter mini-game.
- **Reframe the verb:** walk a small handmade world; progress by **helping** —
  an NPC needs something, a gate opens when you solve/fetch/build, a path
  lights up. Keep the buddy-opens-paths primitive; drop the collection framing.

## The open question that gates everything

**What does "sell" actually mean for this project?** Each answer points to a
different direction and a different "first thing to build":

- **Portfolio / get-hired-or-funded** → tech + tone *demoed*; ship one polished,
  obviously-not-a-clone slice as a shareable link. Code quality matters most.
- **Beer-money consumer product** → virality + low friction win; the
  share-a-link tool, or a tiny cozy game with a hook.
- **Real company** → the *buyer & distribution* question dominates; the code is
  almost irrelevant by comparison. Optimize "who pays and how they find it."
- **A thing your kid + friends love** → ship fun fast; ignore moats entirely.

Get an answer to this first. Then the "what's the new engagement loop?" choice.
Then build the vertical slice.

## Suggested first actions for the next session

1. Get the human to answer the "what does 'sell' mean" question above.
2. Pick the replacement engagement loop (authoring / transforming / puzzles).
3. Scope the vertical slice (one small world, catch loop removed, tone applied).
4. Identify exactly which code in `game.js` / `world.js` / `data.js` implements
   the dex/catch/type systems so they can be cleanly disabled vs. the keepers
   (gates, NPCs, buddy-abilities, editor). _(Not yet investigated — TODO.)_
