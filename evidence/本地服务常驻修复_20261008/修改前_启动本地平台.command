#!/bin/bash
set -euo pipefail

PLATFORM_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLATFORM_URL="http://127.0.0.1:4173"
PLATFORM_MODE="${1:-}"
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
cd "$PLATFORM_DIR"

fail() {
  printf '\n无法启动：%s\n' "$1" >&2
  if [[ -t 0 && "$PLATFORM_MODE" != "--check" ]]; then
    read -r -p "按回车关闭此窗口。" _platform_acknowledgement || true
  fi
  exit 1
}

case "${1:-}" in
  ""|--check) ;;
  *) fail "不支持的参数；检查入口可使用 --check。" ;;
esac

command -v node >/dev/null 2>&1 || fail "没有找到 Node.js。请先准备 Node.js 20.19（20.x）或 22.12 及以上版本。"
command -v npm >/dev/null 2>&1 || fail "没有找到 npm，请检查现有 Node.js 安装。"
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit((major===20&&minor>=19)||(major===22&&minor>=12)||major>22?0:1)' || fail "当前 Node.js 版本不符合本版依赖要求。"

for platform_file in package.json package-lock.json public/data/manifest.json public/data/scene.json public/data/macro_nodes.geojson public/data/regional_green_points.geojson public/data/regional_roads_2021.geojson; do
  [[ -f "$platform_file" ]] || fail "缺少 $platform_file。请保留完整平台文件夹与展示资料。"
done

if [[ "${1:-}" == "--check" ]]; then
  [[ -x node_modules/.bin/vite ]] || fail "依赖尚未完整准备；本次检查没有安装或删除依赖。"
  printf '启动入口检查完成。\n平台目录：%s\nNode.js：%s\n本机地址：%s\n已有依赖与数据保留。\n' "$PLATFORM_DIR" "$(node --version)" "$PLATFORM_URL"
  exit 0
fi

if [[ ! -d node_modules ]]; then
  printf '按现有依赖锁文件准备本地运行环境。\n'
  npm ci --no-audit --no-fund || fail "依赖准备失败。请检查网络后重开；没有修改科研源件。"
fi
[[ -x node_modules/.bin/vite ]] || fail "现有依赖目录不完整，已保留原目录，请修复后重开。"

# Reuse only a server serving this exact display manifest. Never stop another process.
if curl --fail --silent --max-time 3 "$PLATFORM_URL/data/manifest.json" | node -e 'const fs=require("node:fs");const local=fs.readFileSync(process.argv[1]);const served=fs.readFileSync(0);process.exit(local.equals(served)?0:1)' "$PLATFORM_DIR/public/data/manifest.json"; then
  printf '本平台已在运行，打开已有页面：%s\n' "$PLATFORM_URL"
  open "$PLATFORM_URL"
  exit 0
fi
if lsof -nP -iTCP:4173 -sTCP:LISTEN >/dev/null 2>&1; then
  fail "4173 端口已有其他服务，且不是当前显示包。请先处理该服务后重开；没有停止任何进程。"
fi

printf '正在打开本地平台：%s\n保持此窗口打开；按 Control+C 停止本次服务。\n' "$PLATFORM_URL"
(
  for platform_attempt in {1..60}; do
    if curl --fail --silent --max-time 1 "$PLATFORM_URL/data/manifest.json" >/dev/null 2>&1; then
      open "$PLATFORM_URL"
      exit 0
    fi
    sleep 0.25
  done
  printf '页面暂未就绪，请查看启动窗口中的运行信息。\n' >&2
) &
exec node "$PLATFORM_DIR/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 4173 --strictPort
