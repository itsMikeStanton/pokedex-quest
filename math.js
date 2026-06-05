'use strict';

// ═══════════════════════════════════════════════════
// POKéMATH LAB
// A friendly Pokédex math game for little trainers.
// Self-contained: sprites are addressed by national-dex id
// (sprites/NNN.png), so the game runs anywhere it's dropped —
// including next to the other game on gh-pages.
// ═══════════════════════════════════════════════════

const SAVE_KEY        = 'pokemath_v1';
const QUESTIONS       = 8;          // questions per round
const PIKACHU_ID      = 25;         // Pikachu is the buddy, not a wild catch

// Our roster of classic, kid-friendly Pokémon. id matches the sprite
// number (sprites/NNN.png) in the shared Pokédex art set.
const ROSTER = [
  { id: 1,   name: 'Bulbasaur',  type: 'Grass'    },
  { id: 4,   name: 'Charmander', type: 'Fire'     },
  { id: 7,   name: 'Squirtle',   type: 'Water'    },
  { id: 10,  name: 'Caterpie',   type: 'Bug'      },
  { id: 16,  name: 'Pidgey',     type: 'Flying'   },
  { id: 19,  name: 'Rattata',    type: 'Normal'   },
  { id: 25,  name: 'Pikachu',    type: 'Electric' },
  { id: 35,  name: 'Clefairy',   type: 'Fairy'    },
  { id: 39,  name: 'Jigglypuff', type: 'Normal'   },
  { id: 52,  name: 'Meowth',     type: 'Normal'   },
  { id: 54,  name: 'Psyduck',    type: 'Water'    },
  { id: 94,  name: 'Gengar',     type: 'Ghost'    },
  { id: 129, name: 'Magikarp',   type: 'Water'    },
  { id: 133, name: 'Eevee',      type: 'Normal'   },
  { id: 143, name: 'Snorlax',    type: 'Normal'   },
];

// Wild Pokémon pool = everyone except our buddy Pikachu.
const WILD_POOL = ROSTER.filter(p => p.id !== PIKACHU_ID);

// ─── PROFESSOR LINES ───────────────────────────────
const PROF = {
  start: [
    'You can do it!',
    "Take your time, trainer!",
    'Count carefully!',
    'I believe in you!',
  ],
  right: [
    'Wonderful! ⭐',
    'You caught it!',
    'Super smart!',
    'Pikachu is proud!',
    'Math champion!',
  ],
  wrong: [
    'So close! Count the Pokéballs.',
    'Try again — look at the balls!',
    'Almost! Give it another go.',
    "Hmm, let's count together.",
  ],
};

// ─── STATE ─────────────────────────────────────────
let op        = 'add';   // add | sub | mul | mix
let level     = 1;       // 1 easy, 2 tricky
let qIndex    = 0;
let roundStars = 0;
let roundCaught = [];     // ids caught this round
let current   = null;     // { a, b, op, answer, choices, poke }
let answered  = false;

let save = { stars: 0, caught: [] };
let caughtSet = new Set();
let audioCtx  = null;

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  loadSave();
  bindEvents();
  refreshTitle();
  $('#title-total').textContent = WILD_POOL.length;
  $('#dex-total').textContent   = WILD_POOL.length;
  $('#q-total').textContent     = QUESTIONS;
});

const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// ═══════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════
function bindEvents() {
  $('#start-btn').addEventListener('click', () => { wakeAudio(); show('mode'); });
  $('#dex-open-btn').addEventListener('click', () => { wakeAudio(); openDex(); });
  $('#mode-back').addEventListener('click', () => show('title'));

  // operation buttons start a round
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => { wakeAudio(); op = btn.dataset.op; startRound(); });
  });

  // level toggle
  $$('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      level = Number(btn.dataset.level);
    });
  });

  // answer choices
  $$('.choice-btn').forEach(btn => {
    btn.addEventListener('click', () => onChoice(btn));
  });

  $('#quiz-quit').addEventListener('click', () => show('title'));
  $('#result-again').addEventListener('click', () => { wakeAudio(); startRound(); });
  $('#result-home').addEventListener('click', () => { refreshTitle(); show('title'); });
  $('#dex-back').addEventListener('click', () => { refreshTitle(); show('title'); });
}

// ═══════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════
function show(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#' + id + '-screen').classList.add('active');
}

// ═══════════════════════════════════════════════════
// ROUND FLOW
// ═══════════════════════════════════════════════════
function startRound() {
  qIndex = 0;
  roundStars = 0;
  roundCaught = [];
  show('quiz');
  nextQuestion();
}

function nextQuestion() {
  answered = false;
  qIndex++;
  $('#q-now').textContent = qIndex;
  $('#round-stars').textContent = roundStars;

  current = makeQuestion();

  // wild pokemon
  const poke = current.poke;
  const wildImg = $('#wild-sprite');
  wildImg.src = spriteSrc(poke.id);
  wildImg.alt = poke.name;
  $('#wild-name').textContent  = poke.name;
  const typeBadge = $('#wild-type');
  typeBadge.textContent = poke.type;
  typeBadge.style.background = typeColor(poke.type);

  // problem
  $('#p-a').textContent  = current.a;
  $('#p-op').textContent = opSymbol(current.op);
  $('#p-b').textContent  = current.b;
  $('#p-q').textContent  = '?';

  // choices
  $$('.choice-btn').forEach((btn, i) => {
    btn.textContent = current.choices[i];
    btn.disabled = false;
    btn.classList.remove('correct', 'wrong');
  });

  // helper pokeballs
  renderHelper(current);

  // coach
  setCoach(pick(PROF.start));
}

// ═══════════════════════════════════════════════════
// QUESTION GENERATION
// ═══════════════════════════════════════════════════
function makeQuestion() {
  let realOp = op === 'mix' ? pick(['add', 'sub', 'mul']) : op;
  let a, b, answer;

  if (realOp === 'add') {
    const max = level === 1 ? 5 : 9;
    a = rand(1, max);
    b = rand(1, max);
    answer = a + b;
  } else if (realOp === 'sub') {
    const max = level === 1 ? 9 : 18;
    a = rand(2, max);
    b = rand(1, a);          // never negative
    answer = a - b;
  } else { // mul — keep it small
    const maxA = 5;
    const maxB = level === 1 ? 5 : 10;
    a = rand(1, maxA);
    b = rand(1, maxB);
    answer = a * b;
  }

  return {
    a, b, op: realOp, answer,
    choices: makeChoices(answer),
    poke: pick(WILD_POOL),
  };
}

function makeChoices(answer) {
  const set = new Set([answer]);
  let guard = 0;
  while (set.size < 3 && guard++ < 50) {
    const delta = pick([-3, -2, -1, 1, 2, 3]);
    const cand = answer + delta;
    if (cand >= 0) set.add(cand);
  }
  // pad if needed (very small answers)
  let extra = answer + 1;
  while (set.size < 3) set.add(extra++);
  return shuffle([...set]);
}

// ═══════════════════════════════════════════════════
// POKÉBALL HELPER (visual counting)
// ═══════════════════════════════════════════════════
function renderHelper(q) {
  const box = $('#helper');
  box.innerHTML = '';

  if (q.op === 'add') {
    box.appendChild(ballGroup(q.a));
    box.appendChild(plus());
    box.appendChild(ballGroup(q.b));
  } else if (q.op === 'sub') {
    // show a balls, fade out the last b (taken away)
    const g = document.createElement('div');
    g.className = 'pb-group';
    for (let i = 0; i < q.a; i++) {
      g.appendChild(ball(i >= q.a - q.b)); // last b are "gone"
    }
    box.appendChild(g);
  } else { // mul: an array of a rows × b balls (stacks down, never overlaps)
    if (q.answer <= 30) {
      const array = document.createElement('div');
      array.className = 'pb-array';
      for (let r = 0; r < q.a; r++) {
        const row = document.createElement('div');
        row.className = 'pb-row';
        for (let c = 0; c < q.b; c++) row.appendChild(ball(false));
        array.appendChild(row);
      }
      box.appendChild(array);
    } else {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-weight:800;font-size:16px;color:#3a5a2a;';
      hint.textContent = `${q.a} rows of ${q.b}`;
      box.appendChild(hint);
    }
  }
}

function ballGroup(n) {
  const g = document.createElement('div');
  g.className = 'pb-group';
  for (let i = 0; i < n; i++) g.appendChild(ball(false));
  return g;
}
function ball(gone) {
  const b = document.createElement('div');
  b.className = 'pokeball' + (gone ? ' gone' : '');
  return b;
}
function plus() {
  const p = document.createElement('span');
  p.className = 'pb-plus';
  p.textContent = '+';
  return p;
}

// ═══════════════════════════════════════════════════
// ANSWERING
// ═══════════════════════════════════════════════════
function onChoice(btn) {
  if (answered) return;
  wakeAudio();
  const val = Number(btn.textContent);

  if (val === current.answer) {
    answered = true;
    btn.classList.add('correct');
    $$('.choice-btn').forEach(b => b.disabled = true);
    onCorrect();
  } else {
    // gentle: mark wrong, reveal counting, let them try again
    btn.classList.add('wrong');
    btn.disabled = true;
    setCoach(pick(PROF.wrong));
    renderHelper(current);
    playWrong();
  }
}

function onCorrect() {
  roundStars++;
  $('#round-stars').textContent = roundStars;

  // catch the wild pokemon
  const poke = current.poke;
  caughtSet.add(poke.id);
  if (!roundCaught.includes(poke.id)) roundCaught.push(poke.id);
  save.stars = (save.stars || 0) + 1;
  save.caught = [...caughtSet];
  persist();

  setCoach(pick(PROF.right));
  celebratePika();
  playCorrect();
  pokeballPop();

  setTimeout(() => {
    if (qIndex >= QUESTIONS) endRound();
    else nextQuestion();
  }, 1100);
}

function pokeballPop() {
  $$('#helper .pokeball').forEach((b, i) => {
    setTimeout(() => b.classList.add('pop'), i * 40);
  });
}

function celebratePika() {
  const p = $('#coach-pika');
  p.classList.remove('happy');
  void p.offsetWidth; // restart animation
  p.classList.add('happy');
}

function setCoach(text) {
  $('#coach-text').textContent = text;
}

// ═══════════════════════════════════════════════════
// ROUND RESULT
// ═══════════════════════════════════════════════════
function endRound() {
  show('result');

  const perfect = roundStars === QUESTIONS;
  $('#result-title').textContent = perfect ? 'PERFECT!' : 'GREAT JOB!';
  $('#result-trophy').textContent = perfect ? '🏆' : '🎉';

  // stars earned this round (visual)
  const filled = '⭐'.repeat(roundStars);
  $('#result-stars-big').textContent = filled || '✨';
  $('#result-line').textContent = `You got ${roundStars} / ${QUESTIONS}!`;

  // pokemon caught this round
  const caughtRow = $('#result-caught-row');
  caughtRow.innerHTML = '';
  if (roundCaught.length) {
    const label = document.createElement('div');
    label.className = 'res-caught-label';
    label.textContent = 'Caught:';
    caughtRow.appendChild(label);
    roundCaught.forEach(id => {
      const p = WILD_POOL.find(x => x.id === id);
      if (!p) return;
      const img = document.createElement('img');
      img.className = 'sprite';
      img.src = spriteSrc(p.id);
      img.alt = p.name;
      caughtRow.appendChild(img);
    });
  }

  $('#result-prof').textContent = perfect
    ? 'Amazing! You answered every one! 🌟'
    : 'Well done, trainer! Keep practicing!';

  playFanfare();
}

// ═══════════════════════════════════════════════════
// POKÉDEX
// ═══════════════════════════════════════════════════
function openDex() {
  const grid = $('#dex-grid');
  grid.innerHTML = '';
  $('#dex-count').textContent = caughtSet.size;

  WILD_POOL.forEach((p, i) => {
    const caught = caughtSet.has(p.id);
    const card = document.createElement('div');
    card.className = 'dex-card ' + (caught ? 'caught' : 'locked');

    const no = document.createElement('div');
    no.className = 'dex-card-no';
    no.textContent = '#' + String(i + 1).padStart(2, '0');

    const img = document.createElement('img');
    img.className = 'dex-card-emoji sprite';
    img.src = spriteSrc(p.id);
    img.alt = caught ? p.name : '';  // locked cards are blacked-out via CSS

    const name = document.createElement('div');
    name.className = 'dex-card-name';
    name.textContent = caught ? p.name : '???';

    card.append(no, img, name);
    grid.appendChild(card);
  });

  show('dex');
}

function refreshTitle() {
  $('#title-stars').textContent  = save.stars || 0;
  $('#title-caught').textContent = caughtSet.size;
}

// ═══════════════════════════════════════════════════
// SAVE / LOAD
// ═══════════════════════════════════════════════════
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = JSON.parse(raw);
  } catch (_) { save = { stars: 0, caught: [] }; }
  if (!save.caught) save.caught = [];
  caughtSet = new Set(save.caught);
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════
function rand(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function pick(arr)    { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function opSymbol(o) { return o === 'add' ? '+' : o === 'sub' ? '−' : '×'; }
function spriteSrc(id) { return `sprites/${String(id).padStart(3, '0')}.png`; }

function typeColor(type) {
  const map = {
    Grass: '#4a9c3a', Fire: '#e0552a', Water: '#2f7fe0', Bug: '#7a9c28',
    Flying: '#7d8fd0', Normal: '#8a8a92', Electric: '#e0a818', Fairy: '#d06fb0',
    Ghost: '#6a5aa8', Psychic: '#d04a7a',
  };
  return map[type] || '#777';
}

// ═══════════════════════════════════════════════════
// AUDIO (chiptune — same idea as the Lukeymon game)
// ═══════════════════════════════════════════════════
function wakeAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
}
function beep(freq, vol, dur, type = 'square') {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.value = freq; osc.type = type;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.start(); osc.stop(audioCtx.currentTime + dur + 0.01);
  } catch (_) {}
}
function playCorrect() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 0.16), i * 110));
}
function playWrong() {
  beep(300, 0.12, 0.12);
  setTimeout(() => beep(200, 0.10, 0.18), 130);
}
function playFanfare() {
  [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 0.2), i * 130));
}
