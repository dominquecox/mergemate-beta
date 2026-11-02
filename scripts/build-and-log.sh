#!/usr/bin/env bash
# scripts/build-and-log.sh — Unified local build & telemetry runner for MergeMate.
# Supports: ios, android, web (pwa), api
# Captures full terminal output to a local log file, and syncs
# build logs and run metadata to build-host (builds.db & ~/build-mirror/build_logs/)
# so every agent across the mesh can inspect it.

set -o pipefail

TARGET="${1:-ios}"
shift || true

# Environment defaults for mobile builds
export ANDROID_HOME="${ANDROID_HOME:-$HOME/code/.android-sdk}"
if [[ -d "$ANDROID_HOME/platform-tools" ]]; then
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/build-${TARGET}.log"
LATEST_LOG="$LOG_DIR/build-latest.log"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
VERSION="$(node -p "require('./apps/mobile/app.json').expo.version")"

if [[ "$TARGET" == "ios" || "$TARGET" == "android" ]]; then
  if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    echo "Native release requires a clean checkout so the commit identifies the built source." >&2
    exit 1
  fi
  export EAS_BUILD_GIT_COMMIT_HASH="$(git rev-parse HEAD)"
  echo "Native build source: $EAS_BUILD_GIT_COMMIT_HASH; EAS remote counter allocates the next build number."
fi

echo "============================================================"
echo " Starting MergeMate build/check: [$TARGET]"
echo " Repo: $REPO_ROOT | Git SHA: $GIT_SHA | Time: $(date)"
echo " Log file: $LOG_FILE"
echo "============================================================"

# Check reachability to build-host for telemetry
BUILD_HOST="build-host"
BUILD_HOST_ONLINE=0
BUILD_ID=""
if ssh -o BatchMode=yes -o ConnectTimeout=2 "$BUILD_HOST" true 2>/dev/null; then
  BUILD_HOST_ONLINE=1
  # Register start in build-host builds database
  BUILD_ID=$(ssh "$BUILD_HOST" "python3 -c '
import sys, os
sys.path.insert(0, os.path.expanduser(\"~/build-mirror\"))
import builds
try:
    bid = builds.start_build(app=\"mergemate\", platform=\"$TARGET\", build_number=\"$VERSION\", git_commit=\"$GIT_SHA\", trigger_source=\"manual\")
    print(bid)
except Exception:
    sys.exit(1)
'" 2>/dev/null || echo "")
  if [[ -n "$BUILD_ID" ]]; then
    echo " Registered build run #$BUILD_ID on build-host builds.db"
  fi
fi

START_TIME=$(date +%s)
BUILD_STATUS="failed"

# Run the target command
case "$TARGET" in
  ios)
    echo " Executing: cd apps/mobile && eas build --platform ios --local --profile ios-dev $@"
    (cd apps/mobile && eas build --platform ios --local --profile ios-dev "$@") 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]}
    ;;
  android)
    echo " Executing: cd apps/mobile && eas build --platform android --local --profile android-dev $@"
    (cd apps/mobile && eas build --platform android --local --profile android-dev "$@") 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]}
    ;;
  web|pwa)
    echo " Executing: npm run export:web -w @mergemate/mobile"
    npm run export:web -w @mergemate/mobile 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]}
    ;;
  api)
    echo " Executing: npm run typecheck -w @mergemate/api && npm run test -w @mergemate/api"
    (npm run typecheck -w @mergemate/api && npm run test -w @mergemate/api) 2>&1 | tee "$LOG_FILE"
    BUILD_EXIT_CODE=${PIPESTATUS[0]}
    ;;
  *)
    echo "Unknown target: $TARGET (expected: ios, android, web, api)" | tee -a "$LOG_FILE"
    BUILD_EXIT_CODE=2
    ;;
esac

if [[ "$BUILD_EXIT_CODE" -eq 0 ]]; then
  BUILD_STATUS="success"
else
  BUILD_STATUS="failed"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

cp -f "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true
cp -f "$LOG_FILE" "$REPO_ROOT/apps/mobile/build-${TARGET}.log" 2>/dev/null || true

echo "============================================================"
echo " Target [$TARGET] finished with status: $BUILD_STATUS (exit code $BUILD_EXIT_CODE) in ${DURATION}s"
echo " Local log saved: $LOG_FILE"

# Sync to build-host if available
if [[ "$BUILD_HOST_ONLINE" -eq 1 ]]; then
  echo " Syncing build log to $BUILD_HOST:~/build-mirror/build_logs/..."
  ssh "$BUILD_HOST" "mkdir -p ~/build-mirror/build_logs" 2>/dev/null || true
  scp -q "$LOG_FILE" "$BUILD_HOST:~/build-mirror/build_logs/mergemate-${TARGET}-latest.log" 2>/dev/null || true
  scp -q "$LOG_FILE" "$BUILD_HOST:~/build-mirror/build_logs/mergemate-${TARGET}-${TIMESTAMP}.log" 2>/dev/null || true

  # Extract error snippet for db if failed
  ERROR_TAIL=""
  if [[ "$BUILD_STATUS" != "success" ]]; then
    ERROR_TAIL=$(tail -n 80 "$LOG_FILE" | sed "s/'/\\\\'/g")
  fi

  if [[ -n "$BUILD_ID" ]]; then
    ssh "$BUILD_HOST" "python3 -c '
import sys, os
sys.path.insert(0, os.path.expanduser(\"~/build-mirror\"))
import builds
summary = \"MergeMate $TARGET $BUILD_STATUS in ${DURATION}s ($GIT_SHA)\"
err = \"\"\"$ERROR_TAIL\"\"\"
builds.finish_build(int(\"$BUILD_ID\"), \"$BUILD_STATUS\", summary=summary, error_log=err if err else None, duration_seconds=$DURATION)
'" 2>/dev/null || true
    echo " Updated build run #$BUILD_ID on build-host builds.db"
  fi
fi

echo " Log accessible to agents at:"
echo "   - Local file: $LOG_FILE"
echo "   - build host:    ssh build-host 'cat ~/build-mirror/build_logs/mergemate-${TARGET}-latest.log'"
echo "   - Build DB:    ssh build-host 'sqlite3 ~/build-mirror/builds.db \"SELECT * FROM build_runs ORDER BY id DESC LIMIT 1;\"'"
echo "============================================================"

exit $BUILD_EXIT_CODE
