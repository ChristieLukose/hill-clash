import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BallCollider, CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mountainHeight } from './HillTerrain';

const MASS = 850;
const WHEEL_RADIUS = 0.36;
const WHEEL_LOCAL_Y = -0.54;
const CHASSIS_CLEARANCE = 0.90;
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
  const driveDirection = useMemo(() => new THREE.Vector3(), []);
  const sideDirection = useMemo(() => new THREE.Vector3(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);
  const spawn = useMemo<[number, number, number]>(() => {
    // Put every tire just above its local road height so Rapier settles it onto
    // the terrain on the first physics steps rather than starting penetrated.
    const highestWheelGround = Math.max(
      ...WHEELS.map((wheel) => mountainHeight(position[0] + wheel.x, position[2] + wheel.z)),
    );
    return [position[0], highestWheelGround - WHEEL_LOCAL_Y + WHEEL_RADIUS + 0.025, position[2]];
  }, [position[0], position[2]]);

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb || !active) return;

    const dt = Math.min(delta, 1 / 60);
    const p = rb.translation();
    const rotation = rb.rotation();
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
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

    // Keep drive and lateral forces horizontal. The road collider and gravity
    // provide the vertical reaction; propulsion must not launch the truck uphill.
    const sample = 0.18;
    const slopeX = (
      mountainHeight(p.x + sample, p.z) - mountainHeight(p.x - sample, p.z)
    ) / (2 * sample);
    const slopeZ = (
      mountainHeight(p.x, p.z + sample) - mountainHeight(p.x, p.z - sample)
    ) / (2 * sample);
    normal.set(-slopeX, 1, -slopeZ).normalize();

    driveDirection.set(forward.x, 0, forward.z).normalize();
    sideDirection.set(right.x, 0, right.z).normalize();

    const grip = p.z < -38 ? 0.40 : p.z < -20 ? 0.60 : 0.82;
    const forwardSpeed = velocity.x * driveDirection.x + velocity.z * driveDirection.z;
    const sideSpeed = velocity.x * sideDirection.x + velocity.z * sideDirection.z;
    const requestedDrive = throttle * 5800 - forwardSpeed * 230;
    const maxTraction = grip * MASS * 9.81 * 0.82;
    const appliedDrive = THREE.MathUtils.clamp(requestedDrive, -maxTraction, maxTraction);
    const appliedSide = THREE.MathUtils.clamp(-sideSpeed * 1200, -maxTraction * 0.7, maxTraction * 0.7);

    rb.applyImpulse({
      x: (driveDirection.x * appliedDrive + sideDirection.x * appliedSide) * dt,
      y: 0,
      z: (driveDirection.z * appliedDrive + sideDirection.z * appliedSide) * dt,
    }, true);

    if (keys.has(' ')) {
      const brake = THREE.MathUtils.clamp(speed * MASS * 1.8, 0, 9000);
      if (speed > 0.01) {
        rb.applyImpulse({ x: -velocity.x / speed * brake * dt, y: 0, z: -velocity.z / speed * brake * dt }, true);
      }
    }

    if (steering !== 0 && speed > 0.2) {
      rb.applyTorqueImpulse({ x: 0, y: steering * (110 + Math.min(speed, 14) * 24) * dt, z: 0 }, true);
    }

    // Wheels are real Rapier contact colliders. Visual spin mirrors vehicle speed;
    // suspension joints can be added once stable four-wheel contact is verified.
    WHEELS.forEach((wheel, index) => {
      const visual = wheelGroups.current[index];
      wheelSpin.current[index] += (forwardSpeed / WHEEL_RADIUS + throttle * (1 - grip) * 7) * dt;
      if (visual) {
        visual.rotation.y = wheel.front ? steering * 0.22 : 0;
        const rolling = visual.children[0] as THREE.Group | undefined;
        if (rolling) rolling.rotation.x = wheelSpin.current[index];
      }
    });

    const cameraPosition = new THREE.Vector3(p.x, p.y + 5.2, p.z + 8.4);
    state.camera.position.lerp(cameraPosition, 0.085);
    state.camera.lookAt(p.x, p.y + 0.35, p.z - 3.8);
  });

  return (
    <RigidBody
      ref={body}
      type={active ? 'dynamic' : 'fixed'}
      colliders={false}
      position={spawn}
      mass={MASS}
      linearDamping={0.12}
      angularDamping={2.8}
      friction={0.9}
      restitution={0}
      ccd
    >
      {/* Chassis collider sits above the four tire contact points. */}
      <CuboidCollider args={[0.62, 0.46, 1.12]} position={[0, 0.47, 0]} friction={0.8} restitution={0} />
      {WHEELS.map((wheel) => (
        <BallCollider
          key={`${wheel.x}-${wheel.z}`}
          args={[WHEEL_RADIUS]}
          position={[wheel.x, WHEEL_LOCAL_Y, wheel.z]}
          friction={1.35}
          restitution={0}
        />
      ))}

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
            position={[wheel.x, WHEEL_LOCAL_Y, wheel.z]}
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
