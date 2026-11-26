import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] },
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS = 8;
const TERRAIN_TYPES = new Set(['mountain', 'desert', 'snow', 'jungle']);
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYER_COLORS = [
  '#ffb52e',
  '#42c7ff',
  '#ef6a83',
  '#9b83ff',
  '#63d69b',
  '#ff874d',
  '#e9d95b',
  '#62b5a7',
];
const rooms = new Map();

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'hill-clash-multiplayer', rooms: rooms.size });
});
app.use(express.static(path.join(rootDir, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'dist', 'index.html'), (error) => {
    if (error) res.status(404).send('Hill Clash frontend is not built yet.');
  });
});

function cleanName(value) {
  const name = String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return name || 'CLIMBER';
}

function cleanTerrainType(value) {
  return TERRAIN_TYPES.has(value) ? value : 'mountain';
}

function makeRoomCode() {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    terrainType: room.terrainType,
    status: room.status,
    startedAt: room.startedAt,
    winner: room.winner,
    maxPlayers: MAX_PLAYERS,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      slot: player.slot,
      state: player.state,
    })),
  };
}

function publishRoom(room) {
  io.to(room.code).emit('room:update', roomSnapshot(room));
}

function sendAck(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

function playerForSocket(socket) {
  const code = socket.data.roomCode;
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const player = room.players.get(socket.id);
  return player ? { room, player } : null;
}

function removePlayer(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(code);

  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }
  publishRoom(room);
}

function finishRace(room, player) {
  if (room.status !== 'racing') return;
  room.status = 'finished';
  room.winner = { id: player.id, name: player.name, color: player.color };
  io.to(room.code).emit('race:finished', {
    winner: room.winner,
    room: roomSnapshot(room),
  });
  publishRoom(room);
}

function safeVector3(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null;
  return {
    x: Math.max(-120, Math.min(120, value.x)),
    y: Math.max(-40, Math.min(100, value.y)),
    z: Math.max(-280, Math.min(30, value.z)),
  };
}

function safeQuaternion(value) {
  if (!value || !['x', 'y', 'z', 'w'].every((key) => Number.isFinite(value[key]))) return null;
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

io.on('connection', (socket) => {
  socket.emit('server:ready', { connected: true });

  socket.on('room:create', (payload = {}, ack) => {
    removePlayer(socket);
    const code = makeRoomCode();
    const player = {
      id: socket.id,
      name: cleanName(payload.name),
      color: PLAYER_COLORS[0],
      slot: 0,
      state: null,
      lastStateAt: 0,
    };
    const room = {
      code,
      hostId: socket.id,
      terrainType: cleanTerrainType(payload.terrainType),
      status: 'lobby',
      startedAt: null,
      winner: null,
      players: new Map([[socket.id, player]]),
    };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);
    sendAck(ack, { ok: true, playerId: socket.id, room: roomSnapshot(room) });
    publishRoom(room);
  });

  socket.on('room:join', (payload = {}, ack) => {
    removePlayer(socket);
    const code = String(payload.roomCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const room = rooms.get(code);
    if (!room) return sendAck(ack, { ok: false, error: 'Room not found. Check the code and try again.' });
    if (room.status !== 'lobby') return sendAck(ack, { ok: false, error: 'This race has already started.' });
    if (room.players.size >= MAX_PLAYERS) return sendAck(ack, { ok: false, error: 'This room is full.' });

    const slot = Array.from({ length: MAX_PLAYERS }, (_, index) => index)
      .find((candidate) => ![...room.players.values()].some((player) => player.slot === candidate));
    const player = {
      id: socket.id,
      name: cleanName(payload.name),
      color: PLAYER_COLORS[slot],
      slot,
      state: null,
      lastStateAt: 0,
    };
    room.players.set(socket.id, player);
    socket.data.roomCode = code;
    socket.join(code);
    sendAck(ack, { ok: true, playerId: socket.id, room: roomSnapshot(room) });
    publishRoom(room);
  });

  socket.on('room:start', (_payload, ack) => {
    const membership = playerForSocket(socket);
    if (!membership) return sendAck(ack, { ok: false, error: 'Join a room first.' });
    const { room, player } = membership;
    if (room.hostId !== socket.id) return sendAck(ack, { ok: false, error: 'Only the room host can start the race.' });
    if (room.players.size < 2) return sendAck(ack, { ok: false, error: 'Invite at least one other player before starting.' });
    if (room.status !== 'lobby') return sendAck(ack, { ok: false, error: 'The race is already starting.' });

    room.status = 'countdown';
    room.startedAt = Date.now() + 3500;
    publishRoom(room);
    sendAck(ack, { ok: true, room: roomSnapshot(room) });

    setTimeout(() => {
      const current = rooms.get(room.code);
      if (!current || current.status !== 'countdown') return;
      current.status = 'racing';
      publishRoom(current);
      io.to(current.code).emit('race:started', { startedAt: Date.now() });
    }, 3500);
  });

  socket.on('player:state', (payload = {}) => {
    const membership = playerForSocket(socket);
    if (!membership) return;
    const { room, player } = membership;
    if (room.status !== 'racing') return;

    const now = Date.now();
    if (now - player.lastStateAt < 40) return;
    player.lastStateAt = now;

    const position = safeVector3(payload.position);
    const rotation = safeQuaternion(payload.rotation);
    if (!position || !rotation) return;

    const snapshot = {
      id: player.id,
      name: player.name,
      color: player.color,
      slot: player.slot,
      position,
      rotation,
      speed: Number.isFinite(payload.speed) ? Math.max(-80, Math.min(80, payload.speed)) : 0,
      progress: Number.isFinite(payload.progress) ? Math.max(0, Math.min(260, payload.progress)) : Math.max(0, -position.z),
      sentAt: now,
    };
    player.state = snapshot;
    socket.to(room.code).emit('player:state', snapshot);

    if (snapshot.progress >= 240) finishRace(room, player);
  });

  socket.on('race:finish', (payload = {}) => {
    const membership = playerForSocket(socket);
    if (!membership) return;
    const progress = Number(payload.progress);
    if (!Number.isFinite(progress) || progress < 240) return;
    finishRace(membership.room, membership.player);
  });

  socket.on('room:leave', () => removePlayer(socket));
  socket.on('disconnect', () => removePlayer(socket));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Hill Clash multiplayer server listening on ${PORT}`);
});
