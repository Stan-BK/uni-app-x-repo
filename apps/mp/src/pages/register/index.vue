<template>
  <view class="page">
    <view v-if="!activity" class="state">活动不存在</view>
    <template v-else>
      <view class="banner">
        <text class="banner-title">{{ activity.title }}</text>
        <text class="banner-meta"
          >{{ activity.startAt }} · {{ activity.place }}</text
        >
      </view>

      <view class="form">
        <view class="field">
          <text class="label">姓名</text>
          <input
            v-model="name"
            class="input"
            type="text"
            maxlength="20"
            placeholder="请输入真实姓名"
            placeholder-class="placeholder"
          />
        </view>
        <view class="field">
          <text class="label">手机号</text>
          <input
            v-model="phone"
            class="input"
            type="number"
            maxlength="11"
            placeholder="请输入手机号"
            placeholder-class="placeholder"
          />
        </view>
        <text class="hint"
          >提交后仅写入本地 Mock，不会真实报名或扣费。</text
        >
      </view>

      <button class="submit" :loading="submitting" @click="onSubmit">
        提交报名
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  getActivityById,
  submitRegistration,
  type Activity,
} from '@/mocks/activities'

const activity = ref<Activity | null>(null)
const name = ref('')
const phone = ref('')
const submitting = ref(false)

onLoad((query) => {
  const id = String(query?.id ?? '')
  activity.value = getActivityById(id) ?? null
})

function validate(): string | null {
  const n = name.value.trim()
  const p = phone.value.trim()
  if (!n) return '请填写姓名'
  if (!/^1\d{10}$/.test(p)) return '请填写 11 位手机号'
  return null
}

function onSubmit() {
  if (!activity.value || submitting.value) return
  const err = validate()
  if (err) {
    uni.showToast({ title: err, icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const record = submitRegistration({
      activityId: activity.value.id,
      name: name.value,
      phone: phone.value,
    })
    uni.showToast({
      title: record.status === 'waitlist' ? '已加入候补' : '报名已提交',
      icon: 'success',
    })
    setTimeout(() => {
      uni.switchTab({ url: '/pages/mine/registrations' })
    }, 600)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx;
  box-sizing: border-box;
}

.state {
  padding: 160rpx 0;
  text-align: center;
  color: #8a9099;
  font-size: 28rpx;
}

.banner {
  background: #0f766e;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}

.banner-title {
  display: block;
  color: #ffffff;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
  line-height: 1.35;
}

.banner-meta {
  display: block;
  color: rgba(255, 255, 255, 0.78);
  font-size: 24rpx;
  line-height: 1.45;
}

.form {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 8rpx 28rpx 28rpx;
  margin-bottom: 40rpx;
}

.field {
  padding: 28rpx 0;
  border-bottom: 1rpx solid #f0f1f3;
}

.field:last-of-type {
  border-bottom: none;
}

.label {
  display: block;
  font-size: 26rpx;
  color: #6b7280;
  margin-bottom: 16rpx;
}

.input {
  width: 100%;
  font-size: 30rpx;
  color: #1a1d23;
  height: 48rpx;
}

.placeholder {
  color: #c4c9d1;
}

.hint {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.5;
}

.submit {
  height: 88rpx;
  line-height: 88rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 12rpx;
  border: none;
}

.submit::after {
  border: none;
}
</style>
