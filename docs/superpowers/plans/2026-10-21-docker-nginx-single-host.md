# Docker + Nginx 单机部署清单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 ADR-0010 把 API + Postgres + Nginx 的 Compose 清单和空机器手册写进仓库，本机 `compose up` 后 `GET /api/health` 为 200。

**Architecture:** 三分服务。`postgres:16` 只内网；`apps/api/Dockerfile` 以**仓库根**为构建上下文（pnpm workspace + `packages/shared`）；entrypoint 先 `prisma migrate deploy` 再启 Nest；Nginx 监听宿主机 80，反代 `/api`，`GET /` 返回 `ok`。不上 443 / Admin / OSS / Sentry。

**Tech Stack:** Docker Compose、Node 20 bookworm-slim、pnpm 9.15.0、NestJS、Prisma、PostgreSQL 16、官方 Nginx

**前置文档：** [设计规格](../specs/2026-10-21-docker-nginx-single-host-design.md)、[ADR-0010](../../adr/0010-backend-ops-stack.md)

---

## 文件结构

```text
.dockerignore
apps/api/Dockerfile
deploy/api-entrypoint.sh
deploy/docker-compose.yml
deploy/.env.example
deploy/nginx/default.conf
deploy/nginx/certs/.gitkeep
docs/deploy-docker.md
docs/backend-ops-roadmap.md          # 阶段 B 补一句清单已进仓库
docs/adr/0010-backend-ops-stack.md   # 实现备注指向 deploy/；状态保持 Accepted
docs/技术栈.md
docs/roadmap.md
docs/superpowers/specs/2026-10-21-docker-nginx-single-host-design.md
```

不改业务代码、Prisma schema、CI。不要提交 `deploy/.env`。

---

### Task 1: `.dockerignore` 与证书占位

**Files:**
- Create: `.dockerignore`
- Create: `deploy/nginx/certs/.gitkeep`

- [ ] **Step 1: 写仓库根 `.dockerignore`**

```
.git
.worktrees
**/node_modules
apps/mp
apps/admin
apps/api/uploads
**/.env
!**/.env.example
**/dist
unpackage
coverage
```

说明：`pnpm-lock.yaml`、`apps/api`、`packages/shared`、`deploy/` **不要**忽略。

- [ ] **Step 2: 证书预留目录**

创建空文件 `deploy/nginx/certs/.gitkeep`（无内容）。不要放真实证书。

- [ ] **Step 3: Commit**

```bash
git add .dockerignore deploy/nginx/certs/.gitkeep
git commit -m "chore: 增加 Docker 构建忽略与证书目录占位"
```

---

### Task 2: Nginx 反代配置

**Files:**
- Create: `deploy/nginx/default.conf`

- [ ] **Step 1: 写入 `deploy/nginx/default.conf`**

```nginx
server {
    listen 80;
    server_name _;

    location = / {
        default_type text/plain;
        add_header Content-Type "text/plain; charset=utf-8";
        return 200 "ok";
    }

    location /api/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

`proxy_pass` **不要**尾斜杠，这样 `/api/health` 原样转到 Nest 的全局前缀 `/api`。

不要写 `listen 443`。不要 `root` 托管 Admin。

- [ ] **Step 2: Commit**

```bash
git add deploy/nginx/default.conf
git commit -m "chore(deploy): Nginx 反代 /api，根路径返回 ok"
```

---

### Task 3: API 镜像与 entrypoint

**Files:**
- Create: `deploy/api-entrypoint.sh`
- Create: `apps/api/Dockerfile`

- [ ] **Step 1: 写 `deploy/api-entrypoint.sh`**

```sh
#!/bin/sh
set -e
cd /app/apps/api
pnpm exec prisma migrate deploy
exec node dist/main.js
```

保存后：`chmod +x deploy/api-entrypoint.sh`

- [ ] **Step 2: 写 `apps/api/Dockerfile`**

构建上下文必须是仓库根。`packageManager` 与根 `package.json` 一致：`pnpm@9.15.0`。

```dockerfile
FROM node:20-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @activity/api... --filter @activity/shared...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @activity/shared build \
    && pnpm --filter @activity/api exec prisma generate \
    && pnpm --filter @activity/api build

FROM base AS runner
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @activity/api... --filter @activity/shared... \
    && pnpm --filter @activity/api exec prisma generate
COPY deploy/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=8 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
```

运行时保留 Prisma CLI（`prisma` 在 `apps/api` 的 `devDependencies` 里，第二阶段 `pnpm install` **不要**加 `--prod`）。

- [ ] **Step 3: Commit**

```bash
git add deploy/api-entrypoint.sh apps/api/Dockerfile
git commit -m "feat(api): 增加可 migrate 的生产 Docker 镜像"
```

---

### Task 4: Compose 与 `deploy/.env.example`

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/.env.example`

- [ ] **Step 1: 写 `deploy/.env.example`**

密钥用占位符，**不要**写真实生产密钥。`AUTH_DEV_BYPASS` 留空（默认关）。`PUBLIC_API_BASE` 走 Nginx 80 而非 3000。

```
POSTGRES_USER=activity
POSTGRES_PASSWORD=change-me-postgres
POSTGRES_DB=activity
DATABASE_URL=postgresql://activity:change-me-postgres@postgres:5432/activity?schema=public
JWT_USER_SECRET=change-me-user
JWT_ADMIN_SECRET=change-me-admin
JWT_EXPIRES_IN=7d
WEIXIN_APPID=
WEIXIN_SECRET=
AUTH_DEV_BYPASS=
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=ChangeMeNow!
PUBLIC_API_BASE=http://127.0.0.1/api
```

不要写 `PORT`/`HOST`（镜像内已固定）。

- [ ] **Step 2: 写 `deploy/docker-compose.yml`**

`build.context` 为上级目录（仓库根）。Postgres **不要** `ports`。API **不要** publish 3000。Nginx 只映射 `80:80`。

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    env_file:
      - .env
    environment:
      HOST: "0.0.0.0"
      PORT: "3000"
    volumes:
      - api_uploads:/app/apps/api/uploads
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
  api_uploads:
```

Postgres healthcheck 用 `$$POSTGRES_USER`，让容器吃自己的环境变量，而不是被 Compose 提前插值成空。

API 的 healthcheck 已在 Dockerfile 里；Compose 用镜像 HEALTHCHECK 即可，不必重复。`nginx` 的 `depends_on: api: condition: service_healthy` 会等该检查通过。

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.yml deploy/.env.example
git commit -m "feat(deploy): 增加 API+Postgres+Nginx Compose 清单"
```

---

### Task 5: 本机构建与探活

**Files:** 无新文件。用 Task 4 的清单。

前置：本机已装 Docker Engine + Compose 插件。若 `80` 被占用，先停占用进程（`lsof -nP -iTCP:80 -sTCP:LISTEN`），**不要改 compose 端口**。

- [ ] **Step 1: 准备未跟踪的 `deploy/.env`**

```bash
cp deploy/.env.example deploy/.env
```

不要 `git add deploy/.env`。

- [ ] **Step 2: 构建**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env build
```

Expected: 退出码 0。失败则根据缺失 COPY / pnpm filter / prisma generate 日志修 Dockerfile，**新 commit** 修，禁止 amend。

- [ ] **Step 3: 启动并探活**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
curl -sS -D- http://127.0.0.1/
curl -sS -D- http://127.0.0.1/api/health
```

Expected:

- `GET /` 状态 200，body 为 `ok`
- `GET /api/health` 状态 200，body 含 `"status":"ok"`

- [ ] **Step 4: 缺环境变量时 API 退出**

跳过 entrypoint 的 migrate，直接跑 `dist/main.js`，以便打到 `assertRequiredEnv`（否则无 postgres 时会先死在 migrate）：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm --no-deps \
  --entrypoint node \
  -e JWT_USER_SECRET= \
  -e JWT_ADMIN_SECRET=change-me-admin \
  -e DATABASE_URL=postgresql://activity:change-me-postgres@postgres:5432/activity \
  api dist/main.js
```

Expected: 非 0 退出，日志含 `JWT_USER_SECRET` 或 `Missing required env`。

然后恢复正常栈：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

- [ ] **Step 5: volume 重启仍在**

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env restart
sleep 5
curl -sS http://127.0.0.1/api/health
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down
docker volume ls | grep postgres_data
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
sleep 8
curl -sS http://127.0.0.1/api/health
```

Expected: `down` **不带** `-v` 时 volume 还在；再次 `up` 后 health 仍 200。不要在验收里 `down -v`。

验收结束后可 `docker compose -f deploy/docker-compose.yml --env-file deploy/.env down` 停栈，保留 volume。

本 Task **无 commit**（没有源码变更）。若 Step 2–5 修了 Dockerfile/compose，每个修复单独 commit。

若本机没有 Docker：停在 Step 2，报告 `DONE_WITH_CONCERNS`，不要假装探活通过。

---

### Task 6: 手册与文档收尾

**Files:**
- Create: `docs/deploy-docker.md`
- Modify: `docs/backend-ops-roadmap.md`
- Modify: `docs/adr/0010-backend-ops-stack.md`
- Modify: `docs/技术栈.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/specs/2026-10-21-docker-nginx-single-host-design.md`

- [ ] **Step 1: 写 `docs/deploy-docker.md`**

```markdown
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
```

- [ ] **Step 2: 更新 `docs/backend-ops-roadmap.md` 阶段 B 表格后追加**

在「### 阶段 B — 业务闭环」表格和「**不做：**」之间插入：

```markdown
**已进仓库：** `deploy/docker-compose.yml`（API + Postgres + Nginx 单机）；手册 `docs/deploy-docker.md`。HTTPS、OSS/CDN、Sentry、配置下发仍后置。
```

- [ ] **Step 3: 更新 ADR-0010 实现备注（状态保持 Accepted）**

把「实现备注」改为：

```markdown
## 实现备注

- 涉及目录：`deploy/`（compose / Nginx / `.env.example`）、`apps/api/Dockerfile`、手册 `docs/deploy-docker.md`。OSS / CDN / Sentry 仍属阶段 B 后续切片。  
- 验收要点：阶段切换时核对 `backend-ops-roadmap.md` §3 表格；未开放阶段不得合并可收款代码。空机器按手册 `compose up` 后 `GET /api/health` 为 200。
```

**不要**把 ADR-0010 改成 Implemented（OSS/Sentry 未做）。

- [ ] **Step 4: 更新 `docs/技术栈.md` 部署行**

「部署（MVP）」单元格改为：

```markdown
| 部署（MVP） | **Docker + Nginx 单机**（仓库 `deploy/`） → 稳定后容器多副本 |
```

- [ ] **Step 5: 更新 `docs/roadmap.md` 运维摘要表 A 行**

```markdown
| A 地基 | P0-0～P0-1 | Docker+Nginx 清单已进 `deploy/`；PG 单主、微信登录；HTTPS 后置 |
```

B 行保持 OSS/CDN、配置下发、错误追踪（尚未做）。不新开产品 P0 阶段。

- [ ] **Step 6: 规格标 Implemented**

`docs/superpowers/specs/2026-10-21-docker-nginx-single-host-design.md`：

- 状态改为 `Implemented`
- 增加：`**实现计划：** [docs/superpowers/plans/2026-10-21-docker-nginx-single-host.md](../plans/2026-10-21-docker-nginx-single-host.md)`
- §7 验收项在 Task 5 通过后全部勾选；若 Docker 不可用则保持未勾并在 commit message 写明

- [ ] **Step 7: 扫禁区**

确认 diff 中无：`listen 443`、Admin Dockerfile、Sentry、Redis、OSS SDK、支付代码、CI 跑 compose。

- [ ] **Step 8: Commit**

```bash
git add docs/deploy-docker.md docs/backend-ops-roadmap.md docs/adr/0010-backend-ops-stack.md docs/技术栈.md docs/roadmap.md docs/superpowers/specs/2026-10-21-docker-nginx-single-host-design.md
git commit -m "docs: Docker+Nginx 单机清单与空机器手册（ADR-0010）"
```

---

## 规格对照

| 规格 | 任务 |
| --- | --- |
| §3 目录/端口/启动顺序 | Task 1–4 |
| §4 环境变量 | Task 4 |
| §5 镜像与 volume | Task 3–4 |
| §6 手册与文档 | Task 6 |
| §7 本机验收 | Task 5 |
| §8 非目标 | Task 6 Step 7 |
