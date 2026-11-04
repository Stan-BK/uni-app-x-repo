# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# 镜像内安装走国内源。用 ARG/ENV，不改仓库根 .npmrc，避免本机开发被切到 npmmirror。
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    npm_config_registry=${NPM_REGISTRY}
RUN corepack enable \
    && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
# store-dir / deploy-all-files 只在镜像构建时生效。根 .npmrc 的 shamefully-hoist 与 pnpm deploy 不兼容，故不复制它。
COPY deploy/npmrc .npmrc
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @activity/api... --filter @activity/shared...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @activity/shared build \
    && pnpm --filter @activity/api exec prisma generate \
    && pnpm --filter @activity/api build
# 目标必须在 workspace 内：pnpm 9.15 把 modulesDir 写成相对路径，workspace 外的目录会链坏。
# 不要加 --prod。prisma CLI 在 devDependencies 里，entrypoint 的 migrate deploy 需要它。
# dist 与 shared 的 dist 被 gitignore，靠 deploy/npmrc 的 deploy-all-files 带上。
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @activity/api deploy /app/deploy-out \
    && pnpm --dir /app/deploy-out exec prisma generate

FROM base AS runner
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build /app/deploy-out /app/apps/api
COPY deploy/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=8 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
