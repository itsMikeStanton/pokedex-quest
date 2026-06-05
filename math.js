'use strict';

// ═══════════════════════════════════════════════════
// POKéMATH LAB
// A friendly Pokédex math game for little trainers.
// Self-contained: sprites are addressed by national-dex id
// (sprites/NNN.png), so the game runs anywhere it's dropped —
// including next to the other game on gh-pages.
// ═══════════════════════════════════════════════════

const VERSION         = 'v2.0';     // shown in the corner; bump on changes
const SAVE_KEY        = 'pokemath_v1';
const QUESTIONS       = 8;          // questions per round
const PIKACHU_ID      = 25;         // Pikachu is the buddy, not a wild catch

// ROSTER (all 151) comes from mathdata.js.
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
let sessionCaught = [];   // distinct ids caught since the page loaded (for the parade)
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
  $('#dex-version').textContent = VERSION;
  $('#title-total').textContent = ROSTER.length;   // full dex (incl. Pikachu)
  $('#dex-total').textContent   = ROSTER.length;
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
  $('#reset-btn').addEventListener('click', resetProgress);

  // tap Pikachu (title buddy or coach) to make him dance
  document.querySelectorAll('#coach-pika, .buddy-pika').forEach(el => {
    el.addEventListener('click', () => pikaDance(el));
  });
}

// ═══════════════════════════════════════════════════
// RESET
// ═══════════════════════════════════════════════════
function resetProgress() {
  if (!window.confirm('Reset all progress?\nThis erases your stars and caught Pokémon.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  save = { stars: 0, caught: [] };
  caughtSet = new Set([PIKACHU_ID]);  // Pikachu is always your buddy
  sessionCaught = [];
  refreshTitle();
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
    if (level === 1) { a = rand(1, 9);  b = rand(1, 9);  }   // sums to 18
    else             { a = rand(4, 15); b = rand(4, 15); }   // sums to 30
    answer = a + b;
  } else if (realOp === 'sub') {
    const max = level === 1 ? 12 : 20;
    a = rand(3, max);
    b = rand(1, a);          // never negative
    answer = a - b;
  } else { // mul — times tables
    if (level === 1) { a = rand(1, 5); b = rand(1, 5); }     // up to 5×5
    else             { a = rand(2, 9); b = rand(2, 9); }     // up to 9×9
    answer = a * b;
  }

  return {
    a, b, op: realOp, answer,
    choices: makeChoices(answer),
    poke: pickWild(),
  };
}

// Mostly new Pokémon to discover, but sometimes a familiar repeat.
function pickWild() {
  const uncaught = WILD_POOL.filter(p => !caughtSet.has(p.id));
  const caught   = WILD_POOL.filter(p =>  caughtSet.has(p.id));
  if (!uncaught.length) return pick(caught.length ? caught : WILD_POOL);
  // ~70% chance show a new one; otherwise a repeat (when any exist)
  if (caught.length && Math.random() < 0.30) return pick(caught);
  return pick(uncaught);
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
    // balls when the piles are small enough to count; otherwise a strategy tip
    if (q.a <= 10 && q.b <= 10) {
      box.appendChild(ballGroup(q.a));
      box.appendChild(plus());
      box.appendChild(ballGroup(q.b));
    } else {
      box.appendChild(hint(`Start at ${q.a}, count on ${q.b} more`));
    }
  } else if (q.op === 'sub') {
    if (q.a <= 14) {
      // show a balls, fade out the last b (taken away)
      const g = document.createElement('div');
      g.className = 'pb-group';
      for (let i = 0; i < q.a; i++) g.appendChild(ball(i >= q.a - q.b));
      box.appendChild(g);
    } else {
      box.appendChild(hint(`Start at ${q.a}, take ${q.b} away`));
    }
  } else { // mul: an array of a rows × b balls (stacks down, never overlaps)
    if (q.a <= 5 && q.answer <= 30) {
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
      box.appendChild(hint(`${q.a} rows of ${q.b}`));
    }
  }
}

function hint(text) {
  const h = document.createElement('div');
  h.className = 'pb-hint';
  h.textContent = text;
  return h;
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
  const isNew = !caughtSet.has(poke.id);
  caughtSet.add(poke.id);
  if (!sessionCaught.includes(poke.id)) sessionCaught.push(poke.id);
  save.stars = (save.stars || 0) + 1;
  save.caught = [...caughtSet];
  persist();

  setCoach(pick(PROF.right));
  celebratePika();
  pokeballPop();

  if (isNew) {
    // brand-new catch → little victory screen
    playCatchJingle();
    showCatchPop(poke, advanceQuestion);
  } else {
    playCorrect();
    setTimeout(advanceQuestion, 1000);
  }
}

function advanceQuestion() {
  if (qIndex >= QUESTIONS) endRound();
  else nextQuestion();
}

// "Gotcha! X was caught!" overlay for a new Pokémon
function showCatchPop(poke, done) {
  const pop = $('#catch-pop');
  pop.classList.remove('opened');
  $('#catch-sprite').src = spriteSrc(poke.id);
  $('#catch-sprite').alt = poke.name;
  $('#catch-name').textContent = poke.name;
  pop.classList.remove('hidden');

  // ball wiggles, then bursts open to reveal the Pokémon
  setTimeout(() => { pop.classList.add('opened'); beep(880, 0.12, 0.18); }, 850);

  setTimeout(() => {
    pop.classList.add('hidden');
    done();
  }, 2300);
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

// Tap Pikachu → he dances!
function pikaDance(el) {
  wakeAudio();
  el.classList.remove('dancing');
  void el.offsetWidth;
  el.classList.add('dancing');
  el.addEventListener('animationend', () => el.classList.remove('dancing'), { once: true });
  playPikaCheer();
}

// Professor's lines type out like a classic game
let typeTimer = null;
function typeText(el, text) {
  clearInterval(typeTimer);
  el.textContent = '';
  el.classList.add('type-caret');
  let i = 0;
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i % 2 === 0) beep(640, 0.02, 0.015, 'square');
    if (i >= text.length) {
      clearInterval(typeTimer);
      setTimeout(() => el.classList.remove('type-caret'), 500);
    }
  }, 30);
}

function setCoach(text) {
  typeText($('#coach-text'), text);
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

  // parade of every Pokémon caught this session
  const caughtRow = $('#result-caught-row');
  caughtRow.innerHTML = '';
  if (sessionCaught.length) {
    const label = document.createElement('div');
    label.className = 'res-caught-label';
    label.textContent = `Your parade — ${sessionCaught.length} caught this session!`;
    caughtRow.appendChild(label);
    sessionCaught.forEach((id, i) => {
      const p = ROSTER.find(x => x.id === id);
      if (!p) return;
      const img = document.createElement('img');
      img.className = 'sprite parade';
      img.src = spriteSrc(p.id);
      img.alt = p.name;
      const d = (i * 0.12).toFixed(2) + 's';
      img.style.animationDelay = `${d}, ${d}`;   // entrance, then marching
      caughtRow.appendChild(img);
    });
  }

  typeText($('#result-prof'), perfect
    ? 'Amazing! You answered every one! 🌟'
    : 'Well done, trainer! Keep practicing!');

  playFanfare();
}

// ═══════════════════════════════════════════════════
// POKÉDEX
// ═══════════════════════════════════════════════════
function openDex() {
  const grid = $('#dex-grid');
  grid.innerHTML = '';
  $('#dex-count').textContent = caughtSet.size;

  ROSTER.forEach(p => {
    const caught = caughtSet.has(p.id);
    const card = document.createElement('div');
    card.className = 'dex-card ' + (caught ? 'caught' : 'locked');

    const no = document.createElement('div');
    no.className = 'dex-card-no';
    no.textContent = '#' + String(p.id).padStart(3, '0');

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
  caughtSet.add(PIKACHU_ID);   // Pikachu is always your buddy — already in the dex
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
    Normal: '#7a7a86', Fire: '#e0552a', Water: '#2f7fe0', Grass: '#4a9c3a',
    Electric: '#c79a12', Ice: '#4aa6c0', Fighting: '#b03028', Poison: '#9a3ea0',
    Ground: '#b88a2a', Flying: '#6f7fd0', Psychic: '#d04a7a', Bug: '#7a9c28',
    Rock: '#9a8636', Ghost: '#6a5aa8', Dragon: '#5a3fd0', Fairy: '#d06fb0',
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
function playCatchJingle() {
  // little "ba-da-da-DING!" for a new catch
  [330, 392, 494].forEach((f, i) => setTimeout(() => beep(f, 0.12, 0.12), i * 110));
  setTimeout(() => { beep(659, 0.16, 0.22); beep(988, 0.12, 0.22, 'triangle'); }, 360);
}
function playPikaCheer() {
  beep(880, 0.10, 0.08, 'triangle');
  setTimeout(() => beep(1175, 0.10, 0.12, 'triangle'), 90);
}
