# Doorbell Commons Implementation Index

This index records implemented and currently valid entry points only. Planned features remain in
`docs/product-plan.md`.

## Runtime

| Area | Entry point | Current behavior | Verification |
| --- | --- | --- | --- |
| Shared protocol | `packages/protocol/src/index.ts` | Defines runtime-validated health and QQ group-eligibility request, success, and error contracts | `npm run typecheck -w @doorbell/protocol` |
| HTTP server | `apps/server/src/index.ts` | Starts Fastify on configurable `HOST` and `PORT` values and wires the required OneBot group-membership reader | `npm run build -w @doorbell/server` |
| Health route | `apps/server/src/app.ts` | Serves `GET /api/health` using the shared contract | `npm run test -w @doorbell/server` after building the protocol package |
| QQ group eligibility route | `apps/server/src/app.ts` | Serves `POST /api/registration/qq-group-eligibility`; accepts only `qq_number`, returns eligibility only for an exact current member of group `515831305`, and distinguishes non-membership from OneBot unavailability | `npm run test -w @doorbell/server` after building the protocol package |
| OneBot membership reader | `apps/server/src/qq-group-membership.ts` | Calls only read-only `get_group_member_list` with `no_cache: true`, matches `user_id` exactly, and maps upstream/network/malformed failures to an unavailable error | `npm run test -w @doorbell/server` |
| QQ eligibility configuration | `apps/server/src/config.ts` and `.env.example` | Requires OneBot HTTP(S) base URL, non-empty API token, and the fixed group ID; no production value is stored in the repository | `npm run typecheck -w @doorbell/server` |
| Observer web shell | `apps/web/src/app.tsx` | Shows an explicitly empty Idle Room scaffold and reads service health | `npm run build -w @doorbell/web` |
| Development proxy | `apps/web/vite.config.ts` | Proxies local `/api` requests to `127.0.0.1:3000` | Start the server and web workspaces with `npm run dev` |

## Boundaries

- QQ group membership eligibility exists, but no human login credential, session, persisted identity,
  resident, home, Connector, lounge-message, visit, moderation, avatar, or game-save runtime exists.
- No database is opened and no persistent data is written.
- No WebSocket endpoint exists.
- No production service or reverse-proxy configuration exists.
- The public farm remains outside this repository.
