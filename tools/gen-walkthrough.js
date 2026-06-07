#!/usr/bin/env node
// Regenerate walkthrough.html from the live game data.
//   Usage:  node tools/gen-walkthrough.js
// Reads data.js (POKEMON_DATA + stats), world.js (zones/exits) and the data
// tables in game.js (STONES / STONE_EVOS / EVOS / STONE_FINDS / COLLECTIBLES /
// BARRIERS / ROCKETS). Re-run whenever the game's data changes.

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── Load data.js + world.js into a sandbox and expose their globals ──
const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('data.js') + '\n;this.POKEMON_DATA = POKEMON_DATA;', ctx);
vm.runInContext(read('world.js').replace('const WORLD', 'var WORLD') + '\n;this.WORLD = WORLD;', ctx);
const POKEMON_DATA = ctx.POKEMON_DATA, WORLD = ctx.WORLD;

// ── Pull the data tables out of game.js ──
const g = read('game.js');
const grabArr = n => vm.runInContext(g.match(new RegExp('const ' + n + '\\s*=\\s*(\\[[\\s\\S]*?\\n\\]);'))[1], ctx);
const grabObj = n => vm.runInContext('(' + g.match(new RegExp('const ' + n + '\\s*=\\s*(\\{[\\s\\S]*?\\n\\});'))[1] + ')', ctx);
const STONES = grabObj('STONES'), STONE_EVOS = grabArr('STONE_EVOS'), EVOS = grabArr('EVOS'),
      STONE_FINDS = grabArr('STONE_FINDS'), COLLECTIBLES = grabArr('COLLECTIBLES'),
      BARRIERS = grabObj('BARRIERS'), ROCKETS = grabArr('ROCKETS');

const byId = new Map(POKEMON_DATA.map(p => [p.id, p]));
const zname = id => { const z = WORLD.zones.find(z => z.id === id); return z ? (z.icon || '') + ' ' + z.name : ('zone ' + id); };
const nm = id => (byId.get(id) || { name: '#' + id }).name;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tcol = { Normal: '#9a9a6a', Fire: '#e07028', Water: '#5878d0', Electric: '#d8b020', Grass: '#5aa040', Ice: '#68b8c8', Fighting: '#b03028', Poison: '#9040a0', Ground: '#c0a040', Flying: '#8878d8', Psychic: '#e05080', Bug: '#8a9820', Rock: '#a09038', Ghost: '#6048a0', Dragon: '#6038d8', Fairy: '#e090a8' };

function obtain(p) {
  if (p.legend) return { tag: 'Legendary', detail: 'Special encounter (see Bosses)' };
  if (p.zones && p.zones.length) return { tag: 'Wild', detail: p.zones.map(zname).join(', ') };
  const s = STONE_EVOS.find(r => r.to === p.id);
  if (s) return { tag: 'Evolve', detail: `${nm(s.from)} + ${STONES[s.stone].emoji} ${STONES[s.stone].name}` };
  const e = EVOS.find(r => r.to === p.id);
  if (e) {
    if (e.method === 'buddy') return { tag: 'Evolve', detail: `${nm(e.from)} — 🐾 walk ${e.cost} steps as buddy` };
    if (e.method === 'battle') return { tag: 'Evolve', detail: `${nm(e.from)} — 🥊 use in ${e.cost} battle${e.cost > 1 ? 's' : ''}` };
    if (e.method === 'dance') return { tag: 'Evolve', detail: `${nm(e.from)} — 🪩 Dance Party (multiplayer)` };
  }
  return { tag: 'Special', detail: '—' };
}
function evoOut(id) {
  const out = [];
  STONE_EVOS.filter(r => r.from === id).forEach(r => out.push(`${STONES[r.stone].emoji}→${nm(r.to)}`));
  EVOS.filter(r => r.from === id).forEach(r => { const m = r.method === 'buddy' ? '🐾' : r.method === 'battle' ? '🥊' : '🪩'; out.push(`${m}→${nm(r.to)}`); });
  return out.join(' · ');
}

const dexRows = POKEMON_DATA.slice().sort((a, b) => a.id - b.id).map(p => {
  const o = obtain(p), t = tcol[p.type] || '#555';
  return `<tr id="p${p.id}"><td class="num">#${String(p.id).padStart(3, '0')}</td>` +
    `<td><img loading="lazy" src="sprites/${String(p.id).padStart(3, '0')}.png" width="40" height="40"></td>` +
    `<td class="nm">${esc(p.name)}</td><td><span class="type" style="background:${t}">${p.type}</span></td>` +
    `<td><span class="how ${o.tag.toLowerCase()}">${o.tag}</span> ${esc(o.detail)}</td><td class="evo">${evoOut(p.id) || '—'}</td></tr>`;
}).join('\n');

const exitsFrom = z => WORLD.exits.filter(e => e.from === z);
const areaCards = WORLD.zones.filter(z => !z.interior).map(z => {
  const wild = POKEMON_DATA.filter(p => !p.legend && !p.boss && p.zones && p.zones.includes(z.id)).sort((a, b) => a.id - b.id);
  const conns = exitsFrom(z.id).map(e => `${e.dir} → ${zname(e.to)}${e.barrier ? ` <span class="bar">(${BARRIERS[e.barrier] ? BARRIERS[e.barrier].sign : ''} ${e.barrier})</span>` : ''}`);
  const badges = COLLECTIBLES.filter(c => c.zone === z.id).map(c => `${c.emoji} ${c.name}`);
  const stones = STONE_FINDS.filter(s => s.zone === z.id).map(s => `${STONES[s.stone].emoji} ${STONES[s.stone].name}`);
  const rk = ROCKETS.filter(r => r.zone === z.id).map(r => `🚀 ${r.name} (guards ${nm(r.bird)})`);
  return `<div class="card"><h3>${z.icon || ''} ${esc(z.name)}</h3>` +
    (conns.length ? `<p><b>Exits:</b> ${conns.join(' · ')}</p>` : '') +
    (badges.length ? `<p><b>Badge:</b> ${badges.join(', ')}</p>` : '') +
    (stones.length ? `<p><b>Stone:</b> ${stones.join(', ')}</p>` : '') +
    (rk.length ? `<p><b>Team Rocket:</b> ${rk.join(', ')}</p>` : '') +
    `<p><b>Wild (${wild.length}):</b> ${wild.map(p => `<a href="#p${p.id}">${esc(p.name)}</a>`).join(', ') || '—'}</p></div>`;
}).join('\n');

const stoneCards = Object.entries(STONES).map(([k, s]) => {
  const find = STONE_FINDS.find(f => f.stone === k);
  const evos = STONE_EVOS.filter(r => r.stone === k).map(r => `${nm(r.from)} → ${nm(r.to)}`);
  return `<div class="card"><h3>${s.emoji} ${s.name}</h3><p><b>Found in:</b> ${find ? zname(find.zone) : '—'}</p><p><b>Evolves:</b> ${evos.join(' · ')}</p></div>`;
}).join('\n');
const badgeRows = COLLECTIBLES.map(c => `<tr><td>${c.emoji}</td><td>${esc(c.name)}</td><td>${c.auto ? 'Earned automatically' : 'Hidden in ' + zname(c.zone)}</td><td>${esc(c.hint || '')}</td></tr>`).join('\n');
const barrierRows = Object.entries(BARRIERS).map(([k, b]) => `<tr><td>${b.sign} ${k}</td><td><b>${b.needsType}</b></td><td>${esc(b.hint)}</td></tr>`).join('\n');
const total = POKEMON_DATA.length, wildCount = POKEMON_DATA.filter(p => !p.legend && !p.boss && p.zones && p.zones.length).length, evoCount = STONE_EVOS.length + EVOS.length;

const h = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lukéymon — Walkthrough &amp; Guide</title><style>
:root{--bg:#10121c;--panel:#1a1d2e;--ink:#e8e8f4;--dim:#9aa0c0;--acc:#8fd0ff;--line:#2a2e44}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,Segoe UI,Roboto,sans-serif}
header{background:#141726;padding:24px 18px;border-bottom:3px solid #3a4068;text-align:center}
h1{margin:0;font-size:26px;letter-spacing:1px}.sub{color:var(--dim);margin-top:6px}
.stat{display:inline-block;margin:8px 6px 0;background:#23284a;border:1px solid var(--line);border-radius:20px;padding:4px 12px;font-size:12px}
nav{position:sticky;top:0;z-index:10;background:#0c0e18ee;backdrop-filter:blur(4px);border-bottom:1px solid var(--line);padding:8px;display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
nav a{color:var(--acc);text-decoration:none;font-size:12px;padding:4px 10px;border:1px solid var(--line);border-radius:14px}nav a:hover{background:#23284a}
main{max-width:1040px;margin:0 auto;padding:18px}section{margin:28px 0;scroll-margin-top:54px}
h2{font-size:20px;border-left:4px solid var(--acc);padding-left:10px;margin:0 0 12px}h3{margin:0 0 8px;font-size:15px;color:#fff}p{margin:5px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}.card a{color:var(--acc);text-decoration:none}.card a:hover{text-decoration:underline}
.bar{color:#e0a060}table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:10px;overflow:hidden}
th,td{padding:7px 9px;text-align:left;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}th{background:#23284a;position:sticky;top:46px;font-size:12px}
img{image-rendering:pixelated;vertical-align:middle}.num{color:var(--dim);font-variant-numeric:tabular-nums}.nm{font-weight:600}
.type{color:#fff;font-size:11px;padding:2px 7px;border-radius:10px;white-space:nowrap}
.how{font-size:11px;padding:1px 6px;border-radius:8px;color:#10121c;font-weight:700}.how.wild{background:#5aa040}.how.evolve{background:#d8b020}.how.legendary{background:#a060e0;color:#fff}.how.special{background:#888}
.evo{color:var(--dim);font-size:12px}.note{background:#1d2440;border:1px solid #34406a;border-radius:8px;padding:10px 12px;color:#cdd6ff}
.tag{display:inline-block;background:#23284a;border-radius:6px;padding:1px 6px;margin:0 2px;font-size:12px}footer{color:var(--dim);text-align:center;padding:24px;font-size:12px}
</style></head><body>
<header><h1>Lukéymon — Walkthrough &amp; Guide</h1><div class="sub">Catch 'em with kindness! A living guide — grows as the game does.</div>
<div><span class="stat">📕 ${total} Lukéymon</span><span class="stat">🌿 ${wildCount} wild-catchable</span><span class="stat">✨ ${evoCount} evolutions</span><span class="stat">🗺️ ${WORLD.zones.filter(z => !z.interior).length} areas</span><span class="stat">🏅 ${COLLECTIBLES.length} badges</span></div></header>
<nav><a href="#start">Getting Started</a><a href="#areas">Areas</a><a href="#evolution">Evolution</a><a href="#stones">Stones</a><a href="#badges">Badges</a><a href="#barriers">Barriers</a><a href="#bosses">Bosses</a><a href="#mp">Multiplayer</a><a href="#dex">Pokédex</a></nav>
<main>
<section id="start"><h2>Getting Started</h2><div class="note">There are no HP bars and nothing faints — you win Lukéymon over with <b>kindness</b>.</div><div class="grid">
<div class="card"><h3>🤝 Befriending</h3><p>Walk into wild Lukéymon in tall grass. Each wants one action — <b>🍎 Feed</b>, <b>🤚 Pet</b>, or <b>⚽ Play</b>. Give what it wants, then throw a <span class="tag">PokéBall</span> while it's happy.</p></div>
<div class="card"><h3>🎒 Supplies</h3><p>Find PokéBalls &amp; coins in tall grass, buy more at the 🏪 Poké Mart, or rest at the 🏥 Hospital for a free daily bundle.</p></div>
<div class="card"><h3>🐾 Your Buddy</h3><p>Set a buddy from its Pokédex page. Its <b>type clears barriers</b>, lets you surf &amp; light caves — and walking with it can <b>evolve</b> it.</p></div>
<div class="card"><h3>🏆 Winning</h3><p>Earn the <b>4 land badges</b> to become Champion. Catching all ${total} is the optional master goal.</p></div></div></section>
<section id="areas"><h2>Areas of the Island</h2><div class="grid">${areaCards}</div></section>
<section id="evolution"><h2>Evolution — four ways</h2><div class="grid">
<div class="card"><h3>🪨 Stones</h3><p>Reusable — find one of each hidden in the world, then use it from a Lukéymon's Pokédex page.</p></div>
<div class="card"><h3>🐾 Buddy Walk</h3><p>Walk with it as your buddy — <b>15 steps</b> for most, <b>25</b> for a final form.</p></div>
<div class="card"><h3>🥊 Battle</h3><p><b>Send it out in a battle</b> (win or lose) — 1 time for most, 2 for a final. Train at the <b>Battle Dojo</b> or fight wandering trainers.</p></div>
<div class="card"><h3>🪩 Dance Party</h3><p>A few evolve by meeting another trainer in <a href="#mp">multiplayer</a> — no trade, nothing lost.</p></div></div>
<p class="note">Evolved forms aren't found in the wild — catch the base form and evolve it. Your base stays in your dex too, so Eevee can become every Eeveelution.</p></section>
<section id="stones"><h2>Evolution Stones</h2><div class="grid">${stoneCards}</div></section>
<section id="badges"><h2>Badges</h2><table><thead><tr><th></th><th>Badge</th><th>How to get</th><th>Note</th></tr></thead><tbody>${badgeRows}</tbody></table></section>
<section id="barriers"><h2>Barriers &amp; Traversal</h2><p>Make a Lukéymon of the right <b>type</b> your buddy, then walk into the barrier to clear it. A 💧 Water buddy <b>surfs</b>; a 🔥 Fire buddy (or Pikachu) <b>lights caves</b> and the night.</p>
<table><thead><tr><th>Barrier</th><th>Needs buddy type</th><th>Hint</th></tr></thead><tbody>${barrierRows}</tbody></table></section>
<section id="bosses"><h2>Bosses &amp; Legendaries</h2><div class="grid">
<div class="card"><h3>🚀 Team Rocket</h3><p>Grunts guard each legendary bird — beat the grunt, then face the bird.</p><ul>${ROCKETS.map(r => `<li><b>${esc(r.name)}</b> — ${zname(r.zone)} — guards <a href="#p${r.bird}">${nm(r.bird)}</a></li>`).join('')}</ul></div>
<div class="card"><h3>🦅 Legendary Birds</h3><p>Articuno, Zapdos, Moltres — counter what they hurl with a super-effective type (3 rounds), then a PokéBall. All three = Trio Badge.</p></div>
<div class="card"><h3>🥋 Gym Leader Rocky</h3><p>In the City Gym — a 3-round type-duel for the <b>Rumble Badge</b> + bundle.</p></div>
<div class="card"><h3>🔮 Mew &amp; Mewtwo</h3><p>Roaming late-game legendaries. Mewtwo needs an exact-type match (3 rounds) then a Master Ball.</p></div></div></section>
<section id="mp"><h2>Multiplayer</h2><div class="grid">
<div class="card"><h3>⚔️ Friendly Duel</h3><p>Meet another trainer on the same network and pick <b>Battle</b> — a best-of-3 secret type-duel. Nobody loses anything.</p></div>
<div class="card"><h3>🪩 Dance Party</h3><p>Pick <b>Dance Party</b> — both trainers' dance Lukéymon (Kadabra, Machoke, Graveler, Haunter) evolve together. No trade, nothing lost.</p></div></div></section>
<section id="dex"><h2>Pokédex — all ${total}</h2><p class="sub">How to obtain each, and what it evolves into.</p>
<table><thead><tr><th>#</th><th></th><th>Name</th><th>Type</th><th>How to get</th><th>Evolves</th></tr></thead><tbody>${dexRows}</tbody></table></section>
</main><footer>Lukéymon — auto-generated guide · regenerate with <code>node tools/gen-walkthrough.js</code>.</footer></body></html>`;

fs.writeFileSync(path.join(ROOT, 'walkthrough.html'), h);
console.log('walkthrough.html written:', (h.length / 1024 | 0) + 'KB | dex', total, '| areas', WORLD.zones.filter(z => !z.interior).length, '| evolutions', evoCount);
