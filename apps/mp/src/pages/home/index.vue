<template>
  <view class="page page-l1">
    <EdLeafDeco />
    <EdHotDeck
      v-if="hotItems.length >= 3"
      :items="hotItems"
      @select="goDetail"
    />
    <view class="entry-row">
      <view class="entry entry-primary" hover-class="none" @click="onPublish">
        <view class="ico ico-plus" />
        <text>发布活动</text>
      </view>
      <view class="entry entry-secondary" hover-class="none" @click="onMine">
        <view class="ico ico-list" />
        <text>我的活动</text>
      </view>
    </view>
    <view class="toolbar">
      <view class="search-wrap">
        <input
          :key="searchNonce"
          class="search"
          type="text"
          confirm-type="search"
          :value="q"
          placeholder="搜索活动标题"
          @input="onQInput"
          @confirm="onSearch"
        />
        <view
          v-if="q"
          class="search-clear"
          hover-class="none"
          @click.stop="onClearSearch"
        >
          <view class="ico-clear" />
        </view>
      </view>
      <view class="sort">
        <view
          class="sort-item"
          :class="{ active: sort === 'startAt' }"
          hover-class="none"
          @click="setSort('startAt')"
        >
          <text>开始时间</text>
          <view
            v-if="sort === 'startAt'"
            class="sort-dir"
            :class="{ 'is-desc': order === 'desc' }"
          />
        </view>
        <view
          class="sort-item"
          :class="{ active: sort === 'publishedAt' }"
          hover-class="none"
          @click="setSort('publishedAt')"
        >
          <text>发布时间</text>
          <view
            v-if="sort === 'publishedAt'"
            class="sort-dir"
            :class="{ 'is-desc': order === 'desc' }"
          />
        </view>
      </view>
    </view>

    <view v-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state">暂无活动</view>
    <view v-else class="list">
      <view class="masonry">
        <view
          v-for="(col, colIndex) in masonryCols"
          :key="colIndex"
          class="masonry-col"
        >
          <view
            v-for="item in col"
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
              </view>
              <view class="row-tags">
                <text
                  class="fee ed-tag"
                  :class="isFree(item) ? 'ed-tag-open' : 'ed-tag-paid'"
                >{{ feeLabel(item) }}</text>
                <text
                  class="status ed-tag"
                  :class="[item.displayStatus, statusTag(item.displayStatus)]"
                >{{ displayLabel(item.displayStatus) }}</text>
              </view>
              <text class="meta">{{ formatTime(item.startAt) }}</text>
              <view class="row-foot">
                <text class="place">{{ item.place || "—" }}</text>
                <view
                  v-if="cardFaces(item).length"
                  class="faces"
                  :class="{ 'is-overflow': cardFaces(item).length >= 3 }"
                >
                  <view
                    v-for="(person, index) in cardFaces(item)"
                    :key="`${item.id}-${person.nickname}-${index}`"
                    class="face"
                    :style="{ zIndex: index + 1 }"
                  >
                    <image
                      v-if="person.avatarUrl"
                      class="face-img"
                      :src="person.avatarUrl"
                      mode="aspectFill"
                    />
                    <view v-else class="face-img face-fallback">
                      <view class="face-head" />
                      <view class="face-body" />
                    </view>
                  </view>
                </view>
              </view>
            </view>
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
    <view class="entry-fab" :class="{ 'is-on': showEntryFab }">
      <view
        class="entry-fab-btn entry-primary"
        hover-class="none"
        @click="onPublish"
      >
        <view class="ico ico-plus" />
      </view>
      <view
        class="entry-fab-btn entry-secondary"
        hover-class="none"
        @click="onMine"
      >
        <view class="ico ico-list" />
      </view>
    </view>
    <EdTabBar />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { onPageScroll, onReachBottom, onShow } from "@dcloudio/uni-app";
import EdTabBar from "@/components/ed-tab-bar/ed-tab-bar.vue";
import EdHotDeck from "@/components/ed-hot-deck/ed-hot-deck.vue";
import EdLeafDeco from "@/components/ed-leaf-deco/ed-leaf-deco.vue";
import {
  listHotPublicActivities,
  listPublicActivities,
  type PublicActivity,
} from "@/api/public-activities";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const DISPLAY_LABEL: Record<string, string> = {
  upcoming: "报名中",
  open: "报名中",
  ended: "已结束",
  full: "已满员",
  closed: "报名截止",
};

const user = useUserStore();
const items = ref<PublicActivity[]>([]);
const hotItems = ref<PublicActivity[]>([]);
const loading = ref(false);
const acting = ref(false);
const q = ref("");
const searchNonce = ref(0);
const sort = ref<"startAt" | "publishedAt">("startAt");
/** startAt 默认升序；publishedAt 默认降序；再点同一项切换方向 */
const order = ref<"asc" | "desc">("asc");
const page = ref(1);
const total = ref(0);
const pageSize = 20;

const hasMore = computed(() => items.value.length < total.value);
const masonryCols = computed(() => {
  const cols: [PublicActivity[], PublicActivity[]] = [[], []];
  items.value.forEach((item, index) => {
    cols[index % 2].push(item);
  });
  return cols;
});
const showEntryFab = ref(false);

function syncEntryFab() {
  uni
    .createSelectorQuery()
    .select(".entry-row")
    .boundingClientRect((rect) => {
      if (!rect || Array.isArray(rect) || rect.height <= 0) return;
      showEntryFab.value = rect.bottom <= 8;
    })
    .exec();
}

function bindH5EntryFab() {
  // #ifdef H5
  const el = document.querySelector(".entry-row");
  const root = document.querySelector("uni-page-wrapper");
  if (!el) return;
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      showEntryFab.value = !entry.isIntersecting;
    },
    { root: root instanceof Element ? root : null, threshold: 0 },
  );
  io.observe(el);
  onUnmounted(() => io.disconnect());
  // #endif
}

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

function cardFaces(item: PublicActivity) {
  return (item.attendees ?? []).slice(0, 3);
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

function onClearSearch() {
  q.value = "";
  searchNonce.value += 1;
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

async function ensureLogin(message: string) {
  if (acting.value) return false;
  acting.value = true;
  try {
    return await user.promptLogin(message);
  } finally {
    acting.value = false;
  }
}

async function onPublish() {
  if (!(await ensureLogin("登录后才能发布活动"))) return;
  if (!user.canPublish) {
    uni.showToast({ title: "发布权限已关闭", icon: "none" });
    return;
  }
  uni.navigateTo({ url: "/pages/organizer/create" });
}

async function onMine() {
  if (!(await ensureLogin("登录后才能查看我的活动"))) return;
  uni.navigateTo({ url: "/pages/organizer/list" });
}

async function loadHot() {
  try {
    const res = await listHotPublicActivities();
    hotItems.value = Array.isArray(res) ? res.slice(0, 3) : [];
  } catch {
    hotItems.value = [];
  }
}

onMounted(() => {
  void loadHot();
  void load({ reset: true });
  bindH5EntryFab();
});
onShow(() => {
  // H5 first paint sometimes misses onShow; mount covers that path.
  // Refresh list when returning to tab.
  if (user.isLoggedIn) {
    void user.refreshIdentity().catch(() => {
      /* 网络失败时保留本地态 */
    });
  }
  void loadHot();
  void load({ reset: true });
  syncEntryFab();
  setTimeout(syncEntryFab, 50);
  setTimeout(syncEntryFab, 240);
});
onPageScroll(() => {
  syncEntryFab();
});
onReachBottom(() => {
  loadMore();
});
</script>

<style scoped lang="scss">
$ed-motion-duration: 0.2s !default;
$ed-motion-ease: cubic-bezier(0.32, 0.72, 0, 1) !default;

.toolbar {
  margin-bottom: 24rpx;
}

.search-wrap {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
  padding-right: 8rpx;
  box-sizing: border-box;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
}

.search {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0 16rpx 0 24rpx;
  box-sizing: border-box;
  background: transparent;
  border: none;
  font-size: 28rpx;
  color: $ed-color-text;
}

.search-clear {
  flex-shrink: 0;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

$ed-color-text-muted: #929b92 !default;

.ico-clear {
  width: 36rpx;
  height: 36rpx;
  background-color: $ed-color-text-muted;
  -webkit-mask-image: url("/static/ico/clear.svg");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: url("/static/ico/clear.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.sort {
  display: flex;
  gap: 16rpx;
}

.sort-item {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
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

.sort-dir {
  width: 28rpx;
  height: 28rpx;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: url("/static/sort.svg") center / contain no-repeat;
  mask: url("/static/sort.svg") center / contain no-repeat;
}

.sort-dir.is-desc {
  transform: scaleY(-1);
}

.entry-row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.entry {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  border-radius: $ed-radius-input;
  font-size: 26rpx;
  font-weight: 600;
}

$ed-color-accent: #e56f3e !default;

.entry-primary {
  background: $ed-color-accent;
  color: #ffffff;
  box-shadow: 0 8rpx 20rpx rgba(229, 111, 62, 0.3);
}

.entry-secondary {
  background: $ed-color-brand;
  color: #ffffff;
  box-shadow: 0 8rpx 20rpx rgba(30, 155, 136, 0.28);
}

.entry-fab {
  position: fixed;
  right: $ed-space-page-x;
  bottom: calc(136rpx + env(safe-area-inset-bottom));
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  opacity: 0;
  pointer-events: none;
  transform: translateY(16rpx) scale(0.92);
  transition:
    opacity $ed-motion-duration $ed-motion-ease,
    transform $ed-motion-duration $ed-motion-ease;
}

.entry-fab.is-on {
  opacity: 1;
  pointer-events: auto;
  transform: none;
}

.entry-fab-btn {
  width: 96rpx;
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.ico {
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
}

.ico-plus {
  width: 32rpx;
  height: 32rpx;
  background-color: currentColor;
  -webkit-mask-image: url("/static/ico/send.svg");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: url("/static/ico/send.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.ico-list {
  width: 32rpx;
  height: 32rpx;
  background-color: currentColor;
  -webkit-mask-image: url("/static/ico/person-list.png");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: url("/static/ico/person-list.png");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
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
}

.masonry {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.masonry-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
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
  height: 260rpx;
  display: block;
  background: $ed-color-border;
}

.cover {
  height: 260rpx;
  display: flex;
  align-items: flex-end;
  padding: 20rpx;
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
  padding: 20rpx;
}

.row-title {
  margin-bottom: 10rpx;
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.title {
  font-size: 26rpx;
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
  min-width: 0;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.faces {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  padding-left: 20rpx;
}

.face {
  position: relative;
  width: 44rpx;
  height: 44rpx;
  margin-left: -22rpx;
  flex-shrink: 0;
}

.face:first-child {
  margin-left: 0;
}

.faces.is-overflow .face:last-child {
  -webkit-mask-image: linear-gradient(
    to right,
    #000 40%,
    rgba(0, 0, 0, 0.35) 70%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    #000 40%,
    rgba(0, 0, 0, 0.35) 70%,
    transparent 100%
  );
}

.face-img {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  display: block;
  background: $ed-color-brand-soft;
  border: 3rpx solid $ed-color-surface;
  box-shadow: 0 0 0 1rpx $ed-color-border;
  box-sizing: border-box;
}

.face-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.face-head {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 2rpx;
}

.face-body {
  width: 24rpx;
  height: 10rpx;
  border-radius: 12rpx 12rpx 0 0;
  background: $ed-color-brand;
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
