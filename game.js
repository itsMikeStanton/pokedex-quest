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
// ZONE MAPS  (4 zones, each 20×14)
// ═══════════════════════════════════════════════════
const MAPS = [
  // Zone 0: Meadow
  [
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,2],
    [2,0,1,1,1,0,0,2,2,0,0,2,2,0,0,1,1,1,0,2],
    [2,0,1,1,1,0,0,2,2,0,0,2,2,0,0,0,0,0,0,2],
    [0,0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,2],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0,0,0,2],
    [0,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,1,1,0,0,0,0,2,2,2,0,0,0,0,1,1,1,0,2],
    [2,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,2],
    [2,0,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,0,2],
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
  ],
  // Zone 1: Beach
  [
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    [2,4,1,1,4,4,4,4,4,4,4,4,4,4,4,1,1,1,4,2],
    [2,4,1,1,4,4,2,2,4,4,4,4,4,4,4,1,1,1,4,2],
    [2,4,4,4,4,4,2,2,4,4,4,4,4,4,4,4,4,4,4,2],
    [0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
    [0,4,1,1,4,4,4,4,3,3,3,4,4,4,4,1,1,4,4,4],
    [0,4,1,1,4,4,4,4,3,3,3,4,4,4,4,1,1,4,4,4],
    [2,4,4,4,4,4,4,4,3,3,3,4,4,4,4,4,4,4,4,2],
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    [2,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,3,3,2],
    [2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2],
    [2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2],
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  ],
  // Zone 2: City
  [
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
    [2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2],
    [2,5,2,2,2,5,5,5,5,5,5,5,5,5,2,2,2,5,5,2],
    [2,5,2,2,2,5,1,1,5,5,5,5,1,1,2,2,2,5,5,2],
    [2,5,2,2,2,5,1,1,5,5,5,5,1,1,5,5,5,5,5,2],
    [2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,0],
    [2,5,2,2,5,5,5,5,5,5,5,5,5,5,2,2,5,5,5,0],
    [2,5,2,2,5,5,1,1,5,5,5,5,1,1,2,2,5,5,5,0],
    [2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2],
    [2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2],
    [2,5,2,2,2,5,5,5,5,5,5,5,5,5,2,2,2,5,5,2],
    [2,5,2,2,2,5,1,1,5,5,5,5,1,1,2,2,2,5,5,2],
    [2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2],
    [2,2,2,2,2,2,2,2,2,5,5,5,2,2,2,2,2,2,2,2],
  ],
  // Zone 3: Highlands
  [
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,2],
    [2,0,1,1,1,0,2,2,0,0,0,0,2,2,0,1,1,1,0,2],
    [2,0,0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,0,0,2],
    [2,0,0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,0,0,2],
    [2,0,1,1,0,0,2,2,0,0,0,0,2,2,0,1,1,0,0,2],
    [2,0,1,1,0,0,0,0,3,3,3,3,0,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,3,3,3,3,0,0,0,0,0,0,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,1,1,1,0,0,0,0,2,2,0,0,0,0,1,1,1,0,2],
    [2,0,1,1,1,0,0,0,0,2,2,0,0,0,0,1,1,1,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
  ],
  // Zone 4: Volcano
  [
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,1,1,0,2,2,2,0,0,0,0,2,2,2,1,1,0,0,2],
    [2,0,1,1,0,2,7,7,7,7,7,0,0,2,0,1,1,0,0,2],
    [2,0,0,0,0,0,7,7,7,7,7,0,0,0,0,0,0,0,0,2],
    [2,0,0,0,0,2,7,7,7,7,7,0,0,2,0,0,0,0,0,2],
    [2,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,2,2,0,0,0,0,2,2,0,0,0,0,0,2],
    [2,0,0,0,0,0,2,0,0,0,0,0,0,2,0,0,0,0,0,2],
    [2,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,7,7,7,7,0,0,0,0,0,0,0,2],
    [2,0,1,1,0,0,0,0,7,7,7,7,0,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
  ],
  // Zone 5: Dark Forest
  [
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,0,1,1,1,0,0,2,0,0,0,0,2,0,1,1,1,0,0,2],
    [2,0,1,1,1,0,2,2,0,2,2,0,2,2,1,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,2,2,0,0,1,1,0,0,0,1,1,0,0,2,2,0,0,2],
    [2,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,0],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [2,0,2,0,0,0,1,1,0,0,0,1,1,0,0,2,0,0,0,0],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,2,2,0,0,1,1,0,0,0,1,1,0,0,2,2,0,0,2],
    [2,0,1,1,0,0,0,0,2,2,2,0,0,0,0,1,1,0,0,2],
    [2,0,1,1,0,0,1,1,0,0,0,1,1,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  ],
  // Zone 6: Ice Cave
  [
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,0,1,1,0,2,2,0,8,8,8,0,2,2,0,1,1,0,0,2],
    [2,0,1,1,0,0,2,0,8,8,8,0,2,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,8,8,8,0,0,0,0,0,0,0,0,2],
    [0,0,0,0,0,0,0,0,8,8,8,0,0,0,0,0,0,0,0,2],
    [0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,2],
    [0,0,0,0,0,0,2,2,0,0,0,0,2,2,0,0,0,0,0,2],
    [2,0,0,0,0,0,2,0,0,0,0,0,0,2,0,0,0,0,0,2],
    [2,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,8,8,8,8,0,0,0,0,0,0,0,2],
    [2,0,1,1,0,0,0,0,8,8,8,8,0,0,0,1,1,0,0,2],
    [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  ],
  // Zone 7: Desert
  [
    [2,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2],
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    [2,4,1,1,4,4,2,4,4,4,4,4,4,2,4,1,1,4,4,2],
    [2,4,1,1,4,4,4,4,4,4,4,4,4,4,4,1,1,4,4,2],
    [2,4,4,4,4,4,4,4,2,4,4,2,4,4,4,4,4,4,4,2],
    [2,4,4,4,4,4,4,4,2,4,4,2,4,4,4,4,4,4,4,2],
    [2,4,1,1,4,4,4,4,4,4,4,4,4,4,4,1,1,4,4,2],
    [2,4,4,4,4,4,4,4,2,4,4,2,4,4,4,4,4,4,4,2],
    [2,4,4,4,4,4,4,4,2,4,4,2,4,4,4,4,4,4,4,2],
    [2,4,1,1,4,4,4,4,4,4,4,4,4,4,4,1,1,4,4,2],
    [2,4,4,4,4,4,2,4,4,4,4,4,4,2,4,4,4,4,4,2],
    [2,4,1,1,4,4,4,4,4,4,4,4,4,4,4,1,1,4,4,2],
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  ],
];

// ═══════════════════════════════════════════════════
// ZONE / EXIT / BARRIER DATA
// ═══════════════════════════════════════════════════
const ZONE_INFO = [
  { id: 0, name: 'Meadow'      },
  { id: 1, name: 'Beach'       },
  { id: 2, name: 'City'        },
  { id: 3, name: 'Highlands'   },
  { id: 4, name: 'Volcano'     },
  { id: 5, name: 'Dark Forest' },
  { id: 6, name: 'Ice Cave'    },
  { id: 7, name: 'Desert'      },
];

const EXITS = [
  { from: 0, dir: 'south', pos: [9,10,11], to: 1, entryX: 10, entryY:  1, barrier: 'log'   },
  { from: 1, dir: 'north', pos: [9,10,11], to: 0, entryX: 10, entryY: 12, barrier: null    },
  { from: 1, dir: 'west',  pos: [5,6,7],   to: 2, entryX: 18, entryY:  6, barrier: 'rock'  },
  { from: 2, dir: 'east',  pos: [5,6,7],   to: 1, entryX:  1, entryY:  6, barrier: null    },
  { from: 2, dir: 'north', pos: [9,10,11], to: 3, entryX: 10, entryY: 12, barrier: 'fence' },
  { from: 3, dir: 'south', pos: [9,10,11], to: 2, entryX: 10, entryY:  1, barrier: null    },
  { from: 3, dir: 'north', pos: [9,10,11], to: 4, entryX: 10, entryY: 12, barrier: 'lava'  },
  { from: 4, dir: 'south', pos: [9,10,11], to: 3, entryX: 10, entryY:  1, barrier: null    },
  { from: 0, dir: 'west',  pos: [5,6,7],   to: 5, entryX: 18, entryY:  6, barrier: 'vine'  },
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

const GRASS_PICKUP_CHANCE = 0.12; // 12% per grass step to find a ball or coin

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

// Pre-cached tile canvases for performance
const tileCache = {};

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');

  // Prevent the whole page from scrolling on touch
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  buildTileCache();
  loadSave();
  bindEvents();
  requestAnimationFrame(loop);
});

// ═══════════════════════════════════════════════════
// TILE CACHE
// ═══════════════════════════════════════════════════
function buildTileCache() {
  buildPath();
  buildGrass();
  buildTree();
  buildWater();
  buildSand();
  buildCity();
  buildShop();
  buildLava();
  buildIce();
}

function makeTile() {
  const c = document.createElement('canvas');
  c.width = c.height = TILE_SIZE;
  return [c, c.getContext('2d')];
}

function buildPath() {
  const [c, x] = makeTile();
  x.fillStyle = '#d0b068';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#c0a050';
  // subtle stone lines
  x.fillRect(0, 15, TILE_SIZE, 1);
  x.fillRect(16, 0, 1, 15);
  x.fillRect(0, 31, TILE_SIZE, 1);
  x.fillRect(8, 16, 1, 15);
  tileCache[T.PATH] = c;
}

function buildGrass() {
  const [c, x] = makeTile();
  x.fillStyle = '#38b038';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#28902a';
  // grass blades
  [[4,6],[10,2],[17,7],[24,3],[28,8]].forEach(([bx, by]) => {
    x.fillRect(bx, by, 2, 7);
    x.fillRect(bx+1, by-2, 2, 5);
  });
  tileCache[T.GRASS] = c;
}

function buildTree() {
  const [c, x] = makeTile();
  x.fillStyle = '#1a4018';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // foliage circle
  x.fillStyle = '#306830';
  x.beginPath();
  x.arc(16, 14, 13, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#204820';
  x.beginPath();
  x.arc(11, 11, 7, 0, Math.PI * 2);
  x.fill();
  // trunk
  x.fillStyle = '#5a3010';
  x.fillRect(13, 25, 6, 7);
  tileCache[T.TREE] = c;
}

function buildWater() {
  const [c, x] = makeTile();
  x.fillStyle = '#2060d0';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#3880e8';
  [[3,8,10,3],[16,18,8,3],[6,24,12,3]].forEach(([wx,wy,ww,wh]) => {
    x.beginPath();
    x.ellipse(wx + ww/2, wy + wh/2, ww/2, wh/2, 0, 0, Math.PI * 2);
    x.fill();
  });
  tileCache[T.WATER] = c;
}

function buildSand() {
  const [c, x] = makeTile();
  x.fillStyle = '#e8c870';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // wavy highlight lines
  x.fillStyle = '#d4b05a';
  [4, 9, 14, 20, 25].forEach(y => {
    x.fillRect(0, y, TILE_SIZE, 1);
  });
  tileCache[T.SAND] = c;
}

function buildCity() {
  const [c, x] = makeTile();
  x.fillStyle = '#909090';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // grid slab lines
  x.fillStyle = '#787878';
  x.fillRect(0, 15, TILE_SIZE, 1);
  x.fillRect(0, 31, TILE_SIZE, 1);
  x.fillRect(15, 0, 1, 15);
  x.fillRect(15, 16, 1, 15);
  tileCache[T.CITY] = c;
}

function buildShop() {
  const [c, x] = makeTile();
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
  tileCache[T.SHOP] = c;
}

function buildLava() {
  const [c, x] = makeTile();
  x.fillStyle = '#c83000';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#ff6820';
  [[2,4,12,4],[18,2,8,3],[6,16,14,3],[20,22,8,4],[0,28,16,4]].forEach(([lx,ly,lw,lh]) => {
    x.fillRect(lx, ly, lw, lh);
  });
  x.fillStyle = '#ffd040';
  [[8,8,3,2],[22,14,4,2],[14,24,3,2]].forEach(([lx,ly,lw,lh]) => {
    x.fillRect(lx, ly, lw, lh);
  });
  tileCache[T.LAVA] = c;
}

function buildIce() {
  const [c, x] = makeTile();
  x.fillStyle = '#b8d8f0';
  x.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  x.fillStyle = '#e8f4ff';
  [[0,10,16,2],[20,6,12,2],[8,20,20,2],[0,28,10,2],[24,24,8,2]].forEach(([lx,ly,lw,lh]) => {
    x.fillRect(lx, ly, lw, lh);
  });
  x.fillStyle = '#90c0e0';
  [[4,4,6,6],[22,16,6,6],[10,26,6,4]].forEach(([lx,ly,lw,lh]) => {
    x.fillRect(lx, ly, lw, lh);
  });
  tileCache[T.ICE] = c;
}

// ═══════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════
function bindEvents() {
  // Keyboard
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    wakeAudio();
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  // Title buttons
  document.getElementById('start-btn').addEventListener('click', () => { wakeAudio(); startNewGame(); });
  document.getElementById('continue-btn').addEventListener('click', () => { wakeAudio(); enterWorld(); });

  // World HUD
  document.getElementById('pokedex-btn').addEventListener('click', openPokedex);

  // Pokédex
  document.getElementById('pokedex-back').addEventListener('click', closePokedex);
  document.getElementById('detail-back').addEventListener('click', closeDetail);

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
    const press   = e => { e.preventDefault(); keys[k] = true;  wakeAudio(); };
    const release = e => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener('touchstart',  press,   { passive: false });
    btn.addEventListener('touchend',    release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup',   release);
    btn.addEventListener('pointercancel', release);
  });
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
    if (exit.dir === 'south' && ny === MAP_ROWS - 1 && exit.pos.includes(nx)) match = true;
    if (exit.dir === 'north' && ny === 0            && exit.pos.includes(nx)) match = true;
    if (exit.dir === 'west'  && nx === 0            && exit.pos.includes(ny)) match = true;
    if (exit.dir === 'east'  && nx === MAP_COLS - 1 && exit.pos.includes(ny)) match = true;
    if (match) return exit.barrier;
  }
  return null;
}

// Find exit for player at the border moving off-map
function findActiveExit(x, y, dx, dy) {
  const zoneExits = EXITS.filter(e => e.from === currentZone);
  for (const exit of zoneExits) {
    if (exit.dir === 'south' && dy > 0  && y === MAP_ROWS - 1 && exit.pos.includes(x)) return exit;
    if (exit.dir === 'north' && dy < 0  && y === 0            && exit.pos.includes(x)) return exit;
    if (exit.dir === 'west'  && dx < 0  && x === 0            && exit.pos.includes(y)) return exit;
    if (exit.dir === 'east'  && dx > 0  && x === MAP_COLS - 1 && exit.pos.includes(y)) return exit;
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
  if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) {
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
  if (tile === T.TREE || tile === T.WATER || tile === T.LAVA || tile === T.ICE) {
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
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
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

  const px = wildPoke.x * TILE_SIZE;
  const py = wildPoke.y * TILE_SIZE;

  // Wiggle the grass tile
  const angle = Math.sin(ts * 0.012) * 0.18;
  ctx.save();
  ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
  ctx.rotate(angle);
  ctx.drawImage(tileCache[T.GRASS], -TILE_SIZE / 2, -TILE_SIZE / 2);
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
function drawWorld(ts) {
  const map = MAPS[currentZone];
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      ctx.drawImage(tileCache[map[r][c]], c * TILE_SIZE, r * TILE_SIZE);
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
    ctx.fillRect(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
  }
  drawBarriers(ts);
  drawWild(ts);
  const pos = getRenderPos(ts);
  drawPlayer(pos.x, pos.y);
}

// ─── Barrier graphics ────────────────────────────────
function drawBarriers(ts) {
  const zoneExits = EXITS.filter(e => e.from === currentZone);
  for (const exit of zoneExits) {
    if (!exit.barrier || isBarrierUnlocked(exit.barrier)) continue;
    const signEmoji = BARRIERS[exit.barrier].sign;
    const midP = exit.pos[Math.floor(exit.pos.length / 2)];
    for (const p of exit.pos) {
      let bx, by;
      if      (exit.dir === 'south') { bx = p * TILE_SIZE; by = (MAP_ROWS - 1) * TILE_SIZE; }
      else if (exit.dir === 'north') { bx = p * TILE_SIZE; by = 0; }
      else if (exit.dir === 'west')  { bx = 0; by = p * TILE_SIZE; }
      else if (exit.dir === 'east')  { bx = (MAP_COLS - 1) * TILE_SIZE; by = p * TILE_SIZE; }
      drawBarrierTile(ctx, exit.barrier, bx, by, ts);
    }
    // Draw a floating emoji sign above / beside the middle barrier tile
    let sx, sy;
    if      (exit.dir === 'south') { sx = midP * TILE_SIZE + 4; sy = (MAP_ROWS - 2) * TILE_SIZE + 4; }
    else if (exit.dir === 'north') { sx = midP * TILE_SIZE + 4; sy = TILE_SIZE + 4; }
    else if (exit.dir === 'west')  { sx = TILE_SIZE + 4;                sy = midP * TILE_SIZE + 4; }
    else                           { sx = (MAP_COLS - 2) * TILE_SIZE + 4; sy = midP * TILE_SIZE + 4; }
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
  document.getElementById('detail-desc').textContent   = poke.description;
}

function closeDetail() {
  document.getElementById('pokedex-detail').classList.add('hidden');
  document.getElementById('pokedex-grid').classList.remove('hidden');
  renderPokedexGrid();
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
