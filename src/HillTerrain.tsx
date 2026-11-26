import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

export type TerrainType = 'mountain' | 'desert' | 'snow' | 'jungle';

export const TRACK_LENGTH = 240;

export const TERRAIN_OPTIONS: Array<{ id: TerrainType; name: string; detail: string }> = [
  { id: 'mountain', name: 'Mountain', detail: 'Rocky alpine trail' },
  { id: 'desert', name: 'Desert', detail: 'Dunes and dry canyons' },
  { id: 'snow', name: 'Snow', detail: 'Icy ridges and pine forest' },
  { id: 'jungle', name: 'Jungle', detail: 'Dense tropical slopes' },
];

const TERRAIN_STYLES: Record<TerrainType, { ground: string; trail: string; rock: string; foliage: string; trunk: string }> = {
  mountain: { ground: '#66894c', trail: '#806b4d', rock: '#77786f', foliage: '#335d37', trunk: '#59452f' },
  desert: { ground: '#c79a58', trail: '#a97843', rock: '#8d5637', foliage: '#3f7a4b', trunk: '#5b5334' },
  snow: { ground: '#d9e6ed', trail: '#8da8b7', rock: '#8797a0', foliage: '#365b69', trunk: '#655d54' },
  jungle: { ground: '#315f3e', trail: '#70533b', rock: '#626b58', foliage: '#1d5738', trunk: '#493c2d' },
};

/** Centreline of each route, expressed in world X for a progress value.
 * Multiple frequencies create long S-bends with tighter chicanes between them. */
export function roadCenterX(progress: number, terrainType: TerrainType = 'mountain') {
  const distance = Math.max(0, progress);
  if (terrainType === 'desert') {
    return Math.sin(distance * 0.055) * 6.2
      + Math.sin(distance * 0.13) * 1.4
      + Math.sin(distance * 0.024) * 2.0;
  }
  if (terrainType === 'snow') {
    return Math.sin(distance * 0.09) * 4.6
      + Math.sin(distance * 0.16) * 0.9
      + Math.sin(distance * 0.03) * 1.8;
  }
  if (terrainType === 'jungle') {
    return Math.sin(distance * 0.07) * 5.4
      + Math.sin(distance * 0.15) * 1.0
      + Math.sin(distance * 0.021) * 2.2;
  }
  return Math.sin(distance * 0.08) * 5.6
    + Math.sin(distance * 0.16) * 1.2
    + Math.sin(distance * 0.026) * 2.0;
}

/** Track width changes make narrow ridge sections and wider passing zones. */
export function roadHalfWidth(progress: number, terrainType: TerrainType = 'mountain') {
  const distance = Math.max(0, progress);
  const base = terrainType === 'snow' ? 3.95 : terrainType === 'desert' ? 4.45 : 4.2;
  const narrowOne = Math.exp(-(((distance - 20) / 4.2) ** 2)) * 0.62;
  const narrowTwo = Math.exp(-(((distance - 49) / 3.8) ** 2)) * 0.48;
  const widePass = Math.exp(-(((distance - 34) / 6.5) ** 2)) * 0.42;
  return THREE.MathUtils.clamp(base - narrowOne - narrowTwo + widePass, 3.35, 4.75);
}

/** Heading change per unit of progress, used to align roadside structures. */
function roadHeading(progress: number, terrainType: TerrainType) {
  const sample = 0.35;
  const derivative = (roadCenterX(progress + sample, terrainType) - roadCenterX(progress - sample, terrainType)) / (sample * 2);
  return Math.atan2(derivative, -1);
}

/** Height of the centre of the playable road. Progress increases uphill toward -Z. */
export function roadHeight(progress: number, terrainType: TerrainType = 'mountain') {
  const z = -progress;
  return mountainHeight(roadCenterX(progress, terrainType), z, terrainType);
}

/** Finite-difference grade along the direction of travel. */
export function roadSlope(progress: number, terrainType: TerrainType = 'mountain') {
  const sample = 0.08;
  return (roadHeight(progress + sample, terrainType) - roadHeight(progress - sample, terrainType)) / (2 * sample);
}

function trailCenter(z: number, terrainType: TerrainType = 'mountain') {
  return roadCenterX(Math.max(0, -z), terrainType);
}

/** Shared themed height function used by visuals, road collision and recovery. */
export function mountainHeight(x: number, z: number, terrainType: TerrainType = 'mountain') {
  const distance = Math.max(0, -z - 3);
  const trailDistance = Math.abs(x - trailCenter(z, terrainType));
  const shoulder = Math.min(3.2, Math.max(0, trailDistance - 5.6) ** 2 * 0.018);
  const baseClimb = terrainType === 'desert'
    ? distance * 0.17 + 1.15 * Math.sin(distance * 0.16)
    : terrainType === 'snow'
      ? distance * 0.235 + 0.95 * Math.sin(distance * 0.2)
      : terrainType === 'jungle'
        ? distance * 0.195 + 1.35 * Math.sin(distance * 0.24)
        : distance * 0.21 + 1.25 * Math.sin(distance * 0.22);

  const trailRoughness = 1 - Math.min(1, trailDistance / 7.5);
  const broadRidges =
    Math.sin(x * 0.19 + z * 0.11) * 0.48 +
    Math.cos(z * 0.17 - x * 0.13) * 0.34;
  const detailRidges =
    Math.sin(x * 0.53 + z * 0.29) * 0.19 +
    Math.cos(x * 0.37 - z * 0.41) * 0.15;

  let surfaceDetail = broadRidges + detailRidges;
  if (terrainType === 'desert') {
    surfaceDetail += Math.sin(x * 0.24 + z * 0.12) * 0.85 + Math.cos(x * 0.15 - z * 0.1) * 0.42;
  } else if (terrainType === 'snow') {
    surfaceDetail += Math.abs(Math.sin(x * 0.16 + z * 0.21)) * 0.55;
  } else if (terrainType === 'jungle') {
    surfaceDetail += Math.sin(x * 0.34 + z * 0.18) * 0.52 + Math.cos(x * 0.27 - z * 0.23) * 0.38;
  }

  const roughness = surfaceDetail * (0.35 + trailRoughness * 0.34);
  const trailSmoothing = terrainType === 'mountain' ? 0.38 : terrainType === 'snow' ? 0.32 : 0.44;

  // Large ridgelines and isolated peaks make the surrounding world feel mountainous
  // while the trail corridor remains smoother and predictable for vehicle physics.
  const peakOne = Math.exp(
    -(((x + 18) / 7.2) ** 2) - (((z + 25) / 12) ** 2),
  ) * 10.5;
  const peakTwo = Math.exp(
    -(((x - 19) / 8.5) ** 2) - (((z + 48) / 14) ** 2),
  ) * 13;
  const ridgeSpine = Math.exp(-(((x - trailCenter(z, terrainType) - 13) / 5.5) ** 2))
    * (0.5 + 0.5 * Math.sin(z * 0.11)) * 5.4;
  const offTrackBlend = THREE.MathUtils.smoothstep(trailDistance, 4.2, 10.5);
  const alpineRelief = (peakOne + peakTwo + ridgeSpine) * offTrackBlend;

  const terrainRelief = terrainType === 'mountain'
    ? alpineRelief
    : terrainType === 'snow'
      ? alpineRelief * 0.72 + Math.max(0, Math.sin(x * 0.18 + z * 0.09)) * offTrackBlend * 1.4
      : terrainType === 'desert'
        ? Math.abs(Math.sin(x * 0.12 + z * 0.08)) * offTrackBlend * 2.2
        : Math.sin(x * 0.2 - z * 0.13) * offTrackBlend * 1.8;

  return baseClimb + shoulder + roughness - trailRoughness * trailSmoothing + terrainRelief;
}

function createMountainGeometry(terrainType: TerrainType) {
  const width = 90;
  const depth = 520;
  const xSegments = 140;
  const zSegments = 620;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= zSegments; iz += 1) {
    const z = -depth / 2 + (iz / zSegments) * depth;
    for (let ix = 0; ix <= xSegments; ix += 1) {
      const x = -width / 2 + (ix / xSegments) * width;
      positions.push(x, mountainHeight(x, z, terrainType), z);
    }
  }

  const row = xSegments + 1;
  for (let iz = 0; iz < zSegments; iz += 1) {
    for (let ix = 0; ix < xSegments; ix += 1) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTrailGeometry(terrainType: TerrainType) {
  const segments = 600;
  const startZ = 14;
  const endZ = -TRACK_LENGTH;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = startZ + (endZ - startZ) * t;
    const progress = Math.max(0, -z);
    const center = trailCenter(z, terrainType);
    const halfWidth = roadHalfWidth(progress, terrainType);
    positions.push(center - halfWidth, mountainHeight(center - halfWidth, z, terrainType) + 0.075, z);
    positions.push(center + halfWidth, mountainHeight(center + halfWidth, z, terrainType) + 0.075, z);

    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createKerbGeometry(terrainType: TerrainType, side: -1 | 1) {
  const segments = 600;
  const startZ = 14;
  const endZ = -TRACK_LENGTH;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const red = new THREE.Color('#d84b3e');
  const cream = new THREE.Color('#f5eee0');

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = startZ + (endZ - startZ) * t;
    const progress = Math.max(0, -z);
    const center = roadCenterX(progress, terrainType);
    const halfWidth = roadHalfWidth(progress, terrainType);
    const innerX = center + side * (halfWidth - 0.5);
    const outerX = center + side * (halfWidth + 0.02);
    const innerY = mountainHeight(innerX, z, terrainType) + 0.15;
    const outerY = mountainHeight(outerX, z, terrainType) + 0.15;
    positions.push(innerX, innerY, z, outerX, outerY, z);

    const stripe = Math.floor(i / 5) % 2 === 0 ? red : cream;
    for (let vertex = 0; vertex < 2; vertex += 1) {
      colors.push(stripe.r, stripe.g, stripe.b);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function RoadKerbs({ terrainType }: { terrainType: TerrainType }) {
  const left = useMemo(() => createKerbGeometry(terrainType, -1), [terrainType]);
  const right = useMemo(() => createKerbGeometry(terrainType, 1), [terrainType]);
  return (
    <group>
      <mesh geometry={left} receiveShadow renderOrder={2}>
        <meshStandardMaterial vertexColors roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={right} receiveShadow renderOrder={2}>
        <meshStandardMaterial vertexColors roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function CheckpointGate({ progress, label, terrainType }: {
  progress: number;
  label: string;
  terrainType: TerrainType;
}) {
  const center = roadCenterX(progress, terrainType);
  const halfWidth = roadHalfWidth(progress, terrainType) + 0.12;
  const baseY = mountainHeight(center, -progress, terrainType) + 0.08;
  const heading = -Math.atan(
    (roadCenterX(progress + 0.35, terrainType) - roadCenterX(progress - 0.35, terrainType)) / 0.7,
  );
  const width = halfWidth * 2;

  return (
    <group position={[center, baseY, -progress]} rotation={[0, heading, 0]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * halfWidth, 1.05, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.28, 2.1, 0.3]} />
            <meshStandardMaterial color="#e4ad35" metalness={0.12} roughness={0.58} />
          </mesh>
          <mesh position={[0, 0.74, 0.17]}>
            <boxGeometry args={[0.34, 0.34, 0.05]} />
            <meshStandardMaterial color="#172536" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.18, 0]} castShadow>
        <boxGeometry args={[width + 0.24, 0.28, 0.34]} />
        <meshStandardMaterial color="#172536" roughness={0.55} />
      </mesh>
      <mesh position={[0, 2.18, 0.19]}>
        <boxGeometry args={[width - 0.25, 0.12, 0.035]} />
        <meshStandardMaterial color="#ffc43a" emissive="#6b4300" emissiveIntensity={0.18} />
      </mesh>
      <Html position={[0, 2.18, 0.24]} center distanceFactor={17} style={{ pointerEvents: 'none' }}>
        <div style={{
          padding: '4px 8px',
          borderRadius: '5px',
          background: 'rgba(17,29,43,.92)',
          color: '#ffd66c',
          font: '900 9px Inter, sans-serif',
          letterSpacing: '1.4px',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function SafetyRailRun({ start, end, side, terrainType }: {
  start: number;
  end: number;
  side: -1 | 1;
  terrainType: TerrainType;
}) {
  const sections = [];
  for (let progress = start; progress <= end; progress += 2.2) {
    sections.push(progress);
  }
  return (
    <group>
      {sections.map((progress) => {
        const center = roadCenterX(progress, terrainType);
        const halfWidth = roadHalfWidth(progress, terrainType);
        const railX = center + side * (halfWidth + 0.62);
        const z = -progress;
        const baseY = mountainHeight(railX, z, terrainType);
        const heading = roadHeading(progress, terrainType);
        return (
          <group key={progress} position={[railX, baseY, z]} rotation={[0, heading, 0]}>
            <mesh position={[0, 0.62, 0]} castShadow>
              <boxGeometry args={[0.18, 1.24, 0.2]} />
              <meshStandardMaterial color="#514536" roughness={0.85} />
            </mesh>
            <mesh position={[0, 1.12, 0]} castShadow>
              <boxGeometry args={[0.22, 0.18, 2.25]} />
              <meshStandardMaterial color="#d7b66c" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.63, 0]} castShadow>
              <boxGeometry args={[0.2, 0.14, 2.25]} />
              <meshStandardMaterial color="#a7864b" roughness={0.78} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function TimberBridge({ terrainType, startProgress = 34 }: { terrainType: TerrainType; startProgress?: number }) {
  const planks = [];
  for (let progress = startProgress; progress <= startProgress + 6.5; progress += 0.78) {
    planks.push(progress);
  }
  const supports = [startProgress, startProgress + 3.25, startProgress + 6.5];
  const centerProgress = startProgress + 3.25;
  const centerX = roadCenterX(centerProgress, terrainType);
  const centerY = mountainHeight(centerX, -centerProgress, terrainType);

  return (
    <group>
      {planks.map((progress, index) => {
        const center = roadCenterX(progress, terrainType);
        const halfWidth = roadHalfWidth(progress, terrainType);
        const y = mountainHeight(center, -progress, terrainType) + 0.19;
        const heading = roadHeading(progress, terrainType);
        return (
          <group key={progress} position={[center, y, -progress]} rotation={[0, heading, 0]}>
            <mesh receiveShadow castShadow>
              <boxGeometry args={[halfWidth * 2 + 0.18, 0.14, 0.68]} />
              <meshStandardMaterial color={index % 2 === 0 ? '#806044' : '#9a744d'} roughness={0.88} />
            </mesh>
            <mesh position={[0, -0.13, 0]}>
              <boxGeometry args={[halfWidth * 2 + 0.32, 0.13, 0.16]} />
              <meshStandardMaterial color="#44372a" roughness={0.9} />
            </mesh>
          </group>
        );
      })}
      {supports.map((progress) => {
        const center = roadCenterX(progress, terrainType);
        const halfWidth = roadHalfWidth(progress, terrainType);
        const z = -progress;
        const y = mountainHeight(center, z, terrainType);
        const heading = roadHeading(progress, terrainType);
        return (
          <group key={progress} position={[center, y - 0.82, z]} rotation={[0, heading, 0]}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * (halfWidth - 0.15), 0, 0]} castShadow>
                <boxGeometry args={[0.28, 1.64, 0.34]} />
                <meshStandardMaterial color="#554330" roughness={0.95} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function FinishGate({ terrainType }: { terrainType: TerrainType }) {
  const progress = TRACK_LENGTH;
  const center = roadCenterX(progress, terrainType);
  const baseY = mountainHeight(center, -progress, terrainType) + 0.08;
  const heading = -Math.atan(
    (roadCenterX(progress + 0.35, terrainType) - roadCenterX(progress - 0.35, terrainType)) / 0.7,
  );
  const bannerTiles = Array.from({ length: 20 }, (_, index) => ({
    x: -4.25 + (index % 10) * 0.85,
    y: 3.15 + Math.floor(index / 10) * 0.38,
    light: (index % 10 + Math.floor(index / 10)) % 2 === 0,
    key: index,
  }));
  const groundTiles = Array.from({ length: 10 }, (_, index) => {
    const x = -3.6 + index * 0.8;
    return {
      x,
      y: mountainHeight(center + x, -progress, terrainType) + 0.11 - baseY,
      light: index % 2 === 0,
      key: index,
    };
  });

  return (
    <group position={[center, baseY, -progress]} rotation={[0, heading, 0]}>
      <mesh position={[-4.4, 1.65, 0]} castShadow>
        <boxGeometry args={[0.38, 3.3, 0.42]} />
        <meshStandardMaterial color="#f4b52e" metalness={0.18} roughness={0.55} />
      </mesh>
      <mesh position={[4.4, 1.65, 0]} castShadow>
        <boxGeometry args={[0.38, 3.3, 0.42]} />
        <meshStandardMaterial color="#f4b52e" metalness={0.18} roughness={0.55} />
      </mesh>
      <mesh position={[0, 3.25, 0]} castShadow>
        <boxGeometry args={[9.15, 0.58, 0.48]} />
        <meshStandardMaterial color="#172536" roughness={0.5} />
      </mesh>
      {bannerTiles.map((tile) => (
        <mesh key={tile.key} position={[tile.x, tile.y, 0.255]}>
          <boxGeometry args={[0.85, 0.38, 0.035]} />
          <meshStandardMaterial color={tile.light ? '#f7f4e9' : '#1a2632'} roughness={0.85} />
        </mesh>
      ))}
      {groundTiles.map((tile) => (
        <mesh key={tile.key} position={[tile.x, tile.y, 0.35]} receiveShadow>
          <boxGeometry args={[0.8, 0.055, 0.9]} />
          <meshStandardMaterial color={tile.light ? '#f7f4e9' : '#182330'} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 2.55, 0.31]}>
        <boxGeometry args={[3.1, 0.32, 0.04]} />
        <meshStandardMaterial color="#ffc43a" emissive="#6b4300" emissiveIntensity={0.3} />
      </mesh>
      <Html position={[0, 2.55, 0.36]} center distanceFactor={16} style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#172536', font: '900 12px Inter, sans-serif', letterSpacing: '2px', whiteSpace: 'nowrap', textShadow: '0 1px 0 #ffe28a' }}>
          SUMMIT
        </div>
      </Html>
    </group>
  );
}

const ROCK_OUTCROPS = [
  { progress: 7, side: -1, size: 2.2, rotation: 0.25 },
  { progress: 18, side: 1, size: 2.8, rotation: 0.9 },
  { progress: 30, side: -1, size: 2.5, rotation: 1.4 },
  { progress: 40, side: 1, size: 3.0, rotation: 0.6 },
  { progress: 55, side: -1, size: 2.4, rotation: 1.8 },
  { progress: 65, side: 1, size: 2.8, rotation: 0.4 },
  { progress: 82, side: -1, size: 3.1, rotation: 0.7 },
  { progress: 101, side: 1, size: 2.6, rotation: 1.2 },
  { progress: 124, side: -1, size: 3.4, rotation: 0.3 },
  { progress: 148, side: 1, size: 2.9, rotation: 1.7 },
  { progress: 171, side: -1, size: 3.2, rotation: 0.8 },
  { progress: 194, side: 1, size: 2.7, rotation: 0.5 },
  { progress: 219, side: -1, size: 3.3, rotation: 1.3 },
];

function RockOutcrops({ terrainType }: { terrainType: TerrainType }) {
  const style = TERRAIN_STYLES[terrainType];
  return (
    <group>
      {ROCK_OUTCROPS.map((rock) => {
        const z = -rock.progress;
        const x = roadCenterX(rock.progress, terrainType) + rock.side * (17 + rock.size * 0.4);
        const y = mountainHeight(x, z, terrainType);
        return (
          <group key={rock.progress} position={[x, y, z]} rotation={[0, rock.rotation, 0]}>
            <mesh castShadow receiveShadow position={[0, rock.size * 0.58, 0]}>
              <dodecahedronGeometry args={[rock.size, 1]} />
              <meshStandardMaterial color={style.rock} roughness={1} />
            </mesh>
            <mesh castShadow receiveShadow position={[rock.side * rock.size * 0.72, rock.size * 0.34, -rock.size * 0.42]}>
              <dodecahedronGeometry args={[rock.size * 0.64, 1]} />
              <meshStandardMaterial color={style.rock} roughness={1} />
            </mesh>
            <mesh castShadow receiveShadow position={[-rock.side * rock.size * 0.58, rock.size * 0.28, rock.size * 0.52]}>
              <dodecahedronGeometry args={[rock.size * 0.48, 1]} />
              <meshStandardMaterial color={style.rock} roughness={1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function TurnMarker({ progress, side, terrainType, direction }: {
  progress: number;
  side: -1 | 1;
  terrainType: TerrainType;
  direction: 'LEFT' | 'RIGHT';
}) {
  const center = roadCenterX(progress, terrainType);
  const halfWidth = roadHalfWidth(progress, terrainType);
  const x = center + side * (halfWidth + 1.65);
  const z = -progress;
  const y = mountainHeight(x, z, terrainType);
  const heading = roadHeading(progress, terrainType);
  return (
    <group position={[x, y, z]} rotation={[0, heading, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 1.44, 7]} />
        <meshStandardMaterial color="#5c4933" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.48, 0]} castShadow>
        <boxGeometry args={[0.85, 0.62, 0.12]} />
        <meshStandardMaterial color="#f4eee0" roughness={0.65} />
      </mesh>
      <Html position={[0, 1.48, 0.08]} center distanceFactor={18} style={{ pointerEvents: 'none' }}>
        <div style={{
          color: '#b53d32',
          font: '900 21px Inter, sans-serif',
          lineHeight: 1,
          textShadow: '0 1px 0 #fff',
        }}>
          {direction === 'LEFT' ? '↶' : '↷'}
        </div>
      </Html>
    </group>
  );
}

const ROCKS = [
  { progress: 9, side: -1, size: 1.15, rotation: 0.4 },
  { progress: 17, side: 1, size: 1.45, rotation: 1.1 },
  { progress: 27, side: -1, size: 1.0, rotation: 0.8 },
  { progress: 35, side: 1, size: 1.2, rotation: 0.2 },
  { progress: 47, side: -1, size: 1.55, rotation: 1.4 },
  { progress: 58, side: 1, size: 1.25, rotation: 0.6 },
  { progress: 84, side: 1, size: 1.3, rotation: 1.2 },
  { progress: 107, side: -1, size: 1.5, rotation: 0.3 },
  { progress: 132, side: 1, size: 1.15, rotation: 0.9 },
  { progress: 157, side: -1, size: 1.35, rotation: 1.6 },
  { progress: 181, side: 1, size: 1.5, rotation: 0.4 },
  { progress: 207, side: -1, size: 1.25, rotation: 1.1 },
  { progress: 229, side: 1, size: 1.4, rotation: 0.7 },
];

export default function HillTerrain({ terrainType = 'mountain' }: { terrainType?: TerrainType }) {
  const style = TERRAIN_STYLES[terrainType];
  const mountain = useMemo(() => createMountainGeometry(terrainType), [terrainType]);
  const trail = useMemo(() => createTrailGeometry(terrainType), [terrainType]);

  return (
    <group>
      <RigidBody type="fixed" colliders="trimesh" friction={1.05} restitution={0}>
        <mesh geometry={mountain} receiveShadow frustumCulled={false}>
          <meshStandardMaterial color={style.ground} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </RigidBody>
      <mesh geometry={trail} receiveShadow frustumCulled={false} renderOrder={1}>
        <meshStandardMaterial color={style.trail} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <RoadKerbs terrainType={terrainType} />
      <SafetyRailRun start={11} end={19} side={-1} terrainType={terrainType} />
      <SafetyRailRun start={29} end={38} side={1} terrainType={terrainType} />
      <SafetyRailRun start={46} end={55} side={-1} terrainType={terrainType} />
      <SafetyRailRun start={59} end={66} side={1} terrainType={terrainType} />
      <SafetyRailRun start={78} end={91} side={-1} terrainType={terrainType} />
      <SafetyRailRun start={106} end={119} side={1} terrainType={terrainType} />
      <SafetyRailRun start={137} end={151} side={-1} terrainType={terrainType} />
      <SafetyRailRun start={165} end={179} side={1} terrainType={terrainType} />
      <SafetyRailRun start={194} end={208} side={-1} terrainType={terrainType} />
      <SafetyRailRun start={220} end={233} side={1} terrainType={terrainType} />
      <CheckpointGate progress={55} label="CHECKPOINT 01" terrainType={terrainType} />
      <TimberBridge terrainType={terrainType} />
      <TimberBridge terrainType={terrainType} startProgress={145} />
      <CheckpointGate progress={120} label="CHECKPOINT 02" terrainType={terrainType} />
      <CheckpointGate progress={185} label="CHECKPOINT 03" terrainType={terrainType} />
      <FinishGate terrainType={terrainType} />
      <RockOutcrops terrainType={terrainType} />
      <TurnMarker progress={15} side={-1} terrainType={terrainType} direction="RIGHT" />
      <TurnMarker progress={33} side={1} terrainType={terrainType} direction="LEFT" />
      <TurnMarker progress={52} side={-1} terrainType={terrainType} direction="RIGHT" />
      <TurnMarker progress={82} side={1} terrainType={terrainType} direction="LEFT" />
      <TurnMarker progress={108} side={-1} terrainType={terrainType} direction="RIGHT" />
      <TurnMarker progress={137} side={1} terrainType={terrainType} direction="LEFT" />
      <TurnMarker progress={164} side={-1} terrainType={terrainType} direction="RIGHT" />
      <TurnMarker progress={193} side={1} terrainType={terrainType} direction="LEFT" />
      <TurnMarker progress={222} side={-1} terrainType={terrainType} direction="RIGHT" />
      {ROCKS.map((rock) => {
        const x = roadCenterX(rock.progress, terrainType)
          + rock.side * (roadHalfWidth(rock.progress, terrainType) + rock.size + 0.62);
        const z = -rock.progress;
        const y = mountainHeight(x, z, terrainType) + rock.size * 0.72;
        return (
          <RigidBody
            key={rock.progress}
            type="fixed"
            colliders="hull"
            position={[x, y, z]}
            rotation={[0.16, rock.rotation, 0.12]}
            friction={0.9}
            restitution={0}
          >
            <mesh castShadow receiveShadow>
              <dodecahedronGeometry args={[rock.size, 1]} />
              <meshStandardMaterial color={style.rock} roughness={1} />
            </mesh>
          </RigidBody>
        );
      })}
      {Array.from({ length: 48 }, (_, i) => {
        const progress = 6 + i * 4.9;
        const z = -progress;
        const center = roadCenterX(progress, terrainType);
        const side = i % 2 === 0 ? -1 : 1;
        const x = center + side * (11 + (i % 3) * 2.2);
        const y = mountainHeight(x, z, terrainType) + 2.1;
        return (
          <RigidBody key={`pine-${i}`} type="fixed" colliders="hull" position={[x, y, z]}>
            <group>
              {terrainType === 'desert' ? (
                <group>
                  <mesh castShadow><cylinderGeometry args={[0.24, 0.34, 2.3, 7]} /><meshStandardMaterial color="#3f7a4b" /></mesh>
                  <mesh position={[0.38, 0.25, 0]} rotation={[0, 0, -0.9]}><cylinderGeometry args={[0.13, 0.16, 0.9, 7]} /><meshStandardMaterial color="#3f7a4b" /></mesh>
                  <mesh position={[-0.38, 0.5, 0]} rotation={[0, 0, 0.9]}><cylinderGeometry args={[0.13, 0.16, 0.9, 7]} /><meshStandardMaterial color="#3f7a4b" /></mesh>
                </group>
              ) : terrainType === 'jungle' ? (
                <group>
                  <mesh position={[0, -0.8, 0]}><cylinderGeometry args={[0.18, 0.28, 2.6, 7]} /><meshStandardMaterial color={style.trunk} /></mesh>
                  <mesh castShadow position={[0, 0.85, 0]} scale={[1.1, 0.8, 1]}><sphereGeometry args={[1.45, 8, 7]} /><meshStandardMaterial color={style.foliage} roughness={1} /></mesh>
                  <mesh castShadow position={[-0.85, 0.45, 0.35]} scale={[0.7, 0.8, 0.75]}><sphereGeometry args={[1, 8, 7]} /><meshStandardMaterial color="#397a45" roughness={1} /></mesh>
                  <mesh castShadow position={[0.85, 0.45, -0.28]} scale={[0.75, 0.85, 0.75]}><sphereGeometry args={[1, 8, 7]} /><meshStandardMaterial color="#24663b" roughness={1} /></mesh>
                </group>
              ) : (
                <group>
                  <mesh castShadow><coneGeometry args={[1.5, 4.3, 5]} /><meshStandardMaterial color={style.foliage} /></mesh>
                  {terrainType === 'snow' && <mesh castShadow position={[0, 0.45, 0]}><coneGeometry args={[1.12, 3.2, 5]} /><meshStandardMaterial color="#f4f8fb" /></mesh>}
                  <mesh position={[0, -1.9, 0]}><cylinderGeometry args={[0.22, 0.3, 1.2, 6]} /><meshStandardMaterial color={style.trunk} /></mesh>
                </group>
              )}
            </group>
          </RigidBody>
        );
      })}
    </group>
  );
}
