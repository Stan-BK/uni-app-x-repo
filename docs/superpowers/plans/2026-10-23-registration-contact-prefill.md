# 报名资料预填 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把报名姓名和手机号落到 `User`，报名成功回写，下次报名与「我的信息」可预填/编辑。

**Architecture:** `User.realName` 新列 + 已有 `User.phone`。`GET/PATCH /me` 暴露这两项。`RegistrationsService.create` 在新建或取消后重报的同一事务里回写。小程序报名页预填一次；个人页 blur 保存。登录响不加联系人字段。

**Tech Stack:** NestJS 11、Prisma 6、Vitest、uni-app Vue3、Pinia、pnpm workspace、`@activity/shared`

**前置文档：** [ADR-0013](../../adr/0013-registration-contact-prefill.md)、[设计规格](../specs/2026-10-23-registration-contact-prefill-design.md)

---

## 文件结构

```text
packages/shared/src/identity.ts
  REAL_NAME_MAX_LENGTH、PHONE_PATTERN

apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20261023120000_add_user_real_name/migration.sql

apps/api/src/auth/dto/patch-me.dto.ts
apps/api/src/auth/auth.service.ts
apps/api/src/auth/auth.service.spec.ts

apps/api/src/registrations/registrations.service.ts
apps/api/src/registrations/registrations.service.spec.ts
apps/api/src/registrations/dto/create-registration.dto.ts  # 改用 shared 正则

apps/mp/src/api/me.ts
apps/mp/src/stores/user.ts
apps/mp/src/pages/register/index.vue
apps/mp/src/pages/mine/profile.vue
```

不改 Admin。不改公开活动 DTO。

---

### Task 1: shared 常量

**Files:**
- Modify: `packages/shared/src/identity.ts`

- [x] 在 `NICKNAME_MAX_LENGTH` 后追加 `REAL_NAME_MAX_LENGTH = 32`、`PHONE_PATTERN = /^1\d{10}$/`
- [x] `pnpm --filter @activity/shared build`

### Task 2: Prisma `realName`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261023120000_add_user_real_name/migration.sql`

- [x] `User` 增加 `realName String?`（放在 `avatarUrl` 与 `phone` 之间）
- [x] 迁移 SQL：`ALTER TABLE "User" ADD COLUMN "realName" TEXT;`
- [x] `pnpm --filter @activity/api prisma:generate`

### Task 3: Auth GET/PATCH /me（TDD）

**Files:**
- Modify: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/dto/patch-me.dto.ts`

- [x] 先写失败测试：`getMe` 返回 `realName`/`phone`；`updateMe` 可写/清空；非法手机号 400；仅改 phone 也算有字段
- [x] `pnpm --filter @activity/api test src/auth/auth.service.spec.ts` 确认 RED
- [x] 实现 `toMeResult`、校验、`PatchMeDto`
- [x] 再跑测试 GREEN
- [x] 现有 `getMe`/`updateMe` 断言补上新字段

### Task 4: 报名回写（TDD）

**Files:**
- Modify: `apps/api/src/registrations/registrations.service.spec.ts`
- Modify: `apps/api/src/registrations/registrations.service.ts`

- [x] tx mock 增加 `user.update`
- [x] 失败测试：新建回写；取消后重报回写；已 confirmed 不回写；满员不回写
- [x] 实现同事务 `tx.user.update({ realName: name, phone })`
- [x] GREEN；公开活动 spec 仍断言 attendees 无 phone

### Task 5: 小程序

**Files:**
- Modify: `apps/mp/src/api/me.ts`
- Modify: `apps/mp/src/stores/user.ts`
- Modify: `apps/mp/src/pages/register/index.vue`
- Modify: `apps/mp/src/pages/mine/profile.vue`

- [x] `MeResult` / `patchMe` / `updateProfile` 增加 `realName`、`phone`
- [x] 报名页预填一次 + `maxlength=32`；校验用 `PHONE_PATTERN`
- [x] 个人页报名姓名/手机号 blur 保存

### Task 6: 文档收尾

- [x] ADR-0013 → Implemented；规格 → Implemented
- [x] roadmap P1-2 勾选
- [x] `pnpm --filter @activity/api test` 全绿
