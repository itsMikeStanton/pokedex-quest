'use strict';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════
const TILE_SIZE      = 32;
const MAP_COLS       = 20;
const MAP_ROWS       = 14;
const WILD_TIMEOUT   = 11000;  // ms a wild Pokémon stays on its tile before fleeing
const TIMER_MS       = 9000;   // seconds to choose during a taming encounter
const MOVE_INTERVAL  = 190;    // ms between repeated steps
const MOVE_ANIM_MS   = 140;    // ms to slide between tiles
const BUMP_ANIM_MS   = 220;    // ms for wall-bounce animation
const SAVE_KEY       = 'lukeymon_v3';

const T = { PATH: 0, GRASS: 1, TREE: 2, WATER: 3, SAND: 4, CITY: 5, SHOP: 6, LAVA: 7, ICE: 8, BOULDER: 9, CAVE: 10, CAVE_ENTRANCE: 11, HOUSE: 12, FLOOR: 13, WALL: 14, DOOR: 15, HOSPITAL: 16, GYM: 17 };

// ═══════════════════════════════════════════════════
// ZONE MAPS
// ═══════════════════════════════════════════════════
// Zones, connections and tile layouts are authored in editor.html and stored
// in world.js (WORLD). ZONE_INFO/EXITS/MAPS are derived from it below.

// ═══════════════════════════════════════════════════
// ZONE / EXIT / BARRIER DATA
// ═══════════════════════════════════════════════════
// Zones and connections are authored in editor.html and stored in world.js.
const ZONE_INFO = WORLD.zones;
const EXITS = WORLD.exits;
// Point-portals (cave mouths etc.): step onto (from, fx, fy) to warp to (to, tx, ty).
const PORTALS = WORLD.portals || [];

// ─── Building interiors ──────────────────────────────
// Home & the Poké Mart are authored in world.js now (so the editor can manage
// them). This is just a FALLBACK for an older world.js that predates them: it
// appends the interiors at the next free ids — never the fixed 9/10 — so it can
// never collide with zones the editor added.
(function setupInteriors() {
  if (WORLD.zones.some(z => z.interior)) return;     // already defined in world.js
  const F = T.FLOOR, W = T.WALL, D = T.DOOR;
  function room(cols, rows, door) {
    const m = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++)
        row.push(x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? W : F);
      m.push(row);
    }
    m[door[1]][door[0]] = D;
    return m;
  }
  const homeId = WORLD.zones.length;
  WORLD.zones.push({ id: homeId, name: 'Home', cols: 11, rows: 9, base: F, mapCol: null, mapRow: null, icon: '🏠', interior: true });
  WORLD.maps[homeId] = room(11, 9, [5, 8]);
  const martId = WORLD.zones.length;
  WORLD.zones.push({ id: martId, name: 'Poké Mart', cols: 11, rows: 8, base: F, mapCol: null, mapRow: null, icon: '🏪', interior: true });
  WORLD.maps[martId] = room(11, 8, [5, 7]);

  WORLD.maps[0][6][8] = T.HOUSE;   // your home, placed in the Meadow (the shop tile already exists)

  WORLD.portals.push(
    { from: 0,      fx: 8,  fy: 6, to: homeId, tx: 5,  ty: 7 },   // step on the house → inside home
    { from: homeId, fx: 5,  fy: 8, to: 0,      tx: 8,  ty: 7 },   // home door → in front of the house
    { from: 0,      fx: 10, fy: 5, to: martId, tx: 5,  ty: 6 },   // step on the shop → inside the mart
    { from: martId, fx: 5,  fy: 7, to: 0,      tx: 10, ty: 6 },   // mart door → in front of the shop
  );
})();

const BARRIERS = {
  log:   { needsType: 'Fire',     hint: 'Bring a 🔥 Fire Pokémon as your buddy to burn these logs!',       cleared: '🔥 Your Fire buddy burns away the logs!',      sign: '🔥' },
  rock:  { needsType: 'Water',    hint: 'Bring a 💧 Water Pokémon as your buddy to wash these rocks!',     cleared: '💧 Your Water buddy washes the rocks aside!',  sign: '💧' },
  fence: { needsType: 'Electric', hint: 'Bring a ⚡ Electric Pokémon as your buddy to short the fence!',   cleared: '⚡ Your Electric buddy shorts out the fence!', sign: '⚡' },
  lava:  { needsType: 'Water',    hint: 'Bring a 💧 Water Pokémon as your buddy to cool the lava flow!',   cleared: '💧 Your Water buddy cools the lava flow!',     sign: '💧' },
  vine:  { needsType: 'Grass',    hint: 'Bring a 🌿 Grass Pokémon as your buddy to cut through the vines!', cleared: '🌿 Your Grass buddy cuts through the vines!',  sign: '🌿' },
  frost: { needsType: 'Fire',     hint: 'Bring a 🔥 Fire Pokémon as your buddy to melt the ice wall!',     cleared: '🔥 Your Fire buddy melts the ice wall!',       sign: '🔥' },
  sand:  { needsType: 'Ground',   hint: 'Bring a 🌍 Ground Pokémon as your buddy to clear the sand wall!', cleared: '🌍 Your Ground buddy clears the sand wall!',   sign: '🌍' },
};

// ── FIELD NOTES ──────────────────────────────────────
// Tips the player picks up as they play, collected into a notepad they can
// review any time. Barrier tips are generated from BARRIERS below.
const BARRIER_LABEL = {
  log:'Fallen logs', rock:'River rocks', fence:'Electric fence',
  lava:'Lava flow', vine:'Thick vines', frost:'Ice wall', sand:'Sand wall',
};
const STATIC_TIPS = [
  { id:'befriend', cat:'Training', icon:'🍎', title:'Winning hearts',
    text:'Wild Lukeymon want kindness, not force. Feed 🍎, Pet 🤚 or Play ⚽ to read their mood and fill the heart meter — then throw a Ball.' },
  { id:'buddy', cat:'Training', icon:'🐾', title:'Pick a buddy',
    text:'Set a buddy from the Pokédex (tap the ❤️) or the HUD. It follows you, and its TYPE is the key to barriers, surfing and cave-light.' },
  { id:'battles', cat:'Battles', icon:'⚔️', title:'Send the counter',
    text:'Legendary guardians demand a TYPE each round. Send out a buddy whose type is SUPER-EFFECTIVE against it to win the exchange.' },
  { id:'ice', cat:'Ice', icon:'🧊', title:'Slippery ice',
    text:'Step on ice without an Ice-type buddy and you slide straight across until something stops you. An Ice buddy keeps your footing so you can walk.' },
  { id:'water', cat:'Water', icon:'🌊', title:'Surf the water',
    text:'Deep water blocks the way — unless a Water-type buddy is following. Then you hop on and surf right across.' },
  { id:'cave', cat:'Exploring', icon:'🕯️', title:'Dark caves',
    text:'Caves are pitch black. Bring a glowing buddy (a Fire-type works well) to light up the path around you.' },
];
const TIP_CATEGORIES = ['Training', 'Battles', 'Barriers', 'Ice', 'Water', 'Exploring'];
function barrierTip(key) {
  const b = BARRIERS[key];
  return { id:'barrier_'+key, cat:'Barriers', icon:b.sign,
           title:BARRIER_LABEL[key] || (b.needsType+' barrier'), text:b.hint };
}
function allTips() {
  return [...STATIC_TIPS, ...Object.keys(BARRIERS).map(barrierTip)];
}

// Type effectiveness — for a demanded type, which attacking types are super-effective
// against it (used by the legendary/Team-Rocket "send a counter" battles).
const BEATEN_BY = {
  Normal:   ['Fighting'],
  Fire:     ['Water', 'Ground', 'Rock'],
  Water:    ['Electric', 'Grass'],
  Electric: ['Ground'],
  Grass:    ['Fire', 'Ice', 'Poison', 'Flying', 'Bug'],
  Ice:      ['Fire', 'Fighting', 'Rock'],
  Fighting: ['Flying', 'Psychic', 'Fairy'],
  Poison:   ['Ground', 'Psychic'],
  Ground:   ['Water', 'Grass', 'Ice'],
  Flying:   ['Electric', 'Ice', 'Rock'],
  Psychic:  ['Bug', 'Ghost'],
  Bug:      ['Fire', 'Flying', 'Rock'],
  Rock:     ['Water', 'Grass', 'Fighting', 'Ground'],
  Ghost:    ['Ghost'],
  Dragon:   ['Ice', 'Dragon', 'Fairy'],
  Fairy:    ['Poison'],
};

// World-map layout: schematic grid position + icon per zone, from world.js.
// Any zone without a position is auto-placed so new zones still appear.
const ZONE_MAP = {};
(() => {
  let auto = 1;
  WORLD.zones.forEach(z => {
    if (z.cave || z.interior) return;   // caves & building interiors aren't world-map zones
    if (z.mapCol != null && z.mapRow != null) {
      ZONE_MAP[z.id] = { col: z.mapCol, row: z.mapRow, icon: z.icon || '🗺️' };
    } else {
      ZONE_MAP[z.id] = { col: auto++, row: 6, icon: z.icon || '🗺️' };
    }
  });
})();

// Optional elbow routing for mini-map connectors, keyed by "minId-maxId".
// Empty now that the world is planar — straight lines never cross a node.
const EDGE_ROUTES = {};

const GRASS_PICKUP_CHANCE = 0.20; // chance per grass step to find a ball or coin

// ═══════════════════════════════════════════════════
// ZONE MAPS
// ═══════════════════════════════════════════════════
// Tile ids per cell come from world.js (WORLD.maps), authored in editor.html.
const OBSTACLE_TILES = new Set([T.TREE, T.WATER, T.LAVA, T.BOULDER, T.WALL]);   // ICE is walkable but slippery
function isObstacleTile(t) { return OBSTACLE_TILES.has(t); }
function isWalkableTile(t) { return !OBSTACLE_TILES.has(t); }

// Fallback for a zone missing/mismatched in WORLD.maps: a blank walkable
// field ringed by trees, with the exit openings carved out.
function blankZone(zoneId) {
  const { cols, rows } = ZONE_INFO[zoneId];
  const g = Array.from({ length: rows }, () => new Array(cols).fill(T.PATH));
  for (let c = 0; c < cols; c++) { g[0][c] = T.TREE; g[rows - 1][c] = T.TREE; }
  for (let r = 0; r < rows; r++) { g[r][0] = T.TREE; g[r][cols - 1] = T.TREE; }
  EXITS.filter(e => e.from === zoneId).forEach(e => e.pos.forEach(p => {
    if      (e.dir === 'south') g[rows - 1][p] = T.PATH;
    else if (e.dir === 'north') g[0][p]        = T.PATH;
    else if (e.dir === 'west')  g[p][0]        = T.PATH;
    else                        g[p][cols - 1] = T.PATH;
  }));
  return g;
}

// Find the nearest walkable cell to (x,y) — used to rescue a saved player
// position that a regenerated layout may have turned into an obstacle.
function nearestWalkable(zone, x, y) {
  const { cols, rows } = ZONE_INFO[zone];
  const m = MAPS[zone];
  const inB = (px, py) => px >= 0 && px < cols && py >= 0 && py < rows;
  if (inB(x, y) && isWalkableTile(m[y][x])) return [x, y];
  for (let rad = 1; rad < Math.max(cols, rows); rad++)
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const nx = x + dx, ny = y + dy;
        if (inB(nx, ny) && isWalkableTile(m[ny][nx])) return [nx, ny];
      }
  return [x, y];
}

// Built from the authored layouts (world.js → WORLD.maps); a zone's map is used
// only when its dimensions match, otherwise it falls back to a blank zone.
const MAPS = ZONE_INFO.map((z) => {
  const cm = (WORLD.maps && WORLD.maps[z.id]) || null;
  if (Array.isArray(cm) && cm.length === z.rows && Array.isArray(cm[0]) && cm[0].length === z.cols)
    return cm.map(row => row.slice());
  return blankZone(z.id);
});

// ═══════════════════════════════════════════════════
// COLLECTIBLES (badges) & NPCs
// ═══════════════════════════════════════════════════
// Fixed treasures hidden in the faraway lands — one badge per outer zone,
// just waiting to be found. Positions below are a preferred spot; they snap
// to the nearest walkable tile of the (procedural) zone at load.
const COLLECTIBLES = [
  { id: 'badge_volcano', zone: 4, x: 10, y: 14, emoji: '🎖️', name: 'Ember Badge' },
  { id: 'badge_forest',  zone: 5, x: 33, y:  7, emoji: '🏵️', name: 'Thicket Badge' },
  { id: 'badge_ice',     zone: 6, x: 10, y:  9, emoji: '🏅', name: 'Glacier Badge' },
  { id: 'badge_desert',  zone: 7, x: 30, y:  7, emoji: '🥇', name: 'Dune Badge' },
  // Awarded automatically — not placed in the world.
  { id: 'badge_gym',  auto: true, emoji: '🥊', name: 'Rumble Badge', hint: 'Beat the City Gym Leader' },
  { id: 'badge_trio', auto: true, emoji: '🦅', name: 'Trio Badge', hint: 'Catch all 3 legendary birds' },
];

// Friendly characters you can walk up to and talk with. They stand on a tile
// (snapped to an open walkable spot) and block it — bump into them to chat.
const NPCS = [
  { zone: 0, x: 5, y: 4, emoji: '🧓', name: 'Prof. Birch', gift: 40, art: 'professor', lines: () => [
    `Good to see you out and about, ${saveName}!`,
    'Befriend a wild Lukeymon with the action it wants — Feed 🍎, Pet 🤚, or Play ⚽.',
    `Some paths are blocked, ${saveName}. Catch the right TYPE, then WALK INTO the barrier to clear it!`,
  ] },
  { zone: 2, x: 6, y: 4, emoji: '👮', name: 'Officer', gift: 25, art: 'officer', lines: () => [
    `Keeping the city safe, ${saveName}.`,
    'They say rare BADGES are hidden out in the faraway lands... Volcano, Desert, the icy caves.',
  ] },
  { zone: 1, x: 10, y: 18, emoji: '🏄', name: 'Surfer', gift: 25, art: 'surfer', lines: () => [
    `Waves are perfect today, ${saveName}!`,
    'Water Lukeymon really love a gentle pet. 🤚',
  ] },
  { zone: 5, x: 20, y: 7, emoji: '🧙', name: 'Hermit', gift: 50, art: 'hermit', lines: () => [
    `...you wandered this deep into the forest, ${saveName}? Impressive.`,
    `Collect every badge AND every Lukeymon, ${saveName}, and you will be a true master.`,
  ] },
  { zone: 1, x: 6, y: 6, emoji: '🧢', name: 'Ash', gift: 30, art: 'ash', lines: () => {
    const landDone = LAND_BADGES.filter(id => collected.has(id)).length;
    if (caughtIds.size === POKEMON_DATA.length)
      return [`You caught them ALL, ${saveName}?! You're a true Lukeymon Master! 🌟`];
    if (wonGame)
      return ['You\'re the CHAMPION now! 🏆',
              'Still out there: the legendary birds, Mew & Mewtwo, and a full Pokédex.',
              'The adventure\'s not over — go get \'em!'];
    if (landDone >= 1)
      return [`${landDone}/4 badges — you're on a roll!`,
              'Team Rocket\'s still guarding the legendary birds in the far zones.'];
    return [`Hey ${saveName}! I'm Ash — gonna befriend 'em all!`,
            'TEAM ROCKET is out in the wild zones hassling the legendary birds!',
            'Beat the Rocket guarding one, then out-smart the bird with a SUPER-EFFECTIVE type.'];
  } },
  { zone: 2, x: 11, y: 7, emoji: '👧', name: 'Misty', gift: 30, art: 'misty', lines: () => {
    const birds = [144, 145, 146].filter(id => caughtIds.has(id)).length;
    if (birds === 3)
      return [`You tamed all three legendary birds, ${saveName}?! Amazing!`,
              'They say a tiny pink Lukeymon named Mew appears once the dex is nearly full... 🔮'];
    return [`I'm Misty, the Water-type ace — nice to meet you, ${saveName}!`,
            'A Water buddy lets you surf across deep water. 🌊',
            'Moltres throwing Fire? Douse it with Water, Rock or Ground!'];
  } },
  { zone: 5, x: 12, y: 7, emoji: '🧑‍🍳', name: 'Brock', gift: 30, art: 'brock', lines: () => {
    if (wonGame)
      return [`Champion already, ${saveName}? Let me cook your team a victory feast! 🍳`,
              'Remember — only GROUND truly shrugs off Zapdos\'s Electric.'];
    return [`Brock here — I keep the team well fed, ${saveName}.`,
            "Zapdos hurls Electricity... only GROUND just shrugs it off.",
            "Articuno's Ice melts before Fire, Fighting or Rock."];
  } },

  // ── Inside your home (zone 9) ──
  { zone: 9, x: 2, y: 2, emoji: '👩', name: 'Mom', gift: 30, art: 'mom', lines: () => {
    if (wonGame) return [`My little Champion, ${saveName}! So proud of you. 🏆`, 'Rest up any time, sweetie.'];
    return [`Off on your adventure, ${saveName}? Be safe out there! 💗`,
            'Tip: your buddy\'s TYPE clears blocked paths — Fire burns logs, Water washes rocks…',
            'Come home to visit whenever you like.'];
  } },
  // (The home is now furnished with real décor props — see WORLD.decor zone 9.)

  // ── Inside the Poké Mart (zone 10) ──
  { zone: 10, x: 5, y: 3, emoji: '🧑‍💼', name: 'Clerk', gift: 0, shop: true, art: 'clerk', lines: ['Welcome to the Poké Mart!'] },

  // ── Inside the Pokémon Hospital (zone 11) ──
  // Resting gives a daily bundle of free PokéBalls (your team has no HP to heal).
  { zone: 11, x: 5, y: 3, emoji: '🧑‍⚕️', name: 'Nurse Joy', gift: 0, lines: () => {
    const today = todayKey();
    if (lastHeal !== today) {
      lastHeal = today; balls += HEAL_BALLS; updateHud(); saveGame();
      return ['Welcome to the Pokémon Hospital! 💗',
              'Your Lukéymon look wonderfully happy and rested.',
              `Here — take some PokéBalls, on the house! (+${HEAL_BALLS} ⚪)`];
    }
    return ['Welcome back! Your Lukéymon are happy and well. 💗',
            'Come see me again tomorrow for more free PokéBalls!'];
  } },
  { zone: 11, x: 1, y: 1, emoji: '🪑', name: 'Waiting Bench', gift: 0, lines: ['A comfy bench for resting trainers.'] },

  // ── Inside the Gym (zone 12) ──
  { zone: 12, x: 6, y: 2, emoji: '🥋', name: 'Rocky', gift: 0, gymLeader: true,
    leaderName: 'Leader Rocky', battleEmoji: '🥋', lineup: [74, 75, 95],   // Geodude → Graveler → Onix
    lines: () => collected.has('badge_gym')
      ? [`Good to see you again, ${saveName}!`, 'That Rumble Badge looks great on you. Keep training!']
      : ['So you want to challenge my Gym, eh?', 'Bring it on!'] },
  { zone: 12, x: 2, y: 6, emoji: '🧑‍🏫', name: 'Dojo Master', gift: 0, dojo: true,
    lines: ['Train as much as you like! Send out a Lukéymon each round — win or lose, the practice helps it grow.'] },
];

// Team Rocket grunts guarding each legendary bird's lair. A grunt is present only
// until its bird is caught. Bump into one → Rocket mini-boss battle → bird battle.
const ROCKETS = [
  { zone: 6, x: 10, y: 6, name: 'Jessie', emoji: '👩‍🎤', art: 'rocket_f', bird: 144 }, // Ice Cave → Articuno
  { zone: 3, x: 10, y: 7, name: 'James',  emoji: '👨‍🎤', art: 'rocket_m', bird: 145 }, // Highlands → Zapdos
  { zone: 4, x: 10, y: 9, name: 'Meowth', emoji: '😼',   bird: 146 }, // Volcano → Moltres
];
// A legendary lair tile (still active until its bird is caught). Before the
// guard is beaten it shows Team Rocket; after, the bird itself awaits a rematch.
function lairAt(zone, x, y) {
  return ROCKETS.find(r => r.zone === zone && r.x === x && r.y === y && !caughtIds.has(r.bird)) || null;
}

// Snap each entity to a reachable tile. Collectibles just need a walkable tile;
// NPCs prefer an "open" tile (3+ walkable neighbours) so they don't wall a path.
function isOpenTile(zone, x, y) {
  const { cols, rows } = ZONE_INFO[zone];
  const m = MAPS[zone];
  if (x < 1 || x >= cols - 1 || y < 1 || y >= rows - 1 || isObstacleTile(m[y][x])) return false;
  let n = 0;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if (isWalkableTile(m[y + dy][x + dx])) n++;
  return n >= 3;
}
function nearestOpenTile(zone, x, y) {
  const { cols, rows } = ZONE_INFO[zone];
  if (isOpenTile(zone, x, y)) return [x, y];
  for (let rad = 1; rad < Math.max(cols, rows); rad++)
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++)
        if (isOpenTile(zone, x + dx, y + dy)) return [x + dx, y + dy];
  return nearestWalkable(zone, x, y);
}
NPCS.forEach(n => { [n.x, n.y] = nearestOpenTile(n.zone, n.x, n.y); });
COLLECTIBLES.forEach(c => { if (!c.auto) [c.x, c.y] = nearestWalkable(c.zone, c.x, c.y); });

// ═══════════════════════════════════════════════════
// EVOLUTION STONES
// ═══════════════════════════════════════════════════
// Stones are hidden out in the world like badges. Show a caught Pokémon a
// matching Stone from its Pokédex page to evolve it — the evolved form joins
// your dex (and, since types change, can unlock new buddy abilities!).
const STONES = {
  thunder: { name: 'Thunder Stone', emoji: '⚡' },
  fire:    { name: 'Fire Stone',    emoji: '🔥' },
  water:   { name: 'Water Stone',   emoji: '💧' },
  leaf:    { name: 'Leaf Stone',    emoji: '🍃' },
  moon:    { name: 'Moon Stone',    emoji: '🌙' },
};
const STONE_EVOS = [
  { from: 25,  stone: 'thunder', to: 26  },  // Pikachu    → Raichu
  { from: 133, stone: 'thunder', to: 135 },  // Eevee      → Jolteon
  { from: 37,  stone: 'fire',    to: 38  },  // Vulpix     → Ninetales
  { from: 58,  stone: 'fire',    to: 59  },  // Growlithe  → Arcanine
  { from: 133, stone: 'fire',    to: 136 },  // Eevee      → Flareon
  { from: 133, stone: 'water',   to: 134 },  // Eevee      → Vaporeon
  { from: 90,  stone: 'water',   to: 91  },  // Shellder   → Cloyster
  { from: 120, stone: 'water',   to: 121 },  // Staryu     → Starmie
  { from: 61,  stone: 'water',   to: 62  },  // Poliwhirl  → Poliwrath
  { from: 70,  stone: 'leaf',    to: 71  },  // Weepinbell → Victreebel
  { from: 44,  stone: 'leaf',    to: 45  },  // Gloom      → Vileplume
  { from: 102, stone: 'leaf',    to: 103 },  // Exeggcute  → Exeggutor
  { from: 35,  stone: 'moon',    to: 36  },  // Clefairy   → Clefable
  { from: 39,  stone: 'moon',    to: 40  },  // Jigglypuff → Wigglytuff
  { from: 30,  stone: 'moon',    to: 31  },  // Nidorina   → Nidoqueen
  { from: 33,  stone: 'moon',    to: 34  },  // Nidorino   → Nidoking
];
// Stones are REUSABLE keepsakes — one of each is hidden in a thematic zone (snaps
// to the nearest walkable tile) and unlocks every evolution of that type.
const STONE_FINDS = [
  { id: 'stone_fire',    zone: 4, x: 10, y: 13, stone: 'fire'    },  // Volcano
  { id: 'stone_water',   zone: 1, x: 10, y: 30, stone: 'water'   },  // Beach
  { id: 'stone_thunder', zone: 3, x: 8,  y: 9,  stone: 'thunder' },  // Highlands (Zapdos country)
  { id: 'stone_leaf',    zone: 5, x: 28, y: 6,  stone: 'leaf'    },  // Dark Forest
  { id: 'stone_moon',    zone: 8, x: 12, y: 8,  stone: 'moon'    },  // Hidden Cave (Mt. Moon!)
];
STONE_FINDS.forEach(s => { [s.x, s.y] = nearestWalkable(s.zone, s.x, s.y); });
function stoneFindAt(zone, x, y) {
  return STONE_FINDS.find(s => s.zone === zone && s.x === x && s.y === y) || null;
}
function evolutionsFor(pokeId) { return STONE_EVOS.filter(r => r.from === pokeId); }

// ── Non-stone evolutions ─────────────────────────────
// method 'buddy'  → walk `cost` steps with it as your active buddy.
// method 'battle' → send it out in `cost` battles (win OR lose — just being used).
// method 'dance'  → a multiplayer "dance party" (handled separately; no step/use cost).
const EVOS = [
  // 3-stage lines: a quick bond for the first form, then proven in battle for the final.
  { from: 1,  to: 2,  method: 'buddy',  cost: 15 }, { from: 2,  to: 3,  method: 'battle', cost: 2 }, // Bulbasaur line
  { from: 4,  to: 5,  method: 'buddy',  cost: 15 }, { from: 5,  to: 6,  method: 'battle', cost: 2 }, // Charmander line
  { from: 7,  to: 8,  method: 'buddy',  cost: 15 }, { from: 8,  to: 9,  method: 'battle', cost: 2 }, // Squirtle line
  { from: 10, to: 11, method: 'buddy',  cost: 15 }, { from: 11, to: 12, method: 'buddy',  cost: 25 }, // Caterpie line
  { from: 13, to: 14, method: 'buddy',  cost: 15 }, { from: 14, to: 15, method: 'buddy',  cost: 25 }, // Weedle line
  { from: 16, to: 17, method: 'buddy',  cost: 15 }, { from: 17, to: 18, method: 'battle', cost: 2 }, // Pidgey line
  { from: 147, to: 148, method: 'battle', cost: 1 }, { from: 148, to: 149, method: 'battle', cost: 2 }, // Dratini line
  // level steps that then need a stone (the stone branch lives in STONE_EVOS)
  { from: 29, to: 30, method: 'buddy', cost: 15 },  // Nidoran♀ → Nidorina
  { from: 32, to: 33, method: 'buddy', cost: 15 },  // Nidoran♂ → Nidorino
  { from: 43, to: 44, method: 'buddy', cost: 15 },  // Oddish    → Gloom
  { from: 69, to: 70, method: 'buddy', cost: 15 },  // Bellsprout→ Weepinbell
  { from: 60, to: 61, method: 'buddy', cost: 15 },  // Poliwag   → Poliwhirl
  // single-step buddy evolutions (companions)
  { from: 19, to: 20, method: 'buddy', cost: 15 }, { from: 21, to: 22, method: 'buddy', cost: 15 },
  { from: 41, to: 42, method: 'buddy', cost: 15 }, { from: 46, to: 47, method: 'buddy', cost: 15 },
  { from: 48, to: 49, method: 'buddy', cost: 15 }, { from: 50, to: 51, method: 'buddy', cost: 15 },
  { from: 52, to: 53, method: 'buddy', cost: 15 }, { from: 54, to: 55, method: 'buddy', cost: 15 },
  { from: 72, to: 73, method: 'buddy', cost: 15 }, { from: 79, to: 80, method: 'buddy', cost: 15 },
  { from: 81, to: 82, method: 'buddy', cost: 15 }, { from: 84, to: 85, method: 'buddy', cost: 15 },
  { from: 86, to: 87, method: 'buddy', cost: 15 }, { from: 88, to: 89, method: 'buddy', cost: 15 },
  { from: 96, to: 97, method: 'buddy', cost: 15 }, { from: 100, to: 101, method: 'buddy', cost: 15 },
  { from: 109, to: 110, method: 'buddy', cost: 15 }, { from: 116, to: 117, method: 'buddy', cost: 15 },
  { from: 118, to: 119, method: 'buddy', cost: 15 },
  // single-step battle evolutions (fighters, fierce ones, fossils)
  { from: 129, to: 130, method: 'battle', cost: 1 }, { from: 138, to: 139, method: 'battle', cost: 1 },
  { from: 140, to: 141, method: 'battle', cost: 1 }, { from: 111, to: 112, method: 'battle', cost: 1 },
  { from: 104, to: 105, method: 'battle', cost: 1 }, { from: 56,  to: 57,  method: 'battle', cost: 1 },
  { from: 23,  to: 24,  method: 'battle', cost: 1 }, { from: 27,  to: 28,  method: 'battle', cost: 1 },
  { from: 77,  to: 78,  method: 'battle', cost: 1 }, { from: 98,  to: 99,  method: 'battle', cost: 1 },
  // first step of the trade-mons = battle (their final form comes from the dance party)
  { from: 66, to: 67, method: 'battle', cost: 1 }, { from: 74, to: 75, method: 'battle', cost: 1 },
  { from: 63, to: 64, method: 'battle', cost: 1 }, { from: 92, to: 93, method: 'battle', cost: 1 },
  // dance-party (former trade) evolutions — multiplayer, no battle, nothing lost
  { from: 64, to: 65, method: 'dance' }, { from: 67, to: 68, method: 'dance' },
  { from: 75, to: 76, method: 'dance' }, { from: 93, to: 94, method: 'dance' },
];
function evosFor(pokeId) { return EVOS.filter(r => r.from === pokeId); }
function evoProgress(r) { return r.method === 'buddy' ? (bondSteps[r.from] || 0) : r.method === 'battle' ? (battleUses[r.from] || 0) : 0; }
function evoReady(r) { return r.method !== 'dance' && evoProgress(r) >= r.cost; }

// One-time "ready to evolve!" nudge so you don't have to dig in the Pokédex to notice.
const evoNotified = new Set();
function checkEvoNotify() {
  for (const r of EVOS) {
    if (r.method === 'dance' || !caughtIds.has(r.from) || caughtIds.has(r.to) || !evoReady(r)) continue;
    const key = r.from + '>' + r.to;
    if (evoNotified.has(key)) continue;
    evoNotified.add(key);
    const fp = POKEMON_DATA.find(p => p.id === r.from);
    showMessage(`✨ ${fp ? fp.name : 'A Lukéymon'} is ready to evolve! Open its Pokédex.`);
    beep(660, 0.1, 0.1); setTimeout(() => beep(880, 0.12, 0.12), 110);
    break;   // one nudge at a time
  }
}
function tickBond(id) { bondSteps[id] = (bondSteps[id] || 0) + 1; checkEvoNotify(); }

function npcAt(zone, x, y) {
  return NPCS.find(n => n.zone === zone && n.x === x && n.y === y) || null;
}
function collectibleAt(zone, x, y) {
  return COLLECTIBLES.find(c => c.zone === zone && c.x === x && c.y === y) || null;
}

// ─── Legendary roamers (Mew / Mewtwo) ────────────────
const FARAWAY_ZONES = [4, 5, 6, 7]; // Volcano, Dark Forest, Ice Cave, Desert

// Whether every Pokémon except Mewtwo has been caught (gates Mewtwo's arrival).
function allOthersCaught() {
  return POKEMON_DATA.every(p => p.legend === 'mewtwo' || caughtIds.has(p.id));
}

// A random open spot in a faraway zone (optionally avoiding `notZone`).
function farawaySpot(notZone) {
  const zones = FARAWAY_ZONES.filter(z => z !== notZone);
  const zone = zones[Math.floor(Math.random() * zones.length)];
  const { cols, rows } = ZONE_INFO[zone];
  const [x, y] = nearestOpenTile(zone, 2 + Math.floor(Math.random() * (cols - 4)),
                                       2 + Math.floor(Math.random() * (rows - 4)));
  return { zone, x, y };
}

// Build the active roamer list from the current catch state (+ saved positions).
function initRoamers() {
  roamers = [];
  const saved = {};
  if (loadedRoamers) loadedRoamers.forEach(r => { saved[r.legend] = r; });

  POKEMON_DATA.forEach(p => {
    if (!p.legend || caughtIds.has(p.id)) return;
    if (p.legend === 'mewtwo' && !allOthersCaught()) return; // Mewtwo only at the end
    const s = saved[p.legend];
    const pos = (s && FARAWAY_ZONES.includes(s.zone)) ? s : farawaySpot();
    roamers.push({ legend: p.legend, pokeId: p.id, zone: pos.zone, x: pos.x, y: pos.y });
  });
}

function roamerAt(zone, x, y) {
  return roamers.find(r => r.zone === zone && r.x === x && r.y === y) || null;
}

// Add any newly-eligible roamer (e.g. Mewtwo once everything else is caught)
// and drop any that have been captured — without moving the others.
function refreshRoamers() {
  roamers = roamers.filter(r => !caughtIds.has(r.pokeId));
  POKEMON_DATA.forEach(p => {
    if (!p.legend || caughtIds.has(p.id)) return;
    if (p.legend === 'mewtwo' && !allOthersCaught()) return;
    if (!roamers.some(r => r.legend === p.legend)) {
      const pos = farawaySpot();
      roamers.push({ legend: p.legend, pokeId: p.id, zone: pos.zone, x: pos.x, y: pos.y });
    }
  });
}

// On a failed encounter the legendary slips away to another faraway land.
function relocateRoamer(r) {
  const pos = farawaySpot(r.zone);
  r.zone = pos.zone; r.x = pos.x; r.y = pos.y;
  saveGame();
}


// Sprite color data for the player (top-down view, 8×10 logical pixels)
const PLAYER_PALETTE = {
  H: '#d83028',  // hat
  S: '#f8d090',  // skin
  B: '#3858c8',  // shirt blue
  P: '#2040a0',  // pants
  E: '#202020',  // eyes
  _: null,        // transparent
};
// Rows of 8 color keys. Scaled 3× when drawn (24×30px, centered in 32×32 tile).
const PLAYER_SPRITE = {
  down: [
    '_ H H H H H H _',
    '_ H H H H H H _',
    '_ S S S S S S _',
    '_ S E S S E S _',
    '_ S S S S S S _',
    '_ B B B B B B _',
    '_ B B B B B B _',
    '_ B B B B B B _',
    'P P _ _ _ _ P P',
    'P P _ _ _ _ P P',
  ],
  up: [
    '_ H H H H H H _',
    '_ H H H H H H _',
    '_ S S S S S S _',
    '_ S S S S S S _',
    '_ S S S S S S _',
    '_ B B B B B B _',
    '_ B B B B B B _',
    '_ B B B B B B _',
    'P P _ _ _ _ P P',
    'P P _ _ _ _ P P',
  ],
  left: [
    '_ H H H H H _ _',
    '_ H H H H H _ _',
    '_ S S S S S _ _',
    '_ E S S S S _ _',
    '_ S S S S S _ _',
    '_ B B B B B _ _',
    '_ B B B B B _ _',
    '_ B B B B B _ _',
    'P P _ _ P P _ _',
    'P P _ _ P P _ _',
  ],
  right: [
    '_ _ H H H H H _',
    '_ _ H H H H H _',
    '_ _ S S S S S _',
    '_ _ S S S S E _',
    '_ _ S S S S S _',
    '_ _ B B B B B _',
    '_ _ B B B B B _',
    '_ _ B B B B B _',
    '_ _ P P _ _ P P',
    '_ _ P P _ _ P P',
  ],
};

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let gameState   = 'title';
let playerX     = 10;
let playerY     = 7;
let playerDir   = 'down';
let playerStep  = 0;   // toggles 0/1 for walk animation
let lastMoveTs  = 0;
let keys        = {};
let kamiBuffer  = [];
let caughtIds      = new Set();
let seenIds        = new Set();    // species encountered (shown as a silhouette in the dex)
let balls          = 5;
let masterBalls    = 0;        // for capturing Mew / Mewtwo only
let coins          = 0;
let roamers        = [];       // active legendary roamers: { legend, pokeId, zone, x, y }
let loadedRoamers  = null;     // roamer positions restored from save
let currentLegend  = null;     // roamer being engaged in the current encounter/battle
let pendingMsg     = null;     // a message to surface when the player returns to the world
let encHappy       = false;
let encTries       = 0;       // wrong guesses this encounter (one gentle retry allowed)
let wildPoke       = null;   // { poke, x, y, zone, expireAt } — active wild on map
let spawnTimerId   = null;   // next spawn setTimeout id
let expireTimerId  = null;   // current wild's disappear setTimeout id
let wildTrainer    = null;   // { x, y, zone, name, emoji } — a wandering trainer to battle
let trainerTimerId = null;   // wandering trainer's wander-off setTimeout id
let currentPoke = null;
let timerId     = null;
let timerStart  = 0;
let canvas, ctx;
let audioCtx    = null;
let audioUnlocked = false;   // iOS needs a silent buffer played inside a gesture
let muted       = false;   // global (not per-slot) audio mute
let currentZone = 0;
let unlockedBarriers = new Set();  // barrier keys the player has physically cleared
let collected = new Set();         // ids of badges/collectibles found
let stones = {};                   // evolution-stone inventory { fire: n, water: n, … }
let foundStones = new Set();       // ids of stone finds already picked up
let bondSteps = {};                // pokeId → steps walked as your buddy (buddy evolutions)
let battleUses = {};               // pokeId → times sent out in a battle (battle evolutions)
let lastHeal  = '';                // date key of the last free Hospital rest (daily PokéBalls)
const HEAL_BALLS = 5;              // free PokéBalls handed out per day at the Hospital
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
let metNPCs   = new Set();         // names of NPCs already greeted (one-time gift)
let pendingGift = 0;               // coins held back for the end-of-conversation reveal
let knownTips = new Set();         // ids of field-notes tips the player has discovered
let notesUnread = false;           // a new tip is waiting in the notepad
let rocketDefeated = new Set();    // bird ids whose Team Rocket guard is already beaten
let wonGame = false;               // Champion victory (4 land badges) already celebrated
let pendingChampion = false;       // queue the Champion screen after the BADGE GET screen
const LAND_BADGES = ['badge_volcano', 'badge_forest', 'badge_ice', 'badge_desert'];
function landBadgesDone() { return LAND_BADGES.every(id => collected.has(id)); }
let currentNPC = null;             // NPC whose dialog is open
let npcLineIdx = 0;

// ── Animation state ─────────────────────────────────
let fromPx      = { x: 10 * TILE_SIZE, y: 7 * TILE_SIZE };
let moveAnimTs  = -9999;
let moveAnimDur = MOVE_ANIM_MS;   // per-move slide duration (longer for ice slides)
let moveLinear  = false;          // slides render at constant speed (ice); normal steps ease out
let pendingReturn = null;         // queued 2nd half of an ice wall bounce (slide back to start)
let slideLockUntil = 0;           // input locked until this ts (during a wall bounce)
let bumpVec     = null;
let bumpAnimTs  = -9999;
let camX = 0, camY = 0;
let zoneSlide   = null;           // active world-scroll between zones { dir, t0, dur, snap }
const ZONE_SLIDE_MS = 380;        // how long the zone-to-zone scroll takes

// ── Buddy / follower pet ─────────────────────────────
let activePet   = null;   // pokeId of the Pokémon trailing the player (null = none)
let petX        = 10;
let petY        = 7;
let petFromPx   = { x: 10 * TILE_SIZE, y: 7 * TILE_SIZE };
let petMoveAnimTs = -9999;
let petMoveAnimDur = MOVE_ANIM_MS;  // buddy's own slide duration (may lag behind the player)
let petFacing   = 1;      // 1 = facing right (default), -1 = flipped to face left
let detailPoke  = null;   // the Pokémon currently open in the Pokédex detail view
let dexScroll   = 0;      // remembered grid scroll position across detail open/close
let surfNoted   = false;  // shown the "you can surf" hint this session yet?
let slipNoted   = false;  // shown the "ice is slippery" hint this session yet?
const JIGGLYPUFF_ID = 39; // a Jigglypuff buddy sings floating music notes
let noteParticles = [];   // active floating ♪ from a singing buddy
let lastNoteTs  = 0;

// Pre-cached tile canvases for performance
const tileCache = {};

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');

  // Prevent the whole page from scrolling on touch — but allow scrolling
  // inside the Pokédex (its grid and detail panel scroll internally).
  document.addEventListener('touchmove', e => {
    if (e.target.closest && e.target.closest('#pokedex-grid, #pokedex-detail')) return;
    e.preventDefault();
  }, { passive: false });

  buildTileCache();
  migrateLegacy();
  bindEvents();
  setupDebugMenu();
  setupNav('title');           // the title screen is active by default
  try { muted = localStorage.getItem('lukeymon_muted') === '1'; } catch (_) {}
  updateMuteBtn();
  runBoot();                   // Game Boy power-on, then reveal the title
  requestAnimationFrame(loop);
});

// ── Game Boy power-on sequence ──────────────────────────
// The LUKETENDO logo scrolls down, dings, then wipes to the title.
let _bootDone = false;
function bootChime() {
  beep(392, 0.12, 0.16, 'square');                          // G — low
  setTimeout(() => beep(659, 0.13, 0.18, 'square'), 120);   // E
  setTimeout(() => beep(784, 0.26, 0.40, 'square'), 250);   // G — the "ding"
}
function finishBoot() {
  if (_bootDone) return;
  _bootDone = true;
  const boot = document.getElementById('boot-screen');
  if (!boot) return;
  boot.classList.add('boot-out');
  setTimeout(() => { boot.classList.remove('active'); boot.classList.add('hidden'); }, 430);
}
function runBoot() {
  const boot = document.getElementById('boot-screen');
  if (!boot) return;
  setTimeout(bootChime, 1150);     // ding as the logo lands (best-effort before first tap)
  setTimeout(finishBoot, 2450);    // auto-advance to the title
  // Tap to skip — and use the gesture to wake audio so the chime can ring.
  boot.addEventListener('click', () => { wakeAudio(); bootChime(); finishBoot(); });
}

// ═══════════════════════════════════════════════════
// TILE CACHE
// ═══════════════════════════════════════════════════
// Each tile type caches an ARRAY of pre-rendered variants. Variants differ
// by jittered detail and scattered natural decorations (flowers, pebbles,
// shells, ripples...) so the world doesn't read as a rigid repeating grid.
function buildTileCache() {
  buildVariants(T.PATH,  4, paintPath);
  buildVariants(T.GRASS, 6, paintGrass);
  buildVariants(T.TREE,  4, paintTree);
  buildVariants(T.WATER, 4, paintWater);
  buildVariants(T.SAND,  5, paintSand);
  buildVariants(T.CITY,  3, paintCity);
  buildVariants(T.SHOP,  1, paintGrass);   // ground only — the building is drawn oversized
  buildVariants(T.LAVA,  4, paintLava);
  buildVariants(T.ICE,   4, paintIce);
  buildVariants(T.BOULDER, 3, paintBoulder);
  buildVariants(T.CAVE,  4, paintCave);
  buildVariants(T.CAVE_ENTRANCE, 1, paintCaveEntrance);
  buildVariants(T.HOUSE, 1, paintGrass);   // ground only — the building is drawn oversized
  buildVariants(T.FLOOR, 3, paintFloor);
  buildVariants(T.WALL,  3, paintWall);
  buildVariants(T.DOOR,  1, paintDoor);
  buildBuildingSprites();
}

// ── Sliced biome art (per-zone tiles, trees, shop building) ──────────
const ART_V = '4';   // bump to bust the image cache when art files change
const TILE_ART = {
  0: { 0: 3, 1: 3, 3: 3 }, 1: { 1: 3, 3: 3, 4: 3 }, 2: { 1: 3, 5: 3 },
  3: { 0: 3, 1: 3, 3: 3 }, 4: { 0: 3, 1: 3, 7: 3 }, 5: { 0: 3, 1: 3, 11: 1 },
  6: { 0: 3, 1: 3, 8: 3 }, 7: { 1: 3, 4: 3 },       8: { 9: 3, 10: 3, 11: 1 },
};
const _tileArt = {};
function tileArtImg(zone, tileId, variant) {
  const cnt = TILE_ART[zone] && TILE_ART[zone][tileId];
  if (!cnt) return null;
  const v = ((variant % cnt) + cnt) % cnt;
  const key = zone + '_' + tileId + '_' + v;
  let img = _tileArt[key];
  if (!img) { img = new Image(); img.src = 'art/tiles/z' + key + '.png?v=' + ART_V; _tileArt[key] = img; }
  return (img.complete && img.naturalWidth) ? img : null;
}
const _treeArt = {};
function treeArtImg(zone) {
  if (zone > 7) return null;                       // no trees in the hidden cave
  let img = _treeArt[zone];
  if (!img) { img = new Image(); img.src = 'art/tree/z' + zone + '.png?v=' + ART_V; _treeArt[zone] = img; }
  return (img.complete && img.naturalWidth) ? img : null;
}
const _shopImg = (() => { const i = new Image(); i.src = 'art/build/shop.png?v=' + ART_V; return i; })();
function shopArtImg() { return (_shopImg.complete && _shopImg.naturalWidth) ? _shopImg : null; }
const _houseImg = (() => { const i = new Image(); i.src = 'art/build/house.png?v=' + ART_V; return i; })();
function houseArtImg() { return (_houseImg.complete && _houseImg.naturalWidth) ? _houseImg : null; }

// ── Interior décor props (furniture sliced from the building art sheet) ──
// Placements live in WORLD.decor: { "<zoneId>": [ {x,y,s:spriteKey,solid?}, … ] }.
const DECOR        = WORLD.decor || {};
const DECOR_SCALE  = 0.5;     // sliced props are ~2× a tile; halve to sit nicely in a room
const _decorImg = {};
function decorImg(key) {
  let i = _decorImg[key];
  if (!i) { i = new Image(); i.src = 'art/interior/' + key + '.png?v=' + ART_V; _decorImg[key] = i; }
  return (i.complete && i.naturalWidth) ? i : null;
}
// Solid props block movement (counters, beds…). Cached per zone as an "x,y" set.
const _decorSolid = {};
function decorSolidAt(zone, x, y) {
  let s = _decorSolid[zone];
  if (!s) { s = _decorSolid[zone] = new Set(); (DECOR[zone] || []).forEach(d => { if (d.solid) s.add(d.x + ',' + d.y); }); }
  return s.has(x + ',' + y);
}

// Oversized building sprites (transparent bg), drawn on top of their ground tile and
// extending upward so a 1-tile entrance reads as a full-size building.
const buildingSprites = {};
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function buildBuildingSprites() {
  { const [c, x] = makeCanvas(54, 58); paintHouseBig(x); buildingSprites[T.HOUSE] = c; }
  { const [c, x] = makeCanvas(54, 58); paintShopBig(x);  buildingSprites[T.SHOP]  = c; }
  { const [c, x] = makeCanvas(54, 60); paintHospitalBig(x); buildingSprites[T.HOSPITAL] = c; }
  { const [c, x] = makeCanvas(54, 60); paintGymBig(x);      buildingSprites[T.GYM]      = c; }
}
function paintHospitalBig(x) {
  x.fillStyle = '#f4f4f8'; x.fillRect(5, 22, 44, 34);               // clean white body
  x.fillStyle = '#d8d8e2'; x.fillRect(5, 22, 44, 4);               // body shade
  x.fillStyle = '#e8403a'; x.fillRect(2, 12, 50, 12);             // red roof band
  x.fillStyle = '#c0322c'; x.fillRect(2, 22, 50, 3);
  x.fillStyle = '#fff';                                            // white cross sign
  x.fillRect(24, 13, 6, 10); x.fillRect(21, 16, 12, 4);
  x.fillStyle = '#bfe4ff'; x.fillRect(10, 30, 11, 10); x.fillRect(33, 30, 11, 10);  // windows
  x.fillStyle = '#7aa6c8'; x.fillRect(10, 30, 11, 2); x.fillRect(33, 30, 11, 2);
  x.fillStyle = '#8a6a4a'; x.fillRect(22, 40, 10, 16);            // doors
  x.fillStyle = '#6b4423'; x.fillRect(27, 40, 1, 16);
  x.fillStyle = '#e8d24a'; x.fillRect(24, 48, 2, 2);
}
function paintGymBig(x) {
  x.fillStyle = '#7a5230'; x.fillRect(5, 22, 44, 34);              // sturdy timber body
  x.fillStyle = '#5e3f24'; x.fillRect(5, 22, 44, 4);
  x.fillStyle = '#9a6a3a'; for (let i = 8; i < 49; i += 8) x.fillRect(i, 26, 1, 30); // plank seams
  x.fillStyle = '#454552'; x.beginPath(); x.moveTo(1, 24); x.lineTo(27, 6); x.lineTo(53, 24); x.closePath(); x.fill(); // grey roof
  x.fillStyle = '#33333e'; x.beginPath(); x.moveTo(1, 24); x.lineTo(53, 24); x.lineTo(53, 27); x.lineTo(1, 27); x.closePath(); x.fill();
  x.fillStyle = '#f0d24a'; x.fillRect(20, 30, 14, 8);             // gym banner
  x.fillStyle = '#c89a18'; x.font = '9px serif'; x.textAlign = 'center'; x.fillText('🥊', 27, 37); x.textAlign = 'left';
  x.fillStyle = '#6b4423'; x.fillRect(22, 40, 10, 16);           // big doors
  x.fillStyle = '#54381c'; x.fillRect(27, 40, 1, 16);
  x.fillStyle = '#e8d24a'; x.fillRect(24, 48, 2, 2);
}
function paintHouseBig(x) {
  x.fillStyle = '#d8b48a'; x.fillRect(6, 26, 42, 30);                 // body
  x.fillStyle = '#bf9b73'; x.fillRect(6, 26, 42, 4);                 // body shade
  x.fillStyle = '#c0432f';                                           // roof
  x.beginPath(); x.moveTo(1, 28); x.lineTo(27, 4); x.lineTo(53, 28); x.closePath(); x.fill();
  x.fillStyle = '#8f3322'; x.beginPath(); x.moveTo(1, 28); x.lineTo(53, 28); x.lineTo(53, 31); x.lineTo(1, 31); x.closePath(); x.fill();
  x.fillStyle = '#9fd8ff'; x.fillRect(12, 34, 9, 9); x.fillRect(33, 34, 9, 9);   // windows
  x.fillStyle = '#5a7a96'; x.fillRect(12, 34, 9, 2); x.fillRect(33, 34, 9, 2);
  x.fillStyle = '#6b4423'; x.fillRect(22, 40, 10, 16);              // door (bottom-centre)
  x.fillStyle = '#5a3a1e'; x.fillRect(22, 40, 10, 2);
  x.fillStyle = '#e8d24a'; x.fillRect(29, 48, 2, 2);                // knob
}
function paintShopBig(x) {
  x.fillStyle = '#e8d8b0'; x.fillRect(5, 24, 44, 32);              // body
  x.fillStyle = '#d02060'; x.fillRect(2, 16, 50, 12);             // awning
  x.fillStyle = '#f06090'; for (let i = 2; i < 52; i += 8) x.fillRect(i, 16, 4, 12);
  x.fillStyle = '#b8901c'; x.fillRect(5, 24, 44, 3);             // awning shadow on body
  x.fillStyle = '#9fd8ff'; x.fillRect(9, 32, 12, 10); x.fillRect(33, 32, 12, 10); // windows
  x.fillStyle = '#6b4423'; x.fillRect(22, 40, 10, 16);          // door
  x.fillStyle = '#e8d24a'; x.fillRect(29, 48, 2, 2);
  x.font = '11px serif'; x.textAlign = 'center'; x.fillText('🏪', 27, 14);  // sign above
  x.textAlign = 'left';
}

function paintHouse(x) {
  x.fillStyle = '#7cc24a'; x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);     // grass base
  x.fillStyle = '#e0c090'; x.fillRect(4, 12, 24, 18);                  // body
  x.fillStyle = '#c0432f';                                            // roof
  x.beginPath(); x.moveTo(2, 13); x.lineTo(16, 3); x.lineTo(30, 13); x.closePath(); x.fill();
  x.fillStyle = '#9fd8ff'; x.fillRect(7, 16, 4, 4); x.fillRect(21, 16, 4, 4); // windows
  x.fillStyle = '#6b4423'; x.fillRect(13, 18, 6, 12);                 // door
  x.fillStyle = '#e8d24a'; x.fillRect(17, 24, 2, 2);                  // knob
}
function paintFloor(x, rng) {
  x.fillStyle = '#caa472'; x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#b8915f'; for (let y = 0; y < TILE_SIZE; y += 8) x.fillRect(0, y, TILE_SIZE, 1);
  if (rng() < 0.5) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(2 + Math.floor(rng() * 26), 2 + Math.floor(rng() * 26), 4, 1); }
}
function paintWall(x) {
  x.fillStyle = '#8a6a4a'; x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#6e5238'; for (let xx = 0; xx < TILE_SIZE; xx += 8) x.fillRect(xx, 0, 1, TILE_SIZE);
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, 0, TILE_SIZE, 2);
  x.fillStyle = 'rgba(0,0,0,0.20)';       x.fillRect(0, TILE_SIZE - 4, TILE_SIZE, 4);
}
function paintDoor(x) {
  x.fillStyle = '#caa472'; x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);    // floor under
  x.fillStyle = '#5a8acb'; x.fillRect(6, 18, 20, 12);                 // welcome mat
  x.fillStyle = '#7aa6e0'; x.fillRect(8, 20, 16, 8);
  x.font = '13px serif'; x.fillText('🚪', 9, 15);
}

function makeTile() {
  const c = document.createElement('canvas');
  c.width = c.height = TILE_SIZE;
  return [c, c.getContext('2d')];
}

// Small deterministic PRNG so each variant is fixed across reloads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildVariants(type, count, paint) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const [c, x] = makeTile();
    paint(x, mulberry32(0x9E3779B9 ^ (type * 131 + i)), i);
    arr.push(c);
  }
  tileCache[type] = arr;
}

// Pick a stable variant index for a given map cell.
function tileVariant(zone, r, c, n) {
  let h = ((zone + 1) * 73856093) ^ ((r + 1) * 19349663) ^ ((c + 1) * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

function paintPath(x, rng) {
  x.fillStyle = '#d0b068';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // jittered stone seams
  x.fillStyle = '#c0a050';
  const sy = 13 + Math.floor(rng() * 6);
  x.fillRect(0, sy, TILE_SIZE, 1);
  x.fillRect(0, 31, TILE_SIZE, 1);
  x.fillRect(12 + Math.floor(rng() * 10), 0, 1, sy);
  x.fillRect(4 + Math.floor(rng() * 10), sy + 1, 1, TILE_SIZE - sy);
  // scattered pebbles
  const pebbles = Math.floor(rng() * 3);
  for (let i = 0; i < pebbles; i++) {
    x.fillStyle = rng() < 0.5 ? '#b89848' : '#dcc078';
    x.beginPath();
    x.arc(3 + rng() * 26, 3 + rng() * 26, 1 + rng() * 1.5, 0, Math.PI * 2);
    x.fill();
  }
}

function paintGrass(x, rng) {
  x.fillStyle = '#38b038';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // soft patchy shading
  x.fillStyle = 'rgba(40,144,42,0.45)';
  for (let i = 0; i < 2; i++) {
    x.beginPath();
    x.ellipse(rng() * 32, rng() * 32, 5 + rng() * 6, 4 + rng() * 4, 0, 0, Math.PI * 2);
    x.fill();
  }
  // blades
  x.fillStyle = '#28902a';
  const blades = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < blades; i++) {
    const bx = 2 + Math.floor(rng() * 28);
    const by = 4 + Math.floor(rng() * 22);
    x.fillRect(bx, by, 2, 6);
    x.fillRect(bx + 1, by - 2, 2, 4);
  }
  // occasional flower or pebble
  const deco = rng();
  if (deco < 0.33) {
    const fx = 6 + Math.floor(rng() * 20);
    const fy = 7 + Math.floor(rng() * 18);
    x.fillStyle = ['#f8d030', '#f87090', '#ffffff', '#c878f0'][Math.floor(rng() * 4)];
    x.fillRect(fx - 2, fy, 2, 2);
    x.fillRect(fx + 2, fy, 2, 2);
    x.fillRect(fx, fy - 2, 2, 2);
    x.fillRect(fx, fy + 2, 2, 2);
    x.fillStyle = '#ffe860';
    x.fillRect(fx, fy, 2, 2);
  } else if (deco < 0.5) {
    x.fillStyle = '#9a9a86';
    x.beginPath();
    x.arc(6 + rng() * 20, 8 + rng() * 18, 2, 0, Math.PI * 2);
    x.fill();
  }
}

function paintTree(x, rng) {
  x.fillStyle = '#1a4018';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const ox = (rng() - 0.5) * 4;
  const oy = (rng() - 0.5) * 3;
  // foliage
  x.fillStyle = '#306830';
  x.beginPath();
  x.arc(16 + ox, 14 + oy, 12 + rng() * 2, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#204820';
  x.beginPath();
  x.arc(11 + ox, 11 + oy, 6 + rng() * 2, 0, Math.PI * 2);
  x.fill();
  // occasional fruit / sunlit leaf
  if (rng() < 0.4) {
    x.fillStyle = rng() < 0.5 ? '#e8d040' : '#3a8a3a';
    x.beginPath();
    x.arc(11 + rng() * 12, 9 + rng() * 9, 1.6, 0, Math.PI * 2);
    x.fill();
  }
  // trunk
  x.fillStyle = '#5a3010';
  x.fillRect(13, 25, 6, 7);
}

function paintWater(x, rng) {
  x.fillStyle = '#2060d0';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#3880e8';
  const ripples = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < ripples; i++) {
    const ww = 6 + rng() * 8;
    const wh = 2 + rng() * 2;
    x.beginPath();
    x.ellipse(2 + rng() * 26, 4 + rng() * 24, ww / 2, wh / 2, 0, 0, Math.PI * 2);
    x.fill();
  }
  // sun glint
  if (rng() < 0.4) {
    x.fillStyle = '#bfe0ff';
    x.fillRect(4 + Math.floor(rng() * 22), 4 + Math.floor(rng() * 22), 2, 2);
  }
}

function paintSand(x, rng) {
  x.fillStyle = '#e8c870';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // jittered wavy highlight lines
  x.fillStyle = '#d4b05a';
  [4, 9, 14, 20, 25].forEach(y => {
    x.fillRect(0, y + (Math.floor(rng() * 5) - 2), TILE_SIZE, 1);
  });
  const deco = rng();
  if (deco < 0.25) {
    // little shell
    x.fillStyle = '#f0a0b0';
    x.beginPath();
    x.arc(8 + rng() * 16, 9 + rng() * 14, 3, Math.PI, 0);
    x.fill();
  } else if (deco < 0.45) {
    // pebble
    x.fillStyle = '#c8a860';
    x.beginPath();
    x.arc(6 + rng() * 20, 6 + rng() * 20, 2, 0, Math.PI * 2);
    x.fill();
  }
}

function paintCity(x, rng) {
  x.fillStyle = '#909090';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // grid slab lines
  x.fillStyle = '#787878';
  x.fillRect(0, 15, TILE_SIZE, 1);
  x.fillRect(0, 31, TILE_SIZE, 1);
  x.fillRect(15, 0, 1, 15);
  x.fillRect(15, 16, 1, 15);
  // occasional crack / drain
  if (rng() < 0.4) {
    x.fillStyle = '#6a6a6a';
    x.fillRect(4 + Math.floor(rng() * 22), 4 + Math.floor(rng() * 22), 3, 3);
  }
}

function paintShop(x) {
  x.fillStyle = '#e8d0a8';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Awning
  x.fillStyle = '#d02060';
  x.fillRect(0, 0, TILE_SIZE, 11);
  x.fillStyle = '#f06090';
  for (let i = 0; i < TILE_SIZE; i += 6) x.fillRect(i, 0, 3, 11);
  // Counter
  x.fillStyle = '#b07830';
  x.fillRect(4, 19, 24, 7);
  x.fillStyle = '#d0a050';
  x.fillRect(4, 17, 24, 4);
  // Sign
  x.font = '13px serif';
  x.fillText('🏪', 7, 14);
}

function paintLava(x, rng) {
  x.fillStyle = '#c83000';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#ff6820';
  const flows = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < flows; i++) {
    x.fillRect(Math.floor(rng() * 24), Math.floor(rng() * 28),
               6 + Math.floor(rng() * 8), 3 + Math.floor(rng() * 2));
  }
  x.fillStyle = '#ffd040';
  for (let i = 0; i < 3; i++) {
    x.fillRect(4 + Math.floor(rng() * 24), 4 + Math.floor(rng() * 24), 3, 2);
  }
}

function paintIce(x, rng) {
  x.fillStyle = '#b8d8f0';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#e8f4ff';
  for (let i = 0; i < 5; i++) {
    x.fillRect(Math.floor(rng() * 20), Math.floor(rng() * 30),
               8 + Math.floor(rng() * 12), 2);
  }
  x.fillStyle = '#90c0e0';
  for (let i = 0; i < 3; i++) {
    x.fillRect(Math.floor(rng() * 26), Math.floor(rng() * 26), 6, 4 + Math.floor(rng() * 2));
  }
}

// Boulder — solid impassable grey stones.
function paintBoulder(x, rng) {
  x.fillStyle = '#4c4c54';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  const rocks = [[9, 10, 16], [21, 20, 13], [22, 7, 11], [7, 23, 11]];
  for (const [bx, by, d] of rocks) {
    const cx = bx + (rng() - 0.5) * 3, cy = by + (rng() - 0.5) * 3;
    x.fillStyle = '#74747e';
    x.beginPath(); x.arc(cx, cy, d / 2, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#9a9aa6';   // highlight
    x.beginPath(); x.arc(cx - d / 6, cy - d / 6, d / 4, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#34343c';   // shadow
    x.beginPath(); x.arc(cx + d / 5, cy + d / 5, d / 6, 0, Math.PI * 2); x.fill();
  }
}

// Cave floor — dark rocky ground with faint cracks and pebbles.
function paintCave(x, rng) {
  x.fillStyle = '#34313f';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#3d3a4a';
  for (let i = 0; i < 4; i++) {
    x.fillRect(Math.floor(rng() * 26), Math.floor(rng() * 26), 4 + Math.floor(rng() * 6), 3 + Math.floor(rng() * 3));
  }
  x.strokeStyle = '#26242e';   // hairline cracks
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(rng() * TILE_SIZE, 0);
  x.lineTo(rng() * TILE_SIZE, TILE_SIZE);
  x.stroke();
  x.fillStyle = '#52505e';     // a couple of light pebbles
  for (let i = 0; i < 3; i++) x.fillRect(2 + Math.floor(rng() * 28), 2 + Math.floor(rng() * 28), 2, 2);
}

// Cave entrance / mouth — a dark archway in the rock you can step into.
function paintCaveEntrance(x) {
  x.fillStyle = '#5a5560';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // rocky frame
  x.fillStyle = '#74707c';
  x.fillRect(0, 0, TILE_SIZE, 6);
  x.fillRect(0, 0, 5, TILE_SIZE);
  x.fillRect(TILE_SIZE - 5, 0, 5, TILE_SIZE);
  // dark mouth (rounded top)
  x.fillStyle = '#0a0810';
  x.beginPath();
  x.moveTo(6, TILE_SIZE);
  x.lineTo(6, 14);
  x.arc(TILE_SIZE / 2, 14, TILE_SIZE / 2 - 6, Math.PI, 0);
  x.lineTo(TILE_SIZE - 6, TILE_SIZE);
  x.closePath();
  x.fill();
  // faint inner glow
  x.fillStyle = 'rgba(120,110,160,0.18)';
  x.beginPath(); x.arc(TILE_SIZE / 2, 20, 7, 0, Math.PI * 2); x.fill();
}

// ═══════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════
function bindEvents() {
  // Keyboard
  const kbKamiMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', z:'b', Z:'b', x:'a', X:'a', Enter:'start', Shift:'select' };
  const kbNavMap  = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', x:'a', X:'a', Enter:'a', ' ':'a', z:'b', Z:'b', Backspace:'b', Escape:'b' };
  document.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return; // don't hijack text fields
    keys[e.key] = true;
    wakeAudio();
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
    if (kbKamiMap[e.key]) kamiInput(kbKamiMap[e.key]);
    if (!e.repeat && kbNavMap[e.key]) uiPress(kbNavMap[e.key]);   // menu navigation
    if (e.key === 'Shift' && !e.repeat && gameState === 'world') cycleBuddy();
    // 'M' toggles the world map from the world screen.
    if (e.key === 'm' || e.key === 'M') {
      if (gameState === 'world') openMap();
      else if (gameState === 'map') closeMap();
    }
    // Weather/time preview toggles (outdoors): 'N' = night, 'R' = rain.
    if (!e.repeat && gameState === 'world' && (e.key === 'n' || e.key === 'N')) {
      setNight(); showMessage(nightMode ? '🌙 Night mode ON' : '☀️ Night mode off');
    }
    if (!e.repeat && gameState === 'world' && (e.key === 'r' || e.key === 'R')) {
      setRain(); showMessage(rainMode ? '🌧️ Rain ON' : '🌤️ Rain off');
    }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  // Unlock/resume audio on the first real gesture anywhere (mobile needs this).
  ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'click'].forEach(ev =>
    document.addEventListener(ev, wakeAudio, { capture: true, passive: true }));

  // Title / save slots
  document.getElementById('play-btn').addEventListener('click', () => { wakeAudio(); openSlots(); });
  document.getElementById('slot-back').addEventListener('click', () => showScreen('title'));
  document.getElementById('name-ok').addEventListener('click', () => { wakeAudio(); confirmName(); });
  document.getElementById('name-cancel').addEventListener('click', () => openSlots());
  document.getElementById('intro-begin').addEventListener('click', () => { wakeAudio(); beginAdventure(); });
  document.getElementById('name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmName(); }
  });

  // World HUD
  document.getElementById('pokedex-btn').addEventListener('click', openPokedex);
  document.getElementById('map-btn').addEventListener('click', openMap);
  document.getElementById('mute-btn').addEventListener('click', () => { wakeAudio(); toggleMute(); });
  document.getElementById('hud-buddy').addEventListener('click', () => { wakeAudio(); cycleBuddy(); });

  // Full-screen / immersive: hide the Game Boy shell so the screen fills the
  // display (great for landscape / casting to a TV). Also asks the browser for
  // real fullscreen where allowed.
  const fsBtn = document.getElementById('fullscreen-btn');
  if (fsBtn) {
    const syncFsBtn = on => { fsBtn.textContent = on ? '✕' : '⛶'; fsBtn.title = on ? 'Exit full screen' : 'Full screen'; };
    fsBtn.addEventListener('click', () => {
      const on = document.body.classList.toggle('immersive');
      syncFsBtn(on);
      try {
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
        else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      } catch (_) {}
    });
    // Keep our layout in sync if the user leaves browser fullscreen via Esc/back.
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && document.body.classList.contains('immersive')) {
        document.body.classList.remove('immersive'); syncFsBtn(false);
      }
    });
  }

  // Pokédex
  document.getElementById('pokedex-back').addEventListener('click', closePokedex);
  document.getElementById('detail-back').addEventListener('click', closeDetail);
  document.getElementById('detail-buddy').addEventListener('click', toggleBuddy);
  document.querySelectorAll('#pokedex-filters .dexf-chip[data-status]').forEach(chip => {
    chip.addEventListener('click', () => { dexFilter.status = chip.dataset.status; refreshDexFilters(); });
  });
  document.getElementById('dexf-type').addEventListener('click', cycleDexType);

  // World map + guide
  document.getElementById('map-back').addEventListener('click', closeMap);
  document.getElementById('map-help').addEventListener('click', () => openHelp('map'));
  document.getElementById('help-back').addEventListener('click', closeHelp);

  // Settings
  document.getElementById('title-settings').addEventListener('click', openSettings);
  document.getElementById('settings-back').addEventListener('click', closeSettings);
  document.getElementById('set-sound').addEventListener('click', () => { wakeAudio(); toggleMute(); updateSoundRow(); });
  document.getElementById('set-guide').addEventListener('click', () => openHelp('settings'));

  // Badge case
  document.getElementById('map-badges').addEventListener('click', openBadgeCase);
  document.getElementById('badges-back').addEventListener('click', closeBadgeCase);

  // Field notes
  document.getElementById('map-notes').addEventListener('click', openNotes);
  document.getElementById('notes-back').addEventListener('click', closeNotes);

  // Mewtwo battle
  // (battle-throw's handler is assigned per-battle in showBattleWin)

  // NPC dialog
  document.getElementById('npc-advance').addEventListener('click', () => { wakeAudio(); advanceNPC(); });
  document.getElementById('gift-continue').addEventListener('click', () => { wakeAudio(); continueGift(); });

  // Encounter action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wakeAudio();
      resolveAction(btn.dataset.action, btn);
    });
  });

  // Result continue
  document.getElementById('result-continue').addEventListener('click', returnToWorld);
  document.getElementById('champion-continue').addEventListener('click', returnToWorld);

  // Complete restart
  document.getElementById('complete-restart').addEventListener('click', startNewGame);

  // Throw ball
  document.getElementById('enc-throw-btn').addEventListener('click', () => {
    wakeAudio();
    throwBall();
  });

  // Shop
  document.getElementById('shop-close').addEventListener('click', closeShop);
  document.querySelectorAll('.shop-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wakeAudio();
      if (btn.dataset.master) buyMaster(parseInt(btn.dataset.cost));
      else buyBalls(parseInt(btn.dataset.qty), parseInt(btn.dataset.cost));
    });
  });

  // D-pad — use both touch and pointer events for maximum mobile compatibility
  const keyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  document.querySelectorAll('.dpad-btn').forEach(btn => {
    const k = keyMap[btn.dataset.dir];
    const press   = e => { e.preventDefault(); keys[k] = true; kamiInput(btn.dataset.dir); uiPress(btn.dataset.dir); wakeAudio(); };
    const release = e => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener('touchstart',  press,   { passive: false });
    btn.addEventListener('touchend',    release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup',   release);
    btn.addEventListener('pointercancel', release);
  });

  ['btn-b', 'btn-a'].forEach(id => {
    const name = id.split('-')[1];
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); kamiInput(name); uiPress(name); wakeAudio(); });
    el.addEventListener('touchstart',  e => { e.preventDefault(); kamiInput(name); uiPress(name); wakeAudio(); }, { passive: false });
  });

  const startEl = document.getElementById('ss-start');
  startEl.addEventListener('pointerdown', e => { kamiInput('start'); });
  startEl.addEventListener('touchstart',  e => { kamiInput('start'); }, { passive: false });

  const selectEl = document.getElementById('ss-select');
  selectEl.addEventListener('pointerdown', e => { pressSelect(); });
  selectEl.addEventListener('touchstart',  e => { pressSelect(); }, { passive: false });
}

// Select button: feeds the secret-code buffer, and quick-swaps your buddy in-world.
let _selLast = 0;
function pressSelect() {
  kamiInput('select');                    // has its own touch/pointer de-dupe
  if (gameState !== 'world') return;
  const now = Date.now();
  if (now - _selLast < 250) return;
  _selLast = now;
  wakeAudio();
  cycleBuddy();
}

// ═══════════════════════════════════════════════════
// SECRET CODES  (shared input buffer, checked as suffixes)
//   KAMI  : ↑ ↑ ↓ ↓ ← → ← → B A Start  → catch everything
//   DEBUG : A B B A Select Start        → toggle the debug menu
// ═══════════════════════════════════════════════════
const KAMI_CODE  = ['up','up','down','down','left','right','left','right','b','a','start'];
const DEBUG_CODE = ['a','b','b','a','select','start'];
const CODE_MAX   = Math.max(KAMI_CODE.length, DEBUG_CODE.length);
let _kamiLastKey = null, _kamiLastTime = 0;

function kamiInput(key) {
  const now = Date.now();
  if (key === _kamiLastKey && now - _kamiLastTime < 20) return; // dedupe touch+pointer double-fire (~1ms apart)
  _kamiLastKey = key;
  _kamiLastTime = now;
  kamiBuffer.push(key);
  if (kamiBuffer.length > CODE_MAX) kamiBuffer.shift();
  const endsWith = code => kamiBuffer.slice(-code.length).join(',') === code.join(',');
  if (endsWith(KAMI_CODE))  { kamiBuffer = []; activateKami(); }
  else if (endsWith(DEBUG_CODE)) { kamiBuffer = []; toggleDebug(); }
}

function activateKami() {
  kamiBuffer = [];
  POKEMON_DATA.forEach(p => caughtIds.add(p.id));
  Object.keys(BARRIERS).forEach(k => unlockedBarriers.add(k));
  balls += 99;
  saveGame();
  updateHud();
  showMessage('🌟 KAMI MODE ACTIVATED! All Lukeymon caught!');
}

// ═══════════════════════════════════════════════════
// RENDER POSITION  (interpolated between tiles)
// ═══════════════════════════════════════════════════
function getRenderPos(ts) {
  const destX = playerX * TILE_SIZE;
  const destY = playerY * TILE_SIZE;

  // Wall-bump: nudge toward obstacle and spring back
  if (bumpVec) {
    const t = Math.min((ts - bumpAnimTs) / BUMP_ANIM_MS, 1);
    if (t < 1) {
      const dist = Math.sin(t * Math.PI) * 5; // 5 px max nudge
      return { x: destX + bumpVec.dx * dist, y: destY + bumpVec.dy * dist };
    }
    bumpVec = null;
  }

  // Tile-to-tile slide. Ice slides glide at constant speed; normal steps ease out.
  const mt = Math.min((ts - moveAnimTs) / moveAnimDur, 1);
  if (mt < 1) {
    const ease = moveLinear ? mt : 1 - Math.pow(1 - mt, 3);
    const hopY = moveLinear ? 0 : Math.sin(mt * Math.PI) * -3;
    return {
      x: fromPx.x + (destX - fromPx.x) * ease,
      y: fromPx.y + (destY - fromPx.y) * ease + hopY,
    };
  }

  // Idle gentle bob
  const bob = Math.sin(ts * 0.0025) * 2.5;
  return { x: destX, y: destY + bob };
}

// ── Buddy follower ───────────────────────────────────
// Each step the buddy slides onto the tile the player just vacated.
function petFollow(tx, ty, ts, dur) {
  if (activePet == null) return;
  const cur = getPetRenderPos(ts);
  petFromPx.x = cur.x;
  petFromPx.y = cur.y;
  if (tx > petX) petFacing = 1;        // moving right
  else if (tx < petX) petFacing = -1;  // moving left → flip; vertical keeps last facing
  petX = tx; petY = ty;
  petMoveAnimTs  = ts;
  petMoveAnimDur = (dur != null) ? dur : moveAnimDur;   // buddy can lag behind on long slides
}

function getPetRenderPos(ts) {
  const destX = petX * TILE_SIZE;
  const destY = petY * TILE_SIZE;
  const mt = Math.min((ts - petMoveAnimTs) / petMoveAnimDur, 1);
  if (mt < 1) {
    const ease = moveLinear ? mt : 1 - Math.pow(1 - mt, 3);
    return { x: petFromPx.x + (destX - petFromPx.x) * ease,
             y: petFromPx.y + (destY - petFromPx.y) * ease };
  }
  const bob = Math.sin(ts * 0.003 + 1) * 2;
  return { x: destX, y: destY + bob };
}

// ═══════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════
function loop(ts) {
  requestAnimationFrame(loop);

  if (gameState === 'world') {
    // Second half of an ice wall bounce, in two beats:
    //   1) the player reaches the wall and slides straight back to the start,
    //   2) the buddy — which slid to the same wall point a touch later — turns
    //      and follows us back, again landing slightly after.
    if (pendingReturn) {
      const r = pendingReturn;
      if (!r.playerTurned && ts >= r.due) {
        r.playerTurned = true;
        moveLinear = true;
        moveAnimDur = r.dur;
        fromPx.x = r.fromTX * TILE_SIZE; fromPx.y = r.fromTY * TILE_SIZE;
        moveAnimTs = ts;
        playerX = r.toX; playerY = r.toY; playerStep ^= 1;
      }
      if (ts >= r.petDue) {
        pendingReturn = null;
        // We're now facing the opposite way, so the buddy trails on the far side.
        petFollow(r.toX + r.dx, r.toY + r.dy, ts, r.dur + r.lag);
      }
    }
    if (ts - lastMoveTs >= MOVE_INTERVAL) {
      let moved = false;
      if      (keys['ArrowUp']    || keys['w'] || keys['W']) { move( 0,-1, ts); moved = true; }
      else if (keys['ArrowDown']  || keys['s'] || keys['S']) { move( 0, 1, ts); moved = true; }
      else if (keys['ArrowLeft']  || keys['a'] || keys['A']) { move(-1, 0, ts); moved = true; }
      else if (keys['ArrowRight'] || keys['d'] || keys['D']) { move( 1, 0, ts); moved = true; }
      if (moved) lastMoveTs = ts;
    }
    if (zoneSlide) drawZoneSlide(ts);
    else           drawWorld(ts);
  }
}

// ═══════════════════════════════════════════════════
// BARRIER HELPERS
// ═══════════════════════════════════════════════════
// A barrier is only open once the player has physically cleared it by walking
// into it with the right type — not automatically when the type is caught.
function isBarrierUnlocked(key) {
  return !key || unlockedBarriers.has(key);
}

// The Pokémon currently set as the active buddy (or null).
function buddyPoke() {
  return activePet == null ? null : POKEMON_DATA.find(p => p.id === activePet) || null;
}
// Whether the active BUDDY is of the given type. Barriers/surfing need the right
// type out front, not merely caught somewhere in the box.
function buddyHasType(type) {
  const p = buddyPoke();
  return !!p && p.type === type;
}

// A Water-type buddy (Lapras, Squirtle, …) lets the player surf across water.
function canSurf() { return buddyHasType('Water'); }

// Does the current buddy glow brightly enough to light a cave? Fire types carry
// a flame; a few others (marked light:true) also shine.
function buddyLightsCave() {
  if (activePet == null) return false;
  const p = POKEMON_DATA.find(x => x.id === activePet);
  return !!p && (p.type === 'Fire' || p.light === true);
}

// A point-portal (cave mouth) sitting on (x, y) of the given zone, if any.
function portalAt(zone, x, y) {
  return PORTALS.find(p => p.from === zone && p.fx === x && p.fy === y) || null;
}

// Returns barrier key if (nx, ny) is a locked border exit tile for the current zone.
function getExitBarrierAt(nx, ny) {
  const zoneExits = EXITS.filter(e => e.from === currentZone);
  for (const exit of zoneExits) {
    if (!exit.barrier) continue;
    if (isBarrierUnlocked(exit.barrier)) continue;
    let match = false;
    const { cols: ec, rows: er } = ZONE_INFO[currentZone];
    if (exit.dir === 'south' && ny === er - 1 && exit.pos.includes(nx)) match = true;
    if (exit.dir === 'north' && ny === 0      && exit.pos.includes(nx)) match = true;
    if (exit.dir === 'west'  && nx === 0      && exit.pos.includes(ny)) match = true;
    if (exit.dir === 'east'  && nx === ec - 1 && exit.pos.includes(ny)) match = true;
    if (match) return exit.barrier;
  }
  return null;
}

// Find exit for player at the border moving off-map
function findActiveExit(x, y, dx, dy) {
  const zoneExits = EXITS.filter(e => e.from === currentZone);
  for (const exit of zoneExits) {
    const { cols: fc, rows: fr } = ZONE_INFO[currentZone];
    if (exit.dir === 'south' && dy > 0 && y === fr - 1 && exit.pos.includes(x)) return exit;
    if (exit.dir === 'north' && dy < 0 && y === 0      && exit.pos.includes(x)) return exit;
    if (exit.dir === 'west'  && dx < 0 && x === 0      && exit.pos.includes(y)) return exit;
    if (exit.dir === 'east'  && dx > 0 && x === fc - 1 && exit.pos.includes(y)) return exit;
  }
  return null;
}

// ═══════════════════════════════════════════════════
// MOVEMENT
// ═══════════════════════════════════════════════════
function move(dx, dy, ts) {
  // Locked out while a wall bounce (forward + return) is playing.
  if (ts < slideLockUntil) return;

  // 1. Set direction
  playerDir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';

  let nx = playerX + dx;
  let ny = playerY + dy;

  // 2. Off-map: check for zone exit
  const { cols: mc, rows: mr } = ZONE_INFO[currentZone];
  if (nx < 0 || nx >= mc || ny < 0 || ny >= mr) {
    const exit = findActiveExit(playerX, playerY, dx, dy);
    if (exit) {
      if (isBarrierUnlocked(exit.barrier)) {
        doTransition(exit, ts);
      } else {
        // Locked barrier — bump and hint
        bumpVec    = { dx, dy };
        bumpAnimTs = ts;
        beep(160, 0.07, 0.1, 'square');
        showMessage(BARRIERS[exit.barrier].hint);
        learnTip('barrier_' + exit.barrier);
      }
    } else {
      // Plain wall
      bumpVec    = { dx, dy };
      bumpAnimTs = ts;
      beep(160, 0.07, 0.1, 'square');
    }
    return;
  }

  // 3. Check barrier tile at destination (still in-map but on a border exit
  //    tile with a not-yet-cleared barrier). Walking into it with the right
  //    type clears it on the spot; otherwise it blocks with a hint.
  const barrierKey = getExitBarrierAt(nx, ny);
  if (barrierKey) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    if (buddyHasType(BARRIERS[barrierKey].needsType)) {
      unlockedBarriers.add(barrierKey);
      saveGame();
      beep(523, 0.1, 0.1);
      setTimeout(() => beep(784, 0.14, 0.18), 110);
      showMessage(BARRIERS[barrierKey].cleared);
      learnTip('barrier_' + barrierKey);
    } else {
      beep(160, 0.07, 0.1, 'square');
      showMessage(BARRIERS[barrierKey].hint);
      learnTip('barrier_' + barrierKey);
    }
    return;
  }

  // 3a. A legendary roamer (Mew / Mewtwo) standing on the destination tile.
  const roamer = roamerAt(currentZone, nx, ny);
  if (roamer) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    engageRoamer(roamer);
    return;
  }

  // 3b. A legendary lair: fight Team Rocket first, then (or directly, on a
  //     rematch) the legendary bird itself.
  const lair = lairAt(currentZone, nx, ny);
  if (lair) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    if (rocketDefeated.has(lair.bird)) startBirdBattle(lair.bird);
    else startRocketBattle(lair);
    return;
  }

  // 3c. Talk to an NPC standing on the destination tile (they block it).
  const npc = npcAt(currentZone, nx, ny);
  if (npc) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    if (npc.gymLeader && !collected.has('badge_gym')) startGymBattle(npc);  // challenge → battle
    else if (npc.dojo) startDojoBattle();   // repeatable practice battles (grows battle evolutions)
    else if (npc.shop) openShop();  // the Poké Mart clerk runs the shop
    else talkNPC(npc);
    return;
  }

  // 3c2. A wandering trainer on the destination tile → a quick battle.
  if (trainerAt(currentZone, nx, ny)) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    startTrainerBattle();
    return;
  }

  // 3d. Another player (LAN multiplayer) on the destination tile → friendly duel.
  if (window.MP && MP.maybeBump(nx, ny, ts)) {
    bumpVec = { dx, dy };
    bumpAnimTs = ts;
    return;
  }

  // 4. Check tile impassable. Water is normally impassable, but once you've
  //    caught Lapras you can surf straight across it.
  const tile = MAPS[currentZone][ny][nx];
  const surfing = tile === T.WATER && canSurf();

  // Buildings & cave mouths are solid except from directly below — you must walk
  // UP into the door (dy === -1). Approaching from a side or the top bounces off.
  // (Only on the overworld; interior/cave exit doors are unrestricted.)
  const isEntrance = tile === T.HOUSE || tile === T.SHOP || tile === T.HOSPITAL ||
                     tile === T.GYM || tile === T.CAVE_ENTRANCE;
  if (isEntrance && !ZONE_INFO[currentZone].interior && !ZONE_INFO[currentZone].cave) {
    // Enterable buildings & cave mouths have a portal — pass only when walking UP
    // into the door (dy === -1). Decorative buildings (no portal) are solid all round.
    const enterable = !!portalAt(currentZone, nx, ny);
    if (!enterable || dy !== -1) {
      bumpVec    = { dx, dy };
      bumpAnimTs = ts;
      beep(160, 0.07, 0.1, 'square');
      return;
    }
  }

  // Solid décor (counters, beds…) blocks movement just like an obstacle tile.
  if (decorSolidAt(currentZone, nx, ny)) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    beep(160, 0.07, 0.1, 'square');
    return;
  }

  if (isObstacleTile(tile) && !surfing) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    beep(160, 0.07, 0.1, 'square');
    return;
  }

  // 4b. Ice is slippery! With no Ice-type buddy you slide straight across it
  //     until you reach solid ground (or a wall). An Ice buddy keeps your footing.
  if (tile === T.ICE && !buddyHasType('Ice')) {
    while (MAPS[currentZone][ny][nx] === T.ICE) {
      const ux = nx + dx, uy = ny + dy;
      if (ux < 0 || ux >= mc || uy < 0 || uy >= mr) break;
      const ut = MAPS[currentZone][uy][ux];
      if (isObstacleTile(ut) || ut === T.HOUSE || ut === T.SHOP || ut === T.HOSPITAL || ut === T.GYM || ut === T.CAVE_ENTRANCE) break;
      if (decorSolidAt(currentZone, ux, uy)) break;
      if (npcAt(currentZone, ux, uy) || lairAt(currentZone, ux, uy) || roamerAt(currentZone, ux, uy)) break;
      nx = ux; ny = uy;
    }
    beep(900, 0.05, 0.2, 'sine');                       // slide whoosh
    if (!slipNoted) { slipNoted = true; showMessage('🧊 So slippery! An ICE-type buddy keeps your footing.'); learnTip('ice'); }
    // Stopped while still on ice → you hit a wall. Treat it as TWO slides: glide to
    // the wall now (a normal slide), then slide all the way back to the start tile.
    if (MAPS[currentZone][ny][nx] === T.ICE) {
      const startX = playerX, startY = playerY;
      const dur = Math.max(1, Math.abs(nx - startX) + Math.abs(ny - startY)) * MOVE_ANIM_MS;
      moveLinear = true;
      moveAnimDur = dur;
      const cur0 = getRenderPos(ts);
      fromPx.x = cur0.x; fromPx.y = cur0.y;
      moveAnimTs = ts;
      playerX = nx; playerY = ny; playerStep ^= 1;
      const lag = Math.round(MOVE_ANIM_MS * 0.8);        // buddy lands just after us
      petFollow(nx, ny, ts, dur + lag);                  // buddy slides to the SAME wall point
      setTimeout(() => beep(150, 0.08, 0.16, 'square'), dur);   // bonk at the wall
      pendingReturn = { fromTX: nx, fromTY: ny, toX: startX, toY: startY,
                        dx, dy, dur, lag, due: ts + dur, petDue: ts + dur + lag,
                        playerTurned: false };
      slideLockUntil = ts + 2 * dur + 2 * lag;
      return;
    }
  }

  // 5. Normal move
  moveLinear  = (tile === T.ICE && !buddyHasType('Ice')); // uncontrolled ice slides glide at constant speed
  moveAnimDur = Math.max(1, Math.abs(nx - playerX) + Math.abs(ny - playerY)) * MOVE_ANIM_MS;
  const cur = getRenderPos(ts);
  fromPx.x   = cur.x;
  fromPx.y   = cur.y;
  moveAnimTs = ts;

  const oldX = playerX, oldY = playerY;
  playerX   = nx;
  playerY   = ny;
  playerStep ^= 1;
  petFollow(nx - dx, ny - dy, ts);   // buddy trails just behind (handles ice slides too)
  if (activePet != null) tickBond(activePet);   // a step closer to a buddy evolution

  beep(220, 0.04, 0.04, 'square');

  // First time surfing this session — let the player know what's happening.
  if (surfing && !surfNoted) {
    surfNoted = true;
    const b = buddyPoke();
    showMessage(`🌊 ${b ? b.name : 'Your buddy'} carries you across the water!`);
    learnTip('water');
  }

  // Step onto a cave mouth (or other point-portal) → warp into the linked zone.
  const portal = portalAt(currentZone, playerX, playerY);
  if (portal) {
    beep(300, 0.08, 0.1);
    setTimeout(() => warpTo(portal.to, portal.tx, portal.ty, 'down'), 110);
    return;
  }

  // (The shop tile now warps into the Poké Mart interior via the portal above.)

  // Check if player stepped onto a wild Pokémon's tile
  if (wildPoke && wildPoke.zone === currentZone &&
      wildPoke.x === playerX && wildPoke.y === playerY) {
    const poke = wildPoke.poke;
    clearWild();
    setTimeout(() => beginEncounter(poke), 80);
    return;
  }

  // Found a fixed collectible (badge) sitting on this tile? Big celebration.
  const item = collectibleAt(currentZone, playerX, playerY);
  if (item && !collected.has(item.id)) {
    collected.add(item.id);
    if (!wonGame && landBadgesDone()) pendingChampion = true;  // 4 land badges → Champion
    saveGame();
    updateHud();
    celebrateBadge(item);
    return;
  }

  // Picked up a hidden evolution Stone?
  const stoneFind = stoneFindAt(currentZone, playerX, playerY);
  if (stoneFind && !foundStones.has(stoneFind.id)) {
    foundStones.add(stoneFind.id);
    stones[stoneFind.stone] = (stones[stoneFind.stone] || 0) + 1;
    saveGame();
    updateHud();
    celebrateStone(stoneFind);
    return;
  }

  // Random grass pickup — chance to find a ball (more common) or a coin
  if (MAPS[currentZone][ny][nx] === T.GRASS && Math.random() < GRASS_PICKUP_CHANCE) {
    if (Math.random() < 0.6) {
      balls++;
      showMessage(`<span class="pb"></span> Found a PokéBall! (${balls} total)`);
      beep(660, 0.1, 0.08);
      setTimeout(() => beep(880, 0.1, 0.1), 90);
    } else {
      coins++;
      showMessage(`💰 Found a coin! (${coins} total)`);
      beep(880, 0.08, 0.08);
      setTimeout(() => beep(1100, 0.08, 0.08), 90);
    }
    updateHud();
    saveGame();
  }
}

// ═══════════════════════════════════════════════════
// ZONE TRANSITION
// ═══════════════════════════════════════════════════
// Move the player to (x, y) of another zone — used by both edge exits and
// point-portals (cave mouths). The buddy is teleported along too.
function warpTo(zone, x, y, dirKey) {
  clearTrainer();                     // any wandering trainer stays in the zone you left
  beginZoneSlide(dirKey || 'down');   // snapshot the old zone, then scroll into the new one
  currentZone = zone;
  playerX     = x;
  playerY     = y;
  playerDir   = dirKey || 'down';

  // Reset animation state — snap to position, no slide glitch
  fromPx.x   = playerX * TILE_SIZE;
  fromPx.y   = playerY * TILE_SIZE;
  moveAnimTs = -9999;
  bumpVec    = null;

  // Buddy comes through with you, landing on your tile.
  petX = playerX; petY = playerY;
  petFromPx.x = petX * TILE_SIZE; petFromPx.y = petY * TILE_SIZE;
  petMoveAnimTs = -9999;
  noteParticles = [];

  saveGame();
  updateHud();
  if (ZONE_INFO[zone].base === T.CAVE && !buddyLightsCave()) {
    showMessage("🕯️ It's pitch black! Bring a glowing buddy (a Fire-type, say) to light the way…");
    learnTip('cave');
  }
  else
    showMessage('📍 ' + ZONE_INFO[zone].name);

  // Transition sound: two rising beeps
  beep(330, 0.1, 0.1);
  setTimeout(() => beep(440, 0.12, 0.15), 80);

  clearWild();
  scheduleSpawn();
}

function doTransition(exit, ts) {
  const dirMap = { south: 'down', north: 'up', west: 'left', east: 'right' };
  warpTo(exit.to, exit.entryX, exit.entryY, dirMap[exit.dir]);
}

// Grab the current frame so we can scroll the old zone out while the new one
// slides in from the direction the player is heading. (Skipped if the canvas
// isn't ready, e.g. during the headless tests.)
function beginZoneSlide(dir) {
  if (!canvas || !canvas.width) return;
  const snap = document.createElement('canvas');
  snap.width  = canvas.width;
  snap.height = canvas.height;
  try { snap.getContext('2d').drawImage(canvas, 0, 0); }
  catch (_) { return; }                       // tainted/empty canvas — just skip the effect
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  zoneSlide = { dir, t0: now, dur: ZONE_SLIDE_MS, snap };
  slideLockUntil = now + ZONE_SLIDE_MS;        // hold movement until the scroll finishes
}

// Composite the cross-zone scroll: new zone drawn translated, old snapshot
// drawn on the complementary side, the pair sliding across the screen.
function drawZoneSlide(ts) {
  const z = zoneSlide;
  const t = Math.min((ts - z.t0) / z.dur, 1);
  if (t >= 1) { zoneSlide = null; drawWorld(ts); return; }
  const e = 1 - Math.pow(1 - t, 3);            // ease-out
  const W = canvas.width, H = canvas.height;
  let ox = 0, oy = 0, sx = 0, sy = 0;          // new-zone offset / old-snapshot offset
  if      (z.dir === 'right') { ox =  (1 - e) * W; sx = ox - W; }
  else if (z.dir === 'left')  { ox = -(1 - e) * W; sx = ox + W; }
  else if (z.dir === 'up')    { oy = -(1 - e) * H; sy = oy + H; }
  else                        { oy =  (1 - e) * H; sy = oy - H; }   // 'down' (default)

  ctx.save();
  ctx.translate(Math.round(ox), Math.round(oy));
  drawWorld(ts);                               // new zone fills its own region
  ctx.restore();
  ctx.drawImage(z.snap, Math.round(sx), Math.round(sy));  // old zone on the other side
}

// ═══════════════════════════════════════════════════
// WILD POKÉMON SPAWNING
// ═══════════════════════════════════════════════════
function scheduleSpawn() {
  clearTimeout(spawnTimerId);
  const delay = 4000 + Math.random() * 5000; // 4–9 s between spawns
  spawnTimerId = setTimeout(spawnWild, delay);
}

function clearWild() {
  clearTimeout(expireTimerId);
  wildPoke = null;
}

// ── Wandering trainers ───────────────────────────────
const TRAINER_NAMES  = ['Hiker Joe', 'Bug Catcher Lia', 'Camper Sam', 'Picnicker Mae', 'Youngster Tim', 'Lass Ivy', 'Fisher Gil', 'Bird Keeper Ann', 'Sailor Moe', 'Painter Bea'];
const TRAINER_EMOJIS = ['🧗', '🧒', '🎒', '🧺', '👦', '👧', '🎣', '🦅', '⚓', '🎨'];
function trainerAt(zone, x, y) {
  return (wildTrainer && wildTrainer.zone === zone && wildTrainer.x === x && wildTrainer.y === y) ? wildTrainer : null;
}
function spawnTrainer() {
  const z = ZONE_INFO[currentZone];
  if (z.interior || z.base === T.CAVE) return false;     // outdoors only
  const map = MAPS[currentZone], { cols, rows } = z, cands = [];
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
    const t = map[r][c];
    if (isObstacleTile(t) || t === T.GRASS || t === T.HOUSE || t === T.SHOP || t === T.HOSPITAL || t === T.GYM || t === T.CAVE_ENTRANCE) continue;
    if (decorSolidAt(currentZone, c, r) || portalAt(currentZone, c, r)) continue;
    if ((c === playerX && r === playerY) || npcAt(currentZone, c, r) || lairAt(currentZone, c, r) || roamerAt(currentZone, c, r)) continue;
    const d = Math.abs(c - playerX) + Math.abs(r - playerY);
    if (d >= 3 && d <= 8) cands.push({ x: c, y: r });
  }
  if (!cands.length) return false;
  const tile = cands[Math.floor(Math.random() * cands.length)];
  const i = Math.floor(Math.random() * TRAINER_NAMES.length);
  wildTrainer = { x: tile.x, y: tile.y, zone: currentZone, name: TRAINER_NAMES[i], emoji: TRAINER_EMOJIS[i] };
  beep(440, 0.06, 0.08); setTimeout(() => beep(550, 0.06, 0.09), 100);
  showMessage(`❗ ${wildTrainer.name} wants to battle! Walk up to them.`);
  clearTimeout(trainerTimerId);
  trainerTimerId = setTimeout(() => { wildTrainer = null; scheduleSpawn(); }, 24000);  // wanders off if ignored
  return true;
}
function clearTrainer() { clearTimeout(trainerTimerId); wildTrainer = null; }

function spawnWild() {
  // Not in the overworld (menu/encounter)? Try again later — never let the
  // spawn loop die.
  if (gameState !== 'world') { scheduleSpawn(); return; }
  if (ZONE_INFO[currentZone].interior) return;   // no wild Lukeymon indoors

  clearWild();

  // Now and then a wandering trainer turns up instead, looking for a quick battle.
  if (!wildTrainer && Math.random() < 0.18 && spawnTrainer()) return;

  // Pick a random uncaught Pokémon for the current zone
  const pool = POKEMON_DATA.filter(p => p.zones.includes(currentZone) && !caughtIds.has(p.id) && !p.boss && !p.legend);
  if (pool.length === 0) { scheduleSpawn(); return; }
  const poke = pool[Math.floor(Math.random() * pool.length)];

  // Find all grass tiles in this zone (excluding edges)
  const map = MAPS[currentZone];
  const candidates = [];
  const { cols: sc, rows: sr } = ZONE_INFO[currentZone];
  for (let r = 1; r < sr - 1; r++) {
    for (let c = 1; c < sc - 1; c++) {
      if (map[r][c] === T.GRASS) candidates.push({ x: c, y: r });
    }
  }
  if (candidates.length === 0) { scheduleSpawn(); return; }

  const tile = candidates[Math.floor(Math.random() * candidates.length)];
  wildPoke = { poke, x: tile.x, y: tile.y, zone: currentZone, expireAt: Date.now() + WILD_TIMEOUT };

  // Rustle sound
  beep(350, 0.05, 0.07, 'sine');
  setTimeout(() => beep(290, 0.04, 0.09, 'sine'), 110);

  // If player is already standing there, trigger immediately
  if (playerX === tile.x && playerY === tile.y) {
    const p = wildPoke.poke;
    clearWild();
    beginEncounter(p);
    return;
  }

  // Auto-despawn after timeout
  expireTimerId = setTimeout(() => {
    wildPoke = null;
    scheduleSpawn();
  }, WILD_TIMEOUT);
}

let npcLines = [];   // resolved dialogue for the NPC currently being talked to

function talkNPC(npc) {
  currentNPC = npc;
  npcLineIdx = 0;
  npcLines = typeof npc.lines === 'function' ? npc.lines() : npc.lines;
  clearTimeout(spawnTimerId);

  const ne = document.getElementById('npc-emoji');
  if (npc.art) ne.innerHTML = '<img class="char-portrait" src="art/portrait/' + npc.art + '.png?v=' + ART_V + '" alt="" onerror="this.parentNode.textContent=\'' + npc.emoji + '\'">';
  else { ne.innerHTML = ''; ne.textContent = npc.emoji; }
  document.getElementById('npc-name').textContent  = npc.name;
  document.getElementById('npc-reward').classList.add('hidden');

  // One-time gift the first time you meet this character — but hold it back
  // for a big reveal once the conversation wraps up (see advanceNPC).
  if (!metNPCs.has(npc.name) && npc.gift > 0) {
    metNPCs.add(npc.name);
    pendingGift = npc.gift;
  } else {
    pendingGift = 0;
  }

  renderNpcLine();
  showScreen('npc');
}

function renderNpcLine() {
  document.getElementById('npc-text').textContent = npcLines[npcLineIdx];
  const last = npcLineIdx >= npcLines.length - 1;
  document.getElementById('npc-advance').textContent = last ? 'CLOSE ✓' : 'NEXT ▶';
  beep(440, 0.05, 0.06, 'sine');
  setTimeout(() => beep(550, 0.05, 0.07, 'sine'), 70);
}

function advanceNPC() {
  if (npcLineIdx >= npcLines.length - 1) {
    if (pendingGift > 0) { revealGift(pendingGift); return; }   // big reveal at the end
    closeNPC();
    return;
  }
  npcLineIdx++;
  renderNpcLine();
}

// The held-back gift, revealed once the conversation ends — a slightly smaller
// version of the badge-get celebration.
function revealGift(amount) {
  pendingGift = 0;
  coins += amount;
  updateHud();
  saveGame();

  document.getElementById('gift-badge').textContent = '💰';
  document.getElementById('gift-amount').textContent = `+${amount} coins`;
  showScreen('gift');
  playBadgeJingle();
  badgeConfetti(document.getElementById('gift-screen'));
}

function continueGift() {
  beep(523, 0.08, 0.08);
  closeNPC();
}

function closeNPC() {
  currentNPC = null;
  pendingGift = 0;
  showScreen('world');
  scheduleSpawn();
}

// Cached Image objects for drawing sprites onto the canvas (pixelated).
const _canvasSprites = {};
function canvasSprite(poke) {
  let img = _canvasSprites[poke.id];
  if (!img) { img = new Image(); img.src = poke.sprite; _canvasSprites[poke.id] = img; }
  return img;
}

// Draw fixed collectibles (bobbing) and NPCs for the current zone.
// ── Per-entity draws (collected into a y-sorted pass by drawWorld) ──
// NPC/character art (real sprites where available; emoji otherwise).
const _npcArt = {};
function npcArtImg(key) {
  if (!key) return null;
  let img = _npcArt[key];
  if (!img) { img = new Image(); img.src = 'art/npc/' + key + '.png?v=' + ART_V; _npcArt[key] = img; }
  return (img.complete && img.naturalWidth) ? img : null;
}
// Character field sprites: art/walk/<key>.png = a vertical strip of 4 facings
// (down, up, left, right). Portrait (shoulders-up) lives in art/portrait/<key>.png.
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
const _walkArt = {};
function walkSheet(key) {
  if (!key) return null;
  let img = _walkArt[key];
  if (!img) { img = new Image(); img.src = 'art/walk/' + key + '.png?v=' + ART_V; _walkArt[key] = img; }
  return (img.complete && img.naturalWidth) ? img : null;
}
const _portraitArt = {};
function portraitImg(key) {
  if (!key) return null;
  let img = _portraitArt[key];
  if (!img) { img = new Image(); img.src = 'art/portrait/' + key + '.png?v=' + ART_V; _portraitArt[key] = img; }
  return (img.complete && img.naturalWidth) ? img : null;
}
// Draw a character sprite with its feet near the tile's bottom (px = tile centre x,
// py = tile top y, both already in screen space).
function drawCharSprite(img, px, py, H) {
  const w = Math.round(H * img.naturalWidth / img.naturalHeight);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(px - w / 2), Math.round(py + TILE_SIZE - H + 2), w, H);
  ctx.imageSmoothingEnabled = prev;
}
// Draw a character's overworld sprite for a facing. Prefers the 4-row walk sheet,
// then a single sprite, then returns false so the caller can fall back to an emoji.
function drawCharField(key, dir, cx, py, H) {
  const sheet = walkSheet(key);
  if (sheet) {
    const cellW = sheet.naturalWidth, cellH = sheet.naturalHeight / 4;
    const row = DIR_ROW[dir] || 0;
    const w = Math.round(H * cellW / cellH);
    const dx = Math.round(cx - w / 2), dy = Math.round(py + TILE_SIZE - H + 1);
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, 0, row * cellH, cellW, cellH, dx, dy, w, H);
    ctx.imageSmoothingEnabled = prev;
    return true;
  }
  const single = npcArtImg(key);
  if (single) { drawCharSprite(single, cx, py, H); return true; }
  return false;
}
// A soft little drop-shadow at an entity's feet so it pops off the ground.
function drawShadow(centerX, footY, rx, alpha = 0.22) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(centerX, footY, rx, rx * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCollectibleE(c, ts) {
  const bob = Math.sin(ts * 0.005) * 3;
  const px = c.x * TILE_SIZE - camX + TILE_SIZE / 2;
  const py = c.y * TILE_SIZE - camY;
  drawShadow(px, py + TILE_SIZE - 5, 8);
  ctx.textAlign = 'center';
  ctx.font = '12px serif'; ctx.fillText('✨', px, py - 10 + bob);
  ctx.font = '20px serif'; ctx.fillText(c.emoji, px, py + 18 + bob);
}
function drawStoneE(s, ts) {
  const bob = Math.sin(ts * 0.005) * 3;
  const px = s.x * TILE_SIZE - camX + TILE_SIZE / 2;
  const py = s.y * TILE_SIZE - camY;
  drawShadow(px, py + TILE_SIZE - 5, 8);
  ctx.textAlign = 'center';
  ctx.font = '11px serif'; ctx.fillText('💎', px, py - 10 + bob);
  ctx.font = '20px serif'; ctx.fillText(STONES[s.stone].emoji, px, py + 18 + bob);
}
function drawNPCE(n, ts) {
  const px = n.x * TILE_SIZE - camX + TILE_SIZE / 2;
  const py = n.y * TILE_SIZE - camY;
  drawShadow(px, py + TILE_SIZE - 4, 11);
  if (n.art && drawCharField(n.art, 'down', px, py, 42)) return;
  ctx.textAlign = 'center'; ctx.font = '22px serif';
  ctx.fillText(n.emoji, px, py + 24 + Math.sin(ts * 0.004) * 2);
}
function drawTrainerE(t, ts) {
  const px = t.x * TILE_SIZE - camX + TILE_SIZE / 2;
  const py = t.y * TILE_SIZE - camY;
  drawShadow(px, py + TILE_SIZE - 4, 11);
  const bob = Math.sin(ts * 0.004) * 2;
  ctx.textAlign = 'center'; ctx.font = '22px serif';
  ctx.fillText(t.emoji, px, py + 24 + bob);
  ctx.font = '14px serif'; ctx.fillText('❗', px, py - 4 + Math.sin(ts * 0.006) * 2);   // "battle me!" tag
}
function drawRocketE(r, ts) {
  const bob = Math.sin(ts * 0.005) * 3;
  const px = r.x * TILE_SIZE - camX + TILE_SIZE / 2;
  const py = r.y * TILE_SIZE - camY;
  drawShadow(px, py + TILE_SIZE - 4, 11);
  ctx.textAlign = 'center';
  if (rocketDefeated.has(r.bird)) {
    const bird = POKEMON_DATA.find(p => p.id === r.bird);
    ctx.font = '13px serif';
    ctx.fillText('✨', px - 13, py + 6 + bob); ctx.fillText('✨', px + 13, py - bob);
    const img = canvasSprite(bird);
    if (img.complete && img.naturalWidth) {
      const h = 40, w = Math.round(h * img.naturalWidth / img.naturalHeight);
      const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(px - w / 2), Math.round(py + TILE_SIZE - h + bob), w, h);
      ctx.imageSmoothingEnabled = prev;
    } else { ctx.font = '26px serif'; ctx.fillText(bird.emoji, px, py + 24 + bob); }
  } else if (!(r.art && drawCharField(r.art, 'down', px, py, 44))) {   // sprite already wears the "R"
    ctx.font = '22px serif';
    ctx.fillText(r.emoji, px, py + 24 + Math.sin(ts * 0.004 + 1) * 2);
    ctx.fillStyle = '#e0202c'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('R', px + 9, py + 9);
  }
}
function drawRoamerE(r, ts) {
  const bob = Math.sin(ts * 0.005) * 3;
  const poke = POKEMON_DATA.find(p => p.id === r.pokeId);
  const px = r.x * TILE_SIZE - camX + TILE_SIZE / 2;
  const py = r.y * TILE_SIZE - camY;
  drawShadow(px, py + TILE_SIZE - 4, 11);
  ctx.textAlign = 'center'; ctx.font = '13px serif';
  ctx.fillText('✨', px - 14, py + 4 + bob);
  ctx.fillText('✨', px + 14, py - 2 - bob);
  const img = canvasSprite(poke);
  if (img.complete && img.naturalWidth) {
    const h = 40, w = Math.round(h * img.naturalWidth / img.naturalHeight);
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(px - w / 2), Math.round(py + TILE_SIZE - h + bob), w, h);
    ctx.imageSmoothingEnabled = prev;
  } else {
    ctx.font = '26px serif'; ctx.fillText(poke.emoji, px, py + 24 + bob);
  }
}
// Queue a tall structure sprite (building/tree) into the depth list, anchored at the
// tile's bottom and extending upward. Accepts an <img> or a pre-rendered canvas.
function pushStruct(sprites, img, c, r, targetH) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const w = Math.round(targetH * iw / ih);
  const bx = c * TILE_SIZE + TILE_SIZE / 2, by = (r + 1) * TILE_SIZE;
  sprites.push({ y: by, o: 0, draw: () => {
    const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(bx - camX - w / 2), Math.round(by - camY - targetH), w, targetH);
    ctx.imageSmoothingEnabled = prev;
  } });
}

// A ripple under the player while surfing on water.
function surfRipple(renderPos) {
  if (MAPS[currentZone][playerY][playerX] !== T.WATER || !canSurf()) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(220,240,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(renderPos.x - camX + TILE_SIZE / 2, renderPos.y - camY + TILE_SIZE - 4,
              TILE_SIZE * 0.42, TILE_SIZE * 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// A frosty skid-trail under the player while sliding on ice (no Ice buddy to
// keep your footing). Mirrors the surf ripple — a glossy sheen plus, when
// actually sliding, speed streaks trailing behind in the travel direction.
function iceTrail(renderPos, ts) {
  if (MAPS[currentZone][playerY][playerX] !== T.ICE || buddyHasType('Ice')) return;
  const cx = renderPos.x - camX + TILE_SIZE / 2;
  const cy = renderPos.y - camY + TILE_SIZE - 4;
  ctx.save();
  // glossy icy sheen under the feet
  ctx.strokeStyle = 'rgba(190,235,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE_SIZE * 0.40, TILE_SIZE * 0.15, 0, 0, Math.PI * 2);
  ctx.stroke();

  // speed streaks while a slide is in motion
  if (moveLinear) {
    const dirX = playerDir === 'left' ? -1 : playerDir === 'right' ? 1 : 0;
    const dirY = playerDir === 'up'   ? -1 : playerDir === 'down'  ? 1 : 0;
    for (let i = 1; i <= 3; i++) {
      ctx.strokeStyle = `rgba(215,248,255,${0.6 - i * 0.16})`;
      ctx.lineWidth = 2;
      const bx = cx - dirX * i * 7, by = cy - dirY * i * 7;
      ctx.beginPath();
      if (dirX !== 0) { ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); }
      else            { ctx.moveTo(bx - 6, by); ctx.lineTo(bx + 6, by); }
      ctx.stroke();
    }
  }

  // a couple of twinkling frost sparkles
  ctx.fillStyle = 'rgba(235,252,255,0.9)';
  for (let i = 0; i < 2; i++) {
    if ((Math.floor(ts * 0.01) + i) % 3 === 0) continue;   // twinkle on/off
    const sx = cx + (i === 0 ? -8 : 9), sy = cy - 2 - (i * 3);
    ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
  }
  ctx.restore();
}

function drawWild(ts) {
  if (!wildPoke || wildPoke.zone !== currentZone) return;

  const remaining = wildPoke.expireAt - Date.now();
  if (remaining <= 0) return;

  const px = wildPoke.x * TILE_SIZE - camX;
  const py = wildPoke.y * TILE_SIZE - camY;

  // Blink in final 2.5 s — every 300 ms
  if (remaining < 2500 && Math.floor(remaining / 300) % 2 === 0) return;

  // Off-screen? Pin an arrow to the edge so the player can hunt it down.
  const sx = px + TILE_SIZE / 2, sy = py + TILE_SIZE / 2;
  const margin = 18;
  if (sx < margin || sx > canvas.width - margin || sy < margin || sy > canvas.height - margin) {
    drawWildOffscreen(sx, sy, ts);
    return;
  }

  // A red "!" alert over the spawn tile. It pops in on appear (scale overshoot +
  // drop), then idles with a gentle bob and a side-to-side wiggle.
  const elapsed = WILD_TIMEOUT - remaining;
  const POP = 280;
  let scale, yoff;
  if (elapsed < POP) {
    const t = elapsed / POP;
    const c1 = 1.70158, c3 = c1 + 1;            // easeOutBack
    scale = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    yoff  = -10 * (1 - t);                        // drops down into place
  } else {
    scale = 1;
    yoff  = Math.sin(ts * 0.006) * 1.5;          // gentle idle bob
  }
  const wiggle = Math.sin(ts * 0.012) * 0.22;    // side-to-side wiggle

  ctx.save();
  ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2 + yoff);
  ctx.rotate(wiggle);
  ctx.scale(scale * 1.5, scale * 1.5);           // 1.5× bigger
  // dark outline
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-4, -12, 8, 15);
  ctx.fillRect(-4, 4, 8, 8);
  // red fill
  ctx.fillStyle = '#e81028';
  ctx.fillRect(-3, -11, 6, 13);
  ctx.fillRect(-3, 5, 6, 6);
  ctx.restore();
}

// A red "!" badge clamped to the screen edge, with an arrow pointing toward an
// off-screen wild spawn so you know which way to head.
function drawWildOffscreen(sx, sy, ts) {
  const W = canvas.width, H = canvas.height, pad = 26;
  const cx0 = W / 2, cy0 = H / 2;
  const dx = sx - cx0, dy = sy - cy0;
  // Project the direction onto the inset rectangle's border.
  const sc = 1 / Math.max(Math.abs(dx) / (W / 2 - pad), Math.abs(dy) / (H / 2 - pad), 1e-6);
  const ex = cx0 + dx * sc, ey = cy0 + dy * sc;
  const ang = Math.atan2(dy, dx);
  const pulse = 1 + Math.sin(ts * 0.008) * 0.12;

  ctx.save();
  ctx.translate(Math.round(ex), Math.round(ey));
  // soft glow
  ctx.fillStyle = 'rgba(232,16,40,0.22)';
  ctx.beginPath(); ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2); ctx.fill();
  // arrow tip pointing toward the spawn
  ctx.save();
  ctx.rotate(ang);
  ctx.fillStyle = '#e81028';
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(8, -6); ctx.lineTo(8, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  // disc with dark outline
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0, 0, 10.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e81028'; ctx.beginPath(); ctx.arc(0, 0,  8.5, 0, Math.PI * 2); ctx.fill();
  // the "!"
  ctx.fillStyle = '#fff';
  ctx.fillRect(-1.5, -6, 3, 7);
  ctx.fillRect(-1.5,  3, 3, 3);
  ctx.restore();
}

// ═══════════════════════════════════════════════════
// WORLD RENDERING
// ═══════════════════════════════════════════════════
function updateCamera(renderPos) {
  const { cols, rows } = ZONE_INFO[currentZone];
  const mapW = cols * TILE_SIZE;
  const mapH = rows * TILE_SIZE;
  const cx = renderPos.x + TILE_SIZE / 2 - canvas.width / 2;
  const cy = renderPos.y + TILE_SIZE / 2 - canvas.height / 2;
  // Maps smaller than the viewport (building interiors) are centred; larger ones follow the player.
  camX = mapW <= canvas.width  ? Math.round((mapW - canvas.width)  / 2) : Math.max(0, Math.min(cx, mapW - canvas.width));
  camY = mapH <= canvas.height ? Math.round((mapH - canvas.height) / 2) : Math.max(0, Math.min(cy, mapH - canvas.height));
}

// ═══════════════════════════════════════════════════
// WEATHER / TIME-OF-DAY OVERLAYS
// ═══════════════════════════════════════════════════
// A day↔night cycle runs on its own (fades through dusk/dawn); rain drifts in
// and out at random, except where a zone forces it ("rain") or forbids it
// ("norain"). Debug toggles can force night/rain for previewing.
const DAYNIGHT_CYCLE_MS = 600000;   // full cycle ≈ 5 min day / 5 min night — tweak here
let nightMode = false, rainMode = false, nightCycle = true, rainDrops = [];
let rainLevel = 0, rainTarget = 0, _rainNext = 0, _rainLastTs = 0;

// A player-centred "lantern" light field — the same mechanic as the cave darkness,
// reused for night so you keep a visible bubble around you. A Fire/light buddy
// widens it (buddyLightsCave), exactly like in caves.
function drawLightField(renderPos, ts, near, dim, far, rgb, warm, baseR, litR) {
  const lit = buddyLightsCave();
  const flick = lit ? Math.sin(ts * 0.009) * 0.08 + Math.sin(ts * 0.02) * 0.05 : 0;
  const R = (lit ? litR : baseR) + flick;
  const pcx = renderPos.x - camX + TILE_SIZE / 2, pcy = renderPos.y - camY + TILE_SIZE / 2;
  const { cols, rows } = ZONE_INFO[currentZone];
  const startC = Math.max(0, Math.floor(camX / TILE_SIZE)), endC = Math.min(cols, startC + 22);
  const startR = Math.max(0, Math.floor(camY / TILE_SIZE)), endR = Math.min(rows, startR + 16);
  for (let r = startR; r < endR; r++) {
    for (let c = startC; c < endC; c++) {
      const dxp = (c * TILE_SIZE - camX + TILE_SIZE / 2) - pcx;
      const dyp = (r * TILE_SIZE - camY + TILE_SIZE / 2) - pcy;
      const edge = Math.sqrt(dxp * dxp + dyp * dyp) / TILE_SIZE - R;
      const a = edge <= 0 ? near : edge <= 1.0 ? dim : far;
      const x = c * TILE_SIZE - camX, y = r * TILE_SIZE - camY;
      if (a > 0) { ctx.fillStyle = `rgba(${rgb},${a})`; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); }
      else if (warm && lit) { ctx.fillStyle = 'rgba(255,168,70,0.07)'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); }
    }
  }
}

// 0 = full day, 1 = full night, with smooth dusk/dawn fades.
function autoNight(ts) {
  const p = (ts % DAYNIGHT_CYCLE_MS) / DAYNIGHT_CYCLE_MS;
  const smooth = t => t * t * (3 - 2 * t);
  if (p < 0.45) return 0;                         // day
  if (p < 0.50) return smooth((p - 0.45) / 0.05); // dusk
  if (p < 0.95) return 1;                         // night
  return 1 - smooth((p - 0.95) / 0.05);           // dawn
}

// Roaming rain: occasionally starts/stops on its own and fades smoothly.
function updateRainState(ts) {
  if (!_rainLastTs) _rainLastTs = ts;
  const dt = Math.min(120, ts - _rainLastTs); _rainLastTs = ts;
  if (ts > _rainNext) {
    _rainNext = ts + 15000;                       // reconsider every 15s
    if (rainTarget < 0.5) { if (Math.random() < 0.06) rainTarget = 1; }  // starts now and then
    else { if (Math.random() < 0.12) rainTarget = 0; }                   // showers last a few minutes
  }
  rainLevel += Math.sign(rainTarget - rainLevel) * Math.min(Math.abs(rainTarget - rainLevel), 0.0004 * dt);
}
function zoneRain() {
  const w = ZONE_INFO[currentZone].weather;
  if (w === 'rain')   return 1;    // always (Dark Forest)
  if (w === 'norain') return 0;    // never  (Volcano)
  return rainLevel;                // elsewhere: the roaming weather
}

function drawWeather(ts, renderPos) {
  updateRainState(ts);                            // weather keeps evolving everywhere…
  const z = ZONE_INFO[currentZone];
  if (z.interior || z.base === T.CAVE) return;    // …but the sky only shows outdoors

  // ── Time of day ──  (cave-identical lantern when lit; only the outer night is lighter)
  const nf = nightMode ? 1 : (nightCycle ? autoNight(ts) : 0);
  if (nf > 0.01) {
    if (buddyLightsCave())
      drawLightField(renderPos, ts, 0.0, 0.55 * nf, 0.62 * nf, '10,15,42', true, 1.3, 4.3);
    else { ctx.fillStyle = `rgba(10,15,42,${0.62 * nf})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  // ── Rain ──
  const rf = rainMode ? 1 : zoneRain();
  if (rf > 0.01) {
    drawLightField(renderPos, ts, 0.0, 0.05 * rf, 0.12 * rf, '26,36,58', false, 4.0, 7.0);  // super-minimal darkening
    drawRain(ts, rf);
  }
}
function drawRain(ts, rf) {
  const W = canvas.width, H = canvas.height;
  if (!rainDrops.length || rainDrops._w !== W || rainDrops._h !== H) {
    rainDrops = []; rainDrops._w = W; rainDrops._h = H;
    const n = Math.round(W * H / 2000);     // plenty of drops — a real downpour
    for (let i = 0; i < n; i++) rainDrops.push({ x: Math.random() * W, y: Math.random() * H, l: 9 + Math.random() * 12, s: 9 + Math.random() * 7 });
  }
  ctx.save();
  ctx.strokeStyle = `rgba(190,210,245,${0.55 * rf})`; ctx.lineWidth = 1.1;
  const slant = 2.2;
  ctx.beginPath();
  for (const d of rainDrops) {
    ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - slant, d.y + d.l);
    d.y += d.s; d.x -= slant * 0.4;
    if (d.y > H) { d.y = -d.l; d.x = Math.random() * W; }
    if (d.x < 0) d.x += W;
  }
  ctx.stroke();
  ctx.restore();
}
// Console/debug helpers — force night or rain on/off for previewing.
function setNight(on) { nightMode = on === undefined ? !nightMode : !!on; return nightMode; }
function setRain(on)  { rainMode  = on === undefined ? !rainMode  : !!on;  return rainMode; }

function drawWorld(ts) {
  const renderPos = getRenderPos(ts);
  updateCamera(renderPos);

  ctx.fillStyle = '#000';                                  // letterbox around small interiors
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const map = MAPS[currentZone];
  const { cols, rows } = ZONE_INFO[currentZone];
  const startC = Math.max(0, Math.floor(camX / TILE_SIZE));
  const endC   = Math.min(cols, startC + 22);
  const startR = Math.max(0, Math.floor(camY / TILE_SIZE));
  const endR   = Math.min(rows, startR + 16);
  for (let r = startR; r < endR; r++) {
    for (let c = startC; c < endC; c++) {
      const t = map[r][c];
      // A structure (building, or a tree we have art for) sits on grass; its body is
      // drawn later in the depth pass. Everything else just uses its own tile art.
      const isBuild = t === T.HOUSE || t === T.SHOP || t === T.HOSPITAL || t === T.GYM;
      const isStruct = isBuild || (t === T.TREE && treeArtImg(currentZone));
      const groundId = isBuild ? (ZONE_INFO[currentZone].base === T.CITY ? T.CITY : T.GRASS)
                               : (isStruct ? T.GRASS : t);
      const cnt = TILE_ART[currentZone] && TILE_ART[currentZone][groundId];
      const dx = c * TILE_SIZE - camX, dy = r * TILE_SIZE - camY;
      let drew = false;
      if (cnt) {
        const img = tileArtImg(currentZone, groundId, tileVariant(currentZone, r, c, cnt));
        if (img) { ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE); drew = true; }
      }
      if (!drew) {                                    // procedural fallback
        const variants = tileCache[groundId];
        ctx.drawImage(variants[tileVariant(currentZone, r, c, variants.length)], dx, dy);
      }
    }
  }
  const zoneTints = {
    4: 'rgba(255,80,0,0.14)',
    5: 'rgba(0,30,0,0.22)',
    6: 'rgba(160,210,255,0.16)',
    7: 'rgba(220,170,50,0.08)',
  };
  if (zoneTints[currentZone]) {
    ctx.fillStyle = zoneTints[currentZone];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawBarriers(ts);

  // ── Depth pass: tall structures + actors drawn back-to-front by their foot Y,
  //    so the player/buddy/NPCs are correctly occluded by buildings (and, later,
  //    tall trees). At an equal foot Y, structures (o:0) draw behind actors (o:1).
  const sprites = [];
  for (let r = startR; r < Math.min(rows, endR + 2); r++) {
    for (let c = startC; c < endC; c++) {
      const t = map[r][c];
      if (t === T.HOUSE) { const h = houseArtImg(); pushStruct(sprites, h || buildingSprites[T.HOUSE], c, r, h ? 62 : 58); }
      else if (t === T.SHOP) { const s = shopArtImg(); pushStruct(sprites, s || buildingSprites[T.SHOP], c, r, s ? 62 : 58); }
      else if (t === T.HOSPITAL) { pushStruct(sprites, buildingSprites[T.HOSPITAL], c, r, 60); }
      else if (t === T.GYM)      { pushStruct(sprites, buildingSprites[T.GYM],      c, r, 60); }
      else if (t === T.TREE) { const tr = treeArtImg(currentZone); if (tr) pushStruct(sprites, tr, c, r, 54); }
    }
  }
  // Interior décor props (furniture) — y-sorted like structures so the player
  // walks correctly behind/in front of them.
  for (const d of (DECOR[currentZone] || [])) {
    const img = decorImg(d.s);
    if (img) pushStruct(sprites, img, d.x, d.y, Math.min(64, Math.round((img.naturalHeight || 32) * DECOR_SCALE)));
  }
  for (const c of COLLECTIBLES)
    if (c.zone === currentZone && !collected.has(c.id)) sprites.push({ y: (c.y + 1) * TILE_SIZE, o: 1, draw: () => drawCollectibleE(c, ts) });
  for (const s of STONE_FINDS)
    if (s.zone === currentZone && !foundStones.has(s.id)) sprites.push({ y: (s.y + 1) * TILE_SIZE, o: 1, draw: () => drawStoneE(s, ts) });
  for (const n of NPCS)
    if (n.zone === currentZone) sprites.push({ y: (n.y + 1) * TILE_SIZE, o: 1, draw: () => drawNPCE(n, ts) });
  if (wildTrainer && wildTrainer.zone === currentZone)
    sprites.push({ y: (wildTrainer.y + 1) * TILE_SIZE, o: 1, draw: () => drawTrainerE(wildTrainer, ts) });
  for (const r of ROCKETS)
    if (r.zone === currentZone && !caughtIds.has(r.bird)) sprites.push({ y: (r.y + 1) * TILE_SIZE, o: 1, draw: () => drawRocketE(r, ts) });
  for (const r of roamers)
    if (r.zone === currentZone) sprites.push({ y: (r.y + 1) * TILE_SIZE, o: 1, draw: () => drawRoamerE(r, ts) });
  if (activePet != null) {
    const prp = getPetRenderPos(ts);
    sprites.push({ y: prp.y + TILE_SIZE, o: 1, draw: () => drawPet(ts) });
  }
  sprites.push({ y: renderPos.y + TILE_SIZE, o: 1, draw: () => { surfRipple(renderPos); iceTrail(renderPos, ts); drawPlayer(renderPos.x - camX, renderPos.y - camY); } });
  if (window.MP) MP.collectSprites(sprites, ts);
  sprites.sort((a, b) => a.y - b.y || a.o - b.o);
  sprites.forEach(s => s.draw());

  drawWild(ts);
  drawBuddyNotes(ts);

  // Cave darkness — old-school, lit block-by-block. Each tile gets one of a few
  // discrete darkness levels by its distance from the player, making stepped
  // concentric rings (no smooth gradient). The lit radius is large only with a
  // glowing buddy (Fire types, etc.); otherwise it's a tiny sliver.
  if (ZONE_INFO[currentZone].base === T.CAVE) {
    const lit = buddyLightsCave();
    const flick = lit ? Math.sin(ts * 0.009) * 0.08 + Math.sin(ts * 0.02) * 0.05 : 0; // gentle torch flicker
    const R = (lit ? 4.3 : 1.3) + flick;   // lit radius, in tiles
    const pcx = renderPos.x - camX + TILE_SIZE / 2;
    const pcy = renderPos.y - camY + TILE_SIZE / 2;
    for (let r = startR; r < endR; r++) {
      for (let c = startC; c < endC; c++) {
        const dxp = (c * TILE_SIZE - camX + TILE_SIZE / 2) - pcx;
        const dyp = (r * TILE_SIZE - camY + TILE_SIZE / 2) - pcy;
        const edge = Math.sqrt(dxp * dxp + dyp * dyp) / TILE_SIZE - R; // tiles past the lit edge
        let a;
        if      (edge <= 0)   a = 0;      // fully lit
        else if (edge <= 1.0) a = 0.55;   // one dim ring
        else                  a = 1;      // pitch black
        const x = c * TILE_SIZE - camX, y = r * TILE_SIZE - camY;
        if (a > 0) {
          ctx.fillStyle = a >= 1 ? '#000' : `rgba(4,3,14,${a})`;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        } else if (lit) {                  // faint warm torch tint on fully-lit tiles
          ctx.fillStyle = 'rgba(255,168,70,0.07)';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  drawWeather(ts, renderPos);
}

// A Jigglypuff buddy sings — emit little music notes that drift up and fade.
function drawBuddyNotes(ts) {
  if (activePet === JIGGLYPUFF_ID && caughtIds.has(JIGGLYPUFF_ID)) {
    if (ts - lastNoteTs > 460) {
      lastNoteTs = ts;
      const rp = getPetRenderPos(ts);
      const chars = ['🎵', '🎶', '♪', '♫'];
      noteParticles.push({
        x: rp.x + TILE_SIZE / 2 + (Math.random() * 12 - 6),
        y: rp.y + 2,
        born: ts,
        char: chars[Math.floor(Math.random() * chars.length)],
        sway: Math.random() * Math.PI * 2,
      });
    }
  }
  if (!noteParticles.length) return;
  const LIFE = 1500;
  noteParticles = noteParticles.filter(n => ts - n.born < LIFE);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of noteParticles) {
    const t = (ts - n.born) / LIFE;
    const sx = n.x + Math.sin(n.sway + t * 5) * 7 - camX;
    const sy = n.y - t * 38 - camY;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.font = Math.round(13 + t * 5) + 'px serif';
    ctx.fillStyle = '#ffc8ec';   // (emoji notes keep their own colour)
    ctx.fillText(n.char, sx, sy);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Draw the buddy Pokémon trailing the player (small sprite, idle bob).
function drawPet(ts) {
  if (activePet == null) return;
  const poke = POKEMON_DATA.find(p => p.id === activePet);
  if (!poke || !caughtIds.has(poke.id)) return;
  const rp = getPetRenderPos(ts);
  const px = rp.x - camX, py = rp.y - camY;
  drawShadow(px + TILE_SIZE / 2, py + TILE_SIZE - 4, 12);
  const img = canvasSprite(poke);
  if (img.complete && img.naturalWidth) {
    // Oversized (taller than a tile) so the buddy reads clearly.
    const h = 46, w = Math.round(h * img.naturalWidth / img.naturalHeight);
    const dx = Math.round(px + (TILE_SIZE - w) / 2);
    const dy = Math.round(py + TILE_SIZE - h + 5);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (petFacing === 1) {            // sprites face left by default → flip when moving right
      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy, w, h);
    }
    ctx.imageSmoothingEnabled = prev;
  } else {
    ctx.font = '32px serif';
    ctx.textAlign = 'center';
    ctx.save();
    if (petFacing === 1) {
      ctx.translate(px + TILE_SIZE, 0); ctx.scale(-1, 1);
      ctx.fillText(poke.emoji, TILE_SIZE / 2, py + TILE_SIZE - 2);
    } else {
      ctx.fillText(poke.emoji, px + TILE_SIZE / 2, py + TILE_SIZE - 2);
    }
    ctx.restore();
  }
}

// ─── Barrier graphics ────────────────────────────────
function drawBarriers(ts) {
  const zoneExits = EXITS.filter(e => e.from === currentZone);
  for (const exit of zoneExits) {
    if (!exit.barrier || isBarrierUnlocked(exit.barrier)) continue;
    const signEmoji = BARRIERS[exit.barrier].sign;
    const midP = exit.pos[Math.floor(exit.pos.length / 2)];
    const { cols: zc, rows: zr } = ZONE_INFO[currentZone];
    for (const p of exit.pos) {
      let bx, by;
      if      (exit.dir === 'south') { bx = p * TILE_SIZE - camX; by = (zr - 1) * TILE_SIZE - camY; }
      else if (exit.dir === 'north') { bx = p * TILE_SIZE - camX; by = 0 - camY; }
      else if (exit.dir === 'west')  { bx = 0 - camX; by = p * TILE_SIZE - camY; }
      else if (exit.dir === 'east')  { bx = (zc - 1) * TILE_SIZE - camX; by = p * TILE_SIZE - camY; }
      drawBarrierTile(ctx, exit.barrier, bx, by, ts);
    }
    // Draw a floating emoji sign above / beside the middle barrier tile
    let sx, sy;
    if      (exit.dir === 'south') { sx = midP * TILE_SIZE + 4 - camX; sy = (zr - 2) * TILE_SIZE + 4 - camY; }
    else if (exit.dir === 'north') { sx = midP * TILE_SIZE + 4 - camX; sy = TILE_SIZE + 4 - camY; }
    else if (exit.dir === 'west')  { sx = TILE_SIZE + 4 - camX;        sy = midP * TILE_SIZE + 4 - camY; }
    else                           { sx = (zc - 2) * TILE_SIZE + 4 - camX; sy = midP * TILE_SIZE + 4 - camY; }
    const bob = Math.sin(ts * 0.003) * 3;
    ctx.font = '22px serif';
    ctx.textAlign = 'left';
    ctx.fillText(signEmoji, sx, sy + bob + 20);
  }
}

function drawBarrierTile(ctx, key, bx, by, ts) {
  if (key === 'log') {
    ctx.fillStyle = '#5C2A0A';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(bx + 1, by + 2 + i * 7, 30, 5);
      ctx.fillStyle = '#A0522D';
      ctx.fillRect(bx + 1, by + 2 + i * 7, 30, 2);
    }
    ctx.fillStyle = '#4a1a05';
    ctx.fillRect(bx + 5, by + 3, 3, 3);
    ctx.fillRect(bx + 22, by + 10, 3, 3);
  } else if (key === 'rock') {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    const rocks = [
      { cx: 6,  cy: 4,  rx: 14, ry: 12 },
      { cx: 18, cy: 6,  rx: 10, ry: 10 },
      { cx: 4,  cy: 18, rx: 12, ry: 10 },
      { cx: 20, cy: 20, rx: 8,  ry: 8  },
    ];
    for (const r of rocks) {
      ctx.fillStyle = '#707070';
      ctx.beginPath();
      ctx.ellipse(bx + r.cx + r.rx/2, by + r.cy + r.ry/2, r.rx/2, r.ry/2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#909090';
      ctx.beginPath();
      ctx.ellipse(bx + r.cx + r.rx/2 - r.rx/3 + 1, by + r.cy + r.ry/2 - r.ry/3 + 1, r.rx/4, r.ry/4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (key === 'fence') {
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    // Posts
    ctx.fillStyle = '#555';
    ctx.fillRect(bx + 3, by + 1, 5, 30);
    ctx.fillRect(bx + 24, by + 1, 5, 30);
    // Animated wires
    const sparking = Math.sin(ts * 0.008) > 0;
    ctx.strokeStyle = sparking ? '#ffff44' : '#cc9900';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 8, by + 9);
    ctx.lineTo(bx + 24, by + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + 8, by + 21);
    ctx.lineTo(bx + 24, by + 21);
    ctx.stroke();
    // Insulator blobs
    ctx.fillStyle = '#cc4400';
    ctx.fillRect(bx + 6, by + 7, 4, 4);
    ctx.fillRect(bx + 6, by + 19, 4, 4);
    // Spark dots
    if (sparking) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + 14, by + 7, 2, 2);
      ctx.fillRect(bx + 18, by + 19, 2, 2);
    }
  } else if (key === 'vine') {
    ctx.fillStyle = '#1a4010';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#3a7020';
    ctx.fillRect(bx + 5,  by, 4, TILE_SIZE);
    ctx.fillRect(bx + 13, by, 4, TILE_SIZE);
    ctx.fillRect(bx + 21, by, 4, TILE_SIZE);
    ctx.fillStyle = '#50a030';
    [[3,6,8,6],[11,12,8,6],[19,4,8,6],[5,20,6,6],[15,18,8,6]].forEach(([lx,ly,lw,lh]) => {
      ctx.fillRect(bx+lx, by+ly, lw, lh);
    });
    ctx.fillStyle = '#70c050';
    [[4,7,4,3],[12,13,4,3],[20,5,4,3]].forEach(([lx,ly,lw,lh]) => {
      ctx.fillRect(bx+lx, by+ly, lw, lh);
    });
  } else if (key === 'frost') {
    ctx.fillStyle = '#a0c8e8';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#d8eeff';
    ctx.fillRect(bx+2, by+2, 12, 28);
    ctx.fillRect(bx+16, by+6, 12, 22);
    ctx.fillStyle = '#b8d8f8';
    ctx.fillRect(bx+4, by+8, 6, 16);
    ctx.fillRect(bx+18, by+4, 8, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx+6,  by+4,  2, 8);
    ctx.fillRect(bx+4,  by+8,  8, 2);
    ctx.fillRect(bx+20, by+10, 2, 8);
    ctx.fillRect(bx+18, by+14, 8, 2);
  } else if (key === 'sand') {
    ctx.fillStyle = '#c89828';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#b88020';
      ctx.fillRect(bx, by + i * 8, TILE_SIZE, 7);
      ctx.fillStyle = '#d0a030';
      ctx.fillRect(bx + (i % 2 === 0 ? 0 : 14), by + i * 8, 14, 6);
    }
    ctx.fillStyle = '#e8c040';
    [[4,2,3,3],[16,10,3,3],[8,18,3,3],[22,26,3,3]].forEach(([lx,ly,lw,lh]) => {
      ctx.fillRect(bx+lx, by+ly, lw, lh);
    });
  } else if (key === 'lava') {
    ctx.fillStyle = '#c03010';
    ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#ff6010';
    ctx.fillRect(bx, by,      TILE_SIZE, 6);
    ctx.fillRect(bx, by + 12, TILE_SIZE, 6);
    ctx.fillRect(bx, by + 24, TILE_SIZE, 6);
    ctx.fillStyle = '#ffaa30';
    ctx.beginPath();
    ctx.ellipse(bx+8,  by+9,  5, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx+22, by+21, 4, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffd060';
    ctx.fillRect(bx+6,  by+8,  2, 2);
    ctx.fillRect(bx+20, by+20, 2, 2);
  }
}

function drawPlayer(px, py) {
  drawShadow(px + TILE_SIZE / 2, py + TILE_SIZE - 4, 11);
  // Explorer field sprite (4-row facing sheet); falls back to the pixel sprite.
  if (drawCharField('player', playerDir, px + TILE_SIZE / 2, py, 38)) return;
  const rows   = PLAYER_SPRITE[playerDir];
  const scale  = 3;
  const pw     = 8 * scale;
  const ph     = 10 * scale;
  const ox     = px + Math.floor((TILE_SIZE - pw) / 2);
  const oy     = py + Math.floor((TILE_SIZE - ph) / 2);

  // Walk bob: shift legs row slightly on odd steps
  const legBob = playerStep === 1 ? 1 : 0;

  rows.forEach((row, ri) => {
    const keys = row.split(' ');
    keys.forEach((k, ci) => {
      const color = PLAYER_PALETTE[k];
      if (!color) return;
      // shift legs slightly for walk animation
      const yExtra = ri >= 8 ? legBob : 0;
      ctx.fillStyle = color;
      ctx.fillRect(ox + ci * scale, oy + ri * scale + yExtra, scale, scale);
    });
  });
}

// ═══════════════════════════════════════════════════
// ENCOUNTER
// ═══════════════════════════════════════════════════
function beginEncounter(poke, roamer = null) {
  encHappy = false;
  encTries = 0;
  currentPoke = poke;
  currentLegend = roamer;
  gameState   = 'encounter';
  seenIds.add(poke.id);
  learnTip('befriend');

  clearWild();
  clearTimeout(spawnTimerId);

  // Reset throw animation from previous encounter
  const pokeWrap = document.getElementById('enc-pokemon-wrap');
  pokeWrap.style.animation = '';
  pokeWrap.style.opacity   = '';
  pokeWrap.style.transform = '';
  document.getElementById('throw-ball').classList.add('hidden');

  document.getElementById('enc-name').textContent      = poke.name;
  document.getElementById('enc-type-badge').textContent = poke.type;
  document.getElementById('enc-type-badge').style.background = typeColor(poke.type);
  setPokeDisplay(document.getElementById('enc-emoji-display'), poke, 120);
  document.getElementById('enc-bottom').classList.remove('hidden');
  document.getElementById('enc-thought-emoji').textContent   = poke.actionEmoji;

  // Enable/reset buttons
  document.querySelectorAll('.action-btn').forEach(b => {
    b.disabled = false;
    b.classList.remove('correct', 'wrong');
  });
  document.getElementById('enc-throw-wrap').classList.add('hidden');
  document.getElementById('enc-no-balls-msg').classList.add('hidden');
  document.getElementById('enc-buttons').classList.remove('hidden');
  // Restore the taming info for this fresh encounter (hidden once tamed).
  document.getElementById('enc-thought-bubble').classList.remove('hidden');
  const prompt = document.getElementById('enc-prompt');
  prompt.classList.remove('hidden');
  prompt.textContent = 'What does it want?';
  document.getElementById('timer-wrap').classList.remove('hidden');

  showScreen('encounter');
  flashScreen();
  playEncounterJingle();
  startTimer();
}

function startTimer() {
  clearTimeout(timerId);
  const fill = document.getElementById('timer-fill');
  fill.style.transition = 'none';
  fill.style.width = '100%';
  fill.style.background = 'linear-gradient(90deg,#e0a020,#e04020)';

  // Trigger reflow then animate
  fill.getBoundingClientRect();
  fill.style.transition = `width ${TIMER_MS}ms linear`;
  fill.style.width = '0%';

  timerStart = Date.now();
  timerId = setTimeout(() => encounterFailed(), TIMER_MS);
}

// A failed encounter: legendaries slip away and relocate; others just flee.
function encounterFailed() {
  if (currentLegend) legendaryEscaped();
  else fled();
}

function resolveAction(action, btnEl) {
  clearTimeout(timerId);
  document.querySelectorAll('.action-btn').forEach(b => b.disabled = true);

  if (action === currentPoke.action) {
    encHappy = true;
    btnEl.classList.add('correct');
    beep(523, 0.12, 0.1);
    setTimeout(() => beep(659, 0.12, 0.15), 120);
    // Tamed! Clear away the taming info — just leave the THROW button.
    const legend = currentLegend;
    setTimeout(() => {
      document.getElementById('enc-buttons').classList.add('hidden');
      document.getElementById('enc-thought-bubble').classList.add('hidden');
      document.getElementById('enc-prompt').classList.add('hidden');
      document.getElementById('timer-wrap').classList.add('hidden');
      document.getElementById('enc-throw-wrap').classList.remove('hidden');
      const haveBall = legend ? masterBalls > 0 : balls > 0;
      document.getElementById('enc-happy-msg').textContent = legend
        ? '✨ It trusts you! Throw the Master Ball!'
        : "❤️ It's happy!  Throw a PokéBall!";
      document.getElementById('enc-throw-btn').innerHTML = legend
        ? '🟣 Throw Master Ball!'
        : '<span class="pb"></span> Throw!';
      if (!haveBall) {
        document.getElementById('enc-no-balls-msg').classList.remove('hidden');
        document.getElementById('enc-throw-btn').disabled = true;
        setTimeout(() => encounterFailed(), 4000);
      } else {
        document.getElementById('enc-throw-btn').disabled = false;
        document.getElementById('enc-no-balls-msg').classList.add('hidden');
      }
      setNav([document.getElementById('enc-throw-btn')]);   // A throws the ball
    }, 400);
  } else {
    encTries++;
    btnEl.classList.add('wrong');
    btnEl.disabled = true;
    beep(196, 0.12, 0.18, 'square');                       // a soft "not quite"

    if (encTries < 2) {                                    // one gentle second chance
      document.getElementById('enc-prompt').textContent = "Hmm… it's still a little wary. Look again!";
      const left = Array.from(document.querySelectorAll('.action-btn')).filter(b => !b.classList.contains('wrong'));
      left.forEach(b => b.disabled = false);
      startTimer();                                        // a fresh moment to choose
      setNav(left, { cols: 3 });
      return;
    }

    // Out of patience — reveal what it wanted, then it slips away.
    document.querySelectorAll('.action-btn').forEach(b => {
      if (b.dataset.action === currentPoke.action) b.classList.add('correct');
    });
    setTimeout(() => encounterFailed(), 900);
  }
}

function throwBall() {
  if (currentLegend) {
    if (masterBalls <= 0) return;
    masterBalls--;
  } else {
    if (balls <= 0) return;
    balls--;
  }
  updateHud();
  saveGame();

  document.getElementById('enc-throw-btn').disabled = true;
  document.getElementById('enc-bottom').classList.add('hidden');   // instructions go away on throw

  const ballEl   = document.getElementById('throw-ball');
  const pokeWrap = document.getElementById('enc-pokemon-wrap');

  // Reset
  ballEl.style.animation   = 'none';
  pokeWrap.style.animation = '';
  pokeWrap.style.opacity   = '1';
  ballEl.classList.remove('hidden');

  // Phase 1 — ball spins upward (0–380ms)
  beep(420, 0.18, 0.1);
  setTimeout(() => beep(310, 0.14, 0.1), 130);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ballEl.style.animation = 'ball-fly 0.38s ease-in forwards';
  }));

  // Phase 2 — impact thud + pokemon wiggles (380ms)
  setTimeout(() => {
    ballEl.classList.add('hidden');
    beep(180, 0.25, 0.1, 'square');
    setTimeout(() => beep(140, 0.2, 0.15, 'square'), 75);
    pokeWrap.style.animation = 'poke-wiggle 0.58s ease-in-out forwards';
  }, 370);

  // Phase 3 — pokemon shrinks into the ball (1000ms)
  setTimeout(() => {
    beep(120, 0.15, 0.55, 'square');
    pokeWrap.style.animation = 'poke-shrink 0.55s ease-in forwards';
  }, 1000);

  // Phase 4 — the ball drops in and wiggles 2× before the catch confirms.
  setTimeout(() => {
    const screen = document.getElementById('encounter-screen');
    const wR = pokeWrap.getBoundingClientRect();
    const sR = screen.getBoundingClientRect();
    ballWiggleFinale(screen, !!currentLegend, {
      left: Math.round((wR.left - sR.left) + wR.width / 2) + 'px',
      top:  Math.round((wR.top  - sR.top)  + wR.height / 2) + 'px',
      marginLeft: '-21px', marginTop: '-21px',
    }, caught);
  }, 1560);
}

// Traditional capture finale: a big ball tosses into place and wiggles twice
// (click… click…) before a confirming chime, then onDone. Used by every catch.
function ballWiggleFinale(container, isMaster, place, onDone) {
  const ball = document.createElement('div');
  ball.className = 'capture-ball' + (isMaster ? ' master' : '');
  Object.assign(ball.style, place);
  container.appendChild(ball);

  ball.style.animation = 'ball-toss 0.42s ease-out forwards';
  beep(180, 0.16, 0.12, 'square');                       // ball lands
  setTimeout(() => beep(140, 0.14, 0.13, 'square'), 80);

  setTimeout(() => {                                      // two wiggles (rock side to side)
    ball.style.animation = 'ball-wiggle 0.55s ease-in-out 2';
    beep(330, 0.05, 0.1);
    setTimeout(() => beep(330, 0.05, 0.1), 560);
  }, 430);

  // …then a tense beat with the ball still before the catch confirms.
  setTimeout(() => {                                      // caught!
    beep(660, 0.1, 0.12);
    setTimeout(() => beep(880, 0.16, 0.14), 120);
    ball.remove();
    onDone && onDone();
  }, 430 + 1100 + 750);
}

// Battle capture: you SEE the (Master) Ball thrown in an arc from the bottom up to
// the boss, which is then sucked in; the ball settles and wiggles twice before the
// catch confirms.
function battleCapture(isMaster, onDone) {
  const stage = document.getElementById('battle-screen');
  const boss  = document.getElementById('battle-mewtwo');
  document.getElementById('battle-win').classList.add('hidden');

  const sR = stage.getBoundingClientRect();
  const bR = boss.getBoundingClientRect();
  const cx = Math.round((bR.left - sR.left) + bR.width / 2);   // ball's resting spot
  const cy = Math.round((bR.top  - sR.top)  + bR.height / 2);

  const ball = document.createElement('div');
  ball.className = 'capture-ball' + (isMaster ? ' master' : '');
  ball.style.left = cx + 'px';
  ball.style.top  = cy + 'px';
  ball.style.marginLeft = '-21px';
  ball.style.marginTop  = '-21px';
  stage.appendChild(ball);

  // Where the throw starts (bottom-centre, "from the trainer") relative to rest.
  const dx = Math.round(sR.width / 2 - cx);
  const dy = Math.round(sR.height - 26 - cy);

  beep(440, 0.16, 0.1);                       // whoosh of the throw
  setTimeout(() => beep(320, 0.12, 0.1), 120);

  const onLanded = () => {
    boss.style.animation = 'poke-shrink 0.45s ease-in forwards';   // sucked in
    beep(180, 0.22, 0.12, 'square');
    setTimeout(() => beep(140, 0.18, 0.14, 'square'), 80);
    setTimeout(() => {
      boss.style.visibility = 'hidden';
      boss.style.animation  = '';
      ball.style.animation  = 'ball-wiggle 0.55s ease-in-out 2';    // wiggle ×2
      beep(330, 0.05, 0.1);
      setTimeout(() => beep(330, 0.05, 0.1), 560);
      setTimeout(() => {                                            // caught!
        beep(660, 0.1, 0.12);
        setTimeout(() => beep(880, 0.16, 0.14), 120);
        ball.remove();
        boss.style.visibility = '';
        onDone && onDone();
      }, 1100 + 750);   // hold a tense beat after the rock
    }, 440);
  };

  if (ball.animate) {
    const a = ball.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(-340deg)`, opacity: 0.3, offset: 0, easing: 'cubic-bezier(.25,.6,.4,1)' },
      { transform: `translate(${Math.round(dx * 0.45)}px, ${Math.round(dy * 0.45) - 30}px) scale(0.9) rotate(-110deg)`, opacity: 1, offset: 0.55 },
      { transform: 'translate(0,0) scale(1.08) rotate(0deg)', opacity: 1, offset: 0.85 },
      { transform: 'translate(0,0) scale(1) rotate(0deg)',    opacity: 1, offset: 1 },
    ], { duration: 580, fill: 'forwards' });
    a.onfinish = onLanded;
  } else {
    setTimeout(onLanded, 560);
  }
}

const NEW_CATCH_BOUNTY = 5; // coins awarded for each newly-discovered species

function caught() {
  const isNew  = !caughtIds.has(currentPoke.id);
  const legend = currentLegend;
  caughtIds.add(currentPoke.id);
  seenIds.add(currentPoke.id);
  if (isNew) coins += NEW_CATCH_BOUNTY;   // reward discovering a new species

  // Your very first catch automatically becomes your buddy, so the
  // follow-me feature is discoverable. Swap buddies anytime in the Pokédex.
  let becameBuddy = false;
  if (activePet == null) {
    activePet = currentPoke.id;
    petX = playerX; petY = playerY;
    petFromPx.x = petX * TILE_SIZE; petFromPx.y = petY * TILE_SIZE;
    petMoveAnimTs = -9999;
    becameBuddy = true;
  }
  if (legend) {                       // remove the captured roamer from the world
    roamers = roamers.filter(r => r !== legend);
    currentLegend = null;
  }
  awardTrioBadge();                   // catching the 3rd legendary bird grants a badge
  refreshRoamers();                   // may now make Mewtwo appear

  // Just completed every WILD species (legendaries still out there)? Nudge the hunt.
  if (isNew && !legend && !pendingMsg) {
    const wildLeft    = POKEMON_DATA.filter(p => !p.legend && !p.boss && !caughtIds.has(p.id)).length;
    const legendsLeft = POKEMON_DATA.some(p => (p.legend || p.boss) && !caughtIds.has(p.id));
    if (wildLeft === 0 && legendsLeft)
      pendingMsg = '🌟 Every wild Lukeymon caught! Now track down the legends — the birds, Mew & Mewtwo.';
  }

  saveGame();
  updateHud();

  document.getElementById('result-stars').classList.remove('hidden');
  setPokeDisplay(document.getElementById('result-icon'), currentPoke, 80);
  document.getElementById('result-title').textContent   = legend ? '🌟 LEGENDARY! 🌟'
                                                        : isNew  ? '✨ GOT IT! ✨'
                                                                 : '⭐ CAUGHT AGAIN! ⭐';
  document.getElementById('result-name').textContent    = currentPoke.name;
  document.getElementById('result-message').textContent = becameBuddy
    ? `${currentPoke.name} is now your buddy — it'll follow you around! 🐾  (Pick a different buddy anytime in the PokéDex.)`
    : isNew
      ? `Added to your PokéDex!  +${NEW_CATCH_BOUNTY} 💰`
      : 'Already in your PokéDex — great job anyway!';

  const rs = document.getElementById('result-screen');
  rs.className = 'screen active success';
  showScreen('result');
  playCatchJingle();

  if (caughtIds.size === POKEMON_DATA.length) {
    setTimeout(showComplete, 2200);
  }
}

// Catching Articuno + Zapdos + Moltres grants the Trio Badge automatically.
function awardTrioBadge() {
  const birds = [144, 145, 146];
  if (birds.every(id => caughtIds.has(id)) && !collected.has('badge_trio')) {
    collected.add('badge_trio');
    masterBalls++;                    // a guaranteed Master Ball toward a legendary
    pendingMsg = '🦅 The legendary birds bond with you — Trio Badge earned, plus a 🟣 Master Ball!';
  }
}

function fled() {
  document.getElementById('result-stars').classList.add('hidden');
  const iconEl = document.getElementById('result-icon');
  iconEl.innerHTML = '<span style="font-size:64px">💨</span>';
  document.getElementById('result-title').textContent   = 'IT GOT AWAY!';
  document.getElementById('result-name').textContent    = currentPoke.name;
  document.getElementById('result-message').textContent = 'Try again — walk in the grass!';

  const rs = document.getElementById('result-screen');
  rs.className = 'screen active fled';
  showScreen('result');
  playFledSound();
}

function returnToWorld() {
  // The 4th land badge was just collected — segue from BADGE GET into the Champion screen.
  if (pendingChampion) { pendingChampion = false; showChampion(); return; }
  showScreen('world');
  scheduleSpawn();
  if (pendingMsg) { showMessage(pendingMsg); pendingMsg = null; }
  else checkEvoNotify();   // a battle may have just made something ready to evolve
}

// Initial victory: all four land badges earned. A "you won!" beat that leaves the
// legendaries, Mew/Mewtwo, the caves and the full dex as optional post-game.
function showChampion() {
  wonGame = true;
  masterBalls++;                       // a guaranteed Master Ball for hunting the legends
  pendingMsg = '🟣 Champion! Take this Master Ball and track down Mew & Mewtwo.';
  saveGame();
  const row = document.getElementById('champion-row');
  row.innerHTML = '';
  LAND_BADGES.forEach(id => {
    const c = COLLECTIBLES.find(b => b.id === id);
    const s = document.createElement('span');
    s.textContent = c ? c.emoji : '🏅';
    s.style.margin = '0 2px';
    row.appendChild(s);
  });
  showScreen('champion');
  playBadgeJingle();
  badgeConfetti();
}

// A legendary you failed to capture vanishes and reappears elsewhere.
function legendaryEscaped() {
  const legend = currentLegend;
  currentLegend = null;
  const poke = POKEMON_DATA.find(p => p.id === legend.pokeId);
  if (legend) relocateRoamer(legend);

  document.getElementById('result-stars').classList.add('hidden');
  document.getElementById('result-icon').innerHTML = '<span style="font-size:64px">💨</span>';
  document.getElementById('result-title').textContent   = 'IT VANISHED!';
  document.getElementById('result-name').textContent    = poke ? poke.name : '';
  document.getElementById('result-message').textContent = 'It slipped away to another faraway land...';

  const rs = document.getElementById('result-screen');
  rs.className = 'screen active fled';
  showScreen('result');
  playFledSound();
}

// Walking into a roaming legendary.
function engageRoamer(roamer) {
  const poke = POKEMON_DATA.find(p => p.id === roamer.pokeId);
  if (masterBalls <= 0) {
    showMessage(`✨ ${poke.name} appears! You need a 🟣 Master Ball to capture it — get one at the 🏪 Shop.`);
    beep(300, 0.1, 0.12, 'sine');
    setTimeout(() => beep(380, 0.1, 0.14, 'sine'), 130);
    return;
  }
  if (roamer.legend === 'mewtwo') { startMewtwoBattle(roamer); return; }
  beginEncounter(poke, roamer);
}

// ═══════════════════════════════════════════════════
// BOSS BATTLES  (Mewtwo, the legendary birds, Team Rocket)
// No timer; over N rounds pick the right Lukeymon, then resolve via cfg.onWin/onLose.
// ═══════════════════════════════════════════════════
let battleRoundNum = 0;
let battleType     = null;
let currentBoss    = null;   // active boss config

// A per-biome battle backdrop (radial glow tuned to the zone you're fighting in).
function battleBackdrop(zone) {
  const BG = {
    0: 'radial-gradient(circle at 50% 30%, #1d3a1d, #0a140a)',   // Meadow
    1: 'radial-gradient(circle at 50% 30%, #2a3550, #0a0e18)',   // Beach
    2: 'radial-gradient(circle at 50% 30%, #2e2e3e, #0c0c14)',   // City
    3: 'radial-gradient(circle at 50% 30%, #20406a, #0a1018)',   // Highlands (Zapdos)
    4: 'radial-gradient(circle at 50% 35%, #5a1808, #1a0604)',   // Volcano   (Moltres)
    5: 'radial-gradient(circle at 50% 30%, #102814, #060c08)',   // Dark Forest
    6: 'radial-gradient(circle at 50% 30%, #2a5a72, #0a1820)',   // Ice Cave  (Articuno)
    7: 'radial-gradient(circle at 50% 35%, #5a4418, #1a1206)',   // Desert
    8: 'radial-gradient(circle at 50% 30%, #1a1226, #060410)',   // Hidden Cave
  };
  return BG[zone] || 'radial-gradient(circle at 50% 30%, #2a1840, #0a0a18)';  // Mewtwo / default purple
}

function startBossBattle(cfg) {
  currentBoss = cfg;
  learnTip('battles');
  clearWild();
  clearTimeout(spawnTimerId);
  battleRoundNum = 0;
  document.getElementById('battle-header').textContent = cfg.title;
  const bossEl = document.getElementById('battle-mewtwo');
  if (cfg.art) { setPokeDisplay(bossEl, cfg.art, 80); }                                  // real Pokémon sprite
  else if (cfg.charArt) { bossEl.innerHTML = '<img class="boss-char" src="art/portrait/' + cfg.charArt + '.png?v=' + ART_V + '" alt="">'; } // Team Rocket grunt portrait
  else { bossEl.innerHTML = ''; bossEl.textContent = cfg.emoji; }                         // emoji fallback
  // The trainer sits in the corner once their Pokémon takes the field.
  const foe = document.getElementById('battle-foe');
  const foeEl = document.getElementById('battle-foe-emoji');
  if (cfg.foeArt || cfg.foeEmoji) {
    if (cfg.foeArt) foeEl.innerHTML = '<img class="foe-char" src="art/portrait/' + cfg.foeArt + '.png?v=' + ART_V + '" alt="">';
    else { foeEl.innerHTML = ''; foeEl.textContent = cfg.foeEmoji; }
    document.getElementById('battle-foe-badge').textContent = 'R · ' + (cfg.grunt || '');
    foe.classList.remove('hidden');
  } else {
    foe.classList.add('hidden');
  }
  document.getElementById('battle-screen').style.background = battleBackdrop(currentZone);
  document.getElementById('battle-win').classList.add('hidden');
  document.getElementById('battle-options').classList.remove('hidden');
  document.getElementById('battle-instruction').classList.remove('hidden');
  showScreen('battle');
  flashScreen('#c890f8');
  playEncounterJingle();
  if (cfg.intro) cfg.intro();   // e.g. Team Rocket's motto, then the rounds
  else nextBattleRound();
}

// Team Rocket tosses out a Pokémon: a ball arcs in from the grunt's corner and the
// Lukeymon pops out onto the field.
function rocketSendOut(mon) {
  const bossEl = document.getElementById('battle-mewtwo');
  const stage  = document.getElementById('battle-screen');
  setPokeDisplay(bossEl, mon, 80);
  bossEl.style.visibility = 'hidden';          // hold the spot, hidden until the ball lands
  const ball = document.createElement('div');
  ball.className = 'capture-ball';
  ball.style.cssText = 'left:50%;top:92px;margin-left:-13px;margin-top:-13px;width:26px;height:26px;';
  stage.appendChild(ball);
  beep(300, 0.12, 0.1, 'square');
  const reveal = () => {                        // ball has landed & burst — pop the Pokémon out
    ball.remove();
    bossEl.style.visibility = '';
    if (bossEl.animate) bossEl.animate([
      { transform: 'translateY(-8px) scale(0.2)', opacity: 0, offset: 0 },
      { transform: 'translateY(4px) scale(1.12)', opacity: 1, offset: 0.6 },
      { transform: 'translateY(0) scale(1)',      opacity: 1, offset: 1 },
    ], { duration: 320, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    beep(440, 0.1, 0.12);
  };
  if (ball.animate) {
    const a = ball.animate([
      { transform: 'translate(120px,-60px) scale(0.4) rotate(0deg)',  opacity: 0, offset: 0 },
      { transform: 'translate(45px,-22px) scale(0.9) rotate(240deg)', opacity: 1, offset: 0.55 },
      { transform: 'translate(0,0) scale(1) rotate(360deg)',          opacity: 1, offset: 0.82 },
      { transform: 'translate(0,0) scale(1.5)',                       opacity: 0, offset: 1 },   // burst open
    ], { duration: 480, easing: 'ease-out' });
    a.onfinish = reveal;
  } else { setTimeout(reveal, 480); }
}

// Mewtwo — match its exact type for 3 rounds, then a Master Ball.
function startMewtwoBattle(roamer) {
  currentLegend = roamer;
  const mew = POKEMON_DATA.find(p => p.id === roamer.pokeId);
  seenIds.add(mew.id);
  startBossBattle({
    title: 'MEWTWO', art: mew, rounds: 3, rule: 'match',
    pickDemand: (pool) => { const t = [...new Set(pool.map(p => p.type))]; return t[Math.floor(Math.random() * t.length)]; },
    demandPre: 'Mewtwo unleashes a ', demandPost: ' surge!',
    onWin: () => { currentPoke = mew; showBattleWin('✨ Mewtwo is calmed!', '🟣 Throw Master Ball!', masterBalls > 0, throwMasterAtMewtwo); },
    onLose: () => legendaryEscaped(),
  });
}

// Legendary birds — send a type that BEATS what it hurls (3 rounds), then a Poké Ball.
const BIRD_DEMANDS = {
  144: ['Ice', 'Flying', 'Water'],      // Articuno
  145: ['Electric', 'Flying', 'Water'], // Zapdos
  146: ['Fire', 'Flying', 'Rock'],      // Moltres
};
function startBirdBattle(birdId) {
  const bird = POKEMON_DATA.find(p => p.id === birdId);
  currentLegend = null;
  seenIds.add(birdId);
  const demands = BIRD_DEMANDS[birdId];
  startBossBattle({
    title: bird.name.toUpperCase(), art: bird, rounds: 3, rule: 'beats',
    pickDemand: () => demands[Math.floor(Math.random() * demands.length)],
    demandPre: `${bird.name} hurls a `, demandPost: ' blast — counter it!',
    onWin: () => { currentPoke = bird; showBattleWin(`✨ ${bird.name} is worn out!`, '⚪ Throw Poké Ball!', balls > 0, () => throwBallAtBird(birdId)); },
    onLose: () => bossFlee(bird, 'IT FLEW OFF!', 'It retreats to its nest. Heal up and challenge it again!'),
  });
}

// Each grunt's two-Pokémon lineup — sent out one per round (id of the roster mon).
const ROCKET_TEAMS = {
  Jessie: [23, 24],  // Ekans  → Arbok    (Poison, Poison)
  James:  [41, 27],  // Zubat  → Sandshrew (Poison, Ground)
  Meowth: [23, 28],  // Ekans  → Sandslash (Poison, Ground)
};

// Team Rocket grunt — delivers the motto, then sends out 2 Pokémon (one per round).
function startRocketBattle(rkt) {
  const bird   = POKEMON_DATA.find(p => p.id === rkt.bird);
  const lineup = ROCKET_TEAMS[rkt.name] || [23, 24];
  currentLegend = null;
  clearTimeout(spawnTimerId);
  startBossBattle({
    title: `TEAM ROCKET: ${rkt.name}`, emoji: rkt.emoji, rounds: lineup.length, rule: 'beats',
    grunt: rkt.name, lineup, foeEmoji: rkt.emoji, charArt: rkt.art, foeArt: rkt.art,
    motto: '“Prepare for trouble!”<br>“…and make it double!”<br>' +
           `<b>${rkt.name} of Team Rocket wants to battle!</b>`,
    intro: () => rocketIntro(),
    onWin: () => { rocketDefeated.add(rkt.bird); saveGame(); showBattleWin('💥 Team Rocket blasts off again!', `Face ${bird.name} ▶`, true, () => startBirdBattle(rkt.bird)); },
    onLose: () => bossFlee({ name: rkt.name }, 'TEAM ROCKET WINS!', '“Better luck next time, twerp!” Come back when you are ready.'),
  });
}

// Gym Leader — sends out a themed lineup (one per round); counter each type to win
// the Rumble Badge plus a bundle of coins & balls.
const GYM_BADGE_BALLS = 5;
const GYM_BADGE_COINS = 30;
function startGymBattle(leader) {
  const lineup = leader.lineup || [74, 75, 95];
  currentLegend = null;
  clearTimeout(spawnTimerId);
  startBossBattle({
    title: `GYM · ${leader.leaderName}`, emoji: leader.battleEmoji || '🥋',
    rounds: lineup.length, rule: 'beats',
    grunt: leader.leaderName, lineup, foeEmoji: leader.battleEmoji || '🥋',
    motto: `<b>${leader.leaderName} wants to battle!</b><br>“Show me the bond you share with your Lukéymon!”`,
    intro: () => rocketIntro(),
    onWin: () => awardGymBadge(leader),
    onLose: () => bossFlee({ name: leader.leaderName }, 'GYM DEFENDED!', '“Train up and challenge me again!”'),
  });
}
function awardGymBadge(leader) {
  const first = !collected.has('badge_gym');
  if (first) collected.add('badge_gym');
  balls += GYM_BADGE_BALLS; coins += GYM_BADGE_COINS;
  saveGame(); updateHud();
  const badge = COLLECTIBLES.find(c => c.id === 'badge_gym');
  showBattleWin(
    `🏆 Victory! +${GYM_BADGE_BALLS} Balls, +${GYM_BADGE_COINS} coins`,
    first ? 'Claim the Badge ✓' : 'Nice! ✓', true,
    () => { if (first) celebrateBadge(badge); else showScreen('world'); });
}

// Battle Dojo — endless practice. Each round you send out a Lukéymon (which counts
// toward its battle evolution, win or lose); no stakes, just training.
const DOJO_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Fairy'];
function startDojoBattle() {
  clearTimeout(spawnTimerId);
  startBossBattle({
    title: 'BATTLE DOJO', emoji: '🥋', rounds: 3, rule: 'beats',
    pickDemand: () => DOJO_TYPES[Math.floor(Math.random() * DOJO_TYPES.length)],
    demandPre: 'Training partner uses ', demandPost: ' — counter it!',
    onWin:  () => showBattleWin('🥋 Great training session!', 'Done ✓', true, returnToWorld),
    onLose: () => showBattleWin('💪 Good effort — train again any time!', 'Done ✓', true, returnToWorld),
  });
}

// A wandering trainer's quick 2-round battle: they send out a couple of common
// Lukéymon; counter the type. A small reward on a win; either way it grows your
// battle evolutions. (battleUses is credited per pick in chooseBattlePoke.)
function startTrainerBattle() {
  const t = wildTrainer;
  if (!t) return;
  clearTimeout(trainerTimerId);
  const pool = POKEMON_DATA.filter(p => !p.legend && !p.boss && p.zones && p.zones.length);
  const pick = () => pool[Math.floor(Math.random() * pool.length)].id;
  const lineup = [pick(), pick()];
  startBossBattle({
    title: t.name, emoji: t.emoji, rounds: 2, rule: 'beats',
    grunt: t.name, lineup, foeEmoji: t.emoji,
    motto: `<b>${t.name} wants to battle!</b><br>“Let’s see what your team can do!”`,
    intro: () => rocketIntro(),
    onWin:  () => { coins += 8; balls += 1; updateHud(); saveGame(); clearTrainer(); showBattleWin('🏆 You won the battle! +8 💰 +1 ball', 'Done ✓', true, returnToWorld); },
    onLose: () => { clearTrainer(); showBattleWin('💪 They got the better of you this time!', 'Done ✓', true, returnToWorld); },
  });
}

// Show the grunt + their Team Rocket motto, then begin the rounds on tap.
function rocketIntro() {
  const cfg = currentBoss;
  document.getElementById('battle-options').classList.add('hidden');
  document.getElementById('battle-instruction').classList.add('hidden');
  document.getElementById('battle-round').textContent = '';
  document.getElementById('battle-demand-pre').textContent  = '';
  document.getElementById('battle-demand-post').textContent = '';
  const tEl = document.getElementById('battle-type');
  tEl.textContent = ''; tEl.style.background = 'transparent';

  const win = document.getElementById('battle-win');
  win.classList.remove('hidden');
  document.getElementById('battle-win-msg').innerHTML = cfg.motto;
  const btn = document.getElementById('battle-throw');
  btn.textContent = '⚔️ Battle!';
  btn.disabled = false;
  btn.onclick = () => {
    wakeAudio();
    win.classList.add('hidden');
    document.getElementById('battle-options').classList.remove('hidden');
    document.getElementById('battle-instruction').classList.remove('hidden');
    nextBattleRound();
  };
  setNav([btn]);   // A = Battle!
  // little motto sting
  beep(330, 0.1, 0.1);
  setTimeout(() => beep(392, 0.1, 0.1), 150);
  setTimeout(() => beep(330, 0.14, 0.12), 320);
}

function nextBattleRound() {
  const cfg = currentBoss;
  battleRoundNum++;
  document.getElementById('battle-round').textContent = `Round ${battleRoundNum} / ${cfg.rounds}`;

  // Options are drawn only from the Lukeymon you've actually caught.
  const pool = POKEMON_DATA.filter(p => !p.legend && !p.boss && caughtIds.has(p.id));

  // A lineup boss (Team Rocket) sends out one Pokémon per round — show its sprite
  // and make its type the thing you must counter. Otherwise use the static demand.
  let demandPre = cfg.demandPre, demandPost = cfg.demandPost;
  if (cfg.lineup) {
    const mon = POKEMON_DATA.find(p => p.id === cfg.lineup[(battleRoundNum - 1) % cfg.lineup.length]);
    rocketSendOut(mon);                 // ball-toss "sent out!" animation
    battleType = mon.type;
    demandPre  = `${cfg.grunt} sent out ${mon.name}! `;
    demandPost = ' — counter it!';
  } else {
    battleType = cfg.pickDemand(pool);
  }
  // Which types count as a correct answer: the exact type (Mewtwo) or any type
  // that is super-effective against the demanded one (birds / Team Rocket).
  const correctTypes = cfg.rule === 'beats' ? (BEATEN_BY[battleType] || [battleType]) : [battleType];

  document.getElementById('battle-demand-pre').textContent  = demandPre;
  document.getElementById('battle-demand-post').textContent = demandPost;
  const tEl = document.getElementById('battle-type');
  tEl.textContent = battleType;
  tEl.style.background = typeColor(battleType);
  document.getElementById('battle-instruction').textContent =
    cfg.rule === 'beats'
      ? `Send a Lukeymon that's STRONG against ${battleType} — try ${correctTypes.join(' / ')}!`
      : 'Send out a Lukeymon of that type!';
  beep(150, 0.18, 0.3, 'square');

  // Up to six options from your roster. A counter only appears if you own one.
  const correctPool = pool.filter(p => correctTypes.includes(p.type));
  const lead = correctPool[Math.floor(Math.random() * correctPool.length)];
  const others = shuffle(pool.filter(p => p !== lead && !correctTypes.includes(p.type)));
  const opts = shuffle([lead, ...others.slice(0, 5)]).filter(Boolean);

  const grid = document.getElementById('battle-options');
  grid.innerHTML = '';
  opts.forEach(poke => {
    const card = document.createElement('button');
    card.className = 'battle-opt';
    const ic = document.createElement('span');
    ic.className = 'battle-opt-emoji';
    ic.appendChild(pokeImg(poke, 30));
    const nm = document.createElement('span');
    nm.className = 'battle-opt-name';
    nm.textContent = poke.name;
    const tp = document.createElement('span');
    tp.className = 'battle-opt-type';
    tp.textContent = poke.type;
    tp.style.background = typeColor(poke.type);
    card.append(ic, nm, tp);
    card.addEventListener('click', () => chooseBattlePoke(poke, card, correctTypes));
    grid.appendChild(card);
  });
  setNav(Array.from(grid.querySelectorAll('.battle-opt')), { cols: 3 });   // D-pad picks a Lukeymon
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chooseBattlePoke(poke, card, correctTypes) {
  if (gameState !== 'battle') return;
  document.querySelectorAll('.battle-opt').forEach(b => b.disabled = true);
  battleUses[poke.id] = (battleUses[poke.id] || 0) + 1;   // used in battle (win or lose) → battle evolutions

  if (correctTypes.includes(poke.type)) {
    card.classList.add('correct');
    beep(523, 0.12, 0.1);
    setTimeout(() => beep(659, 0.12, 0.15), 110);
    // The chosen Lukeymon charges in full-size and bumps the boss, then the
    // battle moves on (next round, or the win once the last round is cleared).
    battleAttack(poke, () => {
      if (battleRoundNum >= currentBoss.rounds) currentBoss.onWin();
      else nextBattleRound();
    });
  } else {
    card.classList.add('wrong');
    beep(160, 0.15, 0.2, 'square');
    // Wrong choice — it charges in but bounces off, flashing, then the boss wins.
    battleBounce(poke, () => currentBoss.onLose());
  }
}

// Show the picked Pokémon at full size, lunge it up into Mewtwo (who recoils),
// then run onDone. Positions are measured so the impact lands on Mewtwo.
function battleAttack(poke, onDone) {
  const stage = document.getElementById('battle-screen');
  const mew   = document.getElementById('battle-mewtwo');
  const atk = document.createElement('div');
  atk.className = 'battle-attacker';
  atk.appendChild(pokeImg(poke, 150));   // the actual selected Lukeymon, full size
  stage.appendChild(atk);

  if (!atk.animate) { setTimeout(() => { atk.remove(); onDone && onDone(); }, 600); return; }

  requestAnimationFrame(() => {
    const sR = stage.getBoundingClientRect();
    const mR = mew.getBoundingClientRect();
    const aR = atk.getBoundingClientRect();
    const startX = sR.width / 2 - aR.width / 2;
    const startY = sR.height - aR.height - 16;
    atk.style.left = Math.round(startX) + 'px';
    atk.style.top  = Math.round(startY) + 'px';
    const hitY = (mR.top - sR.top) + mR.height * 0.45 - aR.height / 2;
    const dy = hitY - startY;            // negative → moves up toward Mewtwo
    const DUR = 1500;
    const anim = atk.animate([
      { transform: 'translateY(46px) scale(0.5)',       opacity: 0, offset: 0,    easing: 'ease-out' },
      { transform: 'translateY(0) scale(1)',            opacity: 1, offset: 0.13 },                       // pops in…
      { transform: 'translateY(0) scale(1)',            opacity: 1, offset: 0.48, easing: 'cubic-bezier(.6,0,.95,.35)' }, // …holds so you see it, then snaps
      { transform: `translateY(${dy}px) scale(1.1)`,    opacity: 1, offset: 0.62 },  // SLAM into Mewtwo
      { transform: `translateY(${dy + 22}px) scale(1)`, opacity: 1, offset: 0.71 },  // recoil back
      { transform: 'translateY(24px) scale(0.7)',       opacity: 0, offset: 1 },
    ], { duration: DUR, easing: 'linear' });

    setTimeout(() => { mewtwoRecoil(mew); battleThud(stage, mR, sR); }, Math.round(DUR * 0.60));
    anim.onfinish = () => { atk.remove(); onDone && onDone(); };
  });
}

function mewtwoRecoil(mew) {
  if (!mew.animate) return;
  // shake + a double white flash, like taking a hit
  mew.animate([
    { transform: 'translate(0,0)',                      filter: 'brightness(1) drop-shadow(0 0 10px #a040f0)', offset: 0 },
    { transform: 'translate(-3px,-10px) rotate(-5deg)', filter: 'brightness(4) drop-shadow(0 0 18px #fff)',    offset: 0.16 },
    { transform: 'translate(3px,-3px) rotate(4deg)',    filter: 'brightness(1) drop-shadow(0 0 10px #a040f0)', offset: 0.34 },
    { transform: 'translate(-2px,-4px) rotate(-2deg)',  filter: 'brightness(4) drop-shadow(0 0 18px #fff)',    offset: 0.5 },
    { transform: 'translate(0,0)',                      filter: 'brightness(1) drop-shadow(0 0 10px #a040f0)', offset: 1 },
  ], { duration: 440, easing: 'ease-out' });
}

function battleThud(stage, mR, sR) {
  beep(110, 0.09, 0.26, 'square');
  setTimeout(() => beep(880, 0.06, 0.12), 45);
  const boom = document.createElement('div');
  boom.className = 'battle-impact';
  boom.textContent = '💥';
  boom.style.left = Math.round((mR.left - sR.left) + mR.width / 2) + 'px';
  boom.style.top  = Math.round((mR.top  - sR.top)  + mR.height / 2) + 'px';
  stage.appendChild(boom);
  setTimeout(() => boom.remove(), 460);
}

// Wrong pick: the Pokémon charges up, gets repelled by Mewtwo and tumbles back
// down flashing red, then onDone (Mewtwo escapes).
function battleBounce(poke, onDone) {
  const stage = document.getElementById('battle-screen');
  const mew   = document.getElementById('battle-mewtwo');
  const atk = document.createElement('div');
  atk.className = 'battle-attacker';
  atk.appendChild(pokeImg(poke, 150));
  stage.appendChild(atk);

  if (!atk.animate) { setTimeout(() => { atk.remove(); onDone && onDone(); }, 600); return; }

  requestAnimationFrame(() => {
    const sR = stage.getBoundingClientRect();
    const mR = mew.getBoundingClientRect();
    const aR = atk.getBoundingClientRect();
    const startX = sR.width / 2 - aR.width / 2;
    const startY = sR.height - aR.height - 16;
    atk.style.left = Math.round(startX) + 'px';
    atk.style.top  = Math.round(startY) + 'px';
    const hitY = (mR.top - sR.top) + mR.height * 0.5 - aR.height / 2;
    const dy = hitY - startY;            // negative → up toward Mewtwo
    const DUR = 1500;
    const NORMAL = 'drop-shadow(0 5px 6px rgba(0,0,0,.55))';
    const REDLIT = 'brightness(1.9) drop-shadow(0 0 12px #ff5050)';
    const REDDIM = 'brightness(1) drop-shadow(0 0 6px #ff3030)';
    const anim = atk.animate([
      { transform: 'translateY(46px) scale(0.5)',  opacity: 0, filter: NORMAL, offset: 0, easing: 'ease-out' },
      { transform: 'translateY(0) scale(1)',        opacity: 1, filter: NORMAL, offset: 0.13 },                  // pops in…
      { transform: 'translateY(0) scale(1)',        opacity: 1, filter: NORMAL, offset: 0.46, easing: 'cubic-bezier(.6,0,.95,.35)' }, // …holds, then charges
      { transform: `translateY(${dy}px) scale(1.05)`,            opacity: 1,    filter: REDLIT, offset: 0.57 },  // hits the shield
      { transform: `translateY(${dy * 0.45}px) scale(0.92) rotate(-14deg)`, opacity: 0.2, filter: REDDIM, offset: 0.65, easing: 'ease-out' }, // bounces back, flash off
      { transform: `translateY(${dy * 0.12}px) scale(1) rotate(11deg)`,     opacity: 1,   filter: REDLIT, offset: 0.74 }, // flash on
      { transform: 'translateY(42px) scale(0.85) rotate(-6deg)',            opacity: 0.2, filter: REDDIM, offset: 0.86 }, // flash off
      { transform: 'translateY(82px) scale(0.55) rotate(0)',               opacity: 0,   filter: REDDIM, offset: 1 },     // tumbles away
    ], { duration: DUR, easing: 'linear' });

    setTimeout(() => { mewtwoRepel(mew); battleRepelSound(); }, Math.round(DUR * 0.57));
    anim.onfinish = () => { atk.remove(); onDone && onDone(); };
  });
}

// Mewtwo shrugs off a wrong pick with a purple shield pulse.
function mewtwoRepel(mew) {
  if (!mew.animate) return;
  mew.animate([
    { transform: 'scale(1)',    filter: 'brightness(1) drop-shadow(0 0 10px #a040f0)' },
    { transform: 'scale(1.12)', filter: 'brightness(1.6) drop-shadow(0 0 24px #c060ff)' },
    { transform: 'scale(1)',    filter: 'brightness(1) drop-shadow(0 0 10px #a040f0)' },
  ], { duration: 380, easing: 'ease-out' });
}

function battleRepelSound() {
  beep(190, 0.10, 0.18, 'square');
  setTimeout(() => beep(120, 0.12, 0.22, 'square'), 120);
  setTimeout(() => beep(85,  0.16, 0.32, 'square'), 260);
}

// Show the win panel with a custom message + action button (capture / continue).
function showBattleWin(msg, btnLabel, btnEnabled, onBtn) {
  document.getElementById('battle-options').classList.add('hidden');
  document.getElementById('battle-instruction').classList.add('hidden');
  document.getElementById('battle-win').classList.remove('hidden');
  document.getElementById('battle-win-msg').textContent = msg;
  const btn = document.getElementById('battle-throw');
  btn.textContent = btnLabel;
  btn.disabled = !btnEnabled;
  btn.onclick = () => { wakeAudio(); onBtn(); };
  setNav([btn]);
  beep(523, 0.12, 0.12);
  setTimeout(() => beep(659, 0.12, 0.12), 130);
  setTimeout(() => beep(784, 0.18, 0.2), 260);
}

function throwMasterAtMewtwo() {
  if (masterBalls <= 0) return;
  masterBalls--;
  updateHud();
  saveGame();
  document.getElementById('battle-throw').disabled = true;
  // Show the Master Ball thrown + wiggle, then resolve the catch.
  battleCapture(true, caught);  // caught() handles roamer removal + dex completion
}

function throwBallAtBird(birdId) {
  if (balls <= 0) return;
  balls--;
  updateHud();
  saveGame();
  currentPoke = POKEMON_DATA.find(p => p.id === birdId);
  currentLegend = null;
  document.getElementById('battle-throw').disabled = true;
  battleCapture(false, caught);  // adds to dex, awards the Trio Badge on the 3rd
}

// A boss/Rocket you didn't beat — show a "fled" result; the lair stays so you can retry.
function bossFlee(who, title, message) {
  document.getElementById('result-stars').classList.add('hidden');
  document.getElementById('result-icon').innerHTML = '<span style="font-size:64px">💨</span>';
  document.getElementById('result-title').textContent   = title;
  document.getElementById('result-name').textContent    = who.name || '';
  document.getElementById('result-message').textContent = message;
  const rs = document.getElementById('result-screen');
  rs.className = 'screen active fled';
  showScreen('result');
  playFledSound();
}

// ═══════════════════════════════════════════════════
// SHOP
// ═══════════════════════════════════════════════════
function openShop() {
  gameState = 'shop';
  clearTimeout(spawnTimerId);
  document.getElementById('shop-coin-count').textContent = coins;
  document.getElementById('shop-ball-count').textContent = balls;
  const sm = document.getElementById('shop-master-count');
  if (sm) sm.textContent = masterBalls;
  refreshShopButtons();
  showScreen('shop');
}

function closeShop() {
  showScreen('world');
  scheduleSpawn();
}

function refreshShopButtons() {
  document.querySelectorAll('.shop-buy-btn').forEach(btn => {
    btn.disabled = coins < parseInt(btn.dataset.cost);
  });
}

function buyBalls(qty, cost) {
  if (coins < cost) return;
  coins -= cost;
  balls += qty;
  updateHud();
  saveGame();
  document.getElementById('shop-coin-count').textContent = coins;
  document.getElementById('shop-ball-count').textContent = balls;
  refreshShopButtons();
  beep(660, 0.1, 0.08);
  setTimeout(() => beep(880, 0.12, 0.15), 100);
}

function buyMaster(cost) {
  if (coins < cost) return;
  coins -= cost;
  masterBalls++;
  updateHud();
  saveGame();
  document.getElementById('shop-coin-count').textContent = coins;
  const sm = document.getElementById('shop-master-count');
  if (sm) sm.textContent = masterBalls;
  refreshShopButtons();
  beep(700, 0.12, 0.1);
  setTimeout(() => beep(950, 0.14, 0.16), 110);
}

// ═══════════════════════════════════════════════════
// POKÉDEX
// ═══════════════════════════════════════════════════
let dexFilter = { status: 'all', type: 'all' };

// Where to look for a not-yet-caught species (first home zone, or its legendary status).
function dexLocationHint(poke) {
  if (poke.legend) return '✨ Legendary';
  if (poke.zones && poke.zones.length) {
    return '📍 ' + poke.zones.map(z => ZONE_INFO[z] ? ZONE_INFO[z].name : '?').join(' / ');
  }
  const evo = STONE_EVOS.find(r => r.to === poke.id);
  if (evo) {
    const base = POKEMON_DATA.find(p => p.id === evo.from);
    return `${STONES[evo.stone].emoji} Evolve ${base ? base.name : '?'}`;
  }
  return '✨ Rare';
}

function openPokedex() {
  clearTimeout(spawnTimerId);
  renderPokedexGrid();
  document.getElementById('pokedex-detail').classList.add('hidden');
  document.getElementById('pokedex-grid').classList.remove('hidden');
  showScreen('pokedex');
}

function closePokedex() {
  showScreen('world');
  scheduleSpawn();
}

function renderPokedexGrid() {
  const grid = document.getElementById('pokedex-grid');
  grid.innerHTML = '';
  document.getElementById('dex-count').textContent = caughtIds.size;
  document.getElementById('dex-total').textContent = POKEMON_DATA.length;

  let shown = 0;
  POKEMON_DATA.forEach(poke => {
    const caught = caughtIds.has(poke.id);
    const seen   = !caught && seenIds.has(poke.id);   // encountered but not yet caught

    // Apply filters.
    if (dexFilter.status === 'caught'  && !caught) return;
    if (dexFilter.status === 'missing' &&  caught) return;
    if (dexFilter.type !== 'all' && poke.type !== dexFilter.type) return;
    shown++;

    const card = document.createElement('div');
    card.className = 'dex-card' + (caught ? ' caught' : seen ? ' seen' : ' dex-card-unknown');
    card.dataset.pid = poke.id;

    const emojiDiv = document.createElement('div');
    emojiDiv.className = 'dex-card-emoji';
    if (caught || seen) {
      const img = pokeImg(poke, 40);
      if (seen) img.classList.add('dex-silhouette');   // dark silhouette for "seen"
      emojiDiv.appendChild(img);
    } else {
      emojiDiv.textContent = '?';
    }

    const numDiv = document.createElement('div');
    numDiv.className = 'dex-card-num';
    numDiv.textContent = `#${String(poke.id).padStart(3, '0')}`;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'dex-card-name';
    nameDiv.textContent = caught ? poke.name : seen ? poke.name : '?????????';

    card.appendChild(numDiv);
    card.appendChild(emojiDiv);
    card.appendChild(nameDiv);

    // Type badge — once you've at least seen it.
    if (caught || seen) {
      const typeBadge = document.createElement('div');
      typeBadge.className = 'dex-card-type';
      typeBadge.textContent = poke.type;
      typeBadge.style.background = typeColor(poke.type);
      card.appendChild(typeBadge);
    }

    // Buddy indicator — a heart in the top-right corner of the buddy's card.
    if (activePet === poke.id) {
      const buddyTag = document.createElement('div');
      buddyTag.className = 'dex-card-buddy';
      buddyTag.textContent = '❤️';
      buddyTag.title = 'Your buddy';
      card.appendChild(buddyTag);
    }

    // Help the player find what they're missing.
    if (!caught) {
      const hint = document.createElement('div');
      hint.className = 'dex-card-hint';
      hint.textContent = dexLocationHint(poke);
      card.appendChild(hint);
    }

    if (caught) {
      card.addEventListener('click', () => showDetail(poke));
    }
    grid.appendChild(card);
  });

  if (!shown) {
    const empty = document.createElement('div');
    empty.className = 'dex-empty';
    empty.textContent = 'Nothing here yet — go explore!';
    grid.appendChild(empty);
  }
}

function showDetail(poke) {
  const grid = document.getElementById('pokedex-grid');
  if (!grid.classList.contains('hidden')) dexScroll = grid.scrollTop;  // remember place
  grid.classList.add('hidden');
  const detail = document.getElementById('pokedex-detail');
  detail.classList.remove('hidden');

  setPokeDisplay(document.getElementById('detail-emoji'), poke, 96);
  document.getElementById('detail-name').textContent   = poke.name;
  document.getElementById('detail-number').textContent = `#${String(poke.id).padStart(3, '0')}`;
  document.getElementById('detail-type').textContent   = poke.type;
  document.getElementById('detail-type').style.background = typeColor(poke.type);

  document.getElementById('detail-category').textContent =
    poke.category ? `${poke.category} Pokémon` : '';
  document.getElementById('detail-height').textContent =
    poke.height != null ? `${poke.height.toFixed(1)} m`  : '—';
  document.getElementById('detail-weight').textContent =
    poke.weight != null ? `${poke.weight.toFixed(1)} kg` : '—';

  document.getElementById('detail-desc').textContent   = poke.description;

  document.getElementById('detail-befriend-icon').textContent = poke.actionEmoji || '💚';
  document.getElementById('detail-befriend-text').textContent = poke.befriendTip || '';

  detailPoke = poke;
  const buddyBtn = document.getElementById('detail-buddy');
  const isBuddy = activePet === poke.id;
  buddyBtn.textContent = '❤️';
  buddyBtn.title = isBuddy ? 'Your buddy — tap to dismiss' : 'Make this my buddy';
  buddyBtn.classList.toggle('lit', isBuddy);

  // Evolution: a button per Stone you own that this Pokémon can use; otherwise a
  // hint of which Stone it's waiting for.
  const evoWrap = document.getElementById('detail-evolve');
  evoWrap.innerHTML = '';
  const nav = [buddyBtn];
  const got = id => POKEMON_DATA.find(p => p.id === id) && !caughtIds.has(id);
  const mkBtn = (label, fn) => {
    const b = document.createElement('button');
    b.className = 'pixel-btn small green'; b.textContent = label;
    b.addEventListener('click', fn); evoWrap.appendChild(b); nav.push(b);
  };
  const mkHint = txt => { const h = document.createElement('div'); h.className = 'detail-evo-hint'; h.textContent = txt; evoWrap.appendChild(h); };

  // Stone evolutions
  evolutionsFor(poke.id).filter(r => got(r.to)).forEach(r => {
    const t = POKEMON_DATA.find(p => p.id === r.to);
    if ((stones[r.stone] || 0) > 0) mkBtn(`${STONES[r.stone].emoji} Evolve → ${t.name}`, () => evolveWithStone(poke, r));
    else mkHint(`${STONES[r.stone].emoji} Needs a ${STONES[r.stone].name}`);
  });
  // Buddy / battle / dance evolutions
  evosFor(poke.id).filter(r => got(r.to)).forEach(r => {
    const t = POKEMON_DATA.find(p => p.id === r.to);
    if (r.method === 'dance') { mkHint(`🔗 ${t.name}: Dance Party with another trainer`); return; }
    if (evoReady(r)) mkBtn(`✨ Evolve → ${t.name}`, () => evolveByProgress(poke, r));
    else if (r.method === 'buddy') mkHint(`🐾 Bond ${evoProgress(r)}/${r.cost} steps → ${t.name}`);
    else mkHint(`🥊 Battles ${evoProgress(r)}/${r.cost} → ${t.name}`);
  });

  nav.push(document.getElementById('detail-back'));
  setNav(nav, { onBack: closeDetail });
}

// Toggle the open Pokémon as the player's buddy.
function toggleBuddy() {
  if (!detailPoke) return;
  if (activePet === detailPoke.id) {
    activePet = null;
  } else {
    activePet = detailPoke.id;
    learnTip('buddy');
    petX = playerX; petY = playerY;
    petFromPx.x = petX * TILE_SIZE; petFromPx.y = petY * TILE_SIZE;
    petMoveAnimTs = -9999;
  }
  saveGame();
  beep(523, 0.08, 0.08);
  showDetail(detailPoke);   // refresh the button label
}

function closeDetail() {
  document.getElementById('pokedex-detail').classList.add('hidden');
  const grid = document.getElementById('pokedex-grid');
  grid.classList.remove('hidden');
  renderPokedexGrid();
  // Re-focus the card we were just viewing, then restore the exact scroll
  // position last so navShow's scrollIntoView doesn't yank us to the top.
  const cards = Array.from(document.querySelectorAll('#pokedex-grid .dex-card.caught'));
  const idx = detailPoke ? cards.findIndex(c => +c.dataset.pid === detailPoke.id) : -1;
  setNav(cards, { cols: 3, onBack: closeDetail, index: Math.max(0, idx) });
  grid.scrollTop = dexScroll;        // stay where we were, don't jump to top
}

// ═══════════════════════════════════════════════════
// WORLD MAP
// ═══════════════════════════════════════════════════
// BFS from the start zone over exits whose barrier is currently unlocked.
function reachableZones() {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const z = queue.shift();
    for (const e of EXITS) {
      if (e.from !== z || !isBarrierUnlocked(e.barrier)) continue;
      if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    }
  }
  return seen;
}

function openMap() {
  clearTimeout(spawnTimerId);
  renderMap();
  showScreen('map');
}

function closeMap() {
  showScreen('world');
  scheduleSpawn();
}

// The tile you arrive on when entering a zone (an edge entry, or a portal target).
function zoneLanding(zone) {
  const e = EXITS.find(x => x.to === zone);
  if (e) return [e.entryX, e.entryY];
  const p = PORTALS.find(x => x.to === zone);
  if (p) return [p.tx, p.ty];
  return null;
}

function fastTravel(zone) {
  if (zone === currentZone) return;
  const land = zoneLanding(zone);
  if (!land) return;
  const [x, y] = land;
  warpTo(zone, x, y);            // handles save, HUD, spawn, message, sound
  showScreen('world');
}

// ─── Pokédex filters ─────────────────────────────────
function refreshDexFilters() {
  document.querySelectorAll('#pokedex-filters .dexf-chip[data-status]').forEach(chip =>
    chip.classList.toggle('active', chip.dataset.status === dexFilter.status));
  renderPokedexGrid();
  setupNav('pokedex');
}
function cycleDexType() {
  const types = ['all', ...Array.from(new Set(POKEMON_DATA.filter(p => !p.legend).map(p => p.type))).sort()];
  const i = types.indexOf(dexFilter.type);
  dexFilter.type = types[(i + 1) % types.length];
  const btn = document.getElementById('dexf-type');
  btn.textContent = 'Type: ' + (dexFilter.type === 'all' ? 'All' : dexFilter.type);
  refreshDexFilters();
}

// ─── Settings ────────────────────────────────────────
function updateSoundRow() {
  const r = document.getElementById('set-sound');
  if (r) r.textContent = muted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
}
function openSettings() {
  updateSoundRow();
  const v = document.getElementById('version');
  const sv = document.getElementById('set-version');
  if (sv && v) sv.textContent = v.textContent;
  showScreen('settings');
}
function closeSettings() { showScreen('title'); }

// ─── Guide / type-chart screen ───────────────────────
let helpReturn = 'map';
function openHelp(from) {
  helpReturn = from || 'map';
  renderHelp();
  showScreen('help');
}
function closeHelp() {
  if (helpReturn === 'settings') { showScreen('settings'); return; }
  renderMap();
  showScreen('map');
}
function renderHelp() {
  const box = document.getElementById('help-types');
  if (!box || box.childElementCount) return;   // build once
  // Order types by how common they are in the roster, skipping any with no counter.
  const order = ['Fire','Water','Grass','Electric','Ground','Rock','Ice','Flying',
                 'Poison','Psychic','Bug','Normal','Fighting','Ghost','Dragon','Fairy'];
  order.forEach(t => {
    const counters = BEATEN_BY[t];
    if (!counters) return;
    const row = document.createElement('div');
    row.className = 'help-type-row';
    const tag = document.createElement('span');
    tag.className = 'help-type-tag';
    tag.textContent = t;
    tag.style.background = typeColor(t);
    const arrow = document.createElement('span');
    arrow.className = 'help-type-arrow';
    arrow.textContent = '→';
    const list = document.createElement('span');
    list.className = 'help-type-counters';
    counters.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'help-type-chip';
      chip.textContent = c;
      chip.style.background = typeColor(c);
      list.appendChild(chip);
    });
    row.append(tag, arrow, list);
    box.appendChild(row);
  });
}

function renderMap() {
  const open = reachableZones();
  document.getElementById('map-open-count').textContent = open.size;
  document.getElementById('map-total').textContent = Object.keys(ZONE_MAP).length;

  // Field-notes tally on its tray button (+ a dot when a new tip is waiting).
  document.getElementById('map-notes-count').textContent = [...knownTips].length;
  document.getElementById('map-notes-total').textContent = allTips().length;
  document.getElementById('map-notes').classList.toggle('has-new', notesUnread);

  // Cell centres in the 400×400 SVG viewBox (4×4 grid → 100px cells).
  const cx = id => (ZONE_MAP[id].col - 0.5) * 100;
  const cy = id => (ZONE_MAP[id].row - 0.5) * 100;

  // Draw each connection once. A link is "open" when its barrier is unlocked.
  const drawn = new Set();
  let svg = '';
  EXITS.forEach(e => {
    const key = Math.min(e.from, e.to) + '-' + Math.max(e.from, e.to);
    if (drawn.has(key)) return;
    drawn.add(key);
    const gate = EXITS.find(x =>
      ((x.from === e.from && x.to === e.to) || (x.from === e.to && x.to === e.from)) && x.barrier);
    const barrier = gate ? gate.barrier : null;
    const passable = isBarrierUnlocked(barrier);
    const x1 = cx(e.from), y1 = cy(e.from), x2 = cx(e.to), y2 = cy(e.to);

    // Build the path: straight by default, or via waypoints for routed edges.
    let wp = EDGE_ROUTES[key];
    if (wp && Math.hypot(wp[wp.length - 1][0] - x1, wp[wp.length - 1][1] - y1)
           < Math.hypot(wp[0][0] - x1, wp[0][1] - y1)) {
      wp = wp.slice().reverse(); // orient waypoints to start nearest (x1,y1)
    }
    const pts = [[x1, y1], ...(wp || []), [x2, y2]];
    svg += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" class="${passable ? 'link-open' : 'link-locked'}" />`;

    if (!passable && barrier) {
      // Label at the path midpoint (the apex of the arc for routed edges).
      const lx = wp ? wp.reduce((s, p) => s + p[0], 0) / wp.length : (x1 + x2) / 2;
      const ly = wp ? wp.reduce((s, p) => s + p[1], 0) / wp.length : (y1 + y2) / 2;
      svg += `<text x="${lx}" y="${ly + 5}" class="link-sign">${BARRIERS[barrier].sign}</text>`;
    }
  });
  document.getElementById('map-lines').innerHTML = svg;

  // Place the zone tiles.
  const zones = document.getElementById('map-zones');
  zones.innerHTML = '';
  ZONE_INFO.forEach(z => {
    const pos = ZONE_MAP[z.id];
    if (!pos) return;
    const isOpen = open.has(z.id);
    const here   = z.id === currentZone;

    const tile = document.createElement('div');
    tile.className = 'map-zone' + (isOpen ? ' open' : ' locked') + (here ? ' here' : '');
    tile.style.left = ((pos.col - 1) * 25) + '%';
    tile.style.top  = ((pos.row - 1) * 25) + '%';

    const icon = document.createElement('div');
    icon.className = 'map-zone-icon';
    icon.textContent = isOpen ? pos.icon : '🔒';

    const name = document.createElement('div');
    name.className = 'map-zone-name';
    name.textContent = z.name;

    tile.appendChild(icon);
    tile.appendChild(name);

    // Fast-travel: tap an open zone you're not standing in to warp there.
    if (isOpen && !here && zoneLanding(z.id)) {
      tile.classList.add('travelable');
      tile.addEventListener('click', () => fastTravel(z.id));
    }

    if (here) {
      const you = document.createElement('div');
      you.className = 'map-zone-tag you';
      you.textContent = '📍 YOU';
      tile.appendChild(you);
    } else if (!isOpen) {
      const gate = EXITS.find(e => e.to === z.id && e.barrier);
      if (gate) {
        const req = document.createElement('div');
        req.className = 'map-zone-tag req';
        req.textContent = BARRIERS[gate.barrier].sign + ' ' + BARRIERS[gate.barrier].needsType;
        tile.appendChild(req);
      }
    }
    zones.appendChild(tile);
  });

  // Next-objective line.
  const obj = document.getElementById('map-objective');
  if (obj) {
    const landDone = LAND_BADGES.filter(id => collected.has(id)).length;
    const wildLeft = POKEMON_DATA.filter(p => !p.legend && !p.boss && !caughtIds.has(p.id)).length;
    if (!wonGame)                                  obj.textContent = `🎯 Earn the 4 Gym Badges  (${landDone}/4)`;
    else if (caughtIds.size >= POKEMON_DATA.length) obj.textContent = '🏆 You’ve done it all — Champion & Master!';
    else if (wildLeft === 0)                       obj.textContent = '🌟 Only the legends remain — hunt the birds, Mew & Mewtwo!';
    else                                           obj.textContent = `🎯 Complete the Pokédex  (${caughtIds.size}/${POKEMON_DATA.length})`;
  }

  // Badge tray.
  document.getElementById('badge-count').textContent = collected.size;
  document.getElementById('badge-total').textContent = COLLECTIBLES.length;
  const tray = document.getElementById('map-badges-row');
  tray.innerHTML = '';
  COLLECTIBLES.forEach(c => {
    const b = document.createElement('span');
    const have = collected.has(c.id);
    b.className = 'map-badge' + (have ? ' have' : '');
    b.textContent = have ? c.emoji : '❔';
    b.title = have ? c.name : '???';
    tray.appendChild(b);
  });
}

// ─── Badge Case ──────────────────────────────────────
function openBadgeCase() {
  renderBadgeCase();
  showScreen('badges');
}
function closeBadgeCase() {
  renderMap();
  showScreen('map');
}
function renderBadgeCase() {
  document.getElementById('badges-count').textContent = collected.size;
  document.getElementById('badges-total').textContent = COLLECTIBLES.length;
  const grid = document.getElementById('badges-grid');
  grid.innerHTML = '';
  COLLECTIBLES.forEach(c => {
    const have = collected.has(c.id);
    const card = document.createElement('div');
    card.className = 'badge-card' + (have ? ' have' : '');

    const icon = document.createElement('div');
    icon.className = 'badge-card-icon';
    icon.textContent = have ? c.emoji : '🔒';

    const name = document.createElement('div');
    name.className = 'badge-card-name';
    name.textContent = have ? c.name : '???';

    const loc = document.createElement('div');
    loc.className = 'badge-card-loc';
    loc.textContent = c.auto ? (have ? 'Earned!' : c.hint)
                             : (have ? 'Found in ' : '📍 ') + ZONE_INFO[c.zone].name;

    card.append(icon, name, loc);
    grid.appendChild(card);
  });
}

// ─── Field Notes (tips notepad) ──────────────────────
// Record a tip the first time the player runs into the relevant situation.
function learnTip(id) {
  if (knownTips.has(id)) return;
  knownTips.add(id);
  notesUnread = true;
  saveGame();
  markNotesNew();
  beep(660, 0.05, 0.06, 'sine');
  setTimeout(() => beep(880, 0.06, 0.09, 'sine'), 70);
}
// Flag the map + notepad buttons so the player notices a new note.
function markNotesNew() {
  ['map-btn', 'map-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('has-new', notesUnread);
  });
}
function openNotes() {
  notesUnread = false;
  markNotesNew();
  renderNotes();
  showScreen('notes');
}
function closeNotes() {
  renderMap();
  showScreen('map');
}
function renderNotes() {
  const tips = allTips();
  const known = tips.filter(t => knownTips.has(t.id));
  document.getElementById('notes-count').textContent = known.length;
  document.getElementById('notes-total').textContent = tips.length;

  const body = document.getElementById('notes-body');
  body.innerHTML = '';

  if (!known.length) {
    const empty = document.createElement('div');
    empty.className = 'notes-empty';
    empty.textContent = 'No notes yet — explore and the tips you find will be jotted down here.';
    body.appendChild(empty);
    return;
  }

  TIP_CATEGORIES.forEach(cat => {
    const inCat = tips.filter(t => t.cat === cat);
    const got   = inCat.filter(t => knownTips.has(t.id));
    if (!inCat.length) return;

    const head = document.createElement('div');
    head.className = 'notes-cat';
    head.innerHTML = `<span>${cat}</span><span class="notes-cat-count">${got.length}/${inCat.length}</span>`;
    body.appendChild(head);

    inCat.forEach(t => {
      const have = knownTips.has(t.id);
      const card = document.createElement('div');
      card.className = 'note-card' + (have ? '' : ' locked');
      if (have) {
        card.innerHTML =
          `<div class="note-icon">${t.icon}</div>` +
          `<div class="note-text"><div class="note-title">${t.title}</div>` +
          `<div class="note-body">${t.text}</div></div>`;
      } else {
        card.innerHTML =
          `<div class="note-icon">🔒</div>` +
          `<div class="note-text"><div class="note-title">???</div>` +
          `<div class="note-body">Keep exploring to discover this tip.</div></div>`;
      }
      body.appendChild(card);
    });
  });
}

// ═══════════════════════════════════════════════════
// COMPLETE SCREEN
// ═══════════════════════════════════════════════════
function showComplete() {
  document.getElementById('complete-sub').textContent =
    `All ${POKEMON_DATA.length} Lukeymon caught!`;
  const rowEl = document.getElementById('complete-row');
  rowEl.innerHTML = '';
  POKEMON_DATA.forEach(p => {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-block';
    wrap.style.margin  = '2px';
    wrap.appendChild(pokeImg(p, 28));
    rowEl.appendChild(wrap);
  });
  showScreen('complete');
  runParade(POKEMON_DATA);   // rapid roll-call of every Lukeymon, then the trophy
}

// Celebratory roll-call: each Lukeymon flies in big, holds, then zooms out as the
// next arrives — a fast montage of the whole dex. Tap to skip to the trophy.
function runParade(list) {
  const screen = document.getElementById('complete-screen');
  const old = document.getElementById('parade-stage');
  if (old) old.remove();

  const stage = document.createElement('div');
  stage.id = 'parade-stage';
  const skip = document.createElement('div');
  skip.className = 'parade-skip';
  skip.textContent = 'tap to skip ▸';
  stage.appendChild(skip);
  screen.appendChild(stage);
  screen.classList.add('parading');

  const STEP = 100;            // ms between entries — "rapid"
  let i = 0, done = false;
  function finish() {
    if (done) return;
    done = true;
    stage.remove();
    screen.classList.remove('parading');
  }
  stage.addEventListener('click', finish);

  function next() {
    if (done) return;
    if (i >= list.length) { setTimeout(finish, 450); return; }
    const p = list[i++];
    const card = document.createElement('div');
    card.className = 'parade-poke';
    card.appendChild(pokeImg(p, 116));
    const nm = document.createElement('div');
    nm.className = 'parade-name';
    nm.textContent = p.name;
    card.appendChild(nm);
    stage.appendChild(card);
    beep(360 + (i * 17) % 520, 0.05, 0.06);

    if (card.animate) {
      const a = card.animate([
        { transform: 'translateY(38px) scale(0.3)',  opacity: 0, offset: 0,    easing: 'cubic-bezier(.2,.8,.2,1)' },
        { transform: 'translateY(0) scale(1)',        opacity: 1, offset: 0.4 },
        { transform: 'translateY(0) scale(1)',        opacity: 1, offset: 0.62, easing: 'ease-in' },
        { transform: 'translateY(-34px) scale(1.55)', opacity: 0, offset: 1 },
      ], { duration: STEP * 2.4, fill: 'forwards' });
      a.onfinish = () => card.remove();
    } else {
      setTimeout(() => card.remove(), STEP * 2);
    }
    setTimeout(next, STEP);
  }
  next();
}

// ═══════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// D-PAD / A-B MENU NAVIGATION
//   D-pad moves a focus cursor, A activates it, B goes back.
//   (World movement stays continuous via keys[]; A/B are shortcuts there.)
// ═══════════════════════════════════════════════════
let nav = { items: [], index: 0, cols: 1, onBack: null };

function navClear() {
  nav.items.forEach(el => el && el.classList && el.classList.remove('nav-focus'));
}
function navShow() {
  navClear();
  const el = nav.items[nav.index];
  if (el) {
    el.classList.add('nav-focus');
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
function setNav(items, opts = {}) {
  navClear();
  nav.items  = (items || []).filter(el => el && !(el.classList && el.classList.contains('hidden')));
  nav.cols   = opts.cols || 1;
  nav.onBack = opts.onBack || null;
  nav.index  = Math.min(opts.index || 0, Math.max(0, nav.items.length - 1));
  navShow();
}
function navMove(dir) {
  const n = nav.items.length;
  if (!n) return;
  const c = nav.cols;
  let i = nav.index;
  if      (dir === 'left')  i = (i - 1 + n) % n;
  else if (dir === 'right') i = (i + 1) % n;
  else if (dir === 'up')    i = ((i - c) % n + n) % n;
  else if (dir === 'down')  i = (i + c) % n;
  nav.index = i;
  navShow();
  beep(340, 0.03, 0.05);
}
function navActivate() {
  const el = nav.items[nav.index];
  if (el && !el.disabled) el.click();
}
function navBack() { if (nav.onBack) nav.onBack(); }

// Route a button press (from D-pad, A/B, or keyboard) to the current screen.
let _uiLast = '', _uiLastT = 0;
function uiPress(action) {
  if (!action) return;
  const now = Date.now();
  if (action === _uiLast && now - _uiLastT < 30) return;   // kill synthetic touch+pointer dupes
  _uiLast = action; _uiLastT = now;

  if (gameState === 'world') {           // movement handled by keys[] in the loop
    if      (action === 'a') openPokedex();
    else if (action === 'b') openMap();
    return;
  }
  if (action === 'a')      navActivate();
  else if (action === 'b') navBack();
  else                     navMove(action);
}

// Build the focus ring for a screen (called by showScreen, after it has rendered).
function setupNav(id) {
  const $   = s => document.getElementById(s);
  const all = s => Array.from(document.querySelectorAll(s));
  switch (id) {
    case 'title':     setNav([$('play-btn'), $('title-settings')]); break;
    case 'settings':  setNav([$('set-sound'), $('set-guide'), $('settings-back')], { onBack: closeSettings }); break;
    case 'slot':      setNav(all('#slot-list .slot-info'), { onBack: () => showScreen('title') }); break;
    case 'name':      setNav([$('name-ok'), $('name-cancel')], { cols: 2, onBack: openSlots }); break;
    case 'intro':     setNav([$('intro-begin')], { onBack: () => $('intro-begin').click() }); break;
    case 'pokedex':   setNav(all('#pokedex-grid .dex-card.caught'), { cols: 3, onBack: closePokedex }); break;
    case 'map':       setNav([...all('#map-zones .map-zone.travelable'), $('map-help'), $('map-badges'), $('map-notes'), $('map-back')], { onBack: closeMap }); break;
    case 'help':      setNav([$('help-back')], { onBack: closeHelp }); break;
    case 'badges':    setNav([$('badges-back')], { onBack: closeBadgeCase }); break;
    case 'notes':     setNav([$('notes-back')], { onBack: closeNotes }); break;
    case 'shop':      setNav([...all('#shop-screen .shop-buy-btn'), $('shop-close')], { onBack: closeShop }); break;
    case 'npc':       setNav([$('npc-advance')], { onBack: advanceNPC }); break;
    case 'gift':      setNav([$('gift-continue')], { onBack: continueGift }); break;
    case 'result':    setNav([$('result-continue')], { onBack: () => $('result-continue').click() }); break;
    case 'complete':  setNav([$('complete-restart')], { onBack: () => $('complete-restart').click() }); break;
    case 'champion':  setNav([$('champion-continue')], { onBack: () => $('champion-continue').click() }); break;
    case 'encounter': setNav(all('#enc-buttons .action-btn'), { cols: 3 }); break;
    case 'battle':    break;   // set per-round by nextBattleRound / showBattleWin / rocketIntro
    default:          setNav([]); break;   // world & misc: no cursor
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id + '-screen');
  if (el) el.classList.add('active');
  if (id !== 'encounter') gameState = id;
  setupNav(id);
  setMusic(trackForScreen(id));
}

function showMessage(html) {
  const box = document.getElementById('message-box');
  document.getElementById('message-text').innerHTML = html;
  box.classList.remove('hidden');
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => box.classList.add('hidden'), 3000);
}

function updateHud() {
  document.getElementById('caught-count').textContent = caughtIds.size;
  document.getElementById('total-count').textContent  = POKEMON_DATA.length;
  document.getElementById('ball-count').textContent   = balls;
  document.getElementById('coin-count').textContent   = coins;
  // Master balls only shown once you own one.
  const mh = document.getElementById('hud-master');
  if (mh) {
    mh.classList.toggle('hidden', masterBalls <= 0);
    document.getElementById('master-count').textContent = masterBalls;
  }
  const zoneEl = document.getElementById('zone-name');
  if (zoneEl) zoneEl.textContent = ZONE_INFO[currentZone].name;

  // Evolution stones (only shown once you own some).
  const hs = document.getElementById('hud-stones');
  if (hs) {
    const owned = Object.keys(STONES).filter(k => (stones[k] || 0) > 0);  // reusable → show icons, no counts
    hs.innerHTML = owned.map(k => STONES[k].emoji).join('');
    hs.classList.toggle('hidden', owned.length === 0);
  }

  // Current buddy chip (sprite + type), tap to cycle.
  const buddy = POKEMON_DATA.find(p => p.id === activePet);
  const bi = document.getElementById('hud-buddy-icon');
  const bt = document.getElementById('hud-buddy-type');
  if (bi) {
    bi.innerHTML = '';
    if (buddy) bi.appendChild(pokeImg(buddy, 18));
    else bi.textContent = '➕';
  }
  if (bt) {
    if (buddy) {
      bt.textContent = buddy.type.slice(0, 3).toUpperCase();
      bt.style.background = typeColor(buddy.type);
      bt.classList.remove('hidden');
    } else {
      bt.classList.add('hidden');
    }
  }
}

// ═══════════════════════════════════════════════════
// GAME FLOW
// ═══════════════════════════════════════════════════
// ── Save slots ───────────────────────────────────────
let currentSlot = 1;
let saveName    = '';
let pendingNewSlot = 1;
function slotKey(n) { return SAVE_KEY + '_s' + n; }

// Move a pre-slots single save into slot 1 the first time (preserve progress).
function migrateLegacy() {
  try {
    const legacy = localStorage.getItem(SAVE_KEY);
    if (legacy && !localStorage.getItem(slotKey(1))) {
      const data = JSON.parse(legacy);
      const obj = Array.isArray(data) ? { caught: data } : data;
      obj.name = obj.name || 'SAVE 1';
      localStorage.setItem(slotKey(1), JSON.stringify(obj));
    }
    localStorage.removeItem(SAVE_KEY);
  } catch (_) {}
}

// Peek a slot for the select screen.
function slotMeta(n) {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return { exists: false };
    const d = JSON.parse(raw);
    return {
      exists: true,
      name:   d.name || `SAVE ${n}`,
      caught: (d.caught || []).length,
      badges: (d.collected || []).length,
    };
  } catch (_) { return { exists: false }; }
}

function startNewGame() {
  caughtIds.clear();
  seenIds.clear();
  unlockedBarriers.clear();
  collected.clear();
  metNPCs.clear();
  knownTips.clear();
  notesUnread = false;
  rocketDefeated.clear();
  wonGame = false;
  pendingChampion = false;
  balls = 12;
  masterBalls = 0;
  coins = 0;
  loadedRoamers = null;
  initRoamers();
  clearWild();
  clearTimeout(spawnTimerId);
  currentZone = 9;             // start inside your home
  playerX = 5; playerY = 6; playerDir = 'down';
  fromPx.x = 5 * TILE_SIZE;
  fromPx.y = 6 * TILE_SIZE;
  moveAnimTs = -9999;
  bumpVec = null;
  activePet = null;
  petX = 5; petY = 6;
  petFromPx.x = 5 * TILE_SIZE; petFromPx.y = 6 * TILE_SIZE;
  petMoveAnimTs = -9999;
  surfNoted = false;
  slipNoted = false;
  saveGame();
  updateHud();
  enterWorld();
}

function enterWorld() {
  gameState = 'world';
  showScreen('world');
  updateHud();
  scheduleSpawn();
}

// ═══════════════════════════════════════════════════
// SAVE / LOAD
// ═══════════════════════════════════════════════════
function saveGame() {
  try {
    localStorage.setItem(slotKey(currentSlot), JSON.stringify({
      name:      saveName,
      caught:    [...caughtIds],
      seen:      [...seenIds],
      barriers:  [...unlockedBarriers],
      collected: [...collected],
      metNPCs:   [...metNPCs],
      knownTips: [...knownTips],
      rocketDefeated: [...rocketDefeated],
      wonGame,
      roamers:   roamers.map(r => ({ legend: r.legend, zone: r.zone, x: r.x, y: r.y })),
      zone:      currentZone,
      x:         playerX,
      y:         playerY,
      activePet,
      balls,
      masterBalls,
      coins,
      lastHeal,
      stones,
      foundStones: [...foundStones],
      bondSteps,
      battleUses,
    }));
  } catch (_) {}
}

// Load slot n into the live game state. Returns true if data was present.
function loadSlot(n) {
  currentSlot = n;
  let had = false;
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (raw) {
      had = true;
      const data = JSON.parse(raw);
      saveName         = data.name || `SAVE ${n}`;
      caughtIds        = new Set(data.caught || []);
      seenIds          = new Set([...(data.seen || []), ...caughtIds]);   // caught ⇒ seen
      unlockedBarriers = new Set(data.barriers || []);
      collected        = new Set(data.collected || []);
      metNPCs          = new Set(data.metNPCs || []);
      knownTips        = new Set(data.knownTips || []);
      rocketDefeated   = new Set(data.rocketDefeated || []);
      // Legacy saves that already had all 4 land badges count as won (don't re-fire).
      wonGame          = !!data.wonGame || landBadgesDone();
      pendingChampion  = false;
      loadedRoamers    = data.roamers || null;
      currentZone    = data.zone  ?? 0;
      playerX        = data.x    ?? 10;
      playerY        = data.y    ?? 7;
      balls = data.balls ?? 12;
      masterBalls = data.masterBalls ?? 0;
      coins = data.coins ?? 0;
      lastHeal = data.lastHeal || '';
      stones = data.stones || {};
      foundStones = new Set(data.foundStones || []);
      bondSteps = data.bondSteps || {};
      battleUses = data.battleUses || {};
      activePet = data.activePet ?? null;
      if (currentZone < 0 || currentZone >= ZONE_INFO.length) currentZone = 0;
      [playerX, playerY] = nearestWalkable(currentZone, playerX, playerY);
      fromPx.x   = playerX * TILE_SIZE;
      fromPx.y   = playerY * TILE_SIZE;
      moveAnimTs = -9999;
      bumpVec    = null;
      petX = playerX; petY = playerY;
      petFromPx.x = petX * TILE_SIZE; petFromPx.y = petY * TILE_SIZE;
      petMoveAnimTs = -9999;
      surfNoted = false;
      slipNoted = false;
      notesUnread = false;
    }
  } catch (_) {}
  initRoamers();
  updateHud();
  return had;
}

// ── Slot select / naming UI ──────────────────────────
function openSlots() {
  renderSlots();
  showScreen('slot');
}

function renderSlots() {
  const list = document.getElementById('slot-list');
  list.innerHTML = '';
  for (let n = 1; n <= 3; n++) {
    const m = slotMeta(n);
    const card = document.createElement('div');
    card.className = 'slot-card' + (m.exists ? ' used' : ' empty');

    const info = document.createElement('div');
    info.className = 'slot-info';
    if (m.exists) {
      info.innerHTML = `<div class="slot-name">${m.name}</div>` +
        `<div class="slot-prog">🎒 ${m.caught}/${POKEMON_DATA.length} &nbsp; 🏅 ${m.badges}/${COLLECTIBLES.length}</div>`;
    } else {
      info.innerHTML = `<div class="slot-name">SLOT ${n}</div><div class="slot-prog">— empty —</div>`;
    }
    info.addEventListener('click', () => selectSlot(n));
    card.appendChild(info);

    if (m.exists) {
      const er = document.createElement('button');
      er.className = 'slot-erase';
      er.textContent = '⌫';
      er.title = 'Hold to erase';
      bindHoldErase(er, n);
      card.appendChild(er);
    }
    list.appendChild(card);
  }
}

function selectSlot(n) {
  wakeAudio();
  if (slotMeta(n).exists) {
    loadSlot(n);
    enterWorld();
  } else {
    pendingNewSlot = n;
    const inp = document.getElementById('name-input');
    inp.value = '';
    showScreen('name');
    setTimeout(() => inp.focus(), 50);
  }
}

function confirmName() {
  const raw = document.getElementById('name-input').value.trim().toUpperCase();
  saveName = (raw || `TRAINER`).slice(0, 10);
  currentSlot = pendingNewSlot;
  // The professor sees you off before your adventure begins.
  const nm = saveName.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  document.getElementById('intro-text').innerHTML =
    `Wonderful to meet you, <b>${nm}</b>!<br><br>` +
    `A whole island of Lukeymon is waiting. Befriend them with kindness, ` +
    `earn the four Gym Badges, and who knows what legends you'll uncover…<br><br>` +
    `Good luck, ${nm}! Your adventure starts at home. 🌟`;
  showScreen('intro');
  beep(523, 0.1, 0.1); setTimeout(() => beep(659, 0.1, 0.12), 130); setTimeout(() => beep(784, 0.16, 0.2), 270);
}

function beginAdventure() {
  startNewGame();          // writes a fresh save and spawns you inside your home
}

// Erase a slot only on a deliberate ~1.2s hold (buried so it can't happen by accident).
function bindHoldErase(btn, n) {
  let timer = null, raf = null, start = 0;
  const HOLD = 1200;
  const begin = e => {
    e.preventDefault(); e.stopPropagation();
    start = Date.now();
    btn.classList.add('erasing');
    const tick = () => {
      const p = Math.min((Date.now() - start) / HOLD, 1);
      btn.style.setProperty('--p', (p * 100) + '%');
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => {
      localStorage.removeItem(slotKey(n));
      beep(140, 0.2, 0.3, 'square');
      cancel();
      renderSlots();
    }, HOLD);
  };
  const cancel = () => {
    clearTimeout(timer); timer = null;
    if (raf) cancelAnimationFrame(raf);
    btn.classList.remove('erasing');
    btn.style.setProperty('--p', '0%');
  };
  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
}

// ═══════════════════════════════════════════════════
// AUDIO (Web Audio API chiptune)
// ═══════════════════════════════════════════════════
function wakeAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
    if (!audioUnlocked) {
      // iOS/WebKit: actually play a 1-sample silent buffer *inside the gesture*
      // to fully unlock the context (resume() alone is not enough on iOS).
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
      audioUnlocked = true;
    }
    if (!muted && !musicTimer && curMusic) restartMusic();   // (re)start loop once audio is live
  } catch (_) {}
}

function updateMuteBtn() {
  const b = document.getElementById('mute-btn');
  if (b) b.textContent = muted ? '🔇' : '🔊';
}
function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('lukeymon_muted', muted ? '1' : '0'); } catch (_) {}
  updateMuteBtn();
  if (muted) { stopMusic(); }
  else { wakeAudio(); restartMusic(); beep(660, 0.08, 0.08); }   // resume + confirm blip
}

// Cycle the active buddy through your caught Lukeymon (and a "no buddy" slot).
function cycleBuddy() {
  const team = POKEMON_DATA.filter(p => caughtIds.has(p.id));
  if (!team.length) { showMessage('Catch a Lukeymon first to choose a buddy!'); return; }
  let idx = team.findIndex(p => p.id === activePet);
  idx = (idx + 1) % (team.length + 1);            // last slot = no buddy
  activePet = idx === team.length ? null : team[idx].id;
  if (activePet != null) {
    petX = playerX; petY = playerY;
    petFromPx.x = petX * TILE_SIZE; petFromPx.y = petY * TILE_SIZE;
    petMoveAnimTs = -9999;
  }
  saveGame();
  updateHud();
  beep(523, 0.06, 0.07);
  const cur = POKEMON_DATA.find(p => p.id === activePet);
  showMessage(cur ? `🐾 Buddy: ${cur.name} (${cur.type})` : '🐾 No buddy following');
  if (cur) learnTip('buddy');
}

// ═══════════════════════════════════════════════════
// BACKGROUND MUSIC  (simple hand-written chiptune loops)
// ═══════════════════════════════════════════════════
const NOTE = (() => {
  const m = { '-': 0, '': 0 };
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  for (let oct = 2; oct <= 6; oct++)
    for (let n = 0; n < 12; n++)
      m[names[n] + oct] = 440 * Math.pow(2, ((oct + 1) * 12 + n - 69) / 12);
  return m;
})();

const MUSIC = {
  title: {
    tempo: 112,
    melody: ['G4','-','C5','-','E5','-','D5','C5','E5','-','G5','-','A5','-','G5','-',
             'F5','-','A5','-','G5','-','E5','-','D5','-','C5','-','E5','-','-','-'],
    bass:   ['C3','-','-','-','F3','-','-','-','G3','-','-','-','C3','-','-','-'],
  },
  world: {
    tempo: 132,
    melody: ['C5','E5','G5','E5','F5','A5','G5','-','E5','G5','C6','B5','A5','G5','E5','-',
             'D5','F5','A5','F5','G5','B5','A5','-','C6','B5','A5','G5','F5','D5','C5','-'],
    bass:   ['C3','-','G3','-','F3','-','G3','-','C3','-','G3','-','A3','-','E3','-',
             'D3','-','A3','-','G3','-','D3','-','F3','-','G3','-','C3','-','G3','-'],
  },
  battle: {
    tempo: 168,
    melody: ['A4','C5','E5','A5','E5','C5','A4','-','G4','B4','D5','G5','D5','B4','G4','-',
             'F4','A4','C5','F5','E5','C5','A4','-','E5','D5','C5','B4','A4','-','E4','-'],
    bass:   ['A2','A3','A2','A3','G2','G3','G2','G3','F2','F3','F2','F3','E2','E3','E2','E3'],
  },
};

let curMusic = null;        // desired track name (survives mute)
let musicTimer = null;
let musicStep = 0;

function musicNote(freq, dur, type, vol) {
  if (!audioCtx || muted || !freq) return;
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g); g.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch (_) {}
}

// Brief full-screen flash — used as a "battle start" sting.
function flashScreen(color) {
  const sa = document.getElementById('screen-area');
  if (!sa) return;
  const f = document.createElement('div');
  f.className = 'screen-flash';
  if (color) f.style.background = color;
  sa.appendChild(f);
  setTimeout(() => f.remove(), 340);
}

function stopMusic() { clearTimeout(musicTimer); musicTimer = null; }

function restartMusic() {
  stopMusic();
  musicStep = 0;
  if (!curMusic || !audioCtx || muted) return;
  musicTick();
}

function musicTick() {
  const tr = MUSIC[curMusic];
  if (!tr) return;
  const stepMs = 60000 / tr.tempo / 2;          // eighth-note grid
  const mf = NOTE[tr.melody[musicStep % tr.melody.length]];
  const bf = NOTE[tr.bass[musicStep % tr.bass.length]];
  musicNote(mf, stepMs / 1000 * 0.85, 'square',   0.045);
  musicNote(bf, stepMs / 1000 * 0.95, 'triangle', 0.05);
  musicStep++;
  musicTimer = setTimeout(musicTick, stepMs);
}

function trackForScreen(id) {
  if (id === 'title' || id === 'slot' || id === 'name' || id === 'intro') return 'title';
  if (id === 'encounter' || id === 'battle')               return 'battle';
  if (id === 'result' || id === 'complete' || id === 'champion' || id === 'gift') return null; // let jingles ring
  return 'world';
}
function setMusic(track) {
  if (curMusic === track) return;
  curMusic = track;
  restartMusic();
}

function beep(freq, vol, dur, type = 'square') {
  if (!audioCtx || muted) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur + 0.01);
  } catch (_) {}
}

function playEncounterJingle() {
  beep(330, 0.12, 0.12);
  setTimeout(() => beep(440, 0.12, 0.12), 140);
  setTimeout(() => beep(550, 0.15, 0.22), 280);
}

function playCatchJingle() {
  const melody = [523, 659, 784, 1047];
  melody.forEach((f, i) => setTimeout(() => beep(f, 0.15, 0.18), i * 140));
}

// A grand fanfare for earning a badge — longer than a catch, with a flourish.
function playBadgeJingle() {
  const melody = [523, 659, 784, 1047, 880, 1047, 1319];
  melody.forEach((f, i) => setTimeout(() => beep(f, 0.14, 0.2), i * 130));
  setTimeout(() => beep(1568, 0.32, 0.32), melody.length * 130 + 60);
}

// ═══════════════════════════════════════════════════
// BADGE CELEBRATION  (reuses the catch result screen)
// ═══════════════════════════════════════════════════
function celebrateBadge(item) {
  clearWild();
  clearTimeout(spawnTimerId);

  document.getElementById('result-stars').classList.remove('hidden');
  document.getElementById('result-icon').innerHTML =
    `<span style="font-size:76px;display:inline-block;animation:trophypop .5s ease-out both">${item.emoji}</span>`;
  document.getElementById('result-title').textContent   = '🏅 BADGE GET!';
  document.getElementById('result-name').textContent    = item.name;
  document.getElementById('result-message').textContent =
    `Badge ${collected.size} of ${COLLECTIBLES.length} collected!`;

  const rs = document.getElementById('result-screen');
  rs.className = 'screen active success';
  showScreen('result');
  playBadgeJingle();
  badgeConfetti();
}

// Picked up a hidden Stone — same celebratory result screen as a badge.
function celebrateStone(s) {
  clearWild();
  clearTimeout(spawnTimerId);
  const st = STONES[s.stone];
  document.getElementById('result-stars').classList.remove('hidden');
  document.getElementById('result-icon').innerHTML =
    `<span style="font-size:76px;display:inline-block;animation:trophypop .5s ease-out both">${st.emoji}</span>`;
  document.getElementById('result-title').textContent   = '💎 STONE FOUND!';
  document.getElementById('result-name').textContent    = st.name;
  document.getElementById('result-message').textContent =
    'Yours to keep! Show it to a Pokémon on its Pokédex page to evolve it.';
  const rs = document.getElementById('result-screen');
  rs.className = 'screen active success';
  showScreen('result');
  playBadgeJingle();
  badgeConfetti();
}

// The shared evolution moment — the evolved form joins the dex (the base is kept),
// with confetti + jingle on the detail page, then the evolved form is revealed.
function performEvolution(target) {
  if (!target || caughtIds.has(target.id)) return;
  seenIds.add(target.id);
  caughtIds.add(target.id);
  saveGame();
  updateHud();
  playBadgeJingle();
  beep(523, 0.1, 0.1);
  setTimeout(() => beep(659, 0.1, 0.12), 120);
  setTimeout(() => beep(784, 0.16, 0.2), 260);
  badgeConfetti(document.getElementById('pokedex-detail'));
  showDetail(target);
}
// Stones are reusable, so we don't consume them — having one is enough.
function evolveWithStone(poke, rule) {
  if ((stones[rule.stone] || 0) <= 0) return;
  performEvolution(POKEMON_DATA.find(p => p.id === rule.to));
}
// Buddy / battle evolutions — only fire once the progress threshold is met.
function evolveByProgress(poke, rule) {
  if (!evoReady(rule)) return;
  performEvolution(POKEMON_DATA.find(p => p.id === rule.to));
}
// Dance Party (multiplayer): every dance-method Pokémon you own evolves at once.
// Called from net.js; the base is kept, the evolved form joins the dex. Returns the
// list of {from, to} names so the dance screen can show what happened.
function danceEvolve() {
  const done = [];
  for (const r of EVOS) {
    if (r.method !== 'dance' || !caughtIds.has(r.from) || caughtIds.has(r.to)) continue;
    const t = POKEMON_DATA.find(p => p.id === r.to), f = POKEMON_DATA.find(p => p.id === r.from);
    if (!t) continue;
    seenIds.add(t.id); caughtIds.add(t.id);
    done.push({ from: f ? f.name : '?', to: t.name });
  }
  if (done.length) { saveGame(); updateHud(); if (typeof playBadgeJingle === 'function') playBadgeJingle(); }
  return done;
}

// A burst of celebratory emoji that fly outward from the centre and fade.
function badgeConfetti(screen) {
  screen = screen || document.getElementById('result-screen');
  const pieces = ['✨', '🎉', '⭐', '🏅', '🎊', '💫'];
  for (let i = 0; i < 20; i++) {
    const s = document.createElement('span');
    s.className = 'confetti-piece';
    s.textContent = pieces[i % pieces.length];
    const ang = Math.random() * Math.PI * 2, dist = 55 + Math.random() * 95;
    s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * dist - 20 + 'px');
    s.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    s.style.animationDelay = (Math.random() * 0.15) + 's';
    s.style.fontSize = (12 + Math.random() * 10) + 'px';
    screen.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}

function playFledSound() {
  beep(440, 0.12, 0.12);
  setTimeout(() => beep(330, 0.10, 0.12), 140);
  setTimeout(() => beep(220, 0.10, 0.25), 280);
}

// ═══════════════════════════════════════════════════
// SPRITE HELPER — image with emoji fallback
// ═══════════════════════════════════════════════════

// Returns an <img> element; if the file 404s it swaps itself for an emoji span.
function pokeImg(poke, sizePx) {
  const img = new Image();
  img.src    = poke.sprite;
  img.alt    = poke.name;
  img.width  = sizePx;
  img.height = sizePx;
  img.className = 'poke-sprite';
  img.onerror = () => {
    const span = document.createElement('span');
    span.textContent  = poke.emoji;
    span.style.fontSize = Math.round(sizePx * 0.75) + 'px';
    span.style.lineHeight = '1';
    img.replaceWith(span);
  };
  return img;
}

// Replace all children of el with a fresh sprite/emoji for poke.
function setPokeDisplay(el, poke, sizePx) {
  el.innerHTML = '';
  el.appendChild(pokeImg(poke, sizePx));
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function typeColor(type) {
  const map = {
    Grass:    '#386830', Fire:    '#c04020',
    Water:    '#1850a0', Bug:     '#608020',
    Flying:   '#5870b0', Normal:  '#505058',
    Electric: '#907000', Fairy:   '#9050a0',
    Ghost:    '#4030a0', Psychic: '#a02060',
    Fighting: '#a03028', Poison:  '#803090',
    Ground:   '#9a7028', Rock:    '#807838',
    Ice:      '#3888a8', Dragon:  '#5028c0',
  };
  return map[type] || '#404050';
}

// ═══════════════════════════════════════════════════
// DEBUG MENU  (toggle with the ` backtick key)
// ═══════════════════════════════════════════════════
let dbgPanel = null;

function setupDebugMenu() {
  const p = document.createElement('div');
  p.id = 'debug-panel';
  Object.assign(p.style, {
    position: 'fixed', top: '0', left: '0', zIndex: '99999',
    width: '184px', maxHeight: '100vh', overflowY: 'auto',
    background: 'rgba(8,10,18,0.94)', color: '#cfe', padding: '6px 8px',
    font: '10px/1.5 monospace', border: '1px solid #345', display: 'none',
    boxShadow: '2px 2px 12px rgba(0,0,0,.6)',
  });

  const status = document.createElement('pre');
  status.id = 'debug-status';
  Object.assign(status.style, { margin: '0 0 6px', color: '#7fd', whiteSpace: 'pre-wrap', fontSize: '9px' });
  p.appendChild(status);

  const section = label => {
    const h = document.createElement('div');
    h.textContent = label;
    Object.assign(h.style, { color: '#fa6', marginTop: '6px', fontWeight: 'bold' });
    p.appendChild(h);
  };
  const btn = (label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      display: 'inline-block', margin: '2px 2px 0 0', padding: '2px 5px',
      font: '9px monospace', background: '#1d2b40', color: '#dfe',
      border: '1px solid #46688c', borderRadius: '3px', cursor: 'pointer',
    });
    b.addEventListener('click', () => { fn(); dbgRefresh(); });
    p.appendChild(b);
  };

  section('ITEMS');
  btn('+10 Balls',   () => { balls += 10; });
  btn('+5 Master',   () => { masterBalls += 5; });
  btn('+100 Coins',  () => { coins += 100; });
  btn('All Stones',  () => { Object.keys(STONES).forEach(k => stones[k] = (stones[k] || 0) + 1); });
  btn('Fill evo progress', () => { caughtIds.forEach(id => { bondSteps[id] = 99; battleUses[id] = 99; }); });

  section('CATCH');
  btn('Catch ALL',        () => { POKEMON_DATA.forEach(p => caughtIds.add(p.id)); awardTrioBadge(); refreshRoamers(); });
  btn('All but Mewtwo',   () => { POKEMON_DATA.forEach(p => { if (p.legend !== 'mewtwo') caughtIds.add(p.id); }); awardTrioBadge(); refreshRoamers(); });
  btn('3 Birds',          () => { [144,145,146].forEach(id => caughtIds.add(id)); awardTrioBadge(); refreshRoamers(); });
  btn('Clear caught',     () => { caughtIds.clear(); refreshRoamers(); });

  section('BARRIERS');
  btn('Unlock all', () => { Object.keys(BARRIERS).forEach(k => unlockedBarriers.add(k)); });
  btn('Lock all',   () => { unlockedBarriers.clear(); });

  section('BADGES');
  btn('Grant all', () => { COLLECTIBLES.forEach(c => collected.add(c.id)); });
  btn('Clear',     () => { collected.clear(); });

  section('LEGENDARIES (here)');
  btn('Summon Mew',    () => dbgSummon('mew'));
  btn('Summon Mewtwo', () => dbgSummon('mewtwo'));
  btn('Relocate all',  () => { roamers.forEach(relocateRoamer); });

  section('TELEPORT');
  ZONE_INFO.forEach(z => btn(z.name, () => dbgTeleport(z.id)));

  section('WEATHER (here)');
  // Toggle buttons that show their own on/off state — handy on phone.
  const toggleBtn = (label, get, set) => {
    const b = document.createElement('button');
    Object.assign(b.style, {
      display: 'inline-block', margin: '2px 2px 0 0', padding: '2px 5px',
      font: '9px monospace', background: '#1d2b40', color: '#dfe',
      border: '1px solid #46688c', borderRadius: '3px', cursor: 'pointer',
    });
    const sync = () => { b.textContent = label + ': ' + (get() ? 'ON' : 'off'); b.style.background = get() ? '#2a5a3a' : '#1d2b40'; };
    b.addEventListener('click', () => { set(!get()); sync(); });
    sync();
    p.appendChild(b);
  };
  toggleBtn('🔁 Day/Night cycle', () => nightCycle, v => { nightCycle = v; });
  toggleBtn('🌙 Force night', () => nightMode, v => { nightMode = v; });
  toggleBtn('🌧️ Force rain',  () => rainMode,  v => { rainMode  = v; });

  section('MISC');
  btn('Clear NPC visits', () => { metNPCs.clear(); });
  btn('Copy map JSON', () => dbgCopyMaps());

  section('SAVE');
  btn('Save',  () => saveGame());
  btn('RESET slot', () => { startNewGame(); });
  btn('Close',  () => toggleDebug());

  document.body.appendChild(p);
  dbgPanel = p;
  // No visible toggle — the menu is opened with the secret code: A B B A Select Start
  // (keyboard: X Z Z X Shift Enter). See kamiInput / DEBUG_CODE.
}

function toggleDebug() {
  if (!dbgPanel) return;
  dbgPanel.style.display = (dbgPanel.style.display === 'none') ? 'block' : 'none';
  dbgRefresh();
}

function dbgRefresh() {
  saveGame();
  updateHud();
  if (gameState === 'map')    renderMap();
  if (gameState === 'badges') renderBadgeCase();
  if (gameState === 'pokedex') renderPokedexGrid();
  const s = document.getElementById('debug-status');
  if (s) {
    s.textContent =
      `zone ${currentZone} (${ZONE_INFO[currentZone].name})  @${playerX},${playerY}\n` +
      `state:${gameState}\n` +
      `dex ${caughtIds.size}/${POKEMON_DATA.length}  badges ${collected.size}/${COLLECTIBLES.length}\n` +
      `balls ${balls}  master ${masterBalls}  coins ${coins}\n` +
      `barriers ${unlockedBarriers.size}/${Object.keys(BARRIERS).length}\n` +
      `roamers: ${roamers.map(r => r.legend + '@' + ZONE_INFO[r.zone].name).join(', ') || 'none'}`;
  }
}

// Drop a legendary right next to the player (works regardless of progress).
function dbgSummon(legend) {
  roamers = roamers.filter(r => r.legend !== legend);
  const poke = POKEMON_DATA.find(p => p.legend === legend);
  caughtIds.delete(poke.id);
  const [x, y] = nearestOpenTile(currentZone, playerX + 1, playerY);
  roamers.push({ legend, pokeId: poke.id, zone: currentZone, x, y });
}

// Dump the current maps as JSON (paste into editor.html → Import to seed it).
function dbgCopyMaps() {
  let s = '{\n';
  for (let z = 0; z < MAPS.length; z++) {
    s += `  "${z}": [\n` + MAPS[z].map(r => '    [' + r.join(',') + ']').join(',\n') +
         '\n  ]' + (z < MAPS.length - 1 ? ',' : '') + '\n';
  }
  s += '}';
  if (navigator.clipboard) navigator.clipboard.writeText(s).catch(() => {});
  showMessage('🗺️ Current map JSON copied — paste into the editor');
}

function dbgTeleport(zone) {
  currentZone = zone;
  const { cols, rows } = ZONE_INFO[zone];
  [playerX, playerY] = nearestWalkable(zone, Math.floor(cols / 2), Math.floor(rows / 2));
  fromPx.x = playerX * TILE_SIZE;
  fromPx.y = playerY * TILE_SIZE;
  moveAnimTs = -9999;
  bumpVec = null;
  clearWild();
  gameState = 'world';
  showScreen('world');
  scheduleSpawn();
}
