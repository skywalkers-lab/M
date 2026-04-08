import type { DerivedSnapshot, TelemetryPacket } from "@pitwall/shared-types";

export function buildDerivedSnapshot(args: {
  roomId: string;
  packet: TelemetryPacket;
  previous: DerivedSnapshot | null;
}): DerivedSnapshot {
  const { roomId, packet, previous } = args;
  const now = Date.now();
  const p = packet.payload;
  const speedKph = parseNum(p.speedKph, previous?.driver.speedKph ?? null);
  const fuelInTank = parseNum(p.fuelInTank, previous?.fuel.fuelInTank ?? null);
  const tyreWear = parseNum(p.tyreWearPct, previous?.tyre.wearPct ?? null);
  const ageLaps = parseNum(p.tyreAgeLaps, previous?.tyre.ageLaps ?? null);

  return {
    roomId,
    sequence: packet.sequence,
    packetTimestamp: packet.timestamp,
    driver: {
      speedKph,
      gear: parseNum(p.gear, previous?.driver.gear ?? null),
      rpm: parseNum(p.rpm, previous?.driver.rpm ?? null),
      throttlePct: parseNum(p.throttlePct, previous?.driver.throttlePct ?? null),
      brakePct: parseNum(p.brakePct, previous?.driver.brakePct ?? null)
    },
    fuel: {
      fuelInTank,
      predictedLapsRemaining: fuelInTank === null ? null : Math.max(0, fuelInTank / 1.8),
      status: fuelInTank === null ? "unavailable" : "live"
    },
    tyre: {
      compound: "UNKNOWN",
      ageLaps,
      wearPct: tyreWear,
      tyreDegTrend:
        tyreWear !== null && previous?.tyre.wearPct !== null && previous?.tyre.wearPct !== undefined
          ? tyreWear - previous.tyre.wearPct
          : null,
      status: tyreWear === null ? "unavailable" : "live"
    },
    connection: {
      heartbeatAt: now,
      lastPacketAt: packet.timestamp,
      stale: now - packet.timestamp > 3000,
      jitterMs: previous ? Math.abs(packet.timestamp - previous.packetTimestamp) : 0
    }
  };
}

function parseNum(value: unknown, fallback: number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}
