# Ground truth — validating flight power against real telemetry

This is the simulator's external validation: its flight-power model compared with
measured DJI Matrice 100 battery telemetry. The raw extraction, physical parameters,
and comparison are reproducible.

**Bottom line:** after excluding climb, descent, strong acceleration, and low-speed
turning segments, the uncalibrated model predicts qualifying cruise flights with
**9.4% flight-level mean absolute error**. It is suitable for feasibility-scale
energy estimates, modestly under-predicting hover and low-speed cruise. Nothing was
fitted to the telemetry.

## 1. Data source

Rodrigues, Patrikar, Choudhry, *et al.*, **"In-flight positional and energy use
data set of a DJI Matrice 100 quadcopter for small package delivery"**, *Nature
Scientific Data* **8**, 155 (2021).

- Dataset: figshare DOI [10.1184/R1/12683453](https://doi.org/10.1184/R1/12683453)
- 209 autonomous flights, 10 h 45 m, approximately 65 km
- approximately 5 Hz voltage, current, GPS/INS, and ultrasonic-anemometer logs
- commanded speed 4/6/8/10/12 m/s, altitude 25/50/75/100 m, and payload 0/250/500 g
- aircraft as flown: 3.68 kg all-up, four 0.34 m DJI 1345 propellers, approximately
  100 Wh battery

The source paper describes velocity as ground speed and cautions that the onboard
anemometer's wind-magnitude readings are biased high. This validation consequently
uses measured ground speed and does not present it as a precise airspeed fit.

## 2. Reproducible extraction

Measured electrical power is `battery_voltage × |battery_current|`.

```bash
curl -L https://ndownloader.figshare.com/files/26385151 -o flights.csv
node scripts/extractM100Measured.mjs flights.csv
```

[`scripts/extractM100Measured.mjs`](scripts/extractM100Measured.mjs) applies:

- power sanity window 50–2000 W
- **hover:** Route H, horizontal speed <0.3 m/s and |vertical speed| <0.25 m/s
- **cruise:** zero-payload Route R samples at commanded cruise altitude,
  |vertical speed| <0.5 m/s, horizontal acceleration <1.5 m/s², and actual ground
  speed above 50% of the command
- at least five qualifying samples per flight
- one mean per flight, followed by an equal-weight mean across flights

Equal flight weighting prevents long flights or correlated 5 Hz samples from
dominating the result. Predictions use actual mean ground speed, not commanded speed.

| condition | actual m/s | measured W | samples | flights |
|---|---:|---:|---:|---:|
| hover | 0.00 | 473.4 | 3135 | 4 |
| command 4 m/s | 4.02 | 451.8 | 5682 | 14 |
| command 6 m/s | 5.90 | 451.9 | 2107 | 13 |
| command 8 m/s | 7.73 | 438.3 | 353 | 10 |
| command 10 m/s | 8.76 | 399.9 | 136 | 9 |
| command 12 m/s | 10.23 | 419.8 | 48 | 7 |

The last two points have substantially fewer qualifying samples because the high
commanded speeds were rarely sustained while level and at low acceleration.

## 3. Model

The model in [`src/sim/engine.ts`](src/sim/engine.ts) uses actuator-disk momentum
theory plus translational relief, parasite drag, and avionics power. The M100 check
uses its measured 3.68 kg mass and rotor geometry while retaining the simulator's
default electrical assumptions: propulsion efficiency 0.74, effective drag area
0.025 m², and avionics power 24 W.

```text
P_hover = [T^1.5 / √(2 ρ A)] × 1.28 / η + avionics
P_cruise(v) = P_hover_without_avionics × [1 − 0.08 clamp(v/7, 0, 1)]
              + ½ ρ CdA v³ / η + avionics
```

These electrical assumptions were not adjusted against the M100 measurements.

## 4. Comparison

Run `npm run validate:power`:

```text
     condition    actual m/s    measured W         sim W         error
         hover          0.00         473.4         421.3        -11.0%
     command 4          4.02         451.8         404.4        -10.5%
     command 6          5.90         451.9         398.7        -11.8%
     command 8          7.73         438.3         399.1         -9.0%
    command 10          8.76         399.9         403.4         +0.9%
    command 12         10.23         419.8         411.7         -1.9%
```

The six grouped conditions have 7.5% MAPE. More conservatively, across the 53
individual qualifying cruise flights, MAPE is **9.4%** and mean bias is **−7.1%**.
The model has the correct magnitude. The residual is not constant at
higher speed, so this revision does not attribute it wholly to avionics or claim a
validated flat power-versus-speed shape.

## 5. Scope

- ✅ Supports feasibility-scale hover and forward-flight energy estimates.
- ⚠️ Does not independently validate mission route time, target distributions,
  detection, engagement duration, recharge logistics, or economic assumptions.
- ❌ Does not validate pest-control physics such as absorptivity, kill energy,
  payload mass, or field eye safety; those require laboratory and field evidence.

Files: [`src/sim/m100Reference.ts`](src/sim/m100Reference.ts),
[`scripts/validatePowerM100.ts`](scripts/validatePowerM100.ts),
[`scripts/extractM100Measured.mjs`](scripts/extractM100Measured.mjs), and
[`src/sim/power.test.ts`](src/sim/power.test.ts).
