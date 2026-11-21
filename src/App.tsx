import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import HillTerrain, { mountainHeight } from './HillTerrain';
import Truck from './Truck';

function Scene({ demo, active }: { demo: boolean; active: boolean }) {
  return (
    <Canvas shadows camera={{ position: [7, 6, 12], fov: 48 }}>
      <color attach="background" args={['#9bd9ff']} />
      <fog attach="fog" args={['#9bd9ff', 22, 75]} />
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[12, 18, 8]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <HillTerrain />
          <Truck
            position={[-1.4, mountainHeight(-1.4, 3) + 1.05, 3]}
            active={active}
          />
          {demo && (
            <Truck
              color="#48c6ff"
              position={[1.7, mountainHeight(1.7, 5) + 1.05, 5]}
              active={false}
            />
          )}
        </Physics>
      </Suspense>
      <Environment preset="sunset" />
      {!active && (
        <OrbitControls
          target={[0, 1, -6]}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={5}
          maxDistance={28}
        />
      )}
    </Canvas>
  );
}

export default function App() {
  const [mode, setMode] = useState<'menu' | 'solo' | 'split'>('menu');

  return (
    <main className="app-shell">
      <div className="scene">
        <Scene demo={mode === 'split'} active={mode !== 'menu'} />
      </div>
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
            <span>🛞 TRACTION</span>
            <span>💥 CRASH & RECOVER</span>
          </div>
        </section>
      ) : (
        <section className="game-panel">
          <div className="game-title">
            {mode === 'split' ? 'LOCAL SPLIT SCREEN — PREVIEW' : 'SOLO CLIMB — PREVIEW'}
          </div>
          <div className="controls-note">
            DRIVE: W / ↑ · STEER: A / D · REVERSE: S / ↓ · HANDBRAKE: SPACE · RESET: R
          </div>
          <button className="secondary back" onClick={() => setMode('menu')}>
            ← BACK TO GARAGE
          </button>
        </section>
      )}
      <footer>
        <span>HILL CLASH © 2026</span>
        <span>BUILD YOUR LEGEND • CLIMB YOUR WAY</span>
      </footer>
    </main>
  );
}
