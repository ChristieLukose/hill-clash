import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

export type TerrainType = 'mountain' | 'desert' | 'snow' | 'jungle';

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

/** Centreline of each route, expressed in world X for a progress value. */
export function roadCenterX(progress: number, terrainType: TerrainType = 'mountain') {
  const distance = Math.max(0, progress);
  if (terrainType === 'desert') {
    return Math.sin(distance * 0.052) * 5.4 + Math.sin(distance * 0.021) * 1.35;
  }
  if (terrainType === 'snow') {
    return Math.sin(distance * 0.086) * 3.5 + Math.sin(distance * 0.031) * 1.45;
  }
  if (terrainType === 'jungle') {
    return Math.sin(distance * 0.064) * 4.8 + Math.sin(distance * 0.019) * 1.55;
  }
  return Math.sin(distance * 0.075) * 4.2 + Math.sin(distance * 0.025) * 1.1;
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
  return baseClimb + shoulder + roughness - trailRoughness * trailSmoothing;
}

function createMountainGeometry(terrainType: TerrainType) {
  const width = 90;
  const depth = 150;
  const xSegments = 110;
  const zSegments = 180;
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
  const segments = 180;
  const startZ = 14;
  const endZ = -72;
  const halfWidth = 4.25;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = startZ + (endZ - startZ) * t;
    const center = trailCenter(z, terrainType);
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

function FinishGate({ terrainType }: { terrainType: TerrainType }) {
  const progress = 72;
  const center = roadCenterX(progress, terrainType);
  const baseY = mountainHeight(center, -progress, terrainType) + 0.08;
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
    <group position={[center, baseY, -progress]}>
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

const ROCKS = [
  { progress: 9, side: -1, size: 1.15, rotation: 0.4 },
  { progress: 17, side: 1, size: 1.45, rotation: 1.1 },
  { progress: 27, side: -1, size: 1.0, rotation: 0.8 },
  { progress: 35, side: 1, size: 1.2, rotation: 0.2 },
  { progress: 47, side: -1, size: 1.55, rotation: 1.4 },
  { progress: 58, side: 1, size: 1.25, rotation: 0.6 },
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
      <FinishGate terrainType={terrainType} />
      {ROCKS.map((rock) => {
        const x = roadCenterX(rock.progress, terrainType) + rock.side * (5.1 + rock.size * 0.35);
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
      {Array.from({ length: 18 }, (_, i) => {
        const progress = 5 + i * 4.2;
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
