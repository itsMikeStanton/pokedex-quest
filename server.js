#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────
// Lukeymon LAN party server.
//   • Serves the static game files to anyone on your Wi-Fi.
//   • Relays JSON messages between players (presence + duels).
// It contains ZERO game logic — clients are fully authoritative.
// It just stamps the sender and fans messages out to everyone else.
//
//   npm install        (once, to get the `ws` package)
//   node server.js     → open the printed http://<your-ip>:8080 on other devices
// ───────────────────────────────────────────────────────────────
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

let WebSocketServer;
try { WebSocketServer = require('ws').Server; }
catch (_) {
  console.error('\n  The "ws" package is missing. Run:  npm install\n');
  process.exit(1);
}

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.jpg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.json':'application/json', '.ico':'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── WebSocket relay ──────────────────────────────────────────────
const wss = new WebSocketServer({ server });
wss.on('connection', (sock) => {
  sock.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (m && m.from) sock._id = m.from;          // remember who this socket is
    // Fan out verbatim to everyone except the sender.
    wss.clients.forEach(c => { if (c !== sock && c.readyState === 1) c.send(raw.toString()); });
  });
  sock.on('close', () => {
    if (!sock._id) return;
    const bye = JSON.stringify({ t: 'leave', from: sock._id });
    wss.clients.forEach(c => { if (c !== sock && c.readyState === 1) c.send(bye); });
  });
});

server.listen(PORT, () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(list =>
    (list || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); }));
  console.log('\n  🎮 Lukeymon party server is up!\n');
  console.log('  On this computer:   http://localhost:' + PORT);
  ips.forEach(ip => console.log('  On the same Wi-Fi:  http://' + ip + ':' + PORT));
  console.log('\n  (Everyone opens one of those — then walk into each other to duel.)\n');
});
