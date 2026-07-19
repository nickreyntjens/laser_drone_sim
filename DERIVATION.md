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
**full engine** over them, and compares:

```
grid    N   hit   engine s   closed(cap) s   engine/closed
 4×4   16    16      105.3           39.6           2.66×
 6×6   36    36      165.4           92.1           1.80×
10×10  100   100     352.6          260.1           1.36×
```

The engine sits **above** the closed form (it also pays cruise-cap, altitude and
target-acquisition time) and the ratio **converges toward 1** as the grid grows and
fixed take-off/landing overhead amortises. This validates the paper's formula as a
sound lower-bound planning estimate. Same `a` and `t_act` feed both sides.

---

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
