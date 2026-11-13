# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-13

### Added

- `OpenCostDatasource`: the OpenCost API, direct or through the Perses proxy (only
  `GET /allocation/compute` needs to be allowed), with an optional display `currency`.
- `OpenCostAllocationQuery`: cost from the allocation API as time series, aggregated by any mix of
  `cluster`, `node`, `namespace`, `controllerKind`, `controller`, `service`, `pod`, `container` and
  `label:<name>`; total, CPU, RAM, PV, network or GPU cost, or cost efficiency.
  - Idle cost excluded, as its own `__idle__` series, or shared over the workloads.
  - Shared cost: the cost of `sharedNamespaces` and `sharedLabels` is handed to the other series,
    evenly or by their cost (`shareSplit`), by the plugin.
  - `accumulate` (one point for the whole range) or steps; `step` (`1h`, `1d`, `1w`, ...) or an
    automatic step from the panel width. Day and week steps start at midnight in `timeZone`.
  - `filter` (OpenCost filter language), `fractionOfTotal` and `idleOnly`.
  - Variables in every text field; `${team:doublequote}` fits OpenCost filters.
- `OpenCostAggregateVariable`: the keys of an aggregation (team names from `label:team`,
  namespaces, ...) as variable values.
- CUE schemas with examples and schema tests, an editor for every option, and a `dev/` stack (kind,
  Prometheus, OpenCost, Perses) with demo dashboards and an integration test against it.
- Releases are built on GitHub: a tag `v<version>` publishes the plugin archive and its checksum on
  the GitHub release and the plugin image as `ghcr.io/astrona-io/perses-plugin-opencost:v<version>`
  (linux/amd64 and linux/arm64), with build provenance attestations.

[Unreleased]: https://github.com/astrona-io/perses-plugin-opencost/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/astrona-io/perses-plugin-opencost/releases/tag/v0.1.0
