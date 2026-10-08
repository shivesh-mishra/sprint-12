import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { config as defaultConfig } from './config.js';
import {
  validateUsername,
  validateRoom,
  validateMessage,
  validateTyping,
} from './validation.js';
import { createSocketLimiter } from './rateLimiter.js';

export function createApp(config = defaultConfig) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet()); 
  app.use(cors({ origin: config.clientOrigins, methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '10kb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.get('/', (_req, res) => res.json({ service: 'realtime-chat', status: 'ok' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => {
    console.error('[http] error:', err.message); 
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);

  const originOk = (origin) => {
    if (!origin) return config.allowNoOrigin;
    return config.clientOrigins.includes(origin);
  };

  const io = new Server(server, {
    serveClient: false, 
    cors: { origin: config.clientOrigins, methods: ['GET', 'POST'] },
    allowRequest: (req, cb) => cb(null, originOk(req.headers.origin)),
    maxHttpBufferSize: 10_000, 
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectTimeout: 10_000,
  });

  const usernames = new Map(); 
  const connectionsPerIp = new Map();

  const clientIp = (socket) =>
    (config.trustProxy && socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()) ||
    socket.handshake.address;

  io.use((socket, next) => {
    const ip = clientIp(socket);
    if ((connectionsPerIp.get(ip) || 0) >= config.maxConnPerIp) {
      return next(new Error('TOO_MANY_CONNECTIONS'));
    }

    const result = validateUsername(socket.handshake.auth?.username);
    if (!result.ok) {
      const err = new Error('INVALID_USERNAME');
      err.data = { message: result.error };
      return next(err);
    }

    const key = result.value.toLowerCase();
    if (usernames.has(key)) {
      const err = new Error('USERNAME_TAKEN');
      err.data = { message: 'That username is already in use. Pick another.' };
      return next(err);
    }

    usernames.set(key, socket.id);
    connectionsPerIp.set(ip, (connectionsPerIp.get(ip) || 0) + 1);
    socket.data.username = result.value;
    socket.data.ip = ip;
    socket.data.room = null;
    next();
  });

  const roomUsers = async (room) => {
    const sockets = await io.in(room).fetchSockets();
    return sockets.map((s) => s.data.username).sort((a, b) => a.localeCompare(b));
  };
  const broadcastUsers = async (room) =>
    io.to(room).emit('room:users', { room, users: await roomUsers(room) });
  const system = (room, text) =>
    io.to(room).emit('system', { id: crypto.randomUUID(), room, text, ts: Date.now() });

  async function joinRoom(socket, room) {
    const previous = socket.data.room;
    if (previous === room) return;
    if (previous) {
      socket.leave(previous);
      socket
        .to(previous)
        .emit('typing:update', { room: previous, user: socket.data.username, isTyping: false });
      system(previous, `${socket.data.username} left`);
      broadcastUsers(previous);
    }
    socket.join(room);
    socket.data.room = room;
    system(room, `${socket.data.username} joined`);
    await broadcastUsers(room);
  }

  io.on('connection', (socket) => {
    const { username } = socket.data;
    const allow = createSocketLimiter();
    console.log(
      `[ws] handshake OK  user=${username} id=${socket.id} transport=${socket.conn.transport.name}`,
    );

    const release = () => {
      const key = username.toLowerCase();
      if (usernames.get(key) === socket.id) usernames.delete(key);
      const n = (connectionsPerIp.get(socket.data.ip) || 1) - 1;
      if (n <= 0) connectionsPerIp.delete(socket.data.ip);
      else connectionsPerIp.set(socket.data.ip, n);
    };
    if (socket.disconnected) return release();

    joinRoom(socket, config.defaultRoom).then(() =>
      socket.emit('session:ready', { username, rooms: config.rooms, room: config.defaultRoom }),
    );

    socket.on('room:join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!allow('room', 10, 10_000)) return reply({ ok: false, error: 'Slow down.' });
      const r = validateRoom(payload?.room);
      if (!r.ok) return reply({ ok: false, error: r.error });
      await joinRoom(socket, r.value);
      reply({ ok: true, room: r.value, users: await roomUsers(r.value) });
    });

    socket.on('message:send', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!allow('msg', 10, 10_000)) {
        return reply({ ok: false, error: 'You are sending messages too fast.' });
      }
      const m = validateMessage(payload);
      if (!m.ok) return reply({ ok: false, error: m.error });
      const room = socket.data.room;
      if (!room) return reply({ ok: false, error: 'Join a room first.' });
      io.to(room).emit('message:new', {
        id: crypto.randomUUID(),
        room,
        user: username,
        text: m.value,
        ts: Date.now(),
      });
      reply({ ok: true });
    });

    socket.on('typing', (payload) => {
      if (!allow('typing', 30, 10_000)) return;
      const t = validateTyping(payload);
      if (!t.ok || !socket.data.room) return;
      socket.to(socket.data.room).emit('typing:update', {
        room: socket.data.room,
        user: username,
        isTyping: t.value,
      });
    });

    socket.on('disconnect', (reason) => {
      const room = socket.data.room;
      release();
      if (room) {
        io.to(room).emit('typing:update', { room, user: username, isTyping: false });
        system(room, `${username} left`);
        broadcastUsers(room);
      }
      console.log(`[ws] disconnected user=${username} reason=${reason}`);
    });

    socket.on('error', (err) => console.error('[ws] socket error:', err.message));
  });

  return { app, server, io };
}
