You are a senior TypeScript/React (and, where needed, Go/CUE) engineer and Perses contributor. Build the Perses plugin described below in this repository (`perses-plugin-opencost`). Work autonomously: plan, build, test, document. Open a PR when it's done.

---

# Part 1: What to build. OpenCost datasource

**Repo:** `astrona-io/perses-plugin-opencost`
**Plugin kind(s):** Datasource: `OpenCostDatasource`; Query: `OpenCostAllocationQuery` (time series); Variable: `OpenCostAggregateVariable`
**Focus area:** FinOps

## Why
There is no official Perses datasource for OpenCost. OpenCost's Prometheus metrics are building blocks (hourly price per node CPU/RAM/disk, container requests). Turning them into "what did team X cost this month" takes fragile PromQL joins, and some numbers can't be done right that way. OpenCost's **allocation API** computes them correctly:
- **idle cost** (capacity nobody requested), optionally shared across teams
- **shared cost** (kube-system, monitoring, ingress) split fairly
- grouping by namespace, controller, pod, **any label or annotation** (team, cost-center)
- totals that reconcile with the cluster bill

## Data it reads
- The OpenCost HTTP API, through the **Perses backend proxy** (GET only, allow-listed paths). Typical in-cluster URL: the OpenCost service in its namespace (often port 9003).
- Main endpoint: the **allocation** API (window, aggregate, step/accumulate, idle and shared-cost options). **Check the current OpenCost API docs** for exact paths and parameter names; they've changed between versions. Support the current version and note the minimum supported version in the README.
- Stretch: the assets API (node/disk/LB cost) and the cloud cost API, as extra query kinds.

## Query spec: `OpenCostAllocationQuery` (returns time series)
- `aggregate`: one or more of namespace | controller | pod | container | node | `label:<name>` | `annotation:<name>`
- `costType`: totalCost (default) | cpuCost | ramCost | pvCost | networkCost | gpuCost | efficiency
- `idle`: include | exclude | share
- `sharedNamespaces`, `sharedLabels`, `shareSplit`: even | weighted
- `accumulate`: bool. True returns one point per series for the whole window (for the treemap and Sankey). False returns one point per step (for time-series charts).
- Window and step come from the dashboard time range. Map them to OpenCost's window format, and align to whole days where OpenCost requires it.

**Output shape:** one series per aggregate value, with each aggregate dimension as a label (e.g. `team`, `namespace`, `controller`). That makes it plug straight into `perses-plugin-treemap` (`levels: [team, namespace, controller]`) and `perses-plugin-sankey`, with no special handling.

## Variable spec: `OpenCostAggregateVariable`
- Lists values of an aggregate (namespaces, label values such as teams) over the dashboard range.

## Datasource config
- URL, optional auth header via Perses secret, `currency` display (OpenCost's configured currency; never convert), timeout.

## Acceptance criteria
- `dev/`: `kind` cluster + Prometheus + OpenCost (with its Helm chart) + Perses + this plugin + the treemap and Sankey, with some workloads labelled by `team`.
- **For the same window and aggregation, totals match the OpenCost UI/API.** Integration test.
- Accumulate and step modes both work; timezone and day alignment tested.
- Demo dashboards: cost by team → namespace → controller (treemap), cost flow (Sankey), daily cost trend (time series), idle cost share (stat).
- README explains when to use this datasource vs plain OpenCost metrics in Prometheus.

## The plugin family this belongs to
This repo is part of the `astrona-io` Perses plugin set. Already built (read them before you start, and match their structure, tooling, CI and README style):
`perses-plugin-oat-results`, `perses-plugin-sankey`, `perses-plugin-statetimeline`, `perses-plugin-honeycomb`, `perses-plugin-geomap`, `perses-plugin-servicegraph`, all under https://github.com/astrona-io.
Use the same Perses version pin as those repos unless there's a newer stable release, then note it in `docs/DECISIONS.md`.

---

# Part 2: How to build it (Perses plugin guide)

You are building a **Perses plugin** in this repository. Perses is the CNCF
dashboard project (https://github.com/perses/perses). Its core plugins live in
https://github.com/perses/plugins.


## Ground rules

1. **Copy upstream conventions; don't invent your own.** Before writing code, clone
   `perses/plugins` next to this repo and read 2–3 plugins close to this one.
   Panels: `timeserieschart`, `statushistorychart`, `heatmapchart`, `table`.
   Datasources: `prometheus`, `tempo`, `victorialogs`.
   Match their folder layout, `package.json` (including the `perses` section),
   the CUE schema layout, and the rsbuild / module-federation config.
2. **Scaffold with percli. Never hand-build the directory structure.** Install
   `percli` from the Perses GitHub releases (or `brew install perses/tap/percli`).
   Then check the real flags with `percli plugin --help` and
   `percli plugin generate --help`. Flags change between releases, so don't
   trust memory or this file over `--help`.
   - `percli plugin generate …` scaffolds the module or plugin
   - `percli plugin start` runs it against a local Perses dev server
   - `percli plugin test-schemas` validates the CUE schemas and JSON examples
   - `percli plugin build` produces the distributable archive
3. **Use the latest stable Perses release.** Pin `@perses-dev/*` package versions
   to the release you develop against. Write that release in the README.
4. **Use the shared building blocks:**
   - `@perses-dev/plugin-system` for plugin types and hooks (`useDataQueries`,
     time range, variables)
   - `@perses-dev/components` for UI pieces, legends, tooltips and the ECharts wrapper
   - `@perses-dev/core` for value formatting, units and thresholds
   - Reuse the shared CUE types (`common.#format`, `common.#thresholds`, …) in schemas
5. **Theme-aware only.** No hard-coded colours. Use the MUI theme and the Perses
   chart theme so light and dark mode both work.
6. **Accessibility.** Status must never be shown by colour alone. Use icon,
   label or pattern too. Everything clickable must be reachable by keyboard.
7. **Performance.** Stay smooth at the "large" size named in Part 1.
   Memoise transforms. Don't re-render on hover.
8. **Licence.** Apache-2.0, same as Perses. Only add dependencies with
   compatible licences. Prefer libraries already used upstream (ECharts, MUI).
9. **Stay upstreamable.** Write it so it could be offered to `perses/plugins`
   later: same code style, lint config, tests and docs format. Before you start,
   search `perses/plugins` issues and PRs for this plugin. If someone is already
   building it, stop and report that.

## Local dev environment

Add a `dev/` folder with a `docker-compose.yaml` that starts:
- Perses (official image)
- the data backend this plugin needs (usually Prometheus)
- a **fake-data generator** that emits the metrics, logs or API responses in
  Part 1, with realistic labels and some failure cases

Also provision a demo dashboard that uses the plugin (`dev/dashboards/*.json`),
so `docker compose up` followed by `percli plugin start` shows it working.

## Definition of done

- [ ] Scaffolded with `percli`. Layout matches upstream plugins.
- [ ] CUE schema plus at least one JSON example. `percli plugin test-schemas` passes.
- [ ] Grafana migration (`migrate/` CUE) if Part 1 names a Grafana equivalent.
- [ ] Panel options editor for every option in the spec, with sensible defaults.
- [ ] Unit tests (Jest + React Testing Library) for data transforms and rendering.
      Cover the empty state, error state and large-data cases.
- [ ] Works in light and dark theme. Includes screenshots of both in `docs/`.
- [ ] `percli plugin build` produces an archive. CI builds it on every PR.
- [ ] A GitHub Actions release workflow attaches the archive to a GitHub release on `v*` tags.
- [ ] README covers what it does, install, the data it expects, the options, a screenshot,
      and the Perses version it was tested with.
- [ ] Every acceptance criterion in Part 1 is checked off in the PR description.

## Working style

- Plan first. Write `docs/PLAN.md` covering the data model, component tree,
  schema and open questions before writing code.
- Use small commits with conventional messages (`feat:`, `fix:`, `docs:`, `test:`).
- If something in Part 1 is unclear or seems wrong, record your decision in
  `docs/DECISIONS.md` and keep going. Don't stop for the sake of it.
