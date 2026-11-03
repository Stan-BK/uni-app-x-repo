<template>
  <view class="page page-l2">
    <view v-if="!user.isLoggedIn" class="state empty">
      <text class="empty-title">登录后查看我的动态</text>
      <button class="ed-btn" @click="onLogin">登录微信账号</button>
    </view>
    <view v-else-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state empty">
      <text class="empty-title">{{ errorText || "还没有发布过动态" }}</text>
      <button v-if="errorText" class="ed-btn" @click="load({ reset: true })">重试</button>
      <button v-else class="ed-btn" @click="goCompose">去发布</button>
    </view>
    <view v-else class="list">
      <CommunityPostCard
        v-for="item in items"
        :key="item.id"
        :post="item"
        @open="goDetail"
        @open-activity="goActivity"
      />
      <view v-if="loading" class="state tail">加载中…</view>
      <view v-else-if="!hasMore" class="state tail">没有更多了</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  onPullDownRefresh,
  onReachBottom,
  onShareAppMessage,
  onShow,
} from "@dcloudio/uni-app";
import CommunityPostCard from "@/components/community-post-card/community-post-card.vue";
import { getPostShareMessage } from "@/adapters/share";
import { listMyCommunityPosts, type CommunityPost } from "@/api/community";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const PAGE_SIZE = 20;

const user = useUserStore();
const items = ref<CommunityPost[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const errorText = ref("");
let loadGen = 0;

const hasMore = computed(() => items.value.length < total.value);

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
  return err instanceof Error ? err.message : "请求失败";
}

async function load(opts: { reset?: boolean } = {}) {
  if (!user.isLoggedIn) return;
  const reset = opts.reset ?? false;
  if (!reset && (loading.value || !hasMore.value)) return;
  loadGen += 1;
  const gen = loadGen;
  const nextPage = reset ? 1 : page.value + 1;
  loading.value = true;
  errorText.value = "";
  try {
    const res = await listMyCommunityPosts({ page: nextPage, pageSize: PAGE_SIZE });
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

async function onLogin() {
  await user.promptLogin("登录后即可查看我的动态");
  if (user.isLoggedIn) await load({ reset: true });
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/community/detail?id=${encodeURIComponent(id)}` });
}

function goActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${encodeURIComponent(id)}` });
}

function goCompose() {
  uni.navigateTo({ url: "/pages/community/compose" });
}

onShow(() => {
  void load({ reset: true });
});

onPullDownRefresh(async () => {
  await load({ reset: true });
  uni.stopPullDownRefresh();
});

onReachBottom(() => {
  void load();
});

onShareAppMessage((res: { target?: { dataset?: Record<string, string> } }) => {
  const id = res?.target?.dataset?.id;
  const post = id ? items.value.find((p) => p.id === id) : undefined;
  if (!post) return { title: "社区", path: "/pages/community/index" };
  return getPostShareMessage(post);
});
</script>

<style scoped lang="scss">
.list {
  padding-top: 24rpx;
}

.state {
  padding: 80rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.state.tail {
  padding: 24rpx 0 8rpx;
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
  margin-bottom: 40rpx;
}

.empty .ed-btn {
  width: auto;
  margin: 0;
}
</style>
