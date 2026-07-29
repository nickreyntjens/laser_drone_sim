# Ground truth — validating flight power against real telemetry

This is the simulator's external validation: its flight-power model compared with
measured DJI Matrice 100 battery telemetry. The raw extraction, physical parameters,
and comparison are reproducible.

**Bottom line:** after excluding climb, descent, strong acceleration, and low-speed
turning segments, the uncalibrated model predicts qualifying cruise flights with
**9.4% flight-level mean absolute error**. It is suitable for feasibility-scale
energy estimates, modestly under-predicting hover and low-speed cruise. Nothing was
fitted to the telemetry.

The model was additionally cross-checked against an independent third-party
calculator, eCalc (§5). On the same M100 hover point, this simulator is **−11.0%**
against the measurement while eCalc is **+20 to +28%** — so the simulator is the
closer of the two to reality, and the constants were deliberately **not**
recalibrated. §5.4 explains why.

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

## 5. Third-party cross-check — eCalc

The M100 telemetry above is one external check. A second, independent one is
[eCalc xcopterCalc](https://www.ecalc.ch/xcoptercalc.php), the de-facto industry
calculator for multirotor performance, built on a database of measured motors
(14,876 at the time of this test) with empirical per-family propeller constants.
It is a *model*, not a measurement — but it is independent of everything here.

Tested 2026-07-29, eCalc version X7.41.009 (motor data 19.7.2026). Both runs were
set to sea level, 15 °C, 1013 hPa so that eCalc's air density matches the
simulator's ρ = 1.225 kg/m³. eCalc reports drive power only, so the simulator's
same 24 W avionics allowance is added for a like-for-like total.

To reproduce: enter model weight as *incl. Drive* (so eCalc uses the stated all-up
mass rather than summing components), 4 rotors, `flat`, elevation 0 m, 15 °C.
Design drone — 2200 g, 450 mm frame, LiPo 6000 mAh 30/45C 6S, ESC `max 30A`, motor
T-Motor `MN3110-470`. M100 — 3680 g, 650 mm frame, LiPo 4500 mAh 65/100C 6S, ESC
`max 30A`, motor DJI `3508-415` or T-Motor `MN4120-400`, propeller family `DJI`
13.39 × 4.5, 2 blades. Figure of Merit is derived, not reported by eCalc:
FM = ideal induced power ÷ eCalc's `P(out) @ Hover`, with ideal induced power
= T^1.5 / √(2 ρ A) over the *total* disc area eCalc reports.

### 5.1 The decisive run — eCalc against the M100 itself

Before using eCalc to judge this simulator, it was pointed at the one aircraft
whose true power is known: the M100 of §2 (3.68 kg, four 13.39 in DJI rotors, 6S).

| source | M100 hover | error vs measured | implied FM × η |
|---|---:|---:|---:|
| **measured (§2)** | **473.4 W** | — | 0.512 |
| this simulator | 421.3 W | **−11.0%** | 0.579 |
| eCalc, DJI 3508-415 motor | 604.1 W | **+27.6%** | 0.396 |
| eCalc, T-Motor MN4120-400 motor | 568.4 W | **+20.1%** | 0.422 |

**eCalc is roughly twice as far from reality as this simulator, in the opposite
direction.** The second motor was run to confirm the gap is not an artefact of
component choice; it narrows the error but does not remove it.

eCalc's rotor model is also internally inconsistent with the measurement. It
returns Figure of Merit 0.505 for the DJI 13.39 in rotor — identical for both
motors, confirming FM is a property of the propeller alone. But the *measured*
combined FM × η is 0.512, which would require a drivetrain efficiency of 1.014 —
above 100%, and therefore impossible. eCalc's rotor figure must be too low; at a
realistic η ≈ 0.87 the real rotor is near FM 0.59, some 17% above eCalc's 0.505.

### 5.2 The 2.2 kg design drone

Same procedure for the simulator's default aircraft: 2.2 kg all-up, four rotors,
11.33 in propellers giving a 0.2602 m² disc (the simulator's 0.26 m²), 6S,
T-Motor MN3110-470. Ideal induced power is 125.6 W in every row.

| propeller | P(in) hover | FM | drive η | FM × η | g/W |
|---|---:|---:|---:|---:|---:|
| T-Motor CF 11.33×3.7 | 297.6 W | 0.483 | 0.874 | 0.422 | 7.39 |
| T-Motor CF 11.33×3.0 | 296.7 W | 0.483 | 0.876 | 0.423 | 7.41 |
| APC MultiRotor MR 11.33×3.8 | 282.0 W | 0.510 | 0.874 | 0.445 | 7.80 |
| Mejzlik Multicopter 11.33×3.7 | 266.2 W | 0.539 | 0.875 | 0.472 | 8.26 |
| **this simulator** | **217.2 W** | **0.781** | **0.740** | **0.578** | **10.13** |

Read alone, this suggests the simulator is 18–27% optimistic. Read together with
§5.1 — where eCalc was 20–28% *pessimistic* against a real measurement of the same
kind — it does not support that conclusion.

### 5.3 What the exercise did establish

The simulator's two electrical constants are each individually indefensible; they
happen to cancel. Taking the measured combined 0.512 and a realistic drivetrain
efficiency of ~0.87 (eCalc's own motor-level figure for a well-matched motor)
implies a Figure of Merit near 0.59 — inside the 0.5–0.65 band usually quoted for
multirotor rotors of this size, and nowhere near 0.78.

| | this simulator | implied by measurement |
|---|---:|---:|
| Figure of Merit (= 1 / 1.28) | 0.781 | ~0.59 |
| drivetrain efficiency η | 0.740 | ~0.87 |
| **product (what actually sets power)** | **0.578** | **0.512** |

FM is ~32% too generous, η ~15% too harsh, and the product — the only quantity
that affects the output — lands 13% optimistic, consistent with the −11% hover
error in §4.

### 5.4 Decision: no recalibration

The constants were left unchanged, deliberately.

- **Recalibrating toward eCalc** would move the model from −11% to roughly
  +20–28% against the only real measurement available. Measurably worse.
- **Recalibrating toward the M100** would make the model accurate for the M100 at
  the cost of the independence of §4. A model fitted to a dataset cannot then be
  validated by it, and this document's central claim is that nothing was fitted.

A known, bounded, single-direction 13% optimistic bias, documented here, is a
stronger position than a fitted model with no surviving external check. The
residual moves the fully-allocated flight-hour cost by roughly +3–8%, which does
not change any conclusion that rests on it.

## 6. Scope

- ✅ Supports feasibility-scale hover and forward-flight energy estimates.
- ⚠️ Does not independently validate mission route time, target distributions,
  detection, engagement duration, recharge logistics, or economic assumptions.
- ❌ Does not validate pest-control physics such as absorptivity, kill energy,
  payload mass, or field eye safety; those require laboratory and field evidence.

Files: [`src/sim/m100Reference.ts`](src/sim/m100Reference.ts),
[`scripts/validatePowerM100.ts`](scripts/validatePowerM100.ts),
[`scripts/extractM100Measured.mjs`](scripts/extractM100Measured.mjs), and
[`src/sim/power.test.ts`](src/sim/power.test.ts).
