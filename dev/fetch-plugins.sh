#!/bin/sh
# Copies the Sankey (and, once released, treemap) plugin archives out of their images into archive/.
# The images hold nothing but the archive at their root.
set -eu
cd "$(dirname "$0")"
engine="${CONTAINER_ENGINE:-podman}"

copy_archive() {
  image="$1"
  if ! "$engine" pull -q "$image" >/dev/null 2>&1; then
    echo "skip: $image is not available" >&2
    return 0
  fi
  id="$("$engine" create "$image" /none)"
  "$engine" export "$id" | tar -x -C archive --include='*.tar.gz' 2>/dev/null || "$engine" export "$id" | tar -x -C archive
  "$engine" rm "$id" >/dev/null
  echo "copied $image"
}

copy_archive ghcr.io/astrona-io/perses-plugin-sankey:v0.1.0
copy_archive ghcr.io/astrona-io/perses-plugin-treemap:v0.1.0
ls archive
