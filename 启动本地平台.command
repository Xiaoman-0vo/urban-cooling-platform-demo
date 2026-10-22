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
  ""|--check|--no-open|--status) ;;
  *) fail "不支持的参数；可使用 --check、--status 或 --no-open。" ;;
esac

command -v node >/dev/null 2>&1 || fail "没有找到 Node.js。请先准备 Node.js 20.19（20.x）或 22.12 及以上版本。"
command -v npm >/dev/null 2>&1 || fail "没有找到 npm，请检查现有 Node.js 安装。"
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit((major===20&&minor>=19)||(major===22&&minor>=12)||major>22?0:1)' || fail "当前 Node.js 版本不符合本版依赖要求。"

if [[ "$PLATFORM_MODE" == "--status" ]]; then
  exec node "$PLATFORM_DIR/scripts/local-platform-service.mjs" status
fi

for platform_file in package.json package-lock.json scripts/local-platform-service.mjs public/data/manifest.json public/data/scene.json public/data/macro_nodes.geojson public/data/regional_green_points.geojson public/data/regional_roads_2021.geojson; do
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

# launchd owns the server, so this launcher and its terminal may exit safely.
node "$PLATFORM_DIR/scripts/local-platform-service.mjs" start || fail "后台启动未完成，请查看上方原因。"
if [[ "$PLATFORM_MODE" != "--no-open" ]]; then
  open "$PLATFORM_URL"
fi
