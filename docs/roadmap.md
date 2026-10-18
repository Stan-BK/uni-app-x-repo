# 开发进程（优先级）

> 文档驱动：完成阶段前先保证对应 ADR 为 `Accepted`。  
> 产品原文：`docs/产品文档.docx`；摘要：`docs/product/prd-summary.md`。  
> **基础设施与云资源升级：** 见 [backend-ops-roadmap.md](./backend-ops-roadmap.md)（ADR-0010）。功能按本文件 P0/P1/P2；中间件/部署按该文档阶段 A–D。

**MVP 边界：** 免费活动发布—发现—报名—组织者名单—后台审核/下架。  
**明确不做（首期）：** 在线支付/退款、签到、评价、候补、分销。  
**已确认后置：** 收费报名 / 支付订单归 **P2** 与运维「阶段 C（有交易再上）」，上线前另立支付 ADR。

---

## P0-0 工程基座

**目标：** monorepo 可安装；文档与 AI 规则就位。

| 项 | 状态 |
| --- | --- |
| ADR-0001 / 0002 | Accepted |
| `apps/mp` 迁入 | Done |
| `apps/api` / `apps/admin` / `packages/shared` 骨架 | Done |
| Cursor rules | Done |
| `pnpm install` 可安装 | Done |

**验收：** 根目录 `pnpm install`；`pnpm dev:mp-weixin` 可启（依赖安装成功后）。

---

## P0-1 身份与权限

**ADR：** [0003](./adr/0003-identity-and-organizer.md)、[0004](./adr/0004-admin-rbac.md)（Accepted）  
**计划：** [docs/superpowers/plans/2026-10-17-p0-1-identity-and-rbac.md](./superpowers/plans/2026-10-17-p0-1-identity-and-rbac.md)

- [x] NestJS + Prisma 正式脚手架与 DB 连接  
- [x] User / Organizer / AdminUser 模型  
- [x] 微信登录适配（抖音/小红书接口预留）  
- [x] 申请组织者 / 发布权限开关（用户侧 apply + PublisherGuard；Admin 审核）  
- [x] Admin 登录与基础角色（API + Admin 最小页）  

**验收：** 无权限不可创建活动；后台未授权不可访问。

---

## P0-2 活动域

**ADR：** 0005

- [ ] 活动字段与校验（时间、分类、费用类型）  
- [ ] 草稿 / 提交审核 / 驳回重提  
- [ ] review_status 与 lifecycle 分离  
- [ ] 组织者「我的活动」列表  

**验收：** PRD AT-ACT-01～05 核心路径。

---

## P0-3 发现与详情

**ADR：** 0006

- [ ] 公开活动列表分页  
- [ ] 活动详情与状态提示  
- [ ] 下架/取消对分享链的处理  

**验收：** 仅展示可公开活动；详情状态正确。

---

## P0-4 免费报名闭环

**ADR：** 0007

- [ ] 报名表单（姓名、手机号）  
- [ ] 服务端二次校验 + 幂等  
- [ ] 名额并发占用  
- [ ] 我的报名 / 组织者报名名单  

**验收：** AT-REG-01～06（含并发与越权）。

---

## P0-5 运营审核与治理

**ADR：** 0008

- [ ] 待审核队列、通过/驳回原因  
- [ ] 下架与取消  
- [ ] 审计日志  
- [ ] 组织者发布权限冻结  

**验收：** AT-ADM-01～06 核心项。

---

## P0-6 端到端验收

**ADR：** 0009

- [ ] mp ↔ api ↔ admin 冒烟脚本/清单  
- [ ] 环境变量与错误码约定  
- [ ] 基础埋点事件（可选最小集）  

**验收：** P0 用例无阻断缺陷，可试运营。

---

## P1（后置）

搜索筛选、取消报名、订阅消息、举报、统计看板、活动开始提醒。

## P2 / 独立里程碑

微信支付、订单状态机、退款、对账（运维阶段 C）；签到；评价；候补；商业化能力。

对应基础设施：引入支付前评估 Redis / MQ；部署仍可为 Docker 单机，峰值前启动阶段 D（多副本 / 主从）。

---

## 基础设施阶段（摘要）

| 运维阶段 | 对应产品 | 关键升级点 |
| --- | --- | --- |
| A 地基 | P0-0～P0-1 | Docker+Nginx、PG 单主、微信登录、HTTPS |
| B 业务闭环 | P0-2～P0-6 | OSS+CDN、配置下发、错误追踪 |
| C 有交易再上 | P2 | 订单/支付/对账；评估 Redis、MQ |
| D 稳定化 | 增长后 | 容器多副本、PG 主从、限流、KMS |

细则与禁止项：[backend-ops-roadmap.md](./backend-ops-roadmap.md)。

---

## 建议开发节奏

每个 P0 阶段按 **api 契约 → shared 类型 → api 实现 → mp/admin UI → 联调** 顺序推进，并提交对应 ADR。  
涉及云资源或中间件变更时，同步核对运维阶段是否已开放。
