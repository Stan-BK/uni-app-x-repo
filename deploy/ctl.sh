#!/usr/bin/env bash
# 单机 Docker 栈控制：初次部署 / 发版短停机 / 维护窗 / 日志
# 用法（仓库根或任意目录）：
#   ./deploy/ctl.sh bootstrap|release|up|down|logs|maintenance|health|help
#
# 镜像来源（bootstrap / release / up）：
#   未设置 API_IMAGE：在本机 build（默认，与原先 release 相同）
#   已设置 API_IMAGE，或显式 --pull：compose pull api 后 up -d --no-build
#   显式 --build：即使设置了 API_IMAGE 也在本机构建
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
COMPOSE_FILE="$DEPLOY/docker-compose.yml"
ENV_FILE="$DEPLOY/.env"
RUNTIME_DIR="$DEPLOY/nginx/runtime"
FLAG_FILE="$RUNTIME_DIR/maintenance.on"
PUBLIC_BASE="${PUBLIC_PROBE_BASE:-http://127.0.0.1}"
HEALTH_PATH="/api/health"
WAIT_TIMEOUT_SEC="${WAIT_TIMEOUT_SEC:-300}"
WAIT_INTERVAL_SEC="${WAIT_INTERVAL_SEC:-5}"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# compose pull 在服务同时写了 build 时，失败也可能退出 0。用 docker pull 的退出码确认镜像已取回。
docker_pull() {
  docker pull "$@"
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_env() {
  [[ -f "$ENV_FILE" ]] || die "缺少 $ENV_FILE。先执行: cp deploy/.env.example deploy/.env 并填写密钥"
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# 读 deploy/.env 里某个键的最后一次赋值。不 source，避免把密钥当脚本执行。
env_file_value() {
  local key="$1" line val found=""
  [[ -f "$ENV_FILE" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == export\ * ]]; then
      line="$(trim "${line#export }")"
    fi
    if [[ "$line" == "$key="* ]]; then
      val="${line#"$key="}"
      if [[ "$val" == \"*\" && "$val" == *\" ]]; then
        val="${val:1:${#val}-2}"
      elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
        val="${val:1:${#val}-2}"
      fi
      found="$val"
    fi
  done < "$ENV_FILE"
  printf '%s' "$found"
}

# 设置 DEPLOY_MODE=build|pull 与 RESOLVED_API_IMAGE。
# 优先级：--build / --pull > 当前 shell 的 API_IMAGE > deploy/.env 的 API_IMAGE > 本机构建。
resolve_deploy_mode() {
  local flag_pull=0 flag_build=0 arg
  for arg in "$@"; do
    case "$arg" in
      --pull) flag_pull=1 ;;
      --build) flag_build=1 ;;
      *) die "未知参数: $arg（可用 --pull 或 --build）" ;;
    esac
  done
  if (( flag_pull && flag_build )); then
    die "--pull 与 --build 不能同时使用"
  fi

  if [[ -v API_IMAGE ]]; then
    RESOLVED_API_IMAGE="$(trim "$API_IMAGE")"
  else
    RESOLVED_API_IMAGE="$(trim "$(env_file_value API_IMAGE)")"
  fi

  if (( flag_build )); then
    DEPLOY_MODE=build
  elif (( flag_pull )); then
    DEPLOY_MODE=pull
  elif [[ -n "$RESOLVED_API_IMAGE" ]]; then
    DEPLOY_MODE=pull
  else
    DEPLOY_MODE=build
  fi

  if [[ "$DEPLOY_MODE" == "pull" ]]; then
    [[ -n "$RESOLVED_API_IMAGE" ]] || die "pull 模式需要 API_IMAGE。示例: crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:<tag>"
    [[ "$RESOLVED_API_IMAGE" == */* ]] || die "API_IMAGE 应为带仓库路径的镜像引用（含 /），当前: $RESOLVED_API_IMAGE"
    [[ "$RESOLVED_API_IMAGE" != *"<"* && "$RESOLVED_API_IMAGE" != *">"* && "$RESOLVED_API_IMAGE" != *" "* && "$RESOLVED_API_IMAGE" != *$'\t'* ]] || die "API_IMAGE 仍是占位符或含空白。请换成真实标签，例如 crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000"
    if [[ "$RESOLVED_API_IMAGE" != *:* ]]; then
      echo "警告: API_IMAGE 没有标签，Docker 会按 latest 拉取。发版建议使用云效 DATETIME 标签。" >&2
    fi
  fi
}

apply_stack() {
  local mode="$1"
  if [[ "$mode" == "pull" ]]; then
    echo "镜像: ${RESOLVED_API_IMAGE}"
    # always：即使本地已有同名标签也向仓库核对。不要用默认 never，否则 pull 会被跳过。
    API_PULL_POLICY=always compose pull api
    echo "docker pull ${RESOLVED_API_IMAGE}"
    docker_pull "$RESOLVED_API_IMAGE"
    API_PULL_POLICY=never compose up -d --no-build
  else
    # never：不要尝试从 Docker Hub 拉取本地标签 activity-api:local。--build 仍会重新构建。
    API_PULL_POLICY=never compose up -d --build
  fi
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

nginx_running() {
  compose ps --status running --services 2>/dev/null | grep -qx nginx
}

reload_nginx() {
  if nginx_running; then
    compose exec -T nginx nginx -s reload
    echo "nginx reloaded"
  else
    echo "nginx 未运行，跳过 reload（下次启动会读当前维护开关）"
  fi
}

maintenance_on() {
  ensure_runtime_dir
  touch "$FLAG_FILE"
  reload_nginx
  echo "maintenance: ON（对外 /api/* → 503 MAINTENANCE）"
}

maintenance_off() {
  ensure_runtime_dir
  rm -f "$FLAG_FILE"
  reload_nginx
  echo "maintenance: OFF"
}

maintenance_status() {
  if [[ -f "$FLAG_FILE" ]]; then
    echo "maintenance: ON ($FLAG_FILE)"
  else
    echo "maintenance: OFF"
  fi
}

api_container_id() {
  compose ps -q api 2>/dev/null || true
}

api_health_status() {
  local id
  id="$(api_container_id)"
  [[ -n "$id" ]] || { echo "missing"; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo "unknown"
}

wait_api_healthy() {
  local elapsed=0 status
  echo "等待 api 容器健康（超时 ${WAIT_TIMEOUT_SEC}s）…"
  while (( elapsed < WAIT_TIMEOUT_SEC )); do
    status="$(api_health_status)"
    if [[ "$status" == "healthy" ]]; then
      echo "api: healthy"
      return 0
    fi
    echo "  api=$status  (${elapsed}s)"
    sleep "$WAIT_INTERVAL_SEC"
    elapsed=$((elapsed + WAIT_INTERVAL_SEC))
  done
  die "等待 api 健康超时。查看: ./deploy/ctl.sh logs api"
}

probe_public() {
  local url="${PUBLIC_BASE}${HEALTH_PATH}"
  local code body
  body="$(curl -sS -w '\n%{http_code}' "$url" 2>/dev/null || true)"
  if [[ -z "$body" ]]; then
    echo "public $url: unreachable"
    return 1
  fi
  code="$(echo "$body" | tail -n1)"
  body="$(echo "$body" | sed '$d')"
  echo "public $url → HTTP $code"
  echo "$body"
  [[ "$code" == "200" ]]
}

cmd_bootstrap() {
  require_env
  ensure_runtime_dir
  resolve_deploy_mode "$@"
  maintenance_off
  if [[ "$DEPLOY_MODE" == "pull" ]]; then
    echo "bootstrap: 拉取并启动…"
  else
    echo "bootstrap: 构建并启动…"
  fi
  apply_stack "$DEPLOY_MODE"
  wait_api_healthy
  echo "探活（公网）…"
  if probe_public; then
    echo "bootstrap 完成"
  else
    die "公网探活失败。检查端口 80 与 ./deploy/ctl.sh logs"
  fi
}

cmd_release() {
  require_env
  ensure_runtime_dir
  resolve_deploy_mode "$@"
  echo "release: 打开维护窗…"
  maintenance_on
  if [[ "$DEPLOY_MODE" == "pull" ]]; then
    echo "release: 拉取镜像并滚动替换…"
  else
    echo "release: 构建并滚动替换…"
  fi
  apply_stack "$DEPLOY_MODE"
  wait_api_healthy
  echo "release: 关闭维护窗…"
  maintenance_off
  echo "探活（公网）…"
  if probe_public; then
    echo "release 完成"
  else
    echo "警告: 公网探活未通过；维护窗已关。请检查 logs / health" >&2
    exit 1
  fi
}

cmd_up() {
  require_env
  ensure_runtime_dir
  resolve_deploy_mode "$@"
  apply_stack "$DEPLOY_MODE"
  echo "up 完成（未切换维护窗；当前 $(maintenance_status)）"
}

cmd_down() {
  require_env
  compose down
  echo "down 完成（volume 保留）"
}

cmd_logs() {
  require_env
  if [[ $# -eq 0 ]]; then
    compose logs -f --tail=200
  else
    compose logs -f --tail=200 "$@"
  fi
}

cmd_maintenance() {
  require_env
  ensure_runtime_dir
  local sub="${1:-status}"
  case "$sub" in
    on) maintenance_on ;;
    off) maintenance_off ;;
    status) maintenance_status ;;
    *) die "maintenance 子命令: on|off|status" ;;
  esac
}

cmd_health() {
  require_env
  maintenance_status
  echo "compose:"
  compose ps
  echo "api inspect: $(api_health_status)"
  echo "---"
  if [[ -f "$FLAG_FILE" ]]; then
    echo "维护中：预期公网 /api/health 为 503"
    probe_public || true
  else
    probe_public || true
  fi
}

cmd_help() {
  cat <<'EOF'
用法: ./deploy/ctl.sh <命令> [参数]

命令:
  bootstrap [--pull|--build]  初次部署：确保维护关 → 构建或拉取 → 等健康 → 公网探活
  release [--pull|--build]    发版短停机：维护开 → 构建或拉取 → 等健康 → 维护关 → 探活
  up [--pull|--build]         仅启动，不切换维护窗（本地调试）
  down                        停栈，保留 volume
  logs [服务…]                跟踪日志（默认全部；可 api|nginx|postgres）
  maintenance                 on|off|status
  health                      维护状态 + compose ps + 公网探活
  help                        显示本说明

镜像模式（bootstrap / release / up）:
  默认（未设置 API_IMAGE）  本机 build：up -d --build。与原先发版相同。
  API_IMAGE=<仓库引用>      pull：compose pull api → docker pull → up -d --no-build
  --pull                    强制 pull；未设置 API_IMAGE 时失败（不会退回本机构建）
  --build                   强制本机构建，即使 .env 里写了 API_IMAGE

API_IMAGE 例（ECS 拉取用 VPC 域名）:
  crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000
  当前 shell 中的 API_IMAGE 优先于 deploy/.env。生产流水线请带 --pull，
  或用 ./deploy/ecs-pull-release.sh。ECS 需事先
  docker login --username=stan_bk crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com
  云效推送用公网域名。详见 docs/yunxiao-acr.md。

环境变量（可选）:
  API_IMAGE           预构建镜像引用。空则本机构建
  PUBLIC_PROBE_BASE   公网探活根（默认 http://127.0.0.1）
  WAIT_TIMEOUT_SEC    等 api healthy 超时秒数（默认 300）
  WAIT_INTERVAL_SEC   轮询间隔（默认 5）

维护窗语义:
  touch deploy/nginx/runtime/maintenance.on 后，Nginx 对 /api/*（含 health）
  返回 503 {"code":"MAINTENANCE",...}。就绪判定只看容器 HEALTHCHECK。
  发版结束关闭维护窗时会 reload Nginx，从而重新解析 api 容器地址。
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    bootstrap) cmd_bootstrap "$@" ;;
    release) cmd_release "$@" ;;
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    logs) cmd_logs "$@" ;;
    maintenance) cmd_maintenance "$@" ;;
    health) cmd_health "$@" ;;
    help|-h|--help) cmd_help ;;
    *) die "未知命令: $cmd（./deploy/ctl.sh help）" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
