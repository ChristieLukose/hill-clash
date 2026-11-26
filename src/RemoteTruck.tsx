import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { NetworkSnapshot, RoomPlayer } from './network';
import TruckVisual from './TruckVisual';

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
      <TruckVisual color={player.color} wheelRefs={wheels} />

      <Html position={[0, 2.05, 0]} center distanceFactor={13} style={{ pointerEvents: 'none' }}>
        <div className="truck-nameplate" style={{ borderColor: player.color }}>
          <span className="truck-nameplate-dot" style={{ background: player.color }} />
          <span>{player.name}</span>
        </div>
      </Html>
    </group>
  );
}
