# ADR-0001: Monorepo 与全栈技术基线

- **状态：** Accepted
- **日期：** 2026-10-17
- **关联：** docs/技术栈.md、设计规格 2026-10-17-monorepo-doc-driven-design

## 背景

产品为多端小程序活动报名平台，需同时交付用户端、组织者能力、管理后台与 API。双仓会增加契约与 ADR 同步成本；微信云开发与多端（抖音/小红书）目标冲突。

## 决策

1. 采用 **pnpm monorepo**：`apps/mp`、`apps/api`、`apps/admin`、`packages/shared`。  
2. 小程序：**传统 uni-app Vue3 + Vite + Pinia + TypeScript**（不用 uni-app x）。  
3. API：**NestJS + Prisma + PostgreSQL**。  
4. Admin：**Vue3 + Vite + TypeScript**。  
5. 共享枚举/契约放 `packages/shared`；OpenAPI 由 API 导出（后续 ADR 细化）。  
6. 首期 **不做在线支付**，预留费用相关字段；收费报名归产品 P2 / 运维阶段 C（见 ADR-0010）。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 双仓 mp / api | 发布隔离 | 契约与文档易漂移 |
| BaaS（Supabase 等） | 起步快 | 多端身份与审核模型拧巴 |
| 微信云开发 | 微信贴合 | 锁死微信，违背多端 |

## 后果

- 正面：统一文档与类型；AI 可在单仓按 ADR 改全栈。  
- 负面：需处理 uni-app 与 pnpm hoist；根脚本用 filter 隔离构建。  
- 跟进：P0-1 正式 Nest/Prisma 脚手架；更新技术栈文档为全栈基线。
