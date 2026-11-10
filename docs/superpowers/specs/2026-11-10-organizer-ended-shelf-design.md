# 组织者「我的活动」已结束货架设计规格

- **日期：** 2026-11-10  
- **状态：** Implemented  
- **关联：** [ADR-0005](../../adr/0005-activity-lifecycle-and-model.md)（`ended` 可读时计算）  
- **范围：** 小程序组织者列表/详情操作限制；API 对过期 `published` 的 unpublish/cancel 拦截。不落库 `ended`、不加定时任务。

## 1. 问题

「我的活动」Tab 为已上架 / 草稿 / 已下架。`published` 且 `now >= endAt` 仍进「已上架」，并可退回草稿/取消，与 ADR-0005 及产品预期不符。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 方案 | A：前端按时间派生 + 新增「已结束」Tab；API 写操作拦截 |
| 只读 | 已结束仍可看详情与报名名单 |
| 禁止 | 发布、退回草稿、取消/下架、编辑 |
| 持久化 | 本阶段不写库 `ended` |

## 3. 归类规则

Tab 顺序：`已上架 | 草稿 | 已结束 | 已下架`

| Tab | 条件 |
| --- | --- |
| 已上架 | `lifecycle === published` 且 `now < endAt`（无 `endAt` 视为未结束） |
| 草稿 | `lifecycle === draft` |
| 已结束 | `lifecycle === ended`，或 `published && now >= endAt` |
| 已下架 | `removed` / `cancelled` |

展示标签：派生为已结束时显示「已结束」，不用「已发布」。

## 4. 改动面

| 位置 | 改动 |
| --- | --- |
| `apps/mp/.../organizer/list.vue` | Tab、过滤、标签、隐藏 ops |
| `apps/mp/.../organizer/detail.vue` | 已结束隐藏动作栏；标签显示已结束 |
| `apps/api/.../activities.service.ts` | `unpublish`/`cancel`：对时间已过的 `published` 返回 409 |
| `apps/api/.../activities.service.spec.ts` | 覆盖上述拒绝路径 |

## 5. 非目标

- 不改公开发现列表（已按 `endAt` 排除）
- 不改 Admin
- 不引入结算/定时写 `ended`
