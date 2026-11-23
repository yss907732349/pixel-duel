'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { WebSocketServer, WebSocket } = require('ws');
const { Match } = require('../js/combat.js');
const derivePassword = promisify(crypto.scrypt);

const ROOT = path.resolve(__dirname, '..');
const STATIC = new Set([
  'index.html', 'style.css', 'animation-preview.html',
  'js/combat.js', 'js/pixel-actor.js', 'js/renderer.js', 'js/screen-fx.js', 'js/app.js',
  'js/network.js', 'js/room-client.js', 'js/room.js', 'js/room-config.js', 'js/deploy-config.js',
  'vendor/phaser.min.js', 'vendor/PHASER-LICENSE.md'
]);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const ACTIONS = new Set(['move', 'basic', 'skill', 'block', 'dodge']);
function direction(value) {
  if (!value || typeof value !== 'object' || !Number.isInteger(value.x) || !Number.isInteger(value.y) || Math.abs(value.x) + Math.abs(value.y) !== 1) return null;
  return { x: value.x, y: value.y };
}
function encode(value) { return JSON.stringify(value, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? (v < 0 ? -1e9 : 1e9) : v); }
function send(ws, value) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 256 * 1024) { ws.terminate(); return; }
  ws.send(typeof value === 'string' ? value : encode(value));
}

function createDuelServer(options = {}) {
  const rooms = new Map(), peers = new Set(), limits = new Map();
  const reconnectMs = options.reconnectMs ?? 30000;
  const idleMs = options.idleMs ?? 30 * 60 * 1000;
  const maxRooms = options.maxRooms ?? 100;
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === '1';
  const allowedOrigins = new Set((options.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean));
  let closed = false;
  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid URL'); return; }
    if (pathname === '/health') {
      const data = JSON.stringify({ ok: true, service: 'pixel-duel', rooms: rooms.size });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data); return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!STATIC.has(relative)) { res.writeHead(404); res.end('Not found'); return; }
    const filename = path.join(ROOT, relative);
    fs.stat(filename, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(filename)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  function error(ws, message) { send(ws, { type: 'error', message }); }
  function roomState(room) {
    return { type: 'state', code: room.code, phase: room.phase, round: room.round,
      players: room.slots.map((p, id) => ({ id, occupied: !!p, connected: !!p?.ws, ready: !!p?.ready })), match: room.match };
  }
  function broadcast(room) {
    const data = encode(roomState(room));
    room.slots.forEach(p => { if (p?.ws) send(p.ws, data); });
  }
  function resetWaiting(room) {
    room.match.reset('duel'); room.match.paused = true; room.phase = 'waiting'; room.endingSent = false;
    room.slots.forEach(p => { if (p) { p.ready = false; p.move = null; } });
  }
  function detach(ws, explicit) {
    const room = ws.room;
    if (!room) return;
    const seat = room.slots[ws.playerId];
    ws.room = null;
    if (!seat || seat.ws !== ws) return;
    seat.ws = null; seat.move = null; seat.ready = false;
    room.updatedAt = Date.now(); room.match.paused = true;
    room.slots.forEach(p => { if (p) { p.ready = false; p.move = null; } });
    if (explicit) { room.slots[ws.playerId] = null; resetWaiting(room); }
    else { seat.expiresAt = Date.now() + reconnectMs; room.phase = 'disconnected'; }
    if (!room.slots.some(Boolean)) rooms.delete(room.code); else broadcast(room);
  }
  function joined(ws, room, id, seat) {
    seat.ws = ws; seat.expiresAt = 0; seat.ready = false; seat.move = null;
    ws.room = room; ws.playerId = id; room.updatedAt = Date.now();
    send(ws, { type: 'joined', code: room.code, playerId: id, token: seat.token }); broadcast(room);
  }
  function admission(ws) {
    let limit = limits.get(ws.ip);
    if (!limit || Date.now() - limit.at > 60000) { limit = { at: Date.now(), count: 0 }; limits.set(ws.ip, limit); }
    if (++limit.count > 12) { error(ws, '尝试过于频繁，请一分钟后重试。'); return false; }
    return true;
  }
  function passwordValid(password) { return typeof password === 'string' && password.length >= 4 && password.length <= 32; }
  function newSeat() { return { token: crypto.randomBytes(24).toString('hex'), ws: null, ready: false, move: null, moveAt: 0, expiresAt: 0 }; }
  async function message(ws, data) {
    if (closed || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    let packet;
    try { packet = JSON.parse(data.toString()); } catch { error(ws, '消息格式不正确。'); return; }
    if (!packet || Array.isArray(packet) || typeof packet !== 'object') { error(ws, '消息格式不正确。'); return; }
    if (packet.type === 'ping') { send(ws, { type: 'pong', at: Number.isFinite(packet.at) ? packet.at : 0 }); return; }
    if (packet.type === 'leave') { detach(ws, true); send(ws, { type: 'left' }); return; }
    if (['create', 'join', 'resume'].includes(packet.type)) {
      if (ws.room) { error(ws, '请先退出当前房间。'); return; }
      if (!admission(ws)) return;
      if (packet.type === 'create') {
        if (!passwordValid(packet.password)) { error(ws, '请设置 4～32 位房间密码。'); return; }
        if (rooms.size >= maxRooms) { error(ws, '房间已满，请稍后再试。'); return; }
        let code;
        do { code = crypto.randomInt(100000, 1000000).toString(); } while (rooms.has(code));
        const salt = crypto.randomBytes(16), hash = await derivePassword(packet.password, salt, 32);
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        if (rooms.size >= maxRooms) { error(ws, '房间已满，请稍后再试。'); return; }
        while (rooms.has(code)) code = crypto.randomInt(100000, 1000000).toString();
        const room = { code, salt, hash, slots: [newSeat(), null], phase: 'waiting', round: 0, match: new Match({ mode: 'duel' }), updatedAt: now };
        room.match.paused = true; rooms.set(code, room); joined(ws, room, 0, room.slots[0]); return;
      }
      const room = typeof packet.code === 'string' && /^\d{6}$/.test(packet.code) ? rooms.get(packet.code) : null;
      if (!room) { error(ws, '房间不存在或已关闭。'); return; }
      if (packet.type === 'resume') {
        if (typeof packet.token !== 'string' || !/^[a-f0-9]{48}$/.test(packet.token)) { error(ws, '重连凭证已失效，请重新加入。'); return; }
        const id = room.slots.findIndex(p => p && !p.ws && p.expiresAt > now && crypto.timingSafeEqual(Buffer.from(p.token), Buffer.from(packet.token)));
        if (id < 0) { error(ws, '重连凭证已失效，请重新加入。'); return; }
        room.phase = room.slots.every(p => p && (p.ws || p === room.slots[id])) ? (room.round ? 'paused' : 'ready') : 'waiting';
        joined(ws, room, id, room.slots[id]); return;
      }
      if (!passwordValid(packet.password)) { error(ws, '房间号或密码不正确。'); return; }
      const suppliedHash = await derivePassword(packet.password, room.salt, 32);
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      if (rooms.get(room.code) !== room) { error(ws, '房间不存在或已关闭。'); return; }
      if (!crypto.timingSafeEqual(room.hash, suppliedHash)) { error(ws, '房间号或密码不正确。'); return; }
      const id = room.slots.findIndex(p => p === null);
      if (id < 0) { error(ws, '房间已有两位玩家，暂时无法加入。'); return; }
      room.slots[id] = newSeat(); room.phase = room.slots.every(p => p?.ws || p === room.slots[id]) ? 'ready' : 'disconnected';
      joined(ws, room, id, room.slots[id]); return;
    }
    const room = ws.room, seat = room?.slots[ws.playerId];
    if (!room || !seat || seat.ws !== ws) { error(ws, '请先创建或加入房间。'); return; }
    if (packet.type === 'ready') {
      if (room.phase === 'playing') return;
      if (!room.slots.every(p => p?.ws)) { error(ws, '请等待另一位玩家进入房间。'); return; }
      seat.ready = true; room.updatedAt = now;
      if (room.slots.every(p => p.ready)) {
        if (!room.round || room.phase === 'ended' || room.match.winner !== null || room.phase === 'ready') { room.match.reset('duel'); room.round++; room.endingSent = false; }
        room.phase = 'playing'; room.match.paused = false;
        room.slots.forEach(p => { p.ready = false; p.move = null; });
      }
      broadcast(room); return;
    }
    if (packet.type === 'pause') {
      if (room.phase === 'playing') {
        room.phase = 'paused'; room.match.paused = true;
        room.slots.forEach(p => { if (p) { p.ready = false; p.move = null; } }); broadcast(room);
      }
      return;
    }
    if (packet.type === 'move') {
      const d = packet.direction === null ? null : direction(packet.direction);
      if (packet.direction !== null && !d) { error(ws, '移动方向无效。'); return; }
      seat.move = room.phase === 'playing' ? d : null; seat.moveAt = now;
      if (seat.move) { room.match.act(ws.playerId, 'move', seat.move); room.updatedAt = now; } return;
    }
    if (packet.type === 'input') {
      const d = packet.direction === undefined || packet.direction === null ? undefined : direction(packet.direction);
      if (!ACTIONS.has(packet.action) || (packet.direction != null && !d) || (packet.action === 'move' && !d)) { error(ws, '操作或方向无效。'); return; }
      if (room.phase === 'playing') { room.match.act(ws.playerId, packet.action, d); room.updatedAt = now; } return;
    }
    error(ws, '不支持的房间操作。');
  }
  server.on('upgrade', (req, socket, head) => {
    const reject = status => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); };
    if (req.url?.split('?')[0] !== '/ws') { reject('404 Not Found'); return; }
    if (req.headers.origin) {
      let sameOrigin = false;
      try { sameOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { /* reject malformed origin */ }
      if (!sameOrigin && !allowedOrigins.has(req.headers.origin)) { reject('403 Forbidden'); return; }
    }
    const forwarded = trustProxy && typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',').at(-1).trim() : '';
    const ip = net.isIP(forwarded) ? forwarded : req.socket.remoteAddress;
    if (peers.size >= 256 || [...peers].filter(p => p.ip === ip).length >= 8) { reject('429 Too Many Requests'); return; }
    wss.handleUpgrade(req, socket, head, ws => { ws.ip = ip; wss.emit('connection', ws); });
  });
  wss.on('connection', ws => {
    peers.add(ws); ws.isAlive = true; ws.rateAt = Date.now(); ws.rate = 0; ws.pending = 0; ws.chain = Promise.resolve();
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', data => {
      if (Date.now() - ws.rateAt > 1000) { ws.rateAt = Date.now(); ws.rate = 0; }
      if (++ws.rate > 160 || ws.pending >= 16) { ws.close(1008, 'Too many messages'); return; }
      ws.pending++;
      ws.chain = ws.chain.then(() => message(ws, data)).catch(() => error(ws, '操作未完成，请重试。')).finally(() => { ws.pending--; });
    });
    ws.on('error', () => {});
    ws.on('close', () => { peers.delete(ws); detach(ws, false); });
  });
  let previous = performance.now(), accumulated = 0, broadcastAt = 0;
  const ticker = setInterval(() => {
    const current = performance.now(); accumulated += Math.min(.1, (current - previous) / 1000); previous = current;
    while (accumulated >= 1 / 60) {
      accumulated -= 1 / 60;
      for (const room of rooms.values()) {
        if (room.phase !== 'playing') continue;
        room.slots.forEach((seat, id) => {
          if (seat?.move && Date.now() - seat.moveAt > 450) seat.move = null;
          if (seat?.move) room.match.act(id, 'move', seat.move);
        });
        room.match.step(1 / 60);
        if (room.match.winner !== null) { room.phase = 'ended'; room.updatedAt = Date.now(); room.slots.forEach(p => { if (p) { p.ready = false; p.move = null; } }); }
      }
    }
    if (current - broadcastAt >= 1000 / 30) { broadcastAt = current; for (const room of rooms.values()) if (room.phase === 'playing') broadcast(room); }
    for (const room of rooms.values()) if (room.phase === 'ended' && !room.endingSent) { room.endingSent = true; broadcast(room); }
  }, 8);
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      let changed = false;
      room.slots.forEach((seat, id) => { if (seat && !seat.ws && seat.expiresAt <= now) { room.slots[id] = null; changed = true; } });
      if (!room.slots.some(Boolean) || now - room.updatedAt > idleMs) {
        rooms.delete(room.code);
        room.slots.forEach(p => { if (p?.ws) { p.ws.room = null; send(p.ws, { type: 'closed', message: '房间已关闭，请重新创建。' }); } });
      } else if (changed) { resetWaiting(room); broadcast(room); }
    }
    for (const [ip, limit] of limits) if (now - limit.at > 60000) limits.delete(ip);
  }, Math.min(1000, reconnectMs));
  const heartbeat = setInterval(() => {
    for (const ws of peers) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 10000);
  ticker.unref(); cleanup.unref(); heartbeat.unref();
  async function close() {
    if (closed) return;
    closed = true; clearInterval(ticker); clearInterval(cleanup); clearInterval(heartbeat);
    for (const ws of peers) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
  return { server, close, rooms };
}
module.exports = { createDuelServer };
