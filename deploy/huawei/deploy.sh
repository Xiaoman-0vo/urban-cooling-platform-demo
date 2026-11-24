#!/bin/sh
# Run on an existing ECS from the repository root; does not provision resources.
set -eu
env_file=${1:-deploy/huawei/.env}
if [ ! -f "$env_file" ]; then
  echo '缺少环境文件。请从 deploy/huawei/.env.example 复制并填写实际 HTTPS 源。' >&2
  exit 2
fi
if [ ! -f deploy/huawei/compose.yaml ]; then
  echo '请在仓库根目录执行。' >&2
  exit 2
fi
docker compose --project-name urbancool-cloud --env-file "$env_file" -f deploy/huawei/compose.yaml config --quiet
docker compose --project-name urbancool-cloud --env-file "$env_file" -f deploy/huawei/compose.yaml up -d --build workbench
echo '应用已启动。请检查容器健康状态、配置 HTTPS 反代并执行 topic1 probe 和账户流程验收。'
docker compose --project-name urbancool-cloud --env-file "$env_file" -f deploy/huawei/compose.yaml ps
