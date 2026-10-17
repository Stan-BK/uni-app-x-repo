<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state empty">
      <text class="empty-title">还没有报名记录</text>
      <text class="empty-desc">去首页看看近期活动吧</text>
      <button class="empty-btn" @click="goHome">浏览活动</button>
    </view>
    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-top">
          <text class="title">{{ item.activityTitle }}</text>
          <text class="status" :class="item.status">{{ item.statusLabel }}</text>
        </view>
        <view class="meta">
          <text>报名人：{{ item.name }}</text>
          <text>手机：{{ item.phone }}</text>
          <text>提交时间：{{ item.createdAt }}</text>
        </view>
        <view class="actions">
          <text class="link" @click="goDetail(item.activityId)">查看活动</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listRegistrations, type Registration } from '@/mocks/activities'

const loading = ref(true)
const items = ref<Registration[]>([])

function load() {
  loading.value = true
  setTimeout(() => {
    items.value = listRegistrations()
    loading.value = false
  }, 150)
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' })
}

function goDetail(activityId: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${activityId}` })
}

onShow(load)
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx 24rpx 48rpx;
  box-sizing: border-box;
}

.state {
  padding: 120rpx 0;
  text-align: center;
  color: #8a9099;
  font-size: 28rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 160rpx;
}

.empty-title {
  font-size: 32rpx;
  color: #1a1d23;
  font-weight: 600;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #9ca3af;
  margin-bottom: 40rpx;
}

.empty-btn {
  width: 280rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 28rpx;
  border-radius: 12rpx;
  border: none;
}

.empty-btn::after {
  border: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 28rpx;
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.title {
  flex: 1;
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1d23;
  line-height: 1.35;
}

.status {
  flex-shrink: 0;
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  color: #b45309;
  background: #fffbeb;
}

.status.confirmed {
  color: #0f766e;
  background: #ecfdf5;
}

.status.cancelled {
  color: #6b7280;
  background: #f3f4f6;
}

.status.waitlist {
  color: #1e3a5f;
  background: #eff6ff;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 20rpx;
}

.actions {
  border-top: 1rpx solid #f0f1f3;
  padding-top: 20rpx;
}

.link {
  font-size: 26rpx;
  color: #0f766e;
}
</style>
