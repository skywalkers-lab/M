import { createServer } from "node:http";
import { compareSync, hashSync } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  ClientToRelayMessage,
  DerivedSnapshot,
  DiagnosticsState,
  RelayToClientMessage,
  ReplayEvent,
  Role,
  Room
} from "@pitwall/shared-types";
import { buildDerivedSnapshot, buildTelemetryEvent } from "@pitwall/telemetry-engine";

const port = Number(process.env.RELAY_PORT ?? 7071);
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

type SocketSession = { socketId: string; role: Role; roomId?: string };
type RoomRuntime = { events: ReplayEvent[]; diagnostics: DiagnosticsState | null };

const sessions = new Map<WebSocket, SocketSession>();
const rooms = new Map<string, Room>();
const roomMembers = new Map<string, Set<WebSocket>>();
const roomSnapshots = new Map<string, DerivedSnapshot>();
const roomRuntime = new Map<string, RoomRuntime>();
const joinAttempts = new Map<string, { count: number; lockedUntil: number }>();

wss.on("connection", (ws) => {
  sessions.set(ws, { socketId: uuidv4(), role: "viewer" });

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ClientToRelayMessage;
      handleMessage(ws, message);
    } catch {
      send(ws, { type: "error", code: "bad_message", message: "Invalid message." });
    }
  });

  ws.on("close", () => {
    const session = sessions.get(ws);
    if (session?.roomId) roomMembers.get(session.roomId)?.delete(ws);
    sessions.delete(ws);
  });
});

function handleMessage(ws: WebSocket, message: ClientToRelayMessage): void {
  switch (message.type) {
    case "room.create": {
      const roomId = uuidv4();
      const session = sessions.get(ws);
      if (!session) return;

      const room: Room = {
        roomId,
        slug: message.slug,
        displayName: message.displayName,
        driverName: message.driverName,
        visibility: message.visibility,
        roomPasswordHash: hashSync(message.roomPassword, 10),
        engineerAccessCodeHash: hashSync(message.engineerAccessCode, 10),
        ownerSessionId: session.socketId,
        status: "active",
        metadata: {}
      };

      rooms.set(roomId, room);
      roomRuntime.set(roomId, { events: [], diagnostics: null });
      sessions.set(ws, { ...session, role: "driver", roomId });
      roomMembers.set(roomId, new Set([ws]));
      send(ws, { type: "room.created", roomId });
      return;
    }

    case "room.list": {
      const listed = [...rooms.values()].map((room) => ({
        roomId: room.roomId,
        slug: room.slug,
        displayName: room.displayName,
        driverName: room.driverName,
        visibility: room.visibility,
        status: room.status
      }));
      send(ws, { type: "room.listed", rooms: listed });
      return;
    }

    case "room.join": {
      const room = rooms.get(message.roomId);
      if (!room) return send(ws, { type: "error", code: "room_not_found", message: "Room not found" });
      if (isLockedOut(ws)) return send(ws, { type: "error", code: "locked", message: "Too many attempts. Retry later." });

      const passwordOk = compareSync(message.password, room.roomPasswordHash);
      if (!passwordOk) {
        trackFailedAttempt(ws);
        return send(ws, { type: "error", code: "invalid_password", message: "Invalid room password" });
      }

      let role: Role = "viewer";
      if (message.accessCode && compareSync(message.accessCode, room.engineerAccessCodeHash)) role = "engineer";

      const session = sessions.get(ws);
      if (session) sessions.set(ws, { ...session, role, roomId: room.roomId });
      if (!roomMembers.has(room.roomId)) roomMembers.set(room.roomId, new Set());
      roomMembers.get(room.roomId)?.add(ws);

      const runtime = roomRuntime.get(room.roomId);
      send(ws, {
        type: "room.joined",
        roomId: room.roomId,
        role,
        snapshot: roomSnapshots.get(room.roomId) ?? null,
        diagnostics: runtime?.diagnostics ?? undefined
      });

      broadcastEvent(room.roomId, {
        type: "room.participant.joined",
        ts: Date.now(),
        roomId: room.roomId,
        role
      });
      return;
    }

    case "telemetry.raw": {
      const room = rooms.get(message.roomId);
      if (!room) return;
      const prev = roomSnapshots.get(room.roomId) ?? null;
      const snapshot = buildDerivedSnapshot({
        roomId: room.roomId,
        driverName: room.driverName,
        packet: message.packet,
        previous: prev,
        relayConnected: true
      });
      roomSnapshots.set(room.roomId, snapshot);

      if (!roomRuntime.has(room.roomId)) roomRuntime.set(room.roomId, { events: [], diagnostics: null });
      roomRuntime.get(room.roomId)!.diagnostics = snapshot.diagnostics;

      const members = roomMembers.get(room.roomId);
      if (!members) return;
      for (const member of members) {
        send(member, {
          type: prev ? "snapshot.delta" : "snapshot.full",
          roomId: room.roomId,
          snapshot
        });
      }
      broadcastEvent(room.roomId, buildTelemetryEvent(room.roomId, snapshot));
      if (!prev || prev.strategy.headline !== snapshot.strategy.headline) {
        broadcastEvent(room.roomId, {
          type: "strategy.recommendation.updated",
          ts: Date.now(),
          roomId: room.roomId,
          headline: snapshot.strategy.headline
        });
      }
      if (snapshot.diagnostics.stale) {
        broadcastEvent(room.roomId, {
          type: "driver.status.warning",
          ts: Date.now(),
          roomId: room.roomId,
          warning: "Telemetry stale"
        });
      }
      return;
    }

    case "engineer.action": {
      const session = sessions.get(ws);
      if (!session || !session.roomId) return;
      if (session.role === "viewer") return send(ws, { type: "error", code: "role_denied", message: "Viewer cannot issue commands" });

      broadcastEvent(session.roomId, {
        type: "engineer.command.issued",
        ts: Date.now(),
        roomId: session.roomId,
        command: message.action,
        byRole: session.role
      });
      return;
    }

    case "heartbeat":
      return;
    default:
      return;
  }
}

function broadcastEvent(roomId: string, event: ReplayEvent): void {
  const runtime = roomRuntime.get(roomId);
  if (runtime) runtime.events = [event, ...runtime.events].slice(0, 100);
  const members = roomMembers.get(roomId);
  if (!members) return;
  for (const member of members) {
    send(member, { type: "event.feed", roomId, event });
  }
}

function send(ws: WebSocket, message: RelayToClientMessage): void {
  ws.send(JSON.stringify(message));
}

function trackFailedAttempt(ws: WebSocket): void {
  const key = sessions.get(ws)?.socketId ?? "unknown";
  const current = joinAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  const count = current.count + 1;
  const lockedUntil = count >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
  joinAttempts.set(key, { count, lockedUntil });
}

function isLockedOut(ws: WebSocket): boolean {
  const key = sessions.get(ws)?.socketId ?? "unknown";
  const attempt = joinAttempts.get(key);
  if (!attempt) return false;
  if (attempt.lockedUntil > Date.now()) return true;
  if (attempt.lockedUntil !== 0) joinAttempts.delete(key);
  return false;
}

httpServer.listen(port, () => {
  console.log(`relay listening on ws://localhost:${port}`);
});
