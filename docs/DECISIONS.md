# Decisions

Short records of choices that are not obvious from the code.

## Shared cost is redistributed by the plugin

OpenCost OSS no longer accepts `shareNamespaces`, `shareLabels` or `shareSplit` on the allocation
API. The query keeps those options (`sharedNamespaces`, `sharedLabels`, `shareSplit`) and does the
work itself: it adds `namespace` and the shared labels to the requested aggregate, pools the cost of
shared allocations per step, and hands the pool to the remaining series evenly or weighted by their
total cost. Weights that are all zero fall back to even. Shared cost that has nowhere to go stays as
a `__shared__` series, so the total never changes; the integration test checks that.

## OpenCostAggregateVariable is written by hand

`percli` 0.55.1 has no variable template (`percli plugin generate` offers panel, query and
datasource). The variable follows the layout of the upstream VictoriaLogs plugin's variables: a
folder with `types.ts`, the plugin, its editor and `index.ts`, exposed from `rsbuild.config.ts`.

## Names

The npm package is `@astrona-io/perses-plugin-opencost`, the CUE module
`github.com/astrona-io/perses-plugin-opencost` and the Go module the same, so they match the repository.
Tooling, CI, release, Renovate and README follow the sibling plugin repositories on Perses 0.55.1.
`cue mod tidy --check` passes and the CUE module has no unused dependencies.

## Jest

The scaffold's test setup is Jest with SWC, like the upstream plugins; the tests use it rather than
adding Vitest. The integration test runs in the node environment and talks HTTP through `node:http`,
because Jest's node environment has no global `fetch`.

## Minimum OpenCost version: v1.113.0

The plugin uses `/allocation/compute` with `window` as an RFC 3339 pair, `step`, `accumulate`,
`includeIdle`, `shareIdle`, the v2 filter language (`filter=`), and the `window` of each allocation.
All of these are in OpenCost v1.113.0 and later. It is tested with the Helm chart 2.5.34
(OpenCost 1.121.4).

## Options beyond the brief

- `step`: a fixed step (`1h`, `6h`, `1d`, `1w`) instead of one from the panel width. A daily trend
  needs whole days whatever the panel width.
- `timeZone`: day and week steps start at local midnight. Without it a "day" in Copenhagen would run
  from 01:00 to 01:00 (02:00 in summer).
- `filter`: the OpenCost filter language, so a dashboard variable can narrow the query
  (`label[team]:${team:doublequote}`) without changing the aggregate.
- `fractionOfTotal`: each point divided by the total of its step, for "share of cost" panels.
- `idleOnly`: only the `__idle__` series. With `fractionOfTotal` this is the idle cost share.

## Day alignment and DST

Day and week windows are aligned with `date-fns-tz` to midnight in `timeZone`. OpenCost steps by a
fixed duration, so on a DST day a 24h step drifts by an hour. Each set is therefore stamped with the
local midnight of the day holding its midpoint, and sets that end up on the same day are merged, so
every calendar day has exactly one point.

## Hourly floor

Steps below one hour are raised to one hour. OpenCost 1.121.4 returns empty sets for 10m steps, and
cost data is hourly in practice.

## Currency is display only

The datasource's `currency` (ISO 4217, upper case) labels the numbers; nothing is converted.
Panels show it by setting their format unit to the lower-case code (`usd`, `eur`).

## Component costs do not get shared cost

`cpuCost`, `ramCost` and the other component cost types are the allocation's own component plus its
adjustment. Shared cost is a pool of totals with no split by component, so it is added only to
`totalCost`.

## One allowed proxy path

The plugin calls only `GET /allocation/compute`, also for the variable. A proxied datasource needs
exactly one `allowedEndpoints` entry, and the editor fills it in.
