import { describe, expect, it } from "vitest";
import { recommendStrategy, runMonteCarlo } from "./index";

describe("strategy-engine monte carlo", () => {
  it("returns ranked candidates", () => {
    const result = runMonteCarlo({
      lapNumber: 18,
      lapsRemaining: 36,
      tyreWearPct: 42,
      tyreDegSlope: 0.8,
      fuelMarginLaps: 0.6,
      gapAhead: 1.4,
      gapBehind: 0.9,
      ersBatteryPct: 58,
      stale: false,
      samples: 500
    });
    expect(result.length).toBe(8);
    expect(result[0].expectedGainSec).toBeGreaterThanOrEqual(result[1].expectedGainSec);
  });

  it("builds strategy contract output", () => {
    const rec = recommendStrategy({
      lapNumber: 24,
      lapsRemaining: 20,
      tyreWearPct: 55,
      tyreDegSlope: 1.3,
      fuelMarginLaps: -0.3,
      gapAhead: 0.8,
      gapBehind: 0.6,
      ersBatteryPct: 40,
      stale: false,
      samples: 500
    });

    expect(rec.source).toBe("monte_carlo");
    expect(typeof rec.recommendationCode).toBe("string");
    expect(rec.rationale.length).toBeGreaterThan(0);
  });
});
