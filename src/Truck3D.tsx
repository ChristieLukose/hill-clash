import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RapierRigidBody,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
} from '@react-three/rapier';
import * as THREE from 'three';
import { roadCenterX, roadHeight } from './HillTerrain';

const MASS = 1250;
const WHEEL_RADIUS = 0.43;
const WHEEL_REST_LENGTH = 0.55;
const WHEEL_MOUNT_Y = -0.28;
const MAX_ENGINE_FORCE = 8600;
const MAX_BRAKE_FORCE = 4200;
const MAX_STEER_ANGLE = 0.42;
const MAX_SPEED = 22;

const WHEELS = [
  { x: 1.02, z: -0.78, front: true, driveShare: 0.21 },
  { x: 1.02, z: 0.78, front: true, driveShare: 0.21 },
  { x: -1.02, z: -0.78, front: false, driveShare: 0.29 },
  { x: -1.02, z: 0.78, front: false, driveShare: 0.29 },
] as const;

const pressedKeys = new Set<string>();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') event.preventDefault();
    pressedKeys.add(key);
  });
  window.addEventListener('keyup', (event) => pressedKeys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => pressedKeys.clear());
}

export type VehicleHud = {
  speed: number;
  progress: number;
  gear: string;
  pitch: number;
  roll: number;
  frontLoad: number;
  rearLoad: number;
  frontSlip: number;
  rearSlip: number;
};

type Truck3DProps = {
  player: 1 | 2;
  color: string;
  laneStart: number;
  active: boolean;
  camera: RefObject<THREE.PerspectiveCamera | null>;
  onHud?: (hud: VehicleHud) => void;
};

function readControls(player: 1 | 2) {
  if (player === 1) {
    return {
      throttle: (pressedKeys.has('w') ? 1 : 0) - (pressedKeys.has('s') ? 0.62 : 0),
      steering: (pressedKeys.has('d') ? 1 : 0) - (pressedKeys.has('a') ? 1 : 0),
      brake: pressedKeys.has(' '),
      reset: pressedKeys.has('r'),
    };
  }
  return {
    throttle: (pressedKeys.has('arrowup') ? 1 : 0) - (pressedKeys.has('arrowdown') ? 0.62 : 0),
    steering: (pressedKeys.has('arrowright') ? 1 : 0) - (pressedKeys.has('arrowleft') ? 1 : 0),
    brake: pressedKeys.has('shift'),
    reset: pressedKeys.has('enter'),
  };
}

export default function Truck3D({
  player,
  color,
  laneStart,
  active,
  camera,
  onHud,
}: Truck3DProps) {
  const { world, rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const vehicle = useRef<ReturnType<typeof world.createVehicleController> | null>(null);
  const wheelVisuals = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const wheelSpinPrevious = useRef([0, 0, 0, 0]);
  const wheelSlip = useRef([0, 0, 0, 0]);
  const hudClock = useRef(0);
  const activeRef = useRef(active);
  const onHudRef = useRef(onHud);
  const spawn = useMemo<[number, number, number]>(() => {
    const progress = 2;
    return [roadCenterX(progress) + laneStart, roadHeight(progress) + 1.25, -progress];
  }, [laneStart]);

  activeRef.current = active;
  onHudRef.current = onHud;

  useBeforePhysicsStep((physicsWorld) => {
    const chassis = body.current;
    if (!activeRef.current || !chassis) return;

    // Construct Rapier's native 3D ray-cast vehicle controller once the
    // dynamic chassis has been registered with the physics world.
    if (!vehicle.current) {
      const controller = world.createVehicleController(chassis);
      // Chassis-local +X is forward, +Y is up, and +Z is the wheel axle.
      controller.setIndexForwardAxis(0);
      controller.setIndexUpAxis(1);

      WHEELS.forEach((wheel, index) => {
        controller.addWheel(
          { x: wheel.x, y: WHEEL_MOUNT_Y, z: wheel.z },
          { x: 0, y: -1, z: 0 },
          { x: 0, y: 0, z: 1 },
          WHEEL_REST_LENGTH,
          WHEEL_RADIUS,
        );
        controller.setWheelSuspensionStiffness(index, 34);
        controller.setWheelSuspensionCompression(index, 5.2);
        controller.setWheelSuspensionRelaxation(index, 6.4);
        controller.setWheelMaxSuspensionTravel(index, 0.34);
        controller.setWheelMaxSuspensionForce(index, 9200);
        controller.setWheelFrictionSlip(index, 7.2);
        controller.setWheelSideFrictionStiffness(index, 1.35);
      });
      vehicle.current = controller;
    }

    const controller = vehicle.current;
    const input = readControls(player);
    const dt = physicsWorld.integrationParameters.dt;
    const translation = chassis.translation();
    const currentSpeed = controller.currentVehicleSpeed();

    if (input.reset) {
      chassis.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
      chassis.setRotation(
        { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        true,
      );
      chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
      wheelSpinPrevious.current = [0, 0, 0, 0];
      wheelSlip.current = [0, 0, 0, 0];
      pressedKeys.delete(player === 1 ? 'r' : 'enter');
    }

    // Engine output falls away as forward speed approaches the top gear limit.
    const speedFade = THREE.MathUtils.clamp(1 - Math.abs(currentSpeed) / MAX_SPEED, 0.18, 1);
    const engineForce = MAX_ENGINE_FORCE * speedFade * input.throttle;
    const progress = Math.max(0, -translation.z);
    const terrainGrip = progress > 38 ? 4.0 : progress > 20 ? 5.6 : 7.4;

    for (let i = 0; i < WHEELS.length; i += 1) {
      const wheel = WHEELS[i];
      controller.setWheelFrictionSlip(i, terrainGrip);
      controller.setWheelEngineForce(i, engineForce * wheel.driveShare);
      controller.setWheelBrake(i, input.brake ? MAX_BRAKE_FORCE : 0);
      controller.setWheelSteering(i, wheel.front ? input.steering * MAX_STEER_ANGLE : 0);
    }

    // Exclude dynamic bodies from suspension rays; the static mountain, rocks
    // and terrain colliders remain valid wheel-contact surfaces.
    controller.updateVehicle(dt, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
  });

  useEffect(() => () => {
    if (vehicle.current) {
      world.removeVehicleController(vehicle.current);
      vehicle.current = null;
    }
  }, [world]);

  useFrame((_, delta) => {
    const chassis = body.current;
    if (!chassis) return;

    const p = chassis.translation();
    const q = chassis.rotation();
    const quaternion = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const controller = vehicle.current;

    if (controller) {
      const speed = controller.currentVehicleSpeed();
      const dt = Math.max(delta, 1 / 240);

      WHEELS.forEach((wheel, index) => {
        const visual = wheelVisuals.current[index];
        if (!visual) return;

        const suspensionLength = controller.wheelSuspensionLength(index) ?? WHEEL_REST_LENGTH;
        const steerAngle = controller.wheelSteering(index) ?? 0;
        const wheelRotation = controller.wheelRotation(index) ?? 0;
        const previousRotation = wheelSpinPrevious.current[index];
        const angularRate = (wheelRotation - previousRotation) / dt;
        const wheelLinearSpeed = angularRate * WHEEL_RADIUS;
        wheelSlip.current[index] = THREE.MathUtils.clamp(
          Math.abs(wheelLinearSpeed - speed) / Math.max(Math.abs(speed), 2.0),
          0,
          1,
        );
        wheelSpinPrevious.current[index] = wheelRotation;

        visual.position.set(wheel.x, WHEEL_MOUNT_Y - suspensionLength, wheel.z);
        visual.rotation.y = wheel.front ? steerAngle : 0;
        const spinningWheel = visual.children[0] as THREE.Group | undefined;
        if (spinningWheel) spinningWheel.rotation.z = wheelRotation;
      });

      // Follow the vehicle from behind its local +X forward axis.
      if (activeRef.current && camera.current) {
        const behind = new THREE.Vector3(-8.5, 0, 0).applyQuaternion(quaternion);
        const desired = new THREE.Vector3(
          p.x + behind.x,
          p.y + 4.6,
          p.z + behind.z,
        );
        camera.current.position.lerp(desired, 0.085);
        const forward = new THREE.Vector3(4.2, 0, 0).applyQuaternion(quaternion);
        camera.current.up.set(0, 1, 0);
        camera.current.lookAt(p.x + forward.x, p.y + 0.45, p.z + forward.z);
      }

      hudClock.current += delta;
      if (activeRef.current && hudClock.current > 0.12 && onHudRef.current) {
        hudClock.current = 0;
        const rotationEuler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
        const frontLoad =
          (controller.wheelSuspensionForce(0) ?? 0) +
          (controller.wheelSuspensionForce(1) ?? 0);
        const rearLoad =
          (controller.wheelSuspensionForce(2) ?? 0) +
          (controller.wheelSuspensionForce(3) ?? 0);

        onHudRef.current({
          speed: Math.abs(speed) * 3.6,
          progress: Math.max(0, -p.z),
          gear: speed < -0.35 ? 'R' : speed > 14 ? '3' : speed > 6 ? '2' : speed > 0.35 ? '1' : 'N',
          pitch: THREE.MathUtils.radToDeg(rotationEuler.z),
          roll: THREE.MathUtils.radToDeg(rotationEuler.x),
          frontLoad: frontLoad / 1000,
          rearLoad: rearLoad / 1000,
          frontSlip: Math.max(wheelSlip.current[0], wheelSlip.current[1]),
          rearSlip: Math.max(wheelSlip.current[2], wheelSlip.current[3]),
        });
      }
    }
  });

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={spawn}
      rotation={[0, Math.PI / 2, 0]}
      linearDamping={0.025}
      angularDamping={0.75}
      friction={0.85}
      restitution={0.01}
      ccd
      canSleep={false}
    >
      <CuboidCollider
        args={[1.38, 0.42, 0.72]}
        position={[0, 0.12, 0]}
        mass={MASS}
        friction={0.85}
        restitution={0}
      />

      <group>
        {/* The chassis' local +X face is the front of the truck. */}
        <mesh castShadow position={[0, 0.18, 0]}>
          <boxGeometry args={[2.78, 0.58, 1.42]} />
          <meshStandardMaterial color={color} roughness={0.42} metalness={0.24} />
        </mesh>
        <mesh castShadow position={[0.35, 0.77, 0]}>
          <boxGeometry args={[1.12, 0.78, 1.12]} />
          <meshStandardMaterial color="#202a34" roughness={0.34} />
        </mesh>
        <mesh position={[0.93, 0.78, 0]}>
          <boxGeometry args={[0.025, 0.46, 0.96]} />
          <meshStandardMaterial color="#94d8f4" transparent opacity={0.72} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0.36, 0.78, side * 0.57]}>
            <boxGeometry args={[0.76, 0.44, 0.025]} />
            <meshStandardMaterial color="#94d8f4" transparent opacity={0.56} />
          </mesh>
        ))}
        <mesh position={[1.13, 0.24, 0]}>
          <boxGeometry args={[0.45, 0.18, 1.12]} />
          <meshStandardMaterial color="#252a30" />
        </mesh>

        {WHEELS.map((wheel, index) => (
          <group
            key={`${wheel.x}-${wheel.z}`}
            ref={(node) => { wheelVisuals.current[index] = node; }}
            position={[wheel.x, WHEEL_MOUNT_Y - WHEEL_REST_LENGTH, wheel.z]}
          >
            <group>
              <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 24]} />
                <meshStandardMaterial color="#171a21" roughness={0.95} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.23, 0.23, 0.33, 18]} />
                <meshStandardMaterial color="#aab0b5" metalness={0.68} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0, 0.17]}>
                <cylinderGeometry args={[0.075, 0.075, 0.015, 12]} />
                <meshStandardMaterial color="#4a535c" metalness={0.65} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
