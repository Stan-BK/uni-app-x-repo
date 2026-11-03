<template>
  <view class="page page-l2">
    <view v-if="!user.isLoggedIn" class="state empty">
      <text class="empty-title">登录后查看通知</text>
      <button class="ed-btn" @click="onLogin">登录微信账号</button>
    </view>
    <view v-else-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state empty">
      <text class="empty-title">{{ errorText || "暂无通知" }}</text>
      <text v-if="!errorText" class="empty-desc">有人赞或评论你的动态时会在这里提醒你</text>
      <button v-if="errorText" class="ed-btn" @click="load({ reset: true })">重试</button>
    </view>
    <template v-else>
      <view class="list">
        <view
          v-for="n in items"
          :key="n.id"
          class="item"
          :class="{ 'is-unread': !n.readAt }"
          hover-class="none"
          @click="onTap(n)"
        >
          <image
            v-if="n.actor.avatarUrl"
            class="avatar"
            :src="n.actor.avatarUrl"
            mode="aspectFill"
          />
          <view v-else class="avatar avatar-fallback">
            <view class="avatar-head" />
            <view class="avatar-body" />
          </view>
          <view class="main">
            <text class="line">
              <text class="name">{{ n.actor.nickname }}</text>
              <text class="act"> {{ notificationText(n.type) }}</text>
            </text>
            <text class="time">{{ formatPostTime(n.createdAt) }}</text>
          </view>
          <view v-if="!n.readAt" class="dot" />
        </view>
        <view v-if="loading" class="state tail">加载中…</view>
        <view v-else-if="!hasMore" class="state tail">没有更多了</view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onPullDownRefresh, onReachBottom, onShow } from "@dcloudio/uni-app";
import {
  listCommunityNotifications,
  markCommunityNotificationsRead,
  type CommunityNotification,
} from "@/api/community";
import { useUserStore } from "@/stores/user";
import { formatPostTime, notificationText } from "@/utils/community";
import { ApiError } from "@/utils/request";

const PAGE_SIZE = 20;

const user = useUserStore();
const items = ref<CommunityNotification[]>([]);
const total = ref(0);
const page = ref(0);
const loading = ref(false);
const errorText = ref("");
let loadGen = 0;
let prompting = false;

const hasMore = computed(() => items.value.length < total.value);
const unreadLocal = computed(() => items.value.filter((n) => !n.readAt).length);

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
  return err instanceof Error ? err.message : "请求失败";
}

async function load(opts: { reset?: boolean } = {}) {
  if (!user.isLoggedIn) return;
  const reset = Boolean(opts.reset);
  if (!reset && (loading.value || !hasMore.value)) return;
  if (reset) loadGen += 1;
  const gen = loadGen;
  const nextPage = reset ? 1 : page.value + 1;
  loading.value = true;
  errorText.value = "";
  try {
    const res = await listCommunityNotifications({
      page: nextPage,
      pageSize: PAGE_SIZE,
    });
    if (gen !== loadGen) return;
    items.value = reset ? res.items : [...items.value, ...res.items];
    total.value = res.total;
    page.value = nextPage;
  } catch (e) {
    if (gen !== loadGen) return;
    if (e instanceof ApiError && e.status === 401) {
      user.logout();
      items.value = [];
      return;
    }
    if (reset) {
      items.value = [];
      total.value = 0;
      errorText.value = errMessage(e);
    } else {
      uni.showToast({ title: errMessage(e), icon: "none" });
    }
  } finally {
    if (gen === loadGen) loading.value = false;
  }
}

function markLocalRead(ids: string[]) {
  const now = new Date().toISOString();
  items.value = items.value.map((n) =>
    !n.readAt && ids.includes(n.id) ? { ...n, readAt: now } : n,
  );
}

async function onTap(n: CommunityNotification) {
  if (!n.readAt) {
    markLocalRead([n.id]);
    // 已读失败不阻塞跳转；下次进入列表会以服务端为准
    void markCommunityNotificationsRead({ ids: [n.id] }).catch(() => undefined);
  }
  const query = [`id=${encodeURIComponent(n.postId)}`];
  if (n.commentId) query.push(`commentId=${encodeURIComponent(n.commentId)}`);
  uni.navigateTo({ url: `/pages/community/detail?${query.join("&")}` });
}

async function onLogin() {
  if (prompting) return;
  prompting = true;
  try {
    await user.promptLogin("登录后即可查看通知");
  } finally {
    prompting = false;
  }
  if (user.isLoggedIn) await load({ reset: true });
}

onShow(async () => {
  if (!user.isLoggedIn) {
    await onLogin();
    return;
  }
  await load({ reset: true });
  // 进入即在服务端标记全部已读（首页铃铛返回后清零）；本页保留未读高亮直至离开，
  // 避免用户还没看清哪些是新通知就被清掉
  if (unreadLocal.value > 0) {
    void markCommunityNotificationsRead({ all: true }).catch(() => undefined);
  }
});

onPullDownRefresh(async () => {
  await load({ reset: true });
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  void load();
});
</script>

<style scoped lang="scss">
.list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
}

.item.is-unread {
  border-color: $ed-color-brand-soft;
  background: #f4fbf9;
}

.avatar {
  width: 80rpx;
  height: 80rpx;
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
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 4rpx;
}

.avatar-body {
  width: 46rpx;
  height: 20rpx;
  border-radius: 23rpx 23rpx 0 0;
  background: $ed-color-brand;
}

.main {
  flex: 1;
  min-width: 0;
}

.line {
  display: block;
  font-size: 28rpx;
  line-height: 1.5;
  color: $ed-color-text;
}

.name {
  font-weight: 700;
}

.act {
  color: $ed-color-text-secondary;
}

.time {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: $ed-color-accent;
  flex-shrink: 0;
}

.state {
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.state.tail {
  padding: 24rpx 0;
  font-size: 24rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-title {
  font-size: 32rpx;
  color: $ed-color-text;
  font-weight: 700;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: $ed-color-text-muted;
  margin-bottom: 40rpx;
}

.empty .ed-btn {
  width: auto;
  margin: 0;
}
</style>
