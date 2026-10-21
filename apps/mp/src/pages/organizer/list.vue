<template>
  <view class="page page-l2">
    <view v-if="loading && !items.length" class="empty card">
      <text class="empty-desc">加载中…</text>
    </view>
    <view v-else-if="!items.length" class="empty card">
      <text class="empty-title">暂无活动</text>
      <text class="empty-desc">创建活动后将显示在这里。</text>
      <button
        v-if="user.canPublish"
        class="ed-btn"
        hover-class="none"
        @click="goCreate"
      >
        去发布
      </button>
    </view>
    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="row" @click="goDetail(item.id)">
          <text class="title">{{ item.title || "未命名活动" }}</text>
          <text class="meta">状态：{{ lifecycleLabel(item.lifecycle) }}</text>
        </view>
        <view class="ops">
          <button
            v-if="item.lifecycle === 'draft' && user.canPublish"
            class="ed-btn"
            size="mini"
            hover-class="none"
            :disabled="actingId === item.id"
            @click.stop="onPublish(item.id)"
          >
            发布
          </button>
          <button
            v-if="item.lifecycle === 'published'"
            class="ed-btn-secondary"
            size="mini"
            hover-class="none"
            :disabled="actingId === item.id"
            @click.stop="onUnpublish(item.id)"
          >
            退回草稿
          </button>
          <button
            v-if="item.lifecycle === 'published'"
            class="danger"
            size="mini"
            hover-class="none"
            :disabled="actingId === item.id"
            @click.stop="onCancel(item.id)"
          >
            取消
          </button>
          <button
            v-if="item.lifecycle === 'draft' || item.lifecycle === 'published'"
            class="ed-btn-secondary"
            size="mini"
            hover-class="none"
            @click.stop="goEdit(item.id)"
          >
            编辑
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import {
  cancelActivity,
  listMyActivities,
  publishActivity,
  unpublishActivity,
  type Activity,
} from "@/api/activities";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const user = useUserStore();
const items = ref<Activity[]>([]);
const loading = ref(false);
const actingId = ref<string | null>(null);

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

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "操作失败";
}

async function load() {
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
    await load();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    actingId.value = null;
  }
}

async function onUnpublish(id: string) {
  actingId.value = id;
  try {
    await unpublishActivity(id);
    uni.showToast({ title: "已退回草稿", icon: "success" });
    await load();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    actingId.value = null;
  }
}

async function onCancel(id: string) {
  actingId.value = id;
  try {
    await cancelActivity(id);
    uni.showToast({ title: "已取消", icon: "success" });
    await load();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    actingId.value = null;
  }
}

onShow(() => {
  if (user.isLoggedIn) {
    void user.refreshIdentity().catch(() => {
      /* 网络失败时保留本地态 */
    });
  }
  void load();
});
</script>

<style scoped lang="scss">
.list,
.empty {
  margin-top: 24rpx;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
  margin-bottom: 20rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
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
  margin-bottom: 24rpx;
}

.empty .ed-btn {
  width: auto;
  margin: 0;
  padding: 0 48rpx;
  font-weight: 600;
}

.row {
  margin-bottom: 16rpx;
}

.title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 8rpx;
}

.meta {
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.ops {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.ops button.ed-btn,
.ops button.ed-btn-secondary,
.ops button.danger {
  display: inline-flex;
  flex: none;
  width: auto;
  margin: 0;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 24rpx;
  border-radius: $ed-radius-pill;
  font-size: 24rpx;
}

.ops button.danger {
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
