// hoppingModel.ts — the CLOSED-FORM "hopping" flight-time model from the economic
// feasibility paper, isolated as pure functions so it can be checked against the
// full physics engine (see scripts/verifyHopping.ts).
//
// The paper prices a perimeter "slice" by approximating the drone as a stop-and-hop
// mover: it accelerates to a midpoint at limit a, then decelerates, dwelling t_act
// on each target. For a single hop of distance d under a symmetric triangular
// velocity profile with acceleration limit a:
//
//     d = 2 · (½ · a · (t/2)²)   ⇒   t_hop = 2 · √(d / a)          [pure accel/decel]
//
// A real airframe also has a cruise-speed cap v_max. Once √(a·d) exceeds v_max the
// profile becomes a trapezoid (accelerate → cruise → decelerate), which takes
// LONGER than the triangular ideal — so the pure formula is a lower bound and the
// engine should sit at or above it. Both forms are provided.

export interface HopKinematics {
  /** acceleration limit, m/s² (the engine's maxHorizontalAccelMps2) */
  accelMps2: number;
  /** cruise-speed cap, m/s; omit / <=0 for the paper's uncapped triangular ideal */
  cruiseCapMps?: number;
}

/** Time to translate `distanceM` under an acceleration limit, optionally capped by a
 * cruise speed. Triangular (accel→decel) below the cap, trapezoidal above it. */
export function hopTimeS(distanceM: number, k: HopKinematics): number {
  const d = Math.max(distanceM, 0);
  const a = Math.max(k.accelMps2, 1e-9);
  if (d === 0) return 0;
  const vPeakTriangle = Math.sqrt(a * d); // peak speed if we never cap
  const vMax = k.cruiseCapMps && k.cruiseCapMps > 0 ? k.cruiseCapMps : Infinity;
  if (vPeakTriangle <= vMax) {
    return 2 * Math.sqrt(d / a); // triangular: 2·√(d/a)
  }
  // trapezoid: accelerate to vMax, cruise the remainder, decelerate
  const accelTime = vMax / a;
  const accelDist = (vMax * vMax) / (2 * a);
  const cruiseDist = d - 2 * accelDist;
  const cruiseTime = cruiseDist / vMax;
  return 2 * accelTime + cruiseTime;
}

export interface GridFlightInput {
  /** number of target points visited */
  count: number;
  /** nearest-neighbour spacing between adjacent grid points, m */
  spacingM: number;
  /** dwell/engage time paid at each target, s */
  dwellS: number;
  kinematics: HopKinematics;
}

export interface GridFlightPrediction {
  hops: number;
  hopTimeS: number;
  travelTimeS: number;
  dwellTotalS: number;
  flightTimeS: number;
}

/** Closed-form flight time for a drone visiting `count` points on a uniform grid in
 * boustrophedon (serpentine) order, where every step is one hop of `spacingM`.
 * Visiting N points is N−1 hops plus N dwells. */
export function predictGridFlightTimeS(i: GridFlightInput): GridFlightPrediction {
  const count = Math.max(Math.floor(i.count), 0);
  const hops = Math.max(count - 1, 0);
  const th = hopTimeS(i.spacingM, i.kinematics);
  const travelTimeS = hops * th;
  const dwellTotalS = count * Math.max(i.dwellS, 0);
  return { hops, hopTimeS: th, travelTimeS, dwellTotalS, flightTimeS: travelTimeS + dwellTotalS };
}

/** The paper's per-slice time, kept for direct reference to the manuscript:
 * t_slice = 2·√(N·D / a) + N·t_act, where N beetles converge within ingress depth D. */
export function paperSliceTimeS(nBeetles: number, ingressDepthM: number, accelMps2: number, dwellS: number): number {
  const n = Math.max(nBeetles, 0);
  const a = Math.max(accelMps2, 1e-9);
  return 2 * Math.sqrt((n * Math.max(ingressDepthM, 0)) / a) + n * Math.max(dwellS, 0);
}
