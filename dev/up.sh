#!/bin/sh
# Starts the dev stack: kind cluster (podman) with Prometheus, OpenCost and team-labelled workloads,
# then Perses on http://127.0.0.1:18084 with this plugin. Tear it down with ./down.sh.
set -eu
cd "$(dirname "$0")"
export KIND_EXPERIMENTAL_PROVIDER="${KIND_EXPERIMENTAL_PROVIDER:-podman}"
cluster=perses-plugin-opencost
ctx="kind-$cluster"

kind get clusters 2>/dev/null | grep -qx "$cluster" || kind create cluster --config kind.yaml
kubectl --context "$ctx" apply -f k8s/workloads.yaml

helm upgrade --install prometheus prometheus \
  --kube-context "$ctx" --repo https://prometheus-community.github.io/helm-charts --version 29.47.2 \
  --namespace prometheus-system --create-namespace -f prometheus-values.yaml --wait
helm upgrade --install opencost opencost \
  --kube-context "$ctx" --repo https://opencost.github.io/opencost-helm-chart --version 2.5.34 \
  --namespace opencost --create-namespace -f opencost-values.yaml --wait
kubectl --context "$ctx" apply -f k8s/opencost-nodeport.yaml

# Build this plugin's archive unless one is there, and fetch the panel plugins the dashboards use.
if ! ls archive/OpenCost-*.tar.gz >/dev/null 2>&1; then
  (cd .. && npm run build && percli plugin build && mv OpenCost-*.tar.gz dev/archive/)
fi
./fetch-plugins.sh

podman compose -f compose.yaml up -d
echo "OpenCost API: http://127.0.0.1:18184/allocation/compute?window=1h"
echo "Perses:       http://127.0.0.1:${PERSES_PORT:-18084}/projects/demo"
