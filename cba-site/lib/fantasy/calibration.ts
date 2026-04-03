// ============================================================
// lib/fantasy/calibration.ts
//
// Piecewise linear calibration for raw Monte Carlo win probabilities.
//
// Derived from backtest results on 424 matchups (2022–2025):
//   accuracy=54.2%, brier=0.2498, ECE=4.7%, bias=+4.1%
//
// The sim over-predicts favorites by ~4.1% on average. The calibration
// map compresses probabilities toward 50%, with stronger compression
// at extreme values where overconfidence is worst.
//
// The map covers [0.50, 1.00]; values below 0.50 are handled by symmetry
// (calibrateWinProbability(p) = 1 - calibrate(1 - p) for p < 0.5).
// ============================================================

/**
 * A piecewise linear calibration map.
 * Each entry is [rawProb, calibratedProb] for the [0.50, 1.00] range.
 * Derived from observed bias and ECE buckets in the 2022–2025 backtest.
 */
const CALIBRATION_MAP: Array<[number, number]> = [
  [0.50, 0.50],  // midpoint: no adjustment
  [0.55, 0.53],  // slight compression
  [0.60, 0.57],  // ~3% compression
  [0.65, 0.61],  // ~4% compression
  [0.70, 0.64],  // ~6% compression
  [0.75, 0.68],  // ~7% compression
  [0.80, 0.73],  // ~7% compression
  [0.85, 0.78],  // ~7% compression
  [0.90, 0.83],  // ~7% compression
  [0.95, 0.87],  // ~8% compression (extreme probs compressed most)
  [1.00, 0.92],  // hard cap: never output 100% (model uncertainty)
];

/**
 * Piecewise linear interpolation over the calibration map.
 * Input must be in [0.5, 1.0].
 */
function interpolate(rawProb: number): number {
  const map = CALIBRATION_MAP;

  // Below first breakpoint or above last — clamp
  if (rawProb <= map[0][0]) return map[0][1];
  if (rawProb >= map[map.length - 1][0]) return map[map.length - 1][1];

  for (let i = 0; i < map.length - 1; i++) {
    const [x0, y0] = map[i];
    const [x1, y1] = map[i + 1];
    if (rawProb >= x0 && rawProb <= x1) {
      const t = (rawProb - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }

  return rawProb; // fallback (should never reach here)
}

/**
 * Applies calibration to a raw Monte Carlo win probability.
 *
 * The calibration compresses overconfident estimates toward 50%,
 * correcting the observed +4.1% bias (sim over-predicts favorites).
 *
 * @param rawProb - Raw win probability in [0, 1] from the Monte Carlo sim
 * @returns Calibrated probability in [0, 1]
 */
export function calibrateWinProbability(rawProb: number): number {
  const clamped = Math.max(0, Math.min(1, rawProb));

  if (clamped >= 0.5) {
    return interpolate(clamped);
  } else {
    // Symmetric: calibrate the "opponent's" probability and flip
    return 1 - interpolate(1 - clamped);
  }
}
