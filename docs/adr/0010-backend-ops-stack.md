# ADR-0010: 后端基础设施与阶段升级选型

- **状态：** Accepted
- **日期：** 2026-10-18
- **决策人：** 产品方确认（聊天选型）
- **关联：** [docs/backend-ops-roadmap.md](../backend-ops-roadmap.md)、ADR-0001、`docs/roadmap.md`、PRD 摘要

## 背景

仓库已具备 NestJS + Prisma + PostgreSQL 与活动报名产品路线。需把「稳定运营」评估中的云资源、中间件与演进路径固化为可执行基线，避免各阶段临时选栈。

业务以**活动筹建发布**为主；报名后续可能收费，但产品首期明确免费闭环。

## 决策

1. **起步按 MVP**；架构路径为 **轻量托管 → 生产增强**（先单体可运维，再多副本与中间件）。  
2. **运行时：** Node.js + **NestJS**，代码在 **`apps/api`**（monorepo，不另建 `server/`）。  
3. **云厂商默认阿里云。**  
4. **部署：** 先 **Docker + Nginx 单机**；稳定运营升 **容器服务 ≥2 副本跨 AZ**。  
5. **数据：** **PostgreSQL 单主**（已用 Prisma）；需要时再主从 + PITR。  
6. **MVP 不上 Redis、不上 MQ**；会话用 JWT/DB；异步用进程内。支付/对账阶段再评估引入。  
7. **对象存储：** 阿里云 **OSS + CDN**（业务闭环阶段接入）。  
8. **平台：** **先微信**；抖音 / 小红书按阶段开通（与现有预留一致）。  
9. **能力路线含**用户会话、业务 API、配置下发、OSS、支付订单、订阅消息、异步任务；其中 **支付仅在「有交易再上」/产品 P2** 开放，不突破 ADR-0001 首期禁收款。  
10. **节奏：** 地基 → 业务闭环 → 有交易再上 → 稳定化；细则见 `docs/backend-ops-roadmap.md`。

## 备选方案

| 方案 | 结论 |
| --- | --- |
| Go / Java 重写 API | 否；已选 Nest，与前端同语言 |
| Serverless 纯函数为主 | 否；MVP 用 Docker 单体，函数仅可作后续补充 |
| 腾讯云为主 | 否；确认阿里云 |
| MySQL | 否；确认 PostgreSQL |
| 首期直接上支付 | 否；与 PRD/ADR-0001 冲突，放到阶段 C |
| 独立后端仓 / `server/` | 否；沿用 `apps/api` |

## 后果

- 正面：基础设施与产品 P0/P1/P2 解耦清晰；可按阶段采购云资源。  
- 负面 / 跟进：支付上线时需追加支付 ADR；Redis/MQ 触发条件需在阶段 C 评审。  
- 文档：`docs/backend-ops-roadmap.md` 为执行手册；`docs/技术栈.md` 同步运维结论行。

## 实现备注

- 涉及目录：`deploy/`（compose / Nginx / `.env.example`）、`apps/api/Dockerfile`、手册 `docs/deploy-docker.md`。OSS / CDN / Sentry 仍属阶段 B 后续切片。  
- 验收要点：阶段切换时核对 `backend-ops-roadmap.md` §3 表格；未开放阶段不得合并可收款代码。空机器按手册 `compose up` 后 `GET /api/health` 为 200。
