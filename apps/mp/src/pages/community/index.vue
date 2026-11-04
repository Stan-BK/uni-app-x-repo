<template>
  <view class="page page-l1">
    <EdLeafDeco />
    <view class="header">
      <text class="page-title">社区</text>
      <view class="sort">
        <view
          class="sort-item"
          :class="{ active: sort === 'latest' }"
          hover-class="none"
          @click="setSort('latest')"
        >
          <text>最新</text>
        </view>
        <view
          class="sort-item"
          :class="{ active: sort === 'hot' }"
          hover-class="none"
          @click="setSort('hot')"
        >
          <text>热门</text>
        </view>
      </view>
    </view>

    <view v-if="!user.isLoggedIn" class="state empty">
      <text class="empty-title">登录后查看社区</text>
      <text class="empty-desc">看看大家都在聊什么活动</text>
      <button class="ed-btn" @click="onLogin">登录微信账号</button>
    </view>
    <view v-else-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state empty">
      <text class="empty-title">{{ errorText || "还没有动态" }}</text>
      <text v-if="!errorText" class="empty-desc">来发布第一条动态吧</text>
      <button v-if="errorText" class="ed-btn" @click="load({ reset: true })">重试</button>
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

    <view class="fab" hover-class="none" @click="goCompose">
      <view class="fab-plus" />
    </view>
    <EdTabBar />
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
import EdTabBar from "@/components/ed-tab-bar/ed-tab-bar.vue";
import EdLeafDeco from "@/components/ed-leaf-deco/ed-leaf-deco.vue";
import CommunityPostCard from "@/components/community-post-card/community-post-card.vue";
import { getPostShareMessage } from "@/adapters/share";
import {
  listCommunityPosts,
  type CommunityPost,
  type CommunityPostSortKey,
} from "@/api/community";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const PAGE_SIZE = 20;

const user = useUserStore();
const sort = ref<CommunityPostSortKey>("latest");
const items = ref<CommunityPost[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const errorText = ref("");
let loadGen = 0;
let loggingIn = false;

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
    const res = await listCommunityPosts({
      sort: sort.value,
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

/** 页内登录 CTA：已有引导态，直接换 JWT，不再套一层弹窗。 */
async function onLogin() {
  if (user.isLoggedIn || loggingIn) return;
  loggingIn = true;
  try {
    await user.login();
    if (!user.guideProfileIfNeeded("login")) {
      uni.showToast({ title: "登录成功", icon: "none" });
    }
    await load({ reset: true });
  } catch (e) {
    uni.showToast({
      title: e instanceof Error ? e.message : "登录失败",
      icon: "none",
    });
  } finally {
    loggingIn = false;
  }
}

function setSort(next: CommunityPostSortKey) {
  if (sort.value === next) return;
  sort.value = next;
  items.value = [];
  total.value = 0;
  void load({ reset: true });
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/community/detail?id=${encodeURIComponent(id)}` });
}

function goActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${encodeURIComponent(id)}` });
}

async function goCompose() {
  if (!(await user.promptLogin("登录后即可发布动态"))) return;
  uni.navigateTo({ url: "/pages/community/compose" });
}

onShow(async () => {
  // 游客只展示页内登录引导，不弹「需要登录」
  if (user.isLoggedIn) await load({ reset: true });
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
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.page-title {
  font-size: 40rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.sort {
  display: flex;
  gap: 8rpx;
  padding: 6rpx;
  background: $ed-color-btn-secondary;
  border-radius: $ed-radius-pill;
}

.sort-item {
  padding: 8rpx 28rpx;
  border-radius: $ed-radius-pill;
  font-size: 26rpx;
  color: $ed-color-text-secondary;
}

.sort-item.active {
  background: $ed-color-surface;
  color: $ed-color-brand;
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(36, 49, 45, 0.08);
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

.fab {
  position: fixed;
  right: $ed-space-page-x;
  bottom: calc(148rpx + env(safe-area-inset-bottom));
  z-index: 90;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: $ed-color-accent;
  box-shadow: 0 8rpx 20rpx rgba(229, 111, 62, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fab-plus {
  position: relative;
  width: 40rpx;
  height: 40rpx;
}

.fab-plus::before,
.fab-plus::after {
  content: "";
  position: absolute;
  background: #ffffff;
  border-radius: 2rpx;
}

.fab-plus::before {
  left: 0;
  right: 0;
  top: 18rpx;
  height: 4rpx;
}

.fab-plus::after {
  top: 0;
  bottom: 0;
  left: 18rpx;
  width: 4rpx;
}
</style>
