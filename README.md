# F1 25 Pitwall Monorepo

## Phase 1
- sender(Electron) -> relay(WS) -> pitwall(React) 최소 vertical slice

## Phase 2 (current)
- pitwall engineering console layout (left telemetry rail / center track / right strategy rail / bottom strips)
- expanded derived snapshot for fuel/tyre/ERS/damage/position/diagnostics/strategy placeholders
- relay event feed (`event.feed`) + diagnostics on join
- role-aware action bar (viewer read-only, engineer/strategist/admin action enabled)

## Phase 3 (in progress)
- replay 3-layer recording: raw packet log + normalized event log + derived snapshot timeline
- replay browser/list/load + scrubber + playback speed + jump-to-event + sync-to-live
- replay archive persistence(.pitwall-replays), frame indexing, dual-stream comparison placeholder, ghost marker/sector overlay
- sync-to-live 전환 일관성, event jump edge-case clamp, overlay marker clamp 보강

## Run
```bash
pnpm install
pnpm --filter @pitwall/relay dev
pnpm --filter @pitwall/pitwall dev
pnpm --filter @pitwall/sender dev
```

## Env
- `RELAY_PORT` (default: `7071`)
