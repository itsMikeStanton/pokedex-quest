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

const T = { PATH: 0, GRASS: 1, TREE: 2, WATER: 3, SAND: 4, CITY: 5, SHOP: 6, LAVA: 7, ICE: 8 };

// ═══════════════════════════════════════════════════
// ZONE MAPS
// ═══════════════════════════════════════════════════
// Zone tile layouts are generated procedurally (organic, seeded) from
// ZONE_SPECS below — see buildAllZones(). MAPS is populated after the
// ZONE / EXIT / BARRIER data it depends on.

// ═══════════════════════════════════════════════════
// ZONE / EXIT / BARRIER DATA
// ═══════════════════════════════════════════════════
const ZONE_INFO = [
  { id: 0, name: 'Meadow',      cols: 20, rows: 14 },
  { id: 1, name: 'Beach',       cols: 20, rows: 35 },
  { id: 2, name: 'City',        cols: 20, rows: 14 },
  { id: 3, name: 'Highlands',   cols: 20, rows: 14 },
  { id: 4, name: 'Volcano',     cols: 20, rows: 28 },
  { id: 5, name: 'Dark Forest', cols: 40, rows: 14 },
  { id: 6, name: 'Ice Cave',    cols: 20, rows: 14 },
  { id: 7, name: 'Desert',      cols: 40, rows: 14 },
];

const EXITS = [
  { from: 0, dir: 'south', pos: [9,10,11], to: 1, entryX: 10, entryY:  1, barrier: 'log'   },
  { from: 1, dir: 'north', pos: [9,10,11], to: 0, entryX: 10, entryY: 12, barrier: null    },
  { from: 1, dir: 'west',  pos: [5,6,7],   to: 2, entryX: 18, entryY:  6, barrier: 'rock'  },
  { from: 2, dir: 'east',  pos: [5,6,7],   to: 1, entryX:  1, entryY:  6, barrier: null    },
  { from: 2, dir: 'north', pos: [9,10,11], to: 3, entryX: 10, entryY: 12, barrier: 'fence' },
  { from: 3, dir: 'south', pos: [9,10,11], to: 2, entryX: 10, entryY:  1, barrier: null    },
  { from: 3, dir: 'north', pos: [9,10,11], to: 4, entryX: 10, entryY: 26, barrier: 'lava'  },
  { from: 4, dir: 'south', pos: [9,10,11], to: 3, entryX: 10, entryY:  1, barrier: null    },
  { from: 0, dir: 'west',  pos: [5,6,7],   to: 5, entryX: 38, entryY:  6, barrier: 'vine'  },
  { from: 5, dir: 'east',  pos: [5,6,7],   to: 0, entryX:  1, entryY:  6, barrier: null    },
  { from: 1, dir: 'east',  pos: [5,6,7],   to: 6, entryX:  1, entryY:  6, barrier: 'frost' },
  { from: 6, dir: 'west',  pos: [5,6,7],   to: 1, entryX: 18, entryY:  6, barrier: null    },
  { from: 2, dir: 'south', pos: [9,10,11], to: 7, entryX: 10, entryY:  1, barrier: 'sand'  },
  { from: 7, dir: 'north', pos: [9,10,11], to: 2, entryX: 10, entryY: 12, barrier: null    },
];

const BARRIERS = {
  log:   { needsType: 'Fire',     hint: 'Catch a 🔥 Fire Pokémon to burn these logs!',       sign: '🔥' },
  rock:  { needsType: 'Water',    hint: 'Catch a 💧 Water Pokémon to wash these rocks!',     sign: '💧' },
  fence: { needsType: 'Electric', hint: 'Catch a ⚡ Electric Pokémon to short the fence!',   sign: '⚡' },
  lava:  { needsType: 'Water',    hint: 'Catch a 💧 Water Pokémon to cool the lava flow!',   sign: '💧' },
  vine:  { needsType: 'Grass',    hint: 'Catch a 🌿 Grass Pokémon to cut through the vines!', sign: '🌿' },
  frost: { needsType: 'Fire',     hint: 'Catch a 🔥 Fire Pokémon to melt the ice wall!',     sign: '🔥' },
  sand:  { needsType: 'Ground',   hint: 'Catch a 🌍 Ground Pokémon to clear the sand wall!', sign: '🌍' },
};

// World-map layout: schematic grid position (col/row, 1-indexed in a 4×4)
// plus a representative icon for each zone. Connections are drawn from EXITS.
const ZONE_MAP = {
  4: { col: 2, row: 1, icon: '🌋' }, // Volcano
  5: { col: 1, row: 2, icon: '🌲' }, // Dark Forest
  3: { col: 2, row: 2, icon: '⛰️' }, // Highlands
  0: { col: 3, row: 2, icon: '🌳' }, // Meadow
  2: { col: 2, row: 3, icon: '🏙️' }, // City
  1: { col: 3, row: 3, icon: '🏖️' }, // Beach
  6: { col: 4, row: 3, icon: '❄️' }, // Ice Cave
  7: { col: 2, row: 4, icon: '🏜️' }, // Desert
};

// Most connections are straight lines between adjacent tiles. Meadow↔Dark
// Forest is the exception: the two zones sit on the same row with Highlands
// between them (the world graph is non-planar), so a straight line would run
// through Highlands and read as a fake connection. Route it over the top
// instead — waypoints are in the 400×400 SVG viewBox, clear of every node and
// connector. Keyed by "minId-maxId".
const EDGE_ROUTES = {
  '0-5': [[250, 18], [50, 18]],
};

const GRASS_PICKUP_CHANCE = 0.12; // 12% per grass step to find a ball or coin

// ═══════════════════════════════════════════════════
// PROCEDURAL ZONE LAYOUTS
// ═══════════════════════════════════════════════════
// Each zone is grown organically from a base terrain plus scattered,
// irregular clusters of obstacles/hazards and tall-grass spawn patches —
// no mirrored rectangles. Generation is seeded (stable across reloads) and
// validated for connectivity so every exit and grass patch stays reachable.
const OBSTACLE_TILES = new Set([T.TREE, T.WATER, T.LAVA, T.ICE]);
function isObstacleTile(t) { return OBSTACLE_TILES.has(t); }
function isWalkableTile(t) { return !OBSTACLE_TILES.has(t); }

const ZONE_SPECS = [
  // 0 Meadow — grassy fields, tree copses, a pond.
  { base: T.PATH, shop: true, minGrass: 22,
    features: [ { tile: T.TREE, blobs: 7, min: 3, max: 7 },
                { tile: T.WATER, blobs: 2, min: 6, max: 12 } ],
    grass: { blobs: 7, min: 4, max: 9 } },
  // 1 Beach — sand around one big connected lake, with palm clumps.
  { base: T.SAND, minGrass: 46, oneBody: T.WATER,
    features: [ { tile: T.WATER, cluster: true, spread: 3, blobs: 7, min: 14, max: 24 },
                { tile: T.TREE, blobs: 6, min: 3, max: 6 } ],
    grass: { blobs: 14, min: 4, max: 9 } },
  // 2 City — paved ground with scattered building/planter blocks.
  { base: T.CITY, minGrass: 14,
    features: [ { tile: T.TREE, blobs: 8, min: 3, max: 7 } ],
    grass: { blobs: 5, min: 3, max: 6 } },
  // 3 Highlands — rolling ground, rocky copses, a tarn.
  { base: T.PATH, minGrass: 22,
    features: [ { tile: T.TREE, blobs: 8, min: 3, max: 7 },
                { tile: T.WATER, blobs: 1, min: 5, max: 9 } ],
    grass: { blobs: 7, min: 4, max: 8 } },
  // 4 Volcano — ground broken by lava flows and rock.
  { base: T.PATH, minGrass: 28,
    features: [ { tile: T.LAVA, blobs: 6, min: 4, max: 10 },
                { tile: T.TREE, blobs: 6, min: 2, max: 5 } ],
    grass: { blobs: 9, min: 3, max: 7 } },
  // 5 Dark Forest — dense, irregular tree cover.
  { base: T.PATH, minGrass: 36,
    features: [ { tile: T.TREE, blobs: 18, min: 3, max: 8 } ],
    grass: { blobs: 12, min: 4, max: 8 } },
  // 6 Ice Cave — frozen ground slabs and rock.
  { base: T.PATH, minGrass: 20,
    features: [ { tile: T.ICE, blobs: 6, min: 4, max: 9 },
                { tile: T.TREE, blobs: 4, min: 2, max: 5 } ],
    grass: { blobs: 7, min: 3, max: 7 } },
  // 7 Desert — open sand with rock outcrops.
  { base: T.SAND, minGrass: 42,
    features: [ { tile: T.TREE, blobs: 12, min: 2, max: 6 } ],
    grass: { blobs: 14, min: 4, max: 8 } },
];

// Cells that must stay walkable & connected: border openings (+ the cell
// just inside), player landing tiles, and (zone 0) the start + shop.
function zoneAnchors(zoneId, cols, rows) {
  const cells = [], inward = [];
  EXITS.filter(e => e.from === zoneId).forEach(e => {
    e.pos.forEach(p => {
      if      (e.dir === 'south') { cells.push([p, rows - 1]); inward.push([p, rows - 2]); }
      else if (e.dir === 'north') { cells.push([p, 0]);        inward.push([p, 1]); }
      else if (e.dir === 'west')  { cells.push([0, p]);        inward.push([1, p]); }
      else                        { cells.push([cols - 1, p]); inward.push([cols - 2, p]); }
    });
  });
  EXITS.filter(e => e.to === zoneId).forEach(e => cells.push([e.entryX, e.entryY]));
  if (zoneId === 0) { cells.push([10, 7]); cells.push([10, 5]); } // start + shop
  return { cells, inward };
}

// Paint a rounded, slightly irregular cluster of `tile` over `base` cells,
// centred on (cx,cy). `size` is the approximate area (cells), so blobs read
// as compact groupings rather than thin tendrils.
function paintBlob(grid, tile, cols, rows, cx, cy, size, rng, prot, base) {
  const radius = Math.max(1, Math.sqrt(size / Math.PI));
  const reach  = Math.ceil(radius + 1.5);
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 1 || x >= cols - 1 || y < 1 || y >= rows - 1) continue;
      if (prot.has(y * cols + x) || grid[y][x] !== base) continue;
      // Per-cell wobble on the edge keeps the outline organic, not a disc.
      if (Math.hypot(dx, dy) <= radius * (0.72 + rng() * 0.5)) grid[y][x] = tile;
    }
}

// Find a random interior cell still on the base terrain (and not protected).
function pickCenter(grid, cols, rows, rng, prot, base) {
  for (let t = 0; t < 60; t++) {
    const x = 1 + Math.floor(rng() * (cols - 2));
    const y = 1 + Math.floor(rng() * (rows - 2));
    if (grid[y][x] === base && !prot.has(y * cols + x)) return [x, y];
  }
  return null;
}

// Scatter a feature as several rounded clusters. When `cluster` is set the
// clusters share a jittered centre so they overlap into one larger body
// (used for the Beach lake).
function scatterFeature(grid, f, cols, rows, rng, prot, base) {
  const sz = () => f.min + Math.floor(rng() * (f.max - f.min + 1));
  if (f.cluster) {
    const c = pickCenter(grid, cols, rows, rng, prot, base);
    if (!c) return;
    const spread = f.spread ?? 2;
    for (let b = 0; b < f.blobs; b++) {
      const x = Math.max(1, Math.min(cols - 2, c[0] + Math.round((rng() - 0.5) * 2 * spread)));
      const y = Math.max(1, Math.min(rows - 2, c[1] + Math.round((rng() - 0.5) * 2 * spread)));
      paintBlob(grid, f.tile, cols, rows, x, y, sz(), rng, prot, base);
    }
  } else {
    for (let b = 0; b < f.blobs; b++) {
      const c = pickCenter(grid, cols, rows, rng, prot, base);
      if (c) paintBlob(grid, f.tile, cols, rows, c[0], c[1], sz(), rng, prot, base);
    }
  }
}

function generateZoneLayout(zoneId, seed) {
  const rng = mulberry32(seed);
  const { cols, rows } = ZONE_INFO[zoneId];
  const spec = ZONE_SPECS[zoneId];
  const base = spec.base;
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(base));

  // Border wall, openings carved by anchors below.
  for (let c = 0; c < cols; c++) { grid[0][c] = T.TREE; grid[rows - 1][c] = T.TREE; }
  for (let r = 0; r < rows; r++) { grid[r][0] = T.TREE; grid[r][cols - 1] = T.TREE; }

  const prot = new Set();
  const { cells, inward } = zoneAnchors(zoneId, cols, rows);
  [...cells, ...inward].forEach(([x, y]) => { grid[y][x] = base; prot.add(y * cols + x); });

  for (const f of spec.features) scatterFeature(grid, f, cols, rows, rng, prot, base);
  scatterFeature(grid, { tile: T.GRASS, ...spec.grass }, cols, rows, rng, prot, base);

  if (spec.shop) grid[5][10] = T.SHOP;
  return grid;
}

function floodWalkable(grid, cols, rows, sx, sy) {
  const seen = new Set([sy * cols + sx]);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const id = ny * cols + nx;
      if (seen.has(id) || !isWalkableTile(grid[ny][nx])) continue;
      seen.add(id);
      stack.push([nx, ny]);
    }
  }
  return seen;
}

// Count the connected components made of `tile` (4-connectivity).
function tileComponents(grid, cols, rows, tile) {
  const seen = new Set();
  let comps = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] !== tile || seen.has(y * cols + x)) continue;
      comps++;
      const stack = [[x, y]];
      seen.add(y * cols + x);
      while (stack.length) {
        const [a, b] = stack.pop();
        for (const [na, nb] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
          if (na < 0 || na >= cols || nb < 0 || nb >= rows) continue;
          const id = nb * cols + na;
          if (seen.has(id) || grid[nb][na] !== tile) continue;
          seen.add(id);
          stack.push([na, nb]);
        }
      }
    }
  return comps;
}

function zoneIsValid(grid, zoneId) {
  const { cols, rows } = ZONE_INFO[zoneId];
  const spec = ZONE_SPECS[zoneId];
  const { cells } = zoneAnchors(zoneId, cols, rows);
  const seen = floodWalkable(grid, cols, rows, cells[0][0], cells[0][1]);
  for (const [x, y] of cells) if (!seen.has(y * cols + x)) return false;
  let grass = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (grid[y][x] === T.GRASS) {
        if (!seen.has(y * cols + x)) return false;
        grass++;
      }
  if (grass < spec.minGrass) return false;
  // A zone may require a feature to form a single body (e.g. the Beach lake).
  if (spec.oneBody != null && tileComponents(grid, cols, rows, spec.oneBody) > 1) return false;
  return true;
}

function buildAllZones() {
  return ZONE_INFO.map((z, zoneId) => {
    let last = null;
    for (let attempt = 0; attempt < 250; attempt++) {
      const seed = (0x5EED * (zoneId + 1) + attempt * 0x9E3779B1) >>> 0;
      last = generateZoneLayout(zoneId, seed);
      if (zoneIsValid(last, zoneId)) return last;
    }
    return last; // extremely unlikely; ship the best effort
  });
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

const MAPS = buildAllZones();

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
let coins          = 0;
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

// ── Animation state ─────────────────────────────────
let fromPx      = { x: 10 * TILE_SIZE, y: 7 * TILE_SIZE };
let moveAnimTs  = -9999;
let bumpVec     = null;
let bumpAnimTs  = -9999;
let camX = 0, camY = 0;

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
  loadSave();
  bindEvents();
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

// ═══════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════
function bindEvents() {
  // Keyboard
  const kbKamiMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', z:'b', Z:'b', x:'a', X:'a', Enter:'start' };
  document.addEventListener('keydown', e => {
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

  // Title buttons
  document.getElementById('start-btn').addEventListener('click', () => { wakeAudio(); startNewGame(); });
  document.getElementById('continue-btn').addEventListener('click', () => { wakeAudio(); enterWorld(); });

  // World HUD
  document.getElementById('pokedex-btn').addEventListener('click', openPokedex);
  document.getElementById('map-btn').addEventListener('click', openMap);

  // Pokédex
  document.getElementById('pokedex-back').addEventListener('click', closePokedex);
  document.getElementById('detail-back').addEventListener('click', closeDetail);

  // World map
  document.getElementById('map-back').addEventListener('click', closeMap);

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
      buyBalls(parseInt(btn.dataset.qty), parseInt(btn.dataset.cost));
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
}

// ═══════════════════════════════════════════════════
// KAMI CODE  (↑ ↑ ↓ ↓ ← → ← → B A)
// ═══════════════════════════════════════════════════
const KAMI_CODE = ['up','up','down','down','left','right','left','right','b','a','start'];
let _kamiLastKey = null, _kamiLastTime = 0;

function kamiInput(key) {
  const now = Date.now();
  if (key === _kamiLastKey && now - _kamiLastTime < 20) return; // dedupe touch+pointer double-fire (~1ms apart)
  _kamiLastKey = key;
  _kamiLastTime = now;
  kamiBuffer.push(key);
  if (kamiBuffer.length > KAMI_CODE.length) kamiBuffer.shift();
  if (kamiBuffer.join(',') === KAMI_CODE.join(',')) activateKami();
}

function activateKami() {
  kamiBuffer = [];
  POKEMON_DATA.forEach(p => caughtIds.add(p.id));
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
function isBarrierUnlocked(key) {
  if (!key) return true;
  const needsType = BARRIERS[key].needsType;
  return POKEMON_DATA.some(p => p.type === needsType && caughtIds.has(p.id));
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

  // 3. Check barrier tile at destination (still in-map but on a border exit tile with locked barrier)
  const barrierKey = getExitBarrierAt(nx, ny);
  if (barrierKey) {
    bumpVec    = { dx, dy };
    bumpAnimTs = ts;
    beep(160, 0.07, 0.1, 'square');
    showMessage(BARRIERS[barrierKey].hint);
    return;
  }

  // 4. Check tile impassable
  const tile = MAPS[currentZone][ny][nx];
  if (isObstacleTile(tile)) {
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

  playerX   = nx;
  playerY   = ny;
  playerStep ^= 1;

  beep(220, 0.04, 0.04, 'square');

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

  // Random grass pickup — 12% chance to find a ball or coin
  if (tile === T.GRASS && Math.random() < GRASS_PICKUP_CHANCE) {
    if (Math.random() < 0.5) {
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
function doTransition(exit, ts) {
  currentZone = exit.to;
  playerX     = exit.entryX;
  playerY     = exit.entryY;

  // Face correct direction upon entry
  const dirMap = { south: 'down', north: 'up', west: 'left', east: 'right' };
  playerDir = dirMap[exit.dir];

  // Reset animation state — snap to position, no slide glitch
  fromPx.x   = playerX * TILE_SIZE;
  fromPx.y   = playerY * TILE_SIZE;
  moveAnimTs = -9999;
  bumpVec    = null;

  saveGame();
  updateHud();
  showMessage('📍 ' + ZONE_INFO[exit.to].name);

  // Transition sound: two rising beeps
  beep(330, 0.1, 0.1);
  setTimeout(() => beep(440, 0.12, 0.15), 80);

  clearWild();
  scheduleSpawn();
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
  if (gameState !== 'world') return;

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

  // Emoji floats above tile with gentle bob
  const bob = Math.sin(ts * 0.005) * 3;
  ctx.font = '17px serif';
  ctx.textAlign = 'center';
  ctx.fillText(wildPoke.poke.emoji, px + TILE_SIZE / 2, py - 2 + bob);
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
  drawBarriers(ts);
  drawWild(ts);
  drawPlayer(renderPos.x - camX, renderPos.y - camY);
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
function beginEncounter(poke) {
  encHappy = false;
  currentPoke = poke;
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
  timerId = setTimeout(() => fled(), TIMER_MS);
}

function resolveAction(action, btnEl) {
  clearTimeout(timerId);
  document.querySelectorAll('.action-btn').forEach(b => b.disabled = true);

  if (action === currentPoke.action) {
    encHappy = true;
    btnEl.classList.add('correct');
    beep(523, 0.12, 0.1);
    setTimeout(() => beep(659, 0.12, 0.15), 120);
    // Hide action buttons, show throw UI
    setTimeout(() => {
      document.getElementById('enc-buttons').classList.add('hidden');
      document.getElementById('enc-throw-wrap').classList.remove('hidden');
      if (balls <= 0) {
        document.getElementById('enc-no-balls-msg').classList.remove('hidden');
        document.getElementById('enc-throw-btn').disabled = true;
        setTimeout(() => fled(), 4000);
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
    setTimeout(() => fled(), 700);
  }
}

function throwBall() {
  if (balls <= 0) return;
  balls--;
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

function caught() {
  const isNew = !caughtIds.has(currentPoke.id);
  caughtIds.add(currentPoke.id);
  saveGame();
  updateHud();

  document.getElementById('result-stars').classList.remove('hidden');
  setPokeDisplay(document.getElementById('result-icon'), currentPoke, 80);
  document.getElementById('result-title').textContent   = isNew ? '✨ GOT IT! ✨' : '⭐ CAUGHT AGAIN! ⭐';
  document.getElementById('result-name').textContent    = currentPoke.name;
  document.getElementById('result-message').textContent = isNew
    ? 'Added to your PokéDex!'
    : 'Already in your PokéDex — great job anyway!';

  const rs = document.getElementById('result-screen');
  rs.className = 'screen active success';
  showScreen('result');
  playCatchJingle();

  if (caughtIds.size === POKEMON_DATA.length) {
    setTimeout(showComplete, 2200);
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
}

// ═══════════════════════════════════════════════════
// SHOP
// ═══════════════════════════════════════════════════
function openShop() {
  gameState = 'shop';
  clearTimeout(spawnTimerId);
  document.getElementById('shop-coin-count').textContent = coins;
  document.getElementById('shop-ball-count').textContent = balls;
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

// ═══════════════════════════════════════════════════
// POKÉDEX
// ═══════════════════════════════════════════════════
function openPokedex() {
  renderPokedexGrid();
  document.getElementById('pokedex-detail').classList.add('hidden');
  document.getElementById('pokedex-grid').classList.remove('hidden');
  showScreen('pokedex');
}

function closePokedex() {
  showScreen('world');
}

function renderPokedexGrid() {
  const grid = document.getElementById('pokedex-grid');
  grid.innerHTML = '';
  document.getElementById('dex-count').textContent = caughtIds.size;

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
  renderMap();
  showScreen('map');
}

function closeMap() {
  showScreen('world');
}

function renderMap() {
  const open = reachableZones();
  document.getElementById('map-open-count').textContent = open.size;

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
}

// ═══════════════════════════════════════════════════
// COMPLETE SCREEN
// ═══════════════════════════════════════════════════
function showComplete() {
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
  document.getElementById('ball-count').textContent   = balls;
  document.getElementById('coin-count').textContent   = coins;
  const zoneEl = document.getElementById('zone-name');
  if (zoneEl) zoneEl.textContent = ZONE_INFO[currentZone].name;
}

// ═══════════════════════════════════════════════════
// GAME FLOW
// ═══════════════════════════════════════════════════
function startNewGame() {
  caughtIds.clear();
  balls = 5;
  coins = 0;
  clearWild();
  clearTimeout(spawnTimerId);
  currentZone = 0;
  playerX = 10; playerY = 7; playerDir = 'down';
  fromPx.x = 10 * TILE_SIZE;
  fromPx.y = 7 * TILE_SIZE;
  moveAnimTs = -9999;
  bumpVec = null;
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
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      caught:    [...caughtIds],
      zone:      currentZone,
      x:         playerX,
      y:         playerY,
      balls,
      coins,
    }));
  } catch (_) {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        // Legacy v1 format: just an array of caught ids
        caughtIds = new Set(data);
      } else {
        caughtIds      = new Set(data.caught || []);
        currentZone    = data.zone  ?? 0;
        playerX        = data.x    ?? 10;
        playerY        = data.y    ?? 7;
        balls = data.balls ?? 5;
        coins = data.coins ?? 0;
      }
      // Clamp zone and rescue position if the layout changed under a save.
      if (currentZone < 0 || currentZone >= ZONE_INFO.length) currentZone = 0;
      [playerX, playerY] = nearestWalkable(currentZone, playerX, playerY);
      fromPx.x   = playerX * TILE_SIZE;
      fromPx.y   = playerY * TILE_SIZE;
      moveAnimTs = -9999;
      bumpVec    = null;
    }
  } catch (_) {}

  updateHud();

  if (caughtIds.size > 0) {
    document.getElementById('continue-btn').classList.remove('hidden');
    document.getElementById('start-btn').textContent = '▶ NEW GAME';
  }
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
