# Plan

Three plugin kinds in one module, `OpenCost`:

| Kind                        | Type            | Does                                                  |
| --------------------------- | --------------- | ----------------------------------------------------- |
| `OpenCostDatasource`        | Datasource      | Where the OpenCost API is: direct URL or Perses proxy |
| `OpenCostAllocationQuery`   | TimeSeriesQuery | Cost from `/allocation/compute` as time series        |
| `OpenCostAggregateVariable` | Variable        | The keys of an aggregation as variable values         |

They feed the panels Perses already has (time series, stat, bar, table) and the panel plugins that
reduce series by their labels (Sankey, treemap).

## Data model

### What OpenCost returns

`GET /allocation/compute?window=<start>,<end>&aggregate=<a,b>&step=<d>&accumulate=<bool>&includeIdle=<bool>&shareIdle=<bool>&filter=<f>`
returns `{code, data: [set, set, ...]}`: one allocation set per step, each a map from the
aggregate key to an allocation. A key joins the values of the aggregate properties with `/`
(`payments/payments-api` for `label:team,namespace`). OpenCost names allocations that have no value
for a property `__unallocated__`, and idle capacity `__idle__` (one per cluster or node, unless
shared). Every allocation has its own `window`, its component costs (`cpuCost`, `ramCost`,
`pvCost`, `networkCost`, `gpuCost`, `loadBalancerCost`, each with an adjustment), `sharedCost`,
`externalCost`, `totalCost` and `totalEfficiency`; any of them may be `null`.

### What the query returns

One Perses series per aggregate key, with a label per aggregate dimension (`label:team` becomes
`team`, `namespace` stays `namespace`) and the name the values joined with `/`. Each point is the
cost of one step, in the datasource's currency, at the start of the step (local midnight for day
and week steps). Missing steps are `0` (cost) or `null` (efficiency). The series metadata carries
the request URL (`executedQueryString`) for the panel inspector, and the currency.

```
allocation sets  ──group by key──▶  per-key sums (cost type, idle, shared)  ──▶  TimeSeries[]
 (one per step)                      redistribute shared cost per step              labels per dim
```

### Shared cost

OpenCost OSS no longer takes `shareNamespaces`, `shareLabels` or `shareSplit`, so the plugin does
it. When `sharedNamespaces` or `sharedLabels` is set, the request adds the properties it needs
(`namespace`, `label:<name>`) to the aggregate, then per step:

1. allocations in a shared namespace or with a shared label value go into a shared pool;
2. the rest are summed under the user's aggregate key;
3. the pool is handed to those keys evenly, or in proportion to their cost (`weighted`); with no
   key left, or all weights zero, it falls back to even, or to a `__shared__` series.

Idle is never part of the pool: it is excluded, its own series, or shared by OpenCost (`shareIdle`).
Component cost types (`cpuCost`, ...) do not get a share of shared cost, because the pool is a total.

### Time

- `accumulate: true` sends one window for the whole range and returns one point per series.
- Otherwise the step is `step` when set, else the smallest of 1h, 2h, 3h, 6h, 12h, 1d, 7d that keeps
  the series under 250 points and is not finer than the panel's suggested step. Below 1h OpenCost
  returns empty sets, so 1h is the floor.
- Steps under a day align the window to whole UTC hours. Day and week steps align it to midnight in
  `timeZone` (IANA name, default UTC), so a day is the calendar day and DST days are 23 or 25 hours.
  OpenCost is sent `24h` steps from the local midnight; a point's timestamp is the local midnight of
  the day that holds the set's midpoint, and sets that land on the same day are merged.

## Component tree

```
src/
├── model/                       pure TypeScript, no React
│   ├── types.ts                 OpenCost response types, __idle__ / __unallocated__ / __shared__
│   ├── client.ts                OpenCostClient, URL and query parameters, error on code != 200
│   ├── window.ts                step parsing, automatic step, window and day alignment
│   ├── aggregate.ts             aggregate validation, label names, shared label parsing
│   ├── transform.ts             sets → series: cost types, idle, shared cost, fraction of total
│   └── selectors.ts             datasource kind and selectors
├── datasources/opencost-datasource/
│   ├── OpenCostDatasource.tsx           createClient (direct URL or proxy URL)
│   └── OpenCostDatasourceEditor.tsx     HTTPSettingsEditor + currency
├── queries/opencost-allocation-query/
│   ├── query.ts                         getTimeSeriesData: variables, window, request, series
│   ├── OpenCostAllocationQuery.tsx      plugin, dependsOn
│   └── OpenCostAllocationQueryEditor.tsx  every option
├── variables/opencost-aggregate-variable/
│   ├── OpenCostAggregateVariable.tsx    getVariableOptions, dependsOn
│   └── OpenCostAggregateVariableEditor.tsx
└── integration/totals.integration.test.ts   against a live OpenCost (dev/)
```

## Schema

`schemas/` has one CUE package per kind, each with a JSON example and `tests/valid` and
`tests/invalid` cases (`percli plugin test-schemas`).

```yaml
kind: OpenCostDatasource
spec:
  directUrl: http://opencost.opencost.svc:9003 # or proxy (HTTPProxy)
  currency: USD # optional, display only

kind: OpenCostAllocationQuery
spec:
  datasource: { kind: OpenCostDatasource, name: opencost } # optional; the default one
  aggregate: [label:team, namespace] # required, at least one
  costType: totalCost # totalCost | cpuCost | ramCost | pvCost | networkCost | gpuCost | efficiency
  idle: exclude # exclude | include | share
  sharedNamespaces: [kube-system]
  sharedLabels: ["team:platform"]
  shareSplit: weighted # even | weighted
  accumulate: false
  step: 1d # whole m, h, d or w; at least 1h
  timeZone: Europe/Copenhagen
  filter: 'namespace:"payments-api"'
  fractionOfTotal: false
  idleOnly: false

kind: OpenCostAggregateVariable
spec:
  datasource: { kind: OpenCostDatasource, name: opencost }
  aggregate: label:team # one property
  filter: 'cluster:"dev-cluster"'
```

## Open questions

- **Assets and cloud cost APIs** (stretch goal, not in 0.1.0): `/assets` would give node, disk and
  load balancer cost per asset, and `/cloudCost` the billed cost of a cloud account. Both fit the
  same query shape (aggregate, window, step) as further query kinds.
- **Sub-hour steps**: OpenCost 1.121 returns empty sets for steps below an hour. If a later version
  fills them, the 1h floor can go.
- **Currency conversion**: the plugin shows the currency OpenCost bills in; it does not convert.
- **Multi-cluster**: works through `aggregate: [cluster, ...]` when one OpenCost sees several
  clusters; one datasource per OpenCost otherwise.
- **Treemap demo**: the treemap dashboard needs the treemap panel plugin, which was not released when
  0.1.0 was built.
