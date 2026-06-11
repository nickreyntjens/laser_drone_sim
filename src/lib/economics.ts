import { FieldType } from "../sim/types";

export interface SprayBaseline {
  /** Short label for the conventional treatment being compared against. */
  label: string;
  /** Typical cost of one conventional chemical application, product plus operation, USD per hectare. */
  costPerHectareUsd: number;
}

/**
 * Indicative single-application costs for the conventional chemical alternative.
 * These are order-of-magnitude reference points for the comparison widget, not quotes.
 */
export const SPRAY_BASELINES: Record<FieldType, SprayBaseline> = {
  potatoColoradoBeetle: { label: "conventional insecticide pass", costPerHectareUsd: 45 },
  riceYellowStemBorerEgg: { label: "conventional insecticide pass", costPerHectareUsd: 35 },
  orchardMarmoratedStinkBug: { label: "orchard airblast spray pass", costPerHectareUsd: 90 },
  greenhouseTulipCaterpillar: { label: "greenhouse chemical treatment", costPerHectareUsd: 110 }
};

/** Format very small per-hectare costs legibly: cents below $0.10, dollars above. */
export function formatCostPerHectare(valueUsd: number): string {
  if (!Number.isFinite(valueUsd) || valueUsd <= 0) {
    return "$0.00";
  }

  if (valueUsd < 0.095) {
    const cents = valueUsd * 100;
    if (cents < 0.095) {
      return `${cents.toFixed(2)}¢`;
    }
    return `${cents < 1 ? cents.toFixed(1) : cents.toFixed(0)}¢`;
  }

  return `$${valueUsd.toFixed(2)}`;
}

/** How many times cheaper the simulated mission is than the conventional baseline, rounded for display. */
export function savingsMultiple(costPerHectareUsd: number, fieldType: FieldType): number {
  const baseline = SPRAY_BASELINES[fieldType].costPerHectareUsd;
  const raw = baseline / Math.max(costPerHectareUsd, 1e-6);
  if (raw >= 1000) {
    return Math.round(raw / 100) * 100;
  }
  if (raw >= 100) {
    return Math.round(raw / 10) * 10;
  }
  return Math.round(raw);
}

export function formatSavingsMultiple(multiple: number): string {
  return `${multiple.toLocaleString("en-US")}×`;
}
