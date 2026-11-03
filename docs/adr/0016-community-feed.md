# ADR-0016: 社区动态（Feed / 互动 / 站内通知）

- **状态：** Accepted
- **日期：** 2026-11-03
- **关联：** roadmap P1-5；[ADR-0006](./0006-activity-discovery-and-public-visibility.md)、[ADR-0008](./0008-operational-governance-audit-logs.md)、[ADR-0010](./0010-backend-ops-stack.md)、[ADR-0012](./0012-user-profile-display.md)
- **设计规格：** [docs/superpowers/specs/2026-11-03-community-feed-design.md](../superpowers/specs/2026-11-03-community-feed-design.md)

## 背景

P0～P1-4 已覆盖活动发现、报名、支付结算与订阅消息。产品需要登录用户可发布与互动的社区动态，并与活动通过 `#` 弱耦合关联，同时在首页提供站内互动通知。需在引入 Feed 前锁定：可见性、删除、排序、转发语义、媒体存储与通知范围，避免与公开活动匿名可读模型、支付域或 Redis/MQ 约束冲突。

## 决策

1. **社区读写均需用户登录。** 与 ADR-0006 公开活动匿名可读分离；未登录不返回 Feed/详情正文。
2. **单一 Community 领域（Nest + Prisma）。** 实体含 `Post`、`PostImage`、`PostActivityLink`、`Comment`、`Like`（`targetType` + `targetId`）、`Notification`。不上独立服务；不上 Redis/MQ。
3. **软删除。** 作者可删自己的动态/评论；Admin 可删任意（API + 审计，沿用 ADR-0008）。列表与计数忽略已删；深链返回已删除业务码/文案。
4. **评论最多两级。** `parentId` 仅指向一级评论；对二级再回复仍挂一级。
5. **活动关联 0～3。** 创建时活动须满足 ADR-0006 可发现条件（`published` 且未结束）；存储外键；日后活动不可见时保留链接、展示降级。
6. **热门为时间衰减分。** 公式与常量见规格 §3.6（48h 半衰期量级 + 固定 gravity）；`sort=latest|hot`。
7. **转发仅微信分享。** 小程序适配层分享动态详情；不建站内转发实体、不记分享次数。
8. **媒体走本地 uploads。** `POST /me/uploads/community`，动态 ≤3 图、评论 ≤1 图；OSS/CDN 后置（ADR-0010 阶段 B 尾巴）。
9. **站内通知四类：** `like_post`、`like_comment`、`comment_post`、`reply_comment`。一事一行、不聚合、不给自己发；无社区类微信订阅消息。跳转：赞动态→动态；其余→评论锚点。
10. **信息架构：** tabBar 首页 / 社区 / 我的；社区 FAB 进编辑页；「我的」增加「我的动态」入口与「我的活动」「我的信息」同级；首页铃铛进通知。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 登录可见 + 软删 + 微信分享-only（本决策） | 与治理/审核简单对齐；无转发状态机 | 拉新弱于公开 Feed |
| 匿名可读社区 | 曝光更好 | 爬虫与垃圾内容面更大；与「须登录」产品决定冲突 |
| 站内转发实体 | 传播可计量 | 模型复杂；本期明确只要微信群分享 |
| 热门仅 like+comment 无衰减 | 实现更短 | 旧帖长期霸榜 |
| Like 分表 / 通知聚合 | 查询特化或更干净 UI | 本期数据量无需；增加复杂度 |

## 后果

- 正面：社区与活动域边界清晰；互动与通知可测；不碰支付/提现；遵守 MVP 无 Redis/MQ。
- 负面 / 跟进：本地上传占盘，上量前需 OSS；热度无物化列时大列表需候选窗；Admin UI 打磨与举报后置。
- 实现按两份计划推进：动态基座 → 互动与通知。

## 实现备注

- 验收：规格 §8（AT-COM-01～12）。
- 指导落点：规格 §9。
- 枚举/热度常量：`packages/shared`。
- 实现计划：[动态基座](../superpowers/plans/2026-11-03-community-feed-posts.md)、[互动与通知](../superpowers/plans/2026-11-03-community-feed-engagement.md)。
