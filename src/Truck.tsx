import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mountainHeight } from './HillTerrain';

// The truck faces toward -Z, matching the direction of the mountain climb.
const WHEEL_RADIUS = 0.36;
const SUSPENSION_REST = 0.38;
const SPRING_STIFFNESS = 18000;
const SPRING_DAMPING = 1450;
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
  const tangentForward = useMemo(() => new THREE.Vector3(), []);
  const tangentSide = useMemo(() => new THREE.Vector3(), []);
  const localOffset = useMemo(() => new THREE.Vector3(), []);
  const contact = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const spawn = useMemo<[number, number, number]>(
    () => [position[0], mountainHeight(position[0], position[2]) + 1.05, position[2]],
    [position[0], position[2]],
  );

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb) return;

    const dt = Math.min(delta, 1 / 30);
    const p = rb.translation();
    const q = rb.rotation();
    rotation.set(q.x, q.y, q.z, q.w);
    forward.set(0, 0, -1).applyQuaternion(rotation);
    right.set(1, 0, 0).applyQuaternion(rotation);

    const throttle = active
      ? (keys.has('w') || keys.has('arrowup') ? 1 : keys.has('s') || keys.has('arrowdown') ? -0.55 : 0)
      : 0;
    const steering = active
      ? (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0)
      : 0;

    if (active && keys.has('r')) {
      rb.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      wheelSpin.current = [0, 0, 0, 0];
      keys.delete('r');
    }

    const velocity = rb.linvel();
    const speed = Math.hypot(velocity.x, velocity.z);

    WHEELS.forEach((wheel, index) => {
      // Wheel anchor in truck-local space, transformed into world space.
      localOffset.set(wheel.x, -0.16, wheel.z).applyQuaternion(rotation);
      contact.set(p.x + localOffset.x, p.y + localOffset.y, p.z + localOffset.z);

      // Terrain gradient provides a surface normal for spring and tire forces.
      const groundY = mountainHeight(contact.x, contact.z);
      const sample = 0.16;
      const slopeX = (
        mountainHeight(contact.x + sample, contact.z) -
        mountainHeight(contact.x - sample, contact.z)
      ) / (2 * sample);
      const slopeZ = (
        mountainHeight(contact.x, contact.z + sample) -
        mountainHeight(contact.x, contact.z - sample)
      ) / (2 * sample);
      normal.set(-slopeX, 1, -slopeZ).normalize();

      const gap = contact.y - groundY - WHEEL_RADIUS;
      const compression = THREE.MathUtils.clamp(SUSPENSION_REST - gap, 0, SUSPENSION_REST);
      const groundPoint = { x: contact.x, y: groundY, z: contact.z };
      let longitudinalSpeed = 0;
      let gripScale = 1;

      if (gap < SUSPENSION_REST + 0.025) {
        const pointVelocity = rb.velocityAtPoint(groundPoint);
        const normalSpeed = pointVelocity.x * normal.x + pointVelocity.y * normal.y + pointVelocity.z * normal.z;

        // Progressive spring support and damping stop the chassis from bouncing uncontrollably.
        const springForce = THREE.MathUtils.clamp(
          SPRING_STIFFNESS * compression - SPRING_DAMPING * normalSpeed,
          0,
          9000,
        );
        if (springForce > 0) {
          rb.applyImpulseAtPoint(
            { x: normal.x * springForce * dt, y: normal.y * springForce * dt, z: normal.z * springForce * dt },
            groundPoint,
            true,
          );
        }

        tangentForward.copy(forward).addScaledVector(normal, -forward.dot(normal)).normalize();
        tangentSide.copy(right).addScaledVector(normal, -right.dot(normal)).normalize();

        // Grip progressively reduces on the loose upper ridge.
        const surfaceGrip = contact.z < -38 ? 0.42 : contact.z < -20 ? 0.62 : 0.84;
        const normalLoad = (850 * 9.81 * Math.max(0.3, normal.y)) / 4;
        const maxTireForce = surfaceGrip * normalLoad;
        longitudinalSpeed =
          pointVelocity.x * tangentForward.x +
          pointVelocity.y * tangentForward.y +
          pointVelocity.z * tangentForward.z;
        const lateralSpeed =
          pointVelocity.x * tangentSide.x +
          pointVelocity.y * tangentSide.y +
          pointVelocity.z * tangentSide.z;

        const driveRequest = throttle * 1550 - longitudinalSpeed * 80;
        const sideRequest = -lateralSpeed * 1350;
        const requestedForce = Math.hypot(driveRequest, sideRequest);
        gripScale = requestedForce > maxTireForce ? maxTireForce / requestedForce : 1;

        const driveForce = driveRequest * gripScale;
        const sideForce = sideRequest * gripScale;
        rb.applyImpulseAtPoint(
          {
            x: (tangentForward.x * driveForce + tangentSide.x * sideForce) * dt,
            y: (tangentForward.y * driveForce + tangentSide.y * sideForce) * dt,
            z: (tangentForward.z * driveForce + tangentSide.z * sideForce) * dt,
          },
          groundPoint,
          true,
        );
        wheelSpin.current[index] += (
          longitudinalSpeed / WHEEL_RADIUS +
          (1 - gripScale) * throttle * 16
        ) * dt;
      } else {
        wheelSpin.current[index] += throttle * 10 * dt;
      }

      const visual = wheelGroups.current[index];
      if (visual) {
        visual.position.y = -0.16 - SUSPENSION_REST + compression;
        visual.rotation.y = wheel.front ? steering * 0.28 : 0;
        const rollingGroup = visual.children[0] as THREE.Group | undefined;
        if (rollingGroup) rollingGroup.rotation.x = wheelSpin.current[index];
      }
    });

    // Steering torque is modest at low speed and builds as the truck moves.
    if (steering !== 0 && speed > 0.15) {
      rb.applyTorqueImpulse({ x: 0, y: steering * (110 + Math.min(speed, 14) * 24) * dt, z: 0 }, true);
    }

    if (active) {
      // A higher, steeper chase camera keeps the trail and wheel contact area in view.
      const cameraPosition = new THREE.Vector3(p.x, p.y + 6.2, p.z + 8.5);
      state.camera.position.lerp(cameraPosition, 0.09);
      state.camera.lookAt(p.x + forward.x * 1.5, p.y + 0.15, p.z + forward.z * 4.2);
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={spawn}
      mass={850}
      linearDamping={0.08}
      angularDamping={1.4}
      friction={0.8}
      restitution={0.01}
      ccd
    >
      <CuboidCollider args={[0.62, 0.46, 1.12]} position={[0, 0.47, 0]} />
      <group>
        {/* Chassis and cab now share the same forward axis as the climbing trail (-Z). */}
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
            position={[wheel.x, -0.16, wheel.z]}
          >
            <group>
              {/* Wheel cylinder axis points across the axle (X). */}
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
