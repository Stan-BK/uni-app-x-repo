---
name: running-mp-weixin-test-env
description: >-
  Starts the WeChat mini-program local test stack (API + mp-weixin compile + 微信开发者工具).
  Use when the user asks to 跑测试, 启动测试环境, 打开小程序, 微信开发者工具, 联调小程序,
  verify mp-weixin, or run the mini-program test environment.
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
| 真机预览 | 必须是电脑局域网 IP，禁止 `127.0.0.1` |

`VITE_AUTH_DEV_BYPASS=true`。改过 env 必须重启 `dev:mp-weixin` 才会打进产物。

3. **编译微信产物**

```bash
pnpm dev:mp-weixin
```

同样长驻、`all`。日志里应出现 `UNI_OUTPUT_DIR=.../.mp-preview/mp-weixin`，随后 `打开微信开发者工具: ...`。等到 `.mp-preview/mp-weixin/app.json` 存在即视为启动完成。若仍有旧的 `uni -p mp-weixin` 在往 `dist/dev` 写，只停那一个，再启本脚本。脚本已负责打开 IDE，不要再单独跑 `cli open`，除非日志写了找不到 CLI 或打开失败。

导入的是 **主仓 `.mp-preview/mp-weixin`**，不是 `apps/mp`，也不是某个 worktree 的 `dist`。`project.private.config.json` 已关域名校验（`urlCheck: false`）。换分支后不要重导，刷新或等热更新即可。若 `cli open` 失败，让用户开「设置 → 安全设置 → 服务端口」。

**启动到此结束。** 不要截图、不要 Computer Use、不要点模拟器。把 API / 编译 / 产物路径告诉用户即可。

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
