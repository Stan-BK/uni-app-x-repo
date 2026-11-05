#!/usr/bin/env bash
# 云效主机部署入口。在 ECS 的仓库目录执行：只拉取 ACR 镜像，不在服务器上 pnpm / docker build。
#
# 用法:
#   API_IMAGE=registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:<tag> \
#     ./deploy/ecs-pull-release.sh
#
# 可选: PULL_DEPLOY_SCRIPTS=1 时先 git pull --ff-only，用来更新 deploy/ 脚本和 nginx 配置。
# 镜像内容来自 ACR，不来自这次 git pull。
#
# 未设置 API_IMAGE 时直接失败，不会退回 ./deploy/ctl.sh release 的本机构建。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${API_IMAGE:-}" ]]; then
  echo "error: 请设置 API_IMAGE 为 ACR 镜像引用，例如 registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:20261105120000" >&2
  exit 1
fi

if [[ "${PULL_DEPLOY_SCRIPTS:-}" == "1" ]]; then
  echo "更新仓库脚本（git pull --ff-only）…"
  git pull --ff-only
fi

exec ./deploy/ctl.sh release --pull
