# ADR-0006: 活动发现与公开展示规则

- **状态：** Implemented
- **日期：** 2026-10-19
- **关联：** roadmap P0-3、PRD AT-ACT-06（修订）、ADR-0005；报名 → ADR-0007
- **设计规格：** [docs/superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md](../superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md)

## 背景

P0-2 已落地组织者发布与运营下架；首页/详情仍接 mock。P0-3 需定义**谁可以匿名看到哪些活动**、分享链在取消/下架/结束后如何表现，以及发现列表的最小搜索与排序，避免未发布内容泄露，并与 P0-4 报名、P1 高级筛选划清边界。

## 决策

1. **独立公开模块**  
   - 路由：`GET /public/activities`、`GET /public/activities/:id`。  
   - 与组织者 `/organizer/activities`、Admin `/admin/activities` 分离；匿名可读，无需登录。

2. **公开列表可见性**  
   - 仅 `lifecycle=published` 且 `now < endAt`。  
   - `draft` / `cancelled` / `removed` / 已结束活动**不进入**默认发现列表。

3. **列表查询（P0-3 最小集）**  
   - `q`：标题关键词（trim；空则不过滤；大小写不敏感包含匹配）。  
   - `sort`：`startAt`（默认，升序）| `publishedAt`（降序）。  
   - 分页：`page`/`pageSize`（默认 20，上限 50）；响应含 `items`、`total`、`page`、`pageSize`。  
   - **分类等高级筛选 → P1**（同步修订 roadmap）。

4. **公开详情与分享链**  
   - `published` 且未结束：返回公开 DTO，展示态可报名（报名实现属 P0-4）。  
   - `published` 且已结束：返回同一公开 DTO + `displayStatus=ended`，可看回顾，不可报名。  
   - `draft` / 不存在：404，文案偏「活动不存在」（不泄露草稿）。  
   - `cancelled` / `removed`：404 + 业务 `code`（如 `ACTIVITY_CANCELLED` / `ACTIVITY_REMOVED`），**不返回**活动正文。

5. **展示态（计算字段 `displayStatus`）**  
   - P0-3：`upcoming` | `open` | `ended`（仅依 `startAt`/`endAt` 与当前时间）。  
   - **满员 `full` → P0-4**（有有效报名数后再加）。  
   - 列表不返回已报名人数；可返回 `capacity` 上限。

6. **公开 DTO 裁剪**  
   - 含：`id`、`title`、`coverUrl`、`category`、`description`、`rules`（详情）、时间地点坐标、`capacity`、费用字段、`lifecycle`、`displayStatus`、`publishedAt`、`organizer.displayName`。  
   - 不含：`cancelReason`、`removeReason`、`platformFeeBps`、组织者联系方式/内部状态、审计字段。

7. **端上**  
   - mp 首页/详情接公开 API；报名 CTA 可占位，真实报名属 P0-4。  
   - **分享：** 仅 `lifecycle=published` 的公开详情可分享；能力走 `apps/mp/src/adapters/share.ts`（微信：右上角/按钮 `open-type=share`；H5：Web Share 或复制链接）。取消/下架后分享链仍按 §4 错误态处理。  
   - Admin 本阶段不改。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 独立 `/public` 模块（本决策） | 边界清晰、字段裁剪安全 | 多一套 controller/DTO |
| 复用 Activities 模块加公开路由 | 少模块 | 易与组织者权限混用、误暴露字段 |
| 前端过滤宽接口 | 后端改动少 | 违反服务端权威，不可接受 |

## 后果

- 正面：发现链路可匿名；分享链对取消/下架不泄正文；已结束可回顾；搜索/排序满足最小发现需求。  
- 负面 / 跟进：roadmap P0-3 增补搜索排序；P1 改为分类等高级筛选；报名与满员在 ADR-0007；实现后本 ADR → `Implemented`。

## 实现备注

- 涉及目录：`apps/api/src/public-activities`（或等价命名）、`packages/shared`（展示态/错误码）、`apps/mp` 首页与活动详情。  
- 验收要点：列表仅未结束 published；搜索/排序正确；详情展示态正确；分享链取消/下架/草稿无正文；匿名可浏览。
