# 个人展示资料（昵称 / 头像） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登录用户可在「我的信息」自助更新昵称和头像，写入 `User`，公开主办名随昵称变化。

**Architecture:** `PATCH /me` 部分更新 `nickname` / `avatarUrl`；头像先 `POST /me/uploads/avatar`（只验用户 JWT，不要求发布权）落到 `uploads/avatars/`。微信端用官方 `chooseAvatar` 按钮和 `input type="nickname"`；H5 用相册选图 + 普通输入。不改登录、报名表、Admin、OSS。

**Tech Stack:** NestJS 11、Prisma 6、Vitest、uni-app Vue3、Pinia、pnpm workspace、`@activity/shared`

**前置文档：** [ADR-0012](../../adr/0012-user-profile-display.md)、[设计规格](../specs/2026-10-22-user-profile-display-design.md)

---

## 文件结构

```text
packages/shared/src/identity.ts
  NICKNAME_MAX_LENGTH = 32

apps/api/src/auth/avatar-url.ts
apps/api/src/auth/avatar-url.spec.ts
  校验头像 URL 必须是本服务 /uploads/avatars/

apps/api/src/auth/dto/patch-me.dto.ts
apps/api/src/auth/auth.service.ts          # updateMe
apps/api/src/auth/auth.service.spec.ts
apps/api/src/auth/auth.controller.ts       # PATCH /me

apps/api/src/uploads/uploads.controller.ts # 封面 Guard 下沉到方法；新增 avatar

apps/mp/src/api/me.ts                      # patchMe + uploadAvatar
apps/mp/src/adapters/profile.ts            # H5 选图（微信必须用 button，不能 JS 调起）
apps/mp/src/stores/user.ts                 # updateProfile
apps/mp/src/pages/mine/profile.vue         # 可编辑
```

不新建 Prisma 迁移（列已存在）。不改 Admin。不改报名表单。

---

### Task 1: shared — 昵称长度常量

**Files:**
- Modify: `packages/shared/src/identity.ts`

- [x] **Step 1: 追加常量**

在 `AdminRole` 之后增加：

```ts
/** 用户自助展示昵称最大长度（Unicode 码元，trim 后） */
export const NICKNAME_MAX_LENGTH = 32;
```

- [x] **Step 2: 构建 shared**

Run: `pnpm --filter @activity/shared build`  
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add packages/shared/src/identity.ts
git commit -m "$(cat <<'EOF'
feat(shared): 增加展示昵称最大长度常量

EOF
)"
```

---

### Task 2: 头像 URL 校验（先写测试）

**Files:**
- Create: `apps/api/src/auth/avatar-url.spec.ts`
- Create: `apps/api/src/auth/avatar-url.ts`

- [x] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { isAllowedAvatarUrl } from "./avatar-url";

describe("isAllowedAvatarUrl", () => {
  it("accepts this service avatar path", () => {
    expect(
      isAllowedAvatarUrl("http://192.168.1.3:3000/api/uploads/avatars/a.jpg"),
    ).toBe(true);
    expect(
      isAllowedAvatarUrl("https://example.com/api/uploads/avatars/a.webp"),
    ).toBe(true);
  });

  it("rejects temp, cover, and traversal paths", () => {
    expect(isAllowedAvatarUrl("wxfile://tmp_a.png")).toBe(false);
    expect(isAllowedAvatarUrl("http://tmp/foo.png")).toBe(false);
    expect(
      isAllowedAvatarUrl("http://192.168.1.3:3000/api/uploads/covers/a.jpg"),
    ).toBe(false);
    expect(
      isAllowedAvatarUrl(
        "http://192.168.1.3:3000/api/uploads/avatars/../covers/a.jpg",
      ),
    ).toBe(false);
    expect(isAllowedAvatarUrl("not-a-url")).toBe(false);
    expect(isAllowedAvatarUrl("")).toBe(false);
  });
});
```

- [x] **Step 2: 跑测试，确认失败**

Run: `pnpm --filter @activity/api test -- src/auth/avatar-url.spec.ts`  
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现**

```ts
export function isAllowedAvatarUrl(value: string): boolean {
  if (!value || /^\s*$/.test(value)) return false;
  if (/^(wxfile:|file:|weixin:)/i.test(value)) return false;
  try {
    const pathname = new URL(value).pathname;
    if (pathname.includes("..")) return false;
    return pathname.includes("/uploads/avatars/");
  } catch {
    return false;
  }
}
```

不要校验 hostname：开发机 LAN IP 与 `PUBLIC_API_BASE` 可能不一致。

- [x] **Step 4: 再跑测试**

Run: `pnpm --filter @activity/api test -- src/auth/avatar-url.spec.ts`  
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add apps/api/src/auth/avatar-url.ts apps/api/src/auth/avatar-url.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 限制头像 URL 必须为本服务 avatars 路径

EOF
)"
```

---

### Task 3: `AuthService.updateMe` TDD

**Files:**
- Modify: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.service.ts`

现有 mock 只有 `prisma.user.findUnique` / `create`。本任务给 `prisma.user` 加上 `update`。

- [x] **Step 1: 在 spec 的 `prisma.user` mock 增加 `update: vi.fn()`**

`beforeEach` 里 `vi.clearAllMocks()` 已有，无需改。

- [x] **Step 2: 追加失败用例（写在 `getMe` 那个 it 后面）**

```ts
  it("updateMe rejects empty patch", async () => {
    await expect(service.updateMe("user-1", {})).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updateMe trims nickname and maps blank to null", async () => {
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      nickname: null,
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      canPublish: false,
    });

    const result = await service.updateMe("user-1", { nickname: "  " });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { nickname: null },
    });
    expect(result).toEqual({
      id: "user-1",
      nickname: null,
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      canPublish: false,
    });
  });

  it("updateMe rejects too-long nickname", async () => {
    await expect(
      service.updateMe("user-1", { nickname: "啊".repeat(33) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updateMe rejects non-avatar url", async () => {
    await expect(
      service.updateMe("user-1", {
        avatarUrl: "wxfile://tmp.png",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updateMe writes nickname and avatarUrl and keeps canPublish", async () => {
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      nickname: "小陈",
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      canPublish: false,
    });

    const result = await service.updateMe("user-1", {
      nickname: " 小陈 ",
      avatarUrl: "http://x/api/uploads/avatars/a.jpg",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        nickname: "小陈",
        avatarUrl: "http://x/api/uploads/avatars/a.jpg",
      },
    });
    expect(result.canPublish).toBe(false);
    expect(result.nickname).toBe("小陈");
  });
```

- [x] **Step 3: 跑测试，确认失败**

Run: `pnpm --filter @activity/api test -- src/auth/auth.service.spec.ts`  
Expected: FAIL（`updateMe` 不存在）

- [x] **Step 4: 实现 `updateMe`**

在 `auth.service.ts` 增加 import：`NICKNAME_MAX_LENGTH` from `@activity/shared`，`isAllowedAvatarUrl` from `./avatar-url`。

在 `getMe` 之后：

```ts
  async updateMe(
    userId: string,
    input: { nickname?: string | null; avatarUrl?: string | null },
  ): Promise<MeResult> {
    const hasNickname = Object.prototype.hasOwnProperty.call(input, "nickname");
    const hasAvatar = Object.prototype.hasOwnProperty.call(input, "avatarUrl");
    if (!hasNickname && !hasAvatar) {
      throw new HttpException("请提供要更新的字段", HttpStatus.BAD_REQUEST);
    }

    const data: { nickname?: string | null; avatarUrl?: string | null } = {};

    if (hasNickname) {
      if (input.nickname == null) {
        data.nickname = null;
      } else {
        const nickname = input.nickname.trim();
        if (nickname.length > NICKNAME_MAX_LENGTH) {
          throw new HttpException("昵称过长", HttpStatus.BAD_REQUEST);
        }
        data.nickname = nickname.length ? nickname : null;
      }
    }

    if (hasAvatar) {
      if (input.avatarUrl == null) {
        data.avatarUrl = null;
      } else if (!isAllowedAvatarUrl(input.avatarUrl)) {
        throw new HttpException("头像地址无效", HttpStatus.BAD_REQUEST);
      } else {
        data.avatarUrl = input.avatarUrl;
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data,
      });
      return {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        canPublish: user.canPublish,
      };
    } catch {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND);
    }
  }
```

`hasOwnProperty` 是为了区分「没传」和「显式 null」。测试里 `{ nickname: "  " }` 算传了 nickname。

- [x] **Step 5: 再跑测试**

Run: `pnpm --filter @activity/api test -- src/auth/auth.service.spec.ts`  
Expected: PASS（含原有 login / getMe）

- [x] **Step 6: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): 支持用户自助更新昵称与头像

EOF
)"
```

---

### Task 4: DTO + `PATCH /me`

**Files:**
- Create: `apps/api/src/auth/dto/patch-me.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`

- [x] **Step 1: DTO**

```ts
import { IsOptional, IsString, MaxLength } from "class-validator";
import { NICKNAME_MAX_LENGTH } from "@activity/shared";

export class PatchMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(NICKNAME_MAX_LENGTH)
  nickname?: string | null;

  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
```

`ValidationPipe` 已 `whitelist: true`：客户端多传的 `canPublish` / `phone` 会被丢掉。

- [x] **Step 2: Controller 增加 PATCH**

`auth.controller.ts` 的 import 改为：

```ts
import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
```

并增加：

```ts
import { PatchMeDto } from "./dto/patch-me.dto";
```

在 `me()` 方法后：

```ts
  @Patch("me")
  @UseGuards(UserJwtGuard)
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PatchMeDto,
  ) {
    return this.authService.updateMe(user.userId, dto);
  }
```

- [x] **Step 3: 类型检查**

Run: `pnpm --filter @activity/api test -- src/auth/auth.service.spec.ts`  
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add apps/api/src/auth/dto/patch-me.dto.ts apps/api/src/auth/auth.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): 增加 PATCH /me

EOF
)"
```

---

### Task 5: 头像上传（不要求发布权）

**Files:**
- Modify: `apps/api/src/uploads/uploads.controller.ts`

当前类上是 `@UseGuards(UserJwtGuard, CanPublishGuard)`，冻结用户无法改头像。必须把 `CanPublishGuard` **只留在封面方法上**。

- [x] **Step 1: 改 controller**

完整替换为：

```ts
import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import type { Request } from "express";
import { mkdirSync } from "fs";
import { UserJwtGuard } from "../common/guards/user-jwt.guard";
import { CanPublishGuard } from "../common/guards/can-publish.guard";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const coversDir = join(process.cwd(), "uploads", "covers");
const avatarsDir = join(process.cwd(), "uploads", "avatars");
mkdirSync(coversDir, { recursive: true });
mkdirSync(avatarsDir, { recursive: true });

function publicApiBase(req: Request): string {
  return (
    process.env.PUBLIC_API_BASE?.replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}/api`
  );
}

function imageInterceptor(dir: string, maxBytes: number) {
  return FileInterceptor("file", {
    limits: { fileSize: maxBytes },
    storage: diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname || "").toLowerCase() || ".jpg";
        cb(null, `${randomUUID()}${ext}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(new Error("仅支持 jpg / png / webp / gif 图片"), false);
        return;
      }
      cb(null, true);
    },
  });
}

@Controller("me/uploads")
@UseGuards(UserJwtGuard)
export class UploadsController {
  @Post("cover")
  @UseGuards(CanPublishGuard)
  @UseInterceptors(imageInterceptor(coversDir, 5 * 1024 * 1024))
  uploadCover(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException("请选择封面图片");
    }
    return { url: `${publicApiBase(req)}/uploads/covers/${file.filename}` };
  }

  @Post("avatar")
  @UseInterceptors(imageInterceptor(avatarsDir, 2 * 1024 * 1024))
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException("请选择头像图片");
    }
    return { url: `${publicApiBase(req)}/uploads/avatars/${file.filename}` };
  }
}
```

`main.ts` 已把整个 `uploads/` 挂到 `/api/uploads/`，头像无需改 Nginx。

- [x] **Step 2: 确认封面 Guard 仍在方法上**

封面：`UserJwtGuard`（类）+ `CanPublishGuard`（方法）。  
头像：只有 `UserJwtGuard`。

- [x] **Step 3: Commit**

```bash
git add apps/api/src/uploads/uploads.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): 增加头像上传且不要求发布权

EOF
)"
```

---

### Task 6: 小程序 API 与 store

**Files:**
- Create: `apps/mp/src/api/me.ts`
- Modify: `apps/mp/src/stores/user.ts`

- [x] **Step 1: `apps/mp/src/api/me.ts`**

```ts
import { getApiBase, getUserToken, request, ApiError } from "../utils/request";
import type { MeResult } from "../stores/user";

export function patchMe(body: {
  nickname?: string | null;
  avatarUrl?: string | null;
}) {
  return request<MeResult>("/me", { method: "PATCH", data: body });
}

export function uploadAvatar(filePath: string): Promise<{ url: string }> {
  const token = getUserToken();
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${getApiBase()}/me/uploads/avatar`,
      filePath,
      name: "file",
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode === 401) {
          reject(new ApiError(401, "请重新登录"));
          return;
        }
        let body: unknown = res.data;
        if (typeof body === "string") {
          try {
            body = JSON.parse(body);
          } catch {
            reject(new Error("上传响应无效"));
            return;
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            (body as { message: unknown }).message != null
              ? String((body as { message: string }).message)
              : `上传失败 HTTP ${res.statusCode}`;
          reject(new ApiError(res.statusCode, msg));
          return;
        }
        const url = (body as { url?: string }).url;
        if (!url) {
          reject(new Error("上传成功但未返回地址"));
          return;
        }
        resolve({ url });
      },
      fail: (err) => reject(new Error(err.errMsg || "上传失败")),
    });
  });
}
```

- [x] **Step 2: store 增加 `updateProfile`**

`user.ts` 增加 import：

```ts
import { patchMe } from "../api/me";
```

在 `refreshIdentity` 后：

```ts
    async updateProfile(patch: {
      nickname?: string | null;
      avatarUrl?: string | null;
    }) {
      this.me = await patchMe(patch);
      this.canPublishFlag = this.me?.canPublish ?? false;
      return this.me;
    },
```

- [x] **Step 3: Commit**

```bash
git add apps/mp/src/api/me.ts apps/mp/src/stores/user.ts
git commit -m "$(cat <<'EOF'
feat(mp): 增加个人资料 PATCH 与头像上传客户端

EOF
)"
```

---

### Task 7: H5 选图适配 + 「我的信息」可编辑

**Files:**
- Create: `apps/mp/src/adapters/profile.ts`
- Modify: `apps/mp/src/pages/mine/profile.vue`

微信 `chooseAvatar` **必须**由用户点击 `<button open-type="chooseAvatar">` 触发，不能 `uni.xxx` 调起。适配层只负责 H5 相册。

- [x] **Step 1: `apps/mp/src/adapters/profile.ts`**

```ts
export function pickAvatarFromAlbum(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const path = res.tempFilePaths?.[0];
        if (!path) {
          reject(new Error("未选择图片"));
          return;
        }
        resolve(path);
      },
      fail: (err) => {
        const errMsg = err.errMsg || "";
        if (errMsg.includes("cancel")) {
          reject(Object.assign(new Error("cancel"), { cancelled: true }));
          return;
        }
        reject(new Error(errMsg || "选择图片失败"));
      },
    });
  });
}
```

- [x] **Step 2: 重写 `profile.vue`**

模板要点：

- 微信用 `button.avatar-btn` + `open-type="chooseAvatar"` + `@chooseavatar`。
- 非微信用 `view` `@click="onPickAlbum"`。
- 昵称：微信 `type="nickname"`，其它 `type="text"`；`@input` 只改本地 draft，`@blur` / `@confirm` 再 PATCH。
- 发布权限只读。
- 文案：「用于活动主办与个人页展示」。

完整文件：

```vue
<template>
  <view class="page page-l2">
    <view class="card">
      <view class="head">
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="avatar-btn"
          open-type="chooseAvatar"
          hover-class="none"
          @chooseavatar="onChooseAvatar"
        >
          <image
            v-if="avatarPreview"
            class="avatar"
            :src="avatarPreview"
            mode="aspectFill"
          />
          <view v-else class="avatar avatar-fallback">
            <view class="avatar-head" />
            <view class="avatar-body" />
          </view>
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view class="avatar-btn" hover-class="none" @click="onPickAlbum">
          <image
            v-if="avatarPreview"
            class="avatar"
            :src="avatarPreview"
            mode="aspectFill"
          />
          <view v-else class="avatar avatar-fallback">
            <view class="avatar-head" />
            <view class="avatar-body" />
          </view>
        </view>
        <!-- #endif -->
        <view class="meta">
          <input
            class="nickname-input"
            :type="nicknameInputType"
            :value="draftNickname"
            maxlength="32"
            placeholder="填写昵称"
            @input="onNicknameInput"
            @blur="onNicknameCommit"
            @confirm="onNicknameCommit"
          />
          <text class="sub">用于活动主办与个人页展示</text>
        </view>
      </view>
      <view class="row">
        <text class="label">发布权限</text>
        <text class="value" :class="{ muted: !user.canPublish }">{{
          user.canPublish ? "已开启" : "已关闭"
        }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { pickAvatarFromAlbum } from "@/adapters/profile";
import { uploadAvatar } from "@/api/me";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const user = useUserStore();
const draftNickname = ref("");
const avatarPreview = ref("");
const saving = ref(false);

const nicknameInputType = computed(() => {
  // #ifdef MP-WEIXIN
  return "nickname";
  // #endif
  // #ifndef MP-WEIXIN
  return "text";
  // #endif
});

function syncFromStore() {
  draftNickname.value = user.me?.nickname ?? "";
  avatarPreview.value = user.me?.avatarUrl ?? "";
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "保存失败";
}

function onNicknameInput(e: { detail?: { value?: string } }) {
  draftNickname.value = e.detail?.value ?? "";
}

async function onNicknameCommit() {
  if (!user.isLoggedIn || saving.value) return;
  const next = draftNickname.value.trim();
  const prev = (user.me?.nickname ?? "").trim();
  if (next === prev) return;
  saving.value = true;
  try {
    await user.updateProfile({ nickname: next || null });
    syncFromStore();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    saving.value = false;
  }
}

async function saveAvatar(filePath: string) {
  if (!user.isLoggedIn || saving.value) return;
  avatarPreview.value = filePath;
  saving.value = true;
  try {
    const { url } = await uploadAvatar(filePath);
    await user.updateProfile({ avatarUrl: url });
    syncFromStore();
  } catch (e) {
    avatarPreview.value = user.me?.avatarUrl ?? "";
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    saving.value = false;
  }
}

function onChooseAvatar(e: { detail?: { avatarUrl?: string } }) {
  const path = e.detail?.avatarUrl;
  if (!path) return;
  void saveAvatar(path);
}

async function onPickAlbum() {
  try {
    const path = await pickAvatarFromAlbum();
    await saveAvatar(path);
  } catch (e) {
    if (e && typeof e === "object" && "cancelled" in e) return;
    uni.showToast({ title: errMessage(e), icon: "none" });
  }
}

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  void user.refreshIdentity()
    .catch(() => {
      /* 网络失败时保留本地态 */
    })
    .finally(() => {
      syncFromStore();
    });
});
</script>

<style scoped lang="scss">
$ed-color-surface: #fffefb !default;
$ed-color-border: #e7e2d9 !default;
$ed-color-text: #24312d !default;
$ed-color-text-secondary: #77837a !default;
$ed-color-brand: #1e9b88 !default;
$ed-color-brand-soft: #d4f3ec !default;
$ed-color-terracotta: #b94e2d !default;
$ed-radius-card: 32rpx !default;
$ed-space-card: 32rpx !default;

.card {
  margin-top: 24rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
}

.head {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding-bottom: 28rpx;
  margin-bottom: 8rpx;
  border-bottom: 1rpx solid $ed-color-border;
}

.avatar-btn {
  padding: 0;
  margin: 0;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: transparent;
  line-height: 0;
  border: none;
}

.avatar-btn::after {
  border: none;
}

.avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: $ed-color-brand-soft;
}

.avatar-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.avatar-head {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 8rpx;
}

.avatar-body {
  width: 64rpx;
  height: 28rpx;
  border-radius: 32rpx 32rpx 0 0;
  background: $ed-color-brand;
}

.meta {
  flex: 1;
  min-width: 0;
}

.nickname-input {
  width: 100%;
  height: 64rpx;
  font-size: 34rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.3;
}

.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72rpx;
  padding-top: 12rpx;
}

.label {
  font-size: 28rpx;
  color: $ed-color-text;
}

.value {
  font-size: 28rpx;
  color: $ed-color-brand;
  font-weight: 600;
}

.value.muted {
  color: $ed-color-terracotta;
}
</style>
```

`nicknameInputType` 里的 `#ifdef` 在 `<script>` 中对 uni 条件编译是支持的。若构建报错，改成模板里两套 `<input>`（微信 / 非微信），逻辑不变。

- [x] **Step 3: Commit**

```bash
git add apps/mp/src/adapters/profile.ts apps/mp/src/pages/mine/profile.vue
git commit -m "$(cat <<'EOF'
feat(mp): 个人页支持编辑昵称与头像

EOF
)"
```

---

### Task 8: 文档收尾 + 回归测试

**Files:**
- Modify: `docs/adr/0012-user-profile-display.md` 状态 → Implemented
- Modify: `docs/adr/README.md` 0012 状态
- Modify: `docs/superpowers/specs/2026-10-22-user-profile-display-design.md` 状态 → Implemented，§8 勾选实现计划
- Modify: `docs/roadmap.md` P1-1 三项勾选
- Modify: 本计划文件，已完成任务打勾

- [x] **Step 1: 跑 API 测试**

Run: `pnpm --filter @activity/api test -- src/auth`  
Expected: PASS

- [ ] **Step 2: 手测清单**

H5 `http://localhost:5174/#/pages/mine/profile`：登录 → 改昵称失焦保存 → 选图上传 → 回「我的」看到新头像昵称。  
微信真机：`chooseAvatar` + `type=nickname`（开发者工具不完整）。  
可选：冻结 `canPublish` 的用户仍能改资料。

- [x] **Step 3: 改文档状态并提交**

```bash
git add docs/adr/0012-user-profile-display.md docs/adr/README.md \
  docs/superpowers/specs/2026-10-22-user-profile-display-design.md \
  docs/roadmap.md docs/superpowers/plans/2026-10-22-user-profile-display.md
git commit -m "$(cat <<'EOF'
docs: 将个人展示资料 ADR-0012 标为已实现

EOF
)"
```

---

## 规格覆盖

| 规格 | 任务 |
| --- | --- |
| `PATCH /me` | Task 3–4 |
| 昵称 trim / 空 / 超长 | Task 3 |
| 头像 URL 白名单 | Task 2–3 |
| `POST /me/uploads/avatar` 无发布权 | Task 5 |
| 微信 chooseAvatar + nickname | Task 7 |
| H5 选图 | Task 6–7 |
| 不强制完善、不改报名/Admin/OSS | 无对应任务（刻意不做） |
| `hostName` 规则不变 | 无代码；读同一 `User.nickname` |

## 手测注意

- 开发者工具里 `input type="nickname"` 不像真机，头像昵称以真机为准。
- 上传后的头像 URL 必须是局域网可打开的 `http://<LAN>:3000/api/uploads/avatars/...`。
- 不要把 `wxfile://` 直接 PATCH 上去。
