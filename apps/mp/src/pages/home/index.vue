<template>
  <view class="page page-l1">
    <view class="toolbar">
      <input
        class="search"
        type="text"
        confirm-type="search"
        :value="q"
        placeholder="搜索活动标题"
        @input="onQInput"
        @confirm="onSearch"
      />
      <view class="sort">
        <text
          class="sort-item"
          :class="{ active: sort === 'startAt' }"
          @click="setSort('startAt')"
        >
          {{ startAtSortLabel }}
        </text>
        <text
          class="sort-item"
          :class="{ active: sort === 'publishedAt' }"
          @click="setSort('publishedAt')"
        >
          {{ publishedAtSortLabel }}
        </text>
      </view>
    </view>

    <view v-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state">暂无活动</view>
    <view v-else class="list">
      <view
        v-for="item in items"
        :key="item.id"
        class="card"
        @click="goDetail(item.id)"
      >
        <image
          v-if="item.coverUrl"
          class="cover-img"
          :src="item.coverUrl"
          mode="aspectFill"
        />
        <view v-else class="cover cover-placeholder">
          <text class="cover-label">活动</text>
        </view>
        <view class="body">
          <view class="row-title">
            <view class="title">{{ item.title }}</view>
            <text
              class="fee ed-tag"
              :class="isFree(item) ? 'ed-tag-open' : 'ed-tag-paid'"
            >{{ feeLabel(item) }}</text>
          </view>
          <text class="meta">{{ formatTime(item.startAt) }}</text>
          <view class="row-foot">
            <text class="place">{{ item.place || "—" }}</text>
            <text
              class="status ed-tag"
              :class="[item.displayStatus, statusTag(item.displayStatus)]"
            >{{ displayLabel(item.displayStatus) }}</text>
          </view>
        </view>
      </view>

      <view v-if="hasMore" class="more" @click="loadMore">
        <text>{{ loading ? "加载中…" : "加载更多" }}</text>
      </view>
      <view v-else class="more muted">
        <text>没有更多了</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { onReachBottom, onShow } from "@dcloudio/uni-app";
import {
  listPublicActivities,
  type PublicActivity,
} from "@/api/public-activities";
import { ApiError } from "@/utils/request";

const DISPLAY_LABEL: Record<string, string> = {
  upcoming: "报名中",
  open: "报名中",
  ended: "已结束",
  full: "已满员",
  closed: "报名截止",
};

const items = ref<PublicActivity[]>([]);
const loading = ref(false);
const q = ref("");
const sort = ref<"startAt" | "publishedAt">("startAt");
/** startAt 默认升序；publishedAt 默认降序；再点同一项切换方向 */
const order = ref<"asc" | "desc">("asc");
const page = ref(1);
const total = ref(0);
const pageSize = 20;

const hasMore = computed(() => items.value.length < total.value);

/** 选中项展示方向；再点同一项切换正/倒序 */
const startAtSortLabel = computed(() => {
  if (sort.value !== "startAt") return "开始时间";
  return order.value === "asc" ? "开始时间 · 早→晚" : "开始时间 · 晚→早";
});
const publishedAtSortLabel = computed(() => {
  if (sort.value !== "publishedAt") return "发布时间";
  return order.value === "asc" ? "发布时间 · 旧→新" : "发布时间 · 新→旧";
});

function displayLabel(status: string) {
  return DISPLAY_LABEL[status] ?? status;
}

function statusTag(status: string) {
  if (status === "open") return "ed-tag-open";
  if (status === "full") return "ed-tag-full";
  return "ed-tag-muted";
}

function isFree(item: PublicActivity) {
  return item.feeType === "free" || item.feeCents === 0;
}

function feeLabel(item: PublicActivity) {
  if (isFree(item)) return "免费";
  return `¥${(item.feeCents / 100).toFixed(2)}`;
}

function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "加载失败";
}

function onQInput(e: { detail?: { value?: string } }) {
  q.value = e.detail?.value ?? "";
}

function onSearch() {
  void load({ reset: true });
}

function defaultOrderFor(field: "startAt" | "publishedAt"): "asc" | "desc" {
  return field === "publishedAt" ? "desc" : "asc";
}

function setSort(next: "startAt" | "publishedAt") {
  if (sort.value === next) {
    order.value = order.value === "asc" ? "desc" : "asc";
  } else {
    sort.value = next;
    order.value = defaultOrderFor(next);
  }
  void load({ reset: true });
}

/** Bumped on reset so in-flight responses are ignored. */
let loadGen = 0;

async function load(opts: { reset?: boolean } = {}) {
  if (opts.reset) {
    page.value = 1;
    loadGen += 1;
  } else if (loading.value) {
    // load-more only: do not stack append requests
    return;
  }

  const gen = loadGen;
  const requestPage = page.value;
  loading.value = true;
  try {
    const res = await listPublicActivities({
      q: q.value.trim() || undefined,
      sort: sort.value,
      order: order.value,
      page: requestPage,
      pageSize,
    });
    if (gen !== loadGen) return;
    const next = res.items ?? [];
    items.value =
      opts.reset || requestPage === 1 ? next : items.value.concat(next);
    total.value = res.total ?? 0;
  } catch (e) {
    if (gen !== loadGen) return;
    if (!opts.reset && page.value > 1) {
      page.value -= 1;
    }
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    if (gen === loadGen) {
      loading.value = false;
    }
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  page.value += 1;
  void load();
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${encodeURIComponent(id)}` });
}

onMounted(() => {
  void load({ reset: true });
});
onShow(() => {
  // H5 first paint sometimes misses onShow; mount covers that path.
  // Refresh list when returning to tab.
  void load({ reset: true });
});
onReachBottom(() => {
  loadMore();
});
</script>

<style scoped lang="scss">
.toolbar {
  margin-bottom: 24rpx;
}

.search {
  width: 100%;
  height: 72rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
  font-size: 28rpx;
  color: $ed-color-text;
  margin-bottom: 16rpx;
}

.sort {
  display: flex;
  gap: 16rpx;
}

.sort-item {
  font-size: 26rpx;
  color: $ed-color-text-secondary;
  padding: 10rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-surface;
}

.sort-item.active {
  color: $ed-color-brand-strong;
  background: $ed-color-brand-soft;
  font-weight: 600;
}

.state {
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(36, 49, 45, 0.06);
}

.cover-img {
  width: 100%;
  height: 220rpx;
  display: block;
  background: $ed-color-border;
}

.cover {
  height: 220rpx;
  display: flex;
  align-items: flex-end;
  padding: 24rpx;
  box-sizing: border-box;
}

.cover-placeholder {
  background: $ed-color-brand;
}

.cover-label {
  color: rgba(255, 255, 255, 0.92);
  font-size: 26rpx;
  letter-spacing: 2rpx;
}

.body {
  padding: $ed-space-card;
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
  min-width: 0;
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fee,
.status {
  flex-shrink: 0;
}

.meta {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
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
  color: $ed-color-text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  padding: 24rpx 0 8rpx;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-brand;
}

.more.muted {
  color: $ed-color-text-muted;
}
</style>
