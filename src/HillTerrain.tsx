import { useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';

/** Trail centre follows a gentle left/right line as it climbs toward -Z. */
function trailCenter(z: number) {
  const distance = Math.max(0, -z);
  return Math.sin(distance * 0.075) * 4.2 + Math.sin(distance * 0.025) * 1.1;
}

/** Shared world-space height function used by terrain, wheels and spawn placement. */
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

/**
 * Build the grid directly in world X/Y/Z coordinates.
 * This avoids rotating/editing a PlaneGeometry after its original bounds are computed.
 * Triangle winding is explicitly upward-facing.
 */
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
      // (a,c,b) and (b,c,d) have upward-facing normals for this X/Z grid.
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
  const segments = 150;
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
    positions.push(leftX, mountainHeight(leftX, z) + 0.07, z);
    positions.push(rightX, mountainHeight(rightX, z) + 0.07, z);

    if (i < segments) {
      const a = i * 2;
      // Trail is double-sided too, but keep winding consistent with upward normals.
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
  const x = trailCenter(spec.z) + spec.side * (5.1 + spec.size * 0.35);
  const y = mountainHeight(x, spec.z) + spec.size * 0.72;
  return (
    <RigidBody type="fixed" colliders="hull" position={[x, y, spec.z]} rotation={[0.16, spec.rotation, 0.12]}>
      <mesh castShadow receiveShadow>
        <dodecahedronGeometry args={[spec.size, 1]} />
        <meshStandardMaterial color="#77786f" roughness={1} />
      </mesh>
    </RigidBody>
  );
}

export default function HillTerrain() {
  const mountain = useMemo(createMountainGeometry, []);
  const collisionMesh = useMemo(() => mountain.clone(), [mountain]);
  const trail = useMemo(createTrailGeometry, []);

  return (
    <group>
      {/* Visible terrain is an ordinary render mesh, independent from the Rapier collider. */}
      <mesh geometry={mountain} receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#66894c" roughness={1} side={THREE.DoubleSide} />
      </mesh>

      {/* Physics receives its own copy of the exact same terrain vertices. */}
      <RigidBody type="fixed" colliders="trimesh">
        <mesh geometry={collisionMesh}>
          <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
        </mesh>
      </RigidBody>

      {/* Dirt climbing lane follows the terrain height profile. */}
      <mesh geometry={trail} receiveShadow frustumCulled={false} renderOrder={1}>
        <meshStandardMaterial
          color="#806b4d"
          roughness={1}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* Fall recovery floor beneath the mountain. */}
      <RigidBody type="fixed">
        <CuboidCollider args={[55, 0.5, 60]} position={[0, -8, -25]} />
      </RigidBody>

      {ROCKS.map((spec, index) => <Rock key={`${spec.z}-${index}`} spec={spec} />)}
    </group>
  );
}
