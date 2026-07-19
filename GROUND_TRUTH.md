# Ground truth — validating the flight-power model against real drone telemetry

Every other check in this repo is *internal* (the sim agreeing with a closed form,
or costs summing consistently). This document is the one **external** validation:
the simulator's flight-power physics compared against **measured battery power from a
real drone**, with the data extraction, the model derivation, and the comparison all
reproducible from the commands below.

**Bottom line:** the uncalibrated momentum-theory power model predicts the measured
DJI Matrice 100 power to **11.1 % mean absolute error**, reproducing both the
magnitude and the flat power-vs-speed shape, under-predicting by a consistent offset
that is fully explained (avionics). Nothing was fitted to the data.

---

## 1. The data source

Rodrigues, Patrikar, Choudhry, *et al.*, **"In-flight positional and energy use data
set of a DJI Matrice 100 quadcopter for small package delivery"**, *Nature Scientific
Data* **8**, 155 (2021).

- Dataset: figshare **DOI [10.1184/R1/12683453](https://doi.org/10.1184/R1/12683453)**
- 209 autonomous flights · 10 h 45 m · ~65 km · Apr–Oct 2019
- **5 Hz** logs of battery **voltage** and **current** (Mauch PL‑200 sensor → 17‑bit ADC),
  GPS/INS position + velocity, ultrasonic wind
- Swept parameters: commanded speed **4/6/8/10/12 m/s**, altitude **25/50/75/100 m**,
  payload **0/250/500 g**; plus dedicated **Route H** hover tests and **Route A** ground tests
- Aircraft as flown (fully instrumented): **3.68 kg** all‑up (1.83 kg airframe +
  0.60 kg battery + 0.14 kg anemometer + 1.11 kg onboard computer/sensors), **4 ×
  DJI 1345** props (0.34 m dia), 100 Wh battery (4500 mAh × 22.2 V)

## 2. How the measured numbers were extracted

Measured electrical power per sample = **battery_voltage × |battery_current|** (W).
Reproducible via a committed script:

```bash
# 1. download the time series (~102 MB)
curl -L https://ndownloader.figshare.com/files/26385151 -o flights.csv
# 2. extract the measured power table
node scripts/extractM100Measured.mjs flights.csv
```

Extraction rules ([`scripts/extractM100Measured.mjs`](scripts/extractM100Measured.mjs)):
- **hover** — every `Route H` sample (n = 3462)
- **cruise** — 0‑payload flights, samples in **steady cruise** only: horizontal
  ground speed `√(velocity_x² + velocity_y²)` within **1 m/s** of the commanded
  `speed`, grouped by commanded speed
- power sanity window 50–2000 W to drop sensor dropouts

Result (the exact constants in [`src/sim/m100Reference.ts`](src/sim/m100Reference.ts)):

| condition | measured W | samples |
|---|---|---|
| hover | 472.7 | 3462 |
| cruise 4 m/s | 456.7 | 10274 |
| cruise 6 m/s | 452.0 | 6107 |
| cruise 8 m/s | 454.0 | 3844 |
| cruise 10 m/s | 452.6 | 2969 |
| cruise 12 m/s | 480.1 | 1015 |

Note the profile is **roughly flat** (~452–480 W): induced power drops slightly as
forward speed relieves the rotors, then parasite drag lifts it again at 12 m/s.

## 3. The model, derived with M100 numbers

The simulator's power model ([`src/sim/engine.ts`](src/sim/engine.ts)) is momentum
(actuator-disk) theory. Fed the M100's **physical** mass and rotor geometry, with the
sim's **own default** electrical assumptions left untouched (`propulsionEfficiency`
0.74, `effectiveDragAreaM2` 0.025, `avionicsPowerW` 24 — *not fitted to the data*):

**Hover** — `P_hover = [ T^1.5 / √(2 ρ A) ] · profileFactor / η + avionics`, with
`T = m·g = 3.68 · 9.81 = 36.11 N`, `A = 4·π·0.17² = 0.364 m²`, `ρ = 1.225`,
`profileFactor = 1.28`, `η = 0.74`:

```
ideal induced = 36.11^1.5 / √(2·1.225·0.364) = 217.0 / 0.944 = 229.8 W
× 1.28 / 0.74                                 = 397.5 W
+ 24 W avionics                               = 421.5 W    (measured 472.7)
```

**Cruise** at speed v — `P = P_support(v) + P_drag(v) + avionics`, where
`P_support = P_hover·(1 − 0.08·clamp(v/7,0,1))` and
`P_drag = ½ ρ C_dA v³ / η`. e.g. at 12 m/s: support `397.5·0.92 = 365.7`, drag
`½·1.225·0.025·12³/0.74 = 35.8`, +24 → **425.3 W** (measured 480.1).

## 4. The comparison — `npm run validate:power`

```
   condition    measured W    sim W    error
       hover        472.7      421.3   -10.9%
 cruise 4 m/s       456.7      404.4   -11.4%
 cruise 6 m/s       452.0      398.5   -11.8%
 cruise 8 m/s       454.0      400.1   -11.9%
cruise 10 m/s       452.6      410.2    -9.4%
cruise 12 m/s       480.1      425.3   -11.4%
                              mean abs  11.1%
```

**Reading:** right magnitude, right (flat) shape, and a **consistent ~11 %
under-prediction** — a fixed offset, not a shape error. That is the signature of an
avionics gap: the M100 carries ~1.1 kg of instrumentation (Raspberry Pi, ADC, wind
sensor) drawing more than the sim's 24 W default. Setting `avionicsPowerW ≈ 75`
closes the gap to near-zero — but the reference is left **untuned on purpose** so the
number stays an honest, out-of-the-box result.

## 5. What this does and does not prove

- ✅ The **flight-power / energy physics** (hover + forward flight) matches a real
  drone to ~11 %, with the residual explained. This underwrites the sim's flight
  hours and energy, and therefore the $/flight-hour and $/ha that derive from them.
- ❌ It does **not** validate the pest-control physics — laser absorptivity (assumed
  25 %), kill energy per beetle (lethality curves still being measured), 50 W in
  250 g, or field eye-safety. Those need lab/field data; no code here can stand in.

## 6. Reproduce it all

```bash
npm run validate:power        # predicted vs measured table (uses committed reference)
npm run test:run              # incl. src/sim/power.test.ts (<15% error + flat-shape asserts)
# full audit from the raw dataset:
curl -L https://ndownloader.figshare.com/files/26385151 -o flights.csv
node scripts/extractM100Measured.mjs flights.csv   # regenerates the measured constants
```

Files: [`src/sim/m100Reference.ts`](src/sim/m100Reference.ts) (params + measured
data), [`scripts/validatePowerM100.ts`](scripts/validatePowerM100.ts) (comparison),
[`scripts/extractM100Measured.mjs`](scripts/extractM100Measured.mjs) (extraction),
[`src/sim/power.test.ts`](src/sim/power.test.ts) (tests).
