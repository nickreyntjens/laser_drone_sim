// extractM100Measured.mjs — reproduces the measured power numbers in
// src/sim/m100Reference.ts from the raw DJI Matrice 100 dataset, so the ground
// truth is auditable end-to-end (download → extract → the exact constants used).
//
// 1. Download flights.csv (~102 MB) from figshare DOI 10.1184/R1/12683453
//    (file: https://ndownloader.figshare.com/files/26385151)
// 2. node scripts/extractM100Measured.mjs /path/to/flights.csv
//
// Measured electrical power per sample = battery_voltage × |battery_current|.
//   • hover  : all "Route H" hover-test samples
//   • cruise : 0-payload flights, samples where horizontal ground speed
//              (√(velocity_x²+velocity_y²)) is within 1 m/s of the commanded
//              "speed", grouped by commanded speed.
// Prints the table and a JSON block matching M100_MEASURED.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/extractM100Measured.mjs /path/to/flights.csv");
  process.exit(1);
}

const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
let header = null;
let idx = {};
const cruise = new Map(); // commanded speed -> {sum, n}
const hover = { sum: 0, n: 0 };

for await (const line of rl) {
  if (!header) {
    header = line.split(",");
    ["battery_voltage", "battery_current", "velocity_x", "velocity_y", "speed", "payload", "route"]
      .forEach((k) => { idx[k] = header.indexOf(k); });
    continue;
  }
  const c = line.split(",");
  const v = +c[idx.battery_voltage], i = +c[idx.battery_current];
  const P = v * Math.abs(i);
  if (!(P > 50 && P < 2000)) continue;
  const route = c[idx.route], pay = +c[idx.payload], cmd = +c[idx.speed];
  const hspeed = Math.hypot(+c[idx.velocity_x], +c[idx.velocity_y]);
  if (route?.startsWith("H")) { hover.sum += P; hover.n++; }
  if (pay === 0 && route?.startsWith("R") && cmd > 0 && Math.abs(hspeed - cmd) < 1) {
    const e = cruise.get(cmd) ?? { sum: 0, n: 0 };
    e.sum += P; e.n++; cruise.set(cmd, e);
  }
}

const rows = [{ speedMps: 0, measuredW: +(hover.sum / hover.n).toFixed(1), samples: hover.n }];
for (const [s, e] of [...cruise].sort((a, b) => a[0] - b[0])) {
  if (e.n > 20) rows.push({ speedMps: s, measuredW: +(e.sum / e.n).toFixed(1), samples: e.n });
}
console.log("\ncondition        measured W   samples");
for (const r of rows) {
  console.log(`${(r.speedMps === 0 ? "hover" : `cruise ${r.speedMps} m/s`).padEnd(16)}${String(r.measuredW).padStart(8)}${String(r.samples).padStart(10)}`);
}
console.log("\nM100_MEASURED =", JSON.stringify(rows));
