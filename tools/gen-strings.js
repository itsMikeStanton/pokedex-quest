// Extracts every user-facing string in the game (dialogue, labels, names,
// descriptions, messages) into an editable, searchable strings.html catalog.
// Run:  node tools/gen-strings.js
const fs = require('fs');
const game = fs.readFileSync('game.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const rows = [];
const add = (cat, label, desc, file, text) => { if (text != null && String(text).trim() !== '') rows.push({ cat, label, desc, file, text: String(text) }); };

// ── helpers ──
function block(src, anchor, open, close) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const closeRe = close === ']' ? /\n\];/ : /\n\};/;   // top-level close at column 0
  const rest = src.slice(i); const j = rest.search(closeRe);
  return j < 0 ? rest : rest.slice(0, j + 3);
}
// pull every string literal (', ", `) out of a chunk, in order
function literals(chunk) {
  const out = []; const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g; let m;
  while ((m = re.exec(chunk))) { const v = m[1] ?? m[2] ?? m[3]; out.push(v.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')); }
  return out;
}

// ── 1. Pokémon names + descriptions (data.js) ──
{
  const s = fs.readFileSync('data.js', 'utf8');
  const m = s.match(/const POKEMON_DATA\s*=\s*(\[[\s\S]*?\n\];)/);
  const P = eval(m[1].replace(/;\s*$/, ''));
  P.sort((a, b) => a.id - b.id).forEach(p => {
    add('Pokémon names', `#${String(p.id).padStart(3, '0')} name`, `The name shown for Pokémon #${p.id}`, 'data.js', p.name);
    if (p.description) add('Pokédex descriptions', `#${String(p.id).padStart(3, '0')} ${p.name}`, `Pokédex entry text for ${p.name}`, 'data.js', p.description);
  });
}

// ── 2. Area / zone names (world.js) ──
{
  const s = fs.readFileSync('world.js', 'utf8');
  const W = eval(s.replace('const WORLD', '(WORLD').replace(/;\s*$/, '') + ')');
  W.zones.forEach(z => add('Area names', `${z.icon || ''} zone ${z.id}`, `The name of area #${z.id}`, 'world.js', z.name));
}

// ── 3. Barriers (hint shown when blocked / cleared message) ──
{
  const b = block(game, 'const BARRIERS', '{', '}');
  const re = /(\w+):\s*\{([\s\S]*?)\},?\n/g; let m;
  while ((m = re.exec(b))) {
    const key = m[1], body = m[2];
    const hint = (body.match(/hint:\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/) || [])[1];
    const cleared = (body.match(/cleared:\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/) || [])[1];
    const un = s => s ? s.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"') : null;
    add('Barriers', `${key} — blocked hint`, `Shown when you hit the "${key}" barrier without the right buddy`, 'game.js', un(hint));
    add('Barriers', `${key} — cleared`, `Shown when you clear the "${key}" barrier`, 'game.js', un(cleared));
  }
}

// ── 4. Field-note tips ──
{
  const b = block(game, 'const STATIC_TIPS', '[', ']');
  const re = /title:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?text:\s*'((?:[^'\\]|\\.)*)'/g; let m;
  while ((m = re.exec(b))) {
    const title = m[1].replace(/\\'/g, "'"), text = m[2].replace(/\\'/g, "'");
    add('Field notes', `tip: ${title}`, 'A field-note tip title', 'game.js', title);
    add('Field notes', `tip text: ${title}`, `Body of the "${title}" field note`, 'game.js', text);
  }
}

// ── 5. Badge & collectible names ──
{
  const b = block(game, 'const COLLECTIBLES', '[', ']');
  const re = /id:\s*'([^']+)'[^}]*?name:\s*'([^']+)'/g; let m;
  while ((m = re.exec(b))) add('Badges', m[1], `Name of badge "${m[1]}"`, 'game.js', m[2]);
}

// ── 6. Item / stone names ──
{
  const b = block(game, 'const STONES', '{', '}');
  const re = /(\w+):\s*\{[^}]*?name:\s*'([^']+)'/g; let m;
  while ((m = re.exec(b))) add('Items (stones)', `${m[1]} stone`, 'Evolution stone name', 'game.js', m[2]);
}

// ── 7. NPC dialogue ──
{
  const b = block(game, 'const NPCS', '[', ']');
  // split into individual NPC entries on the "{ zone:" boundary
  const parts = b.split(/\n\s*\{\s*zone:/).slice(1);
  parts.forEach(part => {
    const nameM = part.match(/name:\s*'((?:[^'\\]|\\.)*)'/);
    const name = nameM ? nameM[1].replace(/\\'/g, "'") : '(npc)';
    const li = part.indexOf('lines:');
    const linesChunk = li >= 0 ? part.slice(li) : '';
    const lines = literals(linesChunk);
    lines.forEach((ln, i) => add('NPC dialogue — ' + name, `${name} line ${i + 1}`, `A line ${name} says. ($\{saveName\} = the player's name.)`, 'game.js', ln));
  });
}

// ── 8. Gameplay messages (showMessage literals) ──
{
  const re = /showMessage\(\s*('((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g; let m, n = 0;
  while ((m = re.exec(game))) {
    const v = (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    add('Gameplay messages', `message ${++n}`, 'A pop-up message shown during play', 'game.js', v);
  }
}

// ── 9. UI labels & buttons (index.html) ──
{
  const re = /<(button|span|div|p|h1)[^>]*>([^<{][^<]*)<\/\1>/g; let m;
  const skip = /^\s*$|^[0-9/]+$|^\$/;
  while ((m = re.exec(html))) {
    const txt = m[2].trim();
    if (skip.test(txt) || txt.length > 80) continue;
    add('UI labels & buttons', `${m[1]}`, 'On-screen UI text / button', 'index.html', txt);
  }
}

// ── emit strings.html ──
const data = JSON.stringify(rows);
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>📝 Lukeymon Strings</title>
<style>
 :root{--bg:#0c1422;--panel:#13203a;--line:#27406a;--ink:#dce8f8;--gold:#f8d860;}
 *{box-sizing:border-box;} body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink);}
 header{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:2px solid var(--line);padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
 h1{font-size:16px;margin:0;color:var(--gold);} .spacer{flex:1;}
 input,button,select{font:inherit;} #q{flex:1;min-width:160px;background:#0c1830;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px 10px;}
 select{background:#0c1830;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px 9px;}
 .btn{background:#2a7d4a;border:1px solid #3fae6a;color:#fff;border-radius:6px;padding:7px 12px;cursor:pointer;}
 .count{font-size:12px;color:#9fb6d4;}
 main{padding:12px;max-width:900px;margin:0 auto;}
 .sec{margin-bottom:18px;} .sec h2{font-size:13px;color:#7fc8f8;border-bottom:1px solid var(--line);padding-bottom:4px;}
 .row{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:7px 0;}
 .row .lbl{font-size:12px;color:var(--gold);} .row .desc{font-size:11px;color:#9fb6d4;margin:2px 0 5px;}
 .row .file{font-size:10px;color:#6f86a6;float:right;}
 textarea{width:100%;background:#0a1322;color:#cfe;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:13px;padding:7px;resize:vertical;min-height:38px;}
 .row.changed{border-color:var(--gold);} .row.changed textarea{background:#1a1606;}
 #out{width:100%;height:200px;background:#0a1322;color:#bcd;border:1px solid var(--line);border-radius:6px;font-family:ui-monospace,monospace;font-size:11px;padding:8px;margin-top:8px;}
 .hint{font-size:12px;color:#9fb6d4;line-height:1.5;}
</style></head><body>
<header>
 <h1>📝 Game Strings</h1>
 <input id="q" placeholder="Search text, label, or category…">
 <select id="cat"><option value="">All categories</option></select>
 <span class="count" id="count"></span>
 <span class="spacer"></span>
 <button class="btn" id="export">📋 Export my edits</button>
</header>
<main>
 <p class="hint">Every word in the game is below, grouped by what it is. <b>Edit any box</b> to change the wording — edited rows turn gold. When you're done, hit <b>Export my edits</b> and paste the result back to me (or into the listed file). <code>\${saveName}</code> is replaced by the player's name; emoji are fine.</p>
 <div id="list"></div>
 <textarea id="out" readonly placeholder="Your edits will appear here after you click Export…"></textarea>
</main>
<script>
const STRINGS = ${data};
STRINGS.forEach((s,i)=>s._i=i);
const cats=[...new Set(STRINGS.map(s=>s.cat))];
const catSel=document.getElementById('cat'); cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c+' ('+STRINGS.filter(s=>s.cat===c).length+')';catSel.appendChild(o);});
const list=document.getElementById('list'), q=document.getElementById('q'), countEl=document.getElementById('count');
const edits={};
function esc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function render(){
 const term=q.value.toLowerCase(), fc=catSel.value;
 list.innerHTML=''; let shown=0; let curCat=null, sec=null;
 STRINGS.forEach(s=>{
  if(fc&&s.cat!==fc)return;
  if(term&&!(s.text.toLowerCase().includes(term)||s.label.toLowerCase().includes(term)||s.cat.toLowerCase().includes(term)))return;
  shown++;
  if(s.cat!==curCat){curCat=s.cat;sec=document.createElement('div');sec.className='sec';sec.innerHTML='<h2>'+esc(s.cat)+'</h2>';list.appendChild(sec);}
  const row=document.createElement('div'); row.className='row'+(edits[s._i]!=null?' changed':'');
  row.innerHTML='<span class="file">'+s.file+'</span><div class="lbl">'+esc(s.label)+'</div><div class="desc">'+esc(s.desc)+'</div>';
  const ta=document.createElement('textarea'); ta.value=edits[s._i]!=null?edits[s._i]:s.text;
  ta.addEventListener('input',()=>{ if(ta.value!==s.text){edits[s._i]=ta.value;row.classList.add('changed');} else {delete edits[s._i];row.classList.remove('changed');} });
  ta.style.height=Math.max(38,18+Math.ceil(ta.value.length/60)*18)+'px';
  row.appendChild(ta); sec.appendChild(row);
 });
 countEl.textContent=shown+' / '+STRINGS.length;
}
q.oninput=render; catSel.onchange=render;
document.getElementById('export').onclick=()=>{
 const keys=Object.keys(edits);
 if(!keys.length){document.getElementById('out').value='(no edits yet — change some boxes first)';return;}
 const byFile={};
 keys.forEach(k=>{const s=STRINGS[k];(byFile[s.file]=byFile[s.file]||[]).push({label:s.label,old:s.text,new:edits[k]});});
 let t='# Lukeymon string edits — '+keys.length+' change(s)\\n';
 Object.keys(byFile).forEach(f=>{ t+='\\n## '+f+'\\n'; byFile[f].forEach(e=>{ t+='\\n['+e.label+']\\nOLD: '+JSON.stringify(e.old)+'\\nNEW: '+JSON.stringify(e.new)+'\\n'; }); });
 const o=document.getElementById('out'); o.value=t; o.scrollIntoView({behavior:'smooth'}); navigator.clipboard&&navigator.clipboard.writeText(t);
};
render();
</script></body></html>`;
fs.writeFileSync('strings.html', page);
console.log('strings.html written:', rows.length, 'strings across', new Set(rows.map(r => r.cat)).size, 'categories');
const byCat = {}; rows.forEach(r => byCat[r.cat] = (byCat[r.cat] || 0) + 1);
Object.entries(byCat).forEach(([c, n]) => console.log('  ' + n + '  ' + c));
