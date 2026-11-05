# 云效 Flow：构建 API 镜像并在 ECS 上拉取

运行时仍是 [deploy-docker.md](./deploy-docker.md) 的单机 Compose（Postgres + api + Nginx）。变化只在 **镜像从哪来**：云效 Flow 在构建机里 `docker build` 并推到阿里云容器镜像服务（ACR 个人版，cn-shenzhen），ECS 上只 `docker pull` 然后走现有维护窗发版。ECS 上不再 `pnpm install`，也不 `docker compose build`。

对应 [ADR-0010](./adr/0010-backend-ops-stack.md)。不引入 Redis、MQ 或多副本。

仓库是 `juyouu/deploy-api`。两条域名是同一仓库：

| 用途 | 镜像仓库（不含标签） |
| --- | --- |
| 公网：云效构建推送，以及 VPC 外的 `docker login` | `crpi-zpeirnr1a18s4043.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api` |
| VPC：cn-shenzhen 的 ECS 拉取（避免走公网） | `crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api` |

VPC 域名只给同地域 ECS 拉镜像。云效构建机不在这台 ECS 的 VPC 里，推送用公网域名。

## 1. 一次性准备

### 登录

访问凭证的用户名是 `stan_bk`。密码在 ACR「访问凭证」里设置，只在执行 `docker login` 时输入。不要把密码写进仓库或流水线脚本。

云效推送，或在 VPC 外的机器上登录，用公网域名：

```bash
docker login --username=stan_bk crpi-zpeirnr1a18s4043.cn-shenzhen.personal.cr.aliyuncs.com
```

ECS 拉取走 VPC 域名。Docker 按注册表主机存凭证，公网登录不能代替 VPC 登录。在 **云效主机部署所用的同一个 Linux 用户** 上再登录一次：

```bash
docker login --username=stan_bk crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com
```

登录成功后凭证在该用户的 `~/.docker/config.json`。之后 `./deploy/ctl.sh release --pull` 不再询问密码。

ECS 上仍需 Docker Engine 与 Compose 插件，以及已经按 [deploy-docker.md](./deploy-docker.md) 准备好的 `deploy/.env`（数据库和 JWT，**不是**镜像密码）。`API_IMAGE` 可以留空：流水线每次用环境变量传入当次 VPC 引用。生产仓库目录是 `/opt/activity/uni-app-x-repo`。

## 2. 云效 Flow：镜像构建并推送

流水线增加一个 **Docker 镜像构建并推送到 ACR 个人版** 的任务（地域 cn-shenzhen）。推送地址用公网域名。

| 项 | 值 |
| --- | --- |
| Dockerfile 路径 | `apps/api/Dockerfile` |
| 构建上下文 Context | `.`（仓库根。必填，不能留空） |
| 镜像仓库 | `crpi-zpeirnr1a18s4043.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api` |
| 标签 | `${DATETIME}` |
| 额外标签（可选） | `latest` |

构建上下文必须是仓库根 `.`。这一项留空时，云效把上下文设成 Dockerfile 所在目录 `apps/api`（日志里是 `contextPath is set to: …/apps/api`）。Dockerfile 要复制仓库根的 `pnpm-lock.yaml`、`packages/shared`、`apps/api`、`deploy/npmrc`、`deploy/api-entrypoint.sh`，上下文落在 `apps/api` 时这些 COPY 会失败。

`${DATETIME}` 是云效预定义变量（`yyyyMMddHHmmss`），同一次流水线里构建和部署拿到的是同一个值。发版用这个标签，不要只靠 `latest` 回滚。

`apps/api/Dockerfile` 按国内构建机写过，云效不需要访问 registry-1.docker.io：

- 没有 `# syntax=docker/dockerfile:1`。云效构建机是 Docker 26.1 / buildx，自带的 Dockerfile 前端已经支持 `RUN --mount=type=cache`。写上 syntax 会去 Docker Hub 拉 `docker/dockerfile:1`，国内经常超时。
- 基础镜像默认是 `docker.m.daocloud.io/library/node:20-bookworm-slim`（DaoCloud 同步的官方 `library/node`，清单与 Docker Hub 相同）。构建参数 `NODE_IMAGE` 可覆盖。

缓存挂载仍保留。它不跨构建机保留，第一次构建会下载依赖，这不影响镜像内容。本机改回 Docker Hub 的写法见 [deploy-docker.md](./deploy-docker.md) 第 4 节。

构建成功后，公网上的镜像是：

```text
crpi-zpeirnr1a18s4043.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:${DATETIME}
```

ECS 拉取时把主机名换成 VPC 域名，路径和标签不变：

```text
crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:${DATETIME}
```

## 3. 云效 Flow：主机部署脚本

下一阶段选 **主机部署**，主机组指向生产 ECS（cn-shenzhen）。脚本在 ECS 上执行，不需要脚本里再 SSH。`API_IMAGE` 用 VPC 域名。

云效会在下发前替换 `${DATETIME}`。

```bash
set -euo pipefail
cd /opt/activity/uni-app-x-repo

export API_IMAGE="crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:${DATETIME}"

# 本次如果改了 deploy/ 或 nginx 配置，再打开下一行。镜像本身来自 ACR，不来自 git pull。
# export PULL_DEPLOY_SCRIPTS=1

./deploy/ecs-pull-release.sh
```

`ecs-pull-release.sh` 在 `API_IMAGE` 为空时直接失败，然后执行 `./deploy/ctl.sh release --pull`。不会退回在 ECS 上 `docker build`。

等价写法（不经过包装脚本）：

```bash
set -euo pipefail
cd /opt/activity/uni-app-x-repo
export API_IMAGE="crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:${DATETIME}"
./deploy/ctl.sh release --pull
```

`--pull` 的过程与现在的发版共用维护窗：

1. 打开维护窗，对外 `/api/*` 返回 503 `MAINTENANCE`
2. `docker compose pull api`
3. `docker pull` 同一 VPC 引用（`compose pull` 在服务写了 `build:` 时，失败也可能退出码为 0；这一步用退出码确认镜像真的在本地）
4. `docker compose up -d --no-build`（不在 ECS 上编译；启动时仍执行 `prisma migrate deploy`）
5. 等容器 HEALTHCHECK 变为 `healthy`
6. 关闭维护窗并 reload Nginx，再做公网探活

中途失败时维护窗保持打开。排障后重跑同一命令，或确认就绪后 `./deploy/ctl.sh maintenance off`。

### 只更新部署脚本时

镜像已在 ACR、只改了 `deploy/` 时，可以在上面的脚本里设置 `PULL_DEPLOY_SCRIPTS=1`。包装脚本会先 `git pull --ff-only`，再 `--pull` 发版。工作区有本地修改时 fast-forward 会失败，这是故意的。

## 4. 回滚

用上一块已经推上去的 `${DATETIME}` 标签再跑一次。引用仍用 VPC 域名：

```bash
cd /opt/activity/uni-app-x-repo
export API_IMAGE="crpi-zpeirnr1a18s4043-vpc.cn-shenzhen.personal.cr.aliyuncs.com/juyouu/deploy-api:<上一标签>"
./deploy/ctl.sh release --pull
```

数据库迁移仍是 `prisma migrate deploy`（只向前）。回滚镜像不会自动回滚已执行的 migration。

## 5. 仍要在 ECS 上构建时

不设置 `API_IMAGE`，执行 `./deploy/ctl.sh release` 或 `./deploy/ctl.sh release --build`。这就是原来的 `up -d --build`。`.env` 里如果已经写了 `API_IMAGE`，用 `--build` 可以强制这次在本机构建，且不会把镜像 push 到 ACR。本机构建的基础镜像默认同样来自 DaoCloud；改回 Docker Hub 的 `NODE_IMAGE` 见 [deploy-docker.md](./deploy-docker.md) 第 4 节。
