#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=${GAME_AGENT_ROOT:-/opt/game-agent}
exec /usr/bin/python3 "$ROOT/ops/agent-society/runner.py" once
