# ADR-0007: 报名幂等与名额并发

- **状态：** Implemented
- **日期：** 2026-10-19
- **关联：** roadmap P0-4、PRD AT-REG / D-03～D-06 / D-08、ADR-0005、ADR-0006；支付另见未来支付 ADR / backend-ops 阶段 C
- **设计规格：** [docs/superpowers/specs/2026-10-19-p0-4-free-registration-design.md](../superpowers/specs/2026-10-19-p0-4-free-registration-design.md)
- **实现计划：** [docs/superpowers/plans/2026-10-19-p0-4-free-registration.md](../superpowers/plans/2026-10-19-p0-4-free-registration.md)

## 背景

P0-3 已落地公开发现与详情；详情报名 CTA 仍为占位。P0-4 需落地**免费报名闭环**：表单、服务端权威校验、幂等、名额不超卖、我的报名、**用户主动取消**与组织者名单，并兑现 ADR-0005 的「退回草稿/取消/下架时取消有效报名」钩子。约束：MVP 不上 Redis/MQ；首期不开放在线收款。

## 决策

1. **仅免费可报名（P0-4）**  
   - 仅 `feeType=free` 的活动可提交报名并直接进入有效态。  
   - `feeType=paid`：**拒绝报名**（明确业务 `code`）；端上禁用/隐藏报名 CTA。  
   - 活动表可保留 `feeCents` / `platformFeeBps` 等字段；支付链路与收费报名 → **P2 + 运维阶段 C**，另立支付 ADR。

2. **报名模型 `Registration`**  
   - 字段基线：`id`、`activityId`、`userId`、`name`、`phone`、`status`、`createdAt`、`updatedAt`（及取消时间等实现细节见设计规格）。  
   - 状态枚举沿用 shared：`pending_review` | `confirmed` | `rejected` | `cancelled`。  
   - **首期有效态仅 `confirmed`**（免费直接成功，D-03）；不走审核流；`pending_review` / `rejected` 预留。  
   - **有效报名**定义：`status = confirmed`（名额与满员只计此类）。

3. **表单与鉴权**  
   - 必填：姓名、手机号（D-08）；须登录（用户 JWT）。  
   - 名额、权限、活动可报性一律以服务端为准，不信任前端。

4. **准入（服务端二次校验）**  
   同时满足才可新建有效报名：  
   - 活动存在且 `lifecycle = published`；  
   - `now < endAt`（已结束不可报）；  
   - `now < registrationDeadlineAt`（报名已截止则不可报；字段见 ADR-0005）；  
   - `feeType = free`；  
   - 有效报名数 `< capacity`。  
   否则返回 4xx + 稳定业务 `code`（见设计规格）。

5. **幂等**  
   - 库级：`@@unique([userId, activityId])`（同一用户对同一活动至多一条报名记录）。  
   - 重复提交：若已存在有效报名 → **不双占名额**，返回已有记录或业务码「已报名」；若仅存在已取消记录，是否允许重新报名由设计规格约定（P0 推荐：唯一约束下更新回 `confirmed` 并重填表单，仍须过名额校验）。

6. **名额并发（无 Redis）**  
   - 单事务内：`SELECT … FOR UPDATE` 锁定活动行 → 统计有效报名数 → 校验名额 → 插入/更新报名。  
   - 保证并发下不超卖；不做分布式锁、不引入 Redis。

7. **满员展示态**  
   - 在公开 DTO 的 `displayStatus` 中启用 `full`：未结束且有效报名数 `>= capacity` 时为 `full`（优先级高于 `open`，低于 `ended`）。活动未开场但报名未截止时为 `open`，不使用 `upcoming`。  
   - 列表可不返回已报名人数；可返回 `capacity`。

8. **取消报名（两类）**  
   - **用户主动取消（P0-4）：** 登录用户可取消本人 `confirmed` 报名 → `cancelled`，释放名额；须活动未结束 **且** `allowUserCancel === true`；否则拒绝。已取消幂等返回；取消后可在仍可报且有名额时重新报名（见决策 5）。  
   - **`refundable`：** 仅活动字段/详情展示；P0 不产生退款。  
   - **系统批量取消：** 实现 `RegistrationCancelHook`：组织者退回草稿 / 取消活动、运营下架时，将该活动下全部**有效**报名改为 `cancelled`（兑现 ADR-0005）。

9. **API 边界（P0-4）**  
   - 用户：创建报名、取消本人报名、我的报名列表（及可选单条详情）。  
   - 组织者：某活动下的报名名单（须拥有该活动）。  
   - 公开模块可提供「当前用户是否已报」的可选字段或独立查询（实现时二选一，见设计规格）。  
   - Admin 报名治理加强 → P0-5；不在本 ADR 展开。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| Postgres 行锁 + 唯一约束（本决策） | 无新中间件、与 MVP 一致、语义清晰 | 高并发时锁竞争（可接受于验证期） |
| Redis 分布式锁 / 预扣名额 | 吞吐更好 | 违反 backend-ops「MVP 不上 Redis」 |
| 仅应用层 count 无锁 | 实现简单 | 并发超卖，不可接受 |
| P0 允许 paid 直接 confirmed | 少分支 | 易误解「已付款」；与「不开放收款」冲突 |

## 后果

- 正面：免费闭环可验收（含用户取消与名额释放）；幂等与名额权威在库；与活动生命周期钩子闭合；收费边界清晰。  
- 负面 / 跟进：须同步 roadmap、prd-summary D-06、设计规格与实现计划；公开 `displayStatus` 增补 `full`；支付 ADR 另立。  
- 实现完成后将本 ADR 标为 `Implemented`。

## 实现备注

- 涉及目录：`apps/api`（Prisma Registration、registrations 模块、替换 Noop 钩子）、`packages/shared`（错误码、`ActivityDisplayStatus.full`）、`apps/mp`（报名表单、取消、我的报名、详情 CTA）、组织者端名单页。  
- 验收要点：AT-REG-01～06（含并发与越权）；仅 free 可报；重复报名幂等；用户可取消并释放名额；满员不可报且展示 `full`；退回/取消/下架取消有效报名。
