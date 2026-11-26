import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  CuboidCollider,
  RapierRigidBody,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
} from '@react-three/rapier';
import * as THREE from 'three';
import { mountainHeight, roadCenterX, roadHeight, type TerrainType } from './HillTerrain';
import type { VehicleNetworkState } from './network';

const MASS = 1250;
const WHEEL_RADIUS = 0.43;
const WHEEL_REST_LENGTH = 0.55;
const WHEEL_MOUNT_Y = -0.28;
const MAX_ENGINE_FORCE = 8600;
const MAX_BRAKE_FORCE = 5000;
const MAX_STEER_ANGLE = 0.39;
const MAX_SPEED = 22;

const WHEELS = [
  { x: 1.02, z: -0.78, front: true, driveShare: 0.21 },
  { x: 1.02, z: 0.78, front: true, driveShare: 0.21 },
  { x: -1.02, z: -0.78, front: false, driveShare: 0.29 },
  { x: -1.02, z: 0.78, front: false, driveShare: 0.29 },
] as const;

function spawnAtProgress(progress: number, laneStart: number, terrainType: TerrainType): [number, number, number] {
  const safeProgress = THREE.MathUtils.clamp(progress, 2, 70);
  const centerX = roadCenterX(safeProgress, terrainType) + laneStart;
  const highestWheelGround = Math.max(
    ...WHEELS.map((wheel) => mountainHeight(centerX + wheel.z, -(safeProgress + wheel.x), terrainType)),
  );
  const hubToGroundReach = WHEEL_REST_LENGTH + WHEEL_RADIUS;
  const bodyHeight = highestWheelGround + hubToGroundReach - WHEEL_MOUNT_Y - 0.02;
  return [centerX, bodyHeight, -safeProgress];
}

const pressedKeys = new Set<string>();

type TouchControl = 'left' | 'right' | 'throttle' | 'reverse' | 'brake' | 'reset';

const TOUCH_CONTROL_KEYS: Record<TouchControl, string> = {
  left: 'a',
  right: 'd',
  throttle: 'w',
  reverse: 's',
  brake: ' ',
  reset: 'r',
};

export function setTouchControl(control: TouchControl, pressed: boolean) {
  const key = TOUCH_CONTROL_KEYS[control];
  if (pressed) pressedKeys.add(key);
  else pressedKeys.delete(key);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) ||
      ['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(code)
    ) event.preventDefault();
    pressedKeys.add(key);
    pressedKeys.add(code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.key.toLowerCase());
    pressedKeys.delete(event.code.toLowerCase());
  };
  // Capture phase ensures game input still sees keys when a UI child handles
  // or stops the bubbling keyboard event.
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', () => pressedKeys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pressedKeys.clear();
  });
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
  wheelContacts: number;
  input: string;
  lateral: number;
  warning: string;
};

type Truck3DProps = {
  player: 1 | 2;
  color: string;
  laneStart: number;
  active: boolean;
  camera: RefObject<THREE.PerspectiveCamera | null>;
  onHud?: (hud: VehicleHud) => void;
  playerName: string;
  terrainType: TerrainType;
  startProgress?: number;
  onNetworkState?: (state: VehicleNetworkState) => void;
  onFinish?: () => void;
};

function isPressed(key: string, code?: string) {
  return pressedKeys.has(key) || (code ? pressedKeys.has(code) : false);
}

function readControls(player: 1 | 2) {
  if (player === 1) {
    return {
      throttle: (isPressed('w', 'keyw') ? 1 : 0) - (isPressed('s', 'keys') ? 0.62 : 0),
      steering: (isPressed('d', 'keyd') ? 1 : 0) - (isPressed('a', 'keya') ? 1 : 0),
      brake: isPressed(' ', 'space'),
      reset: isPressed('r', 'keyr'),
    };
  }
  return {
    throttle: (isPressed('arrowup') ? 1 : 0) - (isPressed('arrowdown') ? 0.62 : 0),
    steering: (isPressed('arrowright') ? 1 : 0) - (isPressed('arrowleft') ? 1 : 0),
    brake: isPressed('shift', 'shiftleft') || isPressed('shift', 'shiftright'),
    reset: isPressed('enter', 'enter'),
  };
}

export default function Truck3D({
  player,
  color,
  laneStart,
  active,
  camera,
  onHud,
  playerName,
  terrainType,
  startProgress = 2,
  onNetworkState,
  onFinish,
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
  const networkStateRef = useRef(onNetworkState);
  const finishRef = useRef(onFinish);
  const networkClock = useRef(0);
  const finishSent = useRef(false);
  const overturnedClock = useRef(0);
  const offTrackClock = useRef(0);
  const wrongWayClock = useRef(0);
  const safeProgress = useRef(startProgress);
  const motionWarning = useRef('');
  const warningHold = useRef(0);
  const steeringValue = useRef(0);
  const cameraLookTarget = useRef(new THREE.Vector3());
  const cameraTargetInitialized = useRef(false);
  const spawn = useMemo<[number, number, number]>(
    () => spawnAtProgress(startProgress, laneStart, terrainType),
    [laneStart, startProgress, terrainType],
  );

  activeRef.current = active;
  onHudRef.current = onHud;
  networkStateRef.current = onNetworkState;
  finishRef.current = onFinish;

  useBeforePhysicsStep((physicsWorld) => {
    const chassis = body.current;
    if (!activeRef.current || !chassis) return;

    // Construct Rapier's native 3D ray-cast vehicle controller once the
    // dynamic chassis has been registered with the physics world.
    if (!vehicle.current) {
      const controller = world.createVehicleController(chassis);
      // Rapier's default vehicle axes are local +X forward and +Y up,
      // which match this chassis. Keep the defaults; the forward-axis API is
      // a property setter, not a callable method.

      WHEELS.forEach((wheel, index) => {
        controller.addWheel(
          { x: wheel.x, y: WHEEL_MOUNT_Y, z: wheel.z },
          { x: 0, y: -1, z: 0 },
          { x: 0, y: 0, z: 1 },
          WHEEL_REST_LENGTH,
          WHEEL_RADIUS,
        );
        controller.setWheelSuspensionStiffness(index, 32);
        controller.setWheelSuspensionCompression(index, 5.6);
        controller.setWheelSuspensionRelaxation(index, 6.8);
        controller.setWheelMaxSuspensionTravel(index, 0.4);
        controller.setWheelMaxSuspensionForce(index, 9800);
        controller.setWheelFrictionSlip(index, 7.6);
        controller.setWheelSideFrictionStiffness(index, 1.5);
      });
      vehicle.current = controller;
    }

    const controller = vehicle.current;
    const input = readControls(player);
    const dt = physicsWorld.integrationParameters.dt;
    let translation = chassis.translation();
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
      finishSent.current = false;
      overturnedClock.current = 0;
      offTrackClock.current = 0;
      wrongWayClock.current = 0;
      safeProgress.current = startProgress;
      motionWarning.current = '';
      warningHold.current = 0;
      steeringValue.current = 0;
      translation = chassis.translation();
      pressedKeys.delete(player === 1 ? 'r' : 'enter');
    }

    // If the truck remains upside down at low speed, right it at the nearest
    // safe point on the trail. Also recover if it falls below the terrain.
    const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion(
        chassis.rotation().x,
        chassis.rotation().y,
        chassis.rotation().z,
        chassis.rotation().w,
      ),
    );
    const belowTerrain = translation.y < mountainHeight(translation.x, translation.z, terrainType) - 1.8;
    if (chassisUp.y < 0.18 && Math.abs(currentSpeed) < 3.2) {
      overturnedClock.current += dt;
    } else {
      overturnedClock.current = 0;
    }

    const progressAlongTrack = THREE.MathUtils.clamp(-translation.z, 2, 70);
    const trackCenter = roadCenterX(progressAlongTrack, terrainType);
    const lateralOffset = translation.x - trackCenter;
    const velocity = chassis.linvel();
    const progressAhead = Math.min(71, progressAlongTrack + 0.8);
    const progressBehind = Math.max(1, progressAlongTrack - 0.8);
    const tangent = new THREE.Vector3(
      (roadCenterX(progressAhead, terrainType) - roadCenterX(progressBehind, terrainType)) /
        Math.max(0.1, progressAhead - progressBehind),
      (roadHeight(progressAhead, terrainType) - roadHeight(progressBehind, terrainType)) /
        Math.max(0.1, progressAhead - progressBehind),
      -1,
    ).normalize();
    const alongTrackSpeed = new THREE.Vector3(velocity.x, velocity.y, velocity.z).dot(tangent);
    const isOffTrack = Math.abs(lateralOffset) > 6.1;
    const isGoingWrongWay = alongTrackSpeed < -1.4 && Math.hypot(velocity.x, velocity.z) > 2;

    offTrackClock.current = isOffTrack ? offTrackClock.current + dt : Math.max(0, offTrackClock.current - dt * 2);
    wrongWayClock.current = isGoingWrongWay ? wrongWayClock.current + dt : Math.max(0, wrongWayClock.current - dt * 2);
    warningHold.current = Math.max(0, warningHold.current - dt);

    if (Math.abs(lateralOffset) < 4.5 && chassisUp.y > 0.45 && !isGoingWrongWay) {
      safeProgress.current = Math.max(safeProgress.current, progressAlongTrack);
    }

    if (isOffTrack && offTrackClock.current > 0.7) {
      motionWarning.current = 'OFF TRACK';
    } else if (isGoingWrongWay && wrongWayClock.current > 0.7) {
      motionWarning.current = 'WRONG WAY';
    } else if (warningHold.current <= 0) {
      motionWarning.current = '';
    }

    const offTrackRecovery = offTrackClock.current >= 3.6;
    const wrongWayRecovery = wrongWayClock.current >= 4.2;
    if (overturnedClock.current >= 2.2 || belowTerrain || offTrackRecovery || wrongWayRecovery) {
      const recoveryProgress = wrongWayRecovery
        ? THREE.MathUtils.clamp(safeProgress.current, 2, 70)
        : progressAlongTrack;
      const recoverySpawn = spawnAtProgress(recoveryProgress, laneStart, terrainType);
      chassis.setTranslation(
        { x: recoverySpawn[0], y: recoverySpawn[1], z: recoverySpawn[2] },
        true,
      );
      chassis.setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, true);
      chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
      wheelSpinPrevious.current = [0, 0, 0, 0];
      wheelSlip.current = [0, 0, 0, 0];
      steeringValue.current = 0;
      overturnedClock.current = 0;
      offTrackClock.current = 0;
      wrongWayClock.current = 0;
      motionWarning.current = wrongWayRecovery
        ? 'WRONG WAY · RETURNED TO CHECKPOINT'
        : offTrackRecovery
          ? 'OFF TRACK · RETURNED TO TRACK'
          : 'TRUCK RECOVERED';
      warningHold.current = 2.6;
      translation = chassis.translation();
    }

    // Engine output falls away as forward speed approaches the top gear limit.
    const speedFade = THREE.MathUtils.clamp(1 - Math.abs(currentSpeed) / MAX_SPEED, 0.18, 1);
    const engineForce = MAX_ENGINE_FORCE * speedFade * input.throttle;
    if (input.throttle !== 0 || input.steering !== 0 || input.brake) chassis.wakeUp();
    const progress = Math.max(0, -translation.z);
    const terrainGrip = progress > 38 ? 5.1 : progress > 20 ? 6.2 : 7.6;
    steeringValue.current = THREE.MathUtils.damp(
      steeringValue.current,
      input.steering,
      input.steering === 0 ? 8 : 12,
      dt,
    );
    const steeringSpeedFactor = THREE.MathUtils.clamp(Math.abs(currentSpeed) / 16, 0, 1);
    const steeringLimit = THREE.MathUtils.lerp(MAX_STEER_ANGLE, MAX_STEER_ANGLE * 0.58, steeringSpeedFactor);

    for (let i = 0; i < WHEELS.length; i += 1) {
      const wheel = WHEELS[i];
      controller.setWheelFrictionSlip(i, terrainGrip);
      controller.setWheelEngineForce(i, engineForce * wheel.driveShare);
      controller.setWheelBrake(i, input.brake ? MAX_BRAKE_FORCE : 0);
      controller.setWheelSteering(i, wheel.front ? steeringValue.current * steeringLimit : 0);
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
    const speed = controller
      ? controller.currentVehicleSpeed()
      : chassis.linvel().x;

    if (controller) {
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

      if (activeRef.current && camera.current) {
        // Follow vehicle yaw only so bumps and rollovers do not tilt the view.
        const yaw = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ').y;
        const yawRotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          yaw,
        );
        const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / MAX_SPEED, 0, 1);
        const followDistance = 9.2 + speedFactor * 1.2;
        const behind = new THREE.Vector3(-followDistance, 0, 0).applyQuaternion(yawRotation);
        const desired = new THREE.Vector3(
          p.x + behind.x,
          p.y + 5.1 + speedFactor * 0.45,
          p.z + behind.z,
        );
        const smooth = 1 - Math.exp(-4.5 * Math.max(delta, 0));
        camera.current.position.lerp(desired, smooth);

        const forward = new THREE.Vector3(4.6, 0, 0).applyQuaternion(yawRotation);
        const lookTarget = new THREE.Vector3(p.x + forward.x, p.y + 0.9, p.z + forward.z);
        if (!cameraTargetInitialized.current) {
          cameraLookTarget.current.copy(lookTarget);
          cameraTargetInitialized.current = true;
        } else {
          cameraLookTarget.current.lerp(lookTarget, 1 - Math.exp(-6 * Math.max(delta, 0)));
        }
        camera.current.up.set(0, 1, 0);
        camera.current.lookAt(cameraLookTarget.current);
      }
    }

    // Send compact vehicle snapshots to the room server at 20 Hz.
    // The room server relays these transforms to the other racers.
    networkClock.current += delta;
    const progressNow = Math.max(0, -p.z);
    if (activeRef.current && networkClock.current >= 0.05) {
      networkClock.current = 0;
      if (networkStateRef.current) {
        networkStateRef.current({
          position: { x: p.x, y: p.y, z: p.z },
          rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
          speed: speed,
          progress: progressNow,
        });
      }
    }
    if (activeRef.current && progressNow >= 72 && !finishSent.current) {
      finishSent.current = true;
      finishRef.current?.();
    }

    // Keep HUD live even if the vehicle controller fails to initialize. This
    // exposes keyboard receipt and wheel contacts instead of silently showing
    // the initial all-zero HUD values.
    hudClock.current += delta;
    if (activeRef.current && hudClock.current > 0.12 && onHudRef.current) {
      hudClock.current = 0;
      const controls = readControls(player);
      const rotationEuler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
      const frontLoad = controller
        ? (controller.wheelSuspensionForce(0) ?? 0) + (controller.wheelSuspensionForce(1) ?? 0)
        : 0;
      const rearLoad = controller
        ? (controller.wheelSuspensionForce(2) ?? 0) + (controller.wheelSuspensionForce(3) ?? 0)
        : 0;
      const keyLabel = controls.throttle > 0
        ? 'ACCEL'
        : controls.throttle < 0
          ? 'REVERSE'
          : controls.steering !== 0
            ? 'STEER'
            : controls.brake
              ? 'BRAKE'
              : controller
                ? 'READY'
                : 'INIT';

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
        wheelContacts: controller
          ? WHEELS.filter((_, index) => controller.wheelIsInContact(index)).length
          : -1,
        input: keyLabel,
        lateral: p.x - roadCenterX(progressNow, terrainType),
        warning: motionWarning.current,
      });
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
        friction={0.95}
        restitution={0.01}
      />
      <CuboidCollider
        args={[0.58, 0.39, 0.56]}
        position={[0.35, 0.77, 0]}
        density={0.35}
        friction={0.8}
        restitution={0.01}
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
      <Html position={[0, 2.05, 0]} center distanceFactor={13} style={{ pointerEvents: 'none' }}>
        <div className="truck-nameplate" style={{ borderColor: color }}>
          <span className="truck-nameplate-dot" style={{ background: color }} />
          <span>{playerName}</span>
          {player === 1 && <small>YOU</small>}
        </div>
      </Html>
    </RigidBody>
  );
}
