import { z } from "zod";

export const DataQualitySchema = z.enum(["live", "estimated", "stale", "unavailable"]);
export type DataQuality = z.infer<typeof DataQualitySchema>;

export const BadgeSeveritySchema = z.enum(["info", "success", "warning", "danger"]);
export type BadgeSeverity = z.infer<typeof BadgeSeveritySchema>;

export const RoleSchema = z.enum(["viewer", "engineer", "strategist", "admin", "driver"]);
export type Role = z.infer<typeof RoleSchema>;

export const VisibilitySchema = z.enum(["public", "private", "unlisted"]);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const RoomSchema = z.object({
  roomId: z.string().uuid(),
  slug: z.string().min(2),
  displayName: z.string().min(1),
  driverName: z.string().min(1),
  visibility: VisibilitySchema,
  roomPasswordHash: z.string().min(1),
  engineerAccessCodeHash: z.string().min(1),
  ownerSessionId: z.string().min(1),
  status: z.enum(["active", "closed"]),
  metadata: z.record(z.string(), z.unknown()).default({})
});
export type Room = z.infer<typeof RoomSchema>;

export const TelemetryPacketSchema = z.object({
  packetType: z.enum(["session", "lap", "carTelemetry", "carStatus", "event", "unknown"]),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown())
});
export type TelemetryPacket = z.infer<typeof TelemetryPacketSchema>;

const MetricValueSchema = z.object({
  value: z.number().nullable(),
  quality: DataQualitySchema,
  note: z.string().optional()
});
export type MetricValue = z.infer<typeof MetricValueSchema>;

export const FuelStateSchema = z.object({
  fuelInTank: MetricValueSchema,
  fuelPerLapEstimate: MetricValueSchema,
  predictedLapsRemaining: MetricValueSchema,
  fuelMargin: MetricValueSchema,
  stintPhase: z.enum(["launch", "build", "manage", "attack", "critical"]).default("build"),
  fuelStateQuality: DataQualitySchema
});
export type FuelState = z.infer<typeof FuelStateSchema>;

export const TyreStateSchema = z.object({
  compound: z.string().nullable(),
  ageLaps: MetricValueSchema,
  wearByCorner: z.object({ fl: MetricValueSchema, fr: MetricValueSchema, rl: MetricValueSchema, rr: MetricValueSchema }),
  avgWear: MetricValueSchema,
  tempsByCorner: z.object({ fl: MetricValueSchema, fr: MetricValueSchema, rl: MetricValueSchema, rr: MetricValueSchema }),
  avgTemp: MetricValueSchema,
  degradationTrend: MetricValueSchema,
  tyreStateQuality: DataQualitySchema
});
export type TyreState = z.infer<typeof TyreStateSchema>;

export const ErsStateSchema = z.object({
  batteryPct: MetricValueSchema,
  deployModeLabel: z.string(),
  harvestTrend: MetricValueSchema,
  ersStateQuality: DataQualitySchema
});
export type ErsState = z.infer<typeof ErsStateSchema>;

export const DamageStateSchema = z.object({
  wingDamageHeuristic: MetricValueSchema,
  floorDamageHeuristic: MetricValueSchema,
  aeroLossHeuristic: MetricValueSchema,
  engineWearTrend: MetricValueSchema,
  damageStateQuality: DataQualitySchema
});
export type DamageState = z.infer<typeof DamageStateSchema>;

export const PositionStateSchema = z.object({
  currentPosition: MetricValueSchema,
  gapAhead: MetricValueSchema,
  gapBehind: MetricValueSchema,
  intervalAhead: MetricValueSchema,
  intervalBehind: MetricValueSchema,
  threatLevel: z.enum(["low", "medium", "high"]),
  cleanAirWindow: z.enum(["open", "narrow", "blocked"]),
  undercutRisk: z.enum(["low", "medium", "high"]),
  rejoinEstimatePosition: MetricValueSchema,
  pitWindowOpenLap: MetricValueSchema,
  positionStateQuality: DataQualitySchema
});
export type PositionState = z.infer<typeof PositionStateSchema>;

export const DriverStateSchema = z.object({
  speedKph: MetricValueSchema,
  gear: MetricValueSchema,
  rpm: MetricValueSchema,
  throttlePct: MetricValueSchema,
  brakePct: MetricValueSchema,
  lapNumber: MetricValueSchema,
  sector: MetricValueSchema,
  lapDelta: MetricValueSchema,
  sessionType: z.string().default("RACE")
});
export type DriverState = z.infer<typeof DriverStateSchema>;

export const DiagnosticsStateSchema = z.object({
  relayConnected: z.boolean(),
  lastPacketAt: z.number().int().nonnegative().nullable(),
  snapshotAgeMs: z.number().nonnegative(),
  packetRate: z.number().nonnegative(),
  bitrateKbps: z.number().nonnegative(),
  jitterScore: z.number().nonnegative(),
  stale: z.boolean(),
  partialTelemetry: z.boolean(),
  diagnosticsQuality: DataQualitySchema
});
export type DiagnosticsState = z.infer<typeof DiagnosticsStateSchema>;

export const StrategyRecommendationSchema = z.object({
  recommendationCode: z.string(),
  headline: z.string(),
  expectedGainSec: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
  source: z.enum(["heuristic", "monte_carlo"]),
  stale: z.boolean()
});
export type StrategyRecommendation = z.infer<typeof StrategyRecommendationSchema>;

export const ReplayEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("telemetry.snapshot.received"), ts: z.number(), roomId: z.string(), sequence: z.number() }),
  z.object({ type: z.literal("strategy.recommendation.updated"), ts: z.number(), roomId: z.string(), headline: z.string() }),
  z.object({ type: z.literal("racecontrol.flag"), ts: z.number(), roomId: z.string(), flag: z.string(), detail: z.string() }),
  z.object({ type: z.literal("engineer.command.issued"), ts: z.number(), roomId: z.string(), command: z.string(), byRole: RoleSchema }),
  z.object({ type: z.literal("driver.status.warning"), ts: z.number(), roomId: z.string(), warning: z.string() }),
  z.object({ type: z.literal("room.participant.joined"), ts: z.number(), roomId: z.string(), role: RoleSchema })
]);
export type ReplayEvent = z.infer<typeof ReplayEventSchema>;

export const ClassificationEntrySchema = z.object({
  pos: z.number(),
  driver: z.string(),
  gap: z.string(),
  interval: z.string(),
  threat: z.string(),
  currentStint: z.string(),
  tyre: z.string(),
  pitCount: z.number()
});
export type ClassificationEntry = z.infer<typeof ClassificationEntrySchema>;

export const DerivedSnapshotSchema = z.object({
  roomId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  packetTimestamp: z.number().int().nonnegative(),
  driverName: z.string(),
  driver: DriverStateSchema,
  fuel: FuelStateSchema,
  tyre: TyreStateSchema,
  ers: ErsStateSchema,
  damage: DamageStateSchema,
  position: PositionStateSchema,
  diagnostics: DiagnosticsStateSchema,
  strategy: StrategyRecommendationSchema,
  classification: z.array(ClassificationEntrySchema),
  raceControlLog: z.array(z.string()),
  strategyLog: z.array(z.string()),
  telemetryRestricted: z.boolean()
});
export type DerivedSnapshot = z.infer<typeof DerivedSnapshotSchema>;

export type ClientToRelayMessage =
  | {
      type: "room.create";
      slug: string;
      displayName: string;
      driverName: string;
      roomPassword: string;
      engineerAccessCode: string;
      visibility: Visibility;
    }
  | { type: "room.list" }
  | { type: "room.join"; roomId: string; password: string; accessCode?: string }
  | { type: "telemetry.raw"; roomId: string; packet: TelemetryPacket }
  | { type: "engineer.action"; roomId: string; action: "BOX_THIS_LAP" | "PUSH_NOW" | "HARVEST_MODE" | "HOLD_POS" }
  | { type: "heartbeat" };

export type RelayToClientMessage =
  | { type: "room.created"; roomId: string }
  | { type: "room.listed"; rooms: Array<Pick<Room, "roomId" | "slug" | "displayName" | "driverName" | "visibility" | "status">> }
  | { type: "room.joined"; roomId: string; role: Role; snapshot: DerivedSnapshot | null; diagnostics?: DiagnosticsState }
  | { type: "snapshot.full"; roomId: string; snapshot: DerivedSnapshot }
  | { type: "snapshot.delta"; roomId: string; snapshot: DerivedSnapshot }
  | { type: "event.feed"; roomId: string; event: ReplayEvent }
  | { type: "error"; code: string; message: string };

export function metric(value: number | null, quality: DataQuality, note?: string): MetricValue {
  return { value, quality, note };
}
