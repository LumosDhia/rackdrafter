# rackdrafter

A drag-and-drop designer for home-server and homelab architectures. You place machines and the
services that run inside them, wire up networks and tunnels, then check the design and generate
configuration from it.

It is not an emulator: it designs, validates and generates. Think "Packet Tracer for homelab",
but declarative.

```
npm ci
npx playwright install --with-deps chromium   # once, for end-to-end tests
npm run dev                                    # http://127.0.0.1:4747
```

`npm start` serves the built app and the API from one process. `npm run verify` runs the whole
gate: format, types, lint, icon verification, unit tests, build, bundle budget and end-to-end tests.

## What it does

**Canvas.** Drag from a 145-item palette (47 devices, 98 services) or press Enter to insert. Move,
multi-select, undo/redo (200 steps), snap to an 8 px grid, minimap, light and dark themes.

**Machines contain services.** Drop a service (or an LXC/VM) onto a device and it is placed there:
the host card shows how many services it carries, its inspector lists them, and a dashed tether
shows the relationship. Guests must sit on a real hypervisor, and the schema enforces it.

**Networks.** Create subnets with a purpose, VLAN, gateway and DHCP range, assign interfaces to
them, and let the allocator hand out the next free address. Ports, volumes, CPU/RAM requests and
physical resources are edited in the inspector.

**Eight link kinds** — ethernet, Wi-Fi, VPN tunnel, reverse proxy, depends-on, replicates-to,
backup-to, mounts — each with its own defaults, styling and connection rules.

**Checks that matter.** The findings drawer runs on every edit: duplicate or out-of-subnet
addresses, overlapping subnets, host-port conflicts, RAM/CPU/disk overcommit, a missing GPU, data
with no backup, admin UIs published without auth, single-cable hosts, dependency cycles and
unpinned images. It also lists what is exposed to the internet and what the design costs in watts
and euros per month.

**Icons are real and bundled.** Service logos come from
[homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons) and
[selfh.st/icons](https://github.com/selfhst/icons), brand marks from
[Simple Icons](https://github.com/simple-icons/simple-icons), device glyphs from
[Tabler](https://github.com/tabler/tabler-icons). `npm run icons:fetch` downloads, sanitises and
pins them (SHA-256 in `icons.lock.json`); `npm run icons:verify` checks them offline. 99 logos and
69 dark-mode variants ship in the repo. Licences and trademark notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Two worked examples, seeded on first run

Both are real projects you can open, edit, duplicate or delete:

- **Homelab (real)** — a Proxmox VE 9 host on a Dell OptiPlex with its twelve LXCs and their
  services, a GPU transcoder, the Steam Deck and laptop as clients, and a public Ubuntu VPS with
  its Docker stack, joined by Tailscale and WireGuard-over-wstunnel. Every value that was not
  documented by the owner is marked `assumed:` in the node notes.
- **k3s cluster + CI/CD** — three machines, MetalLB, cert-manager and Traefik, Gitea with a
  Postgres, two act-runner replicas pushing to a private registry, Argo CD syncing the app, and
  Prometheus/Grafana on the side. The pipeline is spelled out in a note beside the cluster.

## Architecture

One process, one port, one SQLite file.

```
src/shared/    domain model + Zod schema, catalog, link rules, seeds   (no DOM, no Node APIs)
src/server/    Fastify app, routes, SQLite via better-sqlite3 + Drizzle
src/client/    React 19 + @xyflow/react canvas, Zustand store, panels
scripts/icons/ fetch, sanitise, pin and verify the icon set
```

**API** (JSON, Zod-validated): projects CRUD, `PUT /api/projects/:id/document` with optimistic
concurrency (`baseSeq` + document hash, `409` on conflict), version snapshots and restore, share
links at `/s/:token`, `/api/health`, and export endpoints. **Auth** is off by default on loopback;
set `RACKDRAFTER_TOKEN` to require a bearer token (the server refuses to bind a non-loopback address
without one, unless `RACKDRAFTER_INSECURE=1`).

| Variable              | Default                 | Purpose                                  |
| --------------------- | ----------------------- | ---------------------------------------- |
| `PORT`                | `4747`                  | listen port                              |
| `HOST`                | `127.0.0.1`             | bind address                             |
| `RACKDRAFTER_DB`       | `./data/rackdrafter.db` | SQLite file                              |
| `RACKDRAFTER_TOKEN`    | unset                   | enable bearer auth                       |
| `RACKDRAFTER_INSECURE` | unset                   | `1` allows a public bind without a token |
| `RACKDRAFTER_SEED`     | `1`                     | `0` disables first-boot seeding          |

## Commands

| Command                | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | server + Vite in middleware mode, one port, HMR            |
| `npm start`            | production: serves `dist/client` and the API               |
| `npm run build`        | typecheck and build the client                             |
| `npm test`             | Vitest (shared, server, client projects)                   |
| `npm run test:e2e`     | Playwright, Chromium                                       |
| `npm run verify`       | everything, in order                                       |
| `npm run icons:fetch`  | refresh bundled icons and glyphs (network)                 |
| `npm run icons:verify` | offline check of hashes, coverage and licences             |
| `npm run db:reset`     | delete the SQLite file (asks nothing: `--yes` is baked in) |

## Status

Implemented: canvas and catalog, containment, networks and address allocation, the inspector for
devices/services/links/projects, the analysis engine with exposure and cost, persistence (SQLite,
versions, shares), the two reference designs, and the icon pipeline.

Not yet implemented from the plan: the full docker-compose and Kubernetes generators (export
endpoints exist and return real but simplified output), compose import, failure-impact simulation,
and multi-user auth. The plan for those is in
[PLAN.md](PLAN.md); implementation notes and deliberate deviations are in
[IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md).
