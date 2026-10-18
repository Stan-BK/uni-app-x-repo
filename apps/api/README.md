# @activity/api

NestJS + Prisma + PostgreSQL。身份与组织者审核见 ADR-0003 / ADR-0004。

## 本地启动

1. 启动 PostgreSQL（示例 Colima + Docker）：

```bash
docker run -d --name activity-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=activity \
  -p 5432:5432 \
  postgres:16-alpine
```

2. 配置环境变量：复制 `.env.example` → `.env`（默认 `DATABASE_URL` 指向 `127.0.0.1:5432`）。

3. 迁移与种子 Admin：

```bash
pnpm --filter @activity/api exec prisma migrate deploy
pnpm --filter @activity/api exec prisma db seed
```

种子账号：`ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`（见 `.env.example`）。

4. 启动 API：

```bash
pnpm dev:api
```

默认 `http://127.0.0.1:3000/api`。开发登录可用 `AUTH_DEV_BYPASS=true` + `POST /api/auth/weixin/login` body `{"code":"dev"}`。

## 常用脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm start:dev` | watch 开发 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm prisma:migrate` | 交互式 migrate |
| `pnpm prisma:seed` | 引导 Admin |
