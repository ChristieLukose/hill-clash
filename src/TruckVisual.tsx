import * as THREE from 'three';

const WHEEL_LAYOUT = [
  { x: 1.02, z: -0.78 },
  { x: 1.02, z: 0.78 },
  { x: -1.02, z: -0.78 },
  { x: -1.02, z: 0.78 },
] as const;

type TruckVisualProps = {
  color: string;
  wheelRefs: { current: Array<THREE.Group | null> };
};

/**
 * Shared visual-only truck model. Physics remains on the parent Rapier body;
 * these meshes are deliberately detailed without adding extra colliders.
 */
export default function TruckVisual({ color, wheelRefs }: TruckVisualProps) {
  const spokes = [0, 1, 2, 3, 4, 5];
  const lugs = [0, 1, 2, 3, 4];

  return (
    <group>
      {/* Lower chassis and protected underbody */}
      <mesh castShadow receiveShadow position={[-0.02, -0.12, 0]}>
        <boxGeometry args={[2.72, 0.22, 1.34]} />
        <meshStandardMaterial color="#171d22" roughness={0.82} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[-0.06, 0.08, 0]}>
        <boxGeometry args={[2.76, 0.18, 1.42]} />
        <meshPhysicalMaterial color={color} roughness={0.3} metalness={0.38} clearcoat={0.82} clearcoatRoughness={0.22} />
      </mesh>

      {/* Hood, sculpted shoulders and front wings */}
      <mesh castShadow receiveShadow position={[0.78, 0.39, 0]}>
        <boxGeometry args={[0.92, 0.28, 1.38]} />
        <meshPhysicalMaterial color={color} roughness={0.28} metalness={0.42} clearcoat={0.9} clearcoatRoughness={0.18} />
      </mesh>
      <mesh castShadow position={[1.12, 0.32, 0]}>
        <boxGeometry args={[0.28, 0.16, 1.42]} />
        <meshPhysicalMaterial color={color} roughness={0.3} metalness={0.38} clearcoat={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[0.88, 0.2, side * 0.69]}>
          <boxGeometry args={[0.85, 0.22, 0.12]} />
          <meshPhysicalMaterial color={color} roughness={0.34} metalness={0.32} clearcoat={0.72} />
        </mesh>
      ))}

      {/* Cabin shell, roof and dark window surrounds */}
      <mesh castShadow receiveShadow position={[0.28, 0.78, 0]}>
        <boxGeometry args={[1.18, 0.82, 1.2]} />
        <meshPhysicalMaterial color="#222b33" roughness={0.38} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[0.28, 1.205, 0]}>
        <boxGeometry args={[1.2, 0.075, 1.25]} />
        <meshPhysicalMaterial color={color} roughness={0.28} metalness={0.4} clearcoat={0.9} />
      </mesh>
      <mesh position={[0.89, 0.83, 0]}>
        <boxGeometry args={[0.025, 0.48, 0.98]} />
        <meshPhysicalMaterial color="#172d3b" roughness={0.12} metalness={0.18} transparent opacity={0.76} />
      </mesh>
      <mesh position={[-0.315, 0.84, 0]}>
        <boxGeometry args={[0.022, 0.44, 0.88]} />
        <meshPhysicalMaterial color="#142b39" roughness={0.14} metalness={0.12} transparent opacity={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0.29, 0.84, side * 0.608]}>
            <boxGeometry args={[0.78, 0.47, 0.018]} />
            <meshPhysicalMaterial color="#183544" roughness={0.13} metalness={0.16} transparent opacity={0.74} />
          </mesh>
          <mesh position={[0.29, 1.09, side * 0.615]}>
            <boxGeometry args={[0.82, 0.035, 0.025]} />
            <meshStandardMaterial color="#11191f" metalness={0.48} roughness={0.34} />
          </mesh>
          <mesh position={[0.29, 0.59, side * 0.615]}>
            <boxGeometry args={[0.82, 0.035, 0.025]} />
            <meshStandardMaterial color="#11191f" metalness={0.48} roughness={0.34} />
          </mesh>
          {/* Door seam, handle and mirror */}
          <mesh position={[-0.2, 0.47, side * 0.616]}>
            <boxGeometry args={[0.012, 0.62, 0.008]} />
            <meshStandardMaterial color="#172027" roughness={0.8} />
          </mesh>
          <mesh position={[-0.06, 0.78, side * 0.635]}>
            <boxGeometry args={[0.13, 0.025, 0.025]} />
            <meshStandardMaterial color="#aeb7bd" metalness={0.82} roughness={0.24} />
          </mesh>
          <mesh position={[0.78, 0.99, side * 0.74]}>
            <boxGeometry args={[0.12, 0.045, 0.18]} />
            <meshStandardMaterial color="#151c22" metalness={0.35} roughness={0.42} />
          </mesh>
          <mesh position={[0.79, 1.015, side * 0.82]}>
            <boxGeometry args={[0.16, 0.11, 0.11]} />
            <meshPhysicalMaterial color="#26313a" metalness={0.55} roughness={0.24} clearcoat={0.7} />
          </mesh>
        </group>
      ))}

      {/* Roof details and off-road accessories */}
      <mesh castShadow position={[-0.12, 1.27, 0]}>
        <boxGeometry args={[0.7, 0.035, 0.82]} />
        <meshStandardMaterial color="#171f26" metalness={0.62} roughness={0.38} />
      </mesh>
      {[-0.34, 0.34].map((z) => (
        <mesh key={z} position={[-0.12, 1.32, z]}>
          <boxGeometry args={[0.72, 0.045, 0.035]} />
          <meshStandardMaterial color="#77838b" metalness={0.78} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[-0.42, 1.36, -0.34]} rotation={[0, 0, -0.13]}>
        <cylinderGeometry args={[0.012, 0.012, 0.28, 8]} />
        <meshStandardMaterial color="#222a30" metalness={0.45} roughness={0.48} />
      </mesh>

      {/* Front grille, lamps, indicators and steel bumper */}
      <mesh castShadow position={[1.435, 0.39, 0]}>
        <boxGeometry args={[0.055, 0.34, 0.68]} />
        <meshStandardMaterial color="#0d1419" metalness={0.25} roughness={0.64} />
      </mesh>
      {[-0.105, -0.035, 0.035, 0.105].map((y) => (
        <mesh key={y} position={[1.468, 0.39 + y, 0]}>
          <boxGeometry args={[0.018, 0.018, 0.58]} />
          <meshStandardMaterial color="#77838a" metalness={0.82} roughness={0.3} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh castShadow position={[1.45, 0.59, side * 0.49]}>
            <boxGeometry args={[0.075, 0.19, 0.25]} />
            <meshPhysicalMaterial color="#d9eaf0" emissive="#a9dfff" emissiveIntensity={1.15} roughness={0.16} clearcoat={1} />
          </mesh>
          <mesh position={[1.45, 0.43, side * 0.62]}>
            <boxGeometry args={[0.055, 0.08, 0.09]} />
            <meshStandardMaterial color="#e78a35" emissive="#9b4a0b" emissiveIntensity={0.45} roughness={0.28} />
          </mesh>
          <mesh castShadow position={[-1.405, 0.39, side * 0.52]}>
            <boxGeometry args={[0.065, 0.19, 0.15]} />
            <meshStandardMaterial color="#8e2420" emissive="#4b0704" emissiveIntensity={0.45} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[1.49, 0.19, 0]}>
        <boxGeometry args={[0.18, 0.17, 1.53]} />
        <meshStandardMaterial color="#252d33" metalness={0.72} roughness={0.42} />
      </mesh>
      <mesh castShadow position={[-1.43, 0.16, 0]}>
        <boxGeometry args={[0.16, 0.15, 1.47]} />
        <meshStandardMaterial color="#252d33" metalness={0.72} roughness={0.44} />
      </mesh>
      {[-0.55, 0.55].map((z) => (
        <mesh key={z} position={[1.59, 0.12, z]}>
          <boxGeometry args={[0.11, 0.12, 0.08]} />
          <meshStandardMaterial color="#8d969b" metalness={0.82} roughness={0.34} />
        </mesh>
      ))}

      {/* Side steps and rugged wheel arch trim */}
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[-0.08, -0.11, side * 0.78]}>
          <boxGeometry args={[1.08, 0.09, 0.19]} />
          <meshStandardMaterial color="#20282e" metalness={0.58} roughness={0.56} />
        </mesh>
      ))}
      {WHEEL_LAYOUT.map((wheel) => (
        <mesh
          key={`arch-${wheel.x}-${wheel.z}`}
          position={[wheel.x, -0.28, wheel.z * 1.015]}
          rotation={[0, 0, 0]}
        >
          <torusGeometry args={[0.51, 0.055, 8, 32]} />
          <meshPhysicalMaterial color={color} metalness={0.25} roughness={0.48} clearcoat={0.35} />
        </mesh>
      ))}

      {/* Four detailed wheels: independent pivots preserve suspension and spin animation. */}
      {WHEEL_LAYOUT.map((wheel, index) => (
        <group
          key={`wheel-${wheel.x}-${wheel.z}`}
          ref={(node) => { wheelRefs.current[index] = node; }}
          position={[wheel.x, -0.83, wheel.z]}
        >
          <group>
            <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.43, 0.43, 0.36, 36, 1]} />
              <meshStandardMaterial color="#111519" roughness={0.96} metalness={0.02} />
            </mesh>
            {/* Chunky all-terrain tread blocks */}
            {Array.from({ length: 18 }, (_, tread) => {
              const angle = (tread / 18) * Math.PI * 2;
              return (
                <mesh
                  key={tread}
                  castShadow
                  position={[Math.sin(angle) * 0.419, Math.cos(angle) * 0.419, 0]}
                  rotation={[0, 0, -angle]}
                >
                  <boxGeometry args={[0.14, 0.052, 0.31]} />
                  <meshStandardMaterial color="#171c20" roughness={1} />
                </mesh>
              );
            })}
            {[-1, 1].map((side) => (
              <group key={side} position={[0, 0, side * 0.185]}>
                <mesh rotation={[0, 0, 0]}>
                  <torusGeometry args={[0.305, 0.025, 8, 32]} />
                  <meshStandardMaterial color="#343a3d" roughness={0.84} metalness={0.08} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.245, 0.245, 0.025, 28]} />
                  <meshStandardMaterial color="#69747b" metalness={0.78} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, side * 0.018]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.205, 0.205, 0.018, 28]} />
                  <meshStandardMaterial color="#222a30" metalness={0.72} roughness={0.32} />
                </mesh>
                {spokes.map((spoke) => (
                  <mesh
                    key={spoke}
                    position={[0, 0.105, side * 0.033]}
                    rotation={[0, 0, (spoke / spokes.length) * Math.PI * 2]}
                  >
                    <boxGeometry args={[0.052, 0.19, 0.025]} />
                    <meshStandardMaterial color="#b2bbc0" metalness={0.86} roughness={0.24} />
                  </mesh>
                ))}
                <mesh position={[0, 0, side * 0.052]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.085, 0.085, 0.025, 20]} />
                  <meshStandardMaterial color="#aeb7bc" metalness={0.9} roughness={0.22} />
                </mesh>
                {lugs.map((lug) => {
                  const angle = (lug / lugs.length) * Math.PI * 2;
                  return (
                    <mesh
                      key={lug}
                      position={[Math.sin(angle) * 0.135, Math.cos(angle) * 0.135, side * 0.052]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.018, 0.018, 0.025, 8]} />
                      <meshStandardMaterial color="#d1d6d8" metalness={0.92} roughness={0.2} />
                    </mesh>
                  );
                })}
              </group>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
