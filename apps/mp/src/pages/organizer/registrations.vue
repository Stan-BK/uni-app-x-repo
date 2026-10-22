<template>
  <view class="page page-l2">
    <view v-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!activityId" class="state">缺少活动 ID</view>
    <view v-else-if="!items.length" class="empty card">
      <text class="empty-title">暂无报名</text>
      <text class="empty-desc">还没有人报名该活动。</text>
    </view>
    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-top">
          <image
            v-if="personAvatar(item)"
            class="avatar"
            :src="personAvatar(item)"
            mode="aspectFill"
          />
          <view v-else class="avatar avatar-fallback">
            <view class="avatar-head" />
            <view class="avatar-body" />
          </view>
          <view class="card-meta">
            <view class="name-row">
              <text class="name">{{ personName(item) }}</text>
              <text class="status ed-tag" :class="statusTagClass(item.status)">{{
                statusLabel(item.status)
              }}</text>
            </view>
            <text class="meta">手机：{{ item.phone || "—" }}</text>
            <text class="meta">提交时间：{{ formatTime(item.createdAt) }}</text>
          </view>
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

function personName(item: Registration) {
  return item.nickname?.trim() || item.name?.trim() || "用户";
}

function personAvatar(item: Registration) {
  return item.avatarUrl?.trim() || "";
}

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

function statusTagClass(status: string) {
  if (status === "confirmed") return "ed-tag-confirmed";
  if (status === "pending") return "ed-tag-pending";
  if (status === "waitlist") return "ed-tag-waitlist";
  if (status === "cancelled") return "ed-tag-muted";
  return "ed-tag-muted";
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

<style scoped lang="scss">
.state,
.empty,
.list {
  margin-top: 24rpx;
}

.state {
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
  margin-bottom: 20rpx;
}

.empty {
  text-align: center;
}

.empty-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 8rpx;
}

.empty-desc {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-muted;
}

.card-top {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $ed-color-brand-soft;
}

.avatar-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.avatar-head {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 6rpx;
}

.avatar-body {
  width: 52rpx;
  height: 22rpx;
  border-radius: 26rpx 26rpx 0 0;
  background: $ed-color-brand;
}

.card-meta {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.name {
  flex: 1;
  min-width: 0;
  font-size: 30rpx;
  font-weight: 600;
  color: $ed-color-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  flex-shrink: 0;
}

.meta {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  line-height: 1.5;
}

.more {
  padding: 24rpx 0 40rpx;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-brand;
}

.more.muted {
  color: $ed-color-text-muted;
}
</style>
