// m100Reference.ts — REAL-WORLD GROUND TRUTH for validating the flight-power model.
//
// Source: Rodrigues, Patrikar, et al., "In-flight positional and energy use data
// set of a DJI Matrice 100 quadcopter for small package delivery", Nature
// Scientific Data 8, 155 (2021). Data: figshare DOI 10.1184/R1/12683453 (209
// flights, 5 Hz battery voltage + current → electrical power).
//
// The measured values below are equal-weight means of qualifying FLIGHTS (not
// correlated 5 Hz samples). Hover requires low horizontal/vertical speed. Cruise
// requires zero payload, cruise altitude, |vertical speed| < 0.5 m/s, horizontal
// acceleration < 1.5 m/s², and actual ground speed > 50% of the command.
// This is independent of anything in this simulator — it is the external check the
// internally-calibrated cost numbers never had.

import type { SimulationParameters } from "./types";
import { defaultParameters } from "./defaults";

/** DJI Matrice 100 PHYSICAL configuration as flown in the dataset (fully
 * instrumented: 3.68 kg all-up). Electrical assumptions (propulsionEfficiency,
 * effectiveDragAreaM2, avionicsPowerW) are left at the simulator's OWN defaults —
 * NOT tuned to the measured data — so the comparison is a genuine test of the
 * model, not a fit. Mass = airframeBaseMassKg (3.08) + battery (100 Wh /
 * 166.7 Wh/kg = 0.6 kg) = 3.68 kg. Rotors: 4 × DJI 1345 (0.34 m dia). */
export const M100_PARAMS: SimulationParameters = {
  ...defaultParameters,
  airframeBaseMassKg: 3.08,
  batteryCapacityWh: 100, // TB47D: 4500 mAh × 22.2 V ≈ 99.9 Wh
  batterySpecificEnergyWhPerKg: 166.7, // → 0.6 kg battery, matching the dataset
  rotorDiskAreaM2: 0.364, // 4 × π × (0.34/2)²
  // propulsionEfficiency 0.74, effectiveDragAreaM2 0.025, avionicsPowerW 24 — sim defaults, untouched
};

export interface MeasuredPoint {
  commandedSpeedMps: number;
  speedMps: number;
  measuredW: number;
  samples: number;
  flights: number;
}

/** Measured mean electrical power (W). speedMps 0 = hover (Route H). */
export const M100_MEASURED: MeasuredPoint[] = [
  { commandedSpeedMps: 0, speedMps: 0, measuredW: 473.4, samples: 3135, flights: 4 },
  { commandedSpeedMps: 4, speedMps: 4.02, measuredW: 451.8, samples: 5682, flights: 14 },
  { commandedSpeedMps: 6, speedMps: 5.90, measuredW: 451.9, samples: 2107, flights: 13 },
  { commandedSpeedMps: 8, speedMps: 7.73, measuredW: 438.3, samples: 353, flights: 10 },
  { commandedSpeedMps: 10, speedMps: 8.76, measuredW: 399.9, samples: 136, flights: 9 },
  { commandedSpeedMps: 12, speedMps: 10.23, measuredW: 419.8, samples: 48, flights: 7 },
];

/** Computed across the 53 qualifying individual cruise flights before grouping
 * by commanded speed. Kept separate from the six-point table's 7.5% MAPE. */
export const M100_FLIGHT_LEVEL_VALIDATION = {
  cruiseFlights: 53,
  meanAbsoluteErrorPct: 9.4,
  meanBiasPct: -7.1,
} as const;
