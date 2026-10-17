# Activity Platform（monorepo）

多端活动发现与报名平台：小程序（微信 / 抖音 / 小红书）+ Nest API + Vue 管理后台。

开发方式：**文档 + ADR 驱动**（含 AI 辅助）。先读文档，再改代码。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [docs/技术栈.md](./docs/技术栈.md) | 全栈技术基线 |
| [docs/roadmap.md](./docs/roadmap.md) | 按优先级的开发进程 |
| [docs/product/prd-summary.md](./docs/product/prd-summary.md) | PRD 摘要与 MVP 默认 |
| [docs/adr/](./docs/adr/) | 架构决策留底 |
| [docs/superpowers/specs/2026-10-17-monorepo-doc-driven-design.md](./docs/superpowers/specs/2026-10-17-monorepo-doc-driven-design.md) | Monorepo 设计规格 |

## 仓库结构

```text
apps/mp          # uni-app Vue3 小程序
apps/api         # NestJS API（骨架 → 按 roadmap 完善）
apps/admin       # Vue3 管理后台（骨架）
packages/shared  # 共享枚举 / 契约
docs/            # 产品、技术、ADR、roadmap
```

## 环境

- Node.js **20+**
- **pnpm** 9+（`corepack enable && corepack prepare pnpm@9.15.0 --activate`）

## 安装与常用命令

```bash
pnpm install

# 小程序
pnpm dev:mp-weixin
pnpm dev:mp-toutiao
pnpm dev:mp-xhs

# API / Admin（骨架阶段）
pnpm dev:api
pnpm dev:admin
```

小程序产物在 `apps/mp/dist/dev/<platform>`，用各端开发者工具打开。

## AI 协作约定

见 `.cursor/rules/doc-driven-development.mdc`：先读 docs/ADR，按 `roadmap` 阶段实现，跨模块决策先留 ADR。
