<template>
  <view class="page page-l2">
    <view class="card">
      <view class="head">
        <image
          v-if="user.me?.avatarUrl"
          class="avatar"
          :src="user.me.avatarUrl"
          mode="aspectFill"
        />
        <view v-else class="avatar avatar-fallback">
          <view class="avatar-head" />
          <view class="avatar-body" />
        </view>
        <view class="meta">
          <text class="nickname">{{
            user.me?.nickname || "微信用户"
          }}</text>
          <text class="sub">微信账号</text>
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
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";

const user = useUserStore();

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  void user.refreshIdentity().catch(() => {
    /* 网络失败时保留本地态 */
  });
});
</script>

<style scoped lang="scss">
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

.avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  flex-shrink: 0;
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

.nickname {
  display: block;
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
