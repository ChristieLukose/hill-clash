import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import HillTerrain from './HillTerrain';
import TruckPhysics, { type TruckHud } from './TruckPhysics';

type Mode = 'menu' | 'solo' | 'split';

const emptyHud: TruckHud = {
  speed: 0,
  progress: 0,
  gear: 'N',
  pitch: 0,
  frontLoad: 0,
  rearLoad: 0,
  frontSlip: 0,
  rearSlip: 0,
};

function WorldCanvas({
  player,
  laneStart,
  active,
  color,
  onHud,
}: {
  player: 1 | 2;
  laneStart: number;
  active: boolean;
  color: string;
  onHud?: (hud: TruckHud) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 7, 12], fov: 48, near: 0.1, far: 180 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#9bd9ff']} />
      <fog attach="fog" args={['#9bd9ff', 38, 125]} />
      <ambientLight intensity={0.68} />
      <hemisphereLight args={['#dff4ff', '#50623d', 0.72]} />
      <directionalLight
        position={[12, 22, 8]}
        intensity={2.0}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />
      <Suspense fallback={null}>
        <HillTerrain />
        <TruckPhysics player={player} color={color} laneStart={laneStart} active={active} onHud={onHud} />
        <Environment preset="sunset" />
      </Suspense>
    </Canvas>
  );
}

function PlayerHud({ player, hud }: { player: 1 | 2; hud: TruckHud }) {
  const controls = player === 1 ? 'WASD' : 'ARROW KEYS';
  const slip = Math.max(hud.frontSlip, hud.rearSlip);
  return (
    <div className="player-hud">
      <div className="player-label">
        <span className={player === 1 ? 'player-dot orange' : 'player-dot blue'} />
        PLAYER {player}
        <small>{controls}</small>
      </div>
      <div className="hud-main">
        <strong>{Math.round(hud.speed)}</strong>
        <span>KM/H</span>
        <b>{hud.gear}</b>
      </div>
      <div className="hud-progress">
        <span>CLIMB</span><strong>{Math.floor(hud.progress)} m</strong>
        <span>PITCH</span><strong>{hud.pitch.toFixed(1)}°</strong>
      </div>
      <div className="axle-loads">
        <span>FRONT LOAD <b>{hud.frontLoad.toFixed(1)} kN</b></span>
        <span>REAR LOAD <b>{hud.rearLoad.toFixed(1)} kN</b></span>
      </div>
      <div className="traction-track">
        <i style={{ width: `${Math.round(slip * 100)}%` }} />
      </div>
      <div className={slip > 0.12 ? 'traction-state slipping' : 'traction-state'}>
        {slip > 0.12 ? 'WHEEL SPIN' : 'TRACTION OK'}
      </div>
    </div>
  );
}

function PlayerView({
  player,
  laneStart,
  color,
  hud,
  onHud,
}: {
  player: 1 | 2;
  laneStart: number;
  color: string;
  hud: TruckHud;
  onHud: (hud: TruckHud) => void;
}) {
  return (
    <section className={`player-view player-${player}`}>
      <WorldCanvas player={player} laneStart={laneStart} active color={color} onHud={onHud} />
      <PlayerHud player={player} hud={hud} />
      <div className="player-control-hint">
        {player === 1
          ? 'W ACCELERATE · S REVERSE · A / D STEER · SPACE BRAKE · R RESET'
          : '↑ ACCELERATE · ↓ REVERSE · ← / → STEER · SHIFT BRAKE · ENTER RESET'}
      </div>
    </section>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('menu');
  const [hud1, setHud1] = useState<TruckHud>(emptyHud);
  const [hud2, setHud2] = useState<TruckHud>(emptyHud);

  return (
    <main className="app-shell">
      {mode === 'menu' ? (
        <div className="scene">
          <WorldCanvas player={1} laneStart={0} active={false} color="#ff6b35" />
        </div>
      ) : (
        <>
          <div className={mode === 'split' ? 'race-stage split' : 'race-stage solo'}>
            <PlayerView player={1} laneStart={mode === 'split' ? -1.45 : 0} color="#f5a623" hud={hud1} onHud={setHud1} />
            {mode === 'split' && (
              <PlayerView player={2} laneStart={1.45} color="#48c6ff" hud={hud2} onHud={setHud2} />
            )}
          </div>
          <div className="game-toolbar">
            <div>
              <strong>{mode === 'split' ? 'LOCAL HILL CLASH' : 'SOLO CLIMB'}</strong>
              <small>{mode === 'split' ? 'TWO TRUCKS · SAME MOUNTAIN · SPLIT SCREEN' : 'CUSTOM 2D RIGID-BODY PHYSICS · 3D WORLD'}</small>
            </div>
            <button className="secondary back" onClick={() => setMode('menu')}>← BACK TO GARAGE</button>
          </div>
        </>
      )}

      <header className="topbar">
        <div className="brand-mark">HC</div>
        <div className="brand">
          HILL <span>CLASH</span>
          <small>TRUCK CLIMBING ARENA</small>
        </div>
        <div className="top-pill">● EARLY ACCESS</div>
      </header>

      {mode === 'menu' ? (
        <section className="hero">
          <div className="eyebrow">⚡ GRIP IT. CLIMB IT. OWN IT.</div>
          <h1>THE HILL<br /><span>IS YOURS.</span></h1>
          <p>Master the slope. Keep your wheels gripping.<br />Race your rivals to the summit.</p>
          <div className="menu-buttons">
            <button className="primary" onClick={() => setMode('solo')}>▶ SOLO CLIMB</button>
            <button className="secondary" onClick={() => setMode('split')}>⇄ LOCAL SPLIT SCREEN</button>
          </div>
          <div className="feature-row">
            <span>⛰️ REAL SLOPES</span>
            <span>🛞 AXLE SUSPENSION</span>
            <span>💥 LOAD TRANSFER</span>
          </div>
        </section>
      ) : null}

      <footer>
        <span>HILL CLASH © 2026</span>
        <span>BUILD YOUR LEGEND • CLIMB YOUR WAY</span>
      </footer>
    </main>
  );
}
