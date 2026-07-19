// Reproduce the flight-level DJI Matrice 100 validation points committed in
// src/sim/m100Reference.ts. The stricter selection excludes climb, descent,
// turns/strong acceleration, and low-speed portions of nominal cruise flights.
//
// Download: curl -L https://ndownloader.figshare.com/files/26385151 -o flights.csv
// Run:      node scripts/extractM100Measured.mjs flights.csv

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/extractM100Measured.mjs /path/to/flights.csv");
  process.exit(1);
}

const required = [
  "flight", "time", "battery_voltage", "battery_current", "position_z",
  "velocity_x", "velocity_y", "velocity_z", "linear_acceleration_x",
  "linear_acceleration_y", "speed", "payload", "altitude", "route",
];

async function forEachRow(visitor) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let idx;
  for await (const line of rl) {
    const c = line.split(",");
    if (!idx) {
      idx = Object.fromEntries(required.map((name) => [name, c.indexOf(name)]));
      const missing = required.filter((name) => idx[name] < 0);
      if (missing.length) throw new Error(`missing columns: ${missing.join(", ")}`);
      continue;
    }
    visitor(c, idx);
  }
}

// Pass 1: establish each flight's ground elevation from its first three seconds.
const meta = new Map();
await forEachRow((c, i) => {
  const flight = c[i.flight];
  const m = meta.get(flight) ?? {
    route: c[i.route], payload: +c[i.payload], commandedSpeedMps: +c[i.speed],
    commandedAltitudesM: (c[i.altitude].match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
    groundSamples: [],
  };
  if (+c[i.time] <= 3) m.groundSamples.push(+c[i.position_z]);
  meta.set(flight, m);
});

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
for (const m of meta.values()) m.groundElevationM = median(m.groundSamples);

// Pass 2: collect qualifying samples separately for each flight. Flights, rather
// than correlated 5 Hz samples, are the independent units used in the final mean.
const byFlight = new Map();
await forEachRow((c, i) => {
  const flight = c[i.flight];
  const m = meta.get(flight);
  const powerW = +c[i.battery_voltage] * Math.abs(+c[i.battery_current]);
  if (!(powerW > 50 && powerW < 2000)) return;

  const horizontalSpeedMps = Math.hypot(+c[i.velocity_x], +c[i.velocity_y]);
  const verticalSpeedMps = Math.abs(+c[i.velocity_z]);
  let qualifies = false;

  if (m.route.startsWith("H")) {
    qualifies = horizontalSpeedMps < 0.3 && verticalSpeedMps < 0.25;
  } else if (m.route.startsWith("R") && m.payload === 0 && m.commandedSpeedMps > 0) {
    const relativeAltitudeM = +c[i.position_z] - m.groundElevationM;
    const atCruiseAltitude = m.commandedAltitudesM.some(
      (altitudeM) => Math.abs(relativeAltitudeM - altitudeM) < Math.max(2, altitudeM * 0.05),
    );
    const horizontalAccelerationMps2 = Math.hypot(
      +c[i.linear_acceleration_x], +c[i.linear_acceleration_y],
    );
    qualifies = atCruiseAltitude && verticalSpeedMps < 0.5 &&
      horizontalAccelerationMps2 < 1.5 && horizontalSpeedMps > 0.5 * m.commandedSpeedMps;
  }

  if (!qualifies) return;
  const e = byFlight.get(flight) ?? { powerSumW: 0, speedSumMps: 0, samples: 0 };
  e.powerSumW += powerW;
  e.speedSumMps += horizontalSpeedMps;
  e.samples += 1;
  byFlight.set(flight, e);
});

const groups = new Map();
for (const [flight, e] of byFlight) {
  if (e.samples < 5) continue;
  const m = meta.get(flight);
  const key = m.route.startsWith("H") ? 0 : m.commandedSpeedMps;
  const g = groups.get(key) ?? [];
  g.push({
    measuredW: e.powerSumW / e.samples,
    speedMps: key === 0 ? 0 : e.speedSumMps / e.samples,
    samples: e.samples,
  });
  groups.set(key, g);
}

const rows = [...groups].sort((a, b) => a[0] - b[0]).map(([commandedSpeedMps, flights]) => ({
  commandedSpeedMps,
  speedMps: +(flights.reduce((s, f) => s + f.speedMps, 0) / flights.length).toFixed(2),
  measuredW: +(flights.reduce((s, f) => s + f.measuredW, 0) / flights.length).toFixed(1),
  samples: flights.reduce((s, f) => s + f.samples, 0),
  flights: flights.length,
}));

console.log("\ncondition       actual m/s  measured W   samples  flights");
for (const r of rows) {
  const label = r.commandedSpeedMps === 0 ? "hover" : `command ${r.commandedSpeedMps}`;
  console.log(`${label.padEnd(16)}${r.speedMps.toFixed(2).padStart(10)}${r.measuredW.toFixed(1).padStart(12)}${String(r.samples).padStart(10)}${String(r.flights).padStart(9)}`);
}
console.log("\nM100_MEASURED =", JSON.stringify(rows));
