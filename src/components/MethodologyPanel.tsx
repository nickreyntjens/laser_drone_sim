import { SimulationSnapshot } from "../sim/types";
import { getFieldProfile } from "../sim/fieldProfiles";

interface MethodologyPanelProps {
  snapshot: SimulationSnapshot;
  onOpenBuildPrompt: () => void;
}

export function MethodologyPanel({ snapshot, onOpenBuildPrompt }: MethodologyPanelProps): JSX.Element {
  const { params, playbackSpeed, renderScaleMPerUnit } = snapshot;
  const fieldProfile = getFieldProfile(params.fieldType);
  const targetPluralLabel =
    fieldProfile.targetLabelPlural.charAt(0).toUpperCase() + fieldProfile.targetLabelPlural.slice(1);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Model Notes</span>
          <h2>Credibility framing</h2>
        </div>
      </div>

      <div className="methodology-grid">
        <div className="method-card">
          <h3>Physics-based approximations</h3>
          <p>
            Hover power is derived from momentum-theory rotor loading with a fixed propulsion efficiency.
            Translational drag scales with <code>v^3</code>, acceleration and braking add a maneuver penalty,
            climb power is explicit, and avionics draw is constant during flight.
          </p>
        </div>
        <div className="method-card">
          <h3>Mission logic</h3>
          <p>
            {targetPluralLabel} come from a Poisson point process whose invasion-edge density is
            expressed in {fieldProfile.pressureUnitLabel} and decays exponentially with distance from the field
            border. In live-search mode the drone flies a boustrophedon sweep; in pre-surveyed mode it follows a
            scalable route-planning heuristic over the known target map. In both cases it returns once the remaining
            pack energy approaches the dock-return requirement plus a {params.reserveBatteryPct}% reserve.
          </p>
        </div>
        <div className="method-card">
          <h3>Presentation choices</h3>
          <p>
            Metrics stay in physical units. The rendered field is compressed to {renderScaleMPerUnit} m per world
            unit and the playback runs at {playbackSpeed.toFixed(2)}x simulated time so a landing-page visitor can
            watch a full sortie without waiting through the real mission duration. Target markers are visually enlarged.
          </p>
        </div>
        <div className="method-card">
          <h3>Cost model</h3>
          <p>
            The cost-per-hectare estimate only models battery depreciation. Equivalent full cycles are computed from
            mission energy throughput, then scaled by the configured battery replacement cost and cycle-life rating.
          </p>
        </div>
      </div>

      <div className="button-row">
        <button className="secondary-button" onClick={onOpenBuildPrompt}>
          Get build prompt
        </button>
      </div>
    </section>
  );
}
