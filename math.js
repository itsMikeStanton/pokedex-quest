'use strict';

// ═══════════════════════════════════════════════════
// POKéMATH LAB
// A friendly Pokédex math game for little trainers.
// Self-contained: sprites are addressed by national-dex id
// (sprites/NNN.png), so the game runs anywhere it's dropped —
// including next to the other game on gh-pages.
// ═══════════════════════════════════════════════════

const VERSION         = 'v2.13';     // shown in the corner; bump on changes (also bump ?v= in math.html)
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
let current   = null;     // { a, b, op, answer, choices, poke, mode }
let answered  = false;

// ten-frame drag answer state
let tfCount = 0, tfCapacity = 0, tfDrag = null, tfMoved = false, tfStartX = 0, tfStartY = 0;

let save = { stars: 0, caught: [] };
let caughtSet = new Set();

// ═══════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  loadSave();
  bindEvents();
  initSfx();
  refreshTitle();
  $('#dex-version').textContent = VERSION;
  $('#title-total').textContent = ROSTER.length;   // full dex (incl. Pikachu)
  $('#dex-total').textContent   = ROSTER.length;
  $('#q-total').textContent     = QUESTIONS;
  startBoot();
});

// Wait for a tap on the "TAP TO START" prompt, then play the cute power-on
// sequence (with sound, now that the tap has unlocked audio), then the title.
function startBoot() {
  const boot = $('#boot-screen');
  let started = false, done = false;

  const finish = () => {
    if (done) return;
    done = true;
    document.removeEventListener('pointerdown', skip);
    document.removeEventListener('keydown', skip);
    boot.classList.add('fade');
    setTimeout(() => { show('title'); boot.classList.remove('fade'); }, 360);
  };
  const skip = () => { wakeAudio(); finish(); };

  const begin = () => {
    if (started) return;
    started = true;
    document.removeEventListener('pointerdown', begin);
    document.removeEventListener('keydown', begin);
    wakeAudio();
    sfx('select');                               // "start!" chime on the tap
    $('#boot-prompt').classList.add('hidden');
    $('#boot-seq').classList.remove('hidden');   // reveal → CSS animations run
    playBootJingle();                            // power-on + loading blips + READY ding
    // let the sequence play (~3s), then go to title; tap again to skip ahead
    setTimeout(finish, 3000);
    setTimeout(() => {
      document.addEventListener('pointerdown', skip);
      document.addEventListener('keydown', skip);
    }, 500);
  };

  document.addEventListener('pointerdown', begin);
  document.addEventListener('keydown', begin);
}

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

  // answer choices — pointerdown for instant feedback (no touch→click delay)
  $$('.choice-btn').forEach(btn => {
    btn.addEventListener('pointerdown', () => onChoice(btn));
  });

  $('#quiz-quit').addEventListener('click', () => show('title'));
  $('#result-again').addEventListener('click', () => { wakeAudio(); startRound(); });
  $('#result-home').addEventListener('click', () => { refreshTitle(); show('title'); });
  $('#dex-back').addEventListener('click', () => { refreshTitle(); show('title'); });
  $('#reset-btn').addEventListener('click', resetProgress);
  $('#tf-check').addEventListener('click', tfCheck);

  // tap Pikachu (title buddy or coach) to make him dance
  document.querySelectorAll('#coach-pika, .buddy-pika').forEach(el => {
    el.addEventListener('click', () => pikaDance(el));
  });

  // a little sound on every button press — on pointerdown so it's instant
  // (no touch→click delay). Answer buttons keep their own correct/wrong sound.
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    const btn = t && t.closest ? t.closest('button') : null;
    if (!btn || btn.disabled || btn.classList.contains('choice-btn')) return;
    wakeAudio();
    if (btn.matches('#mode-back, #dex-back, #quiz-quit, #reset-btn'))      sfx('back');
    else if (btn.matches('#start-btn, .mode-btn, #result-again'))          sfx('select');
    else                                                                   sfx('tap');
  }, true);
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

  // pick the answer UI: multiple choice, or drag-into-ten-frames
  const isTenframe = current.mode === 'tenframe';
  $('#choices').classList.toggle('hidden', isTenframe);
  $('#tenframe').classList.toggle('hidden', !isTenframe);
  $('#helper').classList.toggle('hidden', isTenframe);

  if (isTenframe) {
    setupTenFrame(current.answer);
    setCoach('Drag Pokéballs into the frames, then tap Check!');
  } else {
    $$('.choice-btn').forEach((btn, i) => {
      btn.textContent = current.choices[i];
      btn.disabled = false;
      btn.classList.remove('correct', 'wrong');
    });
    renderHelper(current);
    setCoach(pick(PROF.start));
  }
}

// ═══════════════════════════════════════════════════
// QUESTION GENERATION
// ═══════════════════════════════════════════════════
function makeQuestion() {
  // Mix: add/sub/mul (+ division once you're past Easy)
  const mixOps = level >= 2 ? ['add', 'sub', 'mul', 'div'] : ['add', 'sub', 'mul'];
  const realOp = op === 'mix' ? pick(mixOps) : op;
  let a, b, answer;

  if (realOp === 'add') {
    if      (level === 1) { a = rand(1, 9);   b = rand(1, 9);  }   // sums to 18
    else if (level === 2) { a = rand(4, 15);  b = rand(4, 15); }   // sums to 30
    else                  { a = rand(10, 30); b = rand(10, 30); } // sums to 60
    answer = a + b;
  } else if (realOp === 'sub') {
    const max = level === 1 ? 12 : level === 2 ? 20 : 50;
    a = rand(3, max);
    b = rand(1, a);          // never negative
    answer = a - b;
  } else if (realOp === 'mul') {
    if      (level === 1) { a = rand(1, 5);  b = rand(1, 5);  }    // up to 5×5
    else if (level === 2) { a = rand(2, 9);  b = rand(2, 9);  }    // up to 9×9
    else                  { a = rand(2, 12); b = rand(2, 12); }    // up to 12×12
    answer = a * b;
  } else { // div — sharing into equal groups (always whole-number answers)
    let divisor, quotient;
    if      (level === 1) { divisor = rand(2, 5);  quotient = rand(1, 5);  }
    else if (level === 2) { divisor = rand(2, 9);  quotient = rand(2, 9);  }
    else                  { divisor = rand(2, 12); quotient = rand(2, 12); }
    a = divisor * quotient; b = divisor; answer = quotient;
  }

  // some questions are answered by dragging Pokéballs into ten-frames
  const tenframe = answer >= 1 && answer <= 20 && Math.random() < 0.4;

  return {
    a, b, op: realOp, answer,
    choices: makeChoices(answer),
    poke: pickWild(),
    mode: tenframe ? 'tenframe' : 'choices',
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
  } else if (q.op === 'mul') { // an array of a rows × b balls (stacks down, never overlaps)
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
  } else { // div — sharing into equal groups
    box.appendChild(hint(`Share ${q.a} into groups of ${q.b}`));
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
// TEN-FRAME DRAG ANSWER
// ═══════════════════════════════════════════════════
function setupTenFrame(answer) {
  tfCapacity = answer <= 10 ? 10 : 20;   // one or two ten-frames
  tfCount = 0;
  $('#tf-frames').classList.remove('tf-correct');
  renderTenFrame();
  buildPile();
}

function renderTenFrame() {
  const wrap = $('#tf-frames');
  wrap.innerHTML = '';
  const frames = Math.ceil(tfCapacity / 10);
  let idx = 0;
  for (let f = 0; f < frames; f++) {
    const grid = document.createElement('div');
    grid.className = 'tf-grid';
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'tf-cell';
      if (idx < tfCount) {
        const b = document.createElement('div');
        b.className = 'pokeball tf-ball';
        b.addEventListener('click', () => { if (!answered) { tfCount--; renderTenFrame(); sfx('back'); } });
        cell.appendChild(b);
      }
      grid.appendChild(cell);
      idx++;
    }
    wrap.appendChild(grid);
  }
}

function buildPile() {
  const pile = $('#tf-pile');
  pile.innerHTML = '';
  // a little decorative heap to drag from
  [[8,16],[26,8],[20,26],[2,28],[34,22]].forEach(([x, y]) => {
    const b = document.createElement('div');
    b.className = 'pokeball';
    b.style.left = x + 'px';
    b.style.top = y + 'px';
    pile.appendChild(b);
  });
  pile.onpointerdown = startTfDrag;
}

function startTfDrag(e) {
  if (answered) return;
  e.preventDefault();
  wakeAudio();
  tfMoved = false; tfStartX = e.clientX; tfStartY = e.clientY;
  tfDrag = document.createElement('div');
  tfDrag.className = 'pokeball tf-drag';
  document.body.appendChild(tfDrag);
  moveTfDrag(e.clientX, e.clientY);
  window.addEventListener('pointermove', onTfMove);
  window.addEventListener('pointerup', onTfUp);
  window.addEventListener('pointercancel', onTfUp);
}
function moveTfDrag(x, y) { tfDrag.style.left = x + 'px'; tfDrag.style.top = y + 'px'; }
function onTfMove(e) {
  if (!tfDrag) return;
  if (Math.abs(e.clientX - tfStartX) > 6 || Math.abs(e.clientY - tfStartY) > 6) tfMoved = true;
  moveTfDrag(e.clientX, e.clientY);
}
function onTfUp(e) {
  window.removeEventListener('pointermove', onTfMove);
  window.removeEventListener('pointerup', onTfUp);
  window.removeEventListener('pointercancel', onTfUp);
  const fr = $('#tf-frames').getBoundingClientRect();
  const overFrames = e.clientX >= fr.left - 24 && e.clientX <= fr.right + 24 &&
                     e.clientY >= fr.top  - 24 && e.clientY <= fr.bottom + 24;
  // drop onto the frames, or a simple tap on the pile, adds one ball
  if ((overFrames || !tfMoved) && tfCount < tfCapacity) {
    tfCount++;
    renderTenFrame();
    sfx('tap');
  }
  if (tfDrag) { tfDrag.remove(); tfDrag = null; }
}

function tfCheck() {
  if (answered) return;
  wakeAudio();
  if (tfCount === current.answer) {
    answered = true;
    $('#tf-frames').classList.add('tf-correct');
    onCorrect();
  } else {
    setCoach(tfCount < current.answer ? 'A few more — keep going!' : 'Too many — tap some to remove.');
    playWrong();
    $$('.tf-grid').forEach(x => { x.classList.add('tf-shake'); setTimeout(() => x.classList.remove('tf-shake'), 400); });
  }
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
  setTimeout(() => { pop.classList.add('opened'); }, 850);  // open ding is baked into catch.wav

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
  let i = 0;
  typeTimer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) clearInterval(typeTimer);
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

    // tap any Pokémon in the dex to make it dance
    card.addEventListener('click', () => pikaDance(img));

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
function opSymbol(o) { return o === 'add' ? '+' : o === 'sub' ? '−' : o === 'mul' ? '×' : '÷'; }
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
// SOUND — pre-rendered WAV files played through ONE Web Audio context
// (low latency, like desktop). To stay audible on iOS even with the ring/mute
// switch ON, we also loop a SILENT <audio> element, which flips iOS into its
// "playback" audio session so Web Audio output is heard.
// ═══════════════════════════════════════════════════
const SFX_VERSION = '2.12';     // bump when any .wav changes
const SFX_FILES = {
  correct: 'sfx/correct.wav', wrong: 'sfx/wrong.wav', fanfare: 'sfx/fanfare.wav',
  catch:   'sfx/catch.wav',   pika:  'sfx/pika.wav',  boot:    'sfx/boot.wav',
  tap:     'sfx/tap.wav',     select:'sfx/select.wav', back:   'sfx/back.wav',
};
let actx = null;
const sfxBuf = {};        // name -> decoded AudioBuffer
let silentEl = null;      // looping silent media element (unlocks playback session)

function initSfx() {
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { actx = null; }
  if (actx) {
    for (const [name, src] of Object.entries(SFX_FILES)) {
      fetch(`${src}?v=${SFX_VERSION}`)
        .then(r => r.arrayBuffer())
        .then(ab => new Promise((res, rej) => actx.decodeAudioData(ab, res, rej)))
        .then(buf => { sfxBuf[name] = buf; })
        .catch(() => {});
    }
  }
  silentEl = new Audio(`sfx/silence.wav?v=${SFX_VERSION}`);
  silentEl.loop = true;
  silentEl.preload = 'auto';
}

// Call from user gestures (taps): resume the context and start the silent loop.
function wakeAudio() {
  if (!actx) initSfx();
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  if (silentEl && silentEl.paused) { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); }
}

function sfx(name) {
  const buf = sfxBuf[name];
  if (!actx || !buf) return;
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  try {
    const s = actx.createBufferSource();
    s.buffer = buf;
    s.connect(actx.destination);
    s.start();                    // near-zero latency
  } catch (_) {}
}

function playCorrect()     { sfx('correct'); }
function playWrong()       { sfx('wrong'); }
function playFanfare()     { sfx('fanfare'); }
function playCatchJingle() { sfx('catch'); }
function playPikaCheer()   { sfx('pika'); }
function playBootJingle()  { sfx('boot'); }
