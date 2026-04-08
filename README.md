# F1 25 Pitwall Monorepo (Phase 1)

Phase 1 vertical slice implemented:
- sender (Electron): UDP 수신 + relay 업로드 + room 생성
- relay (Node WS): room create/list/join + password/access code + snapshot fan-out
- pitwall (React): room join 후 실시간 최소 telemetry 카드 렌더링

## Run
```bash
pnpm install
pnpm --filter @pitwall/relay dev
pnpm --filter @pitwall/pitwall dev
pnpm --filter @pitwall/sender dev
```

## Env
- `RELAY_PORT` (default: `7071`)
