#!/bin/bash
set -euo pipefail
PLATFORM_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
command -v node >/dev/null 2>&1 || { printf '没有找到现有Node.js，无法操作本平台服务。\n' >&2; exit 1; }
exec node "$PLATFORM_DIR/scripts/local-platform-service.mjs" stop
