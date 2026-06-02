'use strict';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════
const TILE_SIZE      = 32;
const MAP_COLS       = 20;
const MAP_ROWS       = 14;
const ENCOUNTER_RATE = 0.20;   // 20% per grass step
const TIMER_MS       = 6000;   // 6 seconds to choose
const MOVE_INTERVAL  = 190;    // ms between repeated steps
const SAVE_KEY       = 'lukeymon_v1';

const T = { PATH: 0, GRASS: 1, TREE: 2, WATER: 3 };

// 20 × 14 tile map  (0=path, 1=grass, 2=tree, 3=water)
const MAP = [
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,2],
  [2,0,1,1,1,0,0,2,2,0,0,2,2,0,0,1,1,1,0,2],
  [2,0,1,1,1,0,0,2,2,0,0,2,2,0,0,0,0,0,0,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0,0,0,2],  // player spawns col 10
  [2,0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2],
  [2,0,1,1,0,0,0,0,2,2,2,0,0,0,0,1,1,1,0,2],
  [2,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,2],
  [2,0,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,0,2],
  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
];

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
let caughtIds   = new Set();
let currentPoke = null;
let timerId     = null;
let timerStart  = 0;
let canvas, ctx;
let audioCtx    = null;

// Pre-cached tile canvases for performance
const tileCache = {};

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');

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
// GAME LOOP
// ═══════════════════════════════════════════════════
function loop(ts) {
  requestAnimationFrame(loop);

  if (gameState === 'world') {
    if (ts - lastMoveTs >= MOVE_INTERVAL) {
      let moved = false;
      if      (keys['ArrowUp']    || keys['w'] || keys['W']) { move( 0,-1); moved = true; }
      else if (keys['ArrowDown']  || keys['s'] || keys['S']) { move( 0, 1); moved = true; }
      else if (keys['ArrowLeft']  || keys['a'] || keys['A']) { move(-1, 0); moved = true; }
      else if (keys['ArrowRight'] || keys['d'] || keys['D']) { move( 1, 0); moved = true; }
      if (moved) lastMoveTs = ts;
    }
    drawWorld();
  }
}

// ═══════════════════════════════════════════════════
// MOVEMENT
// ═══════════════════════════════════════════════════
function move(dx, dy) {
  const nx = playerX + dx;
  const ny = playerY + dy;
  if (nx < 0 || nx >= MAP_COLS || ny < 0 || ny >= MAP_ROWS) return;

  const tile = MAP[ny][nx];
  if (tile === T.TREE || tile === T.WATER) return;

  playerDir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
  playerX   = nx;
  playerY   = ny;
  playerStep ^= 1;

  beep(220, 0.04, 0.04, 'square');

  if (tile === T.GRASS && Math.random() < ENCOUNTER_RATE) {
    const uncaught = POKEMON_DATA.filter(p => !caughtIds.has(p.id));
    if (uncaught.length === 0) {
      showMessage('You caught every Lukeymon! 🏆');
      return;
    }
    const poke = uncaught[Math.floor(Math.random() * uncaught.length)];
    setTimeout(() => beginEncounter(poke), 80);
  }
}

// ═══════════════════════════════════════════════════
// WORLD RENDERING
// ═══════════════════════════════════════════════════
function drawWorld() {
  // Tiles
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      ctx.drawImage(tileCache[MAP[r][c]], c * TILE_SIZE, r * TILE_SIZE);
    }
  }
  // Player
  drawPlayer(playerX * TILE_SIZE, playerY * TILE_SIZE);
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
  currentPoke = poke;
  gameState   = 'encounter';

  document.getElementById('enc-name').textContent      = poke.name;
  document.getElementById('enc-type-badge').textContent = poke.type;
  document.getElementById('enc-type-badge').style.background = typeColor(poke.type);
  document.getElementById('enc-emoji-display').textContent   = poke.emoji;
  document.getElementById('enc-thought-emoji').textContent   = poke.actionEmoji;
  document.getElementById('enc-thought-text').textContent    =
    poke.action === 'feed' ? 'I want food!' :
    poke.action === 'pet'  ? 'Pet me please!' :
                             'Play with me!';

  // Enable/reset buttons
  document.querySelectorAll('.action-btn').forEach(b => {
    b.disabled = false;
    b.classList.remove('correct', 'wrong');
  });

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
    btnEl.classList.add('correct');
    setTimeout(() => caught(), 500);
  } else {
    btnEl.classList.add('wrong');
    // Highlight the correct button
    document.querySelectorAll('.action-btn').forEach(b => {
      if (b.dataset.action === currentPoke.action) b.classList.add('correct');
    });
    setTimeout(() => fled(), 700);
  }
}

function caught() {
  const isNew = !caughtIds.has(currentPoke.id);
  caughtIds.add(currentPoke.id);
  saveCaught();
  updateHud();

  document.getElementById('result-stars').classList.remove('hidden');
  document.getElementById('result-icon').textContent    = currentPoke.emoji;
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
  document.getElementById('result-icon').textContent    = '💨';
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
    emojiDiv.textContent = poke.emoji;

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

  document.getElementById('detail-emoji').textContent  = poke.emoji;
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
  const row = POKEMON_DATA.map(p => p.emoji).join(' ');
  document.getElementById('complete-row').textContent = row;
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

function showMessage(text) {
  const box = document.getElementById('message-box');
  document.getElementById('message-text').textContent = text;
  box.classList.remove('hidden');
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => box.classList.add('hidden'), 3000);
}

function updateHud() {
  document.getElementById('caught-count').textContent = caughtIds.size;
}

// ═══════════════════════════════════════════════════
// GAME FLOW
// ═══════════════════════════════════════════════════
function startNewGame() {
  caughtIds.clear();
  playerX = 10; playerY = 7; playerDir = 'down';
  saveCaught();
  updateHud();
  enterWorld();
}

function enterWorld() {
  gameState = 'world';
  showScreen('world');
  updateHud();
}

// ═══════════════════════════════════════════════════
// SAVE / LOAD
// ═══════════════════════════════════════════════════
function saveCaught() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify([...caughtIds]));
  } catch (_) {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const ids = JSON.parse(raw);
      caughtIds = new Set(ids);
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
