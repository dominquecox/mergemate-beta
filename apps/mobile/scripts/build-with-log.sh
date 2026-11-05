#!/usr/bin/env bash
# Delegate to the local runner; private operator integrations are configured outside the repo.
PLATFORM="${1:-ios}"
shift || true
case "$PLATFORM" in ios|android) ;; *) echo 'Expected ios or android.' >&2; exit 2 ;; esac
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec "$REPO_ROOT/scripts/build-and-log.sh" "$PLATFORM" "$@"
