<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!activities.length" class="state">暂无活动</view>
    <view v-else class="list">
      <view
        v-for="item in activities"
        :key="item.id"
        class="card"
        @click="goDetail(item.id)"
      >
        <view class="cover" :style="{ backgroundColor: item.coverColor }">
          <text class="cover-label">{{ item.coverLabel }}</text>
        </view>
        <view class="body">
          <view class="row-title">
            <text class="title">{{ item.title }}</text>
            <text class="fee" :class="{ free: item.feeCents === 0 }">{{
              item.feeLabel
            }}</text>
          </view>
          <text class="meta">{{ item.startAt }}</text>
          <view class="row-foot">
            <text class="place">{{ item.place }}</text>
            <text class="status" :class="item.status">{{ item.statusLabel }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { listActivities, type Activity } from '@/mocks/activities'

const loading = ref(true)
const activities = ref<Activity[]>([])

function load() {
  loading.value = true
  // Simulate brief local fetch for preview polish
  setTimeout(() => {
    activities.value = listActivities()
    loading.value = false
  }, 200)
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${id}` })
}

// H5 first paint sometimes misses onShow; mount covers that path.
onMounted(load)
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

.list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.card {
  background: #ffffff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(15, 23, 42, 0.04);
}

.cover {
  height: 220rpx;
  display: flex;
  align-items: flex-end;
  padding: 24rpx;
  box-sizing: border-box;
}

.cover-label {
  color: rgba(255, 255, 255, 0.92);
  font-size: 26rpx;
  letter-spacing: 2rpx;
}

.body {
  padding: 24rpx 28rpx 28rpx;
}

.row-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 12rpx;
}

.title {
  flex: 1;
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1d23;
  line-height: 1.35;
}

.fee {
  flex-shrink: 0;
  font-size: 26rpx;
  font-weight: 600;
  color: #c2410c;
  padding: 4rpx 12rpx;
  background: #fff7ed;
  border-radius: 8rpx;
}

.fee.free {
  color: #0f766e;
  background: #ecfdf5;
}

.meta {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 16rpx;
}

.row-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.place {
  flex: 1;
  font-size: 24rpx;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  flex-shrink: 0;
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  color: #0f766e;
  background: #ecfdf5;
}

.status.full {
  color: #b45309;
  background: #fffbeb;
}

.status.ended {
  color: #6b7280;
  background: #f3f4f6;
}

.status.upcoming {
  color: #1e3a5f;
  background: #eff6ff;
}
</style>
