<template>
  <view class="page">
    <view v-if="!activity" class="state">活动不存在或已下架</view>
    <template v-else>
      <view class="cover" :style="{ backgroundColor: activity.coverColor }">
        <text class="cover-label">{{ activity.coverLabel }}</text>
      </view>

      <view class="panel">
        <view class="title-row">
          <text class="title">{{ activity.title }}</text>
          <text class="fee" :class="{ free: activity.feeCents === 0 }">{{
            activity.feeLabel
          }}</text>
        </view>
        <text class="status" :class="activity.status">{{
          activity.statusLabel
        }}</text>

        <view class="info">
          <view class="info-row">
            <text class="label">时间</text>
            <text class="value"
              >{{ activity.startAt }} — {{ activity.endAt }}</text
            >
          </view>
          <view class="info-row">
            <text class="label">地点</text>
            <text class="value">{{ activity.place }}</text>
          </view>
          <view class="info-row">
            <text class="label">费用</text>
            <text class="value">{{ activity.feeLabel }}（首期线下结算）</text>
          </view>
          <view class="info-row">
            <text class="label">主办</text>
            <text class="value">{{ activity.organizer }}</text>
          </view>
          <view class="info-row">
            <text class="label">名额</text>
            <text class="value"
              >{{ activity.enrolled }} / {{ activity.capacity }}</text
            >
          </view>
        </view>
      </view>

      <view class="panel">
        <text class="section-title">活动须知</text>
        <text class="rules">{{ activity.rules }}</text>
      </view>

      <view class="bottom-space" />
      <view class="cta-bar">
        <button
          class="cta"
          :class="{ disabled: !canRegister }"
          :disabled="!canRegister"
          @click="goRegister"
        >
          {{ ctaText }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getActivityById, type Activity } from '@/mocks/activities'

const activity = ref<Activity | null>(null)

const canRegister = computed(() => {
  const a = activity.value
  if (!a) return false
  return a.status === 'open' || a.status === 'full'
})

const ctaText = computed(() => {
  const a = activity.value
  if (!a) return '报名'
  if (a.status === 'ended') return '活动已结束'
  if (a.status === 'upcoming') return '报名未开始'
  if (a.status === 'full') return '申请候补'
  return '立即报名'
})

onLoad((query) => {
  const id = String(query?.id ?? '')
  activity.value = getActivityById(id) ?? null
  if (activity.value) {
    uni.setNavigationBarTitle({ title: '活动详情' })
  }
})

function goRegister() {
  if (!activity.value || !canRegister.value) return
  uni.navigateTo({
    url: `/pages/register/index?id=${activity.value.id}`,
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding-bottom: env(safe-area-inset-bottom);
}

.state {
  padding: 160rpx 0;
  text-align: center;
  color: #8a9099;
  font-size: 28rpx;
}

.cover {
  height: 360rpx;
  display: flex;
  align-items: flex-end;
  padding: 32rpx;
  box-sizing: border-box;
}

.cover-label {
  color: rgba(255, 255, 255, 0.95);
  font-size: 28rpx;
  letter-spacing: 2rpx;
}

.panel {
  margin: 24rpx;
  padding: 32rpx;
  background: #ffffff;
  border-radius: 16rpx;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.title {
  flex: 1;
  font-size: 36rpx;
  font-weight: 600;
  color: #1a1d23;
  line-height: 1.35;
}

.fee {
  flex-shrink: 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #c2410c;
}

.fee.free {
  color: #0f766e;
}

.status {
  display: inline-block;
  font-size: 22rpx;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  color: #0f766e;
  background: #ecfdf5;
  margin-bottom: 28rpx;
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

.info-row {
  display: flex;
  gap: 24rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid #f0f1f3;
}

.info-row:first-child {
  border-top: none;
  padding-top: 0;
}

.label {
  width: 72rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: #9ca3af;
}

.value {
  flex: 1;
  font-size: 26rpx;
  color: #374151;
  line-height: 1.45;
}

.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1d23;
  margin-bottom: 16rpx;
}

.rules {
  display: block;
  font-size: 26rpx;
  color: #4b5563;
  line-height: 1.7;
}

.bottom-space {
  height: 160rpx;
}

.cta-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  border-top: 1rpx solid #eef0f3;
}

.cta {
  height: 88rpx;
  line-height: 88rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 12rpx;
  border: none;
}

.cta.disabled,
.cta[disabled] {
  background: #cbd5e1;
  color: #ffffff;
}

.cta::after {
  border: none;
}
</style>
