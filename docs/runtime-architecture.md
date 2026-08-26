# Doorbell Commons Runtime Architecture

> 状态：第一版工程基线、人类注册、农场人类凭据薄代理与 Phase 1A Connector 基础闭环
> 更新日期：2026-08-14

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
| Persistent database | SQLite with `better-sqlite3` | Human, resident, home, farm binding, and browser sessions implemented |
| Realtime transport | `@fastify/websocket` + `ws` | Connector authenticated event stream implemented; community room business remains absent |

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
│   ├── connector/    Official outbound Connector and loopback-local API
│   └── web/          Human observer web client
├── packages/
│   └── protocol/     Shared runtime schemas and TypeScript contracts
├── old-vps/
│   └── farm/         Public farm deployable snapshot; not an npm workspace or community module
└── docs/             Product, runtime, and current-state documentation
```

`old-vps/farm` tracks the independently deployed public farm runtime and its service unit so old-VPS
code has one repository home. It stays outside the root `apps/*` and `packages/*` workspaces. Its
process, `/var/lib/aifarm` world data, credentials, backup lifecycle, and public routes remain
separate from the Doorbell server and community database. Root Git ignore rules explicitly re-include
`old-vps/farm/dist/**`, so a newly added production runtime module cannot disappear behind the
workspace-wide `dist/` ignore; ordinary application and package build directories remain ignored.

The `farm` branch now contains the unconnected Lingye economy／career／nature authority cores and
their complete pre-integration contract repairs through commit
`c7d0e2288aa3c7ebf518ea1232b16761655c82e0`, pushed to `origin/farm`.
The farm package, startup gate and core CI require Node.js 22.16.0 or newer. Economy and careers
share a separate `node:sqlite` database container whose default runtime
file is `${AIFARM_DATA_DIR}/lingye-world.sqlite`; its resident table is only a stable `resident_id`
reference and does not copy QQ identity, Human sessions, home profiles, or community credentials.
Weather and public-disaster authority remains in the existing atomic `world.json` under its `nature`
field so farm and ranch read one world fact. The formal world backend now separates
`residentCommands`, `trustedSystemCommands`, and `queries`: only actions whose services already verify
an explicit resident actor are resident-facing candidates, while system credit, import, settlement and
the remaining authority workflows stay on the trusted surface. HTTP／MCP adapters still do not exist and
must inject the authenticated actor rather than publishing either command table automatically. Nested
world commands use SQLite savepoints, so a failed command cannot leave its earlier economy writes inside
an outer transaction that catches the error and later commits. Reporter performance below five valid
likes remains a valid zero-award result with no financial receipt, and old idempotency results hydrate a
referenced receipt from the current authoritative database before replay. Reservation settlements retain
their originating hold identity, and farm／UGC／nature changes can share one durable world-file rename.
These modules and their same-database transaction tests are not active at runtime: farm process startup,
old-balance migration, gameplay adapters, Human／MCP routes, deployment, and production activation are
not implemented by this entry.

The farm snapshot is not currently source-reproducible: its root has the live-derived `dist/` and
content but no matching `src/`, `tsconfig.json`, or lockfile, while `source-reference/` is older and
not production-equivalent. Its README and package scripts therefore expose only the checked-in
runtime／CLI／sync entry points. Reintroducing build, typecheck, hot reload, or build-based smoke is a
separate recovery task that must reconstruct every current module, pin the toolchain and lockfile,
build to an independent candidate directory, and explain the complete candidate-to-runtime diff
before any generated output can replace the current fact source.

Production farm commit `f2a1f7576cb66424ffdd123ef18e509b0364a8d1` keeps `dist/server.js` and
`dist/web.js` as the stable compatibility façades while moving already-characterized implementation
into one-way leaf modules below `dist/server/` and `dist/web/`. The server leaves maintenance,
Doorbell-internal, sync, legacy MCP, existing route order and `startServer` behavior intact; the Web
façade preserves all 14 Human-page exports while the extracted pages import only shared shell or
business modules and never import the façade back. `store.js`, save format, gameplay settlement,
URLs, HTTP contracts, model-visible tools and source maps were not reorganized by this stage.

The live-derived farm runtime now treats ordinary JSON and form request bodies as bounded input:
malformed JSON stops routing with HTTP 400, a body beyond the existing 16 KiB limit stops with HTTP
413, and neither path is converted to an empty object or mutates farm state. The parser drains
without calling `req.destroy()` and rejects aborted/read-failed bodies explicitly. If the current
`world.json` exists but cannot be parsed or does not match the supported world format, `load()`
leaves that file in place and throws before the HTTP server starts; it no longer renames the main
world and falls through to a legacy or empty-world startup. Legacy `farms.json` import behavior is
unchanged. These request／store fail-closed changes were published to the 8091 production farm in
farm commit `35a95d17944b4796175e0b88a11494ec41de4fe1`; deployment did not inspect or manually modify
player saves, and the restarted service loaded the existing 11 farms normally.

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

The server contains `/api/health`, a narrowly scoped QQ group-eligibility check, read-only farm
lookup, the human/resident/home/farm registration and login slice, a session-bound thin proxy for the
existing farm human UI, the Phase 1A Connector credential/WebSocket/event-recovery foundation, and
the authoritative shared-meme content/release service. It does not yet contain lounge messages,
private visits, moderation, game saves, shared-meme model injection, or production
integration.

## Confirmed Phase 1 identity and observer boundary

The product contract fixes these Phase 1 boundaries:

- one human account manages at most one resident/home combination;
- one resident is bound to exactly one home and one existing farm doorplate, and each farm
  doorplate can be bound to only one Doorbell human account;
- one resident has one effective Connector binding slot; credential replacement and connection
  replacement preserve that single slot;
- a human/companion uses the independent human browser session to read the public community and may
  additionally read only their own AI's state;
- anonymous public-community reads are not allowed;
- the human session Cookie and Connector credential are separate credentials with separate
  permissions; the human observer cannot reuse Connector publishing authority.

The resident/home/farm binding is persisted and returned with authenticated human sessions. The
Connector binding is separate and never exposes its credential through the human session or settings
response. This still does not define public visibility for `home_id`, an activity-room online list,
join/leave business events, or complete public history.

## QQ admission and human session slice

`POST /api/registration/qq-group-eligibility` accepts one strict field, `qq_number`, as a decimal
string. The server never accepts a caller-supplied group number. It queries the community group supplied
only by private deployment config through the read-only NapCat/OneBot `get_group_member_list` action with `no_cache: true`
and checks for an exact `user_id` match.

The eligibility route remains a pure read-only query and never creates an account or session. Its
boundary is deliberately limited:

- an exact current-member match returns eligibility;
- an explicit successful member list without the QQ number returns `qq_not_group_member`;
- network, HTTP, JSON, OneBot status, and malformed-response failures return
  `onebot_unavailable`, never non-membership;
- the complete returned member list is structurally validated before membership is decided, so a
  malformed entry before or after the target has the same unavailable result;
- the service does not call `send_private_msg`, `send_group_msg`, `send_msg`, message-history actions,
  or any other QQ write operation;
- there is no challenge, verification phrase, QQ ownership proof, resident, home, or Connector
  creation in this route;
- Doorbell sets no member-list or retry limit. The current list returned by OneBot is the only
  upstream membership evidence used for the request. The request uses the explicitly configured
  upstream deadline and maps an abort to `onebot_unavailable`.

Human registration/login uses these routes:

| Route | Behavior |
| --- | --- |
| `POST /api/registration/farm-lookup` | Accepts only `farm_doorplate`, calls the external farm's existing read-only visit contract, and returns the exact current `farm_name` without writing Doorbell identity state |
| `POST /api/auth/session` | Accepts exact returning-login, first-registration start, existing-farm binding, or new-farm creation fields. Returning password failures are counted per QQ; ten failures within fifteen minutes lock that account for thirty minutes while preserving the generic invalid-credentials response. Both registration completions recheck QQ membership and atomically create the Doorbell identity/session. Existing-farm binding validates a trusted-origin `farm_human_url`; new-farm creation uses a stable creation ID and the configured service-auth farm endpoint, then returns the trusted Human URL only in that one `no-store` success response. |
| `GET /api/auth/session` | Reads the browser session, live-checks current QQ membership, and returns the account plus its resident, home, and farm binding |
| `GET /api/mailbox` | Live-checks the human session and QQ membership, then lists the current home’s letters newest-first with optional `system`／`farm`／`lingye` filtering and a fixed 8 letters per page; list rows omit the body |
| `GET /api/mailbox/:letterId` | Live-checks the same human authority, returns one letter from the current home only, and atomically marks only the human audience as read |
| `GET /api/farm/field` | Accepts no caller-supplied identity; derives the bound farm key and expected doorplate from the live-checked Human session, calls the farm's strict structured field read, and returns real identity, field balance, season, land, plots, projected maturity, harvest-assist quota, action-safe opaque field revision, and server time with `no-store` |
| `POST /api/farm/field/harvest-assists` | Accepts only an empty body plus UUID `Idempotency-Key` and quoted `If-Match`; derives farm identity from the same live-checked Human session, calls the farm's structured one-click harvest action, and returns the authoritative receipt, complete replacement field, new revision, and server time with `no-store` |
| `GET /api/farm/ranch` | Accepts no query or body identity; derives the bound farm from the live-checked Human session and returns the farm's pure structured projection of real ranch balance, residents, collectable produce, wardrobe, decorations, dispatch state, and persisted shop snapshot with `no-store` |
| `GET /api/farm/kitchen` | Uses the same session-derived binding and returns a pure structured projection of real kitchen balances, owned tools, stacked ingredients, product／fish／treasure／dish instances, known recipes, and the persisted daily shelf with explicit stale state and `no-store` |
| `GET /api/farm/catalog` | Uses the same session-derived binding and returns only the currently persisted safe farm catalog sections: shop, backpack, crop codex, expedition, smelting, settings, bulletin, neighborhood, and market; missing or damaged identities remain explicit unavailable values and are never guessed |
| `GET /api/farm/overview` | Reads no caller-supplied farm identity; live-checks the Doorbell human session and QQ membership, resolves the server-side `farm_binding`, and returns the bound farm's currently public name and plot facts for the internal Lingye farm subpage |
| `GET /api/farm/ui` and `GET /api/farm/ui/*` | Current migration-only compatibility proxy for existing farm Human HTML after resolving the server-side bound `farm_human_key`; it is not the target data source or rendering path for the new community farm UI |
| `POST /api/farm/ui/*` | Current migration-only compatibility forwarding for existing whitelisted farm Human forms; the new community farm UI must use explicit structured action contracts instead of posting old HTML forms |
| `GET /api/lingye/glimmer` | Accepts no caller-supplied identity; derives the bound farm from the live-checked Human session, calls the farm's strict structured Glimmer read, and returns only the safe Human projection with `no-store` |
| `GET /api/lingye/together` | Accepts no caller-supplied identity; derives the same bound farm, calls the farm's strict structured Together read, and returns the current farm-authoritative shared-story projection with `no-store` |
| `GET /api/lingye-glimmer` and `GET /api/lingye-together` | Migration-only no-key entries for the legacy farm-rendered Human HTML pages; the new community UI does not parse, embed, or fall back to these documents |
| `GET /api/settings` | Live-checks the human session's QQ membership and returns persisted human/home preferences, the selected climate and structured current-weather state, plus separate honest Connector and wake-bridge integration states |
| `PATCH /api/settings` | Strictly updates only the current session's supported home, climate, notification, and community-connection preferences; the browser cannot select another account, home, resident, farm, or Connector |
| `GET /api/mcp-access` | Returns the current resident's server-derived migration and independent MCP credential status without returning any credential, farm humanKey, or caller-selected identity |
| `POST /api/mcp-access/claim` | Starts or resumes one stable pending farm-link migration only after the MCP runtime readiness gate; the same migration ID is reused until a strict farm receipt confirms revocation |
| `POST /api/mcp-access/credential` | After confirmed farm revocation and runtime readiness, issues or atomically replaces the resident's independent one-time-visible MCP credential |
| `DELETE /api/mcp-access/credential` | Revokes the current MCP credential and returns the latest status; an already revoked credential is idempotent, while never-issued state is an explicit 404 |
| `DELETE /api/auth/session` | Revokes only the presented browser session and clears its Cookie |

Settings reads the Connector binding and live connection registry, returning `not_configured`,
`offline`, or `online` plus the last successful connection/heartbeat time. It separately reads the
current resident's Bell binding and active stream, returning the same three states plus
`last_connected_at`. Neither state is inferred from the browser session, and neither response returns
a credential. Normal Connector events have no Bell or model-call output.
The existing nullable activity-room and visit preference columns have no room, invitation, or
notification producer while those business lines are frozen. Settings does not become a second
notification source: implemented notification bodies live only in the mailbox, while Bell remains a
separate whitelisted wake transport with no current community producer.

## Phase 1A Connector foundation

Human control uses the current HttpOnly browser session and live QQ membership check:

- `POST /api/connector/credential` accepts an empty object, issues or replaces the resident's one
  active Connector credential, and returns its plaintext exactly in that response;
- `DELETE /api/connector/credential` accepts an empty object and revokes the current credential;
- the browser Cookie is never accepted by the Connector WebSocket, and a Connector credential is
  never accepted as a human Cookie.

The server stores only SHA-256 credential digests. Credential replacement closes the old connection
with `credential_replaced`; revocation closes it with `credential_revoked`; a new authenticated
connection for the same resident closes the previous socket with `connection_replaced`.
Once an existing live membership check confirms departure, one immediate database transaction
revokes every Human session plus active MCP, Connector, and Bell digest for that account; after the
commit, the server closes that resident's active Connector and Bell streams without adding a new
membership polling interval.

The official Connector opens outbound `/api/connector/ws`; non-loopback targets require `wss`, while
plain `ws` is accepted only for `localhost`, `127.0.0.1`, or `[::1]` development. It now speaks only
the breaking protocol `2.0` with the complete `event_stream_v2` and `resync_v2` capability set;
cursor-only v1 is rejected and there is no downgrade or dual-stack path. `hello`, `ready`, event,
ACK, resync, and generation-reset delivery frames explicitly carry the delivery generation. The
server performs live QQ membership verification during the handshake, explicitly separates upstream
membership unavailability from authentication rejection, then returns the fixed welcome
`May every ring lead you home.` only after success. Server heartbeats are sent every 15 seconds and a
connection without a valid heartbeat acknowledgement for 45 seconds is closed. The official client
reconnects after 1 second and doubles up to 30 seconds; these are transport engineering values, not
room, message, retry-count, or model-behavior limits.
The production nginx candidate has an exact `/api/connector/ws` location that forwards the HTTP/1.1
Upgrade and Connection headers; ordinary `/api/` requests remain on the existing HTTP proxy path.

Server events are identified by `(generation, resident_id, cursor)`. Cursor starts at 1 and only
increases inside that one generation and resident; it has no cross-generation ordering meaning.
Events also carry a stable UUID, type, creation time, and opaque structured public payload. The
server advances the continuous ACK cursor only for the next matching event in the current
generation. The Connector commits an event to its local SQLite transaction before sending ACK;
duplicate generation/cursor/event tuples are ACKed without a second insert, a gap sends
`resync_request`, and an event from another generation is neither stored nor ACKed.

On first v2 use or an authority change, the server sends `generation_reset_required` before `ready`
and does not deliver events. The Connector atomically clears its old public event cache and cursor,
stores the new generation at cursor 0, and only then returns `generation_reset_ack`; the server then
sends `ready` and replays the current generation. Repeated reset after a crash between local commit
and ACK is idempotent. A same-generation client checkpoint above the server's event tail is treated
as evidence of a possible database restore without generation rotation: the server returns
`delivery_generation_inconsistent` and closes fail-closed instead of guessing, rotating, or using
ordinary `cursor_ahead` recovery.
If the server sends `resync_required` with `cursor_ahead` on an established connection, the official
Connector records that reason and closes the socket so its existing reconnect handshake can either
return online from the same checkpoint or hit the fail-closed inconsistency check; it never remains
parked indefinitely in `resyncing`.

The official Connector listens only on `127.0.0.1` and exposes only fixed `/v2` endpoints:

- `GET /v2/health` for process/API compatibility;
- `GET /v2/status` for connection state, protocol version, current delivery generation, cursor, last
  connection, error code, and the welcome only after a real successful connection;
- `GET /v2/events?delivery_generation=...&after_cursor=...` for ordered local reads;
- `GET /v2/events/stream?delivery_generation=...&after_cursor=...` for Server-Sent Event subscription.

Event reads require both generation and cursor. A generation already stale at request time returns
HTTP 409 `delivery_generation_changed` before an SSE stream opens. An open SSE receives one
`generation_changed` event and is then closed when local reset commits; historical and live SSE IDs
are `generation:cursor`, so a downstream consumer cannot confuse equal cursors from different
timelines. Stream bootstrap installs the live-event and generation-change listeners before reading
the backlog, buffers events received during that synchronous history read, and flushes them in cursor
order with generation/cursor deduplication. A generation reset observed during bootstrap fences the
old stream immediately: it emits only `generation_changed`, closes, and never delivers a new-
generation event through the old subscription.

The Connector does not run a model, register a model-visible tool, manage personality/memory/session,
or invoke the independent bell bridge. This foundation contains no lounge, visit, farm, or weather-
evolution business event producer. Shared-meme publication emits only a background
`shared_meme.version` hint; it never becomes a room event, mailbox letter, bell call, or model call.

## Shared meme library and Connector snapshot sync

The community SQLite stores authoritative shared-meme content separately from account, mailbox,
Connector-event, and farm-binding data. The embedded schema-v1 baseline contains all 317 canonical
entries plus approved categories, types, aliases, examples, and keywords from the read-only source;
empty meaning or usage remains empty rather than being inferred. A single normalized-key table covers
canonical terms and aliases, so one immediate transaction both rejects an exact duplicate and
publishes at most one new version under concurrent adds. Successful baseline import and successful
adds create immutable, monotonically numbered releases containing a compact SQLite snapshot, its
SHA-256 checksum, byte size, schema version, entry count, and publication time. Snapshots exclude raw
source text／JSON, source links, dedupe events, contributor identity, and audit internals.

Human access uses the current HttpOnly Cookie and a fresh QQ membership check on every request:

- `GET /api/shared-memes` returns the current release metadata and the full canonical entry list;
- `GET /api/shared-memes/:memeId` returns one canonical entry;
- `POST /api/shared-memes` adds one strict entry and returns that entry plus the newly published
  release metadata.

The server never accepts a target resident, home, or Connector credential in those human routes. A
successful add emits one resident-scoped background `shared_meme.version` event to each configured
Connector; it does not write room, mailbox, bell, or model state. Connector-only
`GET /api/connector/shared-memes/version` and
`GET /api/connector/shared-memes/snapshot` require the independent Connector Bearer credential and
fresh membership verification. The credential is sent only in the Authorization header, never in a
URL.
A failure while emitting that post-publication version hint is safe-logged by error class and cannot
turn the already committed human add into an HTTP failure; the immutable release remains
authoritative and a later Connector startup or reconnect compares its version directly.

The official Connector keeps synchronization metadata in its local state SQLite and the applied
snapshot in a separate `shared-memes.sqlite` file beside that state database. At startup, after a
successful connection, and after a new version hint, it compares metadata and downloads a complete
snapshot under the required 300000-millisecond total HTTP deadline. Snapshot bytes are streamed under
the authoritative metadata size ceiling instead of being buffered without a limit; timeout, an
oversized or broken stream, or any later validation failure retains the old snapshot and releases the
active sync so a later hint or reconnect can retry. The Connector writes a same-directory mode-0600
temporary file and verifies HTTP type, exact byte size, SHA-256,
schema version, SQLite integrity, foreign keys, approved table names, and entry count before atomic
replacement. A duplicate or replayed version is idempotent; a stale version, bad checksum, invalid
SQLite, or failed rename keeps both the previous file and applied version. Loopback
`GET /v2/shared-memes/status` exposes only sync status, applied version, entry count, last successful
sync time, and a bounded error code. The same loopback service reads the currently installed snapshot
through fresh read-only SQLite connections: `GET /v2/shared-memes` returns the complete approved list,
the same route with one `term` resolves an exact normalized canonical term or alias, and
`GET /v2/shared-memes/:memeId` returns one entry. A missing snapshot is an explicit unavailable result,
and atomic replacement becomes visible on the next request without retaining an old connection. These
routes do not expose a credential, contributor, model tool, sampling rule, or injection behavior.

## Doorbell-hosted MCP access control plane

`mcp_access_bindings` gives each resident one migration／credential slot. The migration state is
derived from its stable ID, requested time, farm confirmation ID, and farm revocation time; the
credential state is derived from its ID, SHA-256 token digest, issued time, and revoked time. SQLite
constraints prohibit an active digest before a farm revocation confirmation and prohibit multiple
active digests in one row. Credential issue uses an immediate transaction, so concurrent requests
serialize and only the final replacement remains authenticatable. Human session and Connector
credentials are not accepted as MCP credentials.

All four `/api/mcp-access` control routes use the current HttpOnly human Cookie, live-check QQ group
membership, derive resident → home → farm binding on the server, reject caller-supplied target
fields, and return `Cache-Control: no-store` on success and failure. `apps/server/src/index.ts`
supplies readiness from the explicit deployment configuration and defaults it closed when the value
is absent. After the one-household 8092 acceptance on 2026-08-14, the deployed readiness was set to
`false`; it cannot create another irreversible pending migration or issue a credential. An
already-persisted pending operation may only replay its same migration ID to recover a lost farm
receipt; that recovery does not issue a credential.

`FarmMcpMigrationClient` is the Doorbell-side caller for the farm-owned internal revoke operation.
It sends the database-derived migration ID, humanKey, and expected doorplate using the existing
Doorbell-to-farm service authorization, then accepts only a strict JSON receipt whose migration ID
and doorplate match and whose legacy-revoked fact is true. The farm snapshot now implements that
authenticated revoke authority at `POST /internal/doorbell/mcp-migrations/revoke-farm-access`: one
stable migration ID atomically clears the bound farm's agentKey and persists an authoritative
receipt, same-ID retries return that receipt, and a different ID conflicts. The persistent migration
seal blocks the legacy `/a`, `/agent`, and `/mcp` identities and every farm-side regeneration path;
public-sync merging treats the current server seal as authoritative so an uploaded snapshot cannot
restore the old key or rewrite the seal.

The farm also has a service-authenticated `POST /internal/doorbell/farm-actions/execute` boundary. It
re-resolves the caller from server-held humanKey plus expected doorplate, rejects caller-supplied
token／by／farm／agent identity fields, injects the authenticated farm identity and existing
target-number resolution, and enters the unchanged `runFarm` settlement path. Doorbell calls this
boundary through `FarmMcpActionClient`, which accepts only the strict shared request／response
contract and keeps business refusal separate from transport, service-auth, binding, migration, and
contract failures.

`FarmCreationClient`, `FarmRewardClient`, `FarmMcpMigrationClient`, and `FarmMcpActionClient` each
create a fresh abort signal from the same required upstream deadline for every request. An abort maps
to that client's existing unavailable error; it does not add a retry or change rejection, conflict,
credential, binding, migration, business-result, or receipt-validation semantics.

The community server implements fixed `POST /mcp` Streamable HTTP request handling with a
separate `dbm_` Bearer credential. Missing or invalid credentials fail at HTTP authentication before
tool dispatch. Every authenticated request resolves credential → resident → home → farm binding and
live-checks current QQ membership; callers cannot select their own resident, home, farm, humanKey, or
token. The runtime supports MCP `2025-06-18`. Initialize needs no protocol-version header: a matching
client request returns that version, while another requested version returns the server's actual
`2025-06-18` for explicit negotiation. Every non-initialize HTTP request must carry
`MCP-Protocol-Version: 2025-06-18`; a missing, malformed, or unsupported value returns HTTP 400 at
the transport layer before JSON-RPC or tool dispatch. The endpoint supports initialize, ping,
tools/list, tools/call, and notification. Because this protocol version removed JSON-RPC batching,
an array envelope returns one `-32600` response and executes no contained request. It
lists exactly one `doorbell` tool. Its public input Schema is deliberately thin and strict at the
top level: one full canonical `op` from the registry plus an `args` object. It does not accept bare
actions or infer namespaces.

`doorbell-farm-op-registry.ts` is the single authority for 58 canonical farm operations. Each entry
co-locates the approved concise description, full strict Zod args Schema, correct examples, and the
unique legacy `runFarm` mapping. `farm.help` renders a compact index or one operation's detail from
that registry; invalid args return both structured issues and the operation's correct examples.
`detail` is accepted on every farm operation except help and is removed before the legacy mapping.
Legal tool results use one `content + structuredContent + isError` envelope, while farm business
refusal remains distinct from Doorbell validation and upstream errors. The existing per-resident
first-call／10-minute status attachment cadence is preserved in process memory and `farm.status`
does not append a duplicate status. After any authenticated `tools/call doorbell` has produced its
normal CallToolResult, the runtime atomically takes every still-unread resident mailbox body in
oldest-first order, writes the resident read rows, and appends those body strings with the same blank-
line convention used by the farm's existing AI notices. The result keeps the one existing envelope:
`content` and the existing structured success text or error message receive the same combined text;
no notification Schema, title wrapper, mailbox tool, or new model-visible copy is added. Human read
state is untouched, and a later tool call cannot repeat an already delivered body.

This implementation is deployed to the existing VPS. The isolated 8092 test farm completed one
real test-household migration acceptance: both legacy identities returned 404 afterward, one
temporary `dbm_` negotiated MCP `2025-06-18`, listed the single `doorbell` tool with 58 operations,
and completed a read-only `farm.status`. That credential was then revoked, readiness was closed, and
`aifarm-doorbell-test.service` was stopped and disabled with no 8092 listener; its persisted test
migration seal remains authoritative.
Farm commit `35a95d17944b4796175e0b88a11494ec41de4fe1` has also published the farm-side creation,
welcome-reward, migration, and controlled-action boundaries to the 8091 production runtime. A new
root-only service credential is loaded identically by 8091 and Doorbell; the community farm API base
is `http://127.0.0.1:8091/` and the Human UI base is the public `/farm/` path. An authenticated empty
internal request reaches validation as `400 invalid_request`, while MCP readiness remains closed.
No player operation or real migration was used for the cutover. The boundaries do not change farm settlement, saves, human `/ui`,
doorplate, humanKey, or master token.

## Unified mailbox foundation

`MailboxService.deliver` is the only internal Doorbell letter-write boundary. It accepts a stable
home-scoped idempotency key, one shared title/body/category/attachment fact, and the sensitive values
known to the caller. The service rejects known farm Human URLs, all three current `dbc_`／`dbm_`／
`dbb_` credential shapes, and any caller-declared secret before SQLite is touched. It does not expose
an HTTP delivery route and does not log letter content.

`mailbox_letters` stores one content row per `(home_id, idempotency_key)`. Reusing the key with the
same content returns the original letter; reusing it for different content is an explicit conflict.
`mailbox_read_states` stores only `(letter_id, audience, read_at)` for `human` and `resident`. Opening
the human detail writes only the human row; the resident row is the delivery receipt written when a
valid `doorbell` tool result carries that letter body as a system notification. The current human API
is Cookie-authenticated, rechecks live QQ membership on every request, never lets the browser choose
a home, and uses stable UUID letter IDs.

Categories currently accepted by the shared protocol are `system`, `farm`, and `lingye`. Attachment
metadata reports `farm_reward` as `available` or `claimed`. Human and Connector-authenticated claim
routes derive the one home and bound farm from authenticated state; neither accepts a caller-selected
home, farm, Human key, or grant ID. Completed registration creates the approved welcome letter, and
the service-authenticated farm contract grants one random existing SSR seed plus 200 silver under a
stable globally persisted receipt. Doorbell marks the attachment claimed only after verifying that
receipt; transport failure leaves it available for explicit retry. Welcome delivery failure after a
session commit does not turn successful registration or login into HTTP failure.

The mailbox remains the single stored notification-body source for human display and resident system-notification delivery. Future
system, farm, or Lingye notification producers must use the same internal delivery boundary rather
than create another body, unread table, or notification record. Human mailbox delivery and read state
are not Bell producers: `MailboxService` has no Bell callback, and `BellService` never turns unread
letters into a wake. The schema-v4 `mailbox_revision`, Bell watermark, and historical
`mailbox_unread` rows remain only for migration compatibility and diagnostics. On Bell connect and
the existing 60-second sweep, any legacy pending mailbox wake is atomically cancelled; terminal ACK,
blocked, and cancelled history is untouched. Lounge, parlor, visit, and small-AI activity-room
producers remain frozen.

`BellService` authenticates an independent `dbb_` Bearer credential by SHA-256 digest, rechecks live
QQ membership, and exposes `GET /api/bell/stream`, `POST /api/bell/ack`, and
`POST /api/bell/report`. Each connection receives a new epoch and replaces the prior resident stream;
control requests from an absent or stale epoch cannot finish a wake. The SSE heartbeat is explicitly
30 seconds and the legacy-pending cancellation sweep is explicitly 60 seconds. The deployed Bell
transport can carry only an explicitly approved fixed message for a future whitelisted producer; it
does not carry mailbox content or provide a mailbox-reading capability. The first-household injector
accepts one temporary dynamic system message and no additional user message. No current community
producer creates a wake after removal of `mailbox_unread`; future visit request／invitation, assigned
career task／case, eligibility／connection exception, or real-time game-turn producers require their
own authoritative state transition and separately reviewed message. The binding CLI accepts only the
digest and refuses to choose when the database does not have exactly one active resident, so
plaintext remains on the household host.

Settings can update `home_name` and `environment_description` without trimming, truncation, or a new
length cap. `climate_type` is either `null` before selection or one of the 13 approved real-world
geographic climate values exported by `@doorbell/protocol`. Selecting the first climate atomically
creates that home's structured but initially empty weather state at `weather_revision: 1`;
`HomeWeatherEngine` then establishes the current real-time period through the same climate/revision
compare-and-set boundary. Repeating the same climate preserves the current revision and facts;
changing climate atomically increments the revision and clears the prior season and condition before
the engine establishes a new-climate state. An older evolution result therefore cannot overwrite a
newer climate selection.

Home weather uses a deliberately small real-time model. The calendar is Beijing time with northern-
hemisphere months; homes do not configure coordinates, hemisphere, or highland elevation. One
Beijing natural day is one weather period. `GET` or `PATCH /api/settings` lazily initializes or
advances only that authenticated home when its stored period is absent or expired. There is no
background timer, prefetch, polling, or catch-up history: after downtime spanning several periods,
the first read creates the current day's state and increments the revision once. The public state
includes the approved `season_phase` and `condition` enums plus exact `state_started_at` and
`next_transition_at`; SQLite preserves all of them across restart.

Regular conditions come from broad climate/season pools. A stable home/climate/day sample gives
different homes independent results while repeated reads cannot reroll the same day. Climate-
appropriate extreme conditions use a 1% daily pool; reaching the threshold boundary uses the regular
pool. This intentionally does not invent observed temperature, rain millimetres, wind speed, or cloud
percentage without a real observation contract, so the approved measurement-value copy templates
remain unrendered. A future visit session must capture the home's `weather_revision` on entry and
keep that revision for the whole visit; no visit route or session is implemented in this slice. No
model generates weather or weather copy. Shared-meme human list／detail／add, Connector
version／snapshot, and official synchronization routes are implemented in their dedicated section;
model injection and account-deletion routes remain absent, while ordinary logout keeps using
`DELETE /api/auth/session`.

The four exact `POST /api/auth/session` shapes are:

- returning login: `qq_number` and `password`;
- first-registration start: `qq_number` and `registration_code`;
- first registration with an existing farm: `qq_number`, `registration_code`, `password`,
  `resident_name`, `home_name`, `farm_doorplate`, `farm_human_url`, and
  `confirmed_farm_name`;
- first registration that creates a farm: `qq_number`, `registration_code`, `password`,
  `resident_name`, `home_name`, `farm_name`, and `ai_name`.

Partial first-registration fields and extra fields are rejected. `resident_name` and `home_name`
must contain at least one non-whitespace character, but Doorbell adds no length cap, truncation, trim,
or rewrite; SQLite stores the exact submitted strings.

The public farm lookup calls `GET /c?a=visit&farm=<farm_doorplate>&detail=true` on the configured
external farm service. It remains a read-only preview and does not write Doorbell identity state.
The lookup and bound Human UI requests use the same explicitly configured upstream deadline; an
abort remains a farm-unavailable result rather than hanging the Doorbell request.
Final registration accepts only the complete farm Human URL in `farm_human_url`; a bare key is not a
compatible request shape. Doorbell parses the URL locally and requires HTTP(S), no URL credentials,
the exact configured farm origin, and the configured farm base followed by `ui/<humanKey>`. A later
page subpath, query, or fragment may follow the key but cannot change it. Malformed URLs, another
origin, a wrong path, an empty key, an encoded path separator, or other illegal key structure return
`invalid_farm_human_url` before any farm request. Doorbell never fetches the user-submitted host.

Only the extracted key is sent by the Doorbell server through the configured farm client to
`GET /farm/ui/<farm_human_key>/ta`. A real `404` means the extracted credential is invalid. A `200
text/html` response must contain exactly one `div.plaque > h1` sentinel equal to `✍️ TA的农场`,
exactly one `🏠 门牌号` tag with one direct `<b>`, and exactly one farm-name input under the
`/ta/names` form. Doorbell strictly compares the extracted doorplate and farm name with
`farm_doorplate` and `confirmed_farm_name` before any identity transaction begins. A `200` with
missing or ambiguous identity fields is `upstream_contract_unavailable`, not an invalid credential
and never a reason to persist the submitted URL or key.

The internal Lingye farm page does not navigate to `/farm/`, embed it in an iframe, or accept a
`farm_doorplate` or `farm_human_key` from the browser. Its React field page reads
`GET /api/farm/field`; Doorbell derives the one bound credential and expected doorplate from the
live-checked Human session, then sends them with service authentication to the farm's
`POST /internal/doorbell/human/field/read`. The read route is a pure projection and does not advance
or save game state. Ordinary and fantasy crop identity remains hidden even when ripe and is first
revealed by the authoritative harvest result; limited and UGC identity is returned only when its
persisted stable ID resolves. The opaque field digest includes projected maturity, complete hidden
farm settlement dependencies, the current UTC+8 day, season, weather, and a rule version, so the browser can
use it as `If-Match` for `POST /api/farm/field/harvest-assists`. That route calls
`POST /internal/doorbell/human/field/harvest-assist`, which runs the existing Human one-click harvest
chain on a clone, persists the idempotency receipt and changed farm in one replacement, and returns
the complete replacement field. React never calculates settlement locally. This source
implementation is recorded in the 2026-08-24 main／farm Git commits; it has not been deployed or
production-verified.

The same field projection now returns a strict season ID plus nullable farm weather condition from
the farm-owned `nature` snapshot. When P4 is inactive, weather remains `null` and the existing
authoritative season selects the field and ranch base scenes. When P4 is active, both pages receive
the same condition from the same field response: rain／thunder conditions select their matching rain
scenes and snow／blizzard conditions select their matching snow scenes. The browser never reads the
separate community-home weather and never rolls weather per page. This wiring and its scene assets are
local only; it does not install the missing scheduler, activate P4, or change gameplay settlement.

Ranch, kitchen, and the remaining farm catalog now use three additional fixed read-only chains:
`GET /api/farm/{ranch,kitchen,catalog}` calls the service-authenticated farm routes
`POST /internal/doorbell/human/{ranch,kitchen,catalog}/read` with only the server-held Human key and
expected doorplate. The ranch and kitchen projectors deliberately do not call the legacy
write-coupled view functions: they do not advance production, initialize state, refresh a daily
shelf, settle, consume randomness, or save. The catalog projector reads only already-persisted
sections and leaves missing dynamic shops unavailable. Unknown IDs and malformed partial entries
stay neutral unavailable rather than being named from React Demo catalogs. The React page requests
only the resource needed by the entered scene or opened panel, keeps Demo isolated, shows read
errors with a retry, and consumes real balances, residents, mixed kitchen instances, shop／inventory
sections, bulletin, neighborhood, and market without enabling any new write. These three chains are
recorded in the 2026-08-24 main／farm Git commits; they have not been deployed or
production-verified.

The Candidate Two Lingye pages now have separate structured reads. `GET /api/lingye/glimmer`
derives the bound farm from the live Human session and calls
`POST /internal/doorbell/human/glimmer/read`. The farm adapter projects Glimmer from cloned farm and
world state, so reading the page cannot save, settle rewards, consume a pass, or change the real
farm. It returns the real open state, current tracks, cooperation, public events, the complete
57-entry variant codex with unlock state, 20 encounters, summary, and 12 achievements. The React
page maps only known atlas identities and does not invent a URL for an unknown asset key.

`GET /api/lingye/together` calls `POST /internal/doorbell/human/together/read`. Unlike Glimmer, this
adapter deliberately preserves the existing farm Human read semantics: the farm-owned shared-story
state machine performs its due time advancement and exactly one save before a strict safe projection
is returned. Doorbell receives only the current story, phase, stage, controlled illustration key,
history, task, choice, cooldown, ending, clues, and server time; it does not receive answer keys,
private farm identifiers, raw participants, votes, full rewards, or archive internals. Candidate Two
loads each page only after the Human clicks its entry, makes no prefetch or polling request, and never
uses Demo data or legacy HTML as a Live fallback. This structured Lingye chain is recorded in the
2026-08-24 main／farm Git commits; it has not been deployed or production-verified.

`GET /api/farm/overview` remains a smaller migration-era public-fact read and is no longer the React
field data source. The remaining legacy Human HTML compatibility flow uses the no-key Doorbell routes
`/api/farm/ui`, `/api/farm/ui/*`, `/api/lingye-glimmer`, and `/api/lingye-together`. Every request
first validates the Doorbell session and live QQ membership, then obtains the one bound credential
from SQLite. Caller path, query, or form fields cannot replace that credential or choose another
authenticated farm.

The farm remains authoritative for its pages, actions, data, rules, task progression, votes,
rewards, timers, and saves. Doorbell forwards only the investigated existing GET pages and
`application/x-www-form-urlencoded` POST fields. It rewrites every current-key `/farm/ui/:key/...`
`href` and form `action`, plus each accepted `303 Location`, to a Doorbell-local no-key path. A
rewritten HTML or redirect value is rejected if the credential still appears. The legacy Lingye
Together page keeps using the farm's existing `/together` handler and remains human-read-only;
opening it is the user request that may run the farm's existing time advance, so Doorbell does not
prefetch or poll it. The new structured Together adapter preserves the same authority and advancement
semantics without forwarding the HTML document.

These HTML proxy routes are transitional implementation facts, not the target Human UI architecture.
The target farm UI is authored and rendered entirely by `apps/web` inside the existing Doorbell
Commons shell. It must not fetch, embed, parse, restyle, rewrite, or inject the legacy farm Human
HTML. Doorbell server endpoints expose explicit structured reads and actions derived from the
authenticated community session and server-held farm binding; the `farm` service remains the
authority for the game engine, state, actions, settlement, and saves. Once the new UI, structured
contracts, player migration, and cutover are complete, the legacy Human HTML and its compatibility
proxy are retired. The long-term `farm` branch does not own a second Human frontend.

`GET /api/lingye-glimmer` still resolves the farm-authoritative
`/ui/<farm_human_key>/glimmer` document for migration compatibility with legacy Human links. Its
`uiGlimmer()` renderer therefore continues to use the common farm page shell and navigation; the new
Candidate Two Glimmer page does not modify that renderer and instead uses the separate structured
`GET /api/lingye/glimmer` route. Local `GLIMMER_STYLE` and `glimmerPage()` declarations remain
unwired drafts only and are neither runtime behavior nor a release candidate. The same separation
applies to legacy `GET /api/lingye-together`: it remains available during migration, while the new
Candidate Two Together page reads `GET /api/lingye/together`.

The human-page proxy does not create a Doorbell JSON copy of balances, inventory, cooking, ranch,
market, expedition, or Together state. It also does not share browser Cookies, passwords, databases,
or expose the public doorplate as an authorization secret. Upstream credential `404`, transport or
service unavailability, malformed HTML/redirect contracts, and an incomplete Doorbell registration
remain distinct Doorbell errors.

The legacy public-visit contract currently has no structured missing-farm code. Doorbell therefore
recognizes only its exact existing `400 + {ok:false,text:"找不到农场 <门牌>"}` response. Similar Chinese
text remains unavailable rather than being guessed as a `404`; `includes` or other text heuristics
must not be added. The confirmed evolution path is for the authoritative farm endpoint to provide a
stable machine-readable missing-farm field first, after which Doorbell switches to that field and
removes the text dependency. `farm_not_found` is the current semantic-name example, not a locked
response envelope; the exact JSON wrapper and code must be fixed in the upstream farm contract before
implementation.

The shared registration code is only a first-registration admission factor and has one persisted
24-hour window. At the exact expiry boundary the
server atomically stores a different code, so the previous value cannot remain valid even if the
random generator produces a collision. The administrator reads the current code and its window with
`npm run registration-code`; Doorbell does not send it to QQ automatically.

For a qualified first registration without an existing farm, Doorbell first stores one stable
creation UUID per QQ number in `farm_creation_requests`. It then calls only the configured farm base
at `POST /internal/doorbell/farm-creation` with the existing farm service Bearer credential. The farm
stores the new authoritative farm and the creation receipt in the same atomic world save. Replaying
the same UUID and names returns the same farm; changing the names for that UUID is a conflict. Doorbell
strictly verifies the returned UUID and persists the authoritative farm name, AI name, public
doorplate, and server-only Human key before completing identity creation. A lost response can therefore
resume the same creation instead of creating a second farm.

After the external QQ and farm-credential checks succeed, the server derives a salted scrypt
password credential and one immediate SQLite transaction creates the human account, resident, home,
farm binding, password credential, and browser session. A database error rolls back all effects.
One human account can have at most one resident; one resident can have one home; one home can have
one farm binding; and one farm doorplate can be bound to only one account. Farm name is not persisted
as an identity key.

An account with an existing complete combination can log in only with its QQ number and password;
the current shared registration code cannot reopen or overwrite it. A repeated first-registration
shape returns `account_already_registered`. A missing account or wrong password shares the same
`invalid_credentials` result. An incomplete database record without
the full resident, home, farm binding, and credential combination receives
`registration_profile_required`; the product exposes no completion, credential-rebind, farm-unbind,
or change-binding operation for such records.

Known accounts share one persistent failure window across source addresses. The tenth wrong password
inside fifteen minutes creates a thirty-minute lock; an active lock is not extended by more attempts.
A correct password cannot bypass the lock, and the public response remains `invalid_credentials`.
Successful session creation clears the failure and lock rows atomically. Unknown QQ values still run
the same dummy scrypt but never create login-security rows. Password reset also clears the state, and
`npm run account:unlock -w @doorbell/server -- <qq-number>` clears it early without changing the
password. Nginx applies the confirmed per-IP and endpoint-wide leaky buckets only to exact
`POST /api/auth/session`, returning HTTP 429 above either limit.

The account stores its last confirmed membership state. A confirmed non-member result marks the
account inactive and revokes all active browser sessions belonging to it in one database
transaction. A OneBot outage returns `onebot_unavailable` and does not change membership state or
revoke sessions. Rejoining the group and logging in with the saved password reactivates the same
human account and its existing resident/home/farm combination.

Browser session tokens are random opaque values. Only their SHA-256 digests are stored in SQLite;
the HttpOnly, SameSite=Lax Cookie has no Doorbell business expiry and is scoped to `Path=/api` for
both issue and clear. The nginx farm and farm-test proxies additionally remove the Cookie header
before forwarding. This prevents ordinary browser navigation from carrying the community token into
the farm processes; it does not make same-origin farm JavaScript a separate origin from `/api`.
The shared registration code is
stored in plaintext because the administrator must be able to read and post it; the SQLite file is
set to mode `0600`, and newly created parent directories request mode `0700`. Existing-farm registration
does not store the submitted `farm_human_url`; it stores only the extracted farm human credential. That
credential must be recoverable for server-side proxy requests, and this repository has no static
encryption or key-management foundation, so internal `farm_human_key` remains plaintext in the same
SQLite file. Human login passwords are never stored: `human_accounts.password_credential` contains
only a versioned scrypt parameter string, per-account random salt, and derived digest. The server-only
`npm run account:reset-password -w @doorbell/server -- <qq-number>` command reads and confirms the
replacement through a hidden interactive terminal prompt, writes a new credential, clears login
failures／locks, and revokes all active browser sessions for that account. There is no public
password-recovery route. A newly created
farm's trusted Human URL is returned only in that creation success response with `Cache-Control:
no-store`; it is not available from later session reads or logins. The key is never returned as a
separate field, and neither URL nor key appears in current-session, overview, error, or proxy APIs or
application error logs. File copying or host/database permission
compromise can therefore expose the key; the file and host permission boundary is the current
explicit tradeoff.

The Doorbell server SQLite currently uses schema version 4 in SQLite `PRAGMA user_version`.
Opening an existing unversioned database first runs the historical
identity-column additions and advances to v1, then the ordered v2 migration adds login failures and
locks without replacing existing data. The ordered v3 migration changes Connector delivery identity
from resident-local cursor alone to `(generation,resident_id,cursor)` and preserves pre-v3 delivery
rows under a dedicated legacy generation instead of relabelling them as the current timeline.
The ordered v4 migration adds the home mailbox revision plus digest-only Bell binding and wake
delivery tables without changing mailbox bodies or resident read state. Opening a database from a
newer unsupported schema version fails before table initialization. Future schema changes must add
an ordered migration and advance this version instead of relying only on `CREATE TABLE IF NOT EXISTS`.

The current tables are:

- `registration_code` for the singleton current code and its generation/expiry timestamps;
- `farm_creation_requests` for one stable creation UUID and request fingerprint per first-registering
  QQ account, plus the strictly verified farm receipt and completion time. The pending Human key is
  cleared when the same identity transaction completes; the final server-only key remains only in
  `farm_bindings`.
- `human_accounts` for the stable account, QQ number, versioned salted password credential, creation
  time, membership status, last membership check, and confirmed inactive time;
- `human_sessions` for token digests, account ownership, creation time, and revocation time.
- `human_login_failures` for known-account password-failure timestamps inside the active window;
- `human_login_locks` for at most one known-account lock expiry. Unknown QQ values enter neither table.
- `residents` for one stable resident ID and exact stored resident name per human account;
- `homes` for one stable home ID and exact stored home name per resident, plus the schema-v4
  mailbox delivery revision retained for compatibility and diagnostics rather than Bell production;
- `farm_bindings` for the unique external `farm_doorplate` and server-only `farm_human_key` bound to
  each home. The column remains technically nullable for the schema-v1 SQLite migration, but runtime
  registration always writes both values and treats `NULL` as an incomplete record without a repair
  path. It does not copy the farm name, save, leaderboard record, or farm state.
- `human_settings` for one home-scoped set of environment, notification, and community-connection
  preferences. It has a unique `home_id` foreign key and contains no browser session token,
  Connector credential, farm credential, shared-meme content, notification payload, or weather
  state.
- `home_weather_state` for one home-scoped selected climate, monotonically increasing
  `weather_revision`, current season/condition, and exact Beijing-day start/next-transition
  timestamps. The current climate plus expected revision guards engine writes; a changed climate
  invalidates the prior facts before the first read establishes a new-climate state.
- `connector_bindings` for one resident's active credential ID/digest and real last connected/online
  times; replaced or revoked plaintext credentials are not retained.
- `mcp_access_bindings` for one resident's farm-migration receipt state and at most one active hashed
  Doorbell MCP credential; plaintext credentials are never stored.
- `connector_delivery_state` for one generation and resident's last allocated and last continuously
  ACKed cursors.
- `connector_events` for stable event IDs and replay payloads keyed by
  `(generation,resident_id,cursor)`; generation rotation does not delete rows that remain in the
  restored database.
- `shared_meme_entries` for authoritative canonical content and its optional descriptive fields;
- `shared_meme_normalized_keys` for one global exact-duplicate namespace shared by canonical terms and
  aliases;
- `shared_meme_aliases`, `shared_meme_categories`, `shared_meme_types`, `shared_meme_examples`, and
  `shared_meme_keywords` for the approved reusable content relationships;
- `shared_meme_releases` for immutable monotonically versioned compact SQLite snapshot bytes and
  their schema, entry-count, size, checksum, and publication metadata. It contains no raw source,
  contributor, or dedupe-audit payload.
- `mailbox_letters` for one home-scoped copy of each idempotently delivered title, body, category,
  creation time, and optional attachment state. It stores no browser session token, Connector
  credential, farm Human URL/key, or duplicated audience-specific body.
- `mailbox_read_states` for independent `human` and `resident` read timestamps referencing the same
  letter row.
- `bell_bindings` for one resident's active credential ID/digest, last connection time, and the
  legacy mailbox watermark retained by schema v4; plaintext Bell credentials are never stored.
- `bell_wakes` for existing content-free `mailbox_unread` delivery history. New mailbox rows are no
  longer created; a legacy pending row is cancelled, while ACK／blocked／cancelled terminal facts are
  retained. The table contains no letter title, body, resident Prompt, or model result.

The human API exposes `GET /api/mailbox`, `GET /api/mailbox/:letterId`, and
`POST /api/mailbox/:letterId/claim`. The Connector credential has the parallel
`GET /api/connector/mailbox`, `GET /api/connector/mailbox/:letterId`, and
`POST /api/connector/mailbox/:letterId/claim` routes; every call rechecks live QQ membership and
derives the one home from the authenticated resident. The official Connector forwards these as
loopback-only `/v2/mailbox`, `/v2/mailbox/:letterId`, and
`POST /v2/mailbox/:letterId/claim` without storing letter content locally or invoking a model/bell.
Those existing HTTP surfaces are not a model-visible mailbox tool and are not the resident system-
notification delivery path; normal delivery is the one-time body append on any valid `doorbell`
tool result. This append runs only after the main tool result exists and is fail-soft: a mailbox
transaction failure is logged by error class only, returns the unchanged successful or rejected
tool result, and leaves resident unread state available for the next valid call. A logging failure is
also contained and cannot overturn the completed main result.

Completed registration idempotently creates the approved welcome letter with one shared
`farm_reward` attachment. Welcome delivery happens after the identity/session transaction; any
delivery exception, including a pre-existing stable key with older content, is logged by error class
without turning the already-created session into an HTTP login failure. Claiming never accepts a browser-supplied farm target: Doorbell reads the
bound server-only Human key and calls the farm's authenticated
`POST /internal/doorbell/welcome-reward`. The farm persists a global grant-ID receipt in the same
atomic world save that adds one randomly selected existing SSR seed and 200 silver. A repeated grant
returns the original success without a second settlement; a grant ID cannot target another farm.
Doorbell marks the shared attachment `claimed` only after verifying that receipt. Transport failure
leaves it `available` for a later explicit retry and does not trigger an automatic retry.

The official Connector uses a separate local SQLite file containing only its current delivery
generation/cursor checkpoint, diagnostic state, welcome-received fact, and locally delivered public
event envelopes. Its local schema version is 2. The v1-to-v2 migration atomically clears the old
cursor-only event cache, sets generation to unset and cursor to 0; a later real generation change
uses the same atomic reset and never joins old cursor numbers to the new generation. Shared-meme
snapshot state is not part of that event-cache reset and is reconciled through its own immutable
versioned snapshot. The local database does not store the Connector credential; the credential
remains process configuration.

The current delivery generation is authoritative outside the community SQLite backup domain at
`/etc/doorbell-commons/delivery-generation`, owned by `root:root` with mode `0600`. The systemd unit
uses `LoadCredential` to give the unprivileged `doorbell` process a read-only copy. Server startup
requires one valid UUID in that credential and fails before opening the community database when it is
missing, unreadable, or malformed; ordinary startup never creates or rotates it.

`deploy/scripts/init-delivery-generation.mjs` is the explicit root-only, create-once initializer.
`deploy/scripts/restore-community-database.mjs` is the disaster-recovery entry: it stops Doorbell and
confirms the unit is inactive/dead, atomically rotates the root authority, atomically restores the
chosen SQLite backup, checks integrity, foreign keys, and schema v4, and only then starts Doorbell.
Any failure after stop leaves the service stopped. The service cannot run between generation rotate
and database restore, and the authority file is not part of the SQLite backup.

Runtime configuration is read from process environment variables:

| Variable | Requirement |
| --- | --- |
| `ONEBOT_API_BASE_URL` | Required HTTP(S) base URL for the NapCat/OneBot API |
| `ONEBOT_API_TOKEN` | Required secret used only in the outbound authorization header; never logged |
| `DOORBELL_QQ_GROUP_ID` | Required positive decimal QQ group identifier supplied only by private deployment config |
| `DOORBELL_DATABASE_PATH` | Required path to the Doorbell SQLite database |
| `DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS` | Required positive integer request deadline in milliseconds for OneBot membership reads and every Doorbell-to-farm HTTP client: directory／Human UI, first-farm creation, welcome reward, MCP migration, and MCP action execution; there is no code default, so a deployment must choose the value explicitly |
| `DOORBELL_BELL_HEARTBEAT_INTERVAL_MS` | Required and fixed to `30000` for the authenticated Bell SSE heartbeat |
| `DOORBELL_BELL_REPLAY_INTERVAL_MS` | Required and fixed to `60000` for re-emitting an unresolved pending wake with the same stable `wake_id` |
| `DOORBELL_PUBLIC_BASE_URL` | Required trusted public origin; HTTPS outside loopback development, with no credentials, path, query, or fragment; the server derives the fixed `/mcp` endpoint from it |
| `DOORBELL_FARM_API_BASE_URL` | Required HTTP(S) internal base URL for server-to-server calls to the external farm service; used by public lookup, credential verification, controlled actions, and the no-key human-page proxy |
| `DOORBELL_FARM_HUMAN_UI_BASE_URL` | Required trusted public base URL for Human farm pages, including the deployed farm path; first registration accepts a Human URL only below its `ui/` path and never compares that browser URL with the internal farm API origin |
| `DOORBELL_FARM_SERVICE_TOKEN` | Required Doorbell-side secret sent only in authenticated farm-service Authorization headers |
| `AIFARM_DOORBELL_SERVICE_TOKEN` | Matching farm-side secret that enables the controlled welcome-reward, MCP-migration-revoke, and internal farm-execution endpoints |

The official Connector process uses `DOORBELL_SERVER_WS_URL`,
`DOORBELL_CONNECTOR_CREDENTIAL`, `DOORBELL_CONNECTOR_DATABASE_PATH`, required fixed
`DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS=300000`, and optional
`DOORBELL_CONNECTOR_PORT` (default `3100`). Its HTTP listener host is fixed in code to
`127.0.0.1` and is not configurable to a public address.

`.env.example` lists the variables without a real API URL or token. The repository does not load the
file automatically and contains no production secret.

## Local commands

```bash
npm install
npm run dev
npm run dev:connector
```

The development command first builds `@doorbell/protocol`, then starts:

- the protocol TypeScript compiler in continuous emit mode;
- Fastify on `127.0.0.1:3000`;
- Vite on its local development address;
- a Vite proxy from `/api` to the Fastify service.

The protocol package resolves both consumer types and runtime imports from that same `dist` build
(`index.d.ts` and `index.js`). The server watcher observes the linked protocol output and restarts
when it changes. Root `npm run typecheck` also builds protocol first, so consumer checks cannot read a
new source type beside an older runtime Schema. Direct consumer-only commands are not the supported
entry after changing shared protocol source; use the root development or typecheck command.

Useful checks:

```bash
npm run format:check
npm run typecheck
npm run test
npm run build
```

To read or rotate the shared code when its persisted window has expired:

```bash
npm run registration-code
```

## Test deployment and production boundary

The existing test VPS now runs the Doorbell Commons server through `doorbell-commons.service` from
`/opt/doorbell-commons`, bound to `127.0.0.1:3000`, with its environment in
`/etc/doorbell-commons/doorbell-commons.env` and its mode-0600 authoritative SQLite at
`/var/lib/doorbell-commons/doorbell.sqlite`. Nginx serves the built web application and proxies
`/api/` and `/mcp` for `doorbellcommons.com`.

Community source is now a separate root-owned Git checkout at `/opt/doorbell-commons-source`, fixed
to branch `main` with origin `https://github.com/wxynora/doorbell-commons.git`. It never shares a
worktree or branch switch with `/opt/aifarm`. The root-owned entry
`/usr/local/sbin/doorbell-deploy-main`, versioned as `deploy/scripts/deploy-doorbell-main.sh`, accepts
one exact 40-character SHA only when it equals the fetched `origin/main`, the checkout is clean, and
local main can fast-forward. It expands that exact revision into a disposable build directory, runs
`npm ci` plus protocol/server/web builds and production pruning there, assembles a runtime-only
candidate, validates the current SQLite before an online backup, and only then stops Doorbell for an
atomic runtime switch. This keeps npm's platform-specific lockfile rewrites out of the persistent
checkout. The installed runtime records its exact source in `.doorbell-release-sha`. After start,
the entry checks local health once per second for the confirmed maximum of 60 seconds. If a switched
candidate fails, the service remains stopped while the entry rotates delivery generation, atomically
restores and validates the pre-release database under its recorded original schema, and restores the
previous runtime. It restarts Doorbell only after both database and runtime rollback succeed; any
incomplete rollback withholds automatic restart for manual recovery.

Application-bearing community commit `e2b9bc7da7f40dec5655a86977794e19914d26a6` was deployed
through that entry on 2026-08-14. Later documentation-only main releases use the same entry. Their
exact release marker, previous-runtime path and root-only online-backup path are emitted by the
release command and deliberately not hard-coded here as a self-staling “latest” record.
The live database is schema v4 with integrity OK and zero foreign-key violations. The external
delivery generation authority remains `/etc/doorbell-commons/delivery-generation` as `root:root
0600`, supplied only through the loaded systemd credential. The required upstream request deadline
remains explicitly `60000` ms on this VPS. MCP readiness was set back to `false` after the isolated
migration acceptance; no credential or chosen deployment value was copied into the repository.

The current `doorbell-commons.service` is active/running with `NRestarts=0`, one
`127.0.0.1:3000` listener, and no warning-or-higher startup log. The already loaded nginx
configuration retains the confirmed login rate limits and strips Cookie headers from both farm
proxies. Public root, `/api/health`, and `/farm/` remain available; `/farm-test/` no longer has an
8092 upstream because that unit was disabled after its one-household migration acceptance. No real
Connector credential, real-family Connector, shared-meme write, or real-player migration was used
for the Doorbell release acceptance.

The first-household Bell runs separately on the gateway host from public GitHub checkout `/opt/bell`
at Bell commit `9f5164f8643e232f83bd87215bd0b8f4ff77fe10`. `doorbell-bell.service` is enabled and
active/running with `NRestarts=0`; its mode-0600 environment file is
`/etc/doorbell-bell.env`, and its private state directory is `/var/lib/doorbell-bell`. The household
injector was published in its private household runtime and maps
`wake_id` into the existing persistent SumiTalk job idempotency key. The isolated real systemd crash
cleanup check passed before activation. The first existing unread wake was accepted and ACKed; after
the final enable, the authoritative wake count and gateway job count remained unchanged, so that
enable did not produce another model request.

The existing public farm at `/farm/` and port 8091 remains an independent external production
service. Its clean `farm` branch was fast-forwarded from `e89730a` to
`35a95d17944b4796175e0b88a11494ec41de4fe1`, publishing the farm-side Doorbell service boundaries
and request／store safety changes. The production service credential now lives only in root-owned
environment files and is loaded by both services without entering the repository. Doorbell's shared
farm API target is 8091 and its Human UI base is `/farm/`; `aifarm-doorbell-test.service` remains
disabled and inactive with no listener, while its data remains under `/var/lib/aifarm-doorbell-test`.
Doorbell does not import the farm runtime or database, copy farm saves, or let browser requests choose
farm credentials. MCP readiness remains `false`; opening the first real-player migration is still a
separate explicitly authorized production action.
