import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mountainHeight } from './HillTerrain';

const MASS = 850;
const WHEEL_RADIUS = 0.36;
const SUSPENSION_REST = 0.38;
const CHASSIS_CLEARANCE = 0.90;
const VERTICAL_SPRING = 7500;
const VERTICAL_DAMPING = 4300;
const WHEELS = [
  { x: -0.64, z: -0.82, front: true },
  { x: 0.64, z: -0.82, front: true },
  { x: -0.64, z: 0.82, front: false },
  { x: 0.64, z: 0.82, front: false },
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
  const wheelSpin = useRef([0, 0, 0, 0]);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const driveDirection = useMemo(() => new THREE.Vector3(), []);
  const sideDirection = useMemo(() => new THREE.Vector3(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const mountPoint = useMemo(() => new THREE.Vector3(), []);
  const spawn = useMemo<[number, number, number]>(
    () => [position[0], mountainHeight(position[0], position[2]) + CHASSIS_CLEARANCE, position[2]],
    [position[0], position[2]],
  );

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb || !active) return;

    const dt = Math.min(delta, 1 / 60);
    const p = rb.translation();
    const rotation = rb.rotation();
    quat.set(rotation.x, rotation.y, rotation.z, rotation.w);
    forward.set(0, 0, -1).applyQuaternion(quat);
    right.set(1, 0, 0).applyQuaternion(quat);

    const velocity = rb.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);
    const throttle = keys.has('w') || keys.has('arrowup')
      ? 1
      : keys.has('s') || keys.has('arrowdown')
        ? -0.55
        : 0;
    const steering = (keys.has('a') || keys.has('arrowleft') ? 1 : 0)
      - (keys.has('d') || keys.has('arrowright') ? 1 : 0);

    if (keys.has('r')) {
      rb.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      wheelSpin.current = [0, 0, 0, 0];
      keys.delete('r');
    }

    // One critically damped chassis support spring replaces four competing
    // hard spring impulses. It acts through the centre of mass, so it cannot
    // kick the truck into an unwanted pitch or roll.
    const groundY = mountainHeight(p.x, p.z);
    const targetY = groundY + CHASSIS_CLEARANCE;
    const heightError = targetY - p.y;
    const supportForce = THREE.MathUtils.clamp(
      MASS * 9.81 + heightError * VERTICAL_SPRING - velocity.y * VERTICAL_DAMPING,
      0,
      MASS * 9.81 * 1.8,
    );
    rb.applyImpulse({ x: 0, y: supportForce * dt, z: 0 }, true);

    // Tire drive and lateral grip use the terrain slope, but act through the
    // chassis centre to avoid four independently applied forces destabilizing it.
    const sample = 0.18;
    const slopeX = (
      mountainHeight(p.x + sample, p.z) - mountainHeight(p.x - sample, p.z)
    ) / (2 * sample);
    const slopeZ = (
      mountainHeight(p.x, p.z + sample) - mountainHeight(p.x, p.z - sample)
    ) / (2 * sample);
    normal.set(-slopeX, 1, -slopeZ).normalize();

    driveDirection.copy(forward).addScaledVector(normal, -forward.dot(normal)).normalize();
    sideDirection.copy(right).addScaledVector(normal, -right.dot(normal)).normalize();

    const grip = p.z < -38 ? 0.40 : p.z < -20 ? 0.60 : 0.82;
    const forwardSpeed = velocity.x * driveDirection.x + velocity.y * driveDirection.y + velocity.z * driveDirection.z;
    const sideSpeed = velocity.x * sideDirection.x + velocity.y * sideDirection.y + velocity.z * sideDirection.z;

    const requestedDrive = throttle * 5800 - forwardSpeed * 230;
    const maxTraction = grip * MASS * 9.81 * 0.82;
    const appliedDrive = THREE.MathUtils.clamp(requestedDrive, -maxTraction, maxTraction);
    const appliedSide = THREE.MathUtils.clamp(-sideSpeed * 1200, -maxTraction * 0.7, maxTraction * 0.7);
    rb.applyImpulse({
      x: (driveDirection.x * appliedDrive + sideDirection.x * appliedSide) * dt,
      y: (driveDirection.y * appliedDrive + sideDirection.y * appliedSide) * dt,
      z: (driveDirection.z * appliedDrive + sideDirection.z * appliedSide) * dt,
    }, true);

    if (keys.has(' ')) {
      const brake = THREE.MathUtils.clamp(speed * MASS * 1.8, 0, 9000);
      const horizontal = new THREE.Vector3(velocity.x, 0, velocity.z);
      if (horizontal.lengthSq() > 0.01) {
        horizontal.normalize().multiplyScalar(-brake * dt);
        rb.applyImpulse({ x: horizontal.x, y: 0, z: horizontal.z }, true);
      }
    }

    if (steering !== 0 && speed > 0.2) {
      rb.applyTorqueImpulse({ x: 0, y: steering * (130 + Math.min(speed, 14) * 24) * dt, z: 0 }, true);
    }

    // Wheel compression is visual only in this first stable pass. The chassis
    // support above controls vertical movement; each wheel follows local ground height.
    WHEELS.forEach((wheel, index) => {
      localOffset.set(wheel.x, -0.16, wheel.z).applyQuaternion(quat);
      mountPoint.set(p.x + localOffset.x, p.y + localOffset.y, p.z + localOffset.z);
      const wheelGround = mountainHeight(mountPoint.x, mountPoint.z);
      const wheelGap = mountPoint.y - wheelGround - WHEEL_RADIUS;
      const compression = THREE.MathUtils.clamp(SUSPENSION_REST - wheelGap, 0, SUSPENSION_REST);
      const visual = wheelGroups.current[index];

      wheelSpin.current[index] += (forwardSpeed / WHEEL_RADIUS + throttle * (1 - grip) * 9) * dt;
      if (visual) {
        visual.position.y = -0.16 - SUSPENSION_REST + compression;
        visual.rotation.y = wheel.front ? steering * 0.28 : 0;
        const rolling = visual.children[0] as THREE.Group | undefined;
        if (rolling) rolling.rotation.x = wheelSpin.current[index];
      }
    });

    const cameraPosition = new THREE.Vector3(p.x, p.y + 5.6, p.z + 8.5);
    state.camera.position.lerp(cameraPosition, 0.085);
    state.camera.lookAt(p.x, p.y + 0.1, p.z - 4.2);
  });

  return (
    <RigidBody
      ref={body}
      type={active ? 'dynamic' : 'fixed'}
      colliders={false}
      position={spawn}
      mass={MASS}
      linearDamping={0.12}
      angularDamping={2.0}
      friction={0.7}
      restitution={0}
      ccd
    >
      <CuboidCollider args={[0.62, 0.46, 1.12]} position={[0, 0.47, 0]} />
      <group>
        <mesh castShadow position={[0, 0.38, 0]}>
          <boxGeometry args={[1.18, 0.55, 2.3]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.22} />
        </mesh>
        <mesh castShadow position={[0, 0.84, -0.42]}>
          <boxGeometry args={[0.94, 0.72, 0.98]} />
          <meshStandardMaterial color="#202a34" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.86, -0.93]}>
          <boxGeometry args={[0.78, 0.43, 0.025]} />
          <meshStandardMaterial color="#94d8f4" transparent opacity={0.72} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.48, 0.86, -0.42]}>
            <boxGeometry args={[0.025, 0.43, 0.58]} />
            <meshStandardMaterial color="#94d8f4" transparent opacity={0.55} />
          </mesh>
        ))}
        <mesh position={[0, 0.3, -1.18]}>
          <boxGeometry args={[0.76, 0.22, 0.08]} />
          <meshStandardMaterial color="#242b31" />
        </mesh>
        {WHEELS.map((wheel, index) => (
          <group
            key={`${wheel.x}-${wheel.z}`}
            ref={(node) => { wheelGroups.current[index] = node; }}
            position={[wheel.x, -0.54, wheel.z]}
          >
            <group>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 20]} />
                <meshStandardMaterial color="#171a21" roughness={0.96} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.22, 0.22, 0.29, 16]} />
                <meshStandardMaterial color="#aab0b5" metalness={0.7} roughness={0.3} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
