# Architecture Decision Records

本目录记录影响架构、数据一致性、权限与跨端行为的决策。

## 流程

1. 从 [0000-template.md](./0000-template.md) 复制新建 `NNNN-slug.md`  
2. 状态先 `Proposed`，评审后改为 `Accepted`  
3. 实现完成后改为 `Implemented`，并补充 Consequences  
4. 在 [roadmap.md](../roadmap.md) 对应阶段勾选  

## 索引

| ADR | 标题 | 状态 |
| --- | --- | --- |
| [0001](./0001-monorepo-and-tech-stack.md) | Monorepo 与全栈技术基线 | Accepted |
| [0002](./0002-doc-driven-ai-workflow.md) | 文档与 ADR 驱动的 AI 开发流程 | Accepted |
| [0003](./0003-identity-and-organizer.md) | 多端身份与 Organizer 模型 | Accepted |
| [0004](./0004-admin-rbac.md) | 管理后台 RBAC | Accepted |
| [0005](./0005-activity-lifecycle-and-model.md) | 活动生命周期与数据模型 | Implemented |
| [0006](./0006-activity-discovery-and-public-visibility.md) | 活动发现与公开展示规则 | Implemented |
| [0007](./0007-registration-idempotency-and-capacity.md) | 报名幂等与名额并发 | Accepted |
| 0008 | 审核、下架与审计 | Proposed（待写） |
| 0009 | 联调、验收与观测基线 | Proposed（待写） |
| [0010](./0010-backend-ops-stack.md) | 后端基础设施与阶段升级选型 | Accepted |

状态说明：`Proposed` → `Accepted` → `Implemented`；废弃用 `Superseded` / `Rejected`。
