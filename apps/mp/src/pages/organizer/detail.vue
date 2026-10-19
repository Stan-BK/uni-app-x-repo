<template>
  <view class="page">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!activity" class="state">活动不存在或无权查看</view>
    <view v-else class="card">
      <image
        v-if="activity.coverUrl"
        class="cover"
        :src="activity.coverUrl"
        mode="aspectFill"
      />
      <text class="title">{{ activity.title || "未命名活动" }}</text>
      <text class="badge">{{ lifecycleLabel(activity.lifecycle) }}</text>

      <view class="block">
        <text class="label">分类</text>
        <text class="value">{{ activity.category || "—" }}</text>
      </view>
      <view class="block">
        <text class="label">地点</text>
        <text class="value">{{ activity.place || "—" }}</text>
        <text
          v-if="activity.placeLat != null && activity.placeLng != null"
          class="coord"
        >
          {{ activity.placeLat.toFixed(5) }}, {{ activity.placeLng.toFixed(5) }}
        </text>
      </view>
      <view class="block">
        <text class="label">时间</text>
        <text class="value">{{ formatRange(activity.startAt, activity.endAt) }}</text>
      </view>
      <view class="block">
        <text class="label">名额</text>
        <text class="value">{{ activity.capacity }}</text>
      </view>
      <view class="block">
        <text class="label">费用</text>
        <text class="value">{{ feeText(activity) }}</text>
      </view>
      <view class="block">
        <text class="label">活动须知</text>
        <text class="value rules">{{ activity.rules || "—" }}</text>
      </view>
      <view v-if="activity.cancelReason" class="block">
        <text class="label">取消原因</text>
        <text class="value">{{ activity.cancelReason }}</text>
      </view>
      <view v-if="activity.removeReason" class="block">
        <text class="label">下架原因</text>
        <text class="value">{{ activity.removeReason }}</text>
      </view>

      <button
        v-if="canEdit"
        class="primary"
        @click="goEdit"
      >
        编辑活动
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { getActivity, type Activity } from "@/api/activities";
import { ApiError } from "@/utils/request";

const loading = ref(true);
const activity = ref<Activity | null>(null);
const activityId = ref("");

const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  cancelled: "已取消",
  removed: "已下架",
  ended: "已结束",
};

const canEdit = computed(() => {
  const life = activity.value?.lifecycle;
  return life === "draft" || life === "published";
});

function lifecycleLabel(lifecycle: string) {
  return LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
}

function formatRange(start?: string | null, end?: string | null) {
  const fmt = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function feeText(a: Activity) {
  if (a.feeType === "free" || !a.feeCents) return "免费";
  return `¥${(a.feeCents / 100).toFixed(2)}`;
}

function goEdit() {
  if (!activityId.value) return;
  uni.navigateTo({
    url: `/pages/organizer/create?id=${encodeURIComponent(activityId.value)}`,
  });
}

async function load(id: string) {
  loading.value = true;
  try {
    activity.value = await getActivity(id);
  } catch (e) {
    activity.value = null;
    const msg =
      e instanceof ApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "加载失败";
    uni.showToast({ title: msg, icon: "none" });
  } finally {
    loading.value = false;
  }
}

onLoad((query) => {
  const id = String(query?.id ?? "").trim();
  activityId.value = id;
  if (id) void load(id);
  else {
    loading.value = false;
    activity.value = null;
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
.state {
  padding: 120rpx 0;
  text-align: center;
  color: #9ca3af;
  font-size: 28rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
}
.cover {
  width: 100%;
  height: 280rpx;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
  background: #e5e7eb;
}
.title {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.badge {
  display: inline-block;
  font-size: 22rpx;
  color: #0f766e;
  background: #ccfbf1;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  margin-bottom: 24rpx;
}
.block {
  margin-bottom: 20rpx;
}
.label {
  display: block;
  font-size: 22rpx;
  color: #9ca3af;
  margin-bottom: 6rpx;
}
.value {
  display: block;
  font-size: 28rpx;
  color: #111827;
  line-height: 1.5;
  white-space: pre-wrap;
}
.coord {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #9ca3af;
}
.rules {
  white-space: pre-wrap;
}
button.primary {
  margin-top: 16rpx;
  background: #0f766e;
  color: #fff;
}
button::after {
  border: none;
}
</style>
