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

export function buildFrameIndex(timeline: ReplayFrame[], bucketMs = 250): Map<number, number> {
  const index = new Map<number, number>();
  for (let i = 0; i < timeline.length; i += 1) {
    const bucket = Math.floor(timeline[i].t / bucketMs);
    if (!index.has(bucket)) index.set(bucket, i);
  }
  return index;
}

export function getFrameAtIndexed(timeline: ReplayFrame[], index: Map<number, number>, t: number, bucketMs = 250): ReplayFrame | null {
  if (timeline.length === 0) return null;
  const bucket = Math.floor(t / bucketMs);
  let i = index.get(bucket) ?? 0;
  while (i + 1 < timeline.length && timeline[i + 1].t <= t) i += 1;
  return timeline[i] ?? null;
}

export function eventToPlayhead(eventTs: number, replayStartedAt: number): number {
  return Math.max(0, eventTs - replayStartedAt);
}
