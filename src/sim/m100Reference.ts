// m100Reference.ts — REAL-WORLD GROUND TRUTH for validating the flight-power model.
//
// Source: Rodrigues, Patrikar, et al., "In-flight positional and energy use data
// set of a DJI Matrice 100 quadcopter for small package delivery", Nature
// Scientific Data 8, 155 (2021). Data: figshare DOI 10.1184/R1/12683453 (209
// flights, 5 Hz battery voltage + current → electrical power).
//
// The measured values below were computed from the dataset's flights.csv as the
// mean of (battery_voltage × |battery_current|) over:
//   • hover:  all "Route H" hover-test samples (n = 3462)
//   • cruise: 0-payload flights, samples where horizontal ground speed is within
//     1 m/s of the commanded speed (steady cruise), per commanded speed.
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

export interface MeasuredPoint { speedMps: number; measuredW: number; samples: number }

/** Measured mean electrical power (W). speedMps 0 = hover (Route H). */
export const M100_MEASURED: MeasuredPoint[] = [
  { speedMps: 0, measuredW: 472.7, samples: 3462 },
  { speedMps: 4, measuredW: 456.7, samples: 10274 },
  { speedMps: 6, measuredW: 452.0, samples: 6107 },
  { speedMps: 8, measuredW: 454.0, samples: 3844 },
  { speedMps: 10, measuredW: 452.6, samples: 2969 },
  { speedMps: 12, measuredW: 480.1, samples: 1015 },
];
