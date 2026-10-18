<template>
  <view class="page">
    <view v-if="!drafts.length" class="empty card">
      <text class="empty-title">暂无活动</text>
      <text class="empty-desc">服务端活动列表将在 P0-2 接入；当前仅展示本机草稿。</text>
      <button class="primary" @click="goCreate">去发布</button>
    </view>
    <view v-else class="list">
      <view v-for="item in drafts" :key="item.id" class="card">
        <text class="title">{{ item.title }}</text>
        <text class="meta">状态：本地草稿 · {{ formatTime(item.createdAt) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";

type Draft = { id: string; title: string; status: string; createdAt: string };

const DRAFT_KEY = "organizer_activity_drafts";
const drafts = ref<Draft[]>([]);

function load() {
  const raw = uni.getStorageSync(DRAFT_KEY);
  drafts.value = Array.isArray(raw) ? raw : [];
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function goCreate() {
  uni.navigateTo({ url: "/pages/organizer/create" });
}

onShow(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 16rpx;
}
.empty {
  text-align: center;
}
.empty-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.empty-desc {
  display: block;
  font-size: 24rpx;
  color: #9ca3af;
  margin-bottom: 24rpx;
}
.title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.meta {
  font-size: 24rpx;
  color: #6b7280;
}
button.primary {
  background: #0f766e;
  color: #fff;
  width: 280rpx;
}
button::after {
  border: none;
}
</style>
