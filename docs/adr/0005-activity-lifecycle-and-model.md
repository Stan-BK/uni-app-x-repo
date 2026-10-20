# ADR-0005: 活动生命周期与数据模型

- **状态：** Implemented
- **日期：** 2026-10-19
- **修订：** 2026-10-20 起活动归属 `User`（`ownerUserId`），发布权见 [ADR-0011](./0011-default-publish-permission.md)；生命周期决策不变。
- **关联：** roadmap P0-2、PRD AT-ACT（修订）、ADR-0003（登录）、ADR-0011（发布权）、ADR-0004；支付另见未来支付 ADR / backend-ops 阶段 C
- **设计规格：** [docs/superpowers/specs/2026-10-19-p0-2-activity-domain-design.md](../superpowers/specs/2026-10-19-p0-2-activity-domain-design.md)

## 背景

P0-2 需落地活动创建、草稿、发布与组织者侧管理。原 PRD 默认「新组织者活动必审」（D-02）及双状态（`reviewStatus` + `lifecycle`）与产品方最新决策不符：组织者应可直接上架；运营保留下架治理；付费活动走平台代收、活动结束后抽成结算，但首期不开放在线收款。

## 决策

1. **单一生命周期 `lifecycle`**，不再使用活动审核态。  
   - 枚举：`draft | published | cancelled | removed | ended`  
   - 从 `packages/shared` **废弃** `ActivityReviewStatus`（不再作为活动权威状态）。

2. **所有者可直接发布**（须 `User.canPublish=true`，见 ADR-0011）。  
   - 支持草稿保存与编辑。  
   - `draft` → `published`：发布前做完整必填与时间校验。  
   - `published` → `draft`（退回草稿）或 → `cancelled`（取消活动）：由活动所有者选择。  
   - 退回草稿 / 取消 / 运营下架时：**取消该活动全部有效报名**（退费在支付 ADR；钩子见 ADR-0007）。

3. **运营下架为 `removed`**，与所有者退回草稿区分。  
   - 仅 Admin（`operator`/`admin`）可将 `published` → `removed`。  
   - 所有者不可将 `removed` / `cancelled` / `ended` 自行改回 `published`。

4. **`ended`**：`now >= endAt` 时对 `published` 视为已结束；P0 允许查询时计算展示，持久化写库可后置。

5. **字段基线**（详见设计规格）：  
   `title`、`coverUrl`、`category`、`description`、`rules`、`startAt`、`endAt`、`place`、`capacity`、`feeType`（`free`|`paid`）、`feeCents`、`feeNote`；可选 `cancelReason` / `removeReason`；结算预留如 `platformFeeBps`（可空，P0 无业务逻辑）。  
   - **报名策略字段（P0-4 增补）：**  
     - `registrationDeadlineAt`：报名截止时间；发布时必填语义上等同于有值；**默认 = `startAt`**；须 `registrationDeadlineAt ≤ startAt`。  
     - `allowUserCancel`：是否允许用户主动取消报名；默认 `true`。  
     - `refundable`：是否可退款（付费预留）；默认 `false`；**P0 不开放支付/退款流水**，仅存字段与展示。  
   - 首期地点按线下；不做纯线上场次。  
   - 可创建 `paid` 活动并校验金额，**不开放支付/报名收款**。

6. **API 边界**  
   - 用户（所有者）：`/me/activities` CRUD + `publish` / `unpublish` / `cancel`（原 `/organizer/activities`，见 ADR-0011）。  
   - 运营：`POST /admin/activities/:id/remove`（+ 列表）；写 `AuditLog`。  
   - 公开发现/详情 → ADR-0006；报名 → ADR-0007；治理 UI → P0-5 / ADR-0008。

7. **产品默认修订**：D-02 为「可发布用户直接上架；运营可下架」。原 AT-ACT-04/05（提交审核/驳回）不作 P0 验收。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 单一 lifecycle（本决策） | 与产品一致、状态清晰 | 需改 PRD/roadmap/shared 预置审核枚举 |
| 保留 reviewStatus 恒 `not_required` | 少删字段 | 双状态空转、易误做成审核流 |
| lifecycle + 独立 moderation | 治理细 | P0 过重，与 removed 重叠 |

## 后果

- 正面：发布路径短；草稿/退回/取消/下架职责清楚；付费商业模式可在字段层预留。  
- 负面 / 跟进：须同步 prd-summary、roadmap；公开可见性规则在 ADR-0006；报名取消钩子在 ADR-0007；平台代收与结算在支付 ADR（P2 / 运维阶段 C）。  
- 实现后将本 ADR 标为 `Implemented`。

## 实现备注

- 涉及目录：`apps/api`（Prisma Activity + modules）、`packages/shared`、`apps/mp`（组织者活动页）、`apps/admin`（最小下架）。  
- 验收要点：AT-ACT-01～03（权限与校验）；发布/退回草稿/取消；运营 removed；付费字段可写但不收款。
