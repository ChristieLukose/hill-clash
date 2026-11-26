# Hill Clash 🚛

A 3D truck climbing game with full 3D Rapier vehicle physics and online multiplayer races.

## Tech stack

- React + TypeScript + Vite
- Three.js via React Three Fiber
- Rapier 3D rigid-body vehicle controller
- Node.js + Express + Socket.IO online room server

## Run locally

Install dependencies:

```bash
npm install
```

Start the Vite client and Socket.IO server together:

```bash
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Online multiplayer

1. Open **Online Multiplayer**.
2. Enter a driver name and select **Create Race Room**.
3. Share the six-character room code with friends.
4. Other players open the same deployed Hill Clash website, choose **Online Multiplayer**, enter their name and the room code, then select **Join Room**.
5. The room host selects **Start Race** once at least two drivers are present.

Rooms support up to eight drivers. Each driver plays from their own computer or mobile device. Every client renders the same mountain and displays remote trucks with floating nameplates above them.

## Controls

- W: accelerate
- S: reverse
- A / D: steer
- Space: brake
- R: reset truck

## Online server and deployment

The Node server serves the built frontend and the Socket.IO connection from one web service.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check: `/health`

A Render blueprint is included in `render.yaml`. Connect this GitHub repository to Render and deploy the web service. Render supports WebSocket connections on web services.

For local development, Vite proxies `/socket.io` to the Node server on port 3001.

## Physics and networking notes

Each player's truck is a 3D Rapier rigid body with a four-wheel ray-cast vehicle controller. The local client simulates its own vehicle and sends position/rotation snapshots to the Socket.IO room server. The server relays snapshots to the other drivers.

This is a first online-playable networking layer, not yet server-authoritative physics. A production competitive release should move race simulation and finish validation server-side and add stronger input validation, reconnect handling and persistent player identity.

## Next milestones

1. Test online rooms across separate devices and tune interpolation/latency.
2. Move race authority and finish validation to the server.
3. Add race matchmaking, countdown polish, rematch and leaderboards.
4. Add accounts, progression and truck upgrades.
