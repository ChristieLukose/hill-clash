import { Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import HillTerrain, { roadCenterX, roadHeight, TERRAIN_OPTIONS, TRACK_LENGTH, type TerrainType } from './HillTerrain';
import Truck3D, { setTouchControl, type VehicleHud } from './Truck3D';
import RemoteTruck from './RemoteTruck';
import {
  connectSocket,
  socket,
  type NetworkSnapshot,
  type OnlineRoom,
  type RoomAck,
  type VehicleNetworkState,
} from './network';

type Mode = 'menu' | 'solo' | 'onlineLobby' | 'onlineRace';

const EMPTY_HUD: VehicleHud = {
  speed: 0, progress: 0, gear: 'N', pitch: 0, roll: 0,
  frontLoad: 0, rearLoad: 0, frontSlip: 0, rearSlip: 0,
  wheelContacts: 0, input: '—', lateral: 0, warning: '', rpm: 900,
};

const GRID_LANES = [-2.55, -0.85, 0.85, 2.55];

function laneForSlot(slot: number) {
  return GRID_LANES[slot % GRID_LANES.length];
}

function progressForSlot(slot: number) {
  return 2 + Math.floor(slot / GRID_LANES.length) * 3.1;
}

function MenuTruck({ terrainType }: { terrainType: TerrainType }) {
  return (
    <group position={[roadCenterX(2, terrainType), roadHeight(2, terrainType) + 1.25, -2]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[2.78, 0.58, 1.42]} />
        <meshStandardMaterial color="#f5a623" roughness={0.42} metalness={0.24} />
      </mesh>
      <mesh castShadow position={[0.35, 0.77, 0]}>
        <boxGeometry args={[1.12, 0.78, 1.12]} />
        <meshStandardMaterial color="#202a34" roughness={0.34} />
      </mesh>
      <mesh position={[0.93, 0.78, 0]}>
        <boxGeometry args={[0.025, 0.46, 0.96]} />
        <meshStandardMaterial color="#94d8f4" transparent opacity={0.72} />
      </mesh>
      {[1, -1].flatMap((side) => [1.02, -1.02].map((x) => (
        <group key={`${side}-${x}`} position={[x, -0.82, side * 0.78]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.43, 0.43, 0.32, 22]} />
            <meshStandardMaterial color="#171a21" roughness={0.95} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.23, 0.23, 0.33, 18]} />
            <meshStandardMaterial color="#aab0b5" metalness={0.68} roughness={0.3} />
          </mesh>
        </group>
      )))}
    </group>
  );
}

function WorldCanvas({
  mode,
  room,
  myPlayerId,
  terrainType,
  playerName,
  remoteStates,
  onHud,
  onNetworkState,
  onFinish,
}: {
  mode: Mode;
  room: OnlineRoom | null;
  myPlayerId: string | null;
  terrainType: TerrainType;
  playerName: string;
  remoteStates: Record<string, NetworkSnapshot>;
  onHud: (hud: VehicleHud) => void;
  onNetworkState: (state: VehicleNetworkState) => void;
  onFinish: () => void;
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const active = mode === 'solo' || (mode === 'onlineRace' && room?.status === 'racing');
  const localPlayer = room?.players.find((player) => player.id === myPlayerId);
  const localSlot = localPlayer?.slot ?? 0;
  const localColor = localPlayer?.color ?? '#f5a623';
  const remotePlayers = mode === 'onlineRace'
    ? (room?.players ?? []).filter((player) => player.id !== myPlayerId)
    : [];

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 7, 14], fov: 50, near: 0.1, far: 180 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#9bd9ff']} />
      <fog attach="fog" args={['#9bd9ff', 42, 135]} />
      <ambientLight intensity={0.68} />
      <hemisphereLight args={['#dff4ff', '#50623d', 0.72]} />
      <directionalLight
        position={[12, 22, 8]}
        intensity={2}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />

      <Suspense fallback={null}>
        {mode === 'menu' && <MenuTruck terrainType={terrainType} />}
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
          <HillTerrain terrainType={terrainType} />

          {mode === 'solo' && (
            <Truck3D
              player={1}
              color="#f5a623"
              laneStart={0}
              startProgress={2}
              playerName={playerName || 'YOU'}
              terrainType={terrainType}
              active
              camera={camera}
              onHud={onHud}
              onFinish={onFinish}
            />
          )}

          {mode === 'onlineRace' && localPlayer && (
            <Truck3D
              player={1}
              color={localColor}
              laneStart={laneForSlot(localSlot)}
              startProgress={progressForSlot(localSlot)}
              playerName={playerName}
              terrainType={terrainType}
              active={room?.status === 'racing'}
              camera={camera}
              onHud={onHud}
              onNetworkState={onNetworkState}
              onFinish={onFinish}
            />
          )}

          {remotePlayers.map((player) => {
            const state = remoteStates[player.id] ?? player.state;
            return state ? <RemoteTruck key={player.id} player={player} state={state} /> : null;
          })}
        </Physics>

        <Environment preset="sunset" />
        <PerspectiveCamera
          ref={camera}
          makeDefault
          position={[0, 7, 14]}
          fov={50}
          near={0.1}
          far={180}
        />
      </Suspense>
    </Canvas>
  );
}

function PlayerHud({ hud, name }: { hud: VehicleHud; name: string }) {
  const slip = Math.max(hud.frontSlip, hud.rearSlip);
  return (
    <div className="player-hud online-player-hud">
      <div className="player-label">
        <span className="player-dot orange" />
        {name.toUpperCase()} <small>YOU</small>
      </div>
      <div className="hud-main">
        <strong>{Math.round(hud.speed)}</strong><span>KM/H</span><b>{hud.gear}</b>
      </div>
      <div className="engine-rpm">
        <div><span>ENGINE RPM</span><strong>{Math.round(hud.rpm).toLocaleString('en-IN')}</strong></div>
        <div className="engine-rpm-track">
          <i style={{ width: `${Math.min(100, (hud.rpm / 6200) * 100)}%` }} />
        </div>
      </div>
      {hud.warning && <div className="player-warning">{hud.warning}</div>}
      <div className="hud-progress">
        <span>CLIMB</span><strong>{Math.floor(hud.progress)} m</strong>
        <span>PITCH</span><strong>{hud.pitch.toFixed(1)}°</strong>
        <span>ROLL</span><strong>{hud.roll.toFixed(1)}°</strong>
      </div>
      <div
        className="race-progress-track"
        role="progressbar"
        aria-label="Race progress"
        aria-valuemin={0}
        aria-valuemax={TRACK_LENGTH}
        aria-valuenow={Math.min(TRACK_LENGTH, Math.floor(hud.progress))}
      >
        <i style={{ width: `${Math.min(100, Math.max(0, (hud.progress / TRACK_LENGTH) * 100))}%` }} />
      </div>
      <div className="axle-loads">
        <span>FRONT LOAD <b>{hud.frontLoad.toFixed(1)} kN</b></span>
        <span>REAR LOAD <b>{hud.rearLoad.toFixed(1)} kN</b></span>
      </div>
      <div className="traction-track"><i style={{ width: `${Math.round(slip * 100)}%` }} /></div>
      <div className={slip > 0.16 ? 'traction-state slipping' : 'traction-state'}>
        {slip > 0.16 ? 'WHEEL SPIN' : 'TIRE GRIP'} · {hud.wheelContacts}/4 CONTACT
      </div>
    </div>
  );
}


type MapOpponent = {
  id: string;
  name: string;
  color: string;
  progress: number;
  lateral: number;
};

function trackMapPoint(progress: number, lateral: number, terrainType: TerrainType) {
  const safeProgress = THREE.MathUtils.clamp(progress, 0, TRACK_LENGTH);
  return {
    x: 50 + (roadCenterX(safeProgress, terrainType) + lateral) * 2.55,
    y: 176 - (safeProgress / TRACK_LENGTH) * 156,
  };
}

function TrackMap({
  hud,
  terrainType,
  opponents,
  localColor,
}: {
  hud: VehicleHud;
  terrainType: TerrainType;
  opponents: MapOpponent[];
  localColor: string;
}) {
  const routePoints = Array.from({ length: 49 }, (_, index) => {
    const point = trackMapPoint(index * 5, 0, terrainType);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  });
  const routePath = `M ${routePoints.join(' L ')}`;
  const localPoint = trackMapPoint(hud.progress, hud.lateral, terrainType);

  return (
    <div className="track-map-panel">
      <div className="track-map-heading">TRACK MAP <span>{Math.floor(hud.progress)} / {TRACK_LENGTH} m</span></div>
      <svg className="track-map-svg" viewBox="0 0 100 190" role="img" aria-label="Track map showing your position and opponents">
        <path d={routePath} className="track-map-outline" />
        <path d={routePath} className="track-map-route" />
        <circle cx={trackMapPoint(0,0,terrainType).x} cy={176} r="3" className="track-map-start" />
        <rect x="45" y="13" width="10" height="4" rx="1" className="track-map-finish" />
        {opponents.map((opponent) => {
          const point = trackMapPoint(opponent.progress, opponent.lateral, terrainType);
          return (
            <g key={opponent.id}>
              <circle cx={point.x} cy={point.y} r="5" fill={opponent.color} className="track-map-opponent" />
              <circle cx={point.x} cy={point.y} r="2" fill="#fff" />
            </g>
          );
        })}
        <circle cx={localPoint.x} cy={localPoint.y} r="6.1" fill={localColor} className="track-map-you" />
        <circle cx={localPoint.x} cy={localPoint.y} r="2.4" fill="#fff" />
      </svg>
      <div className="track-map-legend">
        <span><i style={{ background: localColor }} />YOU</span>
        {opponents.length > 0 && <span><i className="track-map-legend-opponent" />RIVALS</span>}
      </div>
    </div>
  );
}

function OnlineLobby({
  playerName,
  setPlayerName,
  roomCode,
  setRoomCode,
  room,
  myPlayerId,
  connectionStatus,
  error,
  busy,
  notice,
  onCreate,
  onJoin,
  onStart,
  onLeave,
  onCopy,
}: {
  playerName: string;
  setPlayerName: (value: string) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  room: OnlineRoom | null;
  myPlayerId: string | null;
  connectionStatus: string;
  error: string;
  busy: boolean;
  notice: string;
  onCreate: () => void;
  onJoin: () => void;
  onStart: () => void;
  onLeave: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="online-lobby-panel">
      <div className="online-panel-eyebrow">HILL CLASH NETWORK</div>
      <h2>ONLINE MULTIPLAYER</h2>
      <p className="online-panel-copy">Race friends from different devices. Create a room and share its code.</p>
      <div className="online-connection"><span className={connectionStatus === 'CONNECTED' ? 'connection-dot connected' : 'connection-dot'} /> SERVER {connectionStatus}</div>

      {!room ? (
        <>
          <label className="online-label">DRIVER NAME</label>
          <input
            className="online-input"
            maxLength={16}
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Enter your driver name"
          />
          <button className="primary online-action" disabled={busy || !playerName.trim()} onClick={onCreate}>
            {busy ? 'CONNECTING…' : '＋ CREATE RACE ROOM'}
          </button>
          <div className="online-or"><span /> OR JOIN A FRIEND <span /></div>
          <label className="online-label">ROOM CODE</label>
          <input
            className="online-input room-code-input"
            maxLength={6}
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="6-CHARACTER CODE"
          />
          <button className="secondary online-action" disabled={busy || !playerName.trim() || roomCode.trim().length !== 6} onClick={onJoin}>
            JOIN ROOM
          </button>
          <div className="online-error">{error}</div>
        </>
      ) : (
        <>
          <div className="room-code-card">
            <span>SHARE THIS ROOM CODE</span>
            <strong>{room.code}</strong>
            <button className="secondary" onClick={onCopy}>COPY CODE</button>
            {notice && <small>{notice}</small>}
          </div>
          <div className="room-player-heading">
            <span>DRIVERS IN ROOM</span>
            <b>{room.players.length}/{room.maxPlayers}</b>
          </div>
          <div className="room-player-list">
            {room.players.map((player) => (
              <div className="room-player-row" key={player.id}>
                <span className="room-player-color" style={{ background: player.color }} />
                <strong>{player.name}</strong>
                {player.id === room.hostId && <small>HOST</small>}
                {player.id === myPlayerId && <em>YOU</em>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, Math.min(4, room.maxPlayers - room.players.length)) }, (_, index) => (
              <div className="room-player-row waiting" key={`empty-${index}`}>WAITING FOR DRIVER…</div>
            ))}
          </div>
          {room.status === 'lobby' ? (
            room.hostId === myPlayerId ? (
              <button className="primary online-action" disabled={room.players.length < 2 || busy} onClick={onStart}>
                {room.players.length < 2 ? 'WAITING FOR A PLAYER' : 'START RACE'}
              </button>
            ) : (
              <div className="online-waiting">Waiting for the host to start the race…</div>
            )
          ) : (
            <div className="online-waiting">{room.status === 'countdown' ? 'RACE STARTING…' : 'RACE IN PROGRESS'}</div>
          )}
          <button className="secondary online-action leave-room" onClick={onLeave}>LEAVE ROOM</button>
          <div className="online-error">{error}</div>
        </>
      )}
      <div className="online-footnote">UP TO 8 DRIVERS · SEPARATE DEVICES · LIVE 3D TRUCKS</div>
    </section>
  );
}


type TouchButtonProps = {
  control: 'left' | 'right' | 'throttle' | 'reverse' | 'brake' | 'reset';
  className: string;
  label: string;
  children: ReactNode;
};

function TouchButton({ control, className, label, children }: TouchButtonProps) {
  const update = (event: ReactPointerEvent<HTMLButtonElement>, pressed: boolean) => {
    event.preventDefault();
    setTouchControl(control, pressed);
  };

  return (
    <button
      type="button"
      className={`touch-button ${className}`}
      aria-label={label}
      onPointerDown={(event) => update(event, true)}
      onPointerUp={(event) => update(event, false)}
      onPointerCancel={(event) => update(event, false)}
      onPointerLeave={(event) => update(event, false)}
      onLostPointerCapture={(event) => update(event, false)}
    >
      {children}
    </button>
  );
}

function TouchControls() {
  return (
    <div className="touch-controls" aria-label="Touchscreen driving controls">
      <div className="touch-steering">
        <TouchButton control="left" className="touch-steer" label="Steer left">◀</TouchButton>
        <TouchButton control="right" className="touch-steer" label="Steer right">▶</TouchButton>
        <TouchButton control="reset" className="touch-reset" label="Reset truck">↻</TouchButton>
      </div>
      <div className="touch-driving">
        <TouchButton control="reverse" className="touch-reverse" label="Reverse">
          <svg className="touch-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
          </svg>
        </TouchButton>
        <TouchButton control="brake" className="touch-brake" label="Brake">
          <svg className="touch-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v4" />
            <rect x="7" y="7" width="10" height="13" rx="2" />
            <path d="M10 11v5M14 11v5" />
          </svg>
        </TouchButton>
        <TouchButton control="throttle" className="touch-throttle" label="Accelerate">▲</TouchButton>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('menu');
  const [terrainType, setTerrainType] = useState<TerrainType>('mountain');
  const [hud, setHud] = useState<VehicleHud>(EMPTY_HUD);
  const [playerName, setPlayerName] = useState('CLIMBER');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState<OnlineRoom | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [remoteStates, setRemoteStates] = useState<Record<string, NetworkSnapshot>>({});
  const [connectionStatus, setConnectionStatus] = useState('OFFLINE');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const onConnect = () => setConnectionStatus('CONNECTED');
    const onDisconnect = () => setConnectionStatus('RECONNECTING');
    const onConnectError = () => setConnectionStatus('OFFLINE');
    const onRoomUpdate = (nextRoom: OnlineRoom) => {
      setRoom(nextRoom);
      setTerrainType(nextRoom.terrainType);
      setWinnerFromRoom(nextRoom);
      setRemoteStates((current) => {
        const next = { ...current };
        nextRoom.players.forEach((player) => {
          if (player.state) next[player.id] = player.state;
        });
        return next;
      });
      if (nextRoom.status === 'countdown' || nextRoom.status === 'racing' || nextRoom.status === 'finished') {
        setMode('onlineRace');
      } else {
        setMode('onlineLobby');
      }
    };
    const onPlayerState = (snapshot: NetworkSnapshot) => {
      setRemoteStates((current) => ({ ...current, [snapshot.id]: snapshot }));
    };
    const onRaceFinished = (payload: { winner: OnlineRoom['winner']; room: OnlineRoom }) => {
      setRoom(payload.room);
      setWinnerFromRoom(payload.room);
      setMode('onlineRace');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:update', onRoomUpdate);
    socket.on('player:state', onPlayerState);
    socket.on('race:finished', onRaceFinished);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:update', onRoomUpdate);
      socket.off('player:state', onPlayerState);
      socket.off('race:finished', onRaceFinished);
    };
  }, []);

  const [winnerName, setWinnerName] = useState('');
  const [soloFinished, setSoloFinished] = useState(false);

  function setWinnerFromRoom(nextRoom: OnlineRoom) {
    setWinnerName(nextRoom.winner?.name ?? '');
  }

  useEffect(() => {
    if (room?.status !== 'countdown') return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [room?.status]);

  async function enterRoom(eventName: 'room:create' | 'room:join', payload: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      await connectSocket();
      socket.emit(eventName, payload, (reply: RoomAck) => {
        setBusy(false);
        if (!reply.ok) {
          setError(reply.error);
          return;
        }
        setMyPlayerId(reply.playerId);
        setRoom(reply.room);
        setTerrainType(reply.room.terrainType);
        setWinnerName('');
        setRemoteStates({});
        setMode('onlineLobby');
      });
    } catch (connectionError) {
      setBusy(false);
      setConnectionStatus('OFFLINE');
      setError(connectionError instanceof Error ? connectionError.message : 'Could not connect to the multiplayer server.');
    }
  }

  function createRoom() {
    void enterRoom('room:create', { name: playerName, terrainType });
  }

  function joinRoom() {
    void enterRoom('room:join', { name: playerName, roomCode: roomCodeInput });
  }

  function startRace() {
    setBusy(true);
    setError('');
    socket.emit('room:start', {}, (reply: RoomAck) => {
      setBusy(false);
      if (!reply.ok) {
        setError(reply.error);
        return;
      }
      setRoom(reply.room);
      setMode('onlineRace');
    });
  }

  function leaveRoom() {
    socket.emit('room:leave');
    socket.disconnect();
    setRoom(null);
    setMyPlayerId(null);
    setRemoteStates({});
    setWinnerName('');
    setError('');
    setConnectionStatus('OFFLINE');
    setMode('menu');
  }

  function copyRoomCode() {
    if (!room) return;
    if (!navigator.clipboard?.writeText) {
      setNotice(`SHARE CODE: ${room.code}`);
      return;
    }
    void navigator.clipboard.writeText(room.code)
      .then(() => setNotice('ROOM CODE COPIED'))
      .catch(() => setNotice(`SHARE CODE: ${room.code}`));
  }

  const handleNetworkState = (state: VehicleNetworkState) => {
    socket.emit('player:state', state);
  };
  const handleFinish = () => {
    if (mode === 'onlineRace') {
      socket.emit('race:finish', { progress: TRACK_LENGTH });
    } else {
      setSoloFinished(true);
    }
  };

  const countdown = room?.startedAt
    ? Math.max(0, Math.ceil((room.startedAt - now) / 1000))
    : 3;
  const localPlayerName = room?.players.find((player) => player.id === myPlayerId)?.name ?? playerName;
  const localPlayerColor = room?.players.find((player) => player.id === myPlayerId)?.color ?? '#f5a623';
  const mapOpponents: MapOpponent[] = (room?.players ?? [])
    .filter((player) => player.id !== myPlayerId)
    .flatMap((player) => {
      const state = remoteStates[player.id] ?? player.state;
      return state ? [{
        id: player.id,
        name: player.name,
        color: player.color,
        progress: state.progress,
        lateral: state.position.x - roadCenterX(state.progress, terrainType),
      }] : [];
    });

  return (
    <main className="app-shell">
      {mode === 'menu' || mode === 'onlineLobby' ? (
        <div className={mode === 'menu' ? 'scene' : 'lobby-background'}>
          <WorldCanvas
            mode={mode}
            room={room}
            myPlayerId={myPlayerId}
            terrainType={terrainType}
            playerName={localPlayerName}
            remoteStates={remoteStates}
            onHud={setHud}
            onNetworkState={handleNetworkState}
            onFinish={handleFinish}
          />
        </div>
      ) : (
        <div className="race-stage">
          <WorldCanvas
            mode={mode}
            room={room}
            myPlayerId={myPlayerId}
            terrainType={terrainType}
            playerName={localPlayerName}
            remoteStates={remoteStates}
            onHud={setHud}
            onNetworkState={handleNetworkState}
            onFinish={handleFinish}
          />
        </div>
      )}

      <header className="topbar">
        <div className="brand-mark">HC</div>
        <div className="brand">HILL <span>CLASH</span><small>TRUCK CLIMBING ARENA</small></div>
        <div className="top-pill">● EARLY ACCESS</div>
      </header>

      {mode === 'menu' && (
        <section className="hero">
          <div className="eyebrow">⚡ GRIP IT. CLIMB IT. OWN IT.</div>
          <h1>THE HILL<br /><span>IS YOURS.</span></h1>
          <p>Master the slope. Keep your wheels gripping.<br />Race drivers from anywhere.</p>
          <div className="menu-buttons">
            <button className="primary" onClick={() => { setSoloFinished(false); setMode('solo'); }}>▶ SOLO CLIMB</button>
            <button className="secondary" onClick={() => { setError(''); setMode('onlineLobby'); }}>🌐 ONLINE MULTIPLAYER</button>
          </div>
          <div className="world-picker">
            <span className="world-picker-title">CHOOSE YOUR WORLD</span>
            <div className="world-picker-options">
              {TERRAIN_OPTIONS.map((world) => (
                <button
                  key={world.id}
                  type="button"
                  className={terrainType === world.id ? 'world-choice selected' : 'world-choice'}
                  onClick={() => setTerrainType(world.id)}
                  aria-pressed={terrainType === world.id}
                >
                  <strong>{world.id === 'mountain' ? '⛰' : world.id === 'desert' ? '☀' : world.id === 'snow' ? '❄' : '🌴'}</strong>
                  <span>{world.name}</span>
                </button>
              ))}
            </div>
            <small>{TERRAIN_OPTIONS.find((world) => world.id === terrainType)?.detail}</small>
          </div>
          <div className="feature-row">
            <span>⛰️ REAL 3D TERRAIN</span>
            <span>🛞 4-WHEEL SUSPENSION</span>
            <span>🌐 ONLINE RACING</span>
          </div>
        </section>
      )}

      {mode === 'onlineLobby' && (
        <OnlineLobby
          playerName={playerName}
          setPlayerName={setPlayerName}
          roomCode={roomCodeInput}
          setRoomCode={setRoomCodeInput}
          room={room}
          myPlayerId={myPlayerId}
          connectionStatus={connectionStatus}
          error={error}
          busy={busy}
          notice={notice}
          onCreate={createRoom}
          onJoin={joinRoom}
          onStart={startRace}
          onLeave={leaveRoom}
          onCopy={copyRoomCode}
        />
      )}

      {(mode === 'solo' || mode === 'onlineRace') && (
        <>
          <div className="game-toolbar">
            <div>
              <strong>{mode === 'solo' ? 'SOLO CLIMB' : `ONLINE RACE · ROOM ${room?.code ?? ''}`}</strong>
              <small>{mode === 'solo' ? 'FULL 3D RIGID-BODY VEHICLE PHYSICS' : `${room?.players.length ?? 1} DRIVERS · LIVE ONLINE RACE`}</small>
            </div>
            <button className="secondary back" onClick={mode === 'solo' ? () => setMode('menu') : leaveRoom}>
              ← {mode === 'solo' ? 'BACK TO GARAGE' : 'LEAVE RACE'}
            </button>
          </div>
          <PlayerHud hud={hud} name={mode === 'solo' ? playerName : localPlayerName} />
          <TrackMap
            hud={hud}
            terrainType={terrainType}
            opponents={mode === 'onlineRace' ? mapOpponents : []}
            localColor={mode === 'solo' ? '#f5a623' : localPlayerColor}
          />
          <div className="player-control-hint hint-solo">
            W ACCELERATE · S REVERSE · A / D STEER · SPACE BRAKE · R RESET
          </div>
          <TouchControls />
        </>
      )}

      {mode === 'onlineRace' && room?.status === 'countdown' && (
        <div className="race-countdown">
          <span>{countdown > 0 ? countdown : 'GO!'}</span>
          <small>GET READY, DRIVERS</small>
        </div>
      )}

      {mode === 'onlineRace' && room?.status === 'finished' && (
        <div className="race-result-overlay">
          <div className="race-result-card">
            <div className="online-panel-eyebrow">SUMMIT REACHED</div>
            <h2>{winnerName || room.winner?.name || 'RACE COMPLETE'} WINS!</h2>
            <p>Room {room.code} · {room.players.length} drivers</p>
            <button className="primary online-action" onClick={leaveRoom}>BACK TO GARAGE</button>
          </div>
        </div>
      )}

      {mode === 'solo' && soloFinished && (
        <div className="race-result-overlay">
          <div className="race-result-card">
            <div className="online-panel-eyebrow">SUMMIT REACHED</div>
            <h2>CLIMB COMPLETE!</h2>
            <p>You made it to the top of the hill.</p>
            <button className="primary online-action" onClick={() => { setSoloFinished(false); setMode('menu'); }}>
              BACK TO GARAGE
            </button>
          </div>
        </div>
      )}

      <footer>
        <span>HILL CLASH © 2026</span>
        <span>BUILD YOUR LEGEND • CLIMB YOUR WAY</span>
      </footer>
    </main>
  );
}
