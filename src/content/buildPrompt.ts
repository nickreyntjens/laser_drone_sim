export const BUILD_PROMPT = `In ChatGPT codex version 5.4 paste the following:

Inspect the GitHub repo for the current implementation and design baseline before making changes:
https://github.com/nickreyntjens/laser_drone_sim

Build a browser-based visual simulation for https://photonicinsecticides.com that demonstrates the feasibility of a laser-equipped drone eliminating Colorado potato beetles in a potato field.

The simulation must do two things at once:

1. Be scientifically credible enough that a technically minded visitor feels:
- "If they invested this much effort into a detailed simulation, they likely also did serious work on the underlying feasibility calculations."
- "The power consumption and mission time seem realistic and manageable."
- "I can mentally picture this becoming real."

2. Be visually impressive enough that a non-expert visitor intuitively understands:
- a drone can patrol a field,
- detect beetles,
- fire a laser at them,
- manage energy intelligently,
- and complete the job with realistic recharge cycles.

Core goal:
Create an interactive, animated web simulation that reduces the psychological distance between concept and reality. The visitor should feel like they are "seeing the system work," not just reading claims.

Technical requirements:
- Target: website-embeddable simulation running in the browser.
- Preferred stack: TypeScript + React + Three.js.
- Production-quality, visually polished, and suitable for a modern landing page.
- Efficient enough to run smoothly on normal desktop browsers.
- Organize the code cleanly and document assumptions.

Scientific/modeling requirements:
Include at least:
- drone mass
- battery capacity
- state of charge
- hover power
- forward flight power
- acceleration/deceleration power
- aerodynamic drag
- cruise speed
- optional climb/descent energy
- laser power draw
- avionics / onboard compute power draw
- recharge or battery swap behavior below a reserve threshold

Mission logic:
- Drone starts from a charging dock at the field edge.
- Drone patrols the field and engages all detected beetles.
- When battery falls below a configurable safe threshold, it must return to dock, recharge, and resume.
- Report total mission time, total energy consumed, recharge cycles, beetles eliminated, average time per target, energy per beetle, and energy fractions for flight, laser, hover, and acceleration.

Beetle distribution:
- Model Colorado potato beetle invasion pressure entering from one field side.
- Use a stochastic spatial distribution whose density is highest near the invasion edge and decays with depth into the field.
- A Poisson point process with a depth-dependent intensity gradient is a good starting point.
- Beetle pressure should be expressed in beetles per hectare.
- Default field size should be 10 hectares.
- Default beetle pressure should be 400 beetles per hectare and adjustable up to 2000.

Detection and engagement logic:
- Beetles are discrete targets on or near crop rows.
- Support two mission modes:
  1. live-search mode, where the drone must detect beetles during a sweep
  2. pre-surveyed mode, where a prior scouting drone already identified all beetle locations
- In pre-surveyed mode, use a sensible traveling-salesman-style heuristic that does not get algorithmically stuck on large target counts.
- Include realistic engagement phases: detect, stabilize/aim, fire for dwell time, confirm kill, move on.

Visual/animation requirements:
- 3D potato field scene
- visually appealing drone model
- realistic drone motion: roll, pitch, smooth turning, subtle stabilization
- visible laser firing events
- beetles visibly disappear or are marked neutralized
- charging dock / base station
- camera controls or curated camera angles
- all beetles must be visible from the beginning of the intro sequence; they should not pop into existence later
- have the beetles visibly fall onto the field at the beginning of the simulation
- add an option to hide all non-selected target markers and make that the default so the viewport is less cluttered
- add moving farmers as realistic scale references in the field and block firing whenever a farmer is inside the nominal laser safety zone

UI requirements:
- Setup, telemetry, mission report, and model notes must be pop-up panels/dialogs.
- The app must support a compact small mode for use under a webpage hero, plus a larger immersive mode like a YouTube player expansion.
    - In small mode, only mission time, field size, beetle pressure, state, and a "Get big and configure" control should appear on the visual canvas.
    - In big mode, provide a clean-viewport mode that hides buttons, labels, and telemetry overlays, while keeping a single toggle visible so the user can restore the rest of the controls; the attitude / horizon instrument should remain visible in that mode.
    - Add a playback-speed dropdown with values 1x, 2x, 5.25x, 10.5x, 20x, and 40x, and default it to 1x.
    - If algorithmically possible, playback speed should change render-time speedup without degrading simulation time granularity; use fixed simulation substeps instead of simply multiplying the integrator timestep.
    - Show main on-canvas telemetry in big mode: mission time, current speed, state, field size, beetle pressure, instantaneous power, battery remaining in kWh, and beetles neutralized.
    - Add a compact artificial-horizon / attitude indicator in the top-right corner of the big viewport, roughly half the size of the previous instrument treatment.
    - Add contextual tooltips or small info icons for options whose meaning is not immediately obvious, such as Known locations and playback speed.
    - The first time the user expands into big mode, show a short guided tutorial with sequential callouts for Setup, Telemetry, and Playback. After that, expose a Tutorial button so the tour can be replayed on demand.
- Expose parameters including:
  - field width and length
  - beetle pressure
  - invasion gradient strength
  - battery capacity
  - battery cycle life
  - battery replacement cost
  - drone mass
  - cruise speed
  - max horizontal acceleration
  - effective drag parameter
  - laser power
  - engagement dwell time up to 1 second
  - max speed when firing
  - reserve battery threshold
  - recharge time up to 2 hours

Economics:
- Show cost per hectare.
- Model only battery depreciation.
- Cost must be based on mission energy throughput, pack capacity, cycle life, and replacement cost.

Operational UX requirements:
- When charging, show "Recharging for X minutes" and include a skip-recharging button for simulation convenience.
- Add a firing-speed gate: the drone must slow to the configured maximum firing speed before the laser is allowed to fire, and the state machine must remain robust without getting stuck.
- Yaw changes must not be instantaneous; the drone heading should slew with a realistic finite rate instead of snapping instantly to the new direction.
- When a farmer is inside the nominal safety zone, show a clear "Farmer in NSZ" toast with an "Edit nominal safety zone" action.
- The nominal safety zone editor should pause the mission, allow editing focal distance, starting aperture, laser power, and dwell time, provide a preview farmer-distance slider, and offer a mathematical explanation based on the Gaussian-beam calculator in https://github.com/nickreyntjens/laser_safety_calculator.py.
- In that teaching mode, explain tradeoffs such as larger aperture needing a larger MEMS mirror and higher power permitting shorter dwell time for the same shot energy.
- When the mission completes, show a prominent mission-complete toast or banner.
- After one minute of watching the simulation, show a "Build it yourself" toast that opens a prompt explaining how to recreate the app.
- In Model Notes, include a button that reveals or copies this full build prompt so any visitor can rebuild the app.

Performance requirements:
- Avoid browser crashes at high beetle pressure such as 1600 beetles per hectare.
- Use a lower-memory rendering path for dense infestations, for example simplified markers / point clouds / instancing and lower DPR, instead of trying to render thousands of premium meshes.

Default scientific assumptions:
- default drone mass: 1 kg
- default shot energy: 10 joules
- default mission mode: known locations / pre-surveyed

Implementation deliverables:
1. Full source code
2. Clean component structure
3. Responsive web UI suitable for embedding in a product website
4. Short README explaining how to run and adapt it
5. Production-quality defaults that make the first run look compelling and credible

Important:
Do not make it feel like a toy game. Make it feel like a serious, polished engineering simulation for a frontier agricultural robotics company.`;
