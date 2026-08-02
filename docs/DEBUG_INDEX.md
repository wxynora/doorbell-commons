# Doorbell Commons Implementation Index

This index records implemented and currently valid entry points only. Planned features remain in
`docs/product-plan.md`.

## Runtime

| Area | Entry point | Current behavior | Verification |
| --- | --- | --- | --- |
| Shared protocol | `packages/protocol/src/index.ts` | Defines runtime-validated health, QQ group eligibility, farm lookup, strict first/returning registration, account/resident/home/farm-binding session, logout, and error contracts | `npm run typecheck -w @doorbell/protocol` |
| HTTP server | `apps/server/src/index.ts` | Starts Fastify on configurable `HOST` and `PORT`, opens SQLite, and wires the OneBot membership reader, external read-only farm directory client, and registration service | `npm run build -w @doorbell/server` |
| Health route | `apps/server/src/app.ts` | Serves `GET /api/health` using the shared contract | `npm run test -w @doorbell/server` after building the protocol package |
| QQ group eligibility route | `apps/server/src/app.ts` | Serves `POST /api/registration/qq-group-eligibility`; accepts only `qq_number`, returns eligibility only for an exact current member of group `515831305`, and distinguishes non-membership from OneBot unavailability | `npm run test -w @doorbell/server` after building the protocol package |
| Farm lookup route and client | `apps/server/src/app.ts` and `apps/server/src/farm-directory-client.ts` | `POST /api/registration/farm-lookup` accepts one public doorplate and calls the external farm's `GET /c?a=visit&farm=...&detail=true`; exact missing-farm responses remain distinct from unavailable or malformed upstream responses; no Doorbell identity row is written | `npm run test -w @doorbell/server` after building the protocol package |
| Human registration and session routes | `apps/server/src/app.ts` and `apps/server/src/registration-auth.ts` | First registration requires QQ/code plus resident/home names and confirmed farm doorplate/name, rechecks QQ and farm externally, then creates the complete combination; returning login restores the existing combination; `POST`/`GET` return account, resident, home, and farm binding only; `DELETE` logs out; confirmed departure revokes sessions | `npm run test -w @doorbell/server` after building the protocol package |
| Registration and account database | `apps/server/src/community-database.ts` | One immediate transaction creates/restores account, resident, home, unique farm-doorplate binding, and digest-only session; one account has at most one resident/home and one farm can bind only one account; exact names are stored without a new cap, trim, rewrite, or truncation; database mode is `0600` | `npm run test -w @doorbell/server` |
| Registration code CLI | `apps/server/src/registration-code-cli.ts` and root `package.json` | `npm run registration-code` prints the persisted current code and generation/expiry timestamps without calling OneBot or sending QQ messages | `npm run test -w @doorbell/server` |
| Human session Cookie | `apps/server/src/session-cookie.ts` | Uses an HttpOnly, SameSite=Lax, path-wide Cookie, adds Secure in production, and adds no Doorbell session expiry | `npm run test -w @doorbell/server` |
| OneBot membership reader | `apps/server/src/qq-group-membership.ts` | Calls only read-only `get_group_member_list` with `no_cache: true`, matches `user_id` exactly, and maps upstream/network/malformed failures to an unavailable error | `npm run test -w @doorbell/server` |
| Server configuration | `apps/server/src/config.ts` and `.env.example` | Requires OneBot HTTP(S) base URL, non-empty API token, fixed group ID, SQLite path, and external farm HTTP(S) base URL; no production value is stored in the repository | `npm run typecheck -w @doorbell/server` |
| Observer web shell | `apps/web/src/app.tsx` | Shows an explicitly empty Idle Room scaffold and reads service health | `npm run build -w @doorbell/web` |
| Development proxy | `apps/web/vite.config.ts` | Proxies local `/api` requests to `127.0.0.1:3000` | Start the server and web workspaces with `npm run dev` |

## Boundaries

- Human accounts, resident/home identity, external farm-doorplate bindings, and browser sessions
  exist, but no Connector, lounge-message, visit, moderation, avatar, or game-save runtime exists.
- Farm lookup and binding prove only that the public doorplate exists and its name was confirmed;
  they do not prove farm ownership and do not support unbind or rebind.
- No WebSocket endpoint exists.
- No production service or reverse-proxy configuration exists.
- The public farm remains outside this repository; Doorbell only reads its public visit contract and
  does not import its runtime or store.
