# Dev stack

A local cluster with real OpenCost data, and Perses with this plugin, the Sankey plugin and (once it
is released) the treemap plugin.

| What         | Where                                                            |
| ------------ | ---------------------------------------------------------------- |
| Perses       | http://127.0.0.1:18084/projects/demo                             |
| OpenCost API | http://127.0.0.1:18184/allocation/compute?window=1h              |
| kind cluster | `perses-plugin-opencost` (context `kind-perses-plugin-opencost`) |

Needs podman (or Docker with `CONTAINER_ENGINE=docker` and `KIND_EXPERIMENTAL_PROVIDER` unset),
kind, kubectl, helm, Node.js 24 and percli.

```bash
./up.sh     # cluster, Prometheus, OpenCost, workloads, plugin archive, Perses
./down.sh   # removes Perses and deletes the cluster
```

## What runs

- **kind** (`kind.yaml`): one node. The OpenCost API is published on 127.0.0.1:18184 through the
  NodePort Service in `k8s/opencost-nodeport.yaml`.
- **Prometheus** (`prometheus-values.yaml`, chart `prometheus-community/prometheus` 29.47.2): the
  server only, scraping the kubelet, cAdvisor and OpenCost.
- **OpenCost** (`opencost-values.yaml`, chart `opencost/opencost` 2.5.34, OpenCost 1.121.4): API
  only, with the default on-prem prices, so node, idle and asset costs exist.
- **Workloads** (`k8s/workloads.yaml`): four teams, every namespace and pod labelled `team`.
  `payments` (`payments-api`, and `payments-db` with a 5 GiB volume), `search`, `storefront`, and
  `platform` (`ingress`, `telemetry`). Most pods only hold their requests; two run a small CPU loop
  so usage and efficiency are not flat.
- **Perses** (`compose.yaml`, v0.55.1): the project `demo`, the global datasource `opencost`
  (`provisioning/`), and the dashboards in `dashboards/`. The datasource goes through the Perses
  proxy to the API on the host, with only `GET /allocation/compute` allowed.

The cluster has cost data only from the moment it starts, at hourly resolution: the hourly charts
fill in over the first hours and the daily chart has one bar per day the stack has been up.

## Dashboards

| File                     | Shows                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opencost-overview.json` | Total, allocated, idle share and efficiency; cost per team over time; cost per namespace; cost flow                                                        |
| `cost-flow.json`         | Sankey: team, namespace, controller                                                                                                                        |
| `daily-cost-trend.json`  | Daily cost per team in Europe/Copenhagen, and the idle share per day                                                                                       |
| `cost-treemap.json`      | Treemap: team, namespace, controller. Needs the treemap plugin (`TreemapChart`); until it is in `archive/`, Perses logs that it cannot load this dashboard |

## Integration test

`src/integration/totals.integration.test.ts` compares the plugin's numbers with the raw API:

```bash
OPENCOST_URL=http://127.0.0.1:18184 npm test -- integration
```

Without `OPENCOST_URL` it is skipped.
