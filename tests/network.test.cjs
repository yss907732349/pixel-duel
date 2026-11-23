'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createDuelServer } = require('../server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, options = {}) {
  const app = createDuelServer(options);
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.close());
  async function connect() {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
    const history = [], waiters = [];
    ws.on('message', raw => {
      const message = JSON.parse(raw);
      history.push(message);
      for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiters.splice(waiters.indexOf(waiter), 1); clearTimeout(waiter.timeout); waiter.resolve(message); }
    });
    await once(ws, 'open');
    return { ws, history,
      send: message => ws.send(JSON.stringify(message)),
      next: predicate => new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timeout: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('Timed out waiting for network message')); }, 2500) };
        waiters.push(waiter);
      })
    };
  }
  async function pair() {
    const a = await connect(), b = await connect();
    const joined = a.next(m => m.type === 'joined'); a.send({ type: 'create', password: 'sword123' });
    const seatA = await joined;
    const second = b.next(m => m.type === 'joined'); b.send({ type: 'join', code: seatA.code, password: 'sword123' });
    const seatB = await second;
    return { a, b, code: seatA.code, seatA, seatB };
  }
  async function start(a, b) {
    const playing = a.next(m => m.type === 'state' && m.phase === 'playing');
    a.send({ type: 'ready' }); b.send({ type: 'ready' }); return playing;
  }
  return { ...app, base, connect, pair, start };
}

test('room creation, password checking, seat limit and no credential leaks', async t => {
  const f = await fixture(t);
  const a = await f.connect(), b = await f.connect(), c = await f.connect();
  let response = a.next(m => m.type === 'error'); a.send({ type: 'create', password: '123' }); assert.match((await response).message, /4～32/);
  response = a.next(m => m.type === 'joined'); a.send({ type: 'create', password: 'secret123' }); const joined = await response;
  assert.match(joined.code, /^\d{6}$/); assert.equal(joined.playerId, 0);
  response = b.next(m => m.type === 'error'); b.send({ type: 'join', code: joined.code, password: 'wrong123' }); assert.match((await response).message, /密码/);
  response = b.next(m => m.type === 'joined'); b.send({ type: 'join', code: joined.code, password: 'secret123' }); assert.equal((await response).playerId, 1);
  response = c.next(m => m.type === 'error'); c.send({ type: 'join', code: joined.code, password: 'secret123' }); assert.match((await response).message, /两位/);
  const publicState = JSON.stringify(a.history.filter(m => m.type === 'state'));
  assert.ok(!publicState.includes('secret123')); assert.ok(!publicState.includes('token')); assert.ok(!publicState.includes('hash')); assert.ok(!publicState.includes('salt'));
});

test('both players ready, server-authoritative seat, movement sync and input validation', async t => {
  const f = await fixture(t), { a, b, code } = await f.pair();
  assert.equal((await f.start(a, b)).round, 1);
  const synced = b.next(m => m.type === 'state' && m.match.players[0].x === 6);
  a.send({ type: 'input', action: 'move', direction: { x: 1, y: 0 }, playerId: 1, hp: 0 });
  const state = await synced;
  assert.equal(state.match.players[1].x, 11); assert.equal(state.match.players[1].hp, 200);
  assert.equal(f.rooms.get(code).match.players[0].x, 6);
  const invalid = a.next(m => m.type === 'error'); a.send({ type: 'input', action: 'move', direction: { x: 100, y: 0 } }); assert.match((await invalid).message, /无效/);
  assert.equal(f.rooms.get(code).match.players[0].x, 6);
  const malformed = a.next(m => m.type === 'error'); a.ws.send('{'); assert.match((await malformed).message, /格式/);
});

test('held movement expires without renewal and pause requires both players to resume', async t => {
  const f = await fixture(t), { a, b, code } = await f.pair(); await f.start(a, b);
  a.send({ type: 'move', direction: { x: 0, y: -1 } });
  await sleep(600); const stoppedY = f.rooms.get(code).match.players[0].y;
  await sleep(260); assert.equal(f.rooms.get(code).match.players[0].y, stoppedY);
  const paused = b.next(m => m.type === 'state' && m.phase === 'paused'); a.send({ type: 'pause' }); await paused;
  const time = f.rooms.get(code).match.time; await sleep(50); assert.equal(f.rooms.get(code).match.time, time);
  const ready = a.next(m => m.type === 'state' && m.players[0].ready); a.send({ type: 'ready' }); await ready;
  assert.equal(f.rooms.get(code).phase, 'paused');
  const resumed = a.next(m => m.type === 'state' && m.phase === 'playing'); b.send({ type: 'ready' }); assert.equal((await resumed).round, 1);
});

test('disconnect pauses simulation, token resumes reserved seat, explicit leave resets', async t => {
  const f = await fixture(t), { a, b, code, seatA } = await f.pair(); await f.start(a, b);
  const disconnected = b.next(m => m.type === 'state' && m.phase === 'disconnected'); a.ws.terminate(); await disconnected;
  assert.equal(f.rooms.get(code).match.paused, true);
  const replacement = await f.connect(), joined = replacement.next(m => m.type === 'joined');
  replacement.send({ type: 'resume', code, token: seatA.token }); assert.equal((await joined).playerId, 0);
  assert.equal(f.rooms.get(code).phase, 'paused');
  const waiting = b.next(m => m.type === 'state' && m.phase === 'waiting'); replacement.send({ type: 'leave' }); await waiting;
  assert.equal(f.rooms.get(code).slots[0], null); assert.equal(f.rooms.get(code).match.time, 0);
  const newcomer = await f.connect(), newSeat = newcomer.next(m => m.type === 'joined'); newcomer.send({ type: 'join', code, password: 'sword123' }); assert.equal((await newSeat).playerId, 0);
});

test('expired disconnect releases seat and rejects stale reconnect tokens', async t => {
  const f = await fixture(t, { reconnectMs: 60 }), { a, b, code, seatA } = await f.pair();
  const waiting = b.next(m => m.type === 'state' && m.phase === 'waiting'); a.ws.terminate(); await waiting;
  assert.equal(f.rooms.get(code).slots[0], null);
  const reconnect = await f.connect(), failed = reconnect.next(m => m.type === 'error');
  reconnect.send({ type: 'resume', code, token: seatA.token }); assert.match((await failed).message, /失效/);
});

test('valid token takes over an active socket during refresh without losing the match or detaching the new seat', async t => {
  const f = await fixture(t), { a, b, code, seatA } = await f.pair(); await f.start(a, b);
  const room = f.rooms.get(code);
  room.match.players[1].hp = 153;
  const invalid = await f.connect(), rejected = invalid.next(m => m.type === 'error');
  invalid.send({ type: 'resume', code, token: '0'.repeat(48) });
  assert.match((await rejected).message, /失效/); assert.equal(a.ws.readyState, WebSocket.OPEN);
  const replacement = await f.connect();
  const oldNotice = a.next(m => m.type === 'closed'), oldClosed = once(a.ws, 'close');
  const restored = replacement.next(m => m.type === 'joined');
  const pausedA = replacement.next(m => m.type === 'state' && m.phase === 'paused');
  const pausedB = b.next(m => m.type === 'state' && m.phase === 'paused');
  a.send({ type: 'move', direction: { x: 0, y: -1 } });
  replacement.send({ type: 'resume', code, token: seatA.token });
  assert.equal((await restored).playerId, 0);
  assert.match((await oldNotice).message, /新页面/);
  for (const state of await Promise.all([pausedA, pausedB])) {
    assert.equal(state.round, 1); assert.equal(state.match.players[1].hp, 153);
    assert.equal(state.match.paused, true); assert.ok(state.players.every(p => p.connected && !p.ready));
  }
  await oldClosed;
  assert.equal(room.phase, 'paused'); assert.ok(room.slots[0].ws); assert.ok(room.slots.every(p => p.move === null && !p.ready));
  const frozenTime = room.match.time; await sleep(50); assert.equal(room.match.time, frozenTime);
  const resumed = await f.start(replacement, b); assert.equal(resumed.round, 1); assert.equal(resumed.match.players[1].hp, 153);
  await sleep(250); // Preserve the pre-refresh movement cooldown as part of the same round.
  const beforeX = room.match.players[0].x;
  const moved = b.next(m => m.type === 'state' && m.match.players[0].x === beforeX + 1);
  replacement.send({ type: 'input', action: 'move', direction: { x: 1, y: 0 } }); await moved;
});

test('server resolves damage and broadcasts both first and second round endings', async t => {
  const f = await fixture(t), { a, b, code } = await f.pair();
  const first = await f.start(a, b); assert.equal(first.match.paused, false); assert.equal(first.match.winner, null);
  for (const round of [1, 2]) {
    const room = f.rooms.get(code);
    Object.assign(room.match.players[0], { x: 5, y: 5, facing: { x: 1, y: 0 } });
    Object.assign(room.match.players[1], { x: 6, y: 5, hp: 1 });
    const endA = a.next(m => m.type === 'state' && m.phase === 'ended' && m.round === round);
    const endB = b.next(m => m.type === 'state' && m.phase === 'ended' && m.round === round);
    a.send({ type: 'input', action: 'basic' });
    for (const state of await Promise.all([endA, endB])) {
      assert.equal(state.match.players[1].hp, 0); assert.equal(state.match.winner, 0); assert.equal(state.match.paused, false);
    }
    if (round === 1) {
      const second = await f.start(a, b);
      assert.equal(second.round, 2); assert.equal(second.match.time, 0); assert.equal(second.match.winner, null);
      assert.equal(second.match.players[1].hp, 200); assert.equal(second.match.paused, false);
    }
  }
});

test('HTTP exposes only public assets and health; foreign WebSocket origins are blocked', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.base + '/health')).status, 200);
  assert.equal((await fetch(f.base + '/')).status, 200);
  for (const name of ['/server.cjs', '/server/rooms.cjs', '/package.json', '/.env', '/tests/network.test.cjs']) assert.equal((await fetch(f.base + name)).status, 404);
  const denied = new WebSocket(f.base.replace('http:', 'ws:') + '/ws', { origin: 'https://untrusted.example' });
  const failure = await new Promise(resolve => denied.once('error', resolve)); assert.match(failure.message, /403/);
});

test('explicit GitHub origin is permitted without opening all cross-origin connections', async t => {
  const f = await fixture(t, { allowedOrigins: 'https://example.github.io' });
  const ws = new WebSocket(f.base.replace('http:', 'ws:') + '/ws', { origin: 'https://example.github.io' });
  await once(ws, 'open'); ws.close(); await once(ws, 'close');
});
