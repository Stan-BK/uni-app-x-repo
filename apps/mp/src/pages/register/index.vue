<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!activity" class="state">{{ errorMessage || "活动不存在" }}</view>
    <template v-else>
      <view class="banner">
        <text class="banner-title">{{ activity.title }}</text>
        <text class="banner-meta"
          >{{ formatTime(activity.startAt) }} · {{ activity.place || "—" }}</text
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
        <text class="hint">免费活动报名成功后可在「我的」查看</text>
      </view>

      <button class="submit" :loading="submitting" @click="onSubmit">
        提交报名
      </button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import {
  getPublicActivity,
  type PublicActivity,
} from "@/api/public-activities";
import { createRegistration } from "@/api/registrations";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const user = useUserStore();
const activity = ref<PublicActivity | null>(null);
const activityId = ref("");
const name = ref("");
const phone = ref("");
const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref("");

function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function validate(): string | null {
  const n = name.value.trim();
  const p = phone.value.trim();
  if (!n) return "请填写姓名";
  if (!/^1\d{10}$/.test(p)) return "请填写 11 位手机号";
  return null;
}

function toastForError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "ACTIVITY_FULL":
        return "名额已满";
      case "PAID_NOT_SUPPORTED":
        return "暂不支持线上报名";
      case "ACTIVITY_ENDED":
        return "活动已结束";
      case "ACTIVITY_NOT_OPENABLE":
        return "活动暂不可报名";
      default:
        return err.message || "报名失败";
    }
  }
  return err instanceof Error ? err.message : "报名失败";
}

async function load(id: string) {
  loading.value = true;
  errorMessage.value = "";
  activity.value = null;
  try {
    activity.value = await getPublicActivity(id);
    uni.setNavigationBarTitle({ title: "报名" });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) errorMessage.value = "活动不存在或已下架";
      else errorMessage.value = err.message || "加载失败";
    } else {
      errorMessage.value = "加载失败";
    }
  } finally {
    loading.value = false;
  }
}

onLoad((query) => {
  const id = String(query?.activityId ?? query?.id ?? "").trim();
  if (!id) {
    loading.value = false;
    errorMessage.value = "活动不存在";
    return;
  }
  activityId.value = id;
  void load(id);
});

async function onSubmit() {
  if (!activity.value || !activityId.value || submitting.value) return;
  const err = validate();
  if (err) {
    uni.showToast({ title: err, icon: "none" });
    return;
  }

  submitting.value = true;
  try {
    if (!user.isLoggedIn) {
      await user.login();
    }
    await createRegistration({
      activityId: activityId.value,
      name: name.value.trim(),
      phone: phone.value.trim(),
    });
    uni.showToast({ title: "报名已提交", icon: "success" });
    setTimeout(() => {
      uni.switchTab({ url: "/pages/mine/registrations" });
    }, 600);
  } catch (e) {
    uni.showToast({ title: toastForError(e), icon: "none" });
  } finally {
    submitting.value = false;
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
