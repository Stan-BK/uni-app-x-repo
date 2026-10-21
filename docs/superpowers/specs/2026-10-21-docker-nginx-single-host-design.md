# Docker + Nginx 单机部署清单设计规格

- **日期：** 2026-10-21  
- **状态：** Accepted  
- **关联 ADR：** [0010](../../adr/0010-backend-ops-stack.md)（Accepted，选型不变，不新开 ADR）  
- **实现计划：** [docs/superpowers/plans/2026-10-21-docker-nginx-single-host.md](../plans/2026-10-21-docker-nginx-single-host.md)  
- **关联：** [backend-ops-roadmap.md](../../backend-ops-roadmap.md) 阶段 B、[ADR-0009](../../adr/0009-e2e-acceptance-and-observability.md)（health / 环境变量）

## 1. 目标

把 ADR-0010 已定的「Docker + Nginx 单机」写成仓库内可构建清单和空机器手册。本期**不在真实公网机上部署**；验收以本机构建 + `compose up` + 探活为准。

成功标准：`docker compose -f deploy/docker-compose.yml --env-file deploy/.env build` 成功；`up -d` 后宿主机 `curl http://127.0.0.1/api/health` 返回 200 且 body 含 `"status":"ok"`。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 目标 | 镜像 + 手册进仓库，不要求本次真机上线 |
| 栈 | API + Postgres + Nginx 三分服务 Compose |
| 做法 | 分容器；Nginx 反代 `/api`；Postgres 不对外映射 |
| 证书 | `deploy/nginx/certs/` 空目录预留；不上 443 |
| 非目标 | Admin 镜像、OSS/CDN、Sentry、Redis/MQ、多副本、迁移现有开发库、微信合法域名 |

## 3. 目录与端口

| 路径 | 作用 |
| --- | --- |
| `deploy/docker-compose.yml` | 服务 `postgres` / `api` / `nginx` |
| `deploy/.env.example` | 空机器要填的变量；不写真实密钥 |
| `deploy/nginx/default.conf` | 反代 `/api` → `api:3000` |
| `deploy/nginx/certs/` | 空目录（可 `.gitkeep`） |
| `apps/api/Dockerfile` | 多阶段构建；**构建上下文为仓库根** |
| `.dockerignore`（仓库根） | 排除 `node_modules`、`.git`、`apps/mp`、`apps/admin` |
| `docs/deploy-docker.md` | 空机器操作手册 |

**宿主机端口**

- `80` → Nginx → 容器内 API `:3000`（全局前缀 `/api` 不变）
- Postgres 不 publish；API 不 publish `3000`

**启动顺序**

1. Postgres `healthy`（`pg_isready`）
2. API entrypoint：`prisma migrate deploy` → `node dist/main.js`；`GET /api/health` 作为容器 healthcheck（用 Node `fetch`，不额外装 curl）
3. Nginx `depends_on: api: condition: healthy`

命令：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

## 4. 环境变量

`deploy/.env` 从 example 复制。API 启动校验仍只要求 `DATABASE_URL`、`JWT_USER_SECRET`、`JWT_ADMIN_SECRET`（缺则进程退出，容器非 0）。

| 变量 | 用途 |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 官方 Postgres 镜像初始化 |
| `DATABASE_URL` | 指向 compose 服务名 `postgres`，例如 `postgresql://USER:PASS@postgres:5432/DB` |
| `JWT_USER_SECRET` / `JWT_ADMIN_SECRET` | 必填 |
| `PUBLIC_API_BASE` | 封面 URL 前缀；空机器默认 `http://127.0.0.1/api` |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | 可选，首次启动引导管理员 |
| `AUTH_DEV_BYPASS` | 部署 example **默认关闭**（空或不设） |
| `PORT` / `HOST` | 容器内固定 `3000` / `0.0.0.0`，可不写进 .env |

可选沿用：`JWT_EXPIRES_IN`、`WEIXIN_APPID`、`WEIXIN_SECRET`。不新增配置表、不做完整 env schema 库。

## 5. 镜像与数据

**Postgres：** `postgres:16`（与 `docs/技术栈.md` 一致）。named volume 持久化数据。

**API：** Node 20。多阶段：workspace 安装 → 构建 `@activity/shared` + `@activity/api` → 运行时保留 Prisma CLI 以便 `migrate deploy`。镜像内 `PORT=3000` `HOST=0.0.0.0`。`uploads/` 挂 named volume（本地封面；OSS 下期替换）。

**Nginx：** 官方 `nginx` 镜像 + 挂载 `deploy/nginx/default.conf`。`location /api/` 反代 `http://api:3000`；`GET /` 返回纯文本 `ok`（确认 Nginx 存活），不托管 Admin。API 未就绪时 `/api/*` 为 502。

## 6. 手册与文档

`docs/deploy-docker.md` 步骤：

1. 安装 Docker Engine + Compose 插件  
2. 拷仓库；`cp deploy/.env.example deploy/.env` 并改密钥与 `DATABASE_URL`  
3. `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build`  
4. `curl http://127.0.0.1/api/health`  
5. 可选：`API_BASE=http://127.0.0.1/api pnpm --filter @activity/api smoke`（需本机 Node；`AUTH_DEV_BYPASS` 仅在有意跑冒烟时打开）  
6. 看日志、停栈；**删除 volume 会丢掉库和封面**

文档更新（实现时）：

- `backend-ops-roadmap.md` 阶段 B：Docker+Nginx 单机清单已进仓库；HTTPS / OSS / Sentry 仍后置  
- ADR-0010 保持 Accepted；实现备注指向 `deploy/` 与手册  
- `docs/技术栈.md` 部署行改为「仓库内 `deploy/`」  
- `docs/roadmap.md` 运维摘要点明清单已进仓库；不新开产品 P0 阶段  

不进 CI 跑 compose。

## 7. 验收

- [ ] `compose build` 成功  
- [ ] `up` 后宿主机 `GET /api/health` 为 200  
- [ ] 去掉 JWT 或 `DATABASE_URL` 时 API 容器退出且日志含缺失变量名  
- [ ] 重启 compose 后 Postgres 数据与 `uploads` 仍在（volume）  
- [ ] 无 443、无 Admin 镜像、无 OSS/Sentry/Redis/MQ、无支付  

## 8. 非目标（重申）

Let's Encrypt、Admin 静态容器、OSS/CDN、Sentry、Redis、MQ、容器多副本、把开发机已有 PostgreSQL 迁进 compose、微信小程序合法域名与备案。
