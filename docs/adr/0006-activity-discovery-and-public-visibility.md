# ADR-0006: 活动发现与公开展示规则

- **状态：** Implemented
- **日期：** 2026-10-19
- **修订：** 2026-10-20 公开 DTO 主办改为 `hostName`（[ADR-0011](./0011-default-publish-permission.md)）；2026-10-21 首页热门位 `GET /public/activities/hot`，按已确认报名人数取前 3，列表/详情仍不返回人数。
- **关联：** roadmap P0-3、PRD AT-ACT-06（修订）、ADR-0005、ADR-0011；报名 → ADR-0007
- **设计规格：** [docs/superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md](../superpowers/specs/2026-10-19-p0-3-discovery-and-detail-design.md)

## 背景

P0-2 已落地组织者发布与运营下架；首页/详情仍接 mock。P0-3 需定义**谁可以匿名看到哪些活动**、分享链在取消/下架/结束后如何表现，以及发现列表的最小搜索与排序，避免未发布内容泄露，并与 P0-4 报名、P1 高级筛选划清边界。

## 决策

1. **独立公开模块**  
   - 路由：`GET /public/activities`、`GET /public/activities/hot`、`GET /public/activities/:id`。  
   - 与组织者 `/organizer/activities`、Admin `/admin/activities` 分离；匿名可读，无需登录。

2. **公开列表可见性**  
   - 仅 `lifecycle=published` 且 `now < endAt`。  
   - `draft` / `cancelled` / `removed` / 已结束活动**不进入**默认发现列表。

3. **列表查询（P0-3 最小集）**  
   - `q`：标题关键词（trim；空则不过滤；大小写不敏感包含匹配）。  
   - `sort`：`startAt`（默认）| `publishedAt`。  
   - `order`：`asc` | `desc`；省略时 `startAt` 默认 `asc`、`publishedAt` 默认 `desc`；端上可再点同一排序项切换方向。  
   - 分页：`page`/`pageSize`（默认 20，上限 50）；响应含 `items`、`total`、`page`、`pageSize`。  
   - **热门位：** `GET /public/activities/hot` 返回可见列表中已确认报名人数最多的至多 3 条（人数相同则较新发布优先）；响应为公开 DTO 数组，**不返回人数**。端上仅在返回满 3 条时展示该区域，少于 3 条（含 2 条）不展示、不做占位。  
   - **分类等高级筛选 → P1**（同步修订 roadmap）。

4. **公开详情与分享链**  
   - `published` 且未结束：返回公开 DTO，展示态可报名（报名实现属 P0-4）。  
   - `published` 且已结束：返回同一公开 DTO + `displayStatus=ended`，可看回顾，不可报名。  
   - `draft` / 不存在：404，文案偏「活动不存在」（不泄露草稿）。  
   - `cancelled` / `removed`：404 + 业务 `code`（如 `ACTIVITY_CANCELLED` / `ACTIVITY_REMOVED`），**不返回**活动正文。

5. **展示态（计算字段 `displayStatus`）**  
   - P0-3：`upcoming` | `open` | `ended`（仅依 `startAt`/`endAt` 与当前时间）。  
   - P0-4：启用 `full`、`closed`；展示态表示报名通道。活动未开场但报名未截止、未满员时为 `open`（报名中），**不再**计算 `upcoming`。  
   - 列表不返回已报名人数；可返回 `capacity` 上限，以及 `attendees` 预览（最多 3 条，仅 `nickname` + `avatarUrl`）。详情返回 `confirmedCount`（已确认报名数），供「已报名 n/上限」展示。

6. **公开 DTO 裁剪**  
   - 含：`id`、`title`、`coverUrl`、`category`、`description`、`rules`（详情）、时间地点坐标、`capacity`、费用字段、`lifecycle`、`displayStatus`、`publishedAt`、`hostName`（用户昵称，见 ADR-0011）。  
   - **列表另含** `attendees` 预览最多 3 条。**详情另含** `confirmedCount`，以及 `attendees` 最多 20 条。字段均为已确认报名者的 `nickname` + `avatarUrl`；无昵称时为「用户」。不含手机、报名表姓名、userId。  
   - 不含：`cancelReason`、`removeReason`、`platformFeeBps`、用户联系方式/内部状态、审计字段。

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
