#!/bin/sh
# Stops Perses and deletes the kind cluster.
set -eu
cd "$(dirname "$0")"
podman compose -f compose.yaml down
KIND_EXPERIMENTAL_PROVIDER="${KIND_EXPERIMENTAL_PROVIDER:-podman}" kind delete cluster --name perses-plugin-opencost
