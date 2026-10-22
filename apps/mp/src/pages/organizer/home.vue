<template>
  <view class="page page-l2">
    <view class="card">
      <text class="title">发布 / 我的活动</text>
      <text class="line">canPublish：{{ user.canPublish ? "是" : "否" }}</text>
    </view>

    <view v-if="user.isLoggedIn" class="actions">
      <button
        v-if="user.canPublish"
        class="ed-btn"
        hover-class="none"
        @click="goCreate"
      >
        发布活动
      </button>
      <button class="ed-btn-secondary" hover-class="none" @click="goMine">
        我的活动
      </button>
    </view>
    <view v-if="user.isLoggedIn && user.me && !user.canPublish" class="tip card">
      <text>发布权限已关闭</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";

const user = useUserStore();

function goCreate() {
  uni.navigateTo({ url: "/pages/organizer/create" });
}

function goMine() {
  uni.navigateTo({ url: "/pages/organizer/list" });
}

onShow(() => {
  if (user.isLoggedIn) {
    void user.refreshIdentity();
  }
});
</script>

<style scoped lang="scss">
.card {
  margin-top: 24rpx;
  margin-bottom: 24rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
}

.title {
  display: block;
  font-size: 38rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 16rpx;
}

.line {
  display: block;
  font-size: 26rpx;
  color: $ed-color-text-secondary;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.actions button {
  margin: 0;
  font-weight: 600;
}

.tip {
  font-size: 26rpx;
  color: $ed-color-text-secondary;
  line-height: 1.5;
}
</style>
