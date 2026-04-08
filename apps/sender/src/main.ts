import dgram from "node:dgram";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import WebSocket from "ws";
import { parseF125Udp } from "@pitwall/f1-parser";
import type { ClientToRelayMessage, RelayToClientMessage } from "@pitwall/shared-types";

type SenderState = {
  udpConnected: boolean;
  relayConnected: boolean;
  roomId: string | null;
  lastPacketAt: number | null;
  packetCount: number;
  eventRate: number;
  bitrateKbps: number;
  recording: boolean;
  log: string[];
};

let mainWindow: BrowserWindow | null = null;
let relaySocket: WebSocket | null = null;
let udpSocket: dgram.Socket | null = null;
let sequence = 0;
let bytesThisSecond = 0;
let packetsThisSecond = 0;

const state: SenderState = {
  udpConnected: false,
  relayConnected: false,
  roomId: null,
  lastPacketAt: null,
  packetCount: 0,
  eventRate: 0,
  bitrateKbps: 0,
  recording: false,
  log: []
};

function emitState(): void {
  mainWindow?.webContents.send("state", state);
}

function appendLog(message: string): void {
  state.log = [`${new Date().toISOString()} ${message}`, ...state.log].slice(0, 60);
  emitState();
}

function createWindow(): void {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    webPreferences: {
      preload: path.join(distDir, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(distDir, "../src/ui/index.html"));
}

function sendToRelay(message: ClientToRelayMessage): void {
  relaySocket?.send(JSON.stringify(message));
}

function connectRelay(relayUrl: string): void {
  relaySocket?.close();
  relaySocket = new WebSocket(relayUrl);

  relaySocket.on("open", () => {
    state.relayConnected = true;
    appendLog(`relay connected ${relayUrl}`);
  });

  relaySocket.on("close", () => {
    state.relayConnected = false;
    appendLog("relay disconnected");
  });

  relaySocket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as RelayToClientMessage;
    if (message.type === "room.created") {
      state.roomId = message.roomId;
      appendLog(`room created ${message.roomId}`);
    }
    if (message.type === "error") {
      appendLog(`relay error: ${message.message}`);
    }
    emitState();
  });
}

function startUdp(udpPort: number): void {
  udpSocket?.close();
  udpSocket = dgram.createSocket("udp4");

  udpSocket.on("listening", () => {
    state.udpConnected = true;
    appendLog(`udp listening ${udpPort}`);
  });

  udpSocket.on("message", (msg) => {
    const parsed = parseF125Udp(msg, sequence++);
    bytesThisSecond += msg.byteLength;
    packetsThisSecond += 1;
    state.packetCount += 1;
    state.lastPacketAt = Date.now();
    emitState();

    if (!state.roomId || !relaySocket || relaySocket.readyState !== relaySocket.OPEN) {
      return;
    }

    sendToRelay({ type: "telemetry.raw", roomId: state.roomId, packet: parsed.packet });
  });

  udpSocket.bind(udpPort, "0.0.0.0");
}

setInterval(() => {
  state.bitrateKbps = Math.round((bytesThisSecond * 8) / 1000);
  state.eventRate = packetsThisSecond;
  bytesThisSecond = 0;
  packetsThisSecond = 0;
  emitState();
}, 1000);

ipcMain.handle("sender.connect", (_event, payload: { relayUrl: string; udpPort: number }) => {
  connectRelay(payload.relayUrl);
  startUdp(payload.udpPort);
});

ipcMain.handle(
  "sender.createRoom",
  (_event, payload: { slug: string; displayName: string; driverName: string; roomPassword: string; engineerAccessCode: string }) => {
    sendToRelay({ type: "room.create", ...payload, visibility: "private" });
  }
);

ipcMain.handle("sender.recording", (_event, recording: boolean) => {
  state.recording = recording;
  appendLog(recording ? "recording started" : "recording stopped");
});

app.whenReady().then(() => {
  createWindow();
});
