import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { roadCenterX, roadHeight, roadSlope } from './HillTerrain';

const MASS = 1250;
const INERTIA = 2350;
const HALF_WHEELBASE = 1.15;
const MOUNT_Y = -0.22;
const WHEEL_RADIUS = 0.42;
const SPRING_REST = 0.34;
const SPRING_K = 32000;
const SPRING_C = 8200;
const ENGINE_FORCE = 8500;
const BRAKE_FORCE = 11000;
const MAX_SPEED = 24;
const FIXED_DT = 1 / 120;

type Axle = {
  name: 'front' | 'rear';
  longitudinal: number;
  driveShare: number;
};

const AXLES: Axle[] = [
  { name: 'front', longitudinal: HALF_WHEELBASE, driveShare: 0.36 },
  { name: 'rear', longitudinal: -HALF_WHEELBASE, driveShare: 0.64 },
];

type ModelState = {
  progress: number;
  height: number;
  speed: number;
  verticalSpeed: number;
  pitch: number;
  pitchRate: number;
  lane: number;
  laneSpeed: number;
  frontLoad: number;
  rearLoad: number;
  frontCompression: number;
  rearCompression: number;
  frontSlip: number;
  rearSlip: number;
  frontWheelSpin: number;
  rearWheelSpin: number;
};

export type TruckHud = {
  speed: number;
  progress: number;
  gear: string;
  pitch: number;
  frontLoad: number;
  rearLoad: number;
  frontSlip: number;
  rearSlip: number;
};

type TruckPhysicsProps = {
  player: 1 | 2;
  color: string;
  laneStart: number;
  active: boolean;
  onHud?: (hud: TruckHud) => void;
};

const keys = new Set<string>();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key.startsWith('arrow')) event.preventDefault();
    keys.add(key);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
}

function controlsFor(player: 1 | 2) {
  if (player === 1) {
    return {
      throttle: (keys.has('w') ? 1 : 0) + (keys.has('s') ? -0.62 : 0),
      steer: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
      brake: keys.has(' '),
      reset: keys.has('r'),
    };
  }
  return {
    throttle: (keys.has('arrowup') ? 1 : 0) + (keys.has('arrowdown') ? -0.62 : 0),
    steer: (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0),
    brake: keys.has('shift'),
    reset: keys.has('enter'),
  };
}

function createState(laneStart: number): ModelState {
  const progress = 2;
  const pitch = Math.atan(roadSlope(progress));
  // Static spring compression at rest: mg is shared by the two axle springs.
  const staticCompression = (MASS * 9.81) / (2 * SPRING_K);
  const height = roadHeight(progress) + WHEEL_RADIUS + SPRING_REST - staticCompression - MOUNT_Y;
  return {
    progress, height, speed: 0, verticalSpeed: 0, pitch, pitchRate: 0,
    lane: laneStart, laneSpeed: 0,
    frontLoad: MASS * 9.81 * 0.5,
    rearLoad: MASS * 9.81 * 0.5,
    frontCompression: staticCompression, rearCompression: staticCompression,
    frontSlip: 0, rearSlip: 0, frontWheelSpin: 0, rearWheelSpin: 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** One deterministic 2D rigid-body step in the road/height plane. */
function integrate(state: ModelState, throttle: number, steering: number, braking: boolean, dt: number) {
  const cos = Math.cos(state.pitch);
  const sin = Math.sin(state.pitch);
  let forceProgress = -state.speed * 95 - state.speed * Math.abs(state.speed) * 3.4;
  let forceHeight = -MASS * 9.81;
  let torque = -state.pitchRate * 1150;

  const axleLoads: Record<'front' | 'rear', number> = { front: 0, rear: 0 };
  const compressions: Record<'front' | 'rear', number> = { front: 0, rear: 0 };
  const slips: Record<'front' | 'rear', number> = { front: 0, rear: 0 };
  const spinRates: Record<'front' | 'rear', number> = { front: 0, rear: 0 };

  for (const axle of AXLES) {
    // Body-local axle mount rotated by chassis pitch. Progress is positive uphill.
    const rProgress = axle.longitudinal * cos - MOUNT_Y * sin;
    const rHeight = axle.longitudinal * sin + MOUNT_Y * cos;
    const axleProgress = state.progress + rProgress;
    const anchorHeight = state.height + rHeight;

    const grade = roadSlope(axleProgress);
    const normalLength = Math.sqrt(1 + grade * grade);
    const normalProgress = -grade / normalLength;
    const normalHeight = 1 / normalLength;
    const tangentProgress = 1 / normalLength;
    const tangentHeight = grade / normalLength;

    const ground = roadHeight(axleProgress);
    const signedAnchorDistance = (anchorHeight - ground) / normalLength;
    const springLength = signedAnchorDistance - WHEEL_RADIUS;
    const compression = clamp(SPRING_REST - springLength, 0, SPRING_REST);
    const anchorSpeedProgress = state.speed - state.pitchRate * rHeight;
    const anchorSpeedHeight = state.verticalSpeed + state.pitchRate * rProgress;
    const normalSpeed = anchorSpeedProgress * normalProgress + anchorSpeedHeight * normalHeight;
    const springForce = clamp(SPRING_K * compression - SPRING_C * normalSpeed, 0, 28000);

    axleLoads[axle.name] = springForce;
    compressions[axle.name] = compression;
    forceProgress += normalProgress * springForce;
    forceHeight += normalHeight * springForce;
    torque += rProgress * (normalHeight * springForce) - rHeight * (normalProgress * springForce);

    // Grade gravity is shared between axles. Engine torque fades with speed.
    const axleSpeed = anchorSpeedProgress * tangentProgress + anchorSpeedHeight * tangentHeight;
    const speedFade = clamp(1 - Math.abs(axleSpeed) / MAX_SPEED, 0.22, 1);
    const engineRequest = ENGINE_FORCE * speedFade * throttle * axle.driveShare;
    const gravityHoldRequest = MASS * 9.81 * tangentHeight * axle.driveShare;
    const rollingRequest = -axleSpeed * 260;
    const brakeRequest = braking
      ? -Math.sign(Math.abs(axleSpeed) < 0.04 ? gravityHoldRequest : axleSpeed) * BRAKE_FORCE * axle.driveShare
      : 0;
    const requestedTraction = engineRequest + gravityHoldRequest + rollingRequest + brakeRequest;

    const terrainGrip = axleProgress > 38 ? 0.62 : axleProgress > 20 ? 0.78 : 0.94;
    const tractionLimit = terrainGrip * springForce;
    const appliedTraction = clamp(requestedTraction, -tractionLimit, tractionLimit);
    const slip = Math.abs(requestedTraction) > 1
      ? clamp(1 - Math.abs(appliedTraction) / Math.abs(requestedTraction), 0, 1)
      : 0;

    const tractionProgress = tangentProgress * appliedTraction;
    const tractionHeight = tangentHeight * appliedTraction;
    forceProgress += tractionProgress;
    forceHeight += tractionHeight;
    torque += rProgress * tractionHeight - rHeight * tractionProgress;

    slips[axle.name] = slip;
    spinRates[axle.name] = axleSpeed / WHEEL_RADIUS + Math.sign(throttle) * slip * 28;
  }

  const accelerationProgress = forceProgress / MASS;
  const accelerationHeight = forceHeight / MASS;
  const angularAcceleration = torque / INERTIA;

  // Semi-implicit Euler with a fixed time step gives repeatable spring behaviour.
  state.speed += accelerationProgress * dt;
  state.verticalSpeed += accelerationHeight * dt;
  state.pitchRate += angularAcceleration * dt;
  state.progress += state.speed * dt;
  state.height += state.verticalSpeed * dt;
  state.pitch += state.pitchRate * dt;

  // Steering moves the vehicle within the broad dirt lane; it does not fake pitch.
  state.laneSpeed += (steering * 5.5 - state.laneSpeed * 3.2) * dt;
  state.lane += state.laneSpeed * dt;
  state.lane = clamp(state.lane, -3.0, 3.0);

  // Guard against numerical runaway if the vehicle leaves the sampled course.
  state.progress = clamp(state.progress, -1, 72);
  state.height = clamp(state.height, roadHeight(state.progress) - 1.5, roadHeight(state.progress) + 8);
  state.pitch = clamp(state.pitch, -0.85, 0.85);
  state.pitchRate = clamp(state.pitchRate, -3.5, 3.5);

  state.frontLoad = axleLoads.front;
  state.rearLoad = axleLoads.rear;
  state.frontCompression = compressions.front;
  state.rearCompression = compressions.rear;
  state.frontSlip = slips.front;
  state.rearSlip = slips.rear;
  state.frontWheelSpin = spinRates.front;
  state.rearWheelSpin = spinRates.rear;
}

export default function TruckPhysics({ player, color, laneStart, active, onHud }: TruckPhysicsProps) {
  const state = useRef<ModelState>(createState(laneStart));
  const root = useRef<THREE.Group>(null);
  const chassis = useRef<THREE.Group>(null);
  const frontWheels = useRef<Array<THREE.Group | null>>([null, null]);
  const rearWheels = useRef<Array<THREE.Group | null>>([null, null]);
  const accumulator = useRef(0);
  const hudClock = useRef(0);
  const sim = state.current;

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 0.05);
    if (active) {
      accumulator.current += dt;
      const input = controlsFor(player);
      if (input.reset) {
        const fresh = createState(laneStart);
        Object.assign(sim, fresh);
        accumulator.current = 0;
        keys.delete(player === 1 ? 'r' : 'enter');
      }

      let steps = 0;
      while (accumulator.current >= FIXED_DT && steps < 8) {
        integrate(sim, input.throttle, input.steer, input.brake, FIXED_DT);
        accumulator.current -= FIXED_DT;
        steps += 1;
      }
      if (steps === 8) accumulator.current = 0;
    }

    const centerX = roadCenterX(sim.progress);
    const pathDelta = roadCenterX(sim.progress + 0.1) - roadCenterX(sim.progress - 0.1);
    const pathYaw = -Math.atan(pathDelta / 0.2);
    const worldX = centerX + sim.lane;

    if (root.current) {
      root.current.position.set(worldX, sim.height, -sim.progress);
      root.current.rotation.y = pathYaw;
    }
    if (chassis.current) chassis.current.rotation.x = sim.pitch;

    const setWheel = (wheel: THREE.Group | null, axleProgress: number, localZ: number, spin: number) => {
      if (!wheel) return;
      const targetHubY = roadHeight(axleProgress) + WHEEL_RADIUS;
      const cosPitch = Math.max(0.25, Math.cos(sim.pitch));
      wheel.position.y = (targetHubY - sim.height + localZ * Math.sin(sim.pitch)) / cosPitch;
      wheel.rotation.x = spin * Math.min(1, Math.abs(sim.speed) / 2 + 0.15);
    };

    const frontProgress = sim.progress + HALF_WHEELBASE * Math.cos(sim.pitch);
    const rearProgress = sim.progress - HALF_WHEELBASE * Math.cos(sim.pitch);
    setWheel(frontWheels.current[0], frontProgress, -HALF_WHEELBASE, sim.frontWheelSpin);
    setWheel(frontWheels.current[1], frontProgress, -HALF_WHEELBASE, sim.frontWheelSpin);
    setWheel(rearWheels.current[0], rearProgress, HALF_WHEELBASE, sim.rearWheelSpin);
    setWheel(rearWheels.current[1], rearProgress, HALF_WHEELBASE, sim.rearWheelSpin);

    if (active && root.current) {
      const cameraTarget = new THREE.Vector3(worldX + 3.2, sim.height + 4.3, -sim.progress + 7.6);
      frame.camera.position.lerp(cameraTarget, 0.09);
      frame.camera.lookAt(worldX, sim.height + 0.25, -sim.progress - 4.5);
    }

    hudClock.current += dt;
    if (active && onHud && hudClock.current > 0.12) {
      hudClock.current = 0;
      onHud({
        speed: Math.abs(sim.speed) * 3.6,
        progress: Math.max(0, sim.progress),
        gear: sim.speed < -0.3 ? 'R' : sim.speed > 14 ? '3' : sim.speed > 6 ? '2' : sim.speed > 0.3 ? '1' : 'N',
        pitch: sim.pitch * 180 / Math.PI,
        frontLoad: sim.frontLoad / 1000,
        rearLoad: sim.rearLoad / 1000,
        frontSlip: sim.frontSlip,
        rearSlip: sim.rearSlip,
      });
    }
  });

  return (
    <group ref={root}>
      <group ref={chassis}>
        {/* Low, wide chassis keeps the centre of mass visually believable. */}
        <mesh castShadow position={[0, 0.25, 0]}>
          <boxGeometry args={[1.35, 0.58, 2.65]} />
          <meshStandardMaterial color={color} roughness={0.42} metalness={0.22} />
        </mesh>
        <mesh castShadow position={[0, 0.76, -0.42]}>
          <boxGeometry args={[1.06, 0.78, 1.05]} />
          <meshStandardMaterial color="#202a34" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.78, -0.97]}>
          <boxGeometry args={[0.88, 0.46, 0.025]} />
          <meshStandardMaterial color="#94d8f4" transparent opacity={0.7} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.54, 0.79, -0.42]}>
            <boxGeometry args={[0.025, 0.46, 0.62]} />
            <meshStandardMaterial color="#94d8f4" transparent opacity={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 0.18, 1.02]}>
          <boxGeometry args={[1.1, 0.18, 0.45]} />
          <meshStandardMaterial color="#252a30" />
        </mesh>

        {[-0.64, 0.64].map((x, index) => (
          <group key={`front-${x}`} ref={(node) => { frontWheels.current[index] = node; }} position={[x, -0.55, -HALF_WHEELBASE]}>
            <group>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 22]} />
                <meshStandardMaterial color="#171a21" roughness={0.95} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.23, 0.23, 0.35, 16]} />
                <meshStandardMaterial color="#aab0b5" metalness={0.65} roughness={0.3} />
              </mesh>
            </group>
          </group>
        ))}
        {[-0.64, 0.64].map((x, index) => (
          <group key={`rear-${x}`} ref={(node) => { rearWheels.current[index] = node; }} position={[x, -0.55, HALF_WHEELBASE]}>
            <group>
              <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 22]} />
                <meshStandardMaterial color="#171a21" roughness={0.95} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.23, 0.23, 0.35, 16]} />
                <meshStandardMaterial color="#aab0b5" metalness={0.65} roughness={0.3} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
