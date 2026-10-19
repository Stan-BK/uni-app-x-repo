# P0-3 发现与详情设计规格

- **日期：** 2026-10-19  
- **状态：** Accepted（待实现）  
- **关联 ADR：** [0006](../../adr/0006-activity-discovery-and-public-visibility.md)（Accepted）  
- **关联：** ADR-0005；报名 → ADR-0007；分类高级筛选 → P1

## 1. 目标

将首页发现与活动详情从 mock 切换到服务端公开 API：仅展示可发现活动；详情展示态正确；分享链对取消/下架/草稿不泄露正文；提供标题搜索与开始/发布时间排序。使 AT-ACT-06（修订）可验收。

## 2. 产品决策摘要（已确认）

| 项 | 结论 |
| --- | --- |
| 列表可见性 | 仅 `published` 且 `now < endAt` |
| 已结束 | 不进默认列表；详情可回顾、不可报名 |
| 分享链 `cancelled`/`removed`/`draft` | 错误态，无活动正文 |
| 鉴权 | 公开接口完全匿名可读 |
| 展示态 P0-3 | `upcoming` / `open` / `ended`；无 `full` |
| 搜索/排序 | 标题 `q` + `sort=startAt\|publishedAt`（默认开始时间升序） |
| 分类筛选 | P1 |
| API 形态 | 独立 `/public/activities` 模块 |

## 3. API 契约

### 3.1 `GET /public/activities`

| Query | 规则 |
| --- | --- |
| `q` | 可选；trim；对 `title` 不区分大小写包含匹配 |
| `sort` | `startAt`（默认，升序）\| `publishedAt`（降序） |
| `page` | 从 1，默认 1 |
| `pageSize` | 默认 20，上限 50 |

**Where（强制）：** `lifecycle = published` AND `endAt > now`。

**响应：** `{ items, total, page, pageSize }`。  
列表项可用公开字段子集（可省略 `rules` 全文以减负）。

### 3.2 `GET /public/activities/:id`

| 库状态 | HTTP | Body |
| --- | --- | --- |
| `published`（含已结束） | 200 | 公开 DTO + `displayStatus` |
| `draft` / 不存在 | 404 | 无活动字段；文案偏「活动不存在」 |
| `cancelled` | 404 | `code: ACTIVITY_CANCELLED` |
| `removed` | 404 | `code: ACTIVITY_REMOVED` |

### 3.3 公开 DTO

见 ADR-0006 §6。组织者仅 `{ displayName }`。

### 3.4 `displayStatus` 计算

```text
if now >= endAt → ended
else if now < startAt → upcoming
else → open
```

列表仅含未结束，故列表项主要为 `upcoming` | `open`。

## 4. 共享包

- 增加 `ActivityDisplayStatus`：`upcoming` | `open` | `ended`（`full` 预留注释或 P0-4 再加）。  
- 可选：公开错误 `code` 常量与 `PublicActivitySort`。

## 5. 端上垂直切片

- **mp：** 首页接列表（搜索、排序、分页）；详情接公开 API；错误态页；报名 CTA 占位（不接报名 API）。  
- **admin：** 不改。  
- **api：** `PublicActivitiesModule` + Service（可见性权威）。

## 6. 错误与权限

- 公开路由：无 JWT。  
- 非法 `sort` / 分页参数 → 400。  
- 取消/下架/草稿 → 404 + 可选业务 `code`，无正文。

## 7. 验收

| 项 | 预期 |
| --- | --- |
| 列表可见性 | 仅未结束 published；草稿/取消/下架/已结束不进列表 |
| 搜索/排序 | `q` 过滤标题；默认开始时间升序；可切发布时间 |
| 详情 | 未结束可引导报名占位；已结束可看不可报 |
| 分享链 | 取消/下架/草稿无正文；已结束回顾态 |
| 匿名 | 未登录可浏览 |
| AT-ACT-06 | 以 ADR-0006 为准 |

## 8. 非目标

分类筛选、满员、报名闭环、支付、推荐算法、生产 OSS、Admin 变更。

## 9. 文档同步清单

- [x] ADR-0006 Accepted  
- [x] roadmap P0-3 增补搜索/排序；P1 表述修订  
- [x] 实现计划 [docs/superpowers/plans/2026-10-19-p0-3-discovery-and-detail.md](../plans/2026-10-19-p0-3-discovery-and-detail.md)  
- [ ] 实现后 ADR → Implemented，roadmap 勾选
