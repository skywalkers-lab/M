import { describe, expect, it } from "vitest";
import { buildFrameIndex, createRecorder, eventToPlayhead, finalizeReplay, getFrameAt, getFrameAtIndexed, recordEvent, recordPacket, recordSnapshot } from "./index";

describe("replay-core", () => {
  it("records 3-layer replay data", () => {
    const r = createRecorder("room-1", "DRV", 1000);
    recordPacket(r, { packetType: "lap", sequence: 1, timestamp: 1000, payload: {} });
    recordEvent(r, { type: "telemetry.snapshot.received", ts: 1001, roomId: "room-1", sequence: 1 });
    recordSnapshot(r, {
      roomId: "11111111-1111-4111-8111-111111111111",
      sequence: 1,
      packetTimestamp: 1000,
      driverName: "DRV",
      driver: { speedKph: { value: 100, quality: "live" }, gear: { value: 6, quality: "live" }, rpm: { value: 11000, quality: "live" }, throttlePct: { value: 80, quality: "live" }, brakePct: { value: 0, quality: "live" }, lapNumber: { value: 1, quality: "live" }, sector: { value: 1, quality: "live" }, lapDelta: { value: 0, quality: "live" }, sessionType: "RACE" },
      fuel: { fuelInTank: { value: 20, quality: "live" }, fuelPerLapEstimate: { value: 1.8, quality: "estimated" }, predictedLapsRemaining: { value: 11, quality: "estimated" }, fuelMargin: { value: 2, quality: "estimated" }, stintPhase: "build", fuelStateQuality: "live" },
      tyre: { compound: "M", ageLaps: { value: 1, quality: "live" }, wearByCorner: { fl: { value: 2, quality: "live" }, fr: { value: 2, quality: "live" }, rl: { value: 2, quality: "live" }, rr: { value: 2, quality: "live" } }, avgWear: { value: 2, quality: "live" }, tempsByCorner: { fl: { value: 90, quality: "live" }, fr: { value: 90, quality: "live" }, rl: { value: 88, quality: "live" }, rr: { value: 88, quality: "live" } }, avgTemp: { value: 89, quality: "estimated" }, degradationTrend: { value: 0.1, quality: "estimated" }, tyreStateQuality: "live" },
      ers: { batteryPct: { value: 60, quality: "estimated" }, deployModeLabel: "BALANCED", harvestTrend: { value: 0.2, quality: "estimated" }, ersStateQuality: "estimated" },
      damage: { wingDamageHeuristic: { value: 0, quality: "estimated" }, floorDamageHeuristic: { value: 0, quality: "estimated" }, aeroLossHeuristic: { value: 0, quality: "estimated" }, engineWearTrend: { value: 10, quality: "estimated" }, damageStateQuality: "estimated" },
      position: { currentPosition: { value: 8, quality: "estimated" }, gapAhead: { value: 1.2, quality: "estimated" }, gapBehind: { value: 1.3, quality: "estimated" }, intervalAhead: { value: 1.2, quality: "estimated" }, intervalBehind: { value: 1.3, quality: "estimated" }, threatLevel: "low", cleanAirWindow: "open", undercutRisk: "low", rejoinEstimatePosition: { value: 9, quality: "estimated" }, pitWindowOpenLap: { value: 12, quality: "estimated" }, positionStateQuality: "estimated" },
      diagnostics: { relayConnected: true, lastPacketAt: 1000, snapshotAgeMs: 0, packetRate: 10, bitrateKbps: 50, jitterScore: 0, stale: false, partialTelemetry: false, diagnosticsQuality: "live" },
      strategy: { recommendationCode: "HOLD_POS", headline: "hold", expectedGainSec: 0.2, confidence: 0.6, rationale: [], riskLevel: "low", source: "heuristic", stale: false },
      classification: [],
      raceControlLog: [],
      strategyLog: [],
      telemetryRestricted: false
    });

    const meta = finalizeReplay(r, 2000);
    expect(meta.frameCount).toBe(1);
    expect(meta.eventCount).toBe(1);
    expect(r.rawPackets).toHaveLength(1);
    expect(getFrameAt(r.timeline, 0)?.t).toBe(0);
    const idx = buildFrameIndex(r.timeline, 100);
    expect(getFrameAtIndexed(r.timeline, idx, 0, 100)?.t).toBe(0);
    expect(eventToPlayhead(1400, 1000)).toBe(400);
  });
});
