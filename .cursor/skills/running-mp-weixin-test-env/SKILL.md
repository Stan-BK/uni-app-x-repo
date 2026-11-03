---
name: running-mp-weixin-test-env
description: >-
  Starts the WeChat mini-program local test stack (API + mp-weixin compile + 微信开发者工具).
  Use when the user asks to 跑测试, 启动测试环境, 打开小程序, 微信开发者工具, 联调小程序,
  verify mp-weixin, run the mini-program test environment, 局域网, 局域网服务,
  真机预览, or 切到局域网 IP.
  Do not use for API-only vitest, Admin-only, or production deploy.
---

# 跑小程序测试环境

默认验收面是 **微信开发者工具里的 mp-weixin**，不是 H5，也不是 `vitest`。

在**当前会话的工作分支 / worktree**里启动，但微信产物一律写到主仓固定目录（开发者工具只导入这一次）：

`/Users/kkk/Repositories/uni-app-x-repo/.mp-preview/mp-weixin`

用根脚本 `pnpm dev:mp-weixin`：设 `UNI_OUTPUT_DIR`，编译，并在产物就绪后打开微信开发者工具。不要直接 `pnpm --filter @activity/mp dev:mp-weixin`，那会写回该 worktree 的 `dist/dev/mp-weixin`，也不会开 IDE。旧分支没有包装脚本时：

```bash
OUT="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)/.mp-preview/mp-weixin"
UNI_OUTPUT_DIR="$OUT" pnpm --filter @activity/mp dev:mp-weixin
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" open --project "$OUT"
```

## 启动顺序

已在跑的服务不要杀、不要重拉。先探活，缺哪段补哪段。

1. **探活 API**

```bash
curl -sS http://127.0.0.1:3000/api/health
```

期望 `{ "status": "ok", ... }`。失败再查 `apps/api/.env`（需 `DATABASE_URL` / 两个 JWT secret / `AUTH_DEV_BYPASS=true`），然后：

```bash
pnpm dev:api
```

长驻进程：`block_until_ms: 0`，权限 `all`。等日志出现 `API listening` 或 health 变绿。

2. **确认 mp 环境变量**

读 `apps/mp/.env.development`。没有就从 `apps/mp/.env.example` 复制。

| 场景 | `VITE_API_BASE` |
| --- | --- |
| 开发者工具模拟器 | `http://127.0.0.1:3000/api` 或本机局域网 IP 均可 |
| 真机预览 / 局域网 | 必须是电脑局域网 IP，禁止 `127.0.0.1`（见下一节） |

`VITE_AUTH_DEV_BYPASS=true`。改过 env 必须重启 `dev:mp-weixin` 才会打进产物。

3. **编译微信产物**

```bash
pnpm dev:mp-weixin
```

同样长驻、`all`。日志里应出现 `UNI_OUTPUT_DIR=.../.mp-preview/mp-weixin`，随后 `打开微信开发者工具: ...`。等到 `.mp-preview/mp-weixin/app.json` 存在即视为启动完成。若仍有旧的 `uni -p mp-weixin` 在往 `dist/dev` 写，只停那一个，再启本脚本。脚本已负责打开 IDE，不要再单独跑 `cli open`，除非日志写了找不到 CLI 或打开失败。

导入的是 **主仓 `.mp-preview/mp-weixin`**，不是 `apps/mp`，也不是某个 worktree 的 `dist`。`project.private.config.json` 已关域名校验（`urlCheck: false`）。换分支后不要重导，刷新或等热更新即可。若 `cli open` 失败，让用户开「设置 → 安全设置 → 服务端口」；也可用 `open -a wechatwebdevtools <产物路径>` 兜底，仍失败则让用户手动导入该目录。

**启动到此结束（仅模拟器 / 127.0.0.1）。** 不要截图、不要 Computer Use、不要点模拟器。把 API / 编译 / 产物路径告诉用户即可。

用户说「局域网」「真机预览」「启动局域网服务」时，还要做下一节，不能只起 127.0.0.1。

## 局域网 / 真机预览

手机与电脑须同一 Wi-Fi。真机请求 `127.0.0.1` 会打到手机自己，必须改成电脑局域网 IP。

1. **解析本机局域网 IP**（取默认路由网卡，勿用 utun / 127.0.0.1）：

```bash
LAN="$(ipconfig getifaddr "$(route -n get default | awk '/interface:/{print $2}')")"
echo "$LAN"
```

拿不到再试 `ipconfig getifaddr en0`。

2. **改 API env**（`apps/api/.env`，勿提交）：

```bash
# HOST 须 0.0.0.0，否则局域网访问不到
HOST=0.0.0.0
PORT=3000
PUBLIC_API_BASE=http://$LAN:3000/api
AUTH_DEV_BYPASS=true
```

`PUBLIC_API_BASE` 影响上传返回的图片 URL；与 mp 的 base 主机保持一致。

3. **改 mp env**（`apps/mp/.env.development`，勿提交）：

```bash
VITE_API_BASE=http://$LAN:3000/api
VITE_AUTH_DEV_BYPASS=true
```

4. **重启进程**（改 env 后 nest watch / uni 不一定热更 env）：

- 只停**本 worktree** 的 `dev:api` / `uni -p mp-weixin`（按 PID / 命令行路径匹配），不要 `pkill -f node`。
- 再 `pnpm dev:api`，等 `API listening`。
- 用局域网探活：`curl -sS http://$LAN:3000/api/health` 须 ok。
- 再 `pnpm dev:mp-weixin`（必须重启才会把新 `VITE_API_BASE` 打进产物）。

5. **告诉用户**：当前 LAN IP、`VITE_API_BASE` / `PUBLIC_API_BASE`、产物路径；真机用开发者工具「预览」。IP 变更（换 Wi-Fi）时重复本节。

模拟器可继续用局域网 IP（一般也可）；若只要模拟器且用户未提局域网，可用 `127.0.0.1`，少一次重启。

## 手测（仅当用户明确要求验证页面 / 手测 / 点模拟器）

默认不做。即使用户说了「启动测试环境」「跑测试」「打开小程序」，也只做上一节启动，不当成验收。

只有用户明确要验证页面时，才用 Computer Use 操作「微信开发者工具」，不要用浏览器冒充小程序。

开发旁路登录：`code=dev`（两端 `AUTH_DEV_BYPASS` / `VITE_AUTH_DEV_BYPASS`）。

最小路径：首页列表 → 详情 → 报名/取消 →「我的」。改过 `packages/shared` 枚举或增量编译看起来脏：停掉 `uni -p mp-weixin` 重编，并让用户「清缓存 → 全部清除」。

## 不要做

- 启动测试环境时用 Computer Use 截图或操作微信开发者工具（那是验证，不是启动）
- 用 `pnpm dev:h5` / 浏览器代替小程序验收
- 把「跑测试」理解成 `pnpm --filter @activity/api test`（用户没点名单测时）
- 为了开 mp 去启动 Admin
- `pkill -f node` 或杀掉无关进程
- 提交 `.env` / `.env.development`

API 冒烟（另一条命令，不是本流程默认）：`pnpm --filter @activity/api smoke`（API 已启动且 `AUTH_DEV_BYPASS=true`）。
