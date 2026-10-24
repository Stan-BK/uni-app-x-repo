# 开发进程（优先级）

> 文档驱动：完成阶段前先保证对应 ADR 为 `Accepted`。  
> 产品原文：`docs/产品文档.docx`；摘要：`docs/product/prd-summary.md`。  
> **基础设施与云资源升级：** 见 [backend-ops-roadmap.md](./backend-ops-roadmap.md)（ADR-0010）。功能按本文件 P0/P1/P2；中间件/部署按该文档阶段 A–D。

**MVP 边界：** 免费活动发布—发现—报名—所有者名单—后台发布权冻结/下架；**P1-3** 起开放收费报名收款与活动结束结算入账（见 [ADR-0014](./adr/0014-paid-registration-and-settlement.md)）。  
**明确不做（首期 MVP）：** 签到、评价、候补、分销；提现、支付宝、活动结束后退款仍后置 **P2**。  
**有交易能力：** P1-3 微信支付 JSAPI + 结束前退款 + 净额入账（阶段 C 开闸；**P1-3 不强制 Redis/MQ**）。提现与对账深化仍见 P2。

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

**ADR：** [0003](./adr/0003-identity-and-organizer.md)（登录部分仍有效；Organizer 已被 [0011](./adr/0011-default-publish-permission.md) 取代）、[0004](./adr/0004-admin-rbac.md)（Implemented）  
**计划：** [docs/superpowers/plans/2026-10-17-p0-1-identity-and-rbac.md](./superpowers/plans/2026-10-17-p0-1-identity-and-rbac.md)（历史实现；发布权模型见 ADR-0011）

- [x] NestJS + Prisma 正式脚手架与 DB 连接  
- [x] User / AdminUser 模型（Organizer 将按 ADR-0011 拆除）  
- [x] 微信登录适配（抖音/小红书接口预留）  
- [x] 发布权限（历史：申请组织者；现行：`User.canPublish` 默认 true，见 ADR-0011）  
- [x] Admin 登录与基础角色（API + Admin 最小页）  

**验收：** 无权限不可创建活动；后台未授权不可访问。

---

## P0-2 活动域

**ADR：** [0005](./adr/0005-activity-lifecycle-and-model.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-19-p0-2-activity-domain-design.md](./superpowers/specs/2026-10-19-p0-2-activity-domain-design.md)  
**计划：** [docs/superpowers/plans/2026-10-19-p0-2-activity-domain.md](./superpowers/plans/2026-10-19-p0-2-activity-domain.md)

- [x] 活动字段与校验（时间、分类、费用类型 free/paid；不开放收款）  
- [x] 草稿 / 直接发布 / 退回草稿 / 取消活动  
- [x] 单一 lifecycle（无活动审核态）  
- [x] 组织者「我的活动」列表  
- [x] 运营下架 API（`removed`）+ 最小 Admin 操作  

**验收：** AT-ACT-01～03 + 修订后的发布/退回/取消/下架路径（原审核用例不作验收）。

---

## P0-3 发现与详情

**ADR：** [0006](./adr/0006-activity-discovery-and-public-visibility.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md](./superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md)  
**计划：** [docs/superpowers/plans/2026-10-19-p0-3-discovery-and-detail.md](./superpowers/plans/2026-10-19-p0-3-discovery-and-detail.md)

- [x] 公开活动列表分页（仅未结束的 `published`）  
- [x] 标题关键词搜索 + 排序（开始时间 / 发布时间，默认开始）  
- [x] 活动详情与展示态（`upcoming` / `open` / `ended`）  
- [x] 下架/取消/草稿对分享链的处理（无正文错误态；已结束可回顾）  
- [x] 已发布活动分享（微信转发 / H5 系统分享或复制链接，经 adapters）  

**验收：** 仅展示可发现活动；搜索/排序正确；详情与分享链状态正确；published 可分享。

---

## P0-4 免费报名闭环

**ADR：** [0007](./adr/0007-registration-idempotency-and-capacity.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-19-p0-4-free-registration-design.md](./superpowers/specs/2026-10-19-p0-4-free-registration-design.md)  
**计划：** [docs/superpowers/plans/2026-10-19-p0-4-free-registration.md](./superpowers/plans/2026-10-19-p0-4-free-registration.md)

- [x] 报名表单（姓名、手机号）  
- [x] 服务端二次校验 + 幂等  
- [x] 名额并发占用  
- [x] 用户主动取消报名（释放名额；未结束前）  
- [x] 我的报名 / 组织者报名名单  
- [x] 公开 `displayStatus=full` + 生命周期取消报名钩子  

**验收：** AT-REG-01～06（含并发与越权）；用户可取消；P0 仅 `feeType=free` 可报（`paid` 当时拒绝）；收费报名见 **P1-3** / ADR-0014。

---

## P0-5 运营治理（发布权 / 下架 / 审计）

**ADR：** [0008](./adr/0008-operational-governance-audit-logs.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-20-audit-logs-governance-design.md](./superpowers/specs/2026-10-20-audit-logs-governance-design.md)  
**计划：** [docs/superpowers/plans/2026-10-20-audit-logs-governance.md](./superpowers/plans/2026-10-20-audit-logs-governance.md)  
**前置：** [ADR-0011](./adr/0011-default-publish-permission.md) 已落地（去掉 Organizer、用户默认可发布）。

- [x] 去掉 Organizer / 申请流；`User.canPublish` 默认 true（ADR-0011）  
- [x] Admin：冻结/恢复发布权（含原因与审计）  
- [x] 活动下架 UI（API 已有；本期不打磨）  
- [x] 审计日志查询（ADR-0008 本期增量）  

**验收：** AT-ADM 以「冻结发布权 + 下架 + 审计」为准；不再验收「成为组织者」申请队列。

---

## P0-6 端到端验收

**ADR：** [0009](./adr/0009-e2e-acceptance-and-observability.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md](./superpowers/specs/2026-10-21-p0-6-e2e-acceptance-design.md)  
**计划：** [docs/superpowers/plans/2026-10-21-p0-6-e2e-acceptance.md](./superpowers/plans/2026-10-21-p0-6-e2e-acceptance.md)

- [x] mp ↔ api ↔ admin 冒烟脚本/清单  
- [x] 环境变量与错误码约定  
- [x] 基础埋点事件（可选最小集）  

**验收：** P0 用例无阻断缺陷，可试运营。

---

## P1-1 个人展示资料（昵称 / 头像）

**ADR：** [0012](./adr/0012-user-profile-display.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-22-user-profile-display-design.md](./superpowers/specs/2026-10-22-user-profile-display-design.md)  
**计划：** [docs/superpowers/plans/2026-10-22-user-profile-display.md](./superpowers/plans/2026-10-22-user-profile-display.md)

- [x] `PATCH /me` + `POST /me/uploads/avatar`（不要求发布权）  
- [x] 小程序「我的信息」可改昵称 / 头像（微信 chooseAvatar + nickname 输入）  
- [x] 公开主办名随昵称更新；不强制完善资料  

**验收：** 见规格 §9。手机号预填见 P1-2；L1 信息架构不在本期。

---

## P1-2 报名资料预填（姓名 / 手机号）

**ADR：** [0013](./adr/0013-registration-contact-prefill.md)（Implemented）  
**设计：** [docs/superpowers/specs/2026-10-23-registration-contact-prefill-design.md](./superpowers/specs/2026-10-23-registration-contact-prefill-design.md)  
**计划：** [docs/superpowers/plans/2026-10-23-registration-contact-prefill.md](./superpowers/plans/2026-10-23-registration-contact-prefill.md)

- [x] `User.realName` + 开放 `User.phone`；`GET/PATCH /me`  
- [x] 报名成功且有改动时确认后更新预填（幂等已报名不询问）  
- [x] 小程序报名页预填；「我的信息」可改  

**验收：** 见规格 §8。不强制完善；公开接口不出手机号。

---

## P1-3 收费报名与结算入账

**ADR：** [0014](./adr/0014-paid-registration-and-settlement.md)（Accepted）  
**设计：** [docs/superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md](./superpowers/specs/2026-10-24-paid-registration-and-settlement-design.md)  
**计划：** [支付与退款](./superpowers/plans/2026-10-24-paid-registration-payment.md)、[结算入账](./superpowers/plans/2026-10-24-activity-settlement-wallet.md)

- [ ] 支付与退款（JSAPI、`pending_payment` 占名额、关单、回调幂等、结束前退款）  
- [ ] 结算入账（活动结束/取消下架后净额进发布者可用余额、待结算预估；**不含提现**）  

**验收：** 见设计规格 §9。免费报名行为不变；提现仍属 P2。

---

## P1（后置）

分类等高级筛选、订阅消息、举报、统计看板、活动开始提醒。  
（标题搜索与开始/发布时间排序已纳入 P0-3；用户取消报名已纳入 P0-4；展示资料见 P1-1；报名预填见 P1-2。）

## P2 / 独立里程碑

发布者提现、微信商家转账、支付宝、对账深化、活动结束后退款；签到；评价；候补；商业化能力。（收费报名 JSAPI、订单状态机、结束前退款、结算入账见 P1-3 / ADR-0014。）

对应基础设施：P2 提现/对账深化前可评估 Redis / MQ（**P1-3 收费报名仍不上 Redis/MQ**）；部署仍可为 Docker 单机，峰值前启动阶段 D（多副本 / 主从）。

---

## 基础设施阶段（摘要）

| 运维阶段 | 对应产品 | 关键升级点 |
| --- | --- | --- |
| A 地基 | P0-0～P0-1 | Docker+Nginx 清单已进 `deploy/`；PG 单主、微信登录；HTTPS 后置 |
| B 业务闭环 | P0-2～P0-6 | OSS+CDN、配置下发、错误追踪 |
| C 有交易再上 | P1-3 收款入账；P2 提现/对账 | JSAPI/退款/结算（ADR-0014）；Redis/MQ 非 P1-3 必需 |
| D 稳定化 | 增长后 | 容器多副本、PG 主从、限流、KMS |

细则与禁止项：[backend-ops-roadmap.md](./backend-ops-roadmap.md)。

---

## 建议开发节奏

每个 P0 阶段按 **api 契约 → shared 类型 → api 实现 → mp/admin UI → 联调** 顺序推进，并提交对应 ADR。  
涉及云资源或中间件变更时，同步核对运维阶段是否已开放。
