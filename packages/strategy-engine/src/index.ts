import type { StrategyRecommendation } from "@pitwall/shared-types";

export type StrategyCode =
  | "PIT_NOW"
  | "PIT_NEXT_LAP"
  | "EXTEND_2_LAPS"
  | "COVER_RIVAL"
  | "UNDERCUT_RIVAL"
  | "OVERCUT_RIVAL"
  | "FUEL_SAVE_THEN_PUSH"
  | "HARVEST_ERS_THEN_ATTACK";

export type StrategyInput = {
  lapNumber: number;
  lapsRemaining: number;
  tyreWearPct: number;
  tyreDegSlope: number;
  fuelMarginLaps: number;
  gapAhead: number;
  gapBehind: number;
  ersBatteryPct: number;
  stale: boolean;
  samples?: number;
};

export type StrategyCandidateResult = {
  code: StrategyCode;
  expectedGainSec: number;
  expectedFinishPosition: number;
  podiumProbability: number;
  undercutSuccessProbability: number;
  tyreCliffRisk: number;
  confidence: number;
  rationale: string[];
  riskLevel: "low" | "medium" | "high";
};

const CANDIDATES: StrategyCode[] = [
  "PIT_NOW",
  "PIT_NEXT_LAP",
  "EXTEND_2_LAPS",
  "COVER_RIVAL",
  "UNDERCUT_RIVAL",
  "OVERCUT_RIVAL",
  "FUEL_SAVE_THEN_PUSH",
  "HARVEST_ERS_THEN_ATTACK"
];

export function runMonteCarlo(input: StrategyInput): StrategyCandidateResult[] {
  const n = input.samples ?? 3000;
  return CANDIDATES.map((code) => simulateCandidate(code, input, n)).sort((a, b) => b.expectedGainSec - a.expectedGainSec);
}

export function recommendStrategy(input: StrategyInput): StrategyRecommendation {
  const ranked = runMonteCarlo(input);
  const best = ranked[0];
  return {
    recommendationCode: best.code,
    headline: headline(best.code),
    expectedGainSec: round(best.expectedGainSec),
    confidence: round(Math.max(0.05, Math.min(0.98, best.confidence))),
    rationale: best.rationale,
    riskLevel: best.riskLevel,
    source: "monte_carlo",
    stale: input.stale
  };
}

function simulateCandidate(code: StrategyCode, input: StrategyInput, samples: number): StrategyCandidateResult {
  let gainSum = 0;
  let finishPos = 0;
  let podium = 0;
  let undercut = 0;
  let cliff = 0;

  for (let i = 0; i < samples; i += 1) {
    const sc = bernoulli(0.08);
    const traffic = bernoulli(trafficProb(code));
    const overtakeDelay = normal(traffic ? 1.5 : 0.5, 0.6);
    const pitLoss = normal(22.2, 1.6);
    const tyrePenalty = Math.max(0, normal(input.tyreWearPct / 40 + input.tyreDegSlope * 0.2, 0.5));
    const ersEff = normal(input.ersBatteryPct / 100, 0.08);
    const fuelPenalty = input.fuelMarginLaps < 0 ? Math.abs(input.fuelMarginLaps) * normal(1.1, 0.2) : 0;

    let delta = 0;
    if (code === "PIT_NOW") delta += -pitLoss + normal(2.8, 0.9) + (sc ? 7 : 0);
    if (code === "PIT_NEXT_LAP") delta += -pitLoss + normal(2.2, 1.0) + (sc ? 3 : 0);
    if (code === "EXTEND_2_LAPS") delta += normal(1.0, 1.2) - tyrePenalty * 1.4;
    if (code === "COVER_RIVAL") delta += normal(0.8, 0.9) - (input.gapBehind < 1.2 ? 0.2 : 0);
    if (code === "UNDERCUT_RIVAL") delta += normal(2.6, 1.1) - overtakeDelay + (sc ? -1.5 : 0);
    if (code === "OVERCUT_RIVAL") delta += normal(1.4, 1.3) + (sc ? 1.8 : 0);
    if (code === "FUEL_SAVE_THEN_PUSH") delta += normal(0.9, 0.8) - fuelPenalty + normal(ersEff, 0.3);
    if (code === "HARVEST_ERS_THEN_ATTACK") delta += normal(1.2, 0.9) + ersEff * 1.8 - overtakeDelay * 0.5;

    delta -= tyrePenalty;
    if (traffic) delta -= overtakeDelay;

    gainSum += delta;
    const estPos = Math.max(1, Math.round(8 - delta / 2.2));
    finishPos += estPos;
    if (estPos <= 3) podium += 1;
    if (code === "UNDERCUT_RIVAL" && delta > 0.9) undercut += 1;
    if (tyrePenalty > 2.2) cliff += 1;
  }

  const expectedGainSec = gainSum / samples;
  const confidence = Math.max(0, 1 - stdPenalty(expectedGainSec));
  const cliffRisk = cliff / samples;
  return {
    code,
    expectedGainSec,
    expectedFinishPosition: finishPos / samples,
    podiumProbability: podium / samples,
    undercutSuccessProbability: undercut / samples,
    tyreCliffRisk: cliffRisk,
    confidence,
    rationale: [
      `gapAhead=${input.gapAhead.toFixed(2)} gapBehind=${input.gapBehind.toFixed(2)}`,
      `tyreWear=${input.tyreWearPct.toFixed(1)} fuelMargin=${input.fuelMarginLaps.toFixed(2)}`,
      `samples=${samples} expectedGain=${expectedGainSec.toFixed(2)}s`
    ],
    riskLevel: cliffRisk > 0.45 ? "high" : cliffRisk > 0.2 ? "medium" : "low"
  };
}

function headline(code: StrategyCode): string {
  switch (code) {
    case "PIT_NOW":
      return "Pit now to unlock clean-air window";
    case "PIT_NEXT_LAP":
      return "Pit next lap for balanced undercut";
    case "EXTEND_2_LAPS":
      return "Extend stint by two laps";
    case "COVER_RIVAL":
      return "Cover target rival";
    case "UNDERCUT_RIVAL":
      return "Attempt undercut against rival";
    case "OVERCUT_RIVAL":
      return "Target overcut with clean out-lap";
    case "FUEL_SAVE_THEN_PUSH":
      return "Save fuel then push";
    case "HARVEST_ERS_THEN_ATTACK":
      return "Harvest ERS then attack";
  }
}

function bernoulli(p: number): boolean {
  return Math.random() < p;
}

function trafficProb(code: StrategyCode): number {
  if (code === "UNDERCUT_RIVAL" || code === "PIT_NOW") return 0.35;
  if (code === "OVERCUT_RIVAL") return 0.22;
  return 0.28;
}

function normal(mean: number, std: number): number {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function stdPenalty(gain: number): number {
  return Math.min(0.7, Math.abs(gain) / 10);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
