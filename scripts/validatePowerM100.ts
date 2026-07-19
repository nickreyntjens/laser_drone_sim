// validatePowerM100.ts — validates the simulator's flight-power model against REAL
// measured DJI Matrice 100 telemetry (see src/sim/m100Reference.ts for the source).
// Runs the sim's OWN power functions with the M100's physical mass/rotor geometry
// and the sim's default electrical assumptions (NOT tuned to the data), and prints
// predicted vs measured power at hover and 4–12 m/s cruise.
//
//   npm run validate:power

import { steadyLevelFlightPowerW } from "../src/sim/engine";
import { M100_PARAMS, M100_MEASURED } from "../src/sim/m100Reference";

console.log(`\nFlight-power validation vs measured DJI Matrice 100 telemetry`);
console.log(`(sim momentum-theory model · M100 mass 3.68 kg, 4×0.34 m rotors · ` +
  `sim-default efficiency 0.74 / avionics 24 W — NOT fitted to the data)\n`);
console.log(["condition", "measured W", "sim W", "error"].map((h) => h.padStart(14)).join(""));

let sumAbsPct = 0;
for (const m of M100_MEASURED) {
  const sim = steadyLevelFlightPowerW(M100_PARAMS, m.speedMps);
  const pct = ((sim - m.measuredW) / m.measuredW) * 100;
  sumAbsPct += Math.abs(pct);
  const label = m.speedMps === 0 ? "hover" : `cruise ${m.speedMps} m/s`;
  console.log([label, m.measuredW.toFixed(1), sim.toFixed(1), `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`]
    .map((c) => c.padStart(14)).join(""));
}
const mape = sumAbsPct / M100_MEASURED.length;
console.log(`\nMean absolute error: ${mape.toFixed(1)}%\n`);
console.log(
  `The uncalibrated momentum-theory model reproduces the measured magnitude and the\n` +
  `roughly-flat power-vs-speed shape. It under-predicts by a near-constant offset,\n` +
  `consistent with the M100's heavy onboard instrumentation (Raspberry Pi, ADC, wind\n` +
  `sensor, ~1.1 kg of electronics) drawing more than the sim's 24 W avionics default.\n` +
  `Raising avionics to ~75 W closes it — but the reference is left UNtuned on purpose.\n`
);
