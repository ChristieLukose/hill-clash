import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { NetworkSnapshot, RoomPlayer } from './network';

type RemoteTruckProps = {
  player: RoomPlayer;
  state: NetworkSnapshot;
};

export default function RemoteTruck({ player, state }: RemoteTruckProps) {
  const root = useRef<THREE.Group>(null);
  const wheels = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const initialized = useRef(false);
  const spin = useRef(0);
  const targetPosition = useMemo(
    () => new THREE.Vector3(state.position.x, state.position.y, state.position.z),
    [state.position.x, state.position.y, state.position.z],
  );
  const targetRotation = useMemo(
    () => new THREE.Quaternion(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w),
    [state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w],
  );

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;

    if (!initialized.current) {
      group.position.copy(targetPosition);
      group.quaternion.copy(targetRotation);
      initialized.current = true;
    } else {
      const blend = 1 - Math.exp(-delta * 14);
      group.position.lerp(targetPosition, blend);
      group.quaternion.slerp(targetRotation, blend);
    }

    spin.current += (state.speed / 0.43) * delta;
    wheels.current.forEach((wheel) => {
      if (wheel) {
        const rolling = wheel.children[0] as THREE.Group | undefined;
        if (rolling) rolling.rotation.z = spin.current;
      }
    });
  });

  return (
    <group ref={root}>
      <group>
        <mesh castShadow position={[0, 0.18, 0]}>
          <boxGeometry args={[2.78, 0.58, 1.42]} />
          <meshStandardMaterial color={player.color} roughness={0.42} metalness={0.24} />
        </mesh>
        <mesh castShadow position={[0.35, 0.77, 0]}>
          <boxGeometry args={[1.12, 0.78, 1.12]} />
          <meshStandardMaterial color="#202a34" roughness={0.34} />
        </mesh>
        <mesh position={[0.93, 0.78, 0]}>
          <boxGeometry args={[0.025, 0.46, 0.96]} />
          <meshStandardMaterial color="#94d8f4" transparent opacity={0.72} />
        </mesh>
        {[-0.78, 0.78].flatMap((z, row) => [-1.02, 1.02].map((x, col) => {
          const index = row * 2 + col;
          return (
            <group
              key={`${z}-${x}`}
              ref={(node) => { wheels.current[index] = node; }}
              position={[x, -0.82, z]}
            >
              <group>
                <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.43, 0.43, 0.32, 22]} />
                  <meshStandardMaterial color="#171a21" roughness={0.95} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.23, 0.23, 0.33, 18]} />
                  <meshStandardMaterial color="#aab0b5" metalness={0.68} roughness={0.3} />
                </mesh>
              </group>
            </group>
          );
        }))}
      </group>

      <Html position={[0, 2.05, 0]} center distanceFactor={13} style={{ pointerEvents: 'none' }}>
        <div className="truck-nameplate" style={{ borderColor: player.color }}>
          <span className="truck-nameplate-dot" style={{ background: player.color }} />
          <span>{player.name}</span>
        </div>
      </Html>
    </group>
  );
}
