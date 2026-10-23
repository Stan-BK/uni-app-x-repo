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
    <view
      v-if="user.isLoggedIn"
      class="logout"
      hover-class="none"
      @click="onLogout"
    >
      <text>退出登录</text>
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
/** Bumped on each identity refresh so in-flight GET /me cannot clobber local state. */
let loadGen = 0;

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
    loadGen += 1;
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
    loadGen += 1;
    avatarPreview.value = user.me?.avatarUrl ?? "";
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

async function onLogout() {
  const res = await uni.showModal({
    title: "退出登录",
    content: "退出后需重新登录。仅清除本机登录态，不会注销微信账号。",
  });
  if (!res.confirm) return;
  user.logout();
  uni.switchTab({ url: "/pages/mine/registrations" });
}

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  loadGen += 1;
  const gen = loadGen;
  void user.refreshIdentity()
    .catch(() => {
      /* 网络失败时保留本地态 */
    })
    .finally(() => {
      if (gen !== loadGen || saving.value) return;
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

.logout {
  margin-top: 48rpx;
  padding: 16rpx 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout text {
  font-size: 26rpx;
  color: $ed-color-text-secondary;
}
</style>
