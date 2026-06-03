'use strict';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════
const TILE_SIZE      = 32;
const MAP_COLS       = 20;
const MAP_ROWS       = 14;
const WILD_TIMEOUT   = 7000;   // ms a wild Pokémon stays on its tile before fleeing
const TIMER_MS       = 6000;   // 6 seconds to choose
const MOVE_INTERVAL  = 190;    // ms between repeated steps
const MOVE_ANIM_MS   = 140;    // ms to slide between tiles
const BUMP_ANIM_MS   = 220;    // ms for wall-bounce animation
const SAVE_KEY       = 'lukeymon_v3';

const T = { PATH: 0, GRASS: 1, TREE: 2, WATER: 3, SAND: 4, CITY: 5, SHOP: 6, LAVA: 7, ICE: 8, BOULDER: 9, CAVE: 10, CAVE_ENTRANCE: 11 };
const LAPRAS_ID = 131;   // catching Lapras lets the player cross water (surf)

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

const BARRIERS = {
  log:   { needsType: 'Fire',     hint: 'Catch a 🔥 Fire Pokémon to burn these logs!',       cleared: '🔥 Your Fire Pokémon burns away the logs!',      sign: '🔥' },
  rock:  { needsType: 'Water',    hint: 'Catch a 💧 Water Pokémon to wash these rocks!',     cleared: '💧 Your Water Pokémon washes the rocks aside!',  sign: '💧' },
  fence: { needsType: 'Electric', hint: 'Catch a ⚡ Electric Pokémon to short the fence!',   cleared: '⚡ Your Electric Pokémon shorts out the fence!', sign: '⚡' },
  lava:  { needsType: 'Water',    hint: 'Catch a 💧 Water Pokémon to cool the lava flow!',   cleared: '💧 Your Water Pokémon cools the lava flow!',     sign: '💧' },
  vine:  { needsType: 'Grass',    hint: 'Catch a 🌿 Grass Pokémon to cut through the vines!', cleared: '🌿 Your Grass Pokémon cuts through the vines!',  sign: '🌿' },
  frost: { needsType: 'Fire',     hint: 'Catch a 🔥 Fire Pokémon to melt the ice wall!',     cleared: '🔥 Your Fire Pokémon melts the ice wall!',       sign: '🔥' },
  sand:  { needsType: 'Ground',   hint: 'Catch a 🌍 Ground Pokémon to clear the sand wall!', cleared: '🌍 Your Ground Pokémon clears the sand wall!',   sign: '🌍' },
};

// World-map layout: schematic grid position + icon per zone, from world.js.
// Any zone without a position is auto-placed so new zones still appear.
const ZONE_MAP = {};
(() => {
  let auto = 1;
  WORLD.zones.forEach(z => {
    if (z.cave) return;   // caves are portal-linked; they don't appear on the world map
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
const OBSTACLE_TILES = new Set([T.TREE, T.WATER, T.LAVA, T.ICE, T.BOULDER]);
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
  { id: 'badge_trio', auto: true, emoji: '🦅', name: 'Trio Badge', hint: 'Catch all 3 legendary birds' },
];

// Friendly characters you can walk up to and talk with. They stand on a tile
// (snapped to an open walkable spot) and block it — bump into them to chat.
const NPCS = [
  { zone: 0, x: 5, y: 4, emoji: '🧓', name: 'Professor', gift: 40, lines: [
    'Welcome to the Lukeymon lands, friend!',
    'Befriend a wild Lukeymon with the action it wants — Feed 🍎, Pet 🤚, or Play ⚽.',
    'Some paths are blocked. Catch the right type, then WALK INTO the barrier to clear it!',
  ] },
  { zone: 2, x: 6, y: 4, emoji: '👮', name: 'Officer', gift: 25, lines: [
    'Keeping the city safe, trainer.',
    'They say rare BADGES are hidden out in the faraway lands... Volcano, Desert, the icy caves.',
  ] },
  { zone: 1, x: 10, y: 18, emoji: '🏄', name: 'Surfer', gift: 25, lines: [
    'Waves are perfect today, dude!',
    'Water Lukeymon really love a gentle pet. 🤚',
  ] },
  { zone: 5, x: 20, y: 7, emoji: '🧙', name: 'Hermit', gift: 50, lines: [
    '...you wandered this deep into the forest? Impressive.',
    'Collect every badge AND every Lukeymon, and you will be a true master.',
  ] },
];

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
let balls          = 5;
let masterBalls    = 0;        // for capturing Mew / Mewtwo only
let coins          = 0;
let roamers        = [];       // active legendary roamers: { legend, pokeId, zone, x, y }
let loadedRoamers  = null;     // roamer positions restored from save
let currentLegend  = null;     // roamer being engaged in the current encounter/battle
let pendingMsg     = null;     // a message to surface when the player returns to the world
let encHappy       = false;
let wildPoke       = null;   // { poke, x, y, zone, expireAt } — active wild on map
let spawnTimerId   = null;   // next spawn setTimeout id
let expireTimerId  = null;   // current wild's disappear setTimeout id
let currentPoke = null;
let timerId     = null;
let timerStart  = 0;
let canvas, ctx;
let audioCtx    = null;
let currentZone = 0;
let unlockedBarriers = new Set();  // barrier keys the player has physically cleared
let collected = new Set();         // ids of badges/collectibles found
let metNPCs   = new Set();         // names of NPCs already greeted (one-time gift)
let currentNPC = null;             // NPC whose dialog is open
let npcLineIdx = 0;

// ── Animation state ─────────────────────────────────
let fromPx      = { x: 10 * TILE_SIZE, y: 7 * TILE_SIZE };
let moveAnimTs  = -9999;
let bumpVec     = null;
let bumpAnimTs  = -9999;
let camX = 0, camY = 0;

// ── Buddy / follower pet ─────────────────────────────
let activePet   = null;   // pokeId of the Pokémon trailing the player (null = none)
let petX        = 10;
let petY        = 7;
let petFromPx   = { x: 10 * TILE_SIZE, y: 7 * TILE_SIZE };
let petMoveAnimTs = -9999;
let petFacing   = 1;      // 1 = facing right (default), -1 = flipped to face left
let detailPoke  = null;   // the Pokémon currently open in the Pokédex detail view
let surfNoted   = false;  // shown the "you can surf" hint this session yet?

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
  requestAnimationFrame(loop);
});

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
  buildVariants(T.SHOP,  1, paintShop);
  buildVariants(T.LAVA,  4, paintLava);
  buildVariants(T.ICE,   4, paintIce);
  buildVariants(T.BOULDER, 3, paintBoulder);
  buildVariants(T.CAVE,  4, paintCave);
  buildVariants(T.CAVE_ENTRANCE, 1, paintCaveEntrance);
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
  document.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return; // don't hijack text fields
    keys[e.key] = true;
    wakeAudio();
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
    if (kbKamiMap[e.key]) kamiInput(kbKamiMap[e.key]);
    // 'M' toggles the world map from the world screen.
    if (e.key === 'm' || e.key === 'M') {
      if (gameState === 'world') openMap();
      else if (gameState === 'map') closeMap();
    }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  // Title / save slots
  document.getElementById('play-btn').addEventListener('click', () => { wakeAudio(); openSlots(); });
  document.getElementById('slot-back').addEventListener('click', () => showScreen('title'));
  document.getElementById('name-ok').addEventListener('click', () => { wakeAudio(); confirmName(); });
  document.getElementById('name-cancel').addEventListener('click', () => openSlots());
  document.getElementById('name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmName(); }
  });

  // World HUD
  document.getElementById('pokedex-btn').addEventListener('click', openPokedex);
  document.getElementById('map-btn').addEventListener('click', openMap);

  // Pokédex
  document.getElementById('pokedex-back').addEventListener('click', closePokedex);
  document.getElementById('detail-back').addEventListener('click', closeDetail);
  document.getElementById('detail-buddy').addEventListener('click', toggleBuddy);

  // World map
  document.getElementById('map-back').addEventListener('click', closeMap);

  // Badge case
  document.getElementById('map-badges').addEventListener('click', openBadgeCase);
  document.getElementById('badges-back').addEventListener('click', closeBadgeCase);

  // Mewtwo battle
  document.getElementById('battle-throw').addEventListener('click', () => { wakeAudio(); throwMasterAtMewtwo(); });

  // NPC dialog
  document.getElementById('npc-advance').addEventListener('click', () => { wakeAudio(); advanceNPC(); });

  // Encounter action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wakeAudio();
      resolveAction(btn.dataset.action, btn);
    });
  });

  // Result continue
  document.getElementById('result-continue').addEventListener('click', returnToWorld);

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
    const press   = e => { e.preventDefault(); keys[k] = true; kamiInput(btn.dataset.dir); wakeAudio(); };
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
    el.addEventListener('pointerdown', e => { e.preventDefault(); kamiInput(name); wakeAudio(); });
    el.addEventListener('touchstart',  e => { e.preventDefault(); kamiInput(name); wakeAudio(); }, { passive: false });
  });

  const startEl = document.getElementById('ss-start');
  startEl.addEventListener('pointerdown', e => { kamiInput('start'); });
  startEl.addEventListener('touchstart',  e => { kamiInput('start'); }, { passive: false });

  const selectEl = document.getElementById('ss-select');
  selectEl.addEventListener('pointerdown', e => { kamiInput('select'); });
  selectEl.addEventListener('touchstart',  e => { kamiInput('select'); }, { passive: false });
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

  // Tile-to-tile slide with a tiny vertical hop arc
  const mt = Math.min((ts - moveAnimTs) / MOVE_ANIM_MS, 1);
  if (mt < 1) {
    const ease = 1 - Math.pow(1 - mt, 3); // ease-out cubic
    const hopY  = Math.sin(mt * Math.PI) * -3; // small upward arc mid-step
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
function petFollow(tx, ty, ts) {
  if (activePet == null) return;
  const cur = getPetRenderPos(ts);
  petFromPx.x = cur.x;
  petFromPx.y = cur.y;
  if (tx > petX) petFacing = 1;        // moving right
  else if (tx < petX) petFacing = -1;  // moving left → flip; vertical keeps last facing
  petX = tx; petY = ty;
  petMoveAnimTs = ts;
}

function getPetRenderPos(ts) {
  const destX = petX * TILE_SIZE;
  const destY = petY * TILE_SIZE;
  const mt = Math.min((ts - petMoveAnimTs) / MOVE_ANIM_MS, 1);
  if (mt < 1) {
    const ease = 1 - Math.pow(1 - mt, 3);
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
    if (ts - lastMoveTs >= MOVE_INTERVAL) {
      let moved = false;
      if      (keys['ArrowUp']    || keys['w'] || keys['W']) { move( 0,-1, ts); moved = true; }
      else if (keys['ArrowDown']  || keys['s'] || keys['S']) { move( 0, 1, ts); moved = true; }
      else if (keys['ArrowLeft']  || keys['a'] || keys['A']) { move(-1, 0, ts); moved = true; }
      else if (keys['ArrowRight'] || keys['d'] || keys['D']) { move( 1, 0, ts); moved = true; }
      if (moved) lastMoveTs = ts;
    }
    drawWorld(ts);
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

// Whether the player currently has a caught Pokémon of the given type.
function playerHasType(type) {
  return POKEMON_DATA.some(p => p.type === type && caughtIds.has(p.id));
}

// Caught Lapras? Then the player can ride across water tiles.
function canSurf() { return caughtIds.has(LAPRAS_ID); }

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
  // 1. Set direction
  playerDir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';

  const nx = playerX + dx;
  const ny = playerY + dy;

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
    if (playerHasType(BARRIERS[barrierKey].needsType)) {
      unlockedBarriers.add(barrierKey);
      saveGame();
      beep(523, 0.1, 0.1);
      setTimeout(() => beep(784, 0.14, 0.18), 110);
      showMessage(BARRIERS[barrierKey].cleared);
    } else {
      beep(160, 0.07, 0.1, 'square');
      showMessage(BARRIERS[barrierKey].hint);
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

  // 3b. Talk to an NPC standing on the destination tile (they block it).
  const npc = npcAt(currentZone, nx, ny);
  if (npc) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    talkNPC(npc);
    return;
  }

  // 4. Check tile impassable. Water is normally impassable, but once you've
  //    caught Lapras you can surf straight across it.
  const tile = MAPS[currentZone][ny][nx];
  const surfing = tile === T.WATER && canSurf();
  if (isObstacleTile(tile) && !surfing) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    beep(160, 0.07, 0.1, 'square');
    return;
  }

  // 5. Normal move
  const cur = getRenderPos(ts);
  fromPx.x   = cur.x;
  fromPx.y   = cur.y;
  moveAnimTs = ts;

  const oldX = playerX, oldY = playerY;
  playerX   = nx;
  playerY   = ny;
  playerStep ^= 1;
  petFollow(oldX, oldY, ts);   // buddy steps onto the tile you just left

  beep(220, 0.04, 0.04, 'square');

  // First time surfing this session — let the player know what's happening.
  if (surfing && !surfNoted) {
    surfNoted = true;
    showMessage('🌊 Lapras carries you across the water!');
  }

  // Step onto a cave mouth (or other point-portal) → warp into the linked zone.
  const portal = portalAt(currentZone, playerX, playerY);
  if (portal) {
    beep(300, 0.08, 0.1);
    setTimeout(() => warpTo(portal.to, portal.tx, portal.ty, 'down'), 110);
    return;
  }

  // Open shop when stepping onto shop tile
  if (MAPS[currentZone][playerY][playerX] === T.SHOP) {
    setTimeout(() => openShop(), 80);
    return;
  }

  // Check if player stepped onto a wild Pokémon's tile
  if (wildPoke && wildPoke.zone === currentZone &&
      wildPoke.x === playerX && wildPoke.y === playerY) {
    const poke = wildPoke.poke;
    clearWild();
    setTimeout(() => beginEncounter(poke), 80);
    return;
  }

  // Found a fixed collectible (badge) sitting on this tile?
  const item = collectibleAt(currentZone, playerX, playerY);
  if (item && !collected.has(item.id)) {
    collected.add(item.id);
    saveGame();
    updateHud();
    showMessage(`${item.emoji} You found the ${item.name}! (${collected.size}/${COLLECTIBLES.length})`);
    beep(660, 0.12, 0.1);
    setTimeout(() => beep(880, 0.12, 0.12), 110);
    setTimeout(() => beep(1100, 0.16, 0.18), 230);
    return;
  }

  // Random grass pickup — chance to find a ball (more common) or a coin
  if (tile === T.GRASS && Math.random() < GRASS_PICKUP_CHANCE) {
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

  saveGame();
  updateHud();
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

function spawnWild() {
  // Not in the overworld (menu/encounter)? Try again later — never let the
  // spawn loop die.
  if (gameState !== 'world') { scheduleSpawn(); return; }

  clearWild();

  // Pick a random uncaught Pokémon for the current zone
  const pool = POKEMON_DATA.filter(p => p.zones.includes(currentZone) && !caughtIds.has(p.id));
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

function talkNPC(npc) {
  currentNPC = npc;
  npcLineIdx = 0;
  clearTimeout(spawnTimerId);

  document.getElementById('npc-emoji').textContent = npc.emoji;
  document.getElementById('npc-name').textContent  = npc.name;

  // One-time gift the first time you meet this character.
  const reward = document.getElementById('npc-reward');
  if (!metNPCs.has(npc.name)) {
    metNPCs.add(npc.name);
    coins += npc.gift;
    updateHud();
    saveGame();
    reward.textContent = `🌸 A gift! +${npc.gift} 💰`;
    reward.classList.remove('hidden');
    beep(700, 0.1, 0.1);
    setTimeout(() => beep(950, 0.12, 0.16), 110);
  } else {
    reward.classList.add('hidden');
  }

  renderNpcLine();
  showScreen('npc');
}

function renderNpcLine() {
  document.getElementById('npc-text').textContent = currentNPC.lines[npcLineIdx];
  const last = npcLineIdx >= currentNPC.lines.length - 1;
  document.getElementById('npc-advance').textContent = last ? 'CLOSE ✓' : 'NEXT ▶';
  beep(440, 0.05, 0.06, 'sine');
  setTimeout(() => beep(550, 0.05, 0.07, 'sine'), 70);
}

function advanceNPC() {
  document.getElementById('npc-reward').classList.add('hidden');
  if (npcLineIdx >= currentNPC.lines.length - 1) { closeNPC(); return; }
  npcLineIdx++;
  renderNpcLine();
}

function closeNPC() {
  currentNPC = null;
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
function drawEntities(ts) {
  const bob = Math.sin(ts * 0.005) * 3;
  ctx.textAlign = 'center';
  for (const c of COLLECTIBLES) {
    if (c.zone !== currentZone || collected.has(c.id)) continue;
    const px = c.x * TILE_SIZE - camX + TILE_SIZE / 2;
    const py = c.y * TILE_SIZE - camY;
    // sparkle glow
    ctx.font = '12px serif';
    ctx.fillText('✨', px, py - 10 + bob);
    ctx.font = '20px serif';
    ctx.fillText(c.emoji, px, py + 18 + bob);
  }
  for (const n of NPCS) {
    if (n.zone !== currentZone) continue;
    const px = n.x * TILE_SIZE - camX + TILE_SIZE / 2;
    const py = n.y * TILE_SIZE - camY;
    ctx.font = '22px serif';
    ctx.fillText(n.emoji, px, py + 24 + Math.sin(ts * 0.004) * 2);
  }
  // Roaming legendaries — drawn with their real sprite, with an aura of sparkles.
  for (const r of roamers) {
    if (r.zone !== currentZone) continue;
    const poke = POKEMON_DATA.find(p => p.id === r.pokeId);
    const px = r.x * TILE_SIZE - camX + TILE_SIZE / 2;
    const py = r.y * TILE_SIZE - camY;
    ctx.font = '13px serif';
    ctx.fillText('✨', px - 14, py + 4 + bob);
    ctx.fillText('✨', px + 14, py - 2 - bob);
    const img = canvasSprite(poke);
    if (img.complete && img.naturalWidth) {
      const h = 40, w = Math.round(h * img.naturalWidth / img.naturalHeight);
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(px - w / 2), Math.round(py + TILE_SIZE - h + bob), w, h);
      ctx.imageSmoothingEnabled = prev;
    } else {
      ctx.font = '26px serif';
      ctx.fillText(poke.emoji, px, py + 24 + bob);
    }
  }
}

function drawWild(ts) {
  if (!wildPoke || wildPoke.zone !== currentZone) return;

  const remaining = wildPoke.expireAt - Date.now();
  if (remaining <= 0) return;

  const px = wildPoke.x * TILE_SIZE - camX;
  const py = wildPoke.y * TILE_SIZE - camY;

  // Wiggle the grass tile
  const angle = Math.sin(ts * 0.012) * 0.18;
  ctx.save();
  ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
  ctx.rotate(angle);
  const grassVars = tileCache[T.GRASS];
  ctx.drawImage(grassVars[tileVariant(currentZone, wildPoke.y, wildPoke.x, grassVars.length)],
                -TILE_SIZE / 2, -TILE_SIZE / 2);
  ctx.restore();

  // Blink in final 2.5 s — every 300 ms
  if (remaining < 2500 && Math.floor(remaining / 300) % 2 === 0) return;

  // A red "!" alert, centred ON the rustling grass tile. It pops in on appear
  // (scale overshoot + drop) then idles with a gentle bob.
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

  ctx.save();
  ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2 + yoff);
  ctx.scale(scale, scale);
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

// ═══════════════════════════════════════════════════
// WORLD RENDERING
// ═══════════════════════════════════════════════════
function updateCamera(renderPos) {
  const { cols, rows } = ZONE_INFO[currentZone];
  const mapW = cols * TILE_SIZE;
  const mapH = rows * TILE_SIZE;
  const cx = renderPos.x + TILE_SIZE / 2 - canvas.width / 2;
  const cy = renderPos.y + TILE_SIZE / 2 - canvas.height / 2;
  camX = Math.max(0, Math.min(cx, mapW - canvas.width));
  camY = Math.max(0, Math.min(cy, mapH - canvas.height));
}

function drawWorld(ts) {
  const renderPos = getRenderPos(ts);
  updateCamera(renderPos);

  const map = MAPS[currentZone];
  const { cols, rows } = ZONE_INFO[currentZone];
  const startC = Math.max(0, Math.floor(camX / TILE_SIZE));
  const endC   = Math.min(cols, startC + 22);
  const startR = Math.max(0, Math.floor(camY / TILE_SIZE));
  const endR   = Math.min(rows, startR + 16);
  for (let r = startR; r < endR; r++) {
    for (let c = startC; c < endC; c++) {
      const variants = tileCache[map[r][c]];
      const img = variants[tileVariant(currentZone, r, c, variants.length)];
      ctx.drawImage(img, c * TILE_SIZE - camX, r * TILE_SIZE - camY);
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
  // Caves are dim — lay a dark wash over everything for atmosphere.
  if (ZONE_INFO[currentZone].base === T.CAVE) {
    ctx.fillStyle = 'rgba(8,6,24,0.42)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawBarriers(ts);
  drawEntities(ts);
  drawWild(ts);
  // A ripple under the player while surfing on water.
  if (MAPS[currentZone][playerY][playerX] === T.WATER && canSurf()) {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,240,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(renderPos.x - camX + TILE_SIZE / 2, renderPos.y - camY + TILE_SIZE - 4,
                TILE_SIZE * 0.42, TILE_SIZE * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawPet(ts);
  drawPlayer(renderPos.x - camX, renderPos.y - camY);
}

// Draw the buddy Pokémon trailing the player (small sprite, idle bob).
function drawPet(ts) {
  if (activePet == null) return;
  const poke = POKEMON_DATA.find(p => p.id === activePet);
  if (!poke || !caughtIds.has(poke.id)) return;
  const rp = getPetRenderPos(ts);
  const px = rp.x - camX, py = rp.y - camY;
  const img = canvasSprite(poke);
  if (img.complete && img.naturalWidth) {
    // Slightly oversized (taller than a tile) so the buddy reads clearly.
    const h = 34, w = Math.round(h * img.naturalWidth / img.naturalHeight);
    const dx = Math.round(px + (TILE_SIZE - w) / 2);
    const dy = Math.round(py + TILE_SIZE - h + 4);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (petFacing === -1) {           // flip horizontally to face left
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
    ctx.font = '24px serif';
    ctx.textAlign = 'center';
    ctx.save();
    if (petFacing === -1) {
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
  currentPoke = poke;
  currentLegend = roamer;
  gameState   = 'encounter';

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
  setPokeDisplay(document.getElementById('enc-emoji-display'), poke, 80);
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
  document.getElementById('enc-prompt').classList.remove('hidden');
  document.getElementById('timer-wrap').classList.remove('hidden');

  showScreen('encounter');
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
    }, 400);
  } else {
    btnEl.classList.add('wrong');
    document.querySelectorAll('.action-btn').forEach(b => {
      if (b.dataset.action === currentPoke.action) b.classList.add('correct');
    });
    setTimeout(() => encounterFailed(), 700);
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

  // Phase 4 — done, go to caught screen (1600ms)
  setTimeout(() => caught(), 1600);
}

const NEW_CATCH_BOUNTY = 5; // coins awarded for each newly-discovered species

function caught() {
  const isNew  = !caughtIds.has(currentPoke.id);
  const legend = currentLegend;
  caughtIds.add(currentPoke.id);
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
    pendingMsg = '🦅 The legendary birds bond with you — you earned the Trio Badge!';
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
  showScreen('world');
  scheduleSpawn();
  if (pendingMsg) { showMessage(pendingMsg); pendingMsg = null; }
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
// MEWTWO BATTLE  (no timer; match Mewtwo's type 3 rounds, then Master Ball)
// ═══════════════════════════════════════════════════
let battleRoundNum = 0;
let battleType     = null;

function startMewtwoBattle(roamer) {
  currentLegend = roamer;
  currentPoke   = POKEMON_DATA.find(p => p.id === roamer.pokeId);
  clearWild();
  clearTimeout(spawnTimerId);
  battleRoundNum = 0;
  document.getElementById('battle-win').classList.add('hidden');
  document.getElementById('battle-options').classList.remove('hidden');
  document.getElementById('battle-instruction').classList.remove('hidden');
  setPokeDisplay(document.getElementById('battle-mewtwo'), currentPoke, 80); // real art
  showScreen('battle');
  playEncounterJingle();
  nextBattleRound();
}

function nextBattleRound() {
  battleRoundNum++;
  document.getElementById('battle-round').textContent = `Round ${battleRoundNum} / 3`;

  // Draw options from your caught Lukeymon. Normally that's the whole roster
  // (Mewtwo only appears once everything else is caught); fall back to the full
  // roster if you somehow have too few (e.g. summoned via the debug menu).
  let pool = POKEMON_DATA.filter(p => p.legend !== 'mewtwo' && caughtIds.has(p.id));
  if (pool.length < 6) pool = POKEMON_DATA.filter(p => p.legend !== 'mewtwo');

  const types = [...new Set(pool.map(p => p.type))];
  battleType = types[Math.floor(Math.random() * types.length)];

  const tEl = document.getElementById('battle-type');
  tEl.textContent = battleType;
  tEl.style.background = typeColor(battleType);
  beep(150, 0.18, 0.3, 'square');

  // Six options: guaranteed at least one of the demanded type, rest mixed.
  const correct = pool.filter(p => p.type === battleType);
  const others  = shuffle(pool.filter(p => p.type !== battleType));
  const opts = shuffle([ correct[Math.floor(Math.random() * correct.length)], ...others.slice(0, 5) ])
                 .filter(Boolean);

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
    card.addEventListener('click', () => choosePokemon(poke, card));
    grid.appendChild(card);
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function choosePokemon(poke, card) {
  if (gameState !== 'battle') return;
  document.querySelectorAll('.battle-opt').forEach(b => b.disabled = true);

  if (poke.type === battleType) {
    card.classList.add('correct');
    beep(523, 0.12, 0.1);
    setTimeout(() => beep(659, 0.12, 0.15), 110);
    if (battleRoundNum >= 3) setTimeout(battleWon, 600);
    else setTimeout(nextBattleRound, 700);
  } else {
    card.classList.add('wrong');
    beep(160, 0.15, 0.2, 'square');
    setTimeout(battleLost, 800);
  }
}

function battleWon() {
  document.getElementById('battle-options').classList.add('hidden');
  document.getElementById('battle-instruction').classList.add('hidden');
  document.getElementById('battle-win').classList.remove('hidden');
  document.getElementById('battle-throw').disabled = masterBalls <= 0;
  beep(523, 0.12, 0.12);
  setTimeout(() => beep(659, 0.12, 0.12), 130);
  setTimeout(() => beep(784, 0.18, 0.2), 260);
}

function throwMasterAtMewtwo() {
  if (masterBalls <= 0) return;
  masterBalls--;
  updateHud();
  saveGame();
  caught();  // handles roamer removal, result screen, and dex completion
}

function battleLost() {
  legendaryEscaped();  // Mewtwo vanishes to another faraway land
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

  POKEMON_DATA.forEach(poke => {
    const card = document.createElement('div');
    const caught = caughtIds.has(poke.id);
    card.className = 'dex-card' + (caught ? ' caught' : ' dex-card-unknown');

    const emojiDiv = document.createElement('div');
    emojiDiv.className = 'dex-card-emoji';
    if (caught) {
      emojiDiv.appendChild(pokeImg(poke, 40));
    } else {
      emojiDiv.textContent = '?';
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'dex-card-name';
    nameDiv.textContent = caught ? poke.name : '?????????';

    card.appendChild(emojiDiv);
    card.appendChild(nameDiv);

    if (caught) {
      card.addEventListener('click', () => showDetail(poke));
    }
    grid.appendChild(card);
  });
}

function showDetail(poke) {
  document.getElementById('pokedex-grid').classList.add('hidden');
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
  if (activePet === poke.id) {
    buddyBtn.textContent = '🐾 Following you — tap to dismiss';
    buddyBtn.classList.add('is-buddy');
  } else {
    buddyBtn.textContent = '🐾 Make this my buddy';
    buddyBtn.classList.remove('is-buddy');
  }
}

// Toggle the open Pokémon as the player's buddy.
function toggleBuddy() {
  if (!detailPoke) return;
  if (activePet === detailPoke.id) {
    activePet = null;
  } else {
    activePet = detailPoke.id;
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
  document.getElementById('pokedex-grid').classList.remove('hidden');
  renderPokedexGrid();
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

function renderMap() {
  const open = reachableZones();
  document.getElementById('map-open-count').textContent = open.size;
  document.getElementById('map-total').textContent = Object.keys(ZONE_MAP).length;

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
}

// ═══════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id + '-screen');
  if (el) el.classList.add('active');
  if (id !== 'encounter') gameState = id;
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
  unlockedBarriers.clear();
  collected.clear();
  metNPCs.clear();
  balls = 12;
  masterBalls = 0;
  coins = 0;
  loadedRoamers = null;
  initRoamers();
  clearWild();
  clearTimeout(spawnTimerId);
  currentZone = 0;
  playerX = 10; playerY = 7; playerDir = 'down';
  fromPx.x = 10 * TILE_SIZE;
  fromPx.y = 7 * TILE_SIZE;
  moveAnimTs = -9999;
  bumpVec = null;
  activePet = null;
  petX = 10; petY = 7;
  petFromPx.x = 10 * TILE_SIZE; petFromPx.y = 7 * TILE_SIZE;
  petMoveAnimTs = -9999;
  surfNoted = false;
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
      barriers:  [...unlockedBarriers],
      collected: [...collected],
      metNPCs:   [...metNPCs],
      roamers:   roamers.map(r => ({ legend: r.legend, zone: r.zone, x: r.x, y: r.y })),
      zone:      currentZone,
      x:         playerX,
      y:         playerY,
      activePet,
      balls,
      masterBalls,
      coins,
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
      unlockedBarriers = new Set(data.barriers || []);
      collected        = new Set(data.collected || []);
      metNPCs          = new Set(data.metNPCs || []);
      loadedRoamers    = data.roamers || null;
      currentZone    = data.zone  ?? 0;
      playerX        = data.x    ?? 10;
      playerY        = data.y    ?? 7;
      balls = data.balls ?? 12;
      masterBalls = data.masterBalls ?? 0;
      coins = data.coins ?? 0;
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
  saveName = (raw || `SAVE ${pendingNewSlot}`).slice(0, 10);
  currentSlot = pendingNewSlot;
  startNewGame();          // writes a fresh save to this slot
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
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {}
}

function beep(freq, vol, dur, type = 'square') {
  if (!audioCtx) return;
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
