import { Suspense, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import HillTerrain, { roadCenterX, roadHeight } from './HillTerrain';
import Truck3D, { type VehicleHud } from './Truck3D';

type Mode = 'menu' | 'solo' | 'split';

const emptyHud: VehicleHud = {
  speed: 0,
  progress: 0,
  gear: 'N',
  pitch: 0,
  roll: 0,
  frontLoad: 0,
  rearLoad: 0,
  frontSlip: 0,
  rearSlip: 0,
};


/** Static menu showcase model; gameplay trucks use the full Rapier 3D controller. */
function MenuTruck() {
  return (
    <group position={[roadCenterX(2), roadHeight(2) + 1.25, -2]} rotation={[0, Math.PI / 2, 0]}>
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
      ))}
    </group>
  );
}

/** Render one shared 3D scene through two cameras and two scissor viewports. */
function SplitScreenRenderer({
  cameraOne,
  cameraTwo,
}: {
  cameraOne: RefObject<THREE.PerspectiveCamera | null>;
  cameraTwo: RefObject<THREE.PerspectiveCamera | null>;
}) {
  const { gl, scene, size } = useThree();

  useFrame(() => {
    const first = cameraOne.current;
    const second = cameraTwo.current;
    if (!first || !second) return;

    const previousAutoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setScissorTest(true);

    const renderViewport = (
      camera: THREE.PerspectiveCamera,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      gl.setViewport(x, y, width, height);
      gl.setScissor(x, y, width, height);
      gl.clear(true, true, true);
      gl.render(scene, camera);
    };

    if (size.width < 760) {
      const topHeight = Math.ceil(size.height / 2);
      const bottomHeight = size.height - topHeight;
      // WebGL viewport origin is bottom-left: Player 1 is the upper view.
      renderViewport(first, 0, bottomHeight, size.width, topHeight);
      renderViewport(second, 0, 0, size.width, bottomHeight);
    } else {
      const leftWidth = Math.floor(size.width / 2);
      const rightWidth = size.width - leftWidth;
      renderViewport(first, 0, 0, leftWidth, size.height);
      renderViewport(second, leftWidth, 0, rightWidth, size.height);
    }

    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.autoClear = previousAutoClear;
  }, 1);

  return null;
}

function WorldCanvas({
  mode,
  onHudOne,
  onHudTwo,
}: {
  mode: Mode;
  onHudOne: (hud: VehicleHud) => void;
  onHudTwo: (hud: VehicleHud) => void;
}) {
  const cameraOne = useRef<THREE.PerspectiveCamera>(null);
  const cameraTwo = useRef<THREE.PerspectiveCamera>(null);
  const split = mode === 'split';
  const active = mode !== 'menu';

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
        intensity={2.0}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
      />

      <Suspense fallback={null}>
        {mode === 'menu' && <MenuTruck />}
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
          <HillTerrain />
          {active && (
            <>
              <Truck3D
                player={1}
                color="#f5a623"
                laneStart={split ? -1.48 : 0}
                active
                camera={cameraOne}
                onHud={onHudOne}
              />
              {split && (
                <Truck3D
                  player={2}
                  color="#48c6ff"
                  laneStart={1.48}
                  active
                  camera={cameraTwo}
                  onHud={onHudTwo}
                />
              )}
            </>
          )}
        </Physics>

        <Environment preset="sunset" />

        <PerspectiveCamera
          ref={cameraOne}
          makeDefault={!split}
          position={[0, 7, 14]}
          fov={50}
          near={0.1}
          far={180}
        />
        {split && (
          <>
            <PerspectiveCamera
              ref={cameraTwo}
              position={[0, 7, 14]}
              fov={50}
              near={0.1}
              far={180}
            />
            <SplitScreenRenderer cameraOne={cameraOne} cameraTwo={cameraTwo} />
          </>
        )}
      </Suspense>
    </Canvas>
  );
}

function PlayerHud({ player, hud, split }: { player: 1 | 2; hud: VehicleHud; split: boolean }) {
  const slip = Math.max(hud.frontSlip, hud.rearSlip);
  const controls = player === 1 ? 'WASD' : 'ARROW KEYS';

  return (
    <div className={`player-hud ${player === 1 ? 'hud-player-one' : 'hud-player-two'} ${split ? 'hud-split' : ''}`}>
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
        <span>ROLL</span><strong>{hud.roll.toFixed(1)}°</strong>
      </div>
      <div className="axle-loads">
        <span>FRONT LOAD <b>{hud.frontLoad.toFixed(1)} kN</b></span>
        <span>REAR LOAD <b>{hud.rearLoad.toFixed(1)} kN</b></span>
      </div>
      <div className="traction-track"><i style={{ width: `${Math.round(slip * 100)}%` }} /></div>
      <div className={slip > 0.16 ? 'traction-state slipping' : 'traction-state'}>
        {slip > 0.16 ? 'WHEEL SPIN' : 'TIRE GRIP'}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('menu');
  const [hudOne, setHudOne] = useState<VehicleHud>(emptyHud);
  const [hudTwo, setHudTwo] = useState<VehicleHud>(emptyHud);
  const split = mode === 'split';

  return (
    <main className="app-shell">
      <div className={mode === 'menu' ? 'scene' : `race-stage ${split ? 'split' : 'solo'}`}>
        <WorldCanvas mode={mode} onHudOne={setHudOne} onHudTwo={setHudTwo} />
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
            <span>⛰️ REAL 3D TERRAIN</span>
            <span>🛞 4-WHEEL SUSPENSION</span>
            <span>⚙️ RIGID-BODY PHYSICS</span>
          </div>
        </section>
      ) : (
        <>
          <div className="game-toolbar">
            <div>
              <strong>{split ? 'LOCAL HILL CLASH' : 'SOLO CLIMB'}</strong>
              <small>{split ? 'ONE SHARED PHYSICS WORLD · TWO TRUCKS · TWO CAMERAS' : 'FULL 3D RIGID-BODY VEHICLE PHYSICS'}</small>
            </div>
            <button className="secondary back" onClick={() => setMode('menu')}>← BACK TO GARAGE</button>
          </div>

          <PlayerHud player={1} hud={hudOne} split={split} />
          {split && <PlayerHud player={2} hud={hudTwo} split />}

          <div className={`player-control-hint ${split ? 'hint-player-one' : 'hint-solo'}`}>
            W ACCELERATE · S REVERSE · A / D STEER · SPACE BRAKE · R RESET
          </div>
          {split && (
            <div className="player-control-hint hint-player-two">
              ↑ ACCELERATE · ↓ REVERSE · ← / → STEER · SHIFT BRAKE · ENTER RESET
            </div>
          )}
        </>
      )}

      <footer>
        <span>HILL CLASH © 2026</span>
        <span>BUILD YOUR LEGEND • CLIMB YOUR WAY</span>
      </footer>
    </main>
  );
}
