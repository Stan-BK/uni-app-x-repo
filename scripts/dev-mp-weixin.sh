#!/usr/bin/env bash
# 把当前 worktree 的微信开发产物写到主仓固定目录，并打开微信开发者工具。
set -euo pipefail

if ! command -v git >/dev/null; then
  echo "dev-mp-weixin: 需要 git" >&2
  exit 1
fi

common="$(git rev-parse --path-format=absolute --git-common-dir)"
main="$(cd "$common/.." && pwd)"
out="$main/.mp-preview/mp-weixin"
mkdir -p "$out"
export UNI_OUTPUT_DIR="$out"
echo "UNI_OUTPUT_DIR=$UNI_OUTPUT_DIR"

wechat_cli="${WECHAT_CLI:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"

open_wechat_devtools() {
  if [[ ! -x "$wechat_cli" ]]; then
    echo "dev-mp-weixin: 未找到微信开发者工具 CLI，请手动打开 $out" >&2
    return 0
  fi
  echo "打开微信开发者工具: $out"
  if ! "$wechat_cli" open --project "$out"; then
    echo "dev-mp-weixin: 打开开发者工具失败。请确认已开启「设置 → 安全设置 → 服务端口」，项目路径: $out" >&2
  fi
}

wait_and_open_wechat_devtools() {
  local i
  for i in $(seq 1 90); do
    if [[ -f "$out/app.json" && -f "$out/project.config.json" ]]; then
      open_wechat_devtools
      return 0
    fi
    sleep 1
  done
  echo "dev-mp-weixin: 等待产物超时，未自动打开开发者工具: $out" >&2
}

if [[ -f "$out/app.json" && -f "$out/project.config.json" ]]; then
  open_wechat_devtools &
else
  wait_and_open_wechat_devtools &
fi

pnpm --filter @activity/mp dev:mp-weixin
