import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';

/** Centreline of the climbing trail, expressed in world X for a progress value. */
export function roadCenterX(progress: number) {
  const distance = Math.max(0, progress);
  return Math.sin(distance * 0.075) * 4.2 + Math.sin(distance * 0.025) * 1.1;
}

/** Height of the centre of the playable road. Progress increases uphill toward -Z. */
export function roadHeight(progress: number) {
  const z = -progress;
  return mountainHeight(roadCenterX(progress), z);
}

/** Finite-difference grade along the direction of travel. */
export function roadSlope(progress: number) {
  const sample = 0.08;
  return (roadHeight(progress + sample) - roadHeight(progress - sample)) / (2 * sample);
}

function trailCenter(z: number) {
  const distance = Math.max(0, -z);
  return Math.sin(distance * 0.075) * 4.2 + Math.sin(distance * 0.025) * 1.1;
}

export function mountainHeight(x: number, z: number) {
  const distance = Math.max(0, -z - 3);
  const climb = distance * 0.21 + 1.25 * Math.sin(distance * 0.22);
  const trailDistance = Math.abs(x - trailCenter(z));
  const shoulder = Math.min(2.8, Math.max(0, trailDistance - 5.6) ** 2 * 0.018);
  const roughness =
    Math.sin(x * 0.31 + z * 0.19) * 0.26 +
    Math.cos(z * 0.29) * 0.17 +
    Math.sin(x * 0.17 - z * 0.11) * 0.12;
  return climb + shoulder + roughness;
}

function createMountainGeometry() {
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
      positions.push(x, mountainHeight(x, z), z);
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

function createTrailGeometry() {
  const segments = 180;
  const startZ = 14;
  const endZ = -72;
  const halfWidth = 4.25;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = startZ + (endZ - startZ) * t;
    const center = trailCenter(z);
    positions.push(center - halfWidth, mountainHeight(center - halfWidth, z) + 0.075, z);
    positions.push(center + halfWidth, mountainHeight(center + halfWidth, z) + 0.075, z);

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

const ROCKS = [
  { progress: 9, side: -1, size: 1.15, rotation: 0.4 },
  { progress: 17, side: 1, size: 1.45, rotation: 1.1 },
  { progress: 27, side: -1, size: 1.0, rotation: 0.8 },
  { progress: 35, side: 1, size: 1.2, rotation: 0.2 },
  { progress: 47, side: -1, size: 1.55, rotation: 1.4 },
  { progress: 58, side: 1, size: 1.25, rotation: 0.6 },
];

export default function HillTerrain() {
  const mountain = useMemo(createMountainGeometry, []);
  const trail = useMemo(createTrailGeometry, []);

  return (
    <group>
      <RigidBody type="fixed" colliders="trimesh" friction={1.05} restitution={0}>
        <mesh geometry={mountain} receiveShadow frustumCulled={false}>
          <meshStandardMaterial color="#66894c" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </RigidBody>
      <mesh geometry={trail} receiveShadow frustumCulled={false} renderOrder={1}>
        <meshStandardMaterial color="#806b4d" roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      {ROCKS.map((rock) => {
        const x = roadCenterX(rock.progress) + rock.side * (5.1 + rock.size * 0.35);
        const z = -rock.progress;
        const y = mountainHeight(x, z) + rock.size * 0.72;
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
              <meshStandardMaterial color="#77786f" roughness={1} />
            </mesh>
          </RigidBody>
        );
      })}
      {Array.from({ length: 18 }, (_, i) => {
        const progress = 5 + i * 4.2;
        const z = -progress;
        const center = roadCenterX(progress);
        const side = i % 2 === 0 ? -1 : 1;
        const x = center + side * (11 + (i % 3) * 2.2);
        const y = mountainHeight(x, z) + 2.1;
        return (
          <RigidBody key={`pine-${i}`} type="fixed" colliders="hull" position={[x, y, z]}>
            <group>
              <mesh castShadow><coneGeometry args={[1.5, 4.3, 5]} /><meshStandardMaterial color="#335d37" /></mesh>
              <mesh position={[0, -1.9, 0]}><cylinderGeometry args={[0.22, 0.3, 1.2, 6]} /><meshStandardMaterial color="#59452f" /></mesh>
            </group>
          </RigidBody>
        );
      })}
    </group>
  );
}
