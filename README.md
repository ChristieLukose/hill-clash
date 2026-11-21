# Hill Clash 🚛
A 3D truck hill-climbing game with local split-screen racing.

## Tech stack
- React + TypeScript + Vite
- Three.js via React Three Fiber
- Rapier 3D rigid-body physics
- Rapier ray-cast vehicle controller

## Run locally
```bash
npm install
npm run dev
``

## Current gameplay
- 3D dynamic truck chassis with mass, gravity and rotational inertia
- Four ray-cast wheels with front/rear spring-damper suspension
- Engine force fades as vehicle speed rises
- Tire traction changes by terrain section; suspension load affects available grip
- Vehicle pitch, roll and yaw are simulated by the 3D rigid body
- One shared physics world for solo and local split-screen racing
- Independent chase cameras and physics HUD for both local players
- Static mountain, rock and tree collision geometry

## Controls

### Player 1
- W: accelerate
- S: reverse
- A / D: steer
- Space: brake
- R: reset truck

### Player 2 (local split screen)
- Up / Down: accelerate / reverse
- Left / Right: steer
- Shift: brake
- Enter: reset truck

## Notes on vehicle physics
Each truck chassis is a full 3D Rapier rigid body. The four wheels use Rapier's 3D ray-cast vehicle controller: wheel rays calculate suspension compression, contact forces, steering, engine force and tire friction against the terrain. Wheel meshes are rendered from the controller's wheel state; the wheels are not separate rigid bodies.

## Next milestones
1. Tune vehicle handling and suspension against the in-browser test
2. Add race countdown, checkpoints, finish logic and results
3. Add truck tuning and garage upgrades
4. Add online rooms and server-authoritative multiplayer
