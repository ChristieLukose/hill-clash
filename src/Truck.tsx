import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mountainHeight } from './HillTerrain';

const WHEEL_RADIUS = 0.36;
const REST_LENGTH = 0.42;
const SPRING_STIFFNESS = 24000;
const SPRING_DAMPING = 1900;
const WHEELS = [
  { x: -0.82, z: -0.82, front: true },
  { x: 0.82, z: -0.82, front: true },
  { x: -0.82, z: 0.82, front: false },
  { x: 0.82, z: 0.82, front: false },
] as const;

const keys = new Set<string>();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
}

type TruckProps = {
  color?: string;
  position?: [number, number, number];
  active?: boolean;
};

export default function Truck({ color = '#ff6b35', position = [0, 1.1, 0], active = false }: TruckProps) {
  const body = useRef<RapierRigidBody>(null);
  const wheelGroups = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const spin = useRef([0, 0, 0, 0]);
  const vecForward = useMemo(() => new THREE.Vector3(), []);
  const vecRight = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const tangentForward = useMemo(() => new THREE.Vector3(), []);
  const tangentSide = useMemo(() => new THREE.Vector3(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const spawn = useMemo<[number, number, number]>(
    () => [position[0], mountainHeight(position[0], position[2]) + 1.05, position[2]],
    [position[0], position[2]],
  );

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb) return;
    const dt = Math.min(delta, 1 / 30);
    const p = rb.translation();
    const r = rb.rotation();
    quat.set(r.x, r.y, r.z, r.w);
    vecForward.set(0, 0, -1).applyQuaternion(quat);
    vecRight.set(1, 0, 0).applyQuaternion(quat);

    const throttle = active
      ? (keys.has('w') || keys.has('arrowup') ? 1 : keys.has('s') || keys.has('arrowdown') ? -0.6 : 0)
      : 0;
    const steering = active
      ? (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0)
      : 0;

    if (active && keys.has('r')) {
      rb.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      keys.delete('r');
    }

    const velocity = rb.linvel();
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

    WHEELS.forEach((wheel, index) => {
      localOffset.set(wheel.x, -0.18, wheel.z).applyQuaternion(quat);
      point.set(p.x + localOffset.x, p.y + localOffset.y, p.z + localOffset.z);
      const ground = mountainHeight(point.x, point.z);

      // Sample the local terrain gradient so the tire force follows the slope.
      const sample = 0.16;
      const dx = (mountainHeight(point.x + sample, point.z) - mountainHeight(point.x - sample, point.z)) / (sample * 2);
      const dz = (mountainHeight(point.x, point.z + sample) - mountainHeight(point.x, point.z - sample)) / (sample * 2);
      normal.set(-dx, 1, -dz).normalize();

      const distanceToGround = point.y - ground - WHEEL_RADIUS;
      const compression = THREE.MathUtils.clamp(REST_LENGTH - distanceToGround, 0, REST_LENGTH + 0.08);
      const contactPoint = { x: point.x, y: ground, z: point.z };

      if (distanceToGround < REST_LENGTH + 0.04) {
        const pointVelocity = rb.velocityAtPoint(contactPoint);
        const normalVelocity = pointVelocity.x * normal.x + pointVelocity.y * normal.y + pointVelocity.z * normal.z;
        const spring = THREE.MathUtils.clamp(
          SPRING_STIFFNESS * compression - SPRING_DAMPING * normalVelocity,
          0,
          11000,
        );
        if (spring > 0) {
          rb.applyImpulseAtPoint(
            { x: normal.x * spring * dt, y: normal.y * spring * dt, z: normal.z * spring * dt },
            contactPoint,
            true,
          );
        }

        tangentForward.copy(vecForward).addScaledVector(normal, -vecForward.dot(normal)).normalize();
        tangentSide.copy(vecRight).addScaledVector(normal, -vecRight.dot(normal)).normalize();
        const grip = point.z < -38 ? 0.43 : point.z < -20 ? 0.61 : 0.82;
        const normalLoad = (850 * 9.81 * Math.max(0.25, normal.y)) / 4;
        const maxGripForce = grip * normalLoad;
        const longitudinal = pointVelocity.x * tangentForward.x + pointVelocity.y * tangentForward.y + pointVelocity.z * tangentForward.z;
        const lateral = pointVelocity.x * tangentSide.x + pointVelocity.y * tangentSide.y + pointVelocity.z * tangentSide.z;
        const requestedDrive = throttle * 1750 - longitudinal * 90;
        const requestedSide = -lateral * 1400;
        const magnitude = Math.hypot(requestedDrive, requestedSide);
        const gripScale = magnitude > maxGripForce ? maxGripForce / magnitude : 1;
        const driveForce = requestedDrive * gripScale;
        const sideForce = requestedSide * gripScale;
        rb.applyImpulseAtPoint(
          {
            x: (tangentForward.x * driveForce + tangentSide.x * sideForce) * dt,
            y: (tangentForward.y * driveForce + tangentSide.y * sideForce) * dt,
            z: (tangentForward.z * driveForce + tangentSide.z * sideForce) * dt,
          },
          contactPoint,
          true,
        );
        spin.current[index] += (longitudinal / WHEEL_RADIUS + (1 - gripScale) * throttle * 20) * dt;
      } else {
        spin.current[index] += throttle * 12 * dt;
      }

      const visual = wheelGroups.current[index];
      if (visual) {
        visual.position.y = -0.18 - REST_LENGTH + compression;
        visual.rotation.y = wheel.front ? steering * 0.3 : 0;
        const rolling = visual.children[0] as THREE.Group | undefined;
        if (rolling) rolling.rotation.z = spin.current[index];
      }
    });

    if (steering !== 0 && horizontalSpeed > 0.2) {
      rb.applyTorqueImpulse({ x: 0, y: steering * (360 + Math.min(horizontalSpeed, 16) * 32) * dt, z: 0 }, true);
    }

    if (active) {
      const cameraTarget = new THREE.Vector3(p.x, p.y + 4.2, p.z + 9.5);
      state.camera.position.lerp(cameraTarget, 0.085);
      state.camera.lookAt(p.x, p.y + 1, p.z - 3);
    }
  });

  return (
    <RigidBody ref={body} colliders={false} position={spawn} mass={850}
      linearDamping={0.04} angularDamping={0.8} friction={0.7} restitution={0.02} ccd>
      <CuboidCollider args={[1.12, 0.72, 0.58]} position={[0, 0.58, 0]} />
      <group>
        <mesh castShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[2.3, 0.65, 1.15]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh castShadow position={[0, 0.95, 0]}>
          <boxGeometry args={[0.9, 0.7, 1.05]} />
          <meshStandardMaterial color="#bde8ff" roughness={0.18} metalness={0.2} />
        </mesh>
        <mesh position={[0.63, 0.95, 0.55]}>
          <boxGeometry args={[0.66, 0.45, 0.025]} />
          <meshStandardMaterial color="#16354b" />
        </mesh>
        <mesh position={[0.63, 0.95, -0.55]}>
          <boxGeometry args={[0.66, 0.45, 0.025]} />
          <meshStandardMaterial color="#16354b" />
        </mesh>
        {WHEELS.map((wheel, index) => (
          <group
            key={`${wheel.x}-${wheel.z}`}
            ref={(node) => { wheelGroups.current[index] = node; }}
            position={[wheel.x, -0.18, wheel.z]}
          >
            <group>
              <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 20]} />
                <meshStandardMaterial color="#171a21" roughness={0.96} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.22, 0.22, 0.31, 16]} />
                <meshStandardMaterial color="#aab0b5" metalness={0.7} roughness={0.3} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}