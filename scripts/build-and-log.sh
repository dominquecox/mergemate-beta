#!/usr/bin/env bash
# Maintainer-operated local build/check runner. No build or upload runs without invocation.
set -o pipefail
TARGET="${1:-ios}"
shift || true
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1
export ANDROID_HOME="${ANDROID_HOME:-$HOME/code/.android-sdk}"
if [[ -d "$ANDROID_HOME/platform-tools" ]]; then export PATH="$ANDROID_HOME/platform-tools:$PATH"; fi
case "$TARGET" in ios|android|web|pwa|api) ;; *) echo 'Expected ios, android, web, pwa or api.' >&2; exit 2 ;; esac
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/build-${TARGET}.log"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
VERSION="$(node -p 'require("./apps/mobile/app.json").expo.version')"
START_TIME=$(date +%s)
echo "Starting $TARGET at $GIT_SHA; local log: $LOG_FILE"
case "$TARGET" in
  ios|android)
    (cd apps/mobile && eas build --platform "$TARGET" --local --profile "${TARGET}-dev" "$@") 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]} ;;
  web|pwa)
    npm run export:web -w @mergemate/mobile 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]} ;;
  api)
    (npm run typecheck -w @mergemate/api && npm run test -w @mergemate/api) 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]} ;;
esac
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
BUILD_STATUS=failed
if [[ "$BUILD_EXIT_CODE" -eq 0 ]]; then BUILD_STATUS=success; fi
cp "$LOG_FILE" "$LOG_DIR/build-latest.log"
cp "$LOG_FILE" "$REPO_ROOT/apps/mobile/build-${TARGET}.log"
cp "$LOG_FILE" "$REPO_ROOT/apps/mobile/build-latest.log"
echo "$TARGET $BUILD_STATUS in ${DURATION}s (exit $BUILD_EXIT_CODE)."
# Optional trusted operator hook. Destinations and credentials belong outside this repository.
if [[ -n "${MERGEMATE_BUILD_LOG_HOOK:-}" ]]; then
  if [[ "$MERGEMATE_BUILD_LOG_HOOK" = /* && -x "$MERGEMATE_BUILD_LOG_HOOK" ]]; then
    "$MERGEMATE_BUILD_LOG_HOOK" "$TARGET" "$BUILD_STATUS" "$GIT_SHA" "$VERSION" "$DURATION" "$LOG_FILE" || echo 'Operator log hook failed; build result is unchanged.' >&2
  else
    echo 'Operator log hook must be an absolute executable path; build result is unchanged.' >&2
  fi
fi
exit "$BUILD_EXIT_CODE"
