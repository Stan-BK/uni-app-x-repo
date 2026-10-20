<template>
  <view class="page">
    <view class="card">
      <text class="title">发布 / 我的活动</text>
      <text class="line">canPublish：{{ user.canPublish ? "是" : "否" }}</text>
    </view>

    <view v-if="user.isLoggedIn" class="actions">
      <button v-if="user.canPublish" class="primary" @click="goCreate">
        发布活动
      </button>
      <button class="ghost" @click="goMine">我的活动</button>
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

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx;
  box-sizing: border-box;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.line {
  display: block;
  font-size: 26rpx;
  color: #4b5563;
  margin-bottom: 8rpx;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
button.primary {
  background: #0f766e;
  color: #fff;
}
button.ghost {
  background: #e5e7eb;
  color: #111827;
}
button::after {
  border: none;
}
.tip {
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.5;
}
</style>
