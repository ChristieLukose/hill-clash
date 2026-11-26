import { io } from 'socket.io-client';

export type Vec3State = { x: number; y: number; z: number };
export type QuaternionState = { x: number; y: number; z: number; w: number };

export type NetworkSnapshot = {
  id: string;
  name: string;
  color: string;
  slot: number;
  position: Vec3State;
  rotation: QuaternionState;
  speed: number;
  progress: number;
  sentAt?: number;
};

export type RoomPlayer = {
  id: string;
  name: string;
  color: string;
  slot: number;
  state: NetworkSnapshot | null;
};

export type OnlineRoom = {
  code: string;
  hostId: string;
  terrainType: 'mountain' | 'desert' | 'snow' | 'jungle';
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  startedAt: number | null;
  winner: { id: string; name: string; color: string } | null;
  maxPlayers: number;
  players: RoomPlayer[];
};

export type RoomAck =
  | { ok: true; playerId: string; room: OnlineRoom }
  | { ok: false; error: string };

export type VehicleNetworkState = {
  position: Vec3State;
  rotation: QuaternionState;
  speed: number;
  progress: number;
};

const serverUrl = import.meta.env.VITE_SERVER_URL?.trim() || undefined;

export const socket = io(serverUrl, {
  path: '/socket.io',
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  transports: ['websocket', 'polling'],
});

export function connectSocket() {
  if (socket.connected) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Could not reach the multiplayer server. Please try again.'));
    }, 10000);

    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Multiplayer server connection failed. Check that the server is deployed and online.'));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });
}
