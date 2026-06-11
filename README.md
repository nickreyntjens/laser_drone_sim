# Laser Drone Mission Simulation

Interactive React, TypeScript, and Three.js simulation for a laser-equipped agricultural drone neutralizing Colorado potato beetles in a potato field. The goal is to serve as a trust-building landing-page asset: the visitor sees a polished mission animation while the telemetry and energy accounting expose the feasibility assumptions.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Create a production build:

```bash
npm run build
```

4. Run the engine regression suite:

```bash
npm run test:run
```

5. Run the screenshot-based visual regression:

```bash
npm run test:visual
```

## Stack

- React 18 + TypeScript
- Vite
- Three.js with `@react-three/fiber` and `@react-three/drei`
- Post-processing (bloom, SMAA) via `@react-three/postprocessing`

## Third-party 3D assets

- `public/models/drone.glb` — "Drone" by NateGazzard via [Poly Pizza](https://poly.pizza/m/DNbUoMtG3H), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- `public/models/beetle.glb` — "Beetle" by Poly by Google via [Poly Pizza](https://poly.pizza/m/4yufxgZ1QQ2), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

## Project structure

- `src/App.tsx`: page composition and scenario state.
- `src/components/SimulationScene.tsx`: Three.js scene, drone model, camera rig, laser beam, field, dock, and target visuals.
- `src/components/ControlPanel.tsx`: adjustable landing-page controls, mission-mode toggle, and battery-depreciation inputs.
- `src/components/LiveMetrics.tsx`: live telemetry.
- `src/components/SummaryPanel.tsx`: end-of-run metrics and energy breakdown.
- `src/components/MethodologyPanel.tsx`: concise explanation of model scope and presentation choices.
- `src/hooks/useMissionController.ts`: requestAnimationFrame loop and snapshot publishing.
- `src/sim/engine.ts`: mission state machine, motion model, power model, reserve logic, and summary metrics.
- `src/sim/generation.ts`: sweep path generation and hectare-based beetle spatial distribution.
- `src/sim/planner.ts`: scalable pre-surveyed route planner for known beetle locations.
- `src/sim/engine.test.ts`: non-visual regression tests for mission progress, reserve behavior, recharge-resume, queue integrity, and completion.
- `tests/beetle-visibility.spec.ts`: browser screenshot test that verifies multiple beetles are visible together in the intro.

## Methodology

### Motion model

- In `search` mode the drone follows a boustrophedon sweep path across the field.
- In `preSurveyed` mode the drone starts with a known beetle map and follows a scalable route-planning heuristic instead of waiting for live detections.
- When a beetle enters the detection radius during a sweep, or when the next pre-surveyed target becomes active, the drone diverts to an engagement hover point above that target.
- The engagement sequence is explicit: approach, aim, fire for the configured dwell time, confirm, then resume the mission.
- When the projected return-to-dock energy plus reserve margin approaches the remaining battery energy, the drone aborts the local task, returns to the dock, recharges, and resumes.

### Power model

- **Hover/support power**: derived from a momentum-theory induced-power estimate using drone mass, air density, rotor disk area, and a fixed propulsion efficiency.
- **Forward-flight power**: hover/support power plus a parasite-drag term that scales with `v^3` through an effective drag area.
- **Acceleration penalty**: positive acceleration and braking both add an energy overhead. Braking is not regenerative.
- **Climb/descent**: climb power uses `m * g * vertical_speed / efficiency`. Descent is modeled as a smaller non-regenerative control penalty.
- **Laser draw**: electrical power is added only during the firing state.
- **Avionics draw**: constant baseline power during flight states.
- **Cost per hectare**: battery depreciation only. Equivalent full cycles come from total mission energy throughput divided by pack capacity, then scaled by replacement cost and rated cycle life and normalized by field area.

### Beetle spatial distribution

- Beetles are generated with a non-uniform Poisson point process.
- The maximum intensity is set by the invasion-edge density control in beetles per hectare.
- The requested beetles-per-hectare value sets the expected total beetle count over the whole field; the decay parameter redistributes those beetles toward the invasion edge instead of reducing the total population.
- Acceptance probability decays exponentially with distance from the invasion edge, producing higher pressure at one field boundary and lower pressure deeper into the crop.
- Accepted points are snapped onto crop rows with small canopy-scale jitter so the targets read as being on or near potato plants rather than uniformly scattered in open space.

### Recharge logic

- The dock sits at the field edge.
- Reserve logic uses battery state of charge plus an estimate of direct return energy from the drone's current position.
- Recharge is modeled as a deterministic linear ramp to full battery over the configured recharge time. If the user wants to interpret this as a battery swap, they can simply set a shorter recharge time.

## Credibility boundaries

### Physics-based approximations

- Mass, battery capacity, cruise speed, rotor loading, drag area, laser draw, avionics draw, reserve threshold, and recharge time affect the mission metrics directly.
- Total energy, mission time, recharge count, energy per beetle, and the reported energy breakdown are computed from the mission simulation rather than hard-coded.

### Visual choices

- The rendered field uses a compressed visual scale so the scene fits comfortably in a browser viewport.
- The player has a small embedded mode and an expanded inspection mode. In the compact state the scene chrome is intentionally minimal; deeper controls move below the canvas or into the expanded overlay.
- Playback runs faster than real mission time so a landing-page visitor can watch a full sortie in a reasonable amount of time.
- Beetle markers are visually enlarged to keep targets legible.
- At high target counts the renderer switches to a simplified dense-marker mode with lower DPR so the browser does not have to allocate thousands of individual mesh objects.

## Debugging

- In dev mode, the mission engine emits structured events to the browser console with the `[mission]` prefix.
- The regression tests are designed to catch non-visual failures such as stalled target approach, dead targets remaining in the queue, reserve-threshold violations, charging loops, and missions that fail to complete.
- The visual test opens the intro overview camera and checks a real screenshot for multiple simultaneous beetle markers.

## Limitations

- The power model is a first-order engineering estimate, not a full rotorcraft or CFD model.
- Wind, gust rejection, battery voltage sag, thermal limits, and sensor false positives are not modeled.
- Search coverage assumes the vision system can reliably detect targets within the configured footprint during a sweep pass.
- Recharge is linear and deterministic; real field operations may use non-linear charging or hot-swappable batteries.

## Adapting the experience

- Tune the default parameters in `src/sim/defaults.ts`.
- Extend the drone geometry and field dressing in `src/components/SimulationScene.tsx`.
- Replace the simple dock recharge with a full battery-swap animation if the product story emphasizes pack exchange instead of charging.
- Use `?embed=1` to hide the landing-page hero and render the compact player shell; use the in-app `Get big` button to expand it into an immersive overlay.
