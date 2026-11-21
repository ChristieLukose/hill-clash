import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Float, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';


function Truck({ color = '#ff6b35', position = [0, 0.8, 0] }: { color?: string; position?: [number, number, number] }) {
  return <RigidBody colliders="cuboid" position={position} mass={1200} friction={1.3} restitution={0.05}>
    <group>
      <mesh castShadow position={[0, 0.42, 0]}><boxGeometry args={[2.3, 0.65, 1.15]} /><meshStandardMaterial color={color} roughness={0.45} metalness={0.25} /></mesh>
      <mesh castShadow position={[0.62, 0.95, 0]}><boxGeometry args={[0.9, 0.7, 1.05]} /><meshStandardMaterial color="#bde8ff" roughness={0.18} metalness={0.2} /></mesh>
      <mesh position={[0.63, 0.95, 0.55]}><boxGeometry args={[0.66, 0.45, 0.025]} /><meshStandardMaterial color="#16354b" /></mesh>
      <mesh position={[0.63, 0.95, -0.55]}><boxGeometry args={[0.66, 0.45, 0.025]} /><meshStandardMaterial color="#16354b" /></mesh>
      {[-0.75, 0.75].map(x => [-0.42, 0.42].map(z => <mesh key={`${x}-${z}`} castShadow position={[x, -0.05, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.34, 0.34, 0.22, 16]} /><meshStandardMaterial color="#171a21" roughness={0.95} /></mesh>))}
    </group>
  </RigidBody>;
}
function Hill() {
  const hill = new THREE.PlaneGeometry(50, 80, 70, 100);
  const pos = hill.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const ridge = Math.max(0, y + 18) * 0.32;
    pos.setZ(i, ridge + Math.sin(x * 0.22) * 1.4 + Math.cos(y * 0.18) * 1.2);
  }
  hill.computeVertexNormals();
  return <mesh geometry={hill} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, -22]} receiveShadow><meshStandardMaterial color="#4e9d50" roughness={1} /></mesh>;
}
function Scene({ demo }: { demo: boolean }) {
  return <Canvas shadows camera={{ position: [7, 6, 12], fov: 48 }}>
    <color attach="background" args={['#9bd9ff']} />
    <fog attach="fog" args={['#9bd9ff', 22, 75]} />
    <ambientLight intensity={0.65} />
    <directionalLight position={[12, 18, 8]} intensity={2.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    <Physics gravity={[0, -9.81, 0]}>
      <RigidBody type="fixed"><mesh receiveShadow position={[0, -2.5, 0]}><boxGeometry args={[80, 1, 90]} /><meshStandardMaterial color="#d2a66a" /></mesh></RigidBody>
      <Hill />
      <Truck position={[-1.4, 0, 3]} />
      {demo && <Truck color="#48c6ff" position={[1.7, 0, 5]} />}
    </Physics>
    <Environment preset="sunset" />
    <OrbitControls target={[0, 1, -6]} maxPolarAngle={Math.PI / 2.1} minDistance={5} maxDistance={28} />
  </Canvas>;
}
export default function App() {
  const [mode, setMode] = useState<'menu' | 'solo' | 'split'>('menu');
  return <main className="app-shell">
    <div className="scene"><Scene demo={mode === 'split'} /></div>
    <header className="topbar"><div className="brand-mark">HC</div><div className="brand">HILL <span>CLASH</span><small>TRUCK CLIMBING ARENA</small></div><div className="top-pill">● EARLY ACCESS</div></header>
    {mode === 'menu' ? <section className="hero"><div className="eyebrow">⚡ GRIP IT. CLIMB IT. OWN IT.</div><h1>THE HILL<br/><span>IS YOURS.</span></h1><p>Master the slope. Keep your wheels gripping.<br/>Race your rivals to the summit.</p><div className="menu-buttons"><button className="primary" onClick={() => setMode('solo')}>▶ SOLO CLIMB</button><button className="secondary" onClick={() => setMode('split')}>⇄ LOCAL SPLIT SCREEN</button></div><div className="feature-row"><span>⛰️ REAL SLOPES</span><span>🛞 TRACTION</span><span>💥 CRASH & RECOVER</span></div></section> : <section className="game-panel"><div className="game-title">{mode === 'split' ? 'LOCAL SPLIT SCREEN — PREVIEW' : 'SOLO CLIMB — PREVIEW'}</div><div className="controls-note">SCENE PREVIEW • VEHICLE PHYSICS PROTOTYPE</div><button className="secondary back" onClick={() => setMode('menu')}>← BACK TO GARAGE</button></section>}
    <footer><span>HILL CLASH © 2026</span><span>BUILD YOUR LEGEND • CLIMB YOUR WAY</span></footer>
  </main>;
}
