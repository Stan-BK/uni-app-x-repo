#!/usr/bin/env bash
# 不启动 Docker。只验证 ctl.sh 的 build/pull 选择和将要执行的 compose 参数。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=ctl.sh
source "$ROOT/deploy/ctl.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local got="$1" want="$2" label="$3"
  [[ "$got" == "$want" ]] || fail "$label: got $(printf %q "$got") want $(printf %q "$want")"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ENV_FILE="$TMP/env"
COMPOSE_LOG="$TMP/compose.log"
PULL_LOG="$TMP/pull.log"

compose() {
  echo "API_PULL_POLICY=${API_PULL_POLICY-<unset>} $*" >>"$COMPOSE_LOG"
}

docker_pull() {
  echo "$*" >>"$PULL_LOG"
}

reset_logs() {
  : >"$COMPOSE_LOG"
  : >"$PULL_LOG"
  unset API_IMAGE || true
  DEPLOY_MODE=""
  RESOLVED_API_IMAGE=""
}

write_env() {
  printf '%s\n' "$@" >"$ENV_FILE"
}

expect_die() {
  local label="$1"
  shift
  if ( "$@"); then
    fail "$label: expected failure"
  fi
}

# --- mode selection ---

reset_logs
write_env "API_IMAGE="
resolve_deploy_mode
assert_eq "$DEPLOY_MODE" "build" "empty API_IMAGE in file"

reset_logs
write_env "# comment" "API_IMAGE=" "POSTGRES_PASSWORD=x"
resolve_deploy_mode
assert_eq "$DEPLOY_MODE" "build" "commented file still builds"

reset_logs
write_env 'API_IMAGE=crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000'
resolve_deploy_mode
assert_eq "$DEPLOY_MODE" "pull" "file API_IMAGE selects pull"
assert_eq "$RESOLVED_API_IMAGE" "crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000" "image from file"

reset_logs
write_env 'export API_IMAGE="crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:from-file"'
resolve_deploy_mode
assert_eq "$RESOLVED_API_IMAGE" "crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:from-file" "strips quotes and export"

reset_logs
write_env 'API_IMAGE=crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:from-file'
API_IMAGE="crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:from-shell"
resolve_deploy_mode
assert_eq "$RESOLVED_API_IMAGE" "crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:from-shell" "shell overrides file"
assert_eq "$DEPLOY_MODE" "pull" "shell image selects pull"

reset_logs
write_env 'API_IMAGE=crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:from-file'
API_IMAGE=""
resolve_deploy_mode
assert_eq "$DEPLOY_MODE" "build" "empty shell API_IMAGE overrides file"

reset_logs
write_env "API_IMAGE="
API_IMAGE="crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000"
resolve_deploy_mode --build
assert_eq "$DEPLOY_MODE" "build" "--build forces build"

reset_logs
write_env "POSTGRES_PASSWORD=x"
resolve_deploy_mode
assert_eq "$DEPLOY_MODE" "build" "missing API_IMAGE key"

reset_logs
write_env "API_IMAGE="
expect_die "--pull without image" resolve_deploy_mode --pull

reset_logs
write_env 'API_IMAGE=activity-api:local'
expect_die "image without slash" resolve_deploy_mode

reset_logs
write_env 'API_IMAGE=crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:<tag>'
expect_die "placeholder image" resolve_deploy_mode

reset_logs
write_env "API_IMAGE="
expect_die "both flags" resolve_deploy_mode --pull --build

reset_logs
write_env 'API_IMAGE=crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000'
API_IMAGE="not a ref"
expect_die "shell whitespace" resolve_deploy_mode --pull

# --- commands that would be issued ---

reset_logs
write_env "API_IMAGE="
resolve_deploy_mode
apply_stack "$DEPLOY_MODE"
assert_eq "$(cat "$COMPOSE_LOG")" "API_PULL_POLICY=never up -d --build" "build compose args"
[[ ! -s "$PULL_LOG" ]] || fail "build mode must not docker pull"

reset_logs
write_env 'API_IMAGE=crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000'
resolve_deploy_mode
apply_stack "$DEPLOY_MODE"
assert_eq "$(sed -n '1p' "$COMPOSE_LOG")" "API_PULL_POLICY=always pull api" "pull compose pull"
assert_eq "$(sed -n '2p' "$COMPOSE_LOG")" "API_PULL_POLICY=never up -d --no-build" "pull compose up"
assert_eq "$(cat "$PULL_LOG")" "crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:20261105120000" "docker pull ref"

# compose file keeps build for the local path and an overridable image/pull policy
grep -q 'image: ${API_IMAGE:-activity-api:local}' "$ROOT/deploy/docker-compose.yml" || fail "compose image default missing"
grep -q 'pull_policy: ${API_PULL_POLICY:-never}' "$ROOT/deploy/docker-compose.yml" || fail "compose pull_policy default missing"
grep -q 'dockerfile: apps/api/Dockerfile' "$ROOT/deploy/docker-compose.yml" || fail "dockerfile path changed"
grep -q '^API_IMAGE=$' "$ROOT/deploy/.env.example" || fail ".env.example must document empty API_IMAGE"

if API_IMAGE= bash "$ROOT/deploy/ecs-pull-release.sh"; then
  fail "ecs-pull-release.sh should fail when API_IMAGE is empty"
fi

echo "ctl.test.sh ok"
