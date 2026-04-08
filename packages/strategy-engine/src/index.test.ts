import { describe, expect, it } from "vitest";
import { estimateStrategyState, generateCandidatePolicies, recommendStrategyV2, runConditionalMonteCarlo } from "./index";

describe("strategy-engine v2", () => {
  it("generates expanded policy candidates", () => {
    const policies = generateCandidatePolicies();
    expect(policies.length).toBe(14);
    expect(policies.some((p) => p.code === "DELAY_FOR_SC_THRESHOLD")).toBe(true);
  });

  it("runs conditional monte carlo with downside metrics", () => {
    const evals = runConditionalMonteCarlo({
      lapNumber: 19,
      lapsRemaining: 31,
      tyreWearPct: 48,
      tyreDegSlope: 1.0,
      fuelMarginLaps: 0.2,
      gapAhead: 1.1,
      gapBehind: 0.7,
      ersBatteryPct: 52,
      stale: false,
      samples: 600
    });
    expect(evals[0]).toHaveProperty("cvarLoss");
    expect(evals[0].score).toBeGreaterThan(evals.at(-1)!.score);
  });

  it("returns primary/safe/gamble with stability and uncertainty", () => {
    const rec = recommendStrategyV2({
      lapNumber: 25,
      lapsRemaining: 20,
      tyreWearPct: 60,
      tyreDegSlope: 1.5,
      fuelMarginLaps: -0.4,
      gapAhead: 0.9,
      gapBehind: 0.8,
      ersBatteryPct: 45,
      stale: false,
      previousRecommendationCode: "SAFE_POINTS_MODE",
      samples: 600
    });

    expect(rec.source).toBe("monte_carlo");
    expect(rec.alternatives.safe.code).toBeTruthy();
    expect(rec.alternatives.gamble.code).toBeTruthy();
    expect(rec.stabilityScore).toBeGreaterThan(0);
    expect(rec.uncertaintyDrivers.length).toBeGreaterThan(0);
  });

  it("builds strategy state estimator", () => {
    const state = estimateStrategyState({
      lapNumber: 15,
      lapsRemaining: 40,
      tyreWearPct: 30,
      tyreDegSlope: 0.7,
      fuelMarginLaps: 0.5,
      gapAhead: 1.8,
      gapBehind: 1.5,
      ersBatteryPct: 70,
      stale: false
    });
    expect(state.tyreCliffProbability).toBeGreaterThan(0);
    expect(state.scHazardMedium).toBeGreaterThan(state.scHazardShort);
  });
});
