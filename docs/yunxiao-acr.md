# 云效 Flow：构建 API 镜像并在 ECS 上拉取

运行时仍是 [deploy-docker.md](./deploy-docker.md) 的单机 Compose（Postgres + api + Nginx）。变化只在 **镜像从哪来**：云效 Flow 在构建机里 `docker build` 并推到阿里云容器镜像服务（ACR），ECS 上只 `docker pull` 然后走现有维护窗发版。ECS 上不再 `pnpm install`，也不 `docker compose build`。

对应 [ADR-0010](./adr/0010-backend-ops-stack.md)。不引入 Redis、MQ 或多副本。

## 1. 一次性准备

### ACR

- 地域：**华南 1（深圳）/ cn-shenzhen**。个人版即可。
- 命名空间：在 ACR 控制台创建。下文用 `<命名空间>` 表示，流水线里配成变量 `ACR_NAMESPACE`。
- 仓库名：**`deploy-api`**（公开或私有都可以；私有时 ECS 必须先登录）。
- 公网地址：`registry.cn-shenzhen.aliyuncs.com`

镜像引用：

```text
registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:<标签>
```

### ECS 登录 ACR（每台机器一次）

在 **云效主机部署所用的同一个 Linux 用户** 上执行。密码是 ACR「访问凭证」里的固定密码或临时密码，不是阿里云登录密码。不要把密码写进仓库。

```bash
docker login registry.cn-shenzhen.aliyuncs.com
```

登录成功后凭证在该用户的 `~/.docker/config.json`。之后 `./deploy/ctl.sh release --pull` 不再询问密码。

ECS 上仍需 Docker Engine 与 Compose 插件，以及已经按 [deploy-docker.md](./deploy-docker.md) 准备好的 `deploy/.env`（数据库和 JWT，**不是**镜像密码）。`API_IMAGE` 可以留空：流水线每次用环境变量传入当次标签。

## 2. 云效 Flow：镜像构建并推送

流水线增加一个 **Docker 镜像构建并推送到 ACR** 的任务（个人版，地域 cn-shenzhen）。

| 项 | 值 |
| --- | --- |
| Dockerfile 路径 | `apps/api/Dockerfile` |
| 构建上下文 Context | 仓库根目录 `.` |
| 镜像仓库 | `registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api` |
| 标签 | `${DATETIME}` |
| 额外标签（可选） | `latest` |

上下文必须是仓库根。Dockerfile 会复制 `pnpm-lock.yaml`、`packages/shared`、`apps/api`、`deploy/npmrc`、`deploy/api-entrypoint.sh`。上下文若填成 `apps/api`，构建会失败。

`${DATETIME}` 是云效预定义变量（`yyyyMMddHHmmss`），同一次流水线里构建和部署拿到的是同一个值。发版用这个标签，不要只靠 `latest` 回滚。

Dockerfile 使用 BuildKit 缓存挂载（`RUN --mount=type=cache`）。云效 Docker 构建任务默认 BuildKit，保持默认即可。缓存挂载不跨构建机保留，第一次构建会下载依赖，这不影响镜像内容。不要为了 ACR 去改 `apps/api/Dockerfile`。

构建成功后的镜像：

```text
registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:${DATETIME}
```

## 3. 云效 Flow：主机部署脚本

下一阶段选 **主机部署**，主机组指向生产 ECS（cn-shenzhen）。脚本在 ECS 上执行，不需要脚本里再 SSH。

云效会在下发前替换 `${ACR_NAMESPACE}` 和 `${DATETIME}`。请在流水线变量里配置 `ACR_NAMESPACE`（命名空间名字，不是密码）。

把仓库目录换成 ECS 上的实际路径：

```bash
set -euo pipefail
cd /opt/activity

export API_IMAGE="registry.cn-shenzhen.aliyuncs.com/${ACR_NAMESPACE}/deploy-api:${DATETIME}"

# 本次如果改了 deploy/ 或 nginx 配置，再打开下一行。镜像本身来自 ACR，不来自 git pull。
# export PULL_DEPLOY_SCRIPTS=1

./deploy/ecs-pull-release.sh
```

`ecs-pull-release.sh` 在 `API_IMAGE` 为空时直接失败，然后执行 `./deploy/ctl.sh release --pull`。不会退回在 ECS 上 `docker build`。

等价写法（不经过包装脚本）：

```bash
set -euo pipefail
cd /opt/activity
export API_IMAGE="registry.cn-shenzhen.aliyuncs.com/${ACR_NAMESPACE}/deploy-api:${DATETIME}"
./deploy/ctl.sh release --pull
```

`--pull` 的过程与现在的发版共用维护窗：

1. 打开维护窗，对外 `/api/*` 返回 503 `MAINTENANCE`
2. `docker compose pull api`
3. `docker pull` 同一引用（`compose pull` 在服务写了 `build:` 时，失败也可能退出码为 0；这一步用退出码确认镜像真的在本地）
4. `docker compose up -d --no-build`（不在 ECS 上编译；启动时仍执行 `prisma migrate deploy`）
5. 等容器 HEALTHCHECK 变为 `healthy`
6. 关闭维护窗并 reload Nginx，再做公网探活

中途失败时维护窗保持打开。排障后重跑同一命令，或确认就绪后 `./deploy/ctl.sh maintenance off`。

### 只更新部署脚本时

镜像已在 ACR、只改了 `deploy/` 时，可以在上面的脚本里设置 `PULL_DEPLOY_SCRIPTS=1`。包装脚本会先 `git pull --ff-only`，再 `--pull` 发版。工作区有本地修改时 fast-forward 会失败，这是故意的。

## 4. 回滚

用上一块已经推上去的 `${DATETIME}` 标签再跑一次主机脚本（或手动）：

```bash
cd /opt/activity
export API_IMAGE="registry.cn-shenzhen.aliyuncs.com/<命名空间>/deploy-api:<上一标签>"
./deploy/ctl.sh release --pull
```

数据库迁移仍是 `prisma migrate deploy`（只向前）。回滚镜像不会自动回滚已执行的 migration。

## 5. 仍要在 ECS 上构建时

不设置 `API_IMAGE`，执行 `./deploy/ctl.sh release` 或 `./deploy/ctl.sh release --build`。这就是原来的 `up -d --build`。`.env` 里如果已经写了 `API_IMAGE`，用 `--build` 可以强制这次在本机构建，且不会把镜像 push 到 ACR。
