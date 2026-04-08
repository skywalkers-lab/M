import { z } from "zod";

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

export const DriverStateSchema = z.object({
  speedKph: z.number().nullable(),
  gear: z.number().nullable(),
  rpm: z.number().nullable(),
  throttlePct: z.number().nullable(),
  brakePct: z.number().nullable()
});
export type DriverState = z.infer<typeof DriverStateSchema>;

export const FuelStateSchema = z.object({
  fuelInTank: z.number().nullable(),
  predictedLapsRemaining: z.number().nullable(),
  status: z.enum(["live", "estimated", "stale", "unavailable"])
});
export type FuelState = z.infer<typeof FuelStateSchema>;

export const TyreStateSchema = z.object({
  compound: z.string().nullable(),
  ageLaps: z.number().nullable(),
  wearPct: z.number().nullable(),
  tyreDegTrend: z.number().nullable(),
  status: z.enum(["live", "estimated", "stale", "unavailable"])
});
export type TyreState = z.infer<typeof TyreStateSchema>;

export const ConnectionHealthStateSchema = z.object({
  heartbeatAt: z.number().int().nonnegative(),
  lastPacketAt: z.number().int().nonnegative().nullable(),
  stale: z.boolean(),
  jitterMs: z.number().nonnegative()
});
export type ConnectionHealthState = z.infer<typeof ConnectionHealthStateSchema>;

export const DerivedSnapshotSchema = z.object({
  roomId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  packetTimestamp: z.number().int().nonnegative(),
  driver: DriverStateSchema,
  fuel: FuelStateSchema,
  tyre: TyreStateSchema,
  connection: ConnectionHealthStateSchema
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
  | { type: "heartbeat" };

export type RelayToClientMessage =
  | { type: "room.created"; roomId: string }
  | { type: "room.listed"; rooms: Array<Pick<Room, "roomId" | "slug" | "displayName" | "driverName" | "visibility" | "status">> }
  | { type: "room.joined"; roomId: string; role: Role; snapshot: DerivedSnapshot | null }
  | { type: "snapshot.full"; roomId: string; snapshot: DerivedSnapshot }
  | { type: "snapshot.delta"; roomId: string; snapshot: DerivedSnapshot }
  | { type: "error"; code: string; message: string };
