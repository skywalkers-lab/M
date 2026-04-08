import { useEffect, useMemo, useState } from "react";
import type { DerivedSnapshot, RelayToClientMessage, ReplayEvent, Role } from "@pitwall/shared-types";

type WsState = "connecting" | "open" | "closed";

const ACTIONS = [
  { code: "BOX_THIS_LAP", label: "BOX THIS LAP" },
  { code: "PUSH_NOW", label: "PUSH NOW" },
  { code: "HARVEST_MODE", label: "HARVEST MODE" },
  { code: "HOLD_POS", label: "HOLD POS" }
] as const;

export function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsState, setWsState] = useState<WsState>("connecting");
  const [rooms, setRooms] = useState<Array<{ roomId: string; displayName: string; driverName: string }>>([]);
  const [snapshot, setSnapshot] = useState<DerivedSnapshot | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [password, setPassword] = useState("roompass");
  const [accessCode, setAccessCode] = useState("engcode");
  const [role, setRole] = useState<Role>("viewer");
  const [actionLog, setActionLog] = useState<string[]>([]);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:7071");
    setWs(socket);
    socket.addEventListener("open", () => {
      setWsState("open");
      socket.send(JSON.stringify({ type: "room.list" }));
    });
    socket.addEventListener("close", () => setWsState("closed"));
    socket.addEventListener("message", (evt) => {
      const msg = JSON.parse(evt.data) as RelayToClientMessage;
      if (msg.type === "room.listed") {
        setRooms(msg.rooms.map((r) => ({ roomId: r.roomId, displayName: r.displayName, driverName: r.driverName })));
      }
      if (msg.type === "room.joined") {
        setRole(msg.role);
        if (msg.snapshot) setSnapshot(msg.snapshot);
      }
      if (msg.type === "snapshot.full" || msg.type === "snapshot.delta") setSnapshot(msg.snapshot);
      if (msg.type === "event.feed") setEvents((prev) => [msg.event, ...prev].slice(0, 120));
    });

    return () => socket.close();
  }, []);

  const quality = snapshot?.diagnostics?.diagnosticsQuality ?? "unavailable";
  const canAct = role === "engineer" || role === "admin" || role === "strategist";

  const trackMarkers = useMemo(() => {
    const p = snapshot?.position?.currentPosition?.value ?? 8;
    return [
      { x: 80 + p * 7, y: 80, label: snapshot?.driverName ?? "YOU", klass: "player" },
      { x: 180, y: 48, label: "RIVAL A", klass: "rival" },
      { x: 230, y: 104, label: "RIVAL B", klass: "rival" },
      { x: 300, y: 74, label: "REJOIN", klass: "rejoin" }
    ];
  }, [snapshot]);

  const issueAction = (action: (typeof ACTIONS)[number]["code"]) => {
    if (!ws || !selectedRoom) return;
    ws.send(JSON.stringify({ type: "engineer.action", roomId: selectedRoom, action }));
    setActionLog((prev) => [`${new Date().toLocaleTimeString()} ${action}`, ...prev].slice(0, 20));
  };

  return (
    <div className="shell">
      <aside className="sidenav">
        <div>LIVE</div>
        <div>STRAT</div>
        <div>GARAGE</div>
        <div>REPLAY</div>
        <div>DATA</div>
      </aside>

      <section className="content">
        <header className="topbar panel">
          <div>
            <strong>{rooms.find((r) => r.roomId === selectedRoom)?.displayName ?? "ROOM"}</strong>
            <span>{snapshot?.driverName ?? "Driver"}</span>
          </div>
          <div className="chips">
            <Chip label={`SESSION ${snapshot?.driver?.sessionType ?? "RACE"}`} tone="info" />
            <Chip label={`LAP ${Math.round(snapshot?.driver?.lapNumber?.value ?? 0)}`} tone="info" />
            <Chip label={wsState === "open" ? "RELAY CONNECTED" : "RELAY OFFLINE"} tone={wsState === "open" ? "success" : "danger"} />
            <Chip label={`SNAPSHOT ${quality.toUpperCase()}`} tone={qualityTone(quality)} />
          </div>
        </header>

        <section className="join panel">
          <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}>
            <option value="">Select room</option>
            {rooms.map((room) => (
              <option key={room.roomId} value={room.roomId}>
                {room.displayName} / {room.driverName}
              </option>
            ))}
          </select>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="room password" />
          <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="access code" />
          <button onClick={() => ws?.send(JSON.stringify({ type: "room.join", roomId: selectedRoom, password, accessCode }))}>Join pitwall</button>
          <Chip label={`ROLE ${role.toUpperCase()}`} tone={canAct ? "success" : "warning"} />
        </section>

        <div className="main-grid">
          <section className="left panel">
            <h3>Driver Rail</h3>
            <Metric title="Fuel Margin" value={snapshot?.fuel?.fuelMargin?.value} quality={snapshot?.fuel?.fuelMargin?.quality} unit="laps" />
            <Metric title="Stint Phase" valueText={snapshot?.fuel?.stintPhase ?? "--"} quality={snapshot?.fuel?.fuelStateQuality} />
            <Metric title="Aero Loss" value={snapshot?.damage?.aeroLossHeuristic?.value} quality={snapshot?.damage?.aeroLossHeuristic?.quality} unit="%" />
            <Metric title="Engine Wear" value={snapshot?.damage?.engineWearTrend?.value} quality={snapshot?.damage?.engineWearTrend?.quality} unit="%" />
            <div className="quad">
              {(["fl", "fr", "rl", "rr"] as const).map((k) => (
                <Metric
                  key={k}
                  title={`Tyre ${k.toUpperCase()}`}
                  value={snapshot?.tyre?.tempsByCorner[k]?.value}
                  quality={snapshot?.tyre?.tempsByCorner[k]?.quality}
                  unit="°C"
                  compact
                />
              ))}
            </div>
            <Metric title="Speed" value={snapshot?.driver?.speedKph?.value} quality={snapshot?.driver?.speedKph?.quality} unit="kph" />
            <Metric title="Gear / RPM" valueText={`${snapshot?.driver?.gear?.value ?? "--"} / ${snapshot?.driver?.rpm?.value ?? "--"}`} quality={snapshot?.driver?.rpm?.quality} />
            <Metric title="ERS" value={snapshot?.ers?.batteryPct?.value} quality={snapshot?.ers?.batteryPct?.quality} unit="%" />
          </section>

          <section className="center panel">
            <h3>Track Simulation</h3>
            <svg viewBox="0 0 420 180" className="track">
              <path d="M20 90 C 90 10, 260 10, 380 80 C 330 160, 120 170, 20 90" className="trackline" />
              {trackMarkers.map((m) => (
                <g key={m.label}>
                  <circle cx={m.x} cy={m.y} r="5" className={m.klass} />
                  <text x={m.x + 6} y={m.y - 8}>{m.label}</text>
                </g>
              ))}
            </svg>
            <div className="chips">
              <Chip label={`Clean Air ${snapshot?.position?.cleanAirWindow ?? "--"}`} tone={snapshot?.position?.cleanAirWindow === "open" ? "success" : "warning"} />
              <Chip label={`Undercut ${snapshot?.position?.undercutRisk ?? "--"}`} tone={snapshot?.position?.undercutRisk === "high" ? "danger" : "warning"} />
              <Chip label={`Δ ${fmt(snapshot?.driver?.lapDelta?.value)}s`} tone="info" />
            </div>
            <div className="row2">
              <Metric title="Lap" value={snapshot?.driver?.lapNumber?.value} quality={snapshot?.driver?.lapNumber?.quality} />
              <Metric title="Sector" value={snapshot?.driver?.sector?.value} quality={snapshot?.driver?.sector?.quality} />
              <Metric title="Rejoin Est" value={snapshot?.position?.rejoinEstimatePosition?.value} quality={snapshot?.position?.rejoinEstimatePosition?.quality} />
            </div>
          </section>

          <section className="right panel">
            <h3>Strategy Rail</h3>
            <Metric title="Deg Projection" value={snapshot?.tyre?.degradationTrend?.value} quality={snapshot?.tyre?.degradationTrend?.quality} unit="%/lap" />
            <Metric title="Pit Window Open" value={snapshot?.position?.pitWindowOpenLap?.value} quality={snapshot?.position?.pitWindowOpenLap?.quality} />
            <Metric title="Rejoin Pos" value={snapshot?.position?.rejoinEstimatePosition?.value} quality={snapshot?.position?.rejoinEstimatePosition?.quality} />
            <Metric title="Delta vs Rival" value={snapshot?.strategy?.expectedGainSec} quality={snapshot?.strategy?.stale ? "stale" : "estimated"} unit="s" />
            <Metric title="Threat" valueText={snapshot?.position?.threatLevel ?? "--"} quality={snapshot?.position?.positionStateQuality} />
            <Metric title="Crossover" valueText={snapshot ? `L${Math.round((snapshot.position.pitWindowOpenLap.value ?? 0) + 2)}` : "--"} quality="estimated" />
            <div className="strategyBox">
              <strong>{snapshot?.strategy?.headline ?? "No recommendation"}</strong>
              <small>{snapshot?.strategy?.rationale?.join(" | ") ?? "Awaiting telemetry"}</small>
            </div>
          </section>
        </div>

        <section className="bottom panel">
          <div className="tableWrap">
            <h4>Classification</h4>
            <table>
              <thead><tr><th>POS</th><th>DRIVER</th><th>GAP</th><th>INT</th><th>THREAT</th><th>STINT</th><th>TYRE</th><th>PIT</th></tr></thead>
              <tbody>
                {(snapshot?.classification ?? []).map((row) => (
                  <tr key={`${row.driver}-${row.pos}`}>
                    <td>{row.pos}</td><td>{row.driver}</td><td>{row.gap}</td><td>{row.interval}</td><td>{row.threat}</td><td>{row.currentStint}</td><td>{row.tyre}</td><td>{row.pitCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="logs">
            <LogPanel title="Team Radio (placeholder)" items={actionLog} empty="No issued commands" />
            <LogPanel title="Race Control" items={snapshot?.raceControlLog ?? []} empty="No race control events" />
            <LogPanel title="Strategy Engine (placeholder)" items={snapshot?.strategyLog ?? []} empty="No strategy logs" />
            <LogPanel title="Event Feed" items={events.map((e) => `${e.type}`)} empty="No feed events" />
          </div>

          <div className="actions">
            {ACTIONS.map((action) => (
              <button key={action.code} onClick={() => issueAction(action.code)} disabled={!canAct}>
                {action.label}
              </button>
            ))}
          </div>

          <div className="diag">
            <Chip label={`SnapshotAge ${snapshot?.diagnostics?.snapshotAgeMs ?? "--"}ms`} tone={snapshot?.diagnostics?.stale ? "danger" : "info"} />
            <Chip label={`PacketRate ${snapshot?.diagnostics?.packetRate ?? "--"}/s`} tone="info" />
            <Chip label={`Jitter ${snapshot?.diagnostics?.jitterScore ?? "--"}ms`} tone="warning" />
            <Chip label={`Partial ${snapshot?.telemetryRestricted ? "YES" : "NO"}`} tone={snapshot?.telemetryRestricted ? "warning" : "success"} />
          </div>
        </section>
      </section>
    </div>
  );
}

function Metric(props: { title: string; value?: number | null; valueText?: string; quality?: string; unit?: string; compact?: boolean }) {
  const shown = props.valueText ?? (props.value === null || props.value === undefined ? "--" : fmt(props.value));
  return (
    <article className={`metric ${props.compact ? "compact" : ""}`}>
      <span>{props.title}</span>
      <strong>
        {shown}
        {props.unit ? <em>{props.unit}</em> : null}
      </strong>
      <small>{props.quality ?? "unavailable"}</small>
    </article>
  );
}

function LogPanel(props: { title: string; items: string[]; empty: string }) {
  return (
    <article className="logPanel">
      <h4>{props.title}</h4>
      <ul>{props.items.length ? props.items.map((line, i) => <li key={`${line}-${i}`}>{line}</li>) : <li>{props.empty}</li>}</ul>
    </article>
  );
}

function Chip(props: { label: string; tone: "info" | "success" | "warning" | "danger" }) {
  return <span className={`chip ${props.tone}`}>{props.label}</span>;
}

function qualityTone(quality: string): "info" | "success" | "warning" | "danger" {
  if (quality === "live") return "success";
  if (quality === "estimated") return "warning";
  if (quality === "stale") return "danger";
  return "info";
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "--";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
