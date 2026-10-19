# P0-2 活动域设计规格

- **日期：** 2026-10-19  
- **状态：** Approved（实现计划已出）  
- **关联 ADR：** [0005](../../adr/0005-activity-lifecycle-and-model.md)（Accepted）  
- **关联：** ADR-0003、ADR-0004；公开规则 → ADR-0006；报名 → ADR-0007；支付另 ADR

## 1. 目标

落地组织者活动创建与生命周期管理：草稿、直接发布、退回草稿、取消；运营下架；费用字段支持 free/paid（不开放收款）。使 AT-ACT-01～03 及修订后的发布/下架路径可验收。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 审核队列 | **不做**；组织者直接上架 |
| 草稿 | **需要**；发布后可退回草稿 |
| 组织者下架选项 | **退回草稿** 或 **取消活动** |
| 运营下架 | `removed`；组织者不可自行再上架 |
| 退回/取消/下架与报名 | 取消该活动全部有效报名；退费随支付后续再做 |
| 付费 | 模型支持；平台代收 + 结束后抽成结算；**P0 不开放收款**（方案 A） |
| 活动状态建模 | 单一 `lifecycle`（方案 1） |

## 3. 数据模型

### 3.1 Activity（Prisma）

| 字段 | 类型要点 | 校验 |
| --- | --- | --- |
| id | cuid | |
| organizerId | FK → Organizer | 写操作校验归属与 publishStatus |
| title | string | 发布必填 |
| coverUrl | string | 发布必填（URL；上传后置 OSS） |
| category | string | 发布必填；短字符串，无分类表 |
| description | string? | 可选 |
| rules | string | 发布必填 |
| startAt / endAt | DateTime | 发布必填；endAt > startAt |
| place | string | 发布必填（线下） |
| capacity | int | > 0 |
| feeType | enum free\|paid | |
| feeCents | int | free=0；paid>0 |
| feeNote | string? | 可选 |
| lifecycle | enum | 见 §4 |
| cancelReason | string? | 取消时可选/建议 |
| removeReason | string? | 运营下架建议必填 |
| platformFeeBps | int? | 结算预留；P0 无逻辑 |
| createdAt / updatedAt | DateTime | |
| publishedAt | DateTime? | 首次/最近发布时间，可选 |

草稿保存：可放宽必填（至少 title 建议有，实现计划可定为「创建最小字段」）。

### 3.2 废弃

- `ActivityReviewStatus` / 活动审核字段：不进入 Prisma；shared 标记废弃并停止导出（或移入 deprecated 注释后删除导出）。

## 4. 状态机

```
draft --publish--> published --unpublish--> draft
                 |         +--cancel-----> cancelled
                 |         +--admin remove--> removed
                 +--(endAt elapsed)--> ended（展示/可后置落库）
draft --cancel--> cancelled
```

| 动作 | 角色 | 转移 | 副作用 |
| --- | --- | --- | --- |
| 创建/存草稿 | 组织者 | → draft | 无 |
| 发布 | 组织者 | draft → published | 完整校验 |
| 退回草稿 | 组织者 | published → draft | 取消有效报名 |
| 取消 | 组织者 | draft\|published → cancelled | 取消有效报名 |
| 下架 | 运营 | published → removed | 取消有效报名；AuditLog |
| 结束 | 系统/读时计算 | published → ended | P0 可先不写库 |

非法转移返回 409。`removed`/`cancelled`/`ended` 不可组织者再发布。

## 5. API 契约（P0-2）

### 5.1 组织者（User JWT + PublisherGuard）

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/organizer/activities` | 创建；body 可含 `publish: true` 一步发布 |
| PATCH | `/organizer/activities/:id` | 编辑（禁止终态） |
| POST | `/organizer/activities/:id/publish` | 发布 |
| POST | `/organizer/activities/:id/unpublish` | 退回草稿 |
| POST | `/organizer/activities/:id/cancel` | 取消 |
| GET | `/organizer/activities` | 我的活动分页；`lifecycle` 筛选 |
| GET | `/organizer/activities/:id` | 详情 |

### 5.2 运营（Admin JWT）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/admin/activities` | 最小列表（联调） |
| POST | `/admin/activities/:id/remove` | body: `{ reason }` → removed |

### 5.3 本阶段不做

公开列表/详情、报名、支付下单、活动审核 approve/reject。

## 6. 共享包

- 保留校准 `ActivityLifecycleStatus`、`FeeType`。  
- 废弃并移除导出 `ActivityReviewStatus`。  
- 可增加活动相关常量（字段长度上限等）于实现计划中细化。

## 7. 端上垂直切片

- **mp：** 组织者「我的活动」、创建/编辑、发布、退回草稿、取消。  
- **admin：** 活动列表 + 下架。  
- **公开发现：** 仍可用 mock，待 P0-3。

## 8. 错误与权限

- 未登录 / 无发布权 / 非归属 → 401/403  
- 校验失败 → 400 + 字段错误  
- 非法状态迁移 → 409  
- 名额与报名权威在服务端（P0-4）

## 9. 验收

| 项 | 预期 |
| --- | --- |
| AT-ACT-01 | 无发布权不可创建/发布 |
| AT-ACT-02 | 缺必填不可发布；草稿内容保留 |
| AT-ACT-03 | endAt ≤ startAt 拒绝 |
| 修订发布路径 | 发布后 lifecycle=published，无 pending 审核 |
| 退回/取消 | 状态正确；报名取消钩子可调用（无报名时为空） |
| 运营下架 | removed + 原因 + 审计；组织者不可再上架 |
| 付费字段 | 可创建 paid；无支付接口 |

原 AT-ACT-04/05（提交审核/驳回）不再作为本阶段验收。AT-ACT-06 → P0-3。

## 10. 文档同步清单

- [x] ADR-0005 Accepted  
- [x] roadmap P0-2 条目修订  
- [x] prd-summary D-02 / 状态 / 首期表述  
- [x] 实现计划 [docs/superpowers/plans/2026-10-19-p0-2-activity-domain.md](../plans/2026-10-19-p0-2-activity-domain.md)

## 11. 非目标

在线支付/退款/分账打款、OSS 上传闭环、多场次、报名审核、公开发现算法、签到评价候补。
