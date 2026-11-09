# 所有者报名名单展示「报名姓名」设计规格

- **日期：** 2026-11-09  
- **状态：** Approved  
- **关联：** [ADR-0007](../../adr/0007-registration-idempotency-and-capacity.md)（所有者可拉名单）、P0-4 已实现名单 API/页  
- **范围：** 仅修正所有者侧展示优先级；不改 API 契约、公开详情隐私、Admin。

## 1. 问题

所有者报名名单与管理详情头像条用 `nickname || name` 作为主标题。微信昵称有值时盖住报名表单的 `name`，发起人看不到「报名姓名」。

API `GET /me/activities/:id/registrations` 已返回 `name`（报名快照）与 `nickname`（用户展示），无需改契约。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 方案 | 主标题优先报名姓名；昵称次行补充 |
| 公开详情 | `pages/activity/detail` 参加者仍只显示昵称/头像，不改 |
| API | 不改字段与权限；仍仅 `ownerUserId` 可拉名单 |
| Admin | 不改 |

## 3. 展示规则

主名解析（名单页与管理详情头像条共用同一语义）：

1. `name.trim()` 非空 → 用报名姓名  
2. 否则 `nickname.trim()` 非空 → 用昵称  
3. 否则 →「用户」

次行（仅名单页卡片）：当 `nickname.trim()` 非空且与主名字符串不等时，显示「微信：{nickname}」。手机、状态、提交时间保持现状。

管理详情头像条空间紧，只改主文案为上述主名；不强制加「微信：」次行。

## 4. 改动面

| 位置 | 改动 |
| --- | --- |
| `apps/mp/src/pages/organizer/registrations.vue` | `personName` 改为优先 `name`；有差异昵称时增加次行 |
| `apps/mp/src/pages/organizer/detail.vue` | `personName` 同步优先 `name` |
| API / shared / 公开详情 | 不改 |

可选：两页抽同一 `displayRegistrationName(item)` 小函数；非必须，避免过度抽象。

## 5. 验收

- 报名声「张三」+ 昵称「小明」→ 名单主行「张三」，次行「微信：小明」  
- 报名声与昵称相同 → 无次行  
- 无报名声、有昵称 → 主行昵称，无空白  
- 公开活动详情参加者仍为昵称预览  
- 非所有者拉名单仍 403  

## 6. 非目标

- 不在公开详情暴露手机或报名姓名  
- 不改报名写入、预填、支付状态文案  
- 不做名单导出  
