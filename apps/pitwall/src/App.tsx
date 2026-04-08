import { useMemo, useState } from "react";
import type { DerivedSnapshot, RelayToClientMessage } from "@pitwall/shared-types";

export function App() {
  const [rooms, setRooms] = useState<Array<{ roomId: string; displayName: string; driverName: string }>>([]);
  const [snapshot, setSnapshot] = useState<DerivedSnapshot | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [password, setPassword] = useState("roompass");
  const [accessCode, setAccessCode] = useState("engcode");
  const socket = useMemo(() => {
    const ws = new WebSocket("ws://localhost:7071");
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "room.list" })));
    ws.addEventListener("message", (evt) => {
      const msg = JSON.parse(evt.data) as RelayToClientMessage;
      if (msg.type === "room.listed") setRooms(msg.rooms.map((r) => ({ roomId: r.roomId, displayName: r.displayName, driverName: r.driverName })));
      if (msg.type === "room.joined" && msg.snapshot) setSnapshot(msg.snapshot);
      if (msg.type === "snapshot.full" || msg.type === "snapshot.delta") setSnapshot(msg.snapshot);
    });
    return ws;
  }, []);

  return (
    <div className="layout">
      <aside className="nav">LIVE TELEMETRY</aside>
      <main>
        <section className="panel">
          <h2>Room Join</h2>
          <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
            <option value="">Select room</option>
            {rooms.map((room) => (
              <option key={room.roomId} value={room.roomId}>
                {room.displayName} / {room.driverName}
              </option>
            ))}
          </select>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="access code" />
          <button
            onClick={() => {
              socket.send(JSON.stringify({ type: "room.join", roomId: selectedRoom, password, accessCode }));
            }}
          >
            Join
          </button>
        </section>
        <section className="grid">
          <TelemetryCard title="Speed" value={snapshot?.driver.speedKph} unit="kph" />
          <TelemetryCard title="Gear" value={snapshot?.driver.gear} />
          <TelemetryCard title="RPM" value={snapshot?.driver.rpm} />
          <TelemetryCard title="Fuel" value={snapshot?.fuel.fuelInTank} unit="kg" />
          <TelemetryCard title="Pred Laps" value={snapshot?.fuel.predictedLapsRemaining} />
          <TelemetryCard title="Tyre Wear" value={snapshot?.tyre.wearPct} unit="%" />
        </section>
      </main>
    </div>
  );
}

function TelemetryCard(props: { title: string; value: number | null | undefined; unit?: string }) {
  const state = props.value === null || props.value === undefined ? "unavailable" : "live";
  return (
    <article className="card">
      <div>{props.title}</div>
      <strong>{props.value ?? "--"}</strong>
      <small>
        {props.unit ?? ""} · {state}
      </small>
    </article>
  );
}
