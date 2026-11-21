import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';

/** Centre of the dirt trail. It gently winds across the ridge as it climbs. */
function trailCenter(z: number) {
  const distance = Math.max(0, -z);
  return Math.sin(distance * 0.075) * 4.2 + Math.sin(distance * 0.025) * 1.1;
}

/** Shared height function keeps the visual trail and the physical mountain aligned. */
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
  const geometry = new THREE.PlaneGeometry(90, 150, 110, 180);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, mountainHeight(x, z));
  }

  geometry.computeVertexNormals();
  // Vertex heights are modified after PlaneGeometry construction; refresh culling bounds.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTrailGeometry() {
  const segments = 110;
  const startZ = 14;
  const endZ = -68;
  const halfWidth = 4.25;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const z = startZ + (endZ - startZ) * t;
    const center = trailCenter(z);
    const leftX = center - halfWidth;
    const rightX = center + halfWidth;

    positions.push(leftX, mountainHeight(leftX, z) + 0.055, z);
    positions.push(rightX, mountainHeight(rightX, z) + 0.055, z);

    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
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

type RockSpec = { z: number; side: number; size: number; rotation: number };
const ROCKS: RockSpec[] = [
  { z: -9, side: -1, size: 1.15, rotation: 0.4 },
  { z: -17, side: 1, size: 1.45, rotation: 1.1 },
  { z: -27, side: -1, size: 1.0, rotation: 0.8 },
  { z: -35, side: 1, size: 1.2, rotation: 0.2 },
  { z: -47, side: -1, size: 1.55, rotation: 1.4 },
  { z: -58, side: 1, size: 1.25, rotation: 0.6 },
];

function Rock({ spec }: { spec: RockSpec }) {
  const center = trailCenter(spec.z);
  const x = center + spec.side * (5.1 + spec.size * 0.35);
  const y = mountainHeight(x, spec.z) + spec.size * 0.72;

  return (
    <RigidBody
      type="fixed"
      colliders="hull"
      position={[x, y, spec.z]}
      rotation={[0.16, spec.rotation, 0.12]}
    >
      <mesh castShadow receiveShadow>
        <dodecahedronGeometry args={[spec.size, 1]} />
        <meshStandardMaterial color="#77786f" roughness={1} />
      </mesh>
    </RigidBody>
  );
}

export default function HillTerrain() {
  const mountain = useMemo(createMountainGeometry, []);
  const trail = useMemo(createTrailGeometry, []);

  return (
    <group>
      {/* Keep the visual terrain separate from Rapier's generated collider mesh. */}
      <mesh geometry={mountain} receiveShadow frustumCulled={false} renderOrder={0}>
        <meshStandardMaterial color="#66894c" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <RigidBody type="fixed" colliders="trimesh">
        <mesh geometry={mountain}>
          <meshBasicMaterial color="#66894c" side={THREE.DoubleSide} />
        </mesh>
      </RigidBody>

      {/* A visible dirt route follows the hill's bends and elevation changes. */}
      <mesh geometry={trail} receiveShadow frustumCulled={false} renderOrder={1}>
        <meshStandardMaterial
          color="#806b4d"
          roughness={1}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Low catch floor beneath the mountain, in case a vehicle falls off the edge. */}
      <RigidBody type="fixed">
        <CuboidCollider args={[55, 0.5, 60]} position={[0, -8, -25]} />
      </RigidBody>

      {ROCKS.map((spec, index) => (
        <Rock key={`${spec.z}-${index}`} spec={spec} />
      ))}
    </group>
  );
}
