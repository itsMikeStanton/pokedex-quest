# Lukeymon — LAN Party Mode 🎮

See your friends walking around the same world, and bump into them for a
friendly type-duel. It's all local, all for fun.

## Run it

On the host computer (needs Node.js, one time):

```bash
npm install      # grabs the tiny `ws` dependency
npm start        # or: node server.js
```

It prints a couple of addresses, e.g.:

```
On this computer:   http://localhost:8080
On the same Wi-Fi:  http://192.168.1.5:8080
```

Everyone on the **same Wi-Fi** opens one of those in a browser. That's it —
you'll see each other walking around.

## How to duel

- **Walk into another player** to challenge them.
- They get a prompt → **Battle!** or **Not now**.
- Best of 3 rounds. Each round you **secretly pick** a Pokémon from your team;
  reveal together; the **type chart** decides the round (a quick verdict card
  shows why). First to 2 wins.
- Both Pokémon **dance** at the end no matter who won. The winner pockets a
  little bonus (**+10 gold, +2 PokéBalls**); the loser loses nothing.

## How it works (and what it deliberately *isn't*)

- The server is a **dumb relay** — it serves the files and forwards JSON
  between players. It has **zero game logic**.
- Clients are **fully authoritative**. A round's winner is a *pure function* of
  both players' picks + a shared random seed, so both screens always agree
  without anyone refereeing. Nothing is staked, so there's nothing to cheat.
- Only works when the game is **served by the party server**. The public
  (static) build has no relay, so multiplayer simply stays dormant and
  single-player is unchanged.
