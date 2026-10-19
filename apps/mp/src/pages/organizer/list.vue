<template>
  <view class="page">
    <view v-if="loading && !items.length" class="empty card">
      <text class="empty-desc">加载中…</text>
    </view>
    <view v-else-if="!items.length" class="empty card">
      <text class="empty-title">暂无活动</text>
      <text class="empty-desc">创建活动后将显示在这里。</text>
      <button class="primary" @click="goCreate">去发布</button>
    </view>
    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="row" @click="goEdit(item.id)">
          <text class="title">{{ item.title || "未命名活动" }}</text>
          <text class="meta">状态：{{ lifecycleLabel(item.lifecycle) }}</text>
        </view>
        <view class="ops">
          <button
            v-if="item.lifecycle === 'draft'"
            class="mini primary"
            size="mini"
            :disabled="actingId === item.id"
            @click.stop="onPublish(item.id)"
          >
            发布
          </button>
          <button
            v-if="item.lifecycle === 'published'"
            class="mini ghost"
            size="mini"
            :disabled="actingId === item.id"
            @click.stop="onUnpublish(item.id)"
          >
            退回草稿
          </button>
          <button
            v-if="item.lifecycle === 'published'"
            class="mini danger"
            size="mini"
            :disabled="actingId === item.id"
            @click.stop="onCancel(item.id)"
          >
            取消
          </button>
          <button
            class="mini ghost"
            size="mini"
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
import { ApiError } from "@/utils/request";

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

function goEdit(id: string) {
  uni.navigateTo({ url: `/pages/organizer/create?id=${encodeURIComponent(id)}` });
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
  void load();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx;
  box-sizing: border-box;
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
  margin-bottom: 24rpx;
}
.row {
  margin-bottom: 16rpx;
}
.title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 8rpx;
}
.meta {
  font-size: 24rpx;
  color: #6b7280;
}
.ops {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
button.primary {
  background: #0f766e;
  color: #fff;
}
button.ghost {
  background: #e5e7eb;
  color: #111827;
}
button.danger {
  background: #fee2e2;
  color: #b91c1c;
}
button.mini {
  margin: 0;
  padding: 0 20rpx;
}
button.primary.mini {
  width: auto;
}
button::after {
  border: none;
}
button[disabled] {
  opacity: 0.5;
}
.empty button.primary {
  width: 280rpx;
}
</style>
