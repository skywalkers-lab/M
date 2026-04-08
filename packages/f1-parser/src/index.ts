import type { TelemetryPacket } from "@pitwall/shared-types";

export type ParseResult =
  | { ok: true; packet: TelemetryPacket }
  | { ok: false; reason: string; packet: TelemetryPacket };

const MIN_HEADER_SIZE = 8;

export function parseF125Udp(buffer: Buffer, sequence: number, debug = false): ParseResult {
  if (buffer.byteLength < MIN_HEADER_SIZE) {
    return {
      ok: false,
      reason: "packet_too_small",
      packet: fallbackPacket(sequence)
    };
  }

  const packetId = buffer.readUInt8(0);
  const sessionTime = buffer.readFloatLE(1);

  const packetType =
    packetId === 1
      ? "session"
      : packetId === 2
      ? "lap"
      : packetId === 6
      ? "carTelemetry"
      : packetId === 7
      ? "carStatus"
      : packetId === 3
      ? "event"
      : "unknown";

  if (debug) {
    // eslint-disable-next-line no-console
    console.debug(`[f1-parser] packet=${packetType} sequence=${sequence} sessionTime=${sessionTime}`);
  }

  const packet: TelemetryPacket = {
    packetType,
    sequence,
    timestamp: Date.now(),
    payload: {
      packetId,
      sessionTime,
      speedKph: buffer.byteLength > 16 ? buffer.readUInt16LE(8) : null,
      throttlePct: buffer.byteLength > 20 ? buffer.readUInt8(10) : null,
      brakePct: buffer.byteLength > 21 ? buffer.readUInt8(11) : null,
      gear: buffer.byteLength > 22 ? buffer.readInt8(12) : null,
      rpm: buffer.byteLength > 24 ? buffer.readUInt16LE(13) : null,
      fuelInTank: buffer.byteLength > 28 ? buffer.readFloatLE(15) : null,
      tyreWearPct: buffer.byteLength > 32 ? buffer.readUInt8(19) : null,
      tyreAgeLaps: buffer.byteLength > 33 ? buffer.readUInt8(20) : null
    }
  };

  return {
    ok: packetType !== "unknown",
    reason: packetType === "unknown" ? "unknown_packet" : "ok",
    packet
  };
}

function fallbackPacket(sequence: number): TelemetryPacket {
  return {
    packetType: "unknown",
    sequence,
    timestamp: Date.now(),
    payload: {}
  };
}
