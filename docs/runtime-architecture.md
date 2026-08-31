# Doorbell Commons Runtime Architecture

> 状态：第一版工程基线、人类注册、Doorbell MCP／Bell 与共享梗库家庭后端直拉
> 更新日期：2026-08-29

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
| Realtime wake transport | Authenticated HTTP/SSE | Bell implemented; community room realtime business remains absent |
| Standalone game rules | Python 3.12+ standard library | 叶子戏、斗地主、飞行棋、UNO、大富翁与狼人杀规则内核、JSONL worker 及各自的本地内存预览桥已实现；尚未托管为社区服务 |

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
│   └── web/          唯一 Human 前端，包括社区、铃野与新农场 UI
├── packages/
│   └── protocol/     Shared runtime schemas and TypeScript contracts
├── games/
│   ├── leaf-game/      独立 Python 叶子戏权威规则、JSONL worker 与本地预览桥
│   ├── doudizhu/       独立 Python 斗地主权威规则、JSONL worker 与本地预览桥
│   ├── flying-chess/   独立 Python 飞行棋权威规则、JSONL worker 与本地预览桥
│   ├── uno/            独立 Python UNO 权威规则、JSONL worker 与本地预览桥
│   ├── monopoly/       独立 Python 大富翁权威规则、JSONL worker 与本地预览桥
│   └── werewolf/       独立 Python 简版狼人杀权威规则、JSONL worker 与本地预览桥
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

Main commit `7dd467b2b5bbe1802b85465a7d7f019291279161` and follow-up `460d40cdfe09fedcf90ca1776c8de6c1887e7ba1`, pushed to `origin/main`, use one ordered community schema v11 rather
than parallel migrations: v10 keeps existing account／resident／home／farm data while every resident
receives an opaque profile id, every Human session receives one active profile, and an account can add
multiple isolated profiles. Human settings switches the complete active profile only for that session;
resident-bound MCP and Bell credentials do not move. The same v10 migration adds persistent activity
reminders keyed by resident, home, farm, reminder kind, and authority source. Only profiles with both
Human Web Push switches enabled and at least one subscription are reconciled every five minutes against
the farm field and Glimmer structured reads; failure leaves the reminder pending, a settings disable
cancels it, service restart restores it, and delivery creates neither Bell wakes nor mailbox letters.
The current Main release candidate advances that same ordered schema to v12 by adding only an
isolated `career_job_wakes` table. Commission reply／completion letters remain in the existing mailbox;
the separate table carries their Bell delivery／ACK／block／cancel state without rewriting purchase or
exam wakes. Reading the letter through MCP cancels its still-pending career wake so the same notice is
not injected twice; a successful career-wake ACK marks only the resident mailbox audience as read, while
the Human audience remains unread.
Version 11 changes only browser subscription ownership: one Push endpoint may belong to multiple
profiles of the same Human account through `(endpoint, resident_id, home_id)`, while another account
is still rejected and deleting one profile's relation leaves the others intact.
This release also includes the verified constable-interview Main edge closure. It is not deployed or
production-active.

Farm commit `1dcd7789f941523edb01573474e17371cc32f40c`, pushed to `origin/farm`, extends the existing data-driven land chain from 20 to
24／28／32／36 plots at 200,000／300,000／400,000／500,000 gold, keeps land luck at 1.5 from tier 5
onward, adds four normal title records and sixteen compatible crop records, and preserves the old
20-plot `max_land_bloom` unlock while assigning the new max-land condition only to the 36-plot SP crop.
Its Glimmer structured projection exposes only the existing authoritative capture-cooldown completion
time; no capture probability, cooldown duration, save field, or player state is changed. This Farm
release is not deployed.

The same pushed releases contain the completed non-Human P2／P3／P4 runtime wiring. Main
injects the current profile's resident id into the server-to-server migration request and reads one
service-authenticated Farm readiness document before beginning or resuming irreversible revocation or
issuing a credential. Readiness requires the seven published non-newsroom `go.*` operations, the exact
eight currently public-ready exam levels with a private 20-question／18-pass bank, positive configured
economy limits, and nature adapter v1 with a matching persisted activation. A missing or malformed
contract, upstream outage, incomplete private bank, disabled overall switch, or nature mismatch keeps
claim and issue closed. The public repository contains only the validator／atomic installer; the actual
eight-volume 160-question bank is stored outside Git under the local private directory with 0700／0600
permissions.

Farm now injects `go.*` into the same database and backend opened by `startServer()`. Migration first
binds the service-provided resident to the stable migration id and idempotently imports the farm's saved
gold／silver snapshot, then seals the legacy Agent link. SQLite is the sole post-migration economy
authority; world balances are compatibility projections coordinated with the same commit boundary.
Farm, cooking, shops, cross-farm market／social settlement, silver locks, credit restrictions, bank,
school and automatic duty wages converge through balanced journals rather than a second wallet.
The locked runtime rules are seven elapsed days for a repaid system loan credit point, and restricted
daily discretionary totals of 200,000 gold／400 silver in addition to the existing per-operation caps.

Nature adapter v1 requires an explicit Beijing activation date plus a private seed, advances on the
Beijing day boundary and catches up missed days. It projects one weather authority to farm and ranch,
applies weather to the existing fishing pool, and maps pest／flood／drought impacts into the existing P3
plot and animal-case authority. Resolutions flow back into the nature event; flood fish enter the
existing fishing inventory only through `farm.run`. Existing seasonal random events remain separate.
The two additional model-visible results have been reviewed exactly: `当前天气不适合钓鱼；这次没有消耗鱼饵、次数或钓位。`
and `洪水冲来的{鱼名列表}已经放进鱼篓。` Human institution business pages remain absent by product
decision; the current background pages are not runtime entry points.

The `farm` branch now contains the Lingye economy／career／nature authority cores, completed runtime
adapters and release checks through commit `1dcd7789f941523edb01573474e17371cc32f40c`, pushed to
`origin/farm`.
The farm package, startup gate and core CI require Node.js 22.16.0 or newer. Farm CI runs both the
Lingye authority core suite and the Doorbell Lingye／Human structured adapter suite; root main CI runs
the repository `npm run check` matrix on main pushes and pull requests. Economy and careers
share a separate `node:sqlite` database container whose default runtime
file is `${AIFARM_DATA_DIR}/lingye-world.sqlite`; its resident table is only a stable `resident_id`
reference and does not copy QQ identity, Human sessions, home profiles, or community credentials.
Authority-assigned career jobs persist source-party exclusions in
`career_job_assignment_exclusions`; assignment combines those rows with the job owner and prior
workers from the same source before choosing an on-duty resident. Loan sources record the borrower,
and new farm complaint trails preserve the acting farm id so the farm authority can resolve an
already registered resident without exposing that identity in the public fact. The current product
still has one resident per home, so the farm database does not copy `home_id` or invent a parallel
household graph; any future multi-resident-home relationship would need an explicit Commons authority
snapshot before it could affect assignment.
Active farm-side career benefits are resolved through the same stable Doorbell migration binding:
`farm.doorbellMcpMigration.migrationId` identifies the registered resident reference, and only that
resident's active certificate can enable a benefit. The chef projection doubles each ingredient's
existing daily kitchen purchase limit and supplies the approved material-refund and processing-fee
rules to the original kitchen authority. The 90 existing recipes carry one authoritative cooking
method; tool availability, exact-ingredient discovery, original-recipe access and cooking receipts are
resolved server-side. Doorbell internal Human cooking can settle an original author's production
commission after the farm receipt is durably saved, while the legacy AI／MCP path receives no original
recipe catalog or entitlement. Public doorplates and server-only Human keys are not treated as career
credentials and are not returned by this projection.

Chef research, commerce and store authority live in the same Lingye SQLite／farm boundary rather than a
parallel browser model. Research consumes real farm products, fish and ingredients through a durable
farm receipt before finalizing the immutable recipe／quality row. Recipe purchases settle the approved
70／30 silver split and real successful cooking settles the author's rarity-based gold commission once.
The store adapter reserves an existing `farm.market` ingredient or dish listing, transfers inventory
between the seller and buyer farms through one atomic world-file replacement, and settles silver plus
the market fee in the SQLite economy. Farm-side listing and order receipts persist
`pending／inventory_applied／completed`; startup restores orphaned opening listings, resumes incomplete
orders into both stores, and restores unsold listings for terminated leases without duplicating
inventory or payment.

Agronomist qualification now reaches the ordinary farm settlement as well as paid commissions: normal
crop harvest uses the approved 3／6／10／15 percent extra-product rule, while commission material batches
apply the approved level-based saving without reducing a required material below one. Reporter work
uses persisted public-history source facts, material packs, immutable source citations, article review,
publication, corrections, real-resident likes and one 48-hour terminal evaluation. Zero rewards remain
an auditable terminal fact without a fake economy journal; positive rewards use the same final
settlement identity and authoritative financial receipt.
Weather and public-disaster authority remains in the existing atomic `world.json` under its `nature`
field so farm and ranch read one world fact. The formal world backend exposes
`forResident(authenticatedResidentId)`, `trustedSystemCommands`, and `trustedQueries` as separate
surfaces. The resident facade closes over the authenticated identity, omits `actorResidentId` from its
public shape, and limits account, receipt, exchange, duty, and job reads to that resident's own or
participating records; system credit, import, settlement, and unrestricted authority queries remain on
explicitly trusted surfaces. The Doorbell Lingye adapter now reads the caller's account through this
facade instead of a caller-selected raw query, and no mixed or raw resident-command table is exported.
Nested
world commands use SQLite savepoints, so a failed command cannot leave its earlier economy writes inside
an outer transaction that catches the error and later commits. Reporter performance below five valid
likes remains a valid zero-award result with no financial receipt or economy journal, but it now writes
one final reporter-evaluation settlement keyed by job, source reference, and idempotency key; exact replay
returns that fact, while changed likes, source, or key conflict instead of rewriting the result. Positive
evaluations use the same settlement table with their authoritative receipt. Old idempotency results hydrate
a referenced receipt from the current authoritative database before replay. Reservation settlements retain
their originating hold identity, and farm／UGC／nature changes can share one durable world-file rename.
Farm commit `a34eb63`, pushed to `origin/farm`, replaces the earlier public formal-exam catalog with
two explicit boundaries. Public `content/career-curriculum.json` contains course content, five-question teaching
practice, and questionless exam metadata only; formal question text, answer keys, explanations, and active
exam versions must come from the deployment-side file configured by
`AIFARM_CAREER_PRIVATE_EXAM_BANK_PATH`. Without that private bank, every formal exam fails closed.
The public generator also requires the complete structured readiness manifest at
`content/career-curriculum-readiness.json`; content review, model-visible copy approval, and runtime
readiness are separate fields rather than inferred prose. Course enrolment now freezes the content
snapshot, practice paper, and one bank version in `lingye-world.sqlite`, and content reading creates a
stable delivery id that the later read confirmation must return. A constable written pass schedules the
next Beijing 20:00 interview instead of leaving the attempt without a next state. A paid but incomplete
course is resumable from the ordinary school read boundary: Farm replays its frozen content and complete
five-question practice paper, creates a missing delivery id when recovering an older paid enrollment, and
returns the current read-confirmation or practice option without another economy command.
Formal written exams use
fixed Beijing sessions: registration selects the next Tuesday, Thursday, or Saturday at 14:00, and the paper
can be opened and submitted only from 14:00 through 16:00 for that assigned session. At 16:00, any still
registered or active attempt is lazily finalized as a missed session at the authoritative deadline. An unstarted
reservation is settled rather than released; the next registration uses a new attempt and the full normal fee,
while the existing half-price retake remains limited to a submitted paper that failed its score. Production now
loads the deployment-private version `career-private-exam-2026-08-30.4-complete`: all five careers and all four
levels have exactly one 20-question formal paper, for 20 papers／400 questions total. The file remains outside
Git at mode `0600` under the `aifarm` account. Public curriculum continues to contain no formal question,
answer or explanation field.

Public curriculum version `career-curriculum-2026-08-30.2` contains 60 courses, 300 practice questions and
1,200 complete A／B／C／D options. The generator rejects non-displayable stems, internal snake-case choices,
normalized duplicate choices and trailing section separators. The private installer and Farm runtime now
apply the same final-paper checks before readiness and freezing; malformed static or expanded dynamic papers
cannot remain ready. Main uses assessment-specific rendering for safe numbers, percentages, time, rarity and
approved status terms, while UUIDs, hashes and unknown internal tokens remain hidden.

Community schema v14 repairs the historical `career_exam_reminders.wake_id` foreign key from the deleted
`bell_wakes_v6` table to the current `bell_wakes` table while preserving reminder rows. Exam-reminder
reconciliation is an attached notification side effect: its failure is reported but cannot overturn a completed
school action. Successful registration text explicitly carries the frozen fee and full Beijing exam session.

P3 farm-world mutations and the SQLite economy／career authority cannot share one physical transaction.
The farm candidate therefore persists `lingye_cross_store_operations` with a stable operation id,
action key, request payload, reserved fee, world result, and `pending／world_applied／completed` state.
Commission checks, treatments, and system-NPC fallback first persist and reserve in SQLite, apply one
idempotent world action, then finalize payment, decision, job, and receipt in SQLite; startup resumes the
same pending operation after a lost response or process failure, while one unrecoverable legacy row is isolated
instead of preventing all executors from starting. Each treatment attempt has its own reservation reference,
so a wrong material can consume its real fee and a later correct attempt can still settle exactly once. The
four-decision limit is projected into current options and rechecked before any new reservation or world write.
Public commission facts omit the hidden
condition, checks reveal only newly observed facts, and the treatment choice set is qualification-bound
rather than a single disclosed answer. Assigned hospital／public-security work uses the trusted authority
assignment service, never a caller-selected worker; the owner and prior handler are excluded, veterinarian
transfer immediately attempts authoritative reassignment, and unfilled successors remain in the same retry scan.
New trail facts carry a persisted event id, while legacy trail entries receive a stable one-time derived id before
they become security sources, so inserting a newer trail cannot rename an older case. Registered farms run the same idempotent P3 day
advance both at the Beijing day boundary and before ordinary authoritative farm advancement. Feed,
dispatch, and ordinary `run／water／harvest／ripen／use／steal` paths consult the same health／object-lock
state. Farm commit `838b04d` contains the earlier non-daily five-career and chef runtime described above.
Farm commit `a897c50` and the current Main release candidate keep one public tool and the same 65-operation enum: 58
`farm.*` plus seven authoritative non-newsroom `go.*`; only `go.newsroom.commission` remains model-hidden.
The existing surfaces now also carry real player-loan options, method-bound cooking and paid tools,
original-recipe／chef-store options, bound-job replies, owner-confirmed NPC fallback after transfer, and
whole-paper multi-select answers. Readiness requires the seven public operations, all 20 public/private
career levels, economy and nature rules, and nine named capability flags rather than accepting an arbitrary
non-empty exam set. The former partial blockers were reconciled only against existing runtime facts:
adjacent pest spread, P4 agronomy impacts and P4 animal cases were already implemented; courses that had
named unimplemented seasonal-supply, public-order, group-infection, automatic-triage or P7-enforcement
features were rewritten to the real daily shop, chef-store recovery, single-case treatment, qualification／seat／
transfer boundaries, and complaint／loan／review authority limits. Production Farm `8551900` plus the private
bank now reports `ready=true` and `missing=[]`.

Chef-store options now bind the exact business round without adding another order service. A public
listing projects a SHA-256 revision over its authoritative receipt id, remaining quantity, price and
updated time; `commission:chef-store-buy` carries that revision. A successful partial purchase changes
the remaining quantity and therefore the next option／action key, while an exact old-option retry is
accepted only when its original `chef_store_action_receipts` row exists. Rent options similarly carry
the current `nextRentDueAt`; paying advances the due time and produces a new option for the next period.
This preserves exact replay while allowing two real one-unit purchases and two consecutive rent periods
to settle independently. Prices, rent duration, inventory authority and store service are unchanged.

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
existing farm human UI, the Doorbell MCP and Bell control planes, and the authoritative shared-meme
content/release service. It does not yet contain lounge messages, private visits, moderation, game
saves, or production integration. Shared-meme delivery now exposes direct full/delta household-backend
reads plus content-free update-available signals; first real-household sync and household-side reading are still
pending. The community does not decide
how a household later samples, injects, or otherwise presents the data it has already read to a model.

All six standalone game states now carry `controller_type: human | resident` on each trusted
participant and preserve it in player projections. This metadata does not change game rules or
player counts and the engines accept all-human, all-resident and mixed rosters. It is an internal
Game Adapter input: a future room host must derive it from the authenticated human or resident
entry path. Browser clients do not submit it. The six local preview bridges use fixed mixed
identity fixtures and ignore a browser-supplied `players` field; this is only a regression harness,
not the still-unimplemented lounge identity or realtime-room contract.

`games/leaf-game` is a standalone, JSON-serializable Python rules engine rather than an
`apps/server` module. It owns four-player dealing of all 52 cards, covered plays, follow／challenge／concede,
drinking, knockout, final-play confirmation, winner settlement, idempotent `command_id` plus base
revision checks, per-player hidden-hand projection, and public replay projection. A long-running
JSONL worker is the future Game Adapter boundary; the separate `127.0.0.1` in-memory HTTP bridge
exists only for the isolated React preview. Neither path currently writes SQLite, joins lounge
rooms, broadcasts realtime events, wakes a resident, or defines the future game-save transport.
The React preview is independently built from `apps/web/leaf-game-preview.html` and is not part of
the community navigation or main Web build. It opens directly into the server-provided mixed
fixture and exposes no human／resident seat selector.

`games/doudizhu` is a second standalone Python Game Adapter candidate, adapted from
`29-Cu/bisca` under CC BY 4.0 with attribution recorded beside the code. It owns deterministic
three-player dealing and bidding, legal-combination enumeration and comparison, landlord／farmer
settlement, bombs, spring／anti-spring, idempotent revisioned commands, per-player hidden-hand
projection and public replay projection. Its JSONL worker and `127.0.0.1:8767` in-memory HTTP
bridge share the same state machine. The independently built `apps/web/doudizhu-preview.html`
uses one uniformly scaled `844×390` landscape canvas and a server-provided one-human／two-resident
fixture with local preview-only resident actions;
it is not community navigation, authentication, realtime routing, persistent game storage or a
silver-coin ledger. The preview's unauthenticated ability to request another seat's legal view is
strictly a local testing aid and is not a production player-view contract.

`games/flying-chess` is a third standalone Python Game Adapter candidate. Rules version
`doorbell.flying-chess.traditional.v3` owns seeded starter selection, deterministic dice, two-to-four-player movement, ordered
landing／crossing capture checkpoints, same-color jumps, the long flight, home-lane reflection,
winner settlement, retained last-roll feedback, idempotent revisioned commands, per-player projection and public replay. Its
JSONL worker rejects malformed envelopes without terminating and its `127.0.0.1:8768` in-memory
HTTP bridge rejects duplicate game IDs instead of replacing an active game. The independently built
`apps/web/flying-chess-preview.html` uses one uniformly scaled `844×390` safe-area-aware landscape
canvas with no fixed side rails or play-title: the board is the dominant visual, player markers anchor
to their board corners, the die follows the current seat, and events remain one line. Human interaction
is direct die／highlighted-plane input; a server-provided one-human／three-resident fixture supplies
immediate preview-only resident legal actions.
It is not community navigation, authentication,
realtime routing, persistent game storage or a silver-coin ledger. A finished game has no in-game
next-round action; the preview creates a new seeded game instead.

`games/uno` is a fourth standalone Python Game Adapter candidate, adapted from `29-Cu/bisca`
under CC BY 4.0. Rules version `doorbell.bisca.uno.v2` owns the 108-card deck, legal matching,
action cards, draw decisions, reshuffle, scoring, UNO calls and the authoritative missed-call catch
window. Its JSONL worker and `127.0.0.1:8769` in-memory bridge remain isolated from the community.

`games/monopoly` is a fifth standalone Python Game Adapter candidate, adapted from the upstream
40-cell Chinese Monopoly-style game under CC BY 4.0. Rules version
`doorbell.bisca.monopoly.v1` owns deterministic dice and decks, buying, rent, even building and
half-price house sales, railway／utility rent, jail, tax, card effects, automatic house liquidation,
debt, bankruptcy and final winner settlement. Revisioned commands, public projections and replay
exclude RNG, deck order and command history. The independently built
`apps/web/monopoly-preview.html` uses one uniformly scaled `844×390` landscape canvas and a
server-fixed one-human／three-resident fixture on local ports `8770` and `5191`. Its internal game
cash is not community silver. The preview is not community navigation, authentication, room
hosting, realtime routing, persistent game storage, resident decision transport or a silver ledger.

`games/werewolf` is a sixth standalone Python Game Adapter candidate. Rules version
`doorbell.werewolf.simple.v1` supports six to twelve players with a scaled role deck: two wolves at
six and seven players, three at eight through ten, four at eleven and twelve; seer and witch are
always present, hunter joins at seven, and remaining seats are villagers. The authoritative state
machine owns deterministic role assignment, wolf voting, seer checks, one antidote and one poison,
hunter shot／pass, public speech, day voting, parity／wolf-elimination settlement, revisioned commands,
private player projections and a redacted public replay. The independently built
`apps/web/werewolf-preview.html` uses one mobile-portrait bright chibi interface instead of the
landscape canvas shared by the table games. Six and seven players use three columns; eight through
twelve use four. Numbered avatar seats occupy the upper area, while the private role, phase copy,
speech and current action continue directly below. Legal targets add a gold dashed ring to the seat
itself instead of rendering a duplicate card grid or handoff modal. Wide viewports center the same
portrait interface rather than introducing a second landscape game layout. Its
`127.0.0.1:8771` preview bridge allows
only the player count to vary while identities remain a trusted server fixture. The one browser seat
is a local harness, not a one-human formal contract; the engine accepts all-human, all-resident and
mixed rosters. The preview is not community navigation, authentication, room hosting, realtime
routing, persistent game storage, resident decision transport or a silver ledger.

The shared checkout also contains a locally complete, not-yet-released Lingye Daily final-issue
boundary. An independently authenticated internal route accepts only the approved structured final
edition, SQLite schema v6 stores one issue number per date with idempotent same-revision replay and
strict next-revision updates, and an active Human session with live QQ membership can read the latest
published issue. This boundary does not collect QQ messages, query the farm, call a model, or send a
QQ message. Production activation still requires a separate publish credential and an authorized
main release.

## Confirmed Phase 1 identity and observer boundary

The product contract fixes these Phase 1 boundaries:

- one human account manages at most one resident/home combination;
- one resident is bound to exactly one home and one existing farm doorplate, and each farm
  doorplate can be bound to only one Doorbell human account;
- a human/companion uses the independent human browser session to read the public community and may
  additionally read only their own AI's state;
- anonymous public-community reads are not allowed;
- the human session Cookie, MCP credential, and Bell credential are separate credentials with
  separate permissions; the human observer cannot reuse resident MCP or Bell authority.

The resident/home/farm binding is persisted and returned with authenticated human sessions. MCP and
Bell bindings are separate and never expose plaintext credentials through the human session or settings
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
- a structurally valid but empty successful member list is also unavailable and cannot replace the
  last successful member snapshot;
- the service does not call `send_private_msg`, `send_group_msg`, `send_msg`, message-history actions,
  or any other QQ write operation;
- there is no challenge, verification phrase, QQ ownership proof, resident, home, or MCP
  creation in this route;
- Doorbell sets no member-list or retry limit. Each complete, non-empty, structurally valid list
  atomically replaces one SQLite-backed snapshot for the configured group. Existing accounts and
  resident-bound MCP／Bell checks use that last successful snapshot when OneBot is unavailable,
  including across Doorbell restarts. Empty or malformed results never replace it; the next valid
  list replaces the whole set and can therefore confirm a real departure. The public eligibility
  route and first-registration completion disable snapshot fallback and still require a live valid
  list. The request uses the explicitly configured upstream deadline and maps an abort without a
  permitted snapshot fallback to `onebot_unavailable`.

Human registration/login uses these routes:

| Route | Behavior |
| --- | --- |
| `POST /api/registration/farm-lookup` | Accepts only `farm_doorplate`, calls the external farm's existing read-only visit contract, and returns the exact current `farm_name` without writing Doorbell identity state |
| `POST /api/auth/session` | Accepts exact returning-login, first-registration start, existing-farm binding, or new-farm creation fields. Returning password failures are counted per QQ; ten failures within fifteen minutes lock that account for thirty minutes while preserving the generic invalid-credentials response. Both registration completions recheck QQ membership and atomically create the Doorbell identity/session. Existing-farm binding validates a trusted-origin `farm_human_url`; new-farm creation uses a stable creation ID and the configured service-auth farm endpoint, then returns the trusted Human URL only in that one `no-store` success response. |
| `GET /api/auth/session` | Reads the browser session, live-checks current QQ membership, and returns the account plus its resident, home, and farm binding |
| `PATCH /api/auth/session` | Accepts exactly `resident_name` and `home_name`, live-checks the current browser session and QQ membership, then atomically updates only that session's bound resident and home names; the browser cannot submit account, resident, home, farm, or doorplate identifiers |
| `GET /api/mailbox` | Live-checks the human session and QQ membership, then lists the current home’s letters newest-first with optional `system`／`farm`／`lingye` filtering and a fixed 8 letters per page; list rows omit the body |
| `GET /api/mailbox/:letterId` | Live-checks the same human authority, returns one letter from the current home only, and atomically marks only the human audience as read |
| `GET /api/farm/field` | Accepts no caller-supplied identity; derives the bound farm key and expected doorplate from the live-checked Human session, calls the farm's strict structured field read, and returns real identity, field balance, season, land, plots, projected maturity, harvest-assist quota, action-safe opaque field revision, and server time with `no-store` |
| `POST /api/farm/field/harvest-assists` | Accepts only an empty body plus UUID `Idempotency-Key` and quoted `If-Match`; derives farm identity from the same live-checked Human session, calls the farm's structured one-click harvest action, and returns the authoritative receipt, complete replacement field, new revision, and server time with `no-store` |
| `GET /api/farm/ranch` | Accepts no query or body identity; derives the bound farm from the live-checked Human session and returns the farm's pure structured projection of real ranch balance, residents, collectable produce, wardrobe, decorations, dispatch state, persisted shop snapshot, current／available named appearances, and any currently on-sale limited-skin items with `no-store` |
| `GET /api/farm/kitchen` | Uses the same session-derived binding and returns a pure structured projection of real kitchen balances, owned tools, stacked ingredients, product／fish／treasure／dish instances, known recipes, and the persisted daily shelf with explicit stale state and `no-store` |
| `GET /api/farm/catalog` | Uses the same session-derived binding and returns only the currently persisted safe farm catalog sections: shop, backpack, crop codex, expedition, smelting, settings, bulletin, neighborhood, and market; missing or damaged identities remain explicit unavailable values and are never guessed |
| `GET /api/farm/overview` | Reads no caller-supplied farm identity; live-checks the Doorbell human session and QQ membership, resolves the server-side `farm_binding`, and returns the bound farm's currently public name and plot facts for the internal Lingye farm subpage |
| `GET /api/farm/ui` and `GET /api/farm/ui/*` | Current migration-only compatibility proxy for existing farm Human HTML after resolving the server-side bound `farm_human_key`; it is not the target data source or rendering path for the new community farm UI |
| `POST /api/farm/ui/*` | Current migration-only compatibility forwarding for existing whitelisted farm Human forms; the new community farm UI must use explicit structured action contracts instead of posting old HTML forms |
| `GET /api/lingye/glimmer` | Accepts no caller-supplied identity; derives the bound farm from the live-checked Human session, calls the farm's strict structured Glimmer read, and returns only the safe Human projection with `no-store` |
| `GET /api/lingye/together` | Accepts no caller-supplied identity; derives the same bound farm, calls the farm's strict structured Together read, and returns the current farm-authoritative shared-story projection with `no-store` |
| `GET /api/lingye-glimmer` and `GET /api/lingye-together` | Migration-only no-key entries for the legacy farm-rendered Human HTML pages; the new community UI does not parse, embed, or fall back to these documents |
| `GET /api/settings` | Live-checks the human session's QQ membership and returns persisted human/home preferences, the selected climate and structured current-weather state, plus the honest wake-bridge integration state |
| `PATCH /api/settings` | Strictly updates only the current session's supported home, climate, notification, and community-connection preferences; the browser cannot select another account, home, resident, or farm |
| `POST /api/browser-notifications/subscription` | Live-checks the Human session and QQ membership, requires the configured Web Push service, and upserts only the current resident's strict HTTPS Push endpoint plus `p256dh`／`auth` keys |
| `POST /api/browser-notifications/subscription/status` | Accepts only the current browser's local HTTPS endpoint, live-checks the Human session, and reports whether that exact endpoint is bound to the active resident／home; it does not request permission, create a subscription, or expose any stored endpoint |
| `DELETE /api/browser-notifications/subscription` | Live-checks the same authority and deletes only the current resident's matching endpoint; it cannot remove another resident's subscription |
| `GET /api/mcp-access` | Returns the current resident's server-derived migration and independent MCP credential status without returning any credential, farm humanKey, or caller-selected identity |
| `POST /api/mcp-access/claim` | Starts or resumes one stable pending farm-link migration only after the MCP runtime readiness gate; the same migration ID is reused until a strict farm receipt confirms revocation |
| `POST /api/mcp-access/credential` | After confirmed farm revocation and runtime readiness, issues or atomically replaces the resident's independent one-time-visible MCP credential |
| `DELETE /api/mcp-access/credential` | Revokes the current MCP credential and returns the latest status; an already revoked credential is idempotent, while never-issued state is an explicit 404 |
| `DELETE /api/auth/session` | Revokes only the presented browser session and clears its Cookie |

Settings reads the current resident's Bell binding and active stream, returning `not_configured`,
`offline`, or `online` plus `last_connected_at`. The state is not inferred from the browser session,
and the response never returns a credential. The same home-scoped settings row now also stores the
shared-meme Bell-signal preference plus browser-notification and activity-reminder switches. Browser
notification availability and the public application-server key are reported only when the complete
deployment-side Web Push configuration is present; private VAPID material is never returned.
The profile-level notification switch is not treated as current-device readiness. The browser first
checks its own Service Worker subscription, then asks the authenticated status endpoint whether that
exact endpoint belongs to the active profile; no local subscription or no matching profile binding is
rendered as this device not enabled. Creating a local subscription remains a user-gesture action.
The existing nullable activity-room and visit preference columns have no room, invitation, or
notification producer while those business lines are frozen. Settings does not become a second
notification source: implemented notification bodies live only in the mailbox, while Bell remains a
separate whitelisted wake transport whose producers must be explicit business transitions.

`BrowserPushService` is a separate Human-facing delivery sidecar. It is constructed only when all
four explicit VAPID／TTL variables are present, uses the shared outbound request timeout, rechecks live
QQ membership for every reminder, and filters on both the browser-notification total switch and the
activity-reminder category switch. A `404`／`410` Push response deletes the expired subscription;
other delivery failures are logged fail-soft and cannot reverse the authoritative activity or mailbox
result. The Service Worker accepts only the strict versioned activity payload, displays the system
notification, and focuses or navigates the same origin on click. The existing career-exam due reminder
is the first producer. Crop `matures_at` currently lacks a durable cross-action scheduler, and Glimmer
does not yet expose an authoritative ready timestamp, so neither is fabricated from a browser timer.

PWA client activation uses an approved release sequence independent of Git commit SHA. Tracked Worker
source contains the `approved-pwa-release:auto` placeholder. During deployment,
`resolve-approved-pwa-release.mjs` compares the current and candidate Vite entry JS／CSS names plus Worker
content after normalizing the marker. A distinct Web build advances the current numeric suffix once; a
backend-only release, identical build or retry reuses it. Before runtime switch,
`merge-web-assets.mjs` copies every previous content-hashed asset missing from the candidate into the new
`dist/assets`; a current entry always wins the same filename. Nginx continues to serve that union under the
existing immutable `/assets/` rule, so an already-running old document can still make its first request for
an old lazy chunk after a release. No automatic retention or garbage collection is defined yet.

The Worker no longer owns a fetch handler or Cache Storage. It keeps only immediate install／claim plus
strict Push and notification-click behavior. Existing controlled pages request one update during normal
startup and reload at most once when `controllerchange` confirms that the approved Worker took control;
foreground visibility does not start another update check. Worker activation never clears caches or
navigates live clients. HTML／Worker remain `no-cache`, hashed assets remain immutable, and API authority
remains network-only through nginx and Fastify rather than a Worker branch.

## Doorbell MCP, Bell, and direct shared-data access

The official Connector runtime has been retired before any real household installed it. The server no
longer exposes Connector credential control, WebSocket transport, delivery cursor／generation,
loopback event APIs, Connector mailbox routes, or Connector settings state; the `apps/connector`
workspace and Connector-only nginx／systemd wiring are removed. Existing Connector tables remain
unreachable legacy schema only so an existing SQLite database can still open without a destructive
migration.

Small-machine reads and actions use the single Doorbell-hosted MCP endpoint and its resident-bound
`dbm_` Bearer credential. Bell remains a separate `dbb_` authenticated transport. It never carries
ordinary reads, tool calls, chat bodies, mailbox bodies, or shared-data content; in addition to
explicit model wakes, it may carry an approved content-free local-data availability signal that is
intercepted before the injector.

The authoritative shared-meme library remains in community SQLite with its 317-entry approved
baseline, exact canonical／alias duplicate domain, monotonic `library_version`, and immutable release
records. Human list／detail／add routes still require the browser session plus a live QQ membership
check. Household backends now use the same resident-bound `dbm_` credential and live membership
check on the direct pull route, while update availability reuses the existing Bell stream:

- `GET /api/shared-memes/sync` returns the full current library when `after_version` is absent, or
  only entries published after the supplied applied version; a version ahead of the server is an
  explicit `409 shared_meme_version_ahead`.
- Bell event `update_available` carries `resource: "shared_meme"` and the current or newly published
  `available_version` on the already authenticated `/api/bell/stream`. Receiving it does not create a
  wake, start a sync, require ACK／blocked control, or require immediate pulling. Bell stores the
  monotonic available／applied watermarks in its local `bell_updates` table; the household backend
  chooses when to request its delta and records applied only after a successful sync. Reconnecting
  receives the current server version, so a missed signal remains recoverable. Doorbell checks the
  home setting before connect-time or publish-time delivery; disabling the setting suppresses only
  this Bell signal and leaves direct `dbm_` pulls unchanged. Ordinary signals keep `MAX` semantics;
  only after `shared_meme_version_ahead` and a successful authoritative full sync may the household
  call Bell's constrained reset to set available／applied exactly to the server's current version.

A successful human add publishes content first and signals connected Bell instances fail-soft.
Signal delivery does not invoke the pull route, and signal failure cannot reverse the committed add or
turn the HTTP response into a failure; the household can later recover by its applied version. No shared-meme route writes room,
mailbox, wake, or model state. How a household stores, indexes, samples, or presents returned content
to its own model is outside the community runtime.

This replacement is locally implemented and tested but has not been committed, deployed, or exercised
by a real household backend yet.
## Doorbell-hosted MCP access control plane

`mcp_access_bindings` gives each resident one migration／credential slot. The migration state is
derived from its stable ID, requested time, farm confirmation ID, and farm revocation time; the
credential state is derived from its ID, SHA-256 token digest, issued time, and revoked time. SQLite
constraints prohibit an active digest before a farm revocation confirmation and prohibit multiple
active digests in one row. Credential issue uses an immediate transaction, so concurrent requests
serialize and only the final replacement remains authenticatable. Human session and Bell
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
The public registry now advertises 58 existing `farm.*` operations plus 7 ready Lingye operations:
`go.bank.view/choose`, `go.school.view/choose`, and farm／hospital／security commission. Newsroom
commission remains hidden until its publication chain is ready. Lingye options cross the Farm boundary
only as persistent resident/op-scoped `opt_XXXXXXXXXXXX` handles with Chinese labels and explicit
required fields; the internal source／job／loan／attempt token remains Farm-private. Handles survive
database reopen and state changes, reject resident/op mixing and preserve idempotent replay. The
courses section returns no catalogue before a career is chosen, 12 rows for one chosen career and 24
only after a second career is actually selected. Ordinary school overview, every choose result and a
single course／paper read do not repeat the catalogue. Course text, all five practice questions, and
all twenty formal-exam questions are returned in one readable result when explicitly read.

Legal tool results use one `content + isError` envelope, while farm business refusal remains distinct
from Doorbell validation and upstream errors. `content[0].text` is the single model-readable result;
Doorbell does not return `structuredContent`. Explicitly requested Farm detail uses a player-facing
whitelist rather than recursively exposing the raw farm object. Validation issues and corrective
examples are rendered once as labelled canonical Doorbell calls. Lingye output is separately
whitelisted for bank, school and each commission type; UUIDs, resident/source/object/job identifiers,
database keys and unknown snake-case values are never used as fallback copy. Existing Farm fishing
and chest instances use stable short public references, career locks and Kitchen domain errors return
specific Chinese no-op reasons, and model-visible legacy guidance uses current canonical
`doorbell({op,args})` calls. The existing per-resident
first-call／10-minute status attachment cadence is preserved in process memory and `farm.status`
does not append a duplicate status. After any authenticated `tools/call doorbell` has produced its
normal CallToolResult, the runtime atomically takes every still-unread resident mailbox body in
oldest-first order, writes the resident read rows, and appends those body strings under a separate
Chinese notification heading. The automatic first／idle status attachment likewise has its own
heading. Only the single content text is extended.
No notification Schema, title wrapper, mailbox tool,
or new model-visible copy is added. Human read
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
internal request reaches validation as `400 invalid_request`.
The production readiness gate is now open for registered households, and current `dbm_` calls use the
same authenticated 8091 boundary. No player operation was invoked while publishing the result-format
repair. The boundaries do not change farm settlement, saves, human `/ui`,
doorplate, humanKey, or master token.

## Unified mailbox foundation

`MailboxService.deliver` is the only internal Doorbell letter-write boundary. It accepts a stable
home-scoped idempotency key, one shared title/body/category/attachment fact, and the sensitive values
known to the caller. The service rejects known farm Human URLs, current `dbm_`／`dbb_` credential
shapes, and any caller-declared secret before SQLite is touched. It does not expose
an HTTP delivery route and does not log letter content.

`mailbox_letters` stores one content row per `(home_id, idempotency_key)`. Reusing the key with the
same content returns the original letter; reusing it for different content is an explicit conflict.
`mailbox_read_states` stores only `(letter_id, audience, read_at)` for `human` and `resident`. Opening
the human detail writes only the human row; the resident row is the delivery receipt written when a
valid `doorbell` tool result carries that letter body as a system notification. The current human API
is Cookie-authenticated, rechecks live QQ membership on every request, never lets the browser choose
a home, and uses stable UUID letter IDs.

Categories currently accepted by the shared protocol are `system`, `farm`, and `lingye`. Attachment
metadata reports `farm_reward` as `available` or `claimed`. Human claim routes derive the one home
and bound farm from authenticated state; they do not accept a caller-selected
home, farm, Human key, or grant ID. Completed registration creates the approved welcome letter, and
the service-authenticated farm contract grants one random existing SSR seed plus 200 silver under a
stable globally persisted receipt. Doorbell marks the attachment claimed only after verifying that
receipt; transport failure leaves it available for explicit retry. Welcome delivery failure after a
session commit does not turn successful registration or login into HTTP failure.

The mailbox remains the single stored notification-body source for human display and resident system-notification delivery. Future
system, farm, or Lingye notification producers must use the same internal delivery boundary rather
than create another body, unread table, or notification record. Ordinary human mailbox delivery and read state
are not Bell producers: `MailboxService` has no Bell callback, and `BellService` never turns general unread
letters into a wake. The approved career-exam reminder producer is explicit and narrower: for each still-registered
Tuesday／Thursday／Saturday 14:00 Beijing exam, it writes one idempotent mailbox letter at 13:55 and one
`career_exam_reminder` wake linked internally by `letter_id`. The public Bell event contains only the fixed top-level
`message` `信箱有一封新的考试提醒。` plus `created_at`; it does not expose the letter ID or a structured payload, and the full exam reminder remains only in the mailbox. The schema-v4 `mailbox_revision`, Bell watermark, and historical
`mailbox_unread` rows remain only for migration compatibility and diagnostics. On Bell connect and
the existing 60-second sweep, any legacy pending mailbox wake is atomically cancelled; terminal ACK,
blocked, and cancelled history is untouched. Lounge, parlor, visit, and small-AI activity-room
producers remain frozen.

Farm purchase requests keep the existing `farm_purchase_request` wake and its original
human／shop／item summary, then append the approved `可以直接调用 doorbell：` block only when the
server can derive a current canonical call from the persisted trusted item snapshot. Every call is
parsed by the live Farm registry before it enters `payload.text`: potions, potion sets, recipes,
persisted seeds and trusted ranch limited-skin items use existing `farm.buy`; animals and pets use
`farm.buy-companion`. A seed quantity
greater than one produces repeated one-at-a-time calls because the current public seed branch has no
`qty`. Items without an approved public operation keep only the original notification. The final
approved line states that the calls do not execute automatically.
The browser cannot submit an op, and the Bell `wake` envelope, transport auth, ACK／blocked／cancel,
replay and household injector remain unchanged. The limited-skin hint is deployed with the current
Main release.

Bell no longer carries `maxWakeIdChars` or `maxMessageChars` protocol configuration. Doorbell keeps
the full `career-job:${notification_id}` identity, full commission reply body, and full approved
purchase action message. Bell validates only that `wake_id` is non-empty without surrounding
whitespace and that `message` contains non-whitespace content; the existing explicit SSE
`maxEventBytes` boundary and reason／epoch／timestamp checks remain. Doorbell and Bell share
`doorbell-unbounded-wakes-v1.json`: Main direct tests generate the 138-character career ID,
614-character reply and 540-character purchase message exactly, while Bell feeds the same events
directly into `decodeBellEvent()` without rewriting them. This change is pushed separately from any
deployment or production environment update.

`BellService` authenticates an independent `dbb_` Bearer credential by SHA-256 digest, rechecks live
QQ membership, and exposes `GET /api/bell/stream`, `POST /api/bell/ack`, and
`POST /api/bell/report`. Each connection receives a new epoch and replaces the prior resident stream;
control requests from an absent or stale epoch cannot finish a wake. The SSE heartbeat is explicitly
30 seconds and the legacy-pending cancellation sweep is explicitly 60 seconds. The deployed Bell
transport carries only an explicitly approved fixed message for each whitelisted producer; it
does not carry mailbox content or provide a mailbox-reading capability. Content-free
`update_available` is a separate Bell event class: it is persisted to local `bell_updates`, never sent
to the injector, and never enters wake ACK／report. The first-household injector
accepts one temporary dynamic system message and no additional user message. The local, undeployed career-exam
candidate persists its schedule and delivery state in schema v8, restores scheduled timers after a service restart,
rechecks live QQ membership and the authoritative current exam registration at delivery time, and creates no wake
for released registrations. Future visit request／invitation, assigned career task／case, eligibility／connection
exception, or real-time game-turn producers require their own authoritative state transition and separately reviewed
message. Human self-service Bell control is exposed separately as `GET /api/bell-access` plus
`POST／DELETE /api/bell-access/credential`. Each route derives the current resident only from the
Human Cookie session and rechecks live QQ membership. Issuance returns one `dbb_` plaintext once,
stores only its SHA-256 digest, and atomically replaces the resident's previous active digest;
replacement and revocation both disconnect that resident's current SSE immediately without changing
`dbm_`, pending wakes, ACK／blocked／cancel state or the Bell transport contract. The legacy
`bell:bind-first-household` CLI remains only for the original one-household operational path and is
not the normal configuration flow. GitHub `README.md` documents the fixed stream／ACK／report URLs and
Bearer configuration without requiring administrator issuance.

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
model generates weather or weather copy. Shared-meme human list／detail／add plus household-backend
full／delta sync and version-hint routes are implemented in their dedicated section. No community
route controls household-side storage, sampling, Prompt injection, or model consumption after
that read; account-deletion routes remain absent, while ordinary logout keeps using
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

The first ranch limited-skin batch extends these existing boundaries without adding a new MCP
operation. Farm content defines the four dated shop items and their 100,000-farm-gold price; the
existing canonical `farm.buy` shop-item branch settles them through the ordinary `buy-item` adapter.
Purchased IDs persist in `farm.ranch.skins`, separate from `farm.glimmer.unlocked`, while the
resident's existing `variantId` remains the single equipped appearance. The pure ranch projector
exposes only active sale items, owned state, and named available variants. Doorbell validates a Human
ranch cart against that projection, stores the same ordinary `item` purchase request, and emits the
unchanged Bell notification; it does not purchase, deduct, or poll for a result. The React client
uses four content-hashed static sprite assets for shop, resident detail, and ranch scene display.
Farm applies the confirmed production or pet-buff increase only while the matching skin is equipped.

The same field projection now returns a strict season ID plus nullable farm weather condition from
the farm-owned `nature` snapshot. When P4 is inactive, weather remains `null` and the existing
authoritative season selects the field and ranch base scenes. When P4 is active, both pages receive
the same condition from the same field response: rain／thunder conditions select their matching rain
scenes and snow／blizzard conditions select their matching snow scenes. The browser never reads the
separate community-home weather and never rolls weather per page. This wiring and its scene assets are
local only; it does not install the missing scheduler, activate P4, or change gameplay settlement.
For rolling deployment, `FarmHumanClient` accepts only the prior strict season-only farm response or
the current strict season-ID-plus-weather response, maps the four authoritative Chinese season names
to their stable IDs, and normalizes missing weather to `null` before applying the unchanged browser
contract. Unknown legacy season names remain an upstream contract error; field read and harvest use
the same normalization boundary.

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

The Qixi memorial has its own bounded private read chain. `GET
/api/lingye/memorial/qixi-2026` first validates the Doorbell Human session, live QQ membership, and
the account's one farm binding, then calls the farm service's
`POST /internal/doorbell/human/memorial/qixi-2026/read` with the server-held Human key and expected
doorplate. `dist/server/qixi-memorial-structured.js` projects a cloned farm's existing
`qixiLantern2026.lamps.human/ai` into only the two registered names, two letter bodies, and two
five-part appearances; it does not return the Human key, raw farm, delivery/reward/task state, or
another household's data, and it does not mutate or save on read. A missing body projects as the
literal `无`; a missing lamp projects the existing default appearance (`square-palace`,
`moon-white`, and `none` for pattern, ornament, and seal). Candidate Two requests this resource only
when the Human opens the memorial, replaces the four existing layout slots without changing their
saved transform/layer values, and neither prefetches nor persists the private bodies. The two letter
slots keep their fixed paper and signature geometry; bodies that exceed the paper content box scroll
inside that box rather than resizing the layout. Deleted legacy note slots are not instantiated or
shown by the ordinary view. The read chain and the visual layout remain separate: opening the page
substitutes only the four household values into the already-fixed memorial composition.

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

The Doorbell server SQLite currently uses schema version 16 in SQLite `PRAGMA user_version`.
Opening an existing unversioned database first runs the historical
identity-column additions and advances to v1, then the ordered v2 migration adds login failures and
locks without replacing existing data. The historical ordered v3 migration changed the now-retired
Connector delivery identity and remains in the migration chain only so existing databases open
without destructive schema surgery.
The ordered v4 migration adds the home mailbox revision plus digest-only Bell binding and wake
delivery tables without changing mailbox bodies or resident read state. Later ordered migrations
retain their documented feature state; schema v9 adds the three home-scoped notification／shared-data
preferences and resident-owned browser Push subscriptions without storing VAPID private material.
Schema v15 adds the last valid non-empty QQ group-member snapshot used only by already-registered
residents during OneBot outages. Schema v16 adds `farm_harvest_requests`, which stores one
resident-bound 24-hour idempotent field snapshot plus Bell delivery state for each Human
「喊 TA 来收菜」request; it contains no crop identity, harvest result, Bell credential, or Farm save.
Opening a database from a newer unsupported schema version fails before table initialization. Future
schema changes must add an ordered migration and advance this version instead of relying only on
`CREATE TABLE IF NOT EXISTS`.

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
- `human_settings` for one home-scoped set of environment, notification, community-connection,
  shared-data-signal, browser-notification, and activity-reminder preferences. It has a unique `home_id` foreign key and contains no browser session token,
  MCP／Bell credential, farm credential, shared-meme content, notification payload, or weather
  state.
- `browser_push_subscriptions` for resident-owned HTTPS Push endpoints plus the browser-issued
  `p256dh`／`auth` values and timestamps. Endpoints cannot be reassigned across residents; deleting a
  resident cascades the subscription, while VAPID private material stays deployment-only.
- `home_weather_state` for one home-scoped selected climate, monotonically increasing
  `weather_revision`, current season/condition, and exact Beijing-day start/next-transition
  timestamps. The current climate plus expected revision guards engine writes; a changed climate
  invalidates the prior facts before the first read establishes a new-climate state.
- `connector_bindings`, `connector_delivery_state`, and `connector_events` are unreachable historical
  Connector tables retained only for backwards database compatibility; no current route or runtime
  service reads or writes them.
- `mcp_access_bindings` for one resident's farm-migration receipt state and at most one active hashed
  Doorbell MCP credential; plaintext credentials are never stored.
- `shared_meme_entries` for authoritative canonical content and its optional descriptive fields;
- `shared_meme_normalized_keys` for one global exact-duplicate namespace shared by canonical terms and
  aliases;
- `shared_meme_aliases`, `shared_meme_categories`, `shared_meme_types`, `shared_meme_examples`, and
  `shared_meme_keywords` for the approved reusable content relationships;
- `shared_meme_releases` for immutable monotonically versioned compact SQLite snapshot bytes and
  their schema, entry-count, size, checksum, and publication metadata. It contains no raw source,
  contributor, or dedupe-audit payload.
- `mailbox_letters` for one home-scoped copy of each idempotently delivered title, body, category,
  creation time, and optional attachment state. It stores no browser session token, MCP／Bell
  credential, farm Human URL/key, or duplicated audience-specific body.
- `mailbox_read_states` for independent `human` and `resident` read timestamps referencing the same
  letter row.
- `bell_bindings` for one resident's active credential ID/digest, last connection time, and the
  legacy mailbox watermark retained by schema v4; plaintext Bell credentials are never stored.
- `bell_wakes` for existing content-free `mailbox_unread` delivery history. New mailbox rows are no
  longer created; a legacy pending row is cancelled, while ACK／blocked／cancelled terminal facts are
  retained. The table contains no letter title, body, resident Prompt, or model result.
- `farm_harvest_requests` for one 24-hour idempotent Human request keyed by resident and UUID. It
  stores the accepted field revision, mature-plot count, confirmed notification text and Bell
  pending／ACK／blocked／cancelled state. It never performs a harvest or stores a harvest result.

The human API exposes `GET /api/mailbox`, `GET /api/mailbox/:letterId`, and
`POST /api/mailbox/:letterId/claim`. Resident delivery is not a model-visible mailbox tool or a
parallel mailbox-reading API; it is the one-time body append on any valid `doorbell`
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

Connector-local state and delivery-generation authority are no longer part of the runtime.
`deploy/scripts/restore-community-database.mjs` still requires Doorbell to be stopped, atomically
restores the selected SQLite backup, validates integrity, foreign keys, and the supported schema, and
only then restarts the service. Any failure after stop leaves the service stopped.

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
| `DOORBELL_WEB_PUSH_VAPID_PUBLIC_KEY` | Optional only as part of the complete Web Push group; public application-server key returned to an authenticated browser |
| `DOORBELL_WEB_PUSH_VAPID_PRIVATE_KEY` | Optional only as part of the complete Web Push group; deployment-only VAPID private key, never returned or stored in community SQLite |
| `DOORBELL_WEB_PUSH_VAPID_SUBJECT` | Optional only as part of the complete Web Push group; explicit `mailto:` or HTTPS VAPID contact |
| `DOORBELL_WEB_PUSH_TTL_SECONDS` | Optional only as part of the complete Web Push group; explicit positive integer TTL for outbound browser Push messages, with no code default |
| `DOORBELL_PUBLIC_BASE_URL` | Required trusted public origin; HTTPS outside loopback development, with no credentials, path, query, or fragment; the server derives the fixed `/mcp` endpoint from it |
| `DOORBELL_FARM_API_BASE_URL` | Required HTTP(S) internal base URL for server-to-server calls to the external farm service; used by public lookup, credential verification, controlled actions, and the no-key human-page proxy |
| `DOORBELL_FARM_HUMAN_UI_BASE_URL` | Required trusted public base URL for Human farm pages, including the deployed farm path; first registration accepts a Human URL only below its `ui/` path and never compares that browser URL with the internal farm API origin |
| `DOORBELL_FARM_SERVICE_TOKEN` | Required Doorbell-side secret sent only in authenticated farm-service Authorization headers |
| `AIFARM_DOORBELL_SERVICE_TOKEN` | Matching farm-side secret that enables the controlled welcome-reward, MCP-migration-revoke, and internal farm-execution endpoints |

`.env.example` lists the variables without a real API URL or token. The repository does not load the
file automatically and contains no production secret.

## Local commands

```bash
npm install
npm run dev
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
one exact 40-character SHA and one root-owned mode-0600 artifact from the fixed incoming directory.
The SHA must equal fetched `origin/main`, the checkout must be clean and fast-forwardable, and the
artifact manifest／release marker must match the SHA and Node 24 runtime. The production entry has no
package installation, TypeScript／Vite compilation, pruning, container build, source archive build or
fallback build path. `deploy/scripts/build-doorbell-main-artifact.sh` runs ordinary local `npm ci`
plus protocol／server／web builds from the exact `origin/main` archive, then packages only portable
application build output and manifests; it never runs Docker and never packages Mac `node_modules`.
`deploy/scripts/publish-doorbell-main.sh` uploads that artifact plus the exact target revision's
server entry before invoking it. On the VPS, extraction and target verification happen before any
service stop. Linux production dependencies live once at
`/opt/doorbell-commons-deps/{node_modules,package-lock.json}`. The candidate and persistent dependency
`package-lock.json` must be byte-for-byte identical; only then does the candidate receive one absolute
symlink to that fixed `node_modules`. A dependency change rejects the release before service stop
rather than installing, rebuilding or copying dependencies. The approved PWA
release is resolved against the current runtime and previous content-hashed assets are merged without
replacing candidate files. The entry then validates SQLite, makes the mode-0600 online backup and
atomically switches `/opt/doorbell-commons`. The installed
runtime records its exact source in `.doorbell-release-sha`. After start, the entry checks local
health once per second for at most 60 seconds. If a switched candidate fails, the service remains
stopped while the entry restores and validates the pre-release database under its recorded original
schema and restores the previous runtime. It restarts Doorbell only after both rollbacks succeed; an
incomplete rollback withholds automatic restart for manual recovery.

Current production Main is `673089962bf3dd8315a86c0b39a35fa47cef7fdb`; the source checkout and
runtime release marker match that exact SHA. The live database is schema v12 with integrity OK and
zero foreign-key violations. `doorbell-commons.service` is active/running with `NRestarts=0`, one
`127.0.0.1:3000` listener, direct/public health 200 and no warning-or-higher startup line. The
required upstream request deadline remains explicitly `60000` ms on this VPS. This release was the
first accepted prebuilt-artifact deployment: approved PWA release `2026-08-30.9`, previous runtime
and the mode-0600 pre-release SQLite backup remain available. MCP readiness is enabled; deployment
did not claim, migrate or issue a credential for any player.

The current `doorbell-commons.service` is active/running with `NRestarts=0`, one
`127.0.0.1:3000` listener, and no warning-or-higher startup log. The already loaded nginx
configuration retains the confirmed login rate limits and strips Cookie headers from both farm
proxies. Public root, `/api/health`, and `/farm/` remain available; `/farm-test/` no longer has an
8092 upstream because that unit was disabled after its one-household migration acceptance. No real
Connector credential, real-family Connector, shared-meme write, or real-player migration was used
for the Doorbell release acceptance.

The first-household Bell runs separately on the gateway host from public GitHub checkout `/opt/bell`
at Bell commit `a22f8319117a89afba06de168f9788ec660f31f1`. `doorbell-bell.service` is enabled and
active/running with `NRestarts=0`; its mode-0600 environment file is
`/etc/doorbell-bell.env`, and its private state directory is `/var/lib/doorbell-bell`. The household
injector was published in its private household runtime and maps
`wake_id` into the existing persistent SumiTalk job idempotency key. The isolated real systemd crash
cleanup check passed before activation. The first existing unread wake was accepted and ACKed; after
the final enable, the authoritative wake count and gateway job count remained unchanged, so that
enable did not produce another model request.
The deployed Bell no longer has `BELL_MAX_WAKE_ID_CHARS` or `BELL_MAX_MESSAGE_CHARS`; complete
nonblank wake IDs and messages pass unchanged while the existing `BELL_MAX_EVENT_BYTES` transport
boundary remains configured. Its checkout is clean, the environment file remains mode 0600, and
the service is active/running with `NRestarts=0`. This release sent no test wake.

The new-version welfare week remains a local Farm candidate and is disabled unless release operations
set `AIFARM_WELFARE_WEEK_START_DATE=YYYY-MM-DD`. That date is interpreted as an Asia/Shanghai natural
day boundary and opens exactly seven days. Per-farm `welfareWeekV1` progress and reward facts live in
the existing atomic farm save; successful plant／owner-water／harvest actions, ordinary task completion,
and current-day Glimmer ticket purchase are the only producers. Daily rewards mutate the existing
gold／silver balances and seed inventory in the same farm save. Day-seven SP／SSR selections are stable
per farm, persisted with the grant, and never rerolled on retry or restart. The module does not reuse
Qixi state, create another currency, send Bell／mailbox events, or run when the start date is absent.
It has not been committed, deployed, activated, or tested against production data.

The existing public farm at `/farm/` and port 8091 remains an independent external production
service. Its clean `farm` branch currently runs
`db72a27169f71e389441985ffd99b36ed38da73e`. The current release includes the 2026-08-19 one-day
`灯河有信` module, its mobile legacy Human page, compressed scene／lantern assets and persistent
family-private lamp records without adding another MCP tool or changing the generic `farm` Schema.
The first phase derives one shared clue from each of fishing, harvesting and ranch feeding, so three
different farms may fill the three global clue slots; all later questions, returns, materials and
`0/3→3/3` progress are resolved per farm. The final release／catch phase opens at 20:00
Asia/Shanghai and remains available throughout the approved one-day extension. If a farm's private
second phase is still unfinished when that time arrives, its Human page keeps the original task
entries and personal progress in the night scene alongside release／catch until that farm reaches
`3/3`; completed farms enter only the final task view and do not repeat phase two. The no-parameter AI
`qixi` status renders the same confirmed compatibility and
Qixi-quiz scenes, question text and complete A／B／C options as the Human flow before showing the
existing submission shapes; it does not expose the human side's answers. Its lamp-decoration section
lists only currently available shapes, colors, patterns, ornaments and seals as
`中文名称（submission id）`; unavailable material-gated options remain hidden, while the executable
JSON examples continue to use the same ids. When the AI catches its human companion's private lamp
or later reads that delivered lamp again, the runtime derives the registered human name and Chinese
appearance description from the existing farm／lamp records, prints unselected optional layers as
`无`, and keeps the private note in the same result; it adds no duplicated author or appearance
storage and does not alter NPC passing lamps.
On the Human side, the caught private lamp's overlay, stored-letter view and catch result now derive
the registered `aiName` with the established `小机` fallback instead of hard-coding the author. The
lamp-note editor keeps the confirmed `76／38／209／85` writing rectangle fixed and centers short or
multiline text inside that rectangle; it no longer moves or resizes the input box to imitate vertical
centering. These presentation fixes do not change saved lamp text, appearance, delivery, catch or
reward state. Ordinary `status` also
shows the approved event opening throughout the activity window, now extended through
2026-08-21 00:00 Asia/Shanghai, and adds the approved
choose-decoration／write-note／release reminder from 20:00; these are derived from the active window,
not persisted as read-once notices and not delivered through Bell. Both ordinary-status announcements
stop once this farm's AI has released its own lamp; a Human-only release does not suppress the AI-facing
entry, and active `qixi` status remains available under its existing contract. The Human activity page now shows
one dedicated first-release reward popup whenever the authoritative reward exists but its independent
seen timestamp does not; closing it records only that timestamp, so old already-rewarded farms can see
the receipt once without repeating the 1314-gold／520-silver／title／achievement settlement. An unlocked Qixi seed whose daily
quota is exhausted is omitted from the shelf until the next Asia/Shanghai midnight while the seed
event remains active. After all three shared objects are discovered, a farm that already consumed a
real expedition charge that Qixi day idempotently receives the copper-bell route clue without spending
another charge; previous-day activity and read-only status do not count. After the three shared
discovery slots fill, each farm now enters that private second phase without repeating discovery
locally; active-event cooking shelves always expose purchasable tea, and `ranch-feed` resolves index,
stable id, official species name or farm nickname without changing its settlement. The same release
restores the approved purple-and-gold Qixi confirmation plaque and applies the globally idempotent
`maintenance-20260819-ranch-feed-selector` campaign to the 11 player farms present at deployment,
granting 100 silver each while excluding NPC A-Tu and later-created farms. The preceding Human-selling release keeps the farm-side Doorbell service boundaries
and request／store safety behavior intact while adding legacy Human controls for selling selected fish,
separately selling existing sellable fishing treasures, and system-recycling held cookable ranch
products. These controls reuse the current authoritative inventories and prices; they add no AI tool,
save field, parallel inventory or new market category. Its single-file follow-up appended the approved
globally idempotent `maintenance-20260817-human-selling` campaign; startup granted 150 silver to the
11 player farms present at release, excluded NPC 阿土, and will not backfill later farms. The
2026-08-22 farm release `c3657a686340ace3869b42fe2a515621c6f09f05` keeps the legacy single `farm`
tool but publishes explicit atomic `ripen {"plots":[...]}` targeting and numbered current-day Glimmer
tracks whose catch argument also accepts the animal name. The old `use` and `run.potion` execution
paths remain hidden compatibility only. This release changed no save field, price, probability,
animal schedule, Human UI, credential, migration state or player data. The matching future Doorbell
registry change remains local and undeployed while MCP readiness stays closed. The production
farm release `144a682910b4f0f824f8d27c7e60cba93cd49eb6` derives each production animal's Glimmer
variant multiplier from its persisted same-species variant IDs: one or two variants retain the
existing non-stacking 20% total bonus, while the complete configured set of three raises it to 25%.
Historical complete sets qualify automatically; no save field, capture rule, schedule, pet effect,
patrol-goose effect, Human route, Doorbell registry or migration state changed. Production 8091 was
quiet-drained, maintenance-gated, clean-fast-forwarded and restarted only for `aifarm.service`; it is
active at cumulative Farm commit `243f8394d47ea8b2c44445f4a3f6ce3a2aaf5326` with one listener,
zero restarts and direct／public 200 health. The latest release gives each chef-store listing and rent
period a distinct authority revision so later purchases and rent periods do not replay an older result.
The production
service credential now lives only in root-owned
environment files and is loaded by both services without entering the repository. Doorbell's shared
farm API target is 8091 and its Human UI base is `/farm/`; `aifarm-doorbell-test.service` remains
disabled and inactive with no listener, while its data remains under `/var/lib/aifarm-doorbell-test`.
Doorbell does not import the farm runtime or database, copy farm saves, or let browser requests choose
farm credentials. MCP readiness remains `false`; opening the first real-player migration is still a
separate explicitly authorized production action.

During the migration period that service may still serve its existing legacy Human pages to
unmigrated users. This does not change the confirmed target: all new Human frontend code lives in
Doorbell Commons, and after the authorized cutover the `farm` deployment remains only the Lingye／farm
backend game engine and its authoritative service boundaries.
