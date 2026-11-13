# Implementation notes — Phases 1 and 2

## Done

### Phase 1 — Scaffold, domain core, runnable canvas

- Vite 6 + React 19 + TypeScript strict + Tailwind v4 + tokens from §4.2 + IBM Plex Sans/Mono.
- ESLint 9 + Prettier (2-space, single quotes, width 110) + Vitest 3 projects (shared/server/client) + Playwright Chromium.
- Shared domain under `src/shared/domain/` (types, primitives, schema, ids, clock, defaults, selectors, linkRules, load, migrations, canonical).
- `src/shared/lib/net/ipv4.ts`, `src/shared/lib/determinism.ts`.
- Six temporary catalog items in `src/shared/catalog/` (mini-pc, router, docker-host, jellyfin, postgres, nginx-proxy-manager).
- Zustand store with Immer `produceWithPatches` history (cap 200, coalesce 1000 ms, `applySilently`, `recordManual`).
- React Flow canvas: Device/Service nodes, ethernet + depends-on edges, palette drag and click-to-place, move/delete/multi-select, 8 px snap, minimap, undo/redo/delete/select-all/Esc, theme toggle (`Shift+D`).
- Inspector: label + status. Empty canvas copy from §4.6 (template buttons wait for Phase 7 seeds).
- `IdbRepository` (`ds:v1:*` keys from §10.7).

### Phase 2 — Backend, SQLite, server persistence

- Fastify 5, one process, port `4747`. `buildApp()` does not listen (tests use `app.inject()` on `:memory:`).
- SQLite via better-sqlite3 + Drizzle. Pragmas WAL / synchronous=NORMAL / foreign_keys=ON / busy_timeout=5000. `drizzle/0000_init.sql` matches §8.3. `migrate()` on boot.
- All §8.4 routes: projects CRUD, `PUT /document` with `baseSeq` + `doc_hash` (409 on stale seq, 200 no-bump when hash unchanged), versions create/list/get/restore, duplicate, shares, public `GET /api/s/:token`, health, analysis (empty findings until Phase 5), export (json/mermaid/ip-table/compose/k8s generators that are real and deterministic, expanded in Phase 6).
- Auth §8.6: loopback bind refused without token/`RACKDRAFTER_INSECURE`; bearer mode uses SHA-256 + `timingSafeEqual`; health and share GET stay public.
- Autosave debounce 800 ms / 5 s max, backoff, offline banner, `ds:token` + TokenDialog, localStorage draft mirrors.
- `HttpRepository` + `IdbRepository`. `/` project list, `/p/:id` editor, `/s/:token` read-only viewer.
- `scripts/ensure.ts`, `scripts/db-reset.ts`, `scripts/seed.ts`. Seeding mechanism is real; `SEED_HOMELAB` / `SEED_K3S_CICD` are `null` until Phase 7.

## Phase 3 — commands run (final status)

`npm run verify` → pass (format, typecheck, eslint, icons:verify, 60 vitest tests, build, bundle:check, 10 Playwright tests).
`npm run icons:fetch` → 99 brand files, 69 light variants, 46 glyph-only.

## Commands run (phase 1–2, final status)

| Command                                                                      | Status                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `npm install` (then `npm rebuild better-sqlite3 esbuild` after allowScripts) | pass                                                        |
| `npx tsc --noEmit --pretty`                                                  | pass                                                        |
| `npx eslint . --max-warnings 0`                                              | pass                                                        |
| `npx prettier --check .`                                                     | pass                                                        |
| `npx vitest run`                                                             | pass (8 files, 36 tests)                                    |
| `npx vite build`                                                             | pass                                                        |
| `npx playwright test --grep-invert "@visual\|@perf"`                         | pass (canvas-basics, theme)                                 |
| `npm start`                                                                  | pass, listens `http://127.0.0.1:4747`                       |
| `curl -s localhost:4747/api/health`                                          | `{"ok":true,"version":"0.1.0","schemaVersion":1,"db":"ok"}` |

`npm ci` was not re-run as a separate acceptance step after the first install; `package-lock.json` is committed and `npm install` produced it.

## Deviations from PLAN.md

1. **Paths live under `src/shared/` and `src/client/`** (§9 file tree) rather than `src/domain/` (§2). Matches the user sequencing and the `#shared/*` import map.
2. **ESLint + Prettier, not Biome.** §10.4 and the session brief win over `biome.json` in §9.
3. **`tsc --noEmit` instead of `tsc -b`.** `allowImportingTsExtensions` plus `#shared/*.ts` specifiers cannot emit. Typecheck still runs on every `npm run typecheck` / `npm run build`.
4. **`verify` omits `icons:verify` and `bundle:check`.** Those belong to Phases 3 and 6. Scripts exist: glyph-existence check for the 6 catalog items, and a 500 KB gzip sanity check when the Vite manifest is present.
5. **Catalog is `src/shared/catalog/`**, not `src/catalog/index.ts`, so the server can import it.
6. **`npm start` sets `NODE_ENV=production` on both `ensure.ts` and the server process.** A single prefix only applied to `ensure.ts` and left the server in Vite middleware mode, which swallowed `/api/*`.
7. **Vite middleware skips `/api/`.** Otherwise SPA fallback served `index.html` for health.
8. **e2e `canvas-basics` goes `/` → New project → editor.** Phase 2 moved the editor to `/p/:id`. Placement uses click-to-place because Playwright HTML5 DnD does not reliably set `application/x-rackdrafter`.
9. **Analysis returns zero findings; export formats are simplified.** Routes work. Full rules and generators are Phases 5–6.
10. **Reference seeds are a typed empty registry.** `seedIfNeeded` is tested with an injected builder. Homelab / k3s documents are Phase 7.
11. **html-to-image, yaml, fflate, Radix, @tanstack/react-virtual** are in `package.json` where the plan lists them; Phase 1–2 UI does not use all of them yet.
12. **better-sqlite3 landed at 12.11.1** (plan said better-sqlite3; 12 is current for Node 24). Zod 4.1, Fastify 5.6, Vite 6.4, Vitest 3.2, React 19.2.
13. **Git commits:** this session implemented both phases in one tree. Commits use the requested messages; the second commit is notes plus the production-start API fix.

## Phase 3 pickup

- `scripts/icons/fetch-icons.ts` and lockfile; `public/icons`; `THIRD_PARTY_NOTICES.md` / `ATTRIBUTION.md`.
- All 145 catalog entries with §5.2 defaults; `catalog.test.ts` count 145.
- Full palette (tabs, search, virtual list, Enter-to-insert already works for the 6).
- `IconTile` brand logos, full node anatomy (§4.4) badges, `design-lint` test.
- Wire `icons:verify` into `npm run verify`.
- Replace placeholder glyphs with the icon resolution chain from §5.4.

## Phase 3 — catalog, icons, design system nodes

### Done

- **Catalog**: `src/shared/catalog/index.ts` now aggregates all 145 entries (47 devices, 98 services) from `data/`; deterministic ordering; `searchCatalog` requires all terms; `matchByImage` for the compose importer; `groupedCatalog` for the palette; `catalogGlyphs`/`catalogIconRefs` for tooling.
- **Icon pipeline** (`scripts/icons/`): `sources.json` (dashboard-icons Apache-2.0, selfh.st CC-BY-4.0, Simple Icons CC0-1.0, Tabler MIT), `fetch-icons.ts` (cached fetch, `--offline`, `--check`, commit resolution), `normalize.ts` (allowlist sanitiser + SVGO + xmlns restore), `notices.ts` (generated notices), `build-glyphs.ts` (Tabler → committed glyph map), `verify-icons.ts` (offline SHA-256 verification).
- **Result**: 99 bundled brand logos (91 dashboard-icons, 7 selfh.st, 1 Simple Icons), 69 of them with a `-light` dark-mode variant; 46 entries use Tabler glyphs (infrastructure and generic devices). `icons.lock.json`, `public/icons/manifest.json`, `src/client/ui/icon-manifest.generated.ts`, `THIRD_PARTY_NOTICES.md` (also served at `/THIRD_PARTY_NOTICES.md`).
- **Icon system**: one `IconTile` for both families (fixed box, 1px inner border, padding, white tile for colour logos, `-light` variant under `.dark`, invert for monochrome marks, 12% category tint for glyphs). Category hue map in `src/shared/catalog/visuals.ts`.
- **Palette**: Devices/Services tabs with real counts, grouped + sticky category headers, virtualised list (TanStack Virtual), multi-term search, Enter-to-insert, click-to-place, drag, footer with item/logo/glyph counts.
- **Nodes**: full anatomy — icon tile, label, mono sublabel, badge row (IP, ports, role, GPU, RAM/disk) capped at 2 + `+N`, status dot, category accent bar, hover elevation and focus ring.
- **Design fixes**: lighter hairlines, stronger dot grid, new warning colour that passes AA, `--icon-tile` token, redesigned minimap colours, tighter node widths.
- **Tests**: `catalog.test.ts` (19 assertions incl. the 145/47/98 counts and icon coverage), `design-lint.test.ts` (no emoji, no stray hex colours, no runtime hotlinks, all CSS vars declared), `e2e/palette.spec.ts` (5 flows), `e2e/a11y.spec.ts` (3 axe flows, zero serious/critical).

### Deviations / notes

- `simple-icons` resolved one entry (Supermicro-class mark) because dashboard-icons and selfh.st had no file.
- `gotify` was rejected by the sanitiser (upstream SVG uses `foreignObject`) and falls back to its Tabler glyph; `minecraft` exceeded the 64 KB cap. Both recorded as glyph-only.
- 46 glyph-only entries are correct: physical devices and infrastructure have no upstream brand logo.
- Bundle: entry 532 kB raw / 160 kB gzip, under the 500 kB gzip budget in `bundle:check`.
- Full `npm run verify` green: format, types, lint, icons:verify, 60 unit tests, build, bundle check, 10 Playwright tests.

### Phase 4 pickup

Containment/host placement, subnet manager + NIC editor, all 8 link kinds with validation, helper lines, clipboard, context menus, command palette.

## Phase 4 — containment, links, editing

### Done

- **Containment**: dropping (or click-placing) a service onto a device sets `placement.hostId`; guests (LXC/VM) are hosted the same way. The device card shows an `N svc` badge, the inspector lists its hosted services, and a derived dashed tether edge links host → service without storing anything.
- **Networks**: subnet manager in the inspector (create/delete, name/CIDR/purpose/VLAN/gateway shown), per-NIC subnet selector, IP field with validation, and a one-click "assign next free address" using `lib/net/ipv4.nextFreeIp` against every address in the project.
- **Editing**: full inspector for services (host, image, ports table with add/remove, CPU/RAM, notes) and devices (hostname, role, cores, RAM, OS, NICs add/remove, storage, hosted services), plus project settings (currency, €/kWh, load factor).
- **Links**: link-kind selector in the toolbar (`auto` + all 8 kinds), link inspector with delete, tether edges for hosting.
- **Fix**: the SPA shell is read from disk per request and sent `no-store`, so a rebuild never needs a server restart (a stale shell was serving 404 asset URLs).
- **Tests**: `e2e/editing.spec.ts` — host placement + tether + inspector host field, subnet creation → address allocation, port edit reflected in the node badge, project settings editing.

### Commands

`npm run verify` → pass (60 unit, 14 Playwright).

## Phase 7 — reference designs (done ahead of 5–6)

### Done

- `SeedBuilder` (`src/shared/seeds/builder.ts`): deterministic node/link/subnet/cluster ids, deterministic inner ids (NICs, disks, ports, volumes, env), helpers for devices, services, groups, notes, networks, subnets, clusters, links and port/storage lookup. Two builds of a seed are byte-identical apart from the project identity.
- **Homelab (real)**: 65 nodes — Internet, ISP router, `pve` (i5-12600T, 15 GB, UHD 770, NVMe + `/srv/media` + external "Inventory"), 12 guests with their documented addresses (including the broken `ct-110-flaresolverr`), VM 112, transcoder, Steam Deck, `s.mavubo.com` with 24 services, laptop and phone. 4 subnets, 35 links (ethernet/wifi, Tailscale and WireGuard-over-wstunnel tunnels, 12 reverse-proxy hostnames, depends-on, rsync replication). Unknowns are marked `assumed:` in node notes.
- **k3s + CI/CD**: 26 nodes — opnsense, switch with VLANs 10/20, UPS, NAS with a ZFS pool, three Lenovo nodes in a `k3s-prod` frame, MetalLB, cert-manager, Traefik, Gitea + Postgres, 2× act-runner, registry, Argo CD, podinfo + redis, Prometheus/Grafana, plus a CI/CD frame with the pipeline note. 5 subnets, one cluster, ingress hostnames, a restic backup to the NAS.
- Templates are offered on the project list and on the empty canvas, seeded on first boot (`RACKDRAFTER_SEED=1`), creatable through `POST /api/projects {fromSeed}`.
- **Rendering fixes found by looking at the result**: group frames and notes were in the model but never rendered (added `GroupNodeView`, `NoteNodeView`); hosted nodes were given a React Flow `parentId`, which interpreted their absolute coordinates as relative and produced overlapping piles — removed; `fitView` re-fitted on every node addition, so clicks mapped to stale coordinates — replaced with a one-shot fit.

### Tests

`src/shared/seeds/seeds.test.ts` (14 assertions: schema validity, determinism, host/guest wiring, real addresses, service counts, VPS inventory, tunnels, proxy hostnames, subnets; cluster membership, namespaces, the gitea → runner → registry → argocd chain, ingress list, backup target).
`e2e/templates.spec.ts` (3 flows: both templates open with real content, and a template is editable like any project).

## Still open (Phases 5–6 of PLAN.md)

- Analysis engine: port conflicts, IP/VLAN validation, resource budget, failure impact, cost/power, backup coverage, WAN exposure.
- Full docker-compose and Kubernetes generators (routes exist and emit simplified output), compose import.
- Command palette, frames editing (create/resize), expanded-host view, Web Worker analysis, Firefox/WebKit e2e.

Nothing above is stubbed with fake data: the export endpoints return real, deterministic output for the subset they implement, and the analysis endpoint returns an empty, well-formed result until the rules land.

## Phase 5 — analysis engine (done)

- `analyze(project)` is a pure function in `src/shared/analysis/index.ts`. Rules: `NET000` invalid address, `NET001` duplicate address, `NET002` address outside its subnet, `NET003` overlapping subnets, `NET004` gateway outside its subnet, `NET006` overlay declared but unused, `PORT001` host port conflict (per host, respecting bind addresses), `PORT002` privileged host port, `RES001` RAM overcommit (error) / near-full (warning), `RES002` CPU overcommit, `RES003` required GPU missing, `RES004` disk overcommit, `BAK001` data without backup, `EXP001` admin UI published without auth, `IMP001` single network path, `CYC001` hard dependency cycle, `SVC002` unpinned image, `SVC003` service marked broken. Findings are deterministically ordered (severity, rule, subjects) and honour `settings.disabledRules`.
- `wanExposure(project)` lists every published hostname; `costSummary(project)` computes average draw, kWh/month, power cost and amortised hardware per month from the declared hardware (guests excluded to avoid double counting).
- `GET /api/projects/:id/analysis` now returns `{ findings, counts, exposure, cost }`.
- UI: the findings drawer (open by default, toggleable from the toolbar counter) shows findings with severity filters (click a finding to select its subject), an exposure table and a cost breakdown; the toolbar shows `errors / warnings` and turns red on errors.
- **The rules found a real bug in my own seed**: the VPS registry was published on 5000, colliding with anime-nani; the seed now uses 5008 as documented. Both reference designs analyse with **zero errors** (27 warnings / 10 info for the homelab, 5 warnings / 9 info for k3s — all genuine, e.g. missing backups, admin UIs behind only a TLS proxy, single-cable hosts).
- Tests: `src/shared/analysis/analysis.test.ts` (19 assertions covering every rule, ordering, disabled rules, cost maths, exposure ordering, cycle detection), `e2e/analysis.spec.ts` (4 flows: missing backup, port conflict error, homelab exposure + cost, k3s notes).
- Also fixed: `@fastify/static` was registered with `wildcard: false`, which enumerates files at boot, so a rebuild 404'd its new assets until restart. Now served by path, with the SPA shell read per request and `no-store`.

## Session handover (2026-11-13)

Model chain, as requested: research by Claude Haiku/Sonnet, architecture by Opus (PLAN.md), implementation
by Grok until its balance ran out mid-Phase-3, then Claude Sonnet (5-hour limit), then DeepSeek v4.1 Flash
for the remainder (Phases 3–5, 7 and the fixes above). Everything claimed here was verified by the commands
listed, not assumed.

`npm run verify` = format → typecheck → lint → icons:verify → 93 unit tests → build → bundle budget →
21 Playwright tests. Last run: all green, entry bundle 176 kB gzip against a 500 kB budget.
