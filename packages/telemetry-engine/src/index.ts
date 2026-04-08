import { metric, type DataQuality, type DerivedSnapshot, type ReplayEvent, type TelemetryPacket } from "@pitwall/shared-types";
import { recommendStrategy } from "@pitwall/strategy-engine";

export type DeriveArgs = {
  roomId: string;
  driverName: string;
  packet: TelemetryPacket;
  previous: DerivedSnapshot | null;
  relayConnected: boolean;
};

export function buildDerivedSnapshot(args: DeriveArgs): DerivedSnapshot {
  const { roomId, packet, previous, relayConnected, driverName } = args;
  const now = Date.now();
  const p = packet.payload;

  const speed = numberOrNull(p.speedKph);
  const gear = numberOrNull(p.gear);
  const rpm = numberOrNull(p.rpm);
  const throttle = numberOrNull(p.throttlePct);
  const brake = numberOrNull(p.brakePct);
  const fuelInTank = numberOrNull(p.fuelInTank);
  const tyreWear = numberOrNull(p.tyreWearPct);
  const tyreAge = numberOrNull(p.tyreAgeLaps);

  const lastTs = previous?.packetTimestamp ?? packet.timestamp;
  const intervalMs = Math.max(1, packet.timestamp - lastTs);
  const packetRate = Math.min(60, Math.round(1000 / intervalMs));
  const bitrateKbps = Math.round(((packet.payload.byteLength as number | undefined) ?? 256) * packetRate * 8 / 1000);

  const stale = now - packet.timestamp > 3000;
  const partialTelemetry = speed === null || fuelInTank === null || tyreWear === null;

  const fuelPerLapEstimate = estimateFuelPerLap(previous, fuelInTank);
  const predictedLapsRemaining = fuelInTank !== null && fuelPerLapEstimate > 0 ? fuelInTank / fuelPerLapEstimate : null;
  const fuelMargin = predictedLapsRemaining !== null ? predictedLapsRemaining - 3 : null;

  const wearDelta = tyreWear !== null && previous?.tyre.avgWear.value !== null ? tyreWear - previous.tyre.avgWear.value : null;
  const ersBattery = normalizeErs(throttle, brake);
  const currentPosition = estimatePosition(speed, previous?.position.currentPosition.value ?? null);
  const gapAhead = estimateGap(speed, previous?.position.gapAhead.value ?? 1.2, "ahead");
  const gapBehind = estimateGap(speed, previous?.position.gapBehind.value ?? 1.5, "behind");
  const threatLevel = gapBehind !== null && gapBehind < 1 ? "high" : gapBehind !== null && gapBehind < 2.2 ? "medium" : "low";
  const cleanAirWindow = gapAhead !== null && gapAhead > 2.5 ? "open" : gapAhead !== null && gapAhead > 1.2 ? "narrow" : "blocked";
  const undercutRisk = threatLevel === "high" && (tyreWear ?? 0) > 40 ? "high" : threatLevel === "medium" ? "medium" : "low";

  const qualityBase: DataQuality = partialTelemetry ? "estimated" : "live";
  const quality = stale ? "stale" : qualityBase;
  const unavailable: DataQuality = stale ? "stale" : "unavailable";

  const strategy = recommendStrategy({
    lapNumber: numberOrNull(p.lapNumber) ?? 1,
    lapsRemaining: Math.max(1, 58 - (numberOrNull(p.lapNumber) ?? 1)),
    tyreWearPct: tyreWear ?? 30,
    tyreDegSlope: wearDelta ?? 0.6,
    fuelMarginLaps: fuelMargin ?? 0,
    gapAhead: gapAhead ?? 1.5,
    gapBehind: gapBehind ?? 1.5,
    ersBatteryPct: ersBattery ?? 50,
    stale
  });

  return {
    roomId,
    sequence: packet.sequence,
    packetTimestamp: packet.timestamp,
    driverName,
    driver: {
      speedKph: metric(speed ?? previous?.driver.speedKph.value ?? null, speed === null ? unavailable : quality),
      gear: metric(gear ?? previous?.driver.gear.value ?? null, gear === null ? unavailable : quality),
      rpm: metric(rpm ?? previous?.driver.rpm.value ?? null, rpm === null ? unavailable : quality),
      throttlePct: metric(throttle ?? previous?.driver.throttlePct.value ?? null, throttle === null ? unavailable : quality),
      brakePct: metric(brake ?? previous?.driver.brakePct.value ?? null, brake === null ? unavailable : quality),
      lapNumber: metric(numberOrNull(p.lapNumber) ?? previous?.driver.lapNumber.value ?? 1, quality),
      sector: metric(numberOrNull(p.sector) ?? previous?.driver.sector.value ?? 1, quality),
      lapDelta: metric(numberOrNull(p.lapDelta) ?? previous?.driver.lapDelta.value ?? 0, qualityBase),
      sessionType: (typeof p.sessionType === "string" ? p.sessionType : previous?.driver.sessionType) ?? "RACE"
    },
    fuel: {
      fuelInTank: metric(fuelInTank ?? previous?.fuel.fuelInTank.value ?? null, fuelInTank === null ? unavailable : quality),
      fuelPerLapEstimate: metric(fuelPerLapEstimate || null, fuelPerLapEstimate ? "estimated" : unavailable),
      predictedLapsRemaining: metric(predictedLapsRemaining, predictedLapsRemaining === null ? unavailable : "estimated"),
      fuelMargin: metric(fuelMargin, fuelMargin === null ? unavailable : "estimated"),
      stintPhase: deriveStintPhase(tyreAge, tyreWear),
      fuelStateQuality: quality
    },
    tyre: {
      compound: (typeof p.tyreCompound === "string" ? p.tyreCompound : null) ?? previous?.tyre.compound ?? null,
      ageLaps: metric(tyreAge ?? previous?.tyre.ageLaps.value ?? null, tyreAge === null ? unavailable : quality),
      wearByCorner: {
        fl: metric(tyreWear, tyreWear === null ? unavailable : quality),
        fr: metric(tyreWear, tyreWear === null ? unavailable : quality),
        rl: metric(tyreWear, tyreWear === null ? unavailable : quality),
        rr: metric(tyreWear, tyreWear === null ? unavailable : quality)
      },
      avgWear: metric(tyreWear, tyreWear === null ? unavailable : quality),
      tempsByCorner: {
        fl: metric(numberOrNull(p.tyreTempFL), numberOrNull(p.tyreTempFL) === null ? unavailable : qualityBase),
        fr: metric(numberOrNull(p.tyreTempFR), numberOrNull(p.tyreTempFR) === null ? unavailable : qualityBase),
        rl: metric(numberOrNull(p.tyreTempRL), numberOrNull(p.tyreTempRL) === null ? unavailable : qualityBase),
        rr: metric(numberOrNull(p.tyreTempRR), numberOrNull(p.tyreTempRR) === null ? unavailable : qualityBase)
      },
      avgTemp: metric(average([numberOrNull(p.tyreTempFL), numberOrNull(p.tyreTempFR), numberOrNull(p.tyreTempRL), numberOrNull(p.tyreTempRR)]), "estimated"),
      degradationTrend: metric(wearDelta, wearDelta === null ? unavailable : "estimated"),
      tyreStateQuality: quality
    },
    ers: {
      batteryPct: metric(ersBattery, ersBattery === null ? unavailable : "estimated"),
      deployModeLabel: ersBattery !== null && ersBattery < 25 ? "HARVEST" : "BALANCED",
      harvestTrend: metric(brake !== null && throttle !== null ? Math.max(0, brake - throttle) : null, "estimated"),
      ersStateQuality: qualityBase
    },
    damage: {
      wingDamageHeuristic: metric(estimateWingDamage(speed, previous?.damage.wingDamageHeuristic.value ?? null), "estimated"),
      floorDamageHeuristic: metric(estimateFloorDamage(tyreWear, previous?.damage.floorDamageHeuristic.value ?? null), "estimated"),
      aeroLossHeuristic: metric(estimateAeroLoss(speed, throttle, previous?.damage.aeroLossHeuristic.value ?? null), "estimated"),
      engineWearTrend: metric(estimateEngineWear(rpm, previous?.damage.engineWearTrend.value ?? null), "estimated"),
      damageStateQuality: qualityBase
    },
    position: {
      currentPosition: metric(currentPosition, "estimated"),
      gapAhead: metric(gapAhead, "estimated"),
      gapBehind: metric(gapBehind, "estimated"),
      intervalAhead: metric(gapAhead, "estimated"),
      intervalBehind: metric(gapBehind, "estimated"),
      threatLevel,
      cleanAirWindow,
      undercutRisk,
      rejoinEstimatePosition: metric(currentPosition !== null ? currentPosition + 1 : null, "estimated"),
      pitWindowOpenLap: metric((numberOrNull(p.lapNumber) ?? 1) + 4, "estimated"),
      positionStateQuality: qualityBase
    },
    diagnostics: {
      relayConnected,
      lastPacketAt: packet.timestamp,
      snapshotAgeMs: now - packet.timestamp,
      packetRate,
      bitrateKbps,
      jitterScore: previous ? Math.abs(packet.timestamp - previous.packetTimestamp) : 0,
      stale,
      partialTelemetry,
      diagnosticsQuality: stale ? "stale" : partialTelemetry ? "estimated" : "live"
    },
    strategy,
    classification: buildClassification(driverName, currentPosition, gapAhead, gapBehind),
    raceControlLog: stale ? ["Telemetry stale (>3s)"] : ["Green flag", "Pit window heuristic active"],
    strategyLog: ["Heuristic strategy refreshed", `Clean air window: ${cleanAirWindow}`],
    telemetryRestricted: partialTelemetry
  };
}

export function buildTelemetryEvent(roomId: string, snapshot: DerivedSnapshot): ReplayEvent {
  return {
    type: "telemetry.snapshot.received",
    ts: Date.now(),
    roomId,
    sequence: snapshot.sequence
  };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function average(values: Array<number | null>): number | null {
  const filtered = values.filter((v): v is number => v !== null);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

function estimateFuelPerLap(previous: DerivedSnapshot | null, currentFuel: number | null): number {
  const prevFuel = previous?.fuel.fuelInTank.value;
  if (currentFuel === null || prevFuel === null || prevFuel === undefined) return 1.85;
  const delta = prevFuel - currentFuel;
  return delta > 0.05 ? delta : 1.85;
}

function deriveStintPhase(ageLaps: number | null, wear: number | null): "launch" | "build" | "manage" | "attack" | "critical" {
  if (wear !== null && wear > 70) return "critical";
  if (ageLaps !== null && ageLaps < 3) return "launch";
  if (wear !== null && wear > 45) return "attack";
  if (wear !== null && wear > 25) return "manage";
  return "build";
}

function normalizeErs(throttle: number | null, brake: number | null): number | null {
  if (throttle === null || brake === null) return null;
  const raw = 60 + (brake - throttle) * 0.35;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function estimatePosition(speed: number | null, previous: number | null): number | null {
  if (previous !== null && speed !== null && speed > 280) return Math.max(1, previous - 1);
  return previous ?? 8;
}

function estimateGap(speed: number | null, prev: number, direction: "ahead" | "behind"): number | null {
  if (speed === null) return prev;
  const drift = direction === "ahead" ? -0.03 : 0.04;
  return Math.max(0.25, prev + drift + (speed > 300 ? -0.05 : 0.02));
}

function estimateWingDamage(speed: number | null, prev: number | null): number {
  if (speed === null) return prev ?? 8;
  return Math.max(0, Math.min(100, (prev ?? 8) + (speed < 120 ? 0.2 : -0.05)));
}

function estimateFloorDamage(tyreWear: number | null, prev: number | null): number {
  if (tyreWear === null) return prev ?? 6;
  return Math.max(0, Math.min(100, (prev ?? 6) + tyreWear * 0.004));
}

function estimateAeroLoss(speed: number | null, throttle: number | null, prev: number | null): number {
  if (speed === null || throttle === null) return prev ?? 10;
  const loss = 100 - Math.min(100, speed * 0.25 + throttle * 0.6);
  return Math.max(0, Math.min(100, loss));
}

function estimateEngineWear(rpm: number | null, prev: number | null): number {
  if (rpm === null) return prev ?? 20;
  return Math.max(0, Math.min(100, (prev ?? 20) + (rpm > 11500 ? 0.4 : 0.1)));
}

function buildClassification(driverName: string, currentPosition: number | null, gapAhead: number | null, gapBehind: number | null) {
  return [
    {
      pos: Math.max(1, (currentPosition ?? 8) - 1),
      driver: "RIVAL-A",
      gap: "LEADER",
      interval: "-",
      threat: "LOW",
      currentStint: "M 12L",
      tyre: "M",
      pitCount: 1
    },
    {
      pos: currentPosition ?? 8,
      driver: driverName,
      gap: `${formatNum(gapAhead)}s`,
      interval: `${formatNum(gapBehind)}s`,
      threat: gapBehind !== null && gapBehind < 1.2 ? "HIGH" : "MED",
      currentStint: "H 8L",
      tyre: "H",
      pitCount: 1
    }
  ];
}

function formatNum(value: number | null): string {
  return value === null ? "--" : value.toFixed(2);
}
