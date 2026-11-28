<template>
  <view class="page page-l2">
    <view class="tabs">
      <text
        v-for="tab in TABS"
        :key="tab.id"
        class="tab"
        :class="{ active: filter === tab.id }"
        @click="filter = tab.id"
      >
        {{ tab.label }}
      </text>
    </view>
    <view v-if="loading && !items.length" class="empty card">
      <text class="empty-desc">加载中…</text>
    </view>
    <view v-else-if="!filtered.length" class="empty card">
      <text class="empty-title">{{ emptyCopy.title }}</text>
      <text class="empty-desc">{{ emptyCopy.desc }}</text>
      <button
        v-if="user.canPublish && filter !== 'off' && filter !== 'ended'"
        class="ed-btn"
        hover-class="none"
        @click="goCreate"
      >
        去发布
      </button>
    </view>
    <view v-else class="list">
      <ActivityListCard
        v-for="item in filtered"
        :key="item.id"
        :cover-url="coverSrc(item)"
        :title="item.title || '未命名活动'"
        :time-text="formatActivityTime(item.startAt)"
        :place="item.place"
        :show-actions="canMutate(item)"
        @click="goDetail(item.id)"
      >
        <template #foot>
          <text
            class="status ed-tag"
            :class="lifecycleTagClass(displayLifecycle(item))"
          >{{ lifecycleLabel(displayLifecycle(item)) }}</text>
        </template>
        <template #actions>
          <button
            v-if="displayLifecycle(item) === 'draft' && user.canPublish"
            class="ed-btn"
            size="mini"
            hover-class="none"
            :disabled="actingId === item.id"
            @click.stop="onPublish(item.id)"
          >
            发布
          </button>
          <button
            v-if="displayLifecycle(item) === 'published'"
            class="ed-btn-secondary"
            size="mini"
            hover-class="none"
            :disabled="actingId === item.id"
            @click.stop="onUnpublish(item.id)"
          >
            退回草稿
          </button>
          <button
            v-if="displayLifecycle(item) === 'published'"
            class="danger"
            size="mini"
            hover-class="none"
            :disabled="actingId === item.id"
            @click.stop="onCancel(item.id)"
          >
            取消
          </button>
          <button
            v-if="displayLifecycle(item) === 'draft'"
            class="ed-btn-secondary"
            size="mini"
            hover-class="none"
            @click.stop="goEdit(item.id)"
          >
            编辑
          </button>
        </template>
      </ActivityListCard>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  cancelActivity,
  listMyActivities,
  publishActivity,
  unpublishActivity,
  type Activity,
} from "@/api/activities";
import ActivityListCard from "@/components/activity-list-card/activity-list-card.vue";
import { useUserStore } from "@/stores/user";
import { formatActivityTime } from "@/utils/format-activity-time";
import {
  effectiveLifecycle,
  type EffectiveLifecycle,
} from "@/utils/activity-lifecycle";
import { ApiError } from "@/utils/request";

type ShelfFilter = "listed" | "draft" | "ended" | "off";

const TABS: { id: ShelfFilter; label: string }[] = [
  { id: "listed", label: "已上架" },
  { id: "draft", label: "草稿" },
  { id: "ended", label: "已结束" },
  { id: "off", label: "已下架" },
];

const user = useUserStore();
const items = ref<Activity[]>([]);
const loading = ref(false);
const actingId = ref<string | null>(null);
const filter = ref<ShelfFilter>("listed");

const filtered = computed(() =>
  items.value.filter((item) => inShelf(displayLifecycle(item), filter.value)),
);

const emptyCopy = computed(() => {
  if (filter.value === "listed") {
    return { title: "暂无已上架活动", desc: "发布后的活动会出现在这里。" };
  }
  if (filter.value === "draft") {
    return { title: "暂无草稿", desc: "保存未发布的活动会出现在这里。" };
  }
  if (filter.value === "ended") {
    return { title: "暂无已结束活动", desc: "时间已过的活动会出现在这里。" };
  }
  return { title: "暂无已下架活动", desc: "取消或被下架的活动会出现在这里。" };
});

function displayLifecycle(item: Pick<Activity, "lifecycle" | "endAt">) {
  return effectiveLifecycle(item);
}

function canMutate(item: Pick<Activity, "lifecycle" | "endAt">) {
  const life = displayLifecycle(item);
  return life === "draft" || life === "published";
}

function inShelf(lifecycle: EffectiveLifecycle, shelf: ShelfFilter) {
  if (shelf === "listed") return lifecycle === "published";
  if (shelf === "draft") return lifecycle === "draft";
  if (shelf === "ended") return lifecycle === "ended";
  return lifecycle === "removed" || lifecycle === "cancelled";
}

const LIFECYCLE_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  cancelled: "已取消",
  removed: "已下架",
  ended: "已结束",
};

function lifecycleLabel(lifecycle: string) {
  return LIFECYCLE_LABEL[lifecycle] ?? lifecycle;
}

function lifecycleTagClass(lifecycle: string) {
  if (lifecycle === "published") return "ed-tag-confirmed";
  if (lifecycle === "draft") return "ed-tag-pending";
  if (lifecycle === "cancelled") return "ed-tag-paid";
  if (lifecycle === "removed") return "ed-tag-full";
  if (lifecycle === "ended") return "ed-tag-muted";
  return "ed-tag-muted";
}

function coverSrc(item: Activity) {
  return item.coverUrl?.trim() ?? "";
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "操作失败";
}

async function load() {
  if (!user.isLoggedIn) {
    items.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const res = await listMyActivities();
    items.value = res.items ?? [];
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    loading.value = false;
  }
}

function goCreate() {
  uni.navigateTo({ url: "/pages/organizer/create" });
}

/** 卡片主体 → 只读详情（不进编辑态） */
function goDetail(id: string) {
  uni.navigateTo({
    url: `/pages/organizer/detail?id=${encodeURIComponent(id)}`,
  });
}

/** 仅「编辑」按钮进入编辑页 */
function goEdit(id: string) {
  uni.navigateTo({
    url: `/pages/organizer/create?id=${encodeURIComponent(id)}`,
  });
}

async function onPublish(id: string) {
  actingId.value = id;
  try {
    await publishActivity(id);
    uni.showToast({ title: "已发布", icon: "success" });
    filter.value = "listed";
    await load();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    actingId.value = null;
  }
}

async function onUnpublish(id: string) {
  const res = await uni.showModal({
    title: "退回草稿",
    content: "退回后活动将下架，已确认报名会被取消。确定退回草稿？",
  });
  if (!res.confirm) return;
  actingId.value = id;
  try {
    await unpublishActivity(id);
    uni.showToast({ title: "已退回草稿", icon: "success" });
    filter.value = "draft";
    await load();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    actingId.value = null;
  }
}

async function onCancel(id: string) {
  const res = await uni.showModal({
    title: "取消活动",
    content: "取消后不可再上架，已确认报名会被取消。确定取消该活动？",
  });
  if (!res.confirm) return;
  actingId.value = id;
  try {
    await cancelActivity(id);
    uni.showToast({ title: "已取消", icon: "success" });
    filter.value = "off";
    await load();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    actingId.value = null;
  }
}

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    uni.navigateBack();
    return;
  }
  void user.refreshIdentity().catch(() => {
    /* 网络失败时保留本地态 */
  });
  void load();
});
</script>

<style scoped lang="scss">
.tabs {
  display: flex;
  gap: 16rpx;
  margin: 24rpx 0 8rpx;
}

.tab {
  font-size: 26rpx;
  color: $ed-color-text-secondary;
  padding: 10rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-surface;
}

.tab.active {
  color: $ed-color-brand-strong;
  background: $ed-color-brand-soft;
  font-weight: 600;
}

.list,
.empty {
  margin-top: 24rpx;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(36, 49, 45, 0.06);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: $ed-space-card;
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
  margin-bottom: 24rpx;
}

.empty .ed-btn {
  width: auto;
  margin: 0;
  padding: 0 48rpx;
  font-weight: 600;
}

.status {
  flex-shrink: 0;
}

/* 第三列操作区（卡片内 width 120rpx，纵向堆叠；不用 gap，小程序不稳） */
button.ed-btn,
button.ed-btn-secondary,
button.danger {
  display: block;
  width: 100%;
  margin: 0;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 8rpx;
  border-radius: $ed-radius-pill;
  font-size: 22rpx;
  white-space: nowrap;
}

button.ed-btn + button,
button.ed-btn-secondary + button,
button.danger + button {
  margin-top: 12rpx;
}

button.danger {
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
  border: none;
}

button.danger::after {
  border: none;
}

button[disabled] {
  opacity: 0.5;
}
</style>
