import type { DerivedSnapshot, ReplayEvent, ReplayFrame, ReplaySession, TelemetryPacket } from "@pitwall/shared-types";

export type ReplayRecorder = {
  replayId: string;
  roomId: string;
  driverName: string;
  startedAt: number;
  rawPackets: TelemetryPacket[];
  events: ReplayEvent[];
  timeline: ReplayFrame[];
};

export function createRecorder(roomId: string, driverName: string, now = Date.now()): ReplayRecorder {
  return {
    replayId: `${roomId}:${now}`,
    roomId,
    driverName,
    startedAt: now,
    rawPackets: [],
    events: [],
    timeline: []
  };
}

export function recordPacket(recorder: ReplayRecorder, packet: TelemetryPacket): ReplayRecorder {
  recorder.rawPackets.push(packet);
  return recorder;
}

export function recordEvent(recorder: ReplayRecorder, event: ReplayEvent): ReplayRecorder {
  recorder.events.push(event);
  return recorder;
}

export function recordSnapshot(recorder: ReplayRecorder, snapshot: DerivedSnapshot): ReplayRecorder {
  const origin = recorder.timeline[0]?.t ?? snapshot.packetTimestamp;
  recorder.timeline.push({ t: snapshot.packetTimestamp - origin, snapshot });
  return recorder;
}

export function finalizeReplay(recorder: ReplayRecorder, now = Date.now()): ReplaySession {
  return {
    replayId: recorder.replayId,
    roomId: recorder.roomId,
    driverName: recorder.driverName,
    startedAt: recorder.startedAt,
    endedAt: now,
    eventCount: recorder.events.length,
    frameCount: recorder.timeline.length
  };
}

export function getFrameAt(timeline: ReplayFrame[], t: number): ReplayFrame | null {
  if (timeline.length === 0) return null;
  let idx = 0;
  for (let i = 0; i < timeline.length; i += 1) {
    if (timeline[i].t <= t) idx = i;
    else break;
  }
  return timeline[idx] ?? null;
}
