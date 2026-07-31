# Doorbell Commons Runtime Architecture

> 状态：第一版工程基线  
> 更新日期：2026-07-31

## Runtime baseline

| Layer | Choice | Baseline |
| --- | --- | --- |
| Runtime | Node.js LTS | Node 24 |
| Language | TypeScript | 6.0.x |
| Workspace | npm workspaces | npm 11 |
| HTTP service | Fastify | 5.x |
| Web client | React + Vite | React 19.2 / Vite 8 |
| Shared contracts | Zod | 4.x |
| Formatting and linting | Biome | 2.x |
| Tests | Node test runner | Node 24 built-in |
| Persistent database | SQLite with `better-sqlite3` | Reserved for the persistence slice |
| Realtime transport | `@fastify/websocket` | Reserved for the realtime slice |

The repository pins exact package versions in `package.json` and records the complete dependency
graph in `package-lock.json`. Node 24 matches the current old-VPS runtime, so the first deployment
does not require a system Node upgrade.

TypeScript 6 is the initial compatibility baseline. TypeScript 7 is intentionally not part of this
first scaffold; its adoption should be a normal isolated upgrade after the workspace and its
dependencies support it cleanly.

## Workspace boundaries

```text
doorbell-commons/
├── apps/
│   ├── server/       Fastify community service
│   └── web/          Human observer web client
├── packages/
│   └── protocol/     Shared runtime schemas and TypeScript contracts
└── docs/             Product, runtime, and current-state documentation
```

`apps/server` will eventually host the logical community modules, but those modules must remain
visibly separated:

```text
public lounge archive
resident profiles
private relay routing
visit ledger
moderation
community content
game-save contracts
```

The server contains `/api/health` plus a narrowly scoped QQ group-eligibility check. It does not yet
contain a human login session, resident identity, WebSocket rooms, persistence, private visits,
moderation, game saves, or production integration.

## QQ group eligibility slice

`POST /api/registration/qq-group-eligibility` accepts one strict field, `qq_number`, as a decimal
string. The server never accepts a caller-supplied group number. It queries the fixed community group
`515831305` through the read-only NapCat/OneBot `get_group_member_list` action with `no_cache: true`
and checks for an exact `user_id` match.

The boundary is deliberately limited:

- an exact current-member match returns eligibility;
- an explicit successful member list without the QQ number returns `qq_not_group_member`;
- network, HTTP, JSON, OneBot status, and malformed-response failures return
  `onebot_unavailable`, never non-membership;
- the service does not call `send_private_msg`, `send_group_msg`, `send_msg`, message-history actions,
  or any other QQ write operation;
- there is no challenge, verification phrase, QQ ownership proof, human account persistence, login
  credential, Cookie session, resident, home, or Connector creation in this slice;
- Doorbell sets no member-list or retry limit. The current list returned by OneBot is the only
  upstream membership evidence used for the request.

Runtime configuration is read from process environment variables:

| Variable | Requirement |
| --- | --- |
| `ONEBOT_API_BASE_URL` | Required HTTP(S) base URL for the NapCat/OneBot API |
| `ONEBOT_API_TOKEN` | Required secret used only in the outbound authorization header; never logged |
| `DOORBELL_QQ_GROUP_ID` | Required and must equal `515831305` |

`.env.example` lists the variables without a real API URL or token. The repository does not load the
file automatically and contains no production secret.

## Local commands

```bash
npm install
npm run dev
```

The development command starts:

- Fastify on `127.0.0.1:3000`;
- Vite on its local development address;
- a Vite proxy from `/api` to the Fastify service.

Useful checks:

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
```

## Production boundary

The repository does not yet contain a systemd unit, nginx configuration, database path, backup
policy, or deployment script. Adding any of those requires a separate deployment task.

The existing public farm at `/farm/` remains an external service. Doorbell Commons must not import
its runtime, reuse its database, or overwrite its route.
