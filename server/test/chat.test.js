import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

let server, io, url;
const clients = [];

const testConfig = {
  ...config,
  clientOrigins: ['http://localhost:3000'],
  allowNoOrigin: true,
  maxConnPerIp: 50,
};

const client = (username) =>
  new Promise((resolve, reject) => {
    const s = connect(url, { auth: { username }, transports: ['websocket'], forceNew: true });
    clients.push(s);
    s.once('session:ready', () => resolve(s));
    s.once('connect_error', (e) => reject(e));
  });
const once = (s, ev, ms = 1500) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms);
    s.once(ev, (d) => (clearTimeout(t), res(d)));
  });
const silent = (s, ev, ms = 400) =>
  new Promise((res, rej) => {
    const h = () => rej(new Error(`unexpected ${ev}`));
    s.once(ev, h);
    setTimeout(() => (s.off(ev, h), res()), ms);
  });
const emitAck = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));

before(async () => {
  ({ server, io } = createApp(testConfig));
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
after(async () => {
  clients.forEach((c) => c.disconnect());
  await new Promise((r) => io.close(r));
});

test('Phase 1: message is broadcast back to sender and others', async () => {
  const a = await client('alice');
  const b = await client('bob');
  const [ma, mb] = [once(a, 'message:new'), once(b, 'message:new')];
  const ack = await emitAck(a, 'message:send', { text: 'Hello world!' });
  assert.equal(ack.ok, true);
  assert.equal((await ma).text, 'Hello world!');
  assert.equal((await mb).user, 'alice');
});

test('Phase 2: usernames are validated and unique (case-insensitive)', async () => {
  await client('carol');
  await assert.rejects(client('CAROL'), /USERNAME_TAKEN/);
  await assert.rejects(client('<script>'), /INVALID_USERNAME/);
  await assert.rejects(client('x'), /INVALID_USERNAME/);
});

test('Phase 2: typing indicator reaches others but not the typist', async () => {
  const a = await client('dave');
  const b = await client('erin');
  const got = once(b, 'typing:update');
  const none = silent(a, 'typing:update');
  a.emit('typing', { isTyping: true });
  assert.deepEqual(await got, { room: 'General', user: 'dave', isTyping: true });
  await none;
});

test('Phase 3: rooms are isolated', async () => {
  const a = await client('frank');
  const b = await client('gina');
  const j = await emitAck(b, 'room:join', { room: 'Tech Support' });
  assert.equal(j.ok, true);
  const leak = silent(b, 'message:new');
  const ok = once(a, 'message:new');
  await emitAck(a, 'message:send', { text: 'general only' });
  await ok;
  await leak;
  const c = await client('hank');
  await emitAck(c, 'room:join', { room: 'Tech Support' });
  const gotTech = once(b, 'message:new');
  await emitAck(c, 'message:send', { text: 'tech only' });
  assert.equal((await gotTech).room, 'Tech Support');
});

test('Security: rejects unknown rooms and bad payloads', async () => {
  const a = await client('ivan');
  assert.equal((await emitAck(a, 'room:join', { room: '../admin' })).ok, false);
  assert.equal((await emitAck(a, 'room:join', 'General')).ok, false);
  assert.equal((await emitAck(a, 'message:send', { text: '' })).ok, false);
  assert.equal((await emitAck(a, 'message:send', { text: 'x'.repeat(501) })).ok, false);
  assert.equal((await emitAck(a, 'message:send', { text: { $ne: 1 } })).ok, false);
  assert.equal((await emitAck(a, 'message:send', null)).ok, false);
});

test('Security: client cannot spoof author or room', async () => {
  const a = await client('judy');
  const msg = once(a, 'message:new');
  await emitAck(a, 'message:send', { text: 'hi', user: 'admin', room: 'Tech Support' });
  const m = await msg;
  assert.equal(m.user, 'judy');
  assert.equal(m.room, 'General');
});

test('Security: per-socket message rate limit', async () => {
  const a = await client('kate');
  const results = [];
  for (let i = 0; i < 12; i++) results.push(await emitAck(a, 'message:send', { text: `m${i}` }));
  assert.ok(results.some((r) => r.ok === false && /too fast/.test(r.error)));
});

test('Security: disallowed Origin is refused', async () => {
  const s = connect(url, {
    auth: { username: 'mallory' },
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Origin: 'https://evil.example' },
  });
  clients.push(s);
  await once(s, 'connect_error');
});
