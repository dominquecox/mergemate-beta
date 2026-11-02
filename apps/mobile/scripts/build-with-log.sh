#!/usr/bin/env bash
# apps/mobile/scripts/build-with-log.sh
# Runs local EAS build, captures full logs to a local file, and syncs
# build artifacts & telemetry to build-host (builds.db & ~/build-mirror/build_logs/)
# for all agents across the mesh to inspect.

set -o pipefail

PLATFORM="${1:-ios}"
shift || true

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Usage: $0 [ios|android] [additional eas build flags]"
  exit 1
fi

PROFILE="${PLATFORM}-dev"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

LOG_FILE="$APP_DIR/build-${PLATFORM}.log"
LATEST_LOG="$APP_DIR/build-latest.log"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
BUILD_NUM="0.2.0"

echo "============================================================"
echo " Starting MergeMate $PLATFORM local build ($PROFILE)"
echo " Git SHA: $GIT_SHA | Time: $(date)"
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
    bid = builds.start_build(app=\"mergemate\", platform=\"$PLATFORM\", build_number=\"$BUILD_NUM\", git_commit=\"$GIT_SHA\", trigger_source=\"eas-local\")
    print(bid)
except Exception as e:
    sys.exit(1)
'" 2>/dev/null || echo "")
  if [[ -n "$BUILD_ID" ]]; then
    echo " Registered build run #$BUILD_ID on build-host builds.db"
  fi
fi

# Run the build while streaming output to terminal AND saving to log file
START_TIME=$(date +%s)
BUILD_STATUS="failed"

# Execute eas build with all arguments
if eas build --platform "$PLATFORM" --local --profile "$PROFILE" "$@" 2>&1 | tee "$LOG_FILE"; then
  BUILD_EXIT_CODE=0
  BUILD_STATUS="success"
else
  BUILD_EXIT_CODE=$?
  BUILD_STATUS="failed"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

cp -f "$LOG_FILE" "$LATEST_LOG" 2>/dev/null || true

echo "============================================================"
echo " Build finished with status: $BUILD_STATUS (exit code $BUILD_EXIT_CODE) in ${DURATION}s"
echo " Local log saved: $LOG_FILE"

# Sync to build-host if available
if [[ "$BUILD_HOST_ONLINE" -eq 1 ]]; then
  echo " Syncing build log to $BUILD_HOST:~/build-mirror/build_logs/..."
  ssh "$BUILD_HOST" "mkdir -p ~/build-mirror/build_logs" 2>/dev/null || true
  scp -q "$LOG_FILE" "$BUILD_HOST:~/build-mirror/build_logs/mergemate-${PLATFORM}-latest.log" 2>/dev/null || true
  scp -q "$LOG_FILE" "$BUILD_HOST:~/build-mirror/build_logs/mergemate-${PLATFORM}-${TIMESTAMP}.log" 2>/dev/null || true

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
summary = \"MergeMate $PLATFORM $BUILD_STATUS in ${DURATION}s ($GIT_SHA)\"
err = \"\"\"$ERROR_TAIL\"\"\"
builds.finish_build(int(\"$BUILD_ID\"), \"$BUILD_STATUS\", summary=summary, error_log=err if err else None, duration_seconds=$DURATION)
'" 2>/dev/null || true
    echo " Updated build run #$BUILD_ID on build-host builds.db"
  fi
fi

echo " Log accessible to agents at:"
echo "   - Local: $LOG_FILE"
echo "   - Mesh:  ssh build-host 'cat ~/build-mirror/build_logs/mergemate-${PLATFORM}-latest.log'"
echo "============================================================"

exit $BUILD_EXIT_CODE
