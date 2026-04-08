import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  listeners: Record<string, Array<(e: any) => void>> = {};
  sent: string[] = [];

  constructor() {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.emit("open", {}));
  }

  addEventListener(type: string, cb: (e: any) => void) {
    this.listeners[type] ||= [];
    this.listeners[type].push(cb);
  }

  send(msg: string) {
    this.sent.push(msg);
  }

  close() {}

  emit(type: string, payload: any) {
    for (const l of this.listeners[type] || []) l(payload);
  }
}

describe("Pitwall App", () => {
  it("renders full snapshot and updates by delta", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    render(<App />);
    const ws = MockWebSocket.instances[0];

    ws.emit("message", {
      data: JSON.stringify({
        type: "room.listed",
        rooms: [{ roomId: "r1", displayName: "Room", driverName: "DRV", visibility: "private", status: "active", slug: "r" }]
      })
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r1" } });
    fireEvent.click(screen.getByText("Join pitwall"));

    ws.emit("message", {
      data: JSON.stringify({
        type: "room.joined",
        roomId: "r1",
        role: "engineer",
        snapshot: baseSnapshot(120)
      })
    });

    expect(await screen.findByText("120")).toBeTruthy();

    ws.emit("message", { data: JSON.stringify({ type: "snapshot.delta", roomId: "r1", snapshot: baseSnapshot(180) }) });
    expect(await screen.findByText("180")).toBeTruthy();
  });

  it("disables action buttons for viewer role", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    render(<App />);
    const ws = MockWebSocket.instances.at(-1)!;
    ws.emit("message", { data: JSON.stringify({ type: "room.joined", roomId: "r1", role: "viewer", snapshot: baseSnapshot(150) }) });

    expect(await screen.findByText("BOX THIS LAP")).toBeDisabled();
  });

  it("shows stale/estimated quality and keeps empty sections stable", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    render(<App />);
    const ws = MockWebSocket.instances.at(-1)!;
    const stale = baseSnapshot(99);
    stale.diagnostics.diagnosticsQuality = "stale";
    stale.driver.speedKph.quality = "estimated";
    stale.classification = [];
    stale.raceControlLog = [];
    stale.strategyLog = [];
    ws.emit("message", { data: JSON.stringify({ type: "room.joined", roomId: "r1", role: "engineer", snapshot: stale }) });

    expect(await screen.findByText("SNAPSHOT STALE")).toBeTruthy();
    expect(await screen.findByText("estimated")).toBeTruthy();
    expect(await screen.findByText("No race control events")).toBeTruthy();
    expect(await screen.findByText("No strategy logs")).toBeTruthy();
    expect(await screen.findByText("No feed events")).toBeTruthy();
  });

  it("enables actions for engineer role", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    render(<App />);
    const ws = MockWebSocket.instances.at(-1)!;
    ws.emit("message", { data: JSON.stringify({ type: "room.joined", roomId: "r1", role: "engineer", snapshot: baseSnapshot(160) }) });
    expect(await screen.findByText("BOX THIS LAP")).toBeEnabled();
  });

  it("supports replay list/load and scrub controls", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as any);
    render(<App />);
    const ws = MockWebSocket.instances.at(-1)!;
    ws.emit("message", { data: JSON.stringify({ type: "room.joined", roomId: "r1", role: "engineer", snapshot: baseSnapshot(160) }) });
    fireEvent.click(await screen.findByText("REPLAY VIEW"));
    ws.emit("message", {
      data: JSON.stringify({
        type: "replay.listed",
        roomId: "r1",
        sessions: [{ replayId: "rp1", roomId: "r1", driverName: "DRV", startedAt: 1000, endedAt: 2000, eventCount: 2, frameCount: 2 }]
      })
    });
    fireEvent.click(await screen.findByText(/frames 2/));
    ws.emit("message", {
      data: JSON.stringify({
        type: "replay.loaded",
        roomId: "r1",
        replayId: "rp1",
        startedAt: 1000,
        rawPackets: [],
        events: [{ type: "telemetry.snapshot.received", ts: 2000, roomId: "r1", sequence: 1 }],
        timeline: [{ t: 0, snapshot: baseSnapshot(100) }, { t: 500, snapshot: baseSnapshot(200) }]
      })
    });
    expect(await screen.findByText("Playback")).toBeTruthy();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "500" } });
    expect(await screen.findByText("200")).toBeTruthy();
    fireEvent.click(screen.getByText("telemetry.snapshot.received"));
    fireEvent.click(screen.getByText("SYNC TO LIVE"));
    expect(screen.queryByText("Playback")).toBeNull();
  });
});

function baseSnapshot(speed: number) {
  const m = (value: number | null, quality = "live") => ({ value, quality });
  return {
    roomId: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    packetTimestamp: Date.now(),
    driverName: "DRV",
    driver: {
      speedKph: m(speed),
      gear: m(7),
      rpm: m(11200),
      throttlePct: m(80),
      brakePct: m(5),
      lapNumber: m(12),
      sector: m(2),
      lapDelta: m(-0.3),
      sessionType: "RACE"
    },
    fuel: { fuelInTank: m(20), fuelPerLapEstimate: m(1.8, "estimated"), predictedLapsRemaining: m(11, "estimated"), fuelMargin: m(2, "estimated"), stintPhase: "manage", fuelStateQuality: "live" },
    tyre: {
      compound: "M",
      ageLaps: m(8),
      wearByCorner: { fl: m(30), fr: m(31), rl: m(32), rr: m(33) },
      avgWear: m(31),
      tempsByCorner: { fl: m(92), fr: m(93), rl: m(90), rr: m(91) },
      avgTemp: m(91.5, "estimated"),
      degradationTrend: m(0.4, "estimated"),
      tyreStateQuality: "live"
    },
    ers: { batteryPct: m(60, "estimated"), deployModeLabel: "BALANCED", harvestTrend: m(0.3, "estimated"), ersStateQuality: "estimated" },
    damage: { wingDamageHeuristic: m(7, "estimated"), floorDamageHeuristic: m(6, "estimated"), aeroLossHeuristic: m(10, "estimated"), engineWearTrend: m(20, "estimated"), damageStateQuality: "estimated" },
    position: {
      currentPosition: m(8, "estimated"),
      gapAhead: m(1.3, "estimated"),
      gapBehind: m(1.1, "estimated"),
      intervalAhead: m(1.3, "estimated"),
      intervalBehind: m(1.1, "estimated"),
      threatLevel: "medium",
      cleanAirWindow: "narrow",
      undercutRisk: "medium",
      rejoinEstimatePosition: m(9, "estimated"),
      pitWindowOpenLap: m(16, "estimated"),
      positionStateQuality: "estimated"
    },
    diagnostics: {
      relayConnected: true,
      lastPacketAt: Date.now(),
      snapshotAgeMs: 80,
      packetRate: 30,
      bitrateKbps: 70,
      jitterScore: 12,
      stale: false,
      partialTelemetry: false,
      diagnosticsQuality: "live"
    },
    strategy: {
      recommendationCode: "HOLD_POS",
      headline: "Hold",
      expectedGainSec: 0.3,
      confidence: 0.6,
      rationale: ["ok"],
      riskLevel: "low",
      source: "heuristic",
      stale: false
    },
    classification: [{ pos: 8, driver: "DRV", gap: "1.30s", interval: "1.10s", threat: "MED", currentStint: "M 8L", tyre: "M", pitCount: 1 }],
    raceControlLog: [],
    strategyLog: [],
    telemetryRestricted: false
  };
}
