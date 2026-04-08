import { describe, expect, it } from "vitest";
import { buildDerivedSnapshot } from "./index";

describe("buildDerivedSnapshot", () => {
  it("builds full snapshot from packet", () => {
    const snapshot = buildDerivedSnapshot({
      roomId: "11111111-1111-4111-8111-111111111111",
      driverName: "DRV",
      relayConnected: true,
      previous: null,
      packet: {
        packetType: "carTelemetry",
        sequence: 1,
        timestamp: Date.now(),
        payload: {
          speedKph: 301,
          gear: 7,
          rpm: 11400,
          throttlePct: 78,
          brakePct: 5,
          fuelInTank: 14,
          tyreWearPct: 26,
          tyreAgeLaps: 8,
          tyreTempFL: 93,
          tyreTempFR: 95,
          tyreTempRL: 90,
          tyreTempRR: 91,
          lapNumber: 12,
          sector: 2,
          lapDelta: -0.22
        }
      }
    });

    expect(snapshot.fuel.fuelMargin.value).not.toBeNull();
    expect(snapshot.tyre.avgTemp.quality).toBe("estimated");
    expect(snapshot.diagnostics.diagnosticsQuality).toBe("live");
  });

  it("marks stale and estimated correctly when partial", () => {
    const snapshot = buildDerivedSnapshot({
      roomId: "11111111-1111-4111-8111-111111111111",
      driverName: "DRV",
      relayConnected: true,
      previous: null,
      packet: {
        packetType: "carTelemetry",
        sequence: 2,
        timestamp: Date.now() - 4001,
        payload: {
          speedKph: 250
        }
      }
    });

    expect(snapshot.diagnostics.stale).toBe(true);
    expect(snapshot.diagnostics.partialTelemetry).toBe(true);
    expect(snapshot.driver.gear.quality).toBe("stale");
  });
});
