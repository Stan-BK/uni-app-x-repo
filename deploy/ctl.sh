#!/usr/bin/env bash
# 单机 Docker 栈控制：初次部署 / 发版短停机 / 维护窗 / 日志
# 用法（仓库根或任意目录）：
#   ./deploy/ctl.sh bootstrap|release|up|down|logs|maintenance|health|help
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

die() {
  echo "error: $*" >&2
  exit 1
}

require_env() {
  [[ -f "$ENV_FILE" ]] || die "缺少 $ENV_FILE。先执行: cp deploy/.env.example deploy/.env 并填写密钥"
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
  maintenance_off
  echo "bootstrap: 构建并启动…"
  compose up -d --build
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
  echo "release: 打开维护窗…"
  maintenance_on
  echo "release: 构建并滚动替换…"
  compose up -d --build
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
  compose up -d --build
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
  bootstrap     初次部署：确保维护关 → up -d --build → 等健康 → 公网探活
  release       发版短停机：维护开 → up -d --build → 等健康 → 维护关 → 探活
  up            仅构建启动，不切换维护窗（本地调试）
  down          停栈，保留 volume
  logs [服务…]  跟踪日志（默认全部；可 api|nginx|postgres）
  maintenance   on|off|status
  health        维护状态 + compose ps + 公网探活
  help          显示本说明

环境变量（可选）:
  PUBLIC_PROBE_BASE   公网探活根（默认 http://127.0.0.1）
  WAIT_TIMEOUT_SEC    等 api healthy 超时秒数（默认 300）
  WAIT_INTERVAL_SEC   轮询间隔（默认 5）

维护窗语义:
  touch deploy/nginx/runtime/maintenance.on 后，Nginx 对 /api/*（含 health）
  返回 503 {"code":"MAINTENANCE",...}。就绪判定只看容器 HEALTHCHECK。
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

main "$@"
