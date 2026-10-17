# P0-1 身份与权限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 NestJS + Prisma API 的用户/组织者身份与 Admin RBAC，使「无发布权不可创建活动」「未授权不可进后台」可验收。

**Architecture:** `apps/api` 为权威鉴权与数据层；小程序用微信 code 换平台 JWT；Admin 使用独立 `AdminUser` + 独立 JWT；组织者申请由运营审核。共享枚举进 `packages/shared`。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、JWT、Vue3 Admin、uni-app mp、pnpm workspace、Vitest（api）

**前置文档：** ADR-0003、ADR-0004、`docs/roadmap.md` P0-1、`docs/product/prd-summary.md`

---

## 文件结构（将创建/改造）

```text
packages/shared/src/
  identity.ts          # Provider / PublishStatus / AdminRole
  index.ts             # re-export

apps/api/
  prisma/schema.prisma
  prisma/seed.ts
  .env.example
  src/
    main.ts
    app.module.ts
    prisma/prisma.module.ts
    prisma/prisma.service.ts
    auth/              # 小程序登录
    users/
    organizers/
    admin-auth/
    admin-organizers/
    common/guards/
    common/decorators/
  test/                # e2e 或 unit

apps/admin/src/
  api/http.ts
  views/Login.vue
  views/OrganizerApplications.vue
  router.ts

apps/mp/src/
  adapters/auth.ts
  utils/request.ts
  stores/user.ts
  pages/auth/login.vue   # 或首页触发登录
```

---

### Task 1: shared 身份枚举

**Files:**
- Create: `packages/shared/src/identity.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写入枚举**

```ts
// packages/shared/src/identity.ts
export const IdentityProvider = {
  Weixin: "weixin",
  Toutiao: "toutiao",
  Xhs: "xhs",
} as const;
export type IdentityProvider =
  (typeof IdentityProvider)[keyof typeof IdentityProvider];

export const PublishStatus = {
  None: "none",
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  Frozen: "frozen",
} as const;
export type PublishStatus =
  (typeof PublishStatus)[keyof typeof PublishStatus];

export const AdminRole = {
  Operator: "operator",
  Admin: "admin",
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
```

```ts
// packages/shared/src/index.ts — 增加
export * from "./identity";
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @activity/shared type-check`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add identity and admin role enums"
```

---

### Task 2: NestJS + Prisma 脚手架替换 api 占位

**Files:**
- Replace: `apps/api/package.json`
- Create: `apps/api/nest-cli.json`, `apps/api/src/app.module.ts`, `apps/api/src/prisma/*`, `apps/api/.env.example`
- Modify: `apps/api/tsconfig.json`, `apps/api/src/main.ts`

- [ ] **Step 1: 安装依赖（在 apps/api）**

```bash
cd apps/api
pnpm add @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt class-validator class-transformer reflect-metadata rxjs @prisma/client @activity/shared@workspace:*
pnpm add -D @nestjs/cli @nestjs/schematics @nestjs/testing prisma typescript @types/node @types/express @types/passport-jwt @types/bcrypt vitest unplugin-swc @swc/core
```

- [ ] **Step 2: package.json scripts**

```json
{
  "name": "@activity/api",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "prisma db seed",
    "test": "vitest run",
    "type-check": "tsc -p tsconfig.build.json --noEmit"
  },
  "prisma": {
    "seed": "ts-node --transpile-only prisma/seed.ts"
  }
}
```

- [ ] **Step 3: 最小 App 启动**

```ts
// apps/api/src/main.ts
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

```ts
// apps/api/src/app.module.ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
})
export class AppModule {}
```

```ts
// apps/api/src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

```ts
// apps/api/src/prisma/prisma.module.ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 4: `.env.example`**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/activity?schema=public
JWT_USER_SECRET=dev-user-secret-change-me
JWT_ADMIN_SECRET=dev-admin-secret-change-me
JWT_EXPIRES_IN=7d
WEIXIN_APPID=
WEIXIN_SECRET=
AUTH_DEV_BYPASS=true
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=ChangeMeNow!
PORT=3000
```

- [ ] **Step 5: 本地起 Postgres 并验证 API 能启动**

```bash
# 任选：docker run --name activity-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=activity -p 5432:5432 -d postgres:16
cp apps/api/.env.example apps/api/.env
pnpm --filter @activity/api start:dev
```

Expected: 监听 `3000`（此时尚无业务路由亦可）。

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): scaffold NestJS with Prisma module"
```

---

### Task 3: Prisma schema + 首次迁移

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`

- [ ] **Step 1: schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum IdentityProvider {
  weixin
  toutiao
  xhs
}

enum PublishStatus {
  none
  pending
  approved
  rejected
  frozen
}

enum AdminRole {
  operator
  admin
}

enum UserStatus {
  active
  banned
}

model User {
  id        String     @id @default(cuid())
  nickname  String?
  avatarUrl String?
  phone     String?
  status    UserStatus @default(active)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  identities UserIdentity[]
  organizer  Organizer?
}

model UserIdentity {
  id        String           @id @default(cuid())
  userId    String
  provider  IdentityProvider
  openId    String
  unionId   String?
  createdAt DateTime         @default(now())
  user      User             @relation(fields: [userId], references: [id])

  @@unique([provider, openId])
  @@index([userId])
}

model Organizer {
  id             String        @id @default(cuid())
  ownerUserId    String        @unique
  name           String
  type           String        @default("personal")
  description    String?
  publishStatus  PublishStatus @default(none)
  applyReason    String?
  reviewNote     String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  owner          User          @relation(fields: [ownerUserId], references: [id])
}

model AdminUser {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  displayName  String?
  role         AdminRole @default(operator)
  status       String    @default("active")
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model AuditLog {
  id         String   @id @default(cuid())
  actorType  String
  actorId    String
  action     String
  targetType String
  targetId   String
  reason     String?
  meta       Json?
  createdAt  DateTime @default(now())

  @@index([targetType, targetId])
}
```

- [ ] **Step 2: migrate**

Run: `pnpm --filter @activity/api prisma:migrate`  
Migration name: `init_identity`  
Expected: 成功生成 client

- [ ] **Step 3: seed 引导 Admin**

```ts
// apps/api/prisma/seed.ts
import { PrismaClient, AdminRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;
  const count = await prisma.adminUser.count();
  if (count > 0) return;
  await prisma.adminUser.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: "Bootstrap Admin",
      role: AdminRole.admin,
    },
  });
}

main().finally(() => prisma.$disconnect());
```

Run: `pnpm --filter @activity/api prisma:seed`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add identity schema and admin bootstrap seed"
```

---

### Task 4: 小程序登录（微信 + dev bypass）

**Files:**
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/dto/weixin-login.dto.ts`
- Create: `apps/api/src/auth/weixin.client.ts`
- Create: `apps/api/src/common/guards/user-jwt.guard.ts`
- Create: `apps/api/src/common/decorators/current-user.decorator.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

- [ ] **Step 1: 写失败测试（dev bypass 登录）**

```ts
// apps/api/src/auth/auth.service.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  it("dev bypass issues token for mock code", async () => {
    // 用测试 Prisma 或 mock；断言返回 accessToken 与 user.id
    expect(true).toBe(false); // 先红，实现后改为真实断言
  });
});
```

Run: `pnpm --filter @activity/api test`  
Expected: FAIL

- [ ] **Step 2: 实现 AuthService（要点）**

- `POST /api/auth/weixin/login` body: `{ code: string }`  
- 若 `AUTH_DEV_BYPASS=true` 且 `code === "dev"`：upsert provider=weixin openId=`dev-openid`  
- 否则调用 `https://api.weixin.qq.com/sns/jscode2session`  
- upsert `UserIdentity` + `User`，签发 user JWT：`{ sub: userId, typ: "user" }`，secret=`JWT_USER_SECRET`

- [ ] **Step 3: `GET /api/me`**（UserJwtGuard）

返回 `{ id, nickname, avatarUrl, organizer: { publishStatus } | null }`

- [ ] **Step 4: 测试变绿并手动 curl**

```bash
curl -s -X POST localhost:3000/api/auth/weixin/login -H 'content-type: application/json' -d '{"code":"dev"}'
curl -s localhost:3000/api/me -H "Authorization: Bearer <token>"
```

Expected: 返回 token；`/me` 含用户信息。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): weixin login with dev bypass and /me"
```

---

### Task 5: 组织者申请（用户侧）

**Files:**
- Create: `apps/api/src/organizers/organizers.module.ts`
- Create: `apps/api/src/organizers/organizers.service.ts`
- Create: `apps/api/src/organizers/organizers.controller.ts`
- Create: `apps/api/src/organizers/dto/apply-organizer.dto.ts`
- Create: `apps/api/src/common/guards/publisher.guard.ts`

- [x] **Step 1: API**

- `POST /api/organizers/apply` `{ name, reason? }`  
  - 无 Organizer → 创建 `publishStatus=pending`  
  - 已是 `rejected`/`none` → 可再申请改为 `pending`  
  - 已是 `approved`/`pending`/`frozen` → 409  
- `GET /api/organizers/me` 当前用户的组织者资料  

- [x] **Step 2: PublisherGuard**

仅当关联 Organizer.`publishStatus === approved` 时通过。  
预留挂到未来 `POST /api/activities`（本阶段可挂一个 `GET /api/organizers/can-publish` 返回布尔，并加单测）。

- [ ] **Step 3: 验收 curl**（Docker Desktop 未就绪时跳过；单测覆盖 apply / canPublish 规则）

登录 → apply → `/organizers/me` 为 pending → `can-publish` 为 false。

- [x] **Step 4: Commit**

```bash
git commit -am "feat(api): organizer apply and publisher guard"
```

---

### Task 6: Admin 登录与组织者审核

**Files:**
- Create: `apps/api/src/admin-auth/*`
- Create: `apps/api/src/admin-organizers/*`
- Create: `apps/api/src/common/guards/admin-jwt.guard.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Create: `apps/api/src/common/decorators/roles.decorator.ts`

- [ ] **Step 1: Admin 登录**

- `POST /api/admin/auth/login` `{ email, password }`  
- 校验 bcrypt；签发 JWT `{ sub: adminId, typ: "admin", role }`，secret=`JWT_ADMIN_SECRET`  
- 小程序 user token 访问 admin 路由必须 401

- [ ] **Step 2: 组织者审核 API**（AdminJwt + Roles）

- `GET /api/admin/organizers?status=pending`  
- `POST /api/admin/organizers/:id/approve` `{ note? }` → `approved` + AuditLog  
- `POST /api/admin/organizers/:id/reject` `{ reason }` → `rejected`  
- `POST /api/admin/organizers/:id/freeze` `{ reason }` → `frozen`  

`operator` 与 `admin` 均可审核；后续「创建 AdminUser」仅 `admin`（本阶段可只做审核 API）。

- [ ] **Step 3: 端到端脚本验收**

```bash
# user apply → admin login → approve → user can-publish true
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(api): admin auth and organizer review APIs"
```

---

### Task 7: Admin 前端最小页

**Files:**
- Modify: `apps/admin/src/main.ts`, `apps/admin/package.json`（加 vue-router）
- Create: `apps/admin/src/router.ts`, `apps/admin/src/api/http.ts`
- Create: `apps/admin/src/views/Login.vue`, `OrganizerApplications.vue`

- [ ] **Step 1: http 封装**

`VITE_API_BASE=http://localhost:3000/api`，自动带 Admin Bearer。

- [ ] **Step 2: 登录页 + 申请列表**

列表展示 pending；操作通过/驳回；成功后刷新。

- [ ] **Step 3: 手动验收**

`pnpm dev:admin` + `pnpm dev:api`，用 bootstrap 账号登录并审批一条申请。

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(admin): login and organizer application review UI"
```

---

### Task 8: 小程序登录适配层

**Files:**
- Create: `apps/mp/src/utils/request.ts`
- Create: `apps/mp/src/adapters/auth.ts`
- Create: `apps/mp/src/stores/user.ts`
- Modify: `apps/mp/src/pages/index/index.vue`（临时：显示登录态与申请入口）
- Modify: `apps/mp/.env.development` → `VITE_API_BASE`

- [ ] **Step 1: request**

封装 `uni.request`，附带 `Authorization`；401 清 token。

- [ ] **Step 2: auth adapter**

```ts
// 伪代码
export async function loginWithWeixin() {
  // #ifdef MP-WEIXIN
  const { code } = await uni.login({ provider: "weixin" });
  // #endif
  // 开发 H5/无 AppId 时可用 code: 'dev' + AUTH_DEV_BYPASS
  return api.post("/auth/weixin/login", { code });
}
```

- [ ] **Step 3: Pinia user store**

`token` 存 `uni.setStorageSync`；`fetchMe`；`applyOrganizer`。

- [ ] **Step 4: 首页临时联调 UI**

按钮：登录 / 申请组织者 / 显示 publishStatus。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(mp): auth adapter, request helper, organizer apply entry"
```

---

### Task 9: 文档与 roadmap 收尾

**Files:**
- Modify: `docs/roadmap.md`（勾选 P0-1）
- Modify: `docs/adr/0003-identity-and-organizer.md`、`0004-admin-rbac.md` 状态 → `Implemented`
- Modify: `apps/api/README.md`（启动步骤）

- [ ] **Step 1: 更新状态与 README**
- [ ] **Step 2: Commit**

```bash
git commit -am "docs: mark P0-1 ADRs implemented and update roadmap"
```

---

## 验收清单（对照 PRD）

| 用例 | 预期 |
| --- | --- |
| 未登录调 `/me` | 401 |
| user JWT 调 `/admin/**` | 401 |
| 无组织者或非 approved 调 can-publish | false |
| apply → admin approve → can-publish | true |
| admin freeze → can-publish | false |
| 未登录访问 admin 受保护页 | 跳转登录 |

---

## Self-review

1. **Spec coverage：** ADR-0003/0004 的 UserIdentity、Organizer 申请、Admin 隔离 JWT、审核与审计均有对应 Task。  
2. **Placeholder scan：** 无 TBD；支付/活动创建不在本 plan。  
3. **Type consistency：** `PublishStatus` / `AdminRole` / `IdentityProvider` 与 Prisma enum、shared 常量同名同值。

---

## 执行方式

Plan 已保存。可选：

1. **Subagent-Driven（推荐）** — 每 Task 新开子代理，Task 间人工/主代理复核  
2. **Inline Execution** — 本会话按 executing-plans 连续做并设检查点  

你更想用哪一种？
