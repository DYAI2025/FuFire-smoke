#!/usr/bin/env bash
# Copy upstream FuFirE OpenAPI spec into this repo for offline-CI testing.
# Usage: scripts/sync-spec.sh [path-to-fufire-checkout]
set -euo pipefail
FUFIRE="${1:-../FuFirE}"
SRC="$FUFIRE/spec/openapi/openapi.json"
DST="$(dirname "$0")/../specs/openapi-current.json"
if [ ! -f "$SRC" ]; then echo "SRC not found: $SRC"; exit 1; fi
cp "$SRC" "$DST"
SHA=$(sha256sum "$DST" | awk '{print $1}' | cut -c1-12)
echo "synced -> $DST  sha256:$SHA"
