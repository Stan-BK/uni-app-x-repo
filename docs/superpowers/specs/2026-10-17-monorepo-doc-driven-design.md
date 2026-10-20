# Monorepo + 文档驱动全栈设计

**日期：** 2026-10-17  
**状态：** Accepted（产品确认）  
**范围：** 仓库形态、技术基线、AI 开发流程、MVP 开发进程

---

## 1. 目标

将活动报名平台整理为 **pnpm monorepo**，用 **PRD 摘要 + ADR + roadmap** 驱动 AI/人工前后端开发，首期交付 **免费活动发现—报名—组织者管理—平台审核** 闭环。

## 2. 仓库结构

```text
/
├── apps/mp          # uni-app Vue3 小程序
├── apps/api         # NestJS + Prisma + PostgreSQL
├── apps/admin       # Vue3 管理后台
├── packages/shared  # 枚举 / DTO / 状态常量 / 契约
├── docs/
│   ├── 技术栈.md
│   ├── roadmap.md
│   ├── product/     # PRD 摘要与待决策
│   └── adr/         # Architecture Decision Records
└── .cursor/rules/   # AI 强制约束
```

## 3. 技术基线

| 层 | 选择 |
| --- | --- |
| 小程序 | 传统 uni-app Vue3 + Vite + Pinia + TS；目标端微信 / 抖音 / 小红书 |
| API | NestJS + Prisma + PostgreSQL |
| Admin | Vue3 + Vite + TS |
| 包管理 | pnpm workspace |
| 支付 | 首期不做；预留费用字段与订单关系 |

不使用：uni-app x、微信云开发作为主后端、Vue2。

## 4. MVP 产品默认（待决策锁值）

| 编号 | 结论 |
| --- | --- |
| D-01 | 普通用户需申请成为组织者后可发布 |
| D-02 | 组织者可直接发布；运营可下架（修订 2026-10-19，见 ADR-0005） |
| D-03 | 首期报名默认直接成功（不做报名审核） |
| D-04 | 名额按有效报名记录数（一人一条） |
| D-05 | 首期不开放在线支付 |
| D-06 | 用户可主动取消报名（P0-4）；系统取消随活动退回/取消/下架 |
| D-07 | 提供独立 Web 管理后台（apps/admin） |
| D-08 | 报名表单首期：姓名 + 手机号 |
| D-09 | 线上活动首期可不做；地点按线下字段 |
| D-10 | 联系方式优先站内/平台策略，避免裸露隐私 |

若业务推翻以上默认，先改 ADR / product 文档，再改代码。

## 5. 文档驱动流程

1. 读 `docs/技术栈.md`、`docs/roadmap.md`、相关 ADR  
2. 跨模块决策先写 ADR 并标 `Accepted`  
3. 按 roadmap 阶段实现垂直切片（mp + api + admin 同阶段联调）  
4. 对照 PRD 验收用例  
5. ADR 更新为 `Implemented`，补充 Consequences  

## 6. 开发阶段（摘要）

详见 `docs/roadmap.md`。

- P0-0 工程基座（本设计落地）  
- P0-1 身份与权限  
- P0-2 活动域  
- P0-3 发现与详情  
- P0-4 免费报名闭环  
- P0-5 运营审核  
- P0-6 端到端验收  
- P1+ 搜索/取消/订阅消息/统计；支付独立里程碑  

## 7. 非目标（首期）

在线支付与退款、扫码签到、评价、候补、优惠券/分销、复杂推荐、多场次系列活动。

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| uni-app 在 monorepo 依赖提升异常 | `.npmrc` shamefully-hoist；mp 独立 filter 构建 |
| 三端登录差异 | 适配层 + ADR-0003 |
| 名额超卖 | 服务端事务/原子占用（ADR-0007） |
| 文档与代码漂移 | Cursor rule 强制先读 docs；roadmap 勾选 |

## 9. 落地清单（本设计批准后）

- [x] 迁入 `apps/mp`，建立 workspace  
- [x] `packages/shared` / `apps/api` / `apps/admin` 骨架  
- [x] ADR、roadmap、product 摘要、Cursor rules  
- [x] `pnpm install` 验证  
- [ ] Nest 正式脚手架（进入 P0-1 plan）  
