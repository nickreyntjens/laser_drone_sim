export function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return "0m 00s";
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
  }

  return `${remainingMinutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

export function formatEnergy(wh: number): string {
  if (wh >= 1000) {
    return `${(wh / 1000).toFixed(2)} kWh`;
  }

  return `${wh.toFixed(0)} Wh`;
}

export function formatPower(powerW: number): string {
  if (powerW >= 1000) {
    return `${(powerW / 1000).toFixed(2)} kW`;
  }

  return `${powerW.toFixed(0)} W`;
}

export function formatSpeed(speedMps: number, digits = 1): string {
  return `${speedMps.toFixed(digits)} m/s`;
}

export function formatKiloWattHours(wh: number, digits = 2): string {
  return `${(wh / 1000).toFixed(digits)} kWh`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function formatHectares(squareMeters: number, digits = 1): string {
  return `${(squareMeters / 10_000).toFixed(digits)} ha`;
}

export function formatCurrencyUsd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}
