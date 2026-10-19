<template>
  <view class="page">
    <view v-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!activityId" class="state">缺少活动 ID</view>
    <view v-else-if="!items.length" class="empty card">
      <text class="empty-title">暂无报名</text>
      <text class="empty-desc">还没有人报名该活动。</text>
    </view>
    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-top">
          <text class="name">{{ item.name || "—" }}</text>
          <text class="status" :class="item.status">{{
            statusLabel(item.status)
          }}</text>
        </view>
        <view class="meta">
          <text>手机：{{ item.phone || "—" }}</text>
          <text>提交时间：{{ formatTime(item.createdAt) }}</text>
        </view>
      </view>

      <view v-if="hasMore" class="more" @click="loadMore">
        <text>{{ loading ? "加载中…" : "加载更多" }}</text>
      </view>
      <view v-else-if="items.length" class="more muted">
        <text>没有更多了</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import {
  listOrganizerRegistrations,
  type Registration,
} from "@/api/registrations";
import { ApiError } from "@/utils/request";

const STATUS_LABEL: Record<string, string> = {
  pending: "待确认",
  confirmed: "已确认",
  cancelled: "已取消",
  waitlist: "候补中",
};

const activityId = ref("");
const items = ref<Registration[]>([]);
const loading = ref(false);
const page = ref(1);
const total = ref(0);
const pageSize = 20;

const hasMore = computed(() => items.value.length < total.value);

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "加载失败";
}

async function load(opts: { reset?: boolean } = {}) {
  if (!activityId.value) return;
  if (loading.value) return;

  const reset = opts.reset === true;
  const requestPage = reset ? 1 : page.value + 1;
  loading.value = true;
  try {
    const res = await listOrganizerRegistrations(activityId.value, {
      page: requestPage,
      pageSize,
    });
    const nextItems = res.items ?? [];
    items.value = reset ? nextItems : [...items.value, ...nextItems];
    total.value = res.total ?? items.value.length;
    page.value = requestPage;
  } catch (e) {
    if (reset) {
      items.value = [];
      total.value = 0;
      page.value = 1;
    }
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  void load();
}

onLoad((query) => {
  const id = String(query?.activityId ?? "").trim();
  activityId.value = id;
  if (id) void load({ reset: true });
  else {
    loading.value = false;
    uni.showToast({ title: "缺少活动 ID", icon: "none" });
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
}
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1d23;
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
}
.more {
  padding: 24rpx 0 40rpx;
  text-align: center;
  font-size: 26rpx;
  color: #0f766e;
}
.more.muted {
  color: #9ca3af;
}
</style>
