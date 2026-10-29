<template>
  <view class="page page-l2">
    <view v-if="showLoginGuideTip" class="guide-banner">
      <text class="guide-banner-text">请选择头像并填写昵称</text>
    </view>
    <view class="card">
      <view class="avatar-block">
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
          <view class="edit-ico-avatar">
            <view class="camera-ico" />
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
          <view class="edit-ico-avatar">
            <view class="camera-ico" />
          </view>
        </view>
        <!-- #endif -->
      </view>

      <view class="row">
        <view class="field-label-wrap">
          <text class="field-label">昵称</text>
        </view>
        <input
          class="field-input"
          :type="nicknameInputType"
          :value="draftNickname"
          maxlength="32"
          placeholder="填写昵称"
          placeholder-class="placeholder"
          @input="onNicknameInput"
          @blur="onNicknameCommit"
          @confirm="onNicknameCommit"
        />
        <view class="edit-ico" />
      </view>
      <text class="hint">用于活动主办与个人页展示</text>

      <view class="row">
        <view class="field-label-wrap">
          <text class="field-label">报名姓名</text>
        </view>
        <input
          class="field-input"
          :value="draftRealName"
          maxlength="32"
          placeholder="用于报名预填"
          placeholder-class="placeholder"
          @input="onRealNameInput"
          @blur="onRealNameCommit"
          @confirm="onRealNameCommit"
        />
        <view class="edit-ico" />
      </view>

      <view class="row">
        <view class="field-label-wrap">
          <text class="field-label">手机号</text>
        </view>
        <input
          class="field-input"
          type="number"
          :value="draftPhone"
          maxlength="11"
          placeholder="用于报名预填"
          placeholder-class="placeholder"
          @input="onPhoneInput"
          @blur="onPhoneCommit"
          @confirm="onPhoneCommit"
        />
        <view class="edit-ico" />
      </view>
      <text class="hint">用于下次报名预填。活动主办看到的是当次报名快照。</text>

      <view class="row row-last">
        <text class="field-label">发布权限</text>
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
import { onLoad, onShow } from "@dcloudio/uni-app";
import { PHONE_PATTERN } from "@activity/shared";
import { pickAvatarFromAlbum } from "@/adapters/profile";
import { uploadAvatar } from "@/api/me";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const user = useUserStore();
const draftNickname = ref("");
const draftRealName = ref("");
const draftPhone = ref("");
const avatarPreview = ref("");
const saving = ref(false);
/** 从登录成功引导进入 */
const fromLogin = ref(false);
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

const showLoginGuideTip = computed(() => {
  if (!fromLogin.value) return false;
  const nick = draftNickname.value.trim();
  const avatar = avatarPreview.value.trim();
  return !nick || !avatar;
});

onLoad((query) => {
  fromLogin.value = query?.from === "login";
});

function syncFromStore() {
  draftNickname.value = user.me?.nickname ?? "";
  draftRealName.value = user.me?.realName ?? "";
  draftPhone.value = user.me?.phone ?? "";
  avatarPreview.value = user.me?.avatarUrl ?? "";
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "保存失败";
}

function inputDetailValue(e: Event): string {
  const value = (e as unknown as { detail?: { value?: string } }).detail?.value;
  return value ?? "";
}

function onNicknameInput(e: Event) {
  draftNickname.value = inputDetailValue(e);
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

function onRealNameInput(e: Event) {
  draftRealName.value = inputDetailValue(e);
}

async function onRealNameCommit() {
  if (!user.isLoggedIn || saving.value) return;
  const next = draftRealName.value.trim();
  const prev = (user.me?.realName ?? "").trim();
  if (next === prev) return;
  saving.value = true;
  try {
    await user.updateProfile({ realName: next || null });
    loadGen += 1;
    syncFromStore();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    saving.value = false;
  }
}

function onPhoneInput(e: Event) {
  draftPhone.value = inputDetailValue(e);
}

async function onPhoneCommit() {
  if (!user.isLoggedIn || saving.value) return;
  const next = draftPhone.value.trim();
  const prev = (user.me?.phone ?? "").trim();
  if (next === prev) return;
  if (next && !PHONE_PATTERN.test(next)) {
    uni.showToast({ title: "请填写 11 位手机号", icon: "none" });
    return;
  }
  saving.value = true;
  try {
    await user.updateProfile({ phone: next || null });
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
$ed-color-text-muted: #929b92 !default;
$ed-color-brand: #1e9b88 !default;
$ed-color-brand-soft: #d4f3ec !default;
$ed-color-terracotta: #b94e2d !default;
$ed-radius-card: 32rpx !default;
$ed-space-card: 32rpx !default;

.guide-banner {
  margin-top: 24rpx;
  padding: 20rpx 28rpx;
  background: $ed-color-brand-soft;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
}

.guide-banner-text {
  font-size: 26rpx;
  color: $ed-color-brand;
  line-height: 1.5;
  font-weight: 600;
}

.card {
  margin-top: 24rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
}

.avatar-block {
  display: flex;
  justify-content: center;
  padding: 16rpx 0 36rpx;
  margin-bottom: 8rpx;
  border-bottom: 1rpx solid $ed-color-border;
}

.avatar-btn {
  position: relative;
  padding: 0;
  margin: 0;
  width: 144rpx;
  height: 144rpx;
  border-radius: 50%;
  overflow: visible;
  flex-shrink: 0;
  background: transparent;
  line-height: 0;
  border: none;
}

.avatar-btn::after {
  border: none;
}

.avatar {
  width: 144rpx;
  height: 144rpx;
  border-radius: 50%;
  background: $ed-color-brand-soft;
  border: 1rpx solid $ed-color-border;
  box-sizing: border-box;
}

.avatar-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.avatar-head {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 10rpx;
}

.avatar-body {
  width: 80rpx;
  height: 36rpx;
  border-radius: 40rpx 40rpx 0 0;
  background: $ed-color-brand;
}

.edit-ico {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
  background-color: $ed-color-text-muted;
  -webkit-mask-image: url("/static/ico/edit.svg");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: url("/static/ico/edit.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.edit-ico-avatar {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $ed-color-brand;
  border-radius: 50%;
  box-shadow: 0 0 0 4rpx $ed-color-surface;
}

.camera-ico {
  width: 24rpx;
  height: 22rpx;
  background-color: #fff;
  -webkit-mask-image: url("/static/ico/camera.svg");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: url("/static/ico/camera.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  min-height: 88rpx;
  padding: 8rpx 0;
  border-bottom: 1rpx solid $ed-color-border;
}

.row-last {
  border-bottom: none;
}

.field-label-wrap,
.row > .field-label {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
  width: 180rpx;
}

.field-label {
  font-size: 26rpx;
  color: $ed-color-text-muted;
  line-height: 1.4;
}

.field-input {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: $ed-color-text;
  text-align: right;
}

.placeholder {
  color: $ed-color-text-secondary;
}

.hint {
  display: block;
  padding: 4rpx 0 16rpx;
  font-size: 22rpx;
  color: $ed-color-text-secondary;
  line-height: 1.5;
}

.value {
  flex: 1;
  font-size: 28rpx;
  color: $ed-color-brand;
  font-weight: 600;
  text-align: right;
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
