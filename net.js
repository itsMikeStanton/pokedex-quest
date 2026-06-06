'use strict';
// ═══════════════════════════════════════════════════════════════
// LUKEYMON — LAN multiplayer (presence + friendly duels)
//   Fully client-authoritative. The server only relays JSON.
//   Loads after game.js; reads its globals; exposes window.MP.
//   On the public (static) site there's no relay, so this stays dormant
//   and single-player is completely unaffected.
// ═══════════════════════════════════════════════════════════════
(function () {
  const TILE = 32;
  const myId = 'p' + Math.random().toString(36).slice(2, 8);
  let ws = null, connected = false, tries = 0;
  const peers = new Map();      // id -> { name, zone, x, y, dir, step, buddyId, fx, fy, animTs }
  let duel = null;              // active duel (see startInvite)

  const TYPE_ICON = {
    Normal:'⭐', Fire:'🔥', Water:'💧', Electric:'⚡', Grass:'🌿', Ice:'🧊',
    Fighting:'🥊', Poison:'☠️', Ground:'🌍', Flying:'🕊️', Psychic:'🔮',
    Bug:'🐛', Rock:'🪨', Ghost:'👻', Dragon:'🐉', Fairy:'✨',
  };
  const icon = t => TYPE_ICON[t] || '❔';

  // ── Deterministic helpers (identical on every client) ──────────
  function rng(seed) {                       // mulberry32
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededFlip(seed, round) { return rng(seed + round * 101)() < 0.5; }

  // Round result, ordered as (a = initiator, b = the other). Pure function of
  // the two picks + shared seed + round ⇒ both clients agree without a referee.
  function roundResult(aType, bType, seed, round) {
    const chart = (typeof BEATEN_BY !== 'undefined') ? BEATEN_BY : {};
    const aBeats = (chart[bType] || []).includes(aType);
    const bBeats = (chart[aType] || []).includes(bType);
    if (aBeats && !bBeats) return { w: 'a', reason: 'super' };
    if (bBeats && !aBeats) return { w: 'b', reason: 'super' };
    return { w: seededFlip(seed, round) ? 'a' : 'b', reason: 'flip' };
  }

  // ── Connection ─────────────────────────────────────────────────
  function isLanHost() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  }
  function connect() {
    if (location.protocol === 'file:' || !isLanHost()) return;   // dormant on the static site
    let url;
    try { url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; }
    catch (_) { return; }
    try { ws = new WebSocket(url); } catch (_) { return; }
    ws.onopen = () => {
      connected = true; tries = 0;
      send({ t: 'hello', name: myName() });
      send(snapshot());
      updateBadge();
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } handle(m); };
    ws.onerror = () => {};
    ws.onclose = () => {
      connected = false; peers.clear(); updateBadge();
      if (duel) endDuel('Disconnected from the party.');
      if (tries++ < 4) setTimeout(connect, 4000);   // gentle reconnect on a real LAN
    };
  }
  function send(o) { if (ws && ws.readyState === 1) { o.from = myId; ws.send(JSON.stringify(o)); } }
  function myName() { return (typeof saveName !== 'undefined' && saveName) ? saveName : 'Trainer'; }

  // ── Presence ───────────────────────────────────────────────────
  function snapshot() {
    return {
      t: 'state',
      zone: (typeof currentZone !== 'undefined') ? currentZone : 0,
      x: (typeof playerX !== 'undefined') ? playerX : 0,
      y: (typeof playerY !== 'undefined') ? playerY : 0,
      dir: (typeof playerDir !== 'undefined') ? playerDir : 'down',
      step: (typeof playerStep !== 'undefined') ? playerStep : 0,
      buddyId: (typeof activePet !== 'undefined') ? activePet : null,
    };
  }
  let lastKey = '', beat = 0;
  setInterval(() => {
    if (!connected) return;
    const s = snapshot();
    const key = [s.zone, s.x, s.y, s.dir, s.buddyId].join(',');
    if (key !== lastKey || (beat++ % 16) === 0) { lastKey = key; send(s); }  // on change + slow heartbeat
  }, 130);

  function upsertPeer(id, name) {
    let p = peers.get(id);
    if (!p) { p = { name: name || 'Trainer', zone: -1, x: 0, y: 0, dir: 'down', step: 0, buddyId: null, fx: 0, fy: 0, animTs: -9999 }; peers.set(id, p); }
    if (name) p.name = name;
    return p;
  }
  function handle(m) {
    if (!m || m.from === myId) return;
    switch (m.t) {
      case 'hello':  upsertPeer(m.from, m.name); if (connected) send(snapshot()); updateBadge(); break;
      case 'state': {
        const p = upsertPeer(m.from);
        const cur = peerRender(p, now());          // keep momentum across updates
        p.fx = cur.x; p.fy = cur.y; p.animTs = now();
        if (m.x > p.x) p.dir = 'right'; else if (m.x < p.x) p.dir = 'left';
        else if (typeof m.dir === 'string') p.dir = m.dir;
        p.zone = m.zone; p.x = m.x; p.y = m.y; p.step = m.step; p.buddyId = m.buddyId;
        updateBadge();
        break;
      }
      case 'leave':
        peers.delete(m.from);
        if (duel && duel.oppId === m.from) endDuel(duel.oppName + ' wandered off.');
        updateBadge();
        break;
      case 'duel:invite':  onInvite(m); break;
      case 'duel:accept':  onAccept(m); break;
      case 'duel:decline': onDecline(m); break;
      case 'duel:pick':    onPick(m); break;
      case 'duel:bail':    if (duel && m.from === duel.oppId) endDuel(duel.oppName + ' left the duel.'); break;
    }
  }
  function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

  // ── Peer rendering (slots into the world's y-sorted sprite pass) ─
  function peerRender(p, ts) {
    const destX = p.x * TILE, destY = p.y * TILE;
    const dur = 130;
    const t = Math.min((ts - p.animTs) / dur, 1);
    if (t < 1) return { x: p.fx + (destX - p.fx) * t, y: p.fy + (destY - p.fy) * t };
    return { x: destX, y: destY };
  }
  function collectSprites(sprites, ts) {
    if (typeof currentZone === 'undefined') return;
    peers.forEach((p) => {
      if (p.zone !== currentZone) return;
      const rp = peerRender(p, ts);
      sprites.push({ y: rp.y + TILE, o: 1, draw: () => drawPeer(p, rp, ts) });
    });
  }
  function drawPeer(p, rp, ts) {
    const sx = rp.x - camX, sy = rp.y - camY;
    if (typeof drawShadow === 'function') drawShadow(sx + TILE / 2, sy + TILE - 4, 11);
    // buddy trailing, if any
    if (p.buddyId != null && typeof POKEMON_DATA !== 'undefined' && typeof canvasSprite === 'function') {
      const poke = POKEMON_DATA.find(q => q.id === p.buddyId);
      if (poke) {
        const img = canvasSprite(poke);
        if (img.complete && img.naturalWidth) {
          const h = 30, w = Math.round(h * img.naturalWidth / img.naturalHeight);
          const bx = sx + TILE / 2 + (p.dir === 'right' ? -22 : 22) - w / 2;
          const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, Math.round(bx), Math.round(sy + TILE - h + 2), w, h);
          ctx.imageSmoothingEnabled = prev;
        }
      }
    }
    // the player sprite (reuses the explorer art; falls back to a little figure)
    let drew = false;
    if (typeof drawCharField === 'function') drew = drawCharField('player', p.dir || 'down', sx + TILE / 2, sy, 38);
    if (!drew) { ctx.fillStyle = '#4aa0e0'; ctx.fillRect(sx + 9, sy + 6, 14, 22); }
    // name tag
    ctx.save();
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    const tx = sx + TILE / 2, tyy = sy - 5;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(p.name, tx, tyy);
    ctx.fillStyle = '#9fe8ff'; ctx.fillText(p.name, tx, tyy);
    ctx.restore();
  }
  function peerAt(zone, x, y) {
    for (const [id, p] of peers) if (p.zone === zone && p.x === x && p.y === y) return { id, p };
    return null;
  }

  // ── Online badge ───────────────────────────────────────────────
  function updateBadge() {
    const el = document.getElementById('mp-badge');
    if (!el) return;
    let here = 0; peers.forEach(p => { if (p.zone === (typeof currentZone !== 'undefined' ? currentZone : -1)) here++; });
    if (!connected) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = '🟢 ' + (peers.size) + (here ? ' · 👋' + here + ' here' : '');
  }

  // ── Bump → friendly duel ───────────────────────────────────────
  function maybeBump(nx, ny, ts) {
    if (!connected || duel) return false;
    if (typeof gameState !== 'undefined' && gameState !== 'world') return false;
    const hit = peerAt(currentZone, nx, ny);
    if (!hit) return false;
    startInvite(hit.id, hit.p.name);
    return true;
  }

  // ── Duel state machine ─────────────────────────────────────────
  function myTeam() {
    if (typeof POKEMON_DATA === 'undefined') return [];
    return POKEMON_DATA.filter(p => !p.legend && !p.boss && (typeof caughtIds !== 'undefined') && caughtIds.has(p.id));
  }
  function startInvite(oppId, oppName) {
    const seed = (Math.random() * 0x7fffffff) | 0;
    duel = { oppId, oppName, seed, initiator: true, round: 1, me: 0, opp: 0, myPick: null, oppPick: null, phase: 'waiting' };
    send({ t: 'duel:invite', to: oppId, seed });
    if (typeof beep === 'function') beep(660, 0.08, 0.1);
    openDuelScreen();
    renderStatus(`Challenging ${oppName}…`, '', false);
  }
  function onInvite(m) {
    if (m.to !== myId) return;
    if (duel) { send({ t: 'duel:decline', to: m.from }); return; }
    if (typeof gameState !== 'undefined' && gameState !== 'world') { send({ t: 'duel:decline', to: m.from }); return; }
    const oppName = (peers.get(m.from) || {}).name || 'A trainer';
    duel = { oppId: m.from, oppName, seed: m.seed | 0, initiator: false, round: 1, me: 0, opp: 0, myPick: null, oppPick: null, phase: 'prompt' };
    if (typeof beep === 'function') beep(740, 0.1, 0.12);
    openDuelScreen();
    renderStatus(`${oppName} wants a friendly duel!`, '', false);
    renderButtons([
      { label: '⚔️ Battle!', cls: 'green', fn: acceptDuel },
      { label: 'Not now', cls: 'red', fn: declineDuel },
    ]);
  }
  function acceptDuel() { send({ t: 'duel:accept', to: duel.oppId }); beginRounds(); }
  function declineDuel() { send({ t: 'duel:decline', to: duel.oppId }); endDuel(); }
  function onAccept(m) { if (duel && m.from === duel.oppId && duel.initiator) beginRounds(); }
  function onDecline(m) { if (duel && m.from === duel.oppId) endDuel(duel.oppName + ' isn’t up for it right now.'); }

  function beginRounds() { duel.phase = 'picking'; startRound(); }
  function startRound() {
    duel.myPick = null; duel.oppPick = null; duel.phase = 'picking';
    renderScore();
    renderStatus(`Round ${duel.round} / 3 — pick in secret!`, '', false);
    renderReveal(null, null, null);
    renderPickGrid();
  }
  function choosePick(poke) {
    if (!duel || duel.myPick) return;
    duel.myPick = { id: poke.id, type: poke.type, name: poke.name };
    send({ t: 'duel:pick', to: duel.oppId, round: duel.round, pokeId: poke.id, ptype: poke.type, pname: poke.name });
    if (typeof beep === 'function') beep(523, 0.06, 0.08);
    clearPickGrid();
    renderStatus(`Round ${duel.round} / 3 — waiting for ${duel.oppName}…`, '', false);
    maybeResolve();
  }
  function onPick(m) {
    if (!duel || m.from !== duel.oppId || m.round !== duel.round) return;
    duel.oppPick = { id: m.pokeId, type: m.ptype, name: m.pname };
    maybeResolve();
  }
  function maybeResolve() {
    if (!duel || !duel.myPick || !duel.oppPick) return;
    const aPick = duel.initiator ? duel.myPick : duel.oppPick;   // a = initiator (same order both sides)
    const bPick = duel.initiator ? duel.oppPick : duel.myPick;
    const res = roundResult(aPick.type, bPick.type, duel.seed, duel.round);
    const iWon = (duel.initiator && res.w === 'a') || (!duel.initiator && res.w === 'b');
    if (iWon) duel.me++; else duel.opp++;
    duel.phase = 'reveal';
    renderScore();
    renderReveal(duel.myPick, duel.oppPick, { iWon, res, aPick, bPick });
    if (typeof beep === 'function') { beep(iWon ? 720 : 300, 0.12, 0.16); }
    const done = duel.me === 2 || duel.opp === 2 || duel.round === 3;
    setTimeout(() => {
      if (!duel) return;
      if (done) finishMatch();
      else { duel.round++; startRound(); }
    }, 2600);
  }
  function finishMatch() {
    duel.phase = 'done';
    const iWon = duel.me > duel.opp;
    const tie  = duel.me === duel.opp;
    // Winner quietly pockets a small bundle — loser loses nothing.
    if (iWon) {
      if (typeof coins !== 'undefined') coins += 10;
      if (typeof balls !== 'undefined') balls += 2;
      if (typeof updateHud === 'function') updateHud();
      if (typeof saveGame === 'function') saveGame();
    }
    const banner = tie ? 'What a battle! 🎉 A perfect draw!'
                 : iWon ? 'What a battle! 🎉 You win — +10💰 +2 balls!'
                        : `What a battle! 🎉 ${duel.oppName} takes it — well played!`;
    renderStatus(banner, '', true);                 // true → both Pokémon dance
    renderButtons([{ label: 'GG ▶', cls: 'green', fn: () => endDuel() }]);
    if (typeof playCatchJingle === 'function') playCatchJingle();
    else if (typeof beep === 'function') { beep(660, 0.1, 0.12); setTimeout(() => beep(880, 0.16, 0.18), 130); }
  }
  function endDuel(msg) {
    const wasOpp = duel && duel.oppId;
    duel = null;
    if (typeof showScreen === 'function') showScreen('world');
    if (msg && typeof showMessage === 'function') showMessage('🤝 ' + msg);
    if (wasOpp) send({ t: 'duel:bail', to: wasOpp });
  }
  // Tell the other side if we leave mid-duel.
  window.addEventListener('beforeunload', () => { if (duel) send({ t: 'duel:bail', to: duel.oppId }); });

  // ── Duel screen DOM ────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function openDuelScreen() {
    if (typeof clearWild === 'function') clearWild();
    if (typeof showScreen === 'function') showScreen('duel');
    renderScore();
    renderReveal(null, null, null);
    renderButtons([]);
  }
  function renderScore() {
    const el = $('duel-score'); if (!el || !duel) return;
    el.textContent = `${myName()} ${duel.me} — ${duel.opp} ${duel.oppName}`;
  }
  function renderStatus(main, sub, dance) {
    const el = $('duel-prompt'); if (!el) return;
    el.textContent = main;
    el.classList.toggle('banner', !!dance);
    if (dance) {
      ['duel-me', 'duel-opp'].forEach(id => { const m = $(id); if (m) m.classList.add('dancing'); });
    }
  }
  function monCard(pick, label) {
    if (!pick) return `<div class="duel-mon-label">${label}</div><div class="duel-mon-empty">?</div>`;
    const tcolor = (typeof typeColor === 'function') ? typeColor(pick.type) : '#456';
    return `<div class="duel-mon-label">${label}</div>` +
           `<div class="duel-mon-art" data-poke="${pick.id}"></div>` +
           `<div class="duel-mon-name">${pick.name}</div>` +
           `<div class="duel-mon-type" style="background:${tcolor}">${icon(pick.type)} ${pick.type}</div>`;
  }
  function fillArt(elId, pick) {
    const host = $(elId); if (!host) return;
    const slot = host.querySelector('.duel-mon-art');
    if (!slot || !pick || typeof POKEMON_DATA === 'undefined') return;
    const poke = POKEMON_DATA.find(p => p.id === pick.id);
    if (poke && typeof pokeImg === 'function') { slot.innerHTML = ''; slot.appendChild(pokeImg(poke, 56)); }
  }
  function renderReveal(myPick, oppPick, outcome) {
    const me = $('duel-me'), opp = $('duel-opp'), v = $('duel-verdict');
    if (me) { me.className = 'duel-mon'; me.innerHTML = monCard(myPick, 'You'); fillArt('duel-me', myPick); }
    if (opp) { opp.className = 'duel-mon'; opp.innerHTML = monCard(oppPick, duel ? duel.oppName : '—'); fillArt('duel-opp', oppPick); }
    if (!v) return;
    if (!outcome) { v.textContent = ''; v.className = 'duel-verdict'; return; }
    const { iWon, res, aPick, bPick } = outcome;
    const winType = res.w === 'a' ? aPick.type : bPick.type;
    const loseType = res.w === 'a' ? bPick.type : aPick.type;
    const winnerName = iWon ? myName() : duel.oppName;
    v.className = 'duel-verdict show ' + (iWon ? 'win' : 'lose');
    v.innerHTML = res.reason === 'super'
      ? `<div class="vline">${icon(winType)} ${winType} <span class="varrow">▸</span> ${icon(loseType)} ${loseType}</div>` +
        `<div class="vtag">super effective!</div><div class="vround">Round to ${winnerName}</div>`
      : `<div class="vline">${icon(aPick.type)} ${aPick.type} <span class="vx">✕</span> ${icon(bPick.type)} ${bPick.type}</div>` +
        `<div class="vtag">even match — luck decides!</div><div class="vround">Round to ${winnerName}</div>`;
  }
  function renderPickGrid() {
    const grid = $('duel-pick'); if (!grid) return;
    grid.innerHTML = '';
    const team = myTeam();
    if (!team.length) {
      grid.innerHTML = '<div class="duel-noteam">Catch some Lukeymon first to duel!</div>';
      return;
    }
    const cards = [];
    team.forEach(poke => {
      const b = document.createElement('button');
      b.className = 'duel-pick-card';
      const tcolor = (typeof typeColor === 'function') ? typeColor(poke.type) : '#456';
      if (typeof pokeImg === 'function') b.appendChild(pokeImg(poke, 30));
      const nm = document.createElement('span'); nm.className = 'duel-pick-name'; nm.textContent = poke.name;
      const tp = document.createElement('span'); tp.className = 'duel-pick-type'; tp.style.background = tcolor; tp.textContent = poke.type;
      b.append(nm, tp);
      b.addEventListener('click', () => choosePick(poke));
      grid.appendChild(b);
      cards.push(b);
    });
    if (typeof setNav === 'function') setNav(cards, { cols: 3 });
  }
  function clearPickGrid() { const g = $('duel-pick'); if (g) g.innerHTML = ''; }
  function renderButtons(btns) {
    const host = $('duel-buttons'); if (!host) return;
    host.innerHTML = '';
    const els = [];
    btns.forEach(b => {
      const el = document.createElement('button');
      el.className = 'pixel-btn ' + (b.cls || 'green');
      el.textContent = b.label;
      el.addEventListener('click', b.fn);
      host.appendChild(el); els.push(el);
    });
    if (els.length && typeof setNav === 'function') setNav(els, { cols: els.length, onBack: () => { if (duel && duel.phase !== 'done') declineDuel(); } });
  }

  // ── Public API + init ──────────────────────────────────────────
  window.MP = {
    maybeBump,
    collectSprites,
    get active() { return connected; },
    get peerCount() { return peers.size; },
    // exposed for the headless tests
    _test: { roundResult, seededFlip, rng, peers, upsertPeer, peerAt, handle, maybeResolve,
             setDuel: d => { duel = d; }, getDuel: () => duel, finishMatch, choosePick,
             myTeam, snapshot, myId },
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('DOMContentLoaded', () => { updateBadge(); connect(); });
  }
})();
