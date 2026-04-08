import type { StrategyRecommendation } from "@pitwall/shared-types";

export type StrategyCode =
  | "PIT_NOW"
  | "PIT_NEXT_LAP"
  | "EXTEND_2_LAPS"
  | "COVER_RIVAL"
  | "UNDERCUT_RIVAL"
  | "OVERCUT_RIVAL"
  | "FUEL_SAVE_THEN_PUSH"
  | "HARVEST_ERS_THEN_ATTACK"
  | "COVER_SPECIFIC_RIVAL"
  | "OPTIMIZE_CLEAN_AIR"
  | "DELAY_FOR_SC_THRESHOLD"
  | "SAFE_POINTS_MODE"
  | "HIGH_VARIANCE_GAMBLE"
  | "ERS_HOLD_UNTIL_OUTLAP_ATTACK";

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
  previousRecommendationCode?: string;
  samples?: number;
};

export type StrategyStateVector = {
  baselinePace: number;
  tyreDegradationSlope: number;
  tyreCliffProbability: number;
  fuelCorrectedPaceDelta: number;
  ersAggressionScore: number;
  pitLossEstimate: number;
  rejoinTrafficRisk: number;
  overtakingDifficulty: number;
  scHazardShort: number;
  scHazardMedium: number;
};

type CandidatePolicy = {
  code: StrategyCode;
  mode: "safe" | "balanced" | "aggressive";
  intent: string;
};

type SimulationOutcome = {
  gainSec: number;
  finishPos: number;
  points: boolean;
  podium: boolean;
  undercutSuccess: boolean;
  lossTail: number;
  rejoinQuality: "poor" | "medium" | "strong";
};

type CandidateEval = {
  policy: CandidatePolicy;
  expectedGain: number;
  medianGain: number;
  downsideRisk: number;
  cvarLoss: number;
  podiumProb: number;
  pointsProb: number;
  undercutProb: number;
  stability: number;
  score: number;
  rejoinQuality: "poor" | "medium" | "strong";
};

const POLICIES: CandidatePolicy[] = [
  { code: "PIT_NOW", mode: "balanced", intent: "Immediate box" },
  { code: "PIT_NEXT_LAP", mode: "balanced", intent: "Box next lap" },
  { code: "EXTEND_2_LAPS", mode: "balanced", intent: "Stint extend" },
  { code: "COVER_RIVAL", mode: "safe", intent: "Cover nearest rival" },
  { code: "UNDERCUT_RIVAL", mode: "aggressive", intent: "Undercut push" },
  { code: "OVERCUT_RIVAL", mode: "balanced", intent: "Overcut" },
  { code: "FUEL_SAVE_THEN_PUSH", mode: "safe", intent: "Fuel save then attack" },
  { code: "HARVEST_ERS_THEN_ATTACK", mode: "balanced", intent: "ERS cycle" },
  { code: "COVER_SPECIFIC_RIVAL", mode: "safe", intent: "Shadow target rival" },
  { code: "OPTIMIZE_CLEAN_AIR", mode: "balanced", intent: "Find clean air" },
  { code: "DELAY_FOR_SC_THRESHOLD", mode: "balanced", intent: "Wait SC threshold" },
  { code: "SAFE_POINTS_MODE", mode: "safe", intent: "Conservative points" },
  { code: "HIGH_VARIANCE_GAMBLE", mode: "aggressive", intent: "High variance attack" },
  { code: "ERS_HOLD_UNTIL_OUTLAP_ATTACK", mode: "aggressive", intent: "Out-lap ERS spike" }
];

export function estimateStrategyState(input: StrategyInput): StrategyStateVector {
  const cliffBase = sigmoid((input.tyreWearPct - 45) / 12 + input.tyreDegSlope * 0.8);
  return {
    baselinePace: 90 + clamp(1 - input.tyreWearPct / 100, 0, 1) * 6,
    tyreDegradationSlope: Math.max(0.1, input.tyreDegSlope),
    tyreCliffProbability: clamp(cliffBase, 0.02, 0.98),
    fuelCorrectedPaceDelta: -input.fuelMarginLaps * 0.18,
    ersAggressionScore: clamp(input.ersBatteryPct / 100, 0, 1),
    pitLossEstimate: 21.5 + Math.max(0, input.gapBehind < 1.0 ? 1.1 : 0),
    rejoinTrafficRisk: clamp(sigmoid((2.1 - input.gapAhead) * 1.2), 0.05, 0.95),
    overtakingDifficulty: clamp(sigmoid((1.2 - input.gapAhead) + 0.3), 0.05, 0.95),
    scHazardShort: clamp(0.05 + 0.12 * sigmoid((input.lapNumber - 12) / 7), 0.03, 0.35),
    scHazardMedium: clamp(0.09 + 0.18 * sigmoid((input.lapNumber - 20) / 8), 0.05, 0.45)
  };
}

export function generateCandidatePolicies(): CandidatePolicy[] {
  return POLICIES;
}

export function runConditionalMonteCarlo(input: StrategyInput, state = estimateStrategyState(input)): CandidateEval[] {
  const samples = input.samples ?? 2500;
  return generateCandidatePolicies().map((policy) => evaluatePolicy(policy, state, input, samples));
}

export function recommendStrategyV2(input: StrategyInput): StrategyRecommendation {
  const state = estimateStrategyState(input);
  const evals = runConditionalMonteCarlo(input, state);
  const sorted = evals.sort((a, b) => b.score - a.score);
  const primaryRaw = sorted[0];
  const safeAlt = sorted.find((e) => e.policy.mode === "safe" && e.policy.code !== primaryRaw.policy.code) ?? sorted[1];
  const gambleAlt = sorted.find((e) => e.policy.mode === "aggressive" && e.policy.code !== primaryRaw.policy.code) ?? sorted[2];

  const stabilized = stabilizeRecommendation(primaryRaw, sorted, input.previousRecommendationCode);
  const uncertaintyDrivers = buildUncertaintyDrivers(state);

  return {
    recommendationCode: stabilized.policy.code,
    headline: buildHeadline(stabilized.policy.code),
    expectedGainSec: round3(stabilized.expectedGain),
    confidence: round3(stabilized.stability),
    rationale: buildExplanation(stabilized, state),
    riskLevel: stabilized.downsideRisk > 2.1 ? "high" : stabilized.downsideRisk > 1.2 ? "medium" : "low",
    source: "monte_carlo",
    stale: input.stale,
    alternatives: {
      safe: { code: safeAlt.policy.code, headline: buildHeadline(safeAlt.policy.code), expectedGainSec: round3(safeAlt.expectedGain) },
      gamble: { code: gambleAlt.policy.code, headline: buildHeadline(gambleAlt.policy.code), expectedGainSec: round3(gambleAlt.expectedGain) }
    },
    downsideRisk: round3(stabilized.downsideRisk),
    cvarLoss: round3(stabilized.cvarLoss),
    stabilityScore: round3(stabilized.stability),
    uncertaintyDrivers,
    trafficTrapRisk: round3(state.rejoinTrafficRisk),
    scBenefitIfExtend: round3(state.scHazardShort * 3.2),
    rejoinQuality: stabilized.rejoinQuality,
    modelConfidence: round3(1 - state.tyreCliffProbability * 0.35),
    dataFreshnessConfidence: input.stale ? 0.35 : 0.88
  };
}

function evaluatePolicy(policy: CandidatePolicy, state: StrategyStateVector, input: StrategyInput, samples: number): CandidateEval {
  const outcomes: SimulationOutcome[] = [];
  for (let i = 0; i < samples; i += 1) outcomes.push(simulate(policy, state, input));
  const gains = outcomes.map((o) => o.gainSec).sort((a, b) => a - b);
  const expectedGain = avg(gains);
  const medianGain = gains[Math.floor(gains.length * 0.5)] ?? 0;
  const tail = gains.slice(0, Math.max(1, Math.floor(gains.length * 0.1)));
  const cvar = Math.abs(avg(tail));
  const downside = Math.abs(Math.min(0, gains[Math.floor(gains.length * 0.2)] ?? 0));
  const podiumProb = outcomes.filter((o) => o.podium).length / samples;
  const pointsProb = outcomes.filter((o) => o.points).length / samples;
  const undercutProb = outcomes.filter((o) => o.undercutSuccess).length / samples;
  const rejoinQuality = dominantQuality(outcomes.map((o) => o.rejoinQuality));

  const score =
    expectedGain * 0.55 +
    medianGain * 0.2 +
    podiumProb * 1.4 +
    pointsProb * 0.6 -
    downside * 0.5 -
    cvar * 0.35 +
    (policy.mode === "safe" ? 0.1 : 0);

  return {
    policy,
    expectedGain,
    medianGain,
    downsideRisk: downside,
    cvarLoss: cvar,
    podiumProb,
    pointsProb,
    undercutProb,
    stability: clamp(1 - (downside + cvar) / 8, 0.05, 0.98),
    score,
    rejoinQuality
  };
}

function simulate(policy: CandidatePolicy, s: StrategyStateVector, input: StrategyInput): SimulationOutcome {
  const cliff = bernoulli(s.tyreCliffProbability + (policy.code === "EXTEND_2_LAPS" ? 0.1 : 0));
  const pitLoss = normal(s.pitLossEstimate, 1.2);
  const inLapQ = normal(policy.mode === "aggressive" ? 0.7 : 0.2, 0.4);
  const outLapWarmupLoss = Math.max(0, normal(1.4 + s.tyreDegradationSlope * 0.5, 0.5));
  const traffic = normal(s.rejoinTrafficRisk, 0.12);
  const overtakeCost = normal(s.overtakingDifficulty * 1.9, 0.45);
  const rivalCover = bernoulli(0.42);
  const scNow = bernoulli(s.scHazardShort);
  const scMed = bernoulli(s.scHazardMedium);
  const ersEff = normal(s.ersAggressionScore, 0.1);
  const fuelPenalty = input.fuelMarginLaps < 0 ? Math.abs(input.fuelMarginLaps) * normal(1.0, 0.2) : 0;

  let gain = 0;
  if (policy.code === "PIT_NOW") gain += -pitLoss + 2.5 + (scNow ? 4 : 0);
  if (policy.code === "PIT_NEXT_LAP") gain += -pitLoss + 2.0 + (scMed ? 2.5 : 0);
  if (policy.code === "EXTEND_2_LAPS") gain += 1.0 + (scMed ? 2 : 0) - (cliff ? 3.6 : 0.6);
  if (policy.code === "UNDERCUT_RIVAL") gain += 2.7 + inLapQ - (rivalCover ? 0.9 : 0.1);
  if (policy.code === "OVERCUT_RIVAL") gain += 1.5 + (scMed ? 1.2 : 0) - (cliff ? 1.9 : 0.2);
  if (policy.code === "COVER_RIVAL" || policy.code === "COVER_SPECIFIC_RIVAL") gain += 0.9 - (input.gapBehind < 1 ? 0.25 : 0.05);
  if (policy.code === "OPTIMIZE_CLEAN_AIR") gain += 1.3 - traffic * 1.8;
  if (policy.code === "DELAY_FOR_SC_THRESHOLD") gain += (scNow || scMed ? 2.8 : -0.5) - (cliff ? 1.2 : 0.2);
  if (policy.code === "SAFE_POINTS_MODE") gain += 0.5 - cliff * 0.8 - fuelPenalty * 0.2;
  if (policy.code === "HIGH_VARIANCE_GAMBLE") gain += normal(1.8, 2.2);
  if (policy.code === "FUEL_SAVE_THEN_PUSH") gain += 0.8 + ersEff - fuelPenalty;
  if (policy.code === "HARVEST_ERS_THEN_ATTACK" || policy.code === "ERS_HOLD_UNTIL_OUTLAP_ATTACK") gain += 1.1 + ersEff * 1.8 - outLapWarmupLoss * 0.2;

  gain -= outLapWarmupLoss * 0.35;
  gain -= traffic * 1.6;
  gain -= overtakeCost * 0.6;

  const finishPos = Math.max(1, Math.round(8 - gain / 2.1));
  const rejoinQuality: "poor" | "medium" | "strong" = traffic > 0.6 ? "poor" : traffic > 0.35 ? "medium" : "strong";
  return {
    gainSec: gain,
    finishPos,
    points: finishPos <= 10,
    podium: finishPos <= 3,
    undercutSuccess: policy.code === "UNDERCUT_RIVAL" && gain > 0.8,
    lossTail: Math.max(0, -gain),
    rejoinQuality
  };
}

function stabilizeRecommendation(primary: CandidateEval, sorted: CandidateEval[], prevCode?: string): CandidateEval {
  if (!prevCode) return primary;
  const prev = sorted.find((c) => c.policy.code === prevCode);
  if (!prev) return primary;
  const delta = primary.score - prev.score;
  const hysteresis = 0.22;
  const cooldownPenalty = 0.08;
  if (delta < hysteresis || primary.stability < 0.45) {
    return { ...prev, score: prev.score - cooldownPenalty, stability: Math.max(prev.stability, 0.42) };
  }
  return primary;
}

function buildExplanation(primary: CandidateEval, s: StrategyStateVector): string[] {
  return [
    `Clean air window value ${(1 - s.rejoinTrafficRisk).toFixed(2)} in next 2 laps`,
    `Tyre cliff probability ${(s.tyreCliffProbability * 100).toFixed(0)}%`,
    `Undercut success ${(primary.undercutProb * 100).toFixed(0)}% across MC runs`,
    `SC wait value ${(s.scHazardShort * 3.2).toFixed(2)} sec equivalent`,
    `Rejoin traffic risk ${(s.rejoinTrafficRisk * 100).toFixed(0)}% (${primary.rejoinQuality})`
  ];
}

function buildUncertaintyDrivers(s: StrategyStateVector): string[] {
  const drivers: string[] = [];
  if (s.scHazardShort > 0.18) drivers.push("SC hazard variance");
  if (s.rejoinTrafficRisk > 0.45) drivers.push("traffic variance");
  if (s.tyreCliffProbability > 0.4) drivers.push("tyre cliff uncertainty");
  if (!drivers.length) drivers.push("baseline model noise");
  return drivers;
}

function dominantQuality(values: Array<"poor" | "medium" | "strong">): "poor" | "medium" | "strong" {
  const count = { poor: 0, medium: 0, strong: 0 };
  for (const v of values) count[v] += 1;
  if (count.poor >= count.medium && count.poor >= count.strong) return "poor";
  if (count.medium >= count.strong) return "medium";
  return "strong";
}

function bernoulli(p: number): boolean {
  return Math.random() < clamp(p, 0, 1);
}

function normal(mean: number, std: number): number {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function buildHeadline(code: StrategyCode): string {
  return code.replaceAll("_", " ");
}
