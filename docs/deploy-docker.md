# 空机器：Docker + Nginx 单机

对应 [ADR-0010](./adr/0010-backend-ops-stack.md) 与 [规格](./superpowers/specs/2026-10-21-docker-nginx-single-host-design.md)。本期清单不包含 HTTPS、OSS、Admin 镜像。

## 1. 安装

安装 Docker Engine 与 Compose 插件。确认：

```bash
docker version
docker compose version
```

## 2. 配置

```bash
cp deploy/.env.example deploy/.env
```

至少修改 `POSTGRES_PASSWORD`、`JWT_USER_SECRET`、`JWT_ADMIN_SECRET`。`DATABASE_URL` 的用户/密码/库名必须与 `POSTGRES_*` 一致，主机名保持 `postgres`。

`PUBLIC_API_BASE` 在只有本机访问时用 `http://127.0.0.1/api`；局域网真机预览改成 `http://<宿主机局域网IP>/api`（无尾斜杠）。

`AUTH_DEV_BYPASS` 保持空。只有要跑 API 冒烟时才设为 `true`。

不要把 `deploy/.env` 提交进 git。

## 3. 启动

若宿主机 80 已被占用，先停掉占用进程，不要改 compose 端口。

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl -sS http://127.0.0.1/
curl -sS http://127.0.0.1/api/health
```

期望：`/` 为 `ok`；`/api/health` 含 `"status":"ok"`。

## 4. 可选冒烟

需本机 Node / pnpm，且临时打开 `AUTH_DEV_BYPASS=true` 后重启 api：

```bash
API_BASE=http://127.0.0.1/api pnpm --filter @activity/api smoke
```

跑完把 `AUTH_DEV_BYPASS` 改回空并重启 api。

## 5. 日志与停栈

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f api
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down
```

`down` 默认保留 volume。`down -v` 会删除 Postgres 数据和封面上传，确认后再用。
