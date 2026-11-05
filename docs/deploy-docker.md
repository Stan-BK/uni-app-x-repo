# 空机器：Docker + Nginx 单机

对应 [ADR-0010](./adr/0010-backend-ops-stack.md) 与 [规格](./superpowers/specs/2026-10-21-docker-nginx-single-host-design.md)。本期清单不包含 HTTPS、OSS、Admin 镜像。

**推荐入口：** `./deploy/ctl.sh`（初次部署与发版短停机统一走脚本）。底层仍是 Compose，排障时可直接用 `docker compose`。

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

若宿主机 80 已被占用，先停掉占用进程，不要改 compose 端口。

## 3. 镜像从哪来

`api` 服务同时写了 `image` 和 `build`。`./deploy/ctl.sh` 的 `bootstrap` / `release` / `up` 按下面规则二选一：

| 条件 | 行为 |
| --- | --- |
| 未设置 `API_IMAGE`（默认） | 本机 **build**：`up -d --build`。与原来的发版相同 |
| `API_IMAGE` 为仓库引用，或显式 `--pull` | **pull**：`compose pull api` → `docker pull` → `up -d --no-build` |
| 显式 `--build` | 即使 `.env` 里有 `API_IMAGE`，也在本机构建 |

`API_IMAGE` 写在当前 shell 时，优先于 `deploy/.env`。留空示例见 `deploy/.env.example`。

```bash
# 现有路径：ECS / 本机编译
./deploy/ctl.sh release

# 云效已把镜像推到 ACR 之后（没有 API_IMAGE 会失败，不会退回本机构建）
API_IMAGE=registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:<tag> \
  ./deploy/ctl.sh release --pull
```

生产流水线用 `--pull` 或 `./deploy/ecs-pull-release.sh`。不要在变量可能没注入时裸跑 `./deploy/ctl.sh release`，否则会退回在 ECS 上构建。

拉取步骤、ACR 登录和云效 Flow 字段见 [yunxiao-acr.md](./yunxiao-acr.md)。

本机构建时镜像会打上本地标签 `activity-api:local`（设置了 `API_IMAGE` 时，标签就是该引用，且不会 push）。`pull_policy` 默认 `never`，避免去仓库拉这个本地标签。`up --build` 仍会重新构建。

## 4. API 镜像构建（本机 / ECS）

`apps/api/Dockerfile` 用 BuildKit 缓存挂载（`RUN --mount=type=cache`）保存 pnpm store，构建需要 BuildKit：

- `./deploy/ctl.sh` 和 `docker compose build`（Compose V2）默认走 BuildKit，不用额外开关。
- 直接 `docker build` 时加上 `DOCKER_BUILDKIT=1`（Docker 23+ 默认已开启）。`DOCKER_BUILDKIT=0` 会在解析 `--mount` 时失败。

镜像里的 `pnpm install` / `corepack prepare` 默认使用 `https://registry.npmmirror.com`（构建参数 `NPM_REGISTRY`）。`deploy/npmrc` 只在镜像构建时复制为 `/app/.npmrc`，用来指定 pnpm store 和 `deploy-all-files`。仓库根 `.npmrc` 不改，本机 `pnpm install` 不会被切到国内源。

换源示例：

```bash
DOCKER_BUILDKIT=1 docker build -f apps/api/Dockerfile \
  --build-arg NPM_REGISTRY=https://registry.npmjs.org \
  -t activity-api .
```

依赖清单不变时，安装层会命中 Docker 层缓存，不再访问 registry。安装层需要重跑时，BuildKit 挂载的 pnpm store 仍复用已下载的包。这份 store 不进镜像层：换一台新 ECS 时第一次构建仍会下载（走上面的源），之后再构建会变快。`docker builder prune` 会清掉层缓存和这份 store。

运行阶段不再做第二次 `pnpm install`。构建期 `pnpm deploy` 产出 `/app/apps/api`（含 devDependency 中的 Prisma CLI）。容器启动仍由 `deploy/api-entrypoint.sh` 执行 `prisma migrate deploy`，HEALTHCHECK 不变。

## 5. 初次部署

```bash
./deploy/ctl.sh bootstrap
```

未设置 `API_IMAGE` 时：确保维护窗关闭 → `up -d --build` → 等 api 容器 `healthy` → 公网 `GET /api/health`。

已设置 `API_IMAGE` 时改为拉取该镜像再启动。bootstrap 会先关掉维护窗。首次上机器也可以：

```bash
API_IMAGE=registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:<tag> \
  ./deploy/ctl.sh bootstrap --pull
```

期望：脚本退出 0；`curl -sS http://127.0.0.1/` 为 `ok`；`/api/health` 含 `"status":"ok"`。

## 6. 发版（短停机 + 维护码）

```bash
./deploy/ctl.sh release
```

流程：

1. 打开维护窗（`deploy/nginx/runtime/maintenance.on`）并 reload Nginx  
2. 对外 `/api/*`（**含** `/api/health`）返回 **503**  
   `{"code":"MAINTENANCE","message":"系统升级中，请稍后再试"}`（`Retry-After: 60`）  
3. 本机构建：`up -d --build`。拉取模式：`compose pull api`，再用 `docker pull` 确认引用已在本地，然后 `up -d --no-build`。容器启动仍由 `deploy/api-entrypoint.sh` 执行 `prisma migrate deploy`  
4. **只**等容器内 HEALTHCHECK 变 `healthy`（不看公网 health）  
5. 关闭维护窗（再次 reload Nginx，让它解析到新的 api 容器）→ 公网探活  

`compose pull` 在服务同时写了 `build` 时，拉取失败也可能退出码为 0。所以 pull 模式接着执行 `docker pull "$API_IMAGE"`，用这次的退出码决定发版是否继续。镜像已经在本地时，第二次只做清单核对。

小程序 / Admin 请求层识别 `code: MAINTENANCE` 后会节流提示「系统升级中…」（见 `SystemErrorCode`、`apps/mp/src/utils/request.ts`、`apps/admin/src/api/http.ts`）。

发版中途失败时维护窗会保持开启（对外仍 503）。排障后可：

```bash
./deploy/ctl.sh logs api
./deploy/ctl.sh health
./deploy/ctl.sh release          # 重试，或
./deploy/ctl.sh maintenance off  # 确认已就绪后手动恢复
```

## 7. 常用命令

```bash
./deploy/ctl.sh help
./deploy/ctl.sh up                 # 按 API_IMAGE 构建或拉取，不切维护窗
./deploy/ctl.sh up --build         # 强制本机构建
./deploy/ctl.sh release --pull     # 强制拉取；必须有 API_IMAGE
./deploy/ctl.sh release --build    # 强制本机构建（.env 里即使写了 API_IMAGE）
./deploy/ctl.sh down               # 停栈，保留 volume
./deploy/ctl.sh logs api           # 跟踪日志
./deploy/ctl.sh maintenance on|off|status
./deploy/ctl.sh health             # 维护状态 + compose ps + 公网探活
```

可选环境变量：`PUBLIC_PROBE_BASE`（默认 `http://127.0.0.1`）、`WAIT_TIMEOUT_SEC`（默认 300）。

## 8. 可选冒烟

需本机 Node / pnpm，且临时打开 `AUTH_DEV_BYPASS=true` 后重启 api：

```bash
./deploy/ctl.sh up
# 编辑 deploy/.env 设 AUTH_DEV_BYPASS=true 后再 up，或 compose restart api
API_BASE=http://127.0.0.1/api pnpm --filter @activity/api smoke
```

跑完把 `AUTH_DEV_BYPASS` 改回空并 `./deploy/ctl.sh up`。

## 9. 等价底层命令（排障）

本机构建：

```bash
API_PULL_POLICY=never docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

从 ACR 拉取（先在 ECS 上 `docker login registry.cn-shenzhen.aliyuncs.com`）：

```bash
export API_IMAGE=registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:<tag>
API_PULL_POLICY=always docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull api
docker pull "$API_IMAGE"
API_PULL_POLICY=never docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --no-build
```

日志：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f api
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down
```

`down` 默认保留 volume。`down -v` 会删除 Postgres 数据和封面上传，确认后再用。

## 10. 云效 Flow

构建在云效、ECS 只拉取的清单和主机脚本见 [yunxiao-acr.md](./yunxiao-acr.md)。运行时仍是这一份 Compose（Postgres + api + Nginx），不在服务器上 `pnpm install` / `docker build`。
