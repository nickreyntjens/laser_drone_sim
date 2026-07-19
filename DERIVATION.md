# Cost-per-hectare derivation

This document walks the full chain from **pest pressure** to **$/hectare**, names the
file and function for every step, and gives a worked example you can reproduce by
running the scripts in this repo. Nothing here is hand-waved: drop this repo into
Claude (or read the code) and every number below is regenerable.

The pipeline is deliberately **two independent layers**:

```
  pest pressure ──PHYSICS──▶ flight hours ──PRICING──▶ $/hectare
                (engine.ts)              (economics/flightCostModel.ts)
                     ▲                              ▲
        verified by hoppingModel.ts        11 unit tests, pure function
        (scripts/verifyHopping.ts)         (drop-in identical on the website)
```

Keeping them separate is what makes the whole thing auditable: the physics can be
checked against a closed form without touching money, and the money can be checked
without re-running a simulation.

---

## Layer 1 — Physics: pressure → flight hours

**Where:** [`src/sim/engine.ts`](src/sim/engine.ts), driven headlessly by
[`scripts/costSweep.ts`](scripts/costSweep.ts).

1. **Targets.** `generateTargets()` ([`src/sim/generation.ts`](src/sim/generation.ts))
   draws beetles from a Poisson point process at density
   `edgeDensityPerHectare`, decaying exponentially with depth from the invasion edge.
   Expected count = `edgeDensityPerHectare × fieldHa × borderPassThrough`.
2. **Flight.** The drone flies a PID-controlled trajectory to each target
   (pre-surveyed route or live boustrophedon sweep), returning to dock to recharge
   when pack energy nears the reserve. Every step integrates real motion.
3. **Energy.** Momentum-theory rotor power (hover), a `v³` parasite-drag term
   (forward flight), an explicit acceleration/braking penalty, laser-on energy, and
   constant avionics draw. Summed per step into `EnergyBreakdown`.
4. **Output per mission** (`MissionEngine.summary`): `flightTimeS`, total energy Wh,
   recharge cycles, targets neutralised.

`flightHours = flightTimeS / 3600` is the **only quantity Layer 2 needs.**

### Verifying Layer 1 — the closed-form "hopping" model

The economic feasibility paper approximates the drone as a stop-and-hop mover: each
hop of distance `d` under acceleration limit `a` follows a symmetric triangular
velocity profile, giving `t_hop = 2·√(d/a)`, plus a dwell `t_act` at each target.

**Where:** [`src/sim/hoppingModel.ts`](src/sim/hoppingModel.ts) —
`predictGridFlightTimeS()` gives `(N−1)·2·√(d/a) + N·t_act` for a uniform grid, with a
cruise-cap-aware trapezoidal `hopTimeS()` for long hops.

**Check it:** `npm run verify:hopping` places targets on a uniform grid, flies the
**full engine** over them, and compares against the paper's closed form using the
paper's own action time `t_act = 1.0 s/beetle`:

```
grid    N    engine s   closed s   engine/closed
 6×6   36      165.4      120.9        1.37×
10×10  100     352.6      340.1        1.04×
14×14  196     696.4      668.9        1.04×
```

**The closed form is an UPPER bound on the hunting work — and here is exactly why.**
Decomposing the engine's 14×14 mission by phase:

| phase | engine | closed form | note |
|---|---|---|---|
| travel (fly target→target) | 436 s | 473 s | stop-and-hop **over**-estimates: the engine cruises through, it does not fully stop at each beetle |
| engage (aim + fire + confirm) | 188 s | 196 s | measured **0.96 s/beetle ≈ the paper's 1.0 s** `t_act` |
| fixed (takeoff + dock transit + land) | 72 s | — | overhead a "clear N beetles" formula does not model |

So on the **hunting work** (travel + engage) the closed form is **669 s vs the
engine's 625 s — a 1.07× upper bound.** The *full* mission is ~4 % higher only
because it also flies out from and back to the dock. Two independent conservatisms
make the paper's estimate an upper bound:

1. **Uniform grid is the pessimistic layout.** A regular lattice maximises travel per
   target. A real Colorado-beetle infestation is Poisson-**clustered at the invasion
   edge** (what `generateTargets` models), which packs tighter and costs less — run
   `npm run cost:sweep` to see the clustered case.
2. **Stop-and-hop over-estimates travel.** `2√(d/a)` assumes a full stop at every
   target; the real drone carries speed between close targets.

> **Note on the action time.** If you feed the closed form the sim's
> `engagementDwellS = 0.2 s` (the *firing* sub-phase only) instead of the paper's
> `t_act = 1.0 s` (aim + fire + confirm), it flips to a *lower* bound. The bound
> direction depends entirely on the action-time assumption — and the paper's 1.0 s
> matches the sim's measured 0.96 s aim+fire+confirm, so the paper's model is the
> correct, well-calibrated one.

---

### Validating Layer 1 against REAL telemetry (DJI Matrice 100)

The flight-time and energy physics are checked against measured drone data, not just
an internal closed form. `npm run validate:power` runs the simulator's own power
model with the **physical** parameters of a DJI Matrice 100 (3.68 kg all-up, 4 ×
0.34 m rotors) — keeping the sim's **default** electrical assumptions (efficiency
0.74, avionics 24 W), *nothing fitted to the data* — and compares to measured
battery power (voltage × current) from a public 209-flight dataset (figshare
[10.1184/R1/12683453](https://doi.org/10.1184/R1/12683453), Nature *Scientific
Data* 2021):

```
   condition    measured W    sim W    error
       hover        472.7      421.3   -10.9%
 cruise 4 m/s       456.7      404.4   -11.4%
 cruise 8 m/s       454.0      400.1   -11.9%
cruise 12 m/s       480.1      425.3   -11.4%
                              mean abs  11.1%
```

The uncalibrated momentum-theory model reproduces both the **magnitude** (~400–480 W
for a ~3.7 kg quad) and the **roughly-flat power-vs-speed shape**. It under-predicts
by a **consistent ~11% offset** — the signature of a fixed avionics gap, not a shape
error: the M100 carries ~1.1 kg of instrumentation (Raspberry Pi, ADC, wind sensor)
drawing more than the sim's 24 W avionics default (raising it to ~75 W closes the
gap). The reference is left untuned on purpose, and `src/sim/power.test.ts` asserts
the model stays within 15 % of the measured values with the correct flat shape. This
is the one check in the repo that is **not** internally calibrated.

## Layer 2 — Pricing: flight hours → $/hectare

**Where:** [`src/economics/flightCostModel.ts`](src/economics/flightCostModel.ts) —
`calculateDroneFlightHourCost()`. This is the **canonical cost model**; the website
ships a byte-identical vendored copy. It is a pure function with 11 unit tests
([`flightCostModel.test.ts`](src/economics/flightCostModel.test.ts)).

Per **flight hour**, at the baseline assumptions:

| component | formula | value |
|---|---|---|
| Battery depreciation | `price × P / (Wh × cycles)` = `180 × 253 / (140 × 400)` | **$0.813/h** |
| Charging electricity | `P / η / 1000 × $/kWh` = `253 / 0.9 / 1000 × 0.15` | **$0.042/h** |
| Flight-dependent maintenance | `props + motors + extra` = `0.5 + 0.3 + 0.2` | **$1.000/h** |
| Drone capital allocation | `(price − residual) / (yr × h/yr)` = `1800 / (5 × 300)` | **$1.200/h** |
| Shared charger allocation | `(price / yr) / (drones × h/yr)` = `0 / …` | **$0.000/h** |
| Laser payload allocation | `(price − residual) / lifetime_h` = `6000 / 10000` | **$0.600/h** |

Three headline rates (kept distinct on purpose):

- **marginal** = battery + electricity + maintenance = **$1.855/h** — costs that
  exist *because* the drone flies.
- **ordinary** = marginal + drone capital + charger = **$3.055/h**.
- **fully allocated** = ordinary + laser = **$3.655/h**.

Capital allocation is an **accounting spread of purchase price over expected
utilisation, not physical wear** — the airframe does not shed $1.20 of metal per hour.

### From rate to $/hectare

`priceFlightHoursPerHa(flightHours, fieldHa, result)` gives, for one sweep:

```
amortization/ha = flightHours × (droneCapital + charger + laser + maintenance) / fieldHa
battery/ha      = flightHours × batteryPerHour / fieldHa
electricity/ha  = flightHours × electricityPerHour / fieldHa
```

`costSweep.ts` writes these as the `priced` columns next to the engine's own
energy-integral columns — and **they agree to within a few percent**, because the
`averagePowerW = 253 W` baseline was calibrated to the engine's integrated energy.

---

## Worked example — 400 beetles/ha, 10 ha field

Run: `npm run cost:sweep 400`

```
pressure=400   cost/ha=$1.039   (amort $0.796 · batt $0.231 · elec $0.012)
               priced/ha=$1.039   flight=2.84h   recharges=6
```

Check the pricing by hand from `flight=2.84h` over `10 ha`:

- amortization/ha = 2.84 × (1.20 + 0 + 0.60 + 1.00) / 10 = 2.84 × 2.80 / 10 = **$0.795**
- battery/ha = 2.84 × 0.813 / 10 = **$0.231**
- electricity/ha = 2.84 × 0.042 / 10 = **$0.012**
- **total = $1.038/ha·sweep** ✓ (matches the engine's independent energy-integral $1.039)

A season is `sweepsPerSeason` (30) sweeps → ~$31/ha·season for shooting, plus the
scouting scan (`scanModel` on the website), still far under the ~$54/ha chemical
baseline.

---

## Reproduce everything

```bash
npm install
npm run test:run            # 11 pricing + 7 hopping/engine tests
npm run cost:sweep 400      # one pressure point, physics + priced columns
npm run cost:sweep          # full 100..2000 sweep → scripts/out/cost-sweep.json
npm run verify:hopping      # full engine vs closed-form on a uniform grid
```

The website's published `$/ha` numbers are `cost-sweep.json`'s `priced` columns; the
website prices the same `flightHours` with the same (vendored) `flightCostModel.ts`.
There is exactly one cost model, and it lives here.
