<template>
  <view class="page page-l2 compose-page">
    <view class="intro">
      <text class="intro-kicker">COMMUNITY</text>
      <text class="intro-title">分享此刻</text>
      <text class="intro-sub">记录活动里的故事和瞬间，和社区一起分享</text>
    </view>

    <view class="card">
      <view class="label-row">
        <view class="label">
          <view class="label-dot" />
          <text class="label-text">正文</text>
        </view>
        <text class="counter" :class="{ 'is-warn': body.length >= BODY_MAX }">
          {{ body.length }}/{{ BODY_MAX }}
        </text>
      </view>
      <textarea
        class="body-input"
        :value="body"
        :maxlength="BODY_MAX"
        placeholder="分享你的活动见闻…"
        placeholder-class="placeholder"
        auto-height
        @input="onBodyInput"
      />

      <view class="images">
        <view v-for="(img, index) in images" :key="img.url" class="thumb">
          <image class="thumb-img" :src="img.url" mode="aspectFill" />
          <view class="thumb-del" hover-class="none" @click="removeImage(index)">
            <text class="thumb-del-x">×</text>
          </view>
        </view>
        <view v-if="uploading" class="thumb thumb-add">
          <text class="thumb-hint">上传中…</text>
        </view>
        <view
          v-else-if="images.length < IMAGES_MAX"
          class="thumb thumb-add"
          hover-class="none"
          @click="onPickImages"
        >
          <text class="thumb-plus">+</text>
          <text class="thumb-count">{{ images.length }}/{{ IMAGES_MAX }}</text>
        </view>
      </view>
      <view class="hint-row">
        <text class="hint">最多 {{ IMAGES_MAX }} 张图片，可只发图片</text>
      </view>
    </view>

    <view class="card acts-card">
      <view class="section-head">
        <view class="section-icon">
          <EdIcon name="calendar" size="30rpx" />
        </view>
        <view class="section-titles">
          <text class="section-title">关联活动</text>
          <text class="section-sub">点击活动查看详情，再选择关联</text>
        </view>
        <text class="section-count" :class="{ 'is-full': selected.length >= ACTIVITIES_MAX }">
          {{ selected.length }}/{{ ACTIVITIES_MAX }}
        </text>
      </view>

      <view v-if="selected.length" class="selected">
        <text class="selected-label">已关联</text>
        <view class="chips">
          <view
            v-for="act in selected"
            :key="act.id"
            class="chip"
            hover-class="chip-pressed"
            @click="toggleActivity(act)"
          >
            <EdIcon name="calendar" size="22rpx" />
            <text class="chip-text">{{ act.title }}</text>
            <text class="chip-x">×</text>
          </view>
        </view>
      </view>

      <view class="search-wrap">
        <EdIcon name="search" size="30rpx" />
        <input
          class="search"
          type="text"
          confirm-type="search"
          :value="q"
          placeholder="搜索活动标题"
          placeholder-class="placeholder"
          @input="onQInput"
          @confirm="onSearchConfirm"
        />
        <view v-if="q" class="search-clear" hover-class="none" @click="clearSearch">
          <text class="search-clear-x">×</text>
        </view>
      </view>

      <view class="cand-panel">
        <view v-if="loadingCandidates && !candidates.length" class="cand-state">加载中…</view>
        <view
          v-else-if="candidatesError && !candidates.length"
          class="cand-state cand-retry"
          @click="loadCandidates({ reset: true })"
        >
          {{ candidatesError }}，点击重试
        </view>
        <view v-else-if="!candidates.length" class="cand-state">没有找到相关活动</view>
        <scroll-view
          v-else
          :key="listKey"
          class="cand-scroll"
          scroll-y
          :show-scrollbar="false"
          @scroll="onCandScroll"
        >
          <view :style="{ height: `${spacerTop}rpx` }" />
          <view
            v-for="act in visibleCandidates"
            :key="act.id"
            class="cand"
            :class="{ 'is-selected': isSelected(act.id) }"
            hover-class="cand-pressed"
            @click="openActivityDetail(act)"
          >
            <view class="cand-icon">
              <EdIcon name="calendar" size="30rpx" />
            </view>
            <view class="cand-main">
              <text class="cand-title">{{ act.title }}</text>
              <text class="cand-sub">{{
                isSelected(act.id) ? "已加入关联" : "点击查看活动详情"
              }}</text>
            </view>
            <view class="cand-pill" :class="{ 'is-on': isSelected(act.id) }">
              <text class="cand-pill-text">{{ isSelected(act.id) ? "已选" : "详情" }}</text>
            </view>
          </view>
          <view :style="{ height: `${spacerBottom}rpx` }" />
          <view v-if="loadingMore" class="cand-more">加载中…</view>
          <view v-else-if="!hasMoreCandidates && candidates.length >= 3" class="cand-more">
            已经到底了
          </view>
        </scroll-view>
        <view v-if="candidates.length" class="cand-fade" />
      </view>
      <view v-if="candidates.length" class="cand-hint">
        共 {{ candidatesTotal }} 个活动 · 上下滑动浏览
      </view>
    </view>

    <button
      class="ed-btn submit"
      :loading="submitting"
      :disabled="submitting || uploading"
      @click="onSubmit"
    >
      <EdIcon name="send" size="30rpx" />
      <text class="submit-text">发布动态</text>
    </button>

    <view
      v-if="sheetOpen"
      class="sheet-mask"
      @click="closeSheet"
      @touchmove.stop.prevent
    />
    <view v-if="sheetOpen" class="sheet">
      <view class="sheet-handle" />
      <view class="sheet-head">
        <text class="sheet-heading">活动详情</text>
        <view class="sheet-close" hover-class="sheet-close-pressed" @click="closeSheet">
          <text class="sheet-close-x">×</text>
        </view>
      </view>

      <scroll-view class="sheet-body" scroll-y :show-scrollbar="false">
        <view v-if="sheetLoading" class="sheet-state">加载中…</view>
        <view
          v-else-if="sheetError"
          class="sheet-state sheet-retry"
          @click="retrySheetDetail"
        >
          {{ sheetError }}，点击重试
        </view>
        <template v-else-if="sheetActivity">
          <image
            v-if="sheetActivity.coverUrl && !sheetCoverBroken"
            class="sheet-cover"
            :src="sheetActivity.coverUrl"
            mode="aspectFill"
            @error="sheetCoverBroken = true"
          />
          <view v-else class="sheet-cover sheet-cover-fallback">
            <EdIcon name="calendar" size="56rpx" />
            <text class="sheet-cover-hint">活动封面暂缺</text>
          </view>

          <view class="sheet-title-row">
            <text class="sheet-title">{{ sheetActivity.title }}</text>
            <view class="sheet-tags">
              <text v-if="sheetStatusLabel" class="sheet-tag" :class="sheetStatusTone">
                {{ sheetStatusLabel }}
              </text>
              <text class="sheet-tag sheet-tag-fee">{{ sheetFeeLabel }}</text>
            </view>
          </view>

          <view class="sheet-meta">
            <view class="meta-row">
              <EdIcon name="clock" size="28rpx" />
              <text class="meta-label">时间</text>
              <text class="meta-value">{{ sheetTimeLabel }}</text>
            </view>
            <view class="meta-row">
              <EdIcon name="pin" size="28rpx" />
              <text class="meta-label">地点</text>
              <text class="meta-value">{{ sheetActivity.place || "—" }}</text>
            </view>
            <view class="meta-row">
              <EdIcon name="person" size="28rpx" />
              <text class="meta-label">主办</text>
              <text class="meta-value">{{ sheetActivity.hostName || "—" }}</text>
            </view>
            <view class="meta-row">
              <EdIcon name="yen" size="28rpx" />
              <text class="meta-label">费用</text>
              <text class="meta-value">{{ sheetFeeLabel }}</text>
            </view>
          </view>

          <view v-if="sheetActivity.description" class="sheet-desc">
            <text class="sheet-desc-label">活动介绍</text>
            <text class="sheet-desc-text">{{ sheetActivity.description }}</text>
          </view>
        </template>
      </scroll-view>

      <view class="sheet-foot">
        <button class="ed-btn-secondary sheet-btn" hover-class="none" @click="closeSheet">
          取消
        </button>
        <button
          class="ed-btn sheet-btn"
          :disabled="!sheetActivity || (!sheetSelected && selected.length >= ACTIVITIES_MAX)"
          :class="{
            'is-off': !sheetActivity || (!sheetSelected && selected.length >= ACTIVITIES_MAX),
          }"
          hover-class="none"
          @click="onConfirmSelection"
        >
          <EdIcon :name="sheetSelected ? 'check' : 'send'" size="28rpx" />
          <text class="sheet-btn-text">{{ sheetSelected ? "取消关联" : "选择关联" }}</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  COMMUNITY_POST_ACTIVITIES_MAX,
  COMMUNITY_POST_BODY_MAX,
  COMMUNITY_POST_IMAGES_MAX,
} from "@activity/shared";
import {
  createCommunityPost,
  listActivityCandidates,
  uploadCommunityImage,
  type ActivityCandidate,
} from "@/api/community";
import {
  getPublicActivity,
  type PublicActivity,
} from "@/api/public-activities";
import EdIcon from "@/components/ed-icon/ed-icon.vue";
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const BODY_MAX = COMMUNITY_POST_BODY_MAX;
const IMAGES_MAX = COMMUNITY_POST_IMAGES_MAX;
const ACTIVITIES_MAX = COMMUNITY_POST_ACTIVITIES_MAX;

/** 活动候选列表：固定 3 行视口 + 行高，用于虚拟滚动 */
const CAND_ROW_H = 112;
const CAND_VIEW_ROWS = 3;
const CAND_BUFFER_ROWS = 3;
/** scroll 事件的 scrollTop 为 px，行高常量是 rpx，计算可视窗口时需换算 */
const CAND_ROW_PX = uni.upx2px(CAND_ROW_H);
const CAND_VIEW_PX = CAND_ROW_PX * CAND_VIEW_ROWS;

const user = useUserStore();
const body = ref("");
const images = ref<{ url: string }[]>([]);
const uploading = ref(false);
const submitting = ref(false);
const q = ref("");

const candidates = ref<ActivityCandidate[]>([]);
const candidatesTotal = ref(0);
const candidatesPage = ref(0);
const loadingCandidates = ref(false);
const loadingMore = ref(false);
const candidatesError = ref("");
const listScrollTop = ref(0);
/** 搜索/重载时自增，重建 scroll-view 以回到顶部 */
const listKey = ref(0);
const selected = ref<ActivityCandidate[]>([]);

let candGen = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const hasMoreCandidates = computed(() => candidates.value.length < candidatesTotal.value);

const visibleRange = computed(() => {
  const total = candidates.value.length;
  if (!total) return { start: 0, end: 0 };
  const start = Math.max(
    0,
    Math.floor(listScrollTop.value / CAND_ROW_PX) - CAND_BUFFER_ROWS,
  );
  const end = Math.min(
    total,
    Math.ceil((listScrollTop.value + CAND_VIEW_PX) / CAND_ROW_PX) + CAND_BUFFER_ROWS,
  );
  return { start, end: Math.max(end, Math.min(total, start + 1)) };
});

const visibleCandidates = computed(() =>
  candidates.value.slice(visibleRange.value.start, visibleRange.value.end),
);

const spacerTop = computed(() => visibleRange.value.start * CAND_ROW_H);
const spacerBottom = computed(
  () => Math.max(0, (candidates.value.length - visibleRange.value.end) * CAND_ROW_H),
);

const sheetOpen = ref(false);
const sheetActivityId = ref("");
const sheetActivity = ref<PublicActivity | null>(null);
const sheetLoading = ref(false);
const sheetError = ref("");
const sheetCoverBroken = ref(false);
const detailCache = new Map<string, PublicActivity>();
let sheetGen = 0;

const sheetSelected = computed(() => isSelected(sheetActivityId.value));

const sheetStatusLabel = computed(() => {
  const status = sheetActivity.value?.displayStatus;
  if (!status) return "";
  const map: Record<string, string> = {
    upcoming: "报名中",
    open: "报名中",
    ended: "已结束",
    full: "已满员",
    closed: "报名截止",
  };
  return map[status] ?? "";
});

const sheetStatusTone = computed(() => {
  const status = sheetActivity.value?.displayStatus;
  return status === "ended" || status === "full" || status === "closed"
    ? "sheet-tag-muted"
    : "sheet-tag-open";
});

const sheetFeeLabel = computed(() => {
  const act = sheetActivity.value;
  if (!act) return "";
  if (act.feeType === "free" || act.feeCents === 0) return "免费";
  return `¥${(act.feeCents / 100).toFixed(2)}`;
});

const sheetTimeLabel = computed(() =>
  formatTimeRange(sheetActivity.value?.startAt, sheetActivity.value?.endAt),
);

function errMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return "活动不存在或已下架";
    return err.message || "请求失败";
  }
  return err instanceof Error ? err.message : "请求失败";
}

function inputValue(e: Event): string {
  return (e as unknown as { detail?: { value?: string } }).detail?.value ?? "";
}

function onBodyInput(e: Event) {
  body.value = inputValue(e);
}

function onQInput(e: Event) {
  q.value = inputValue(e);
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadCandidates({ reset: true }), 300);
}

function onSearchConfirm() {
  if (searchTimer) clearTimeout(searchTimer);
  void loadCandidates({ reset: true });
}

function clearSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  q.value = "";
  void loadCandidates({ reset: true });
}

function onCandScroll(e: Event) {
  const detail = (e as unknown as { detail?: { scrollTop?: number } }).detail;
  listScrollTop.value = Number(detail?.scrollTop ?? 0);
  void maybeLoadMore();
}

async function loadCandidates(opts: { reset?: boolean } = {}) {
  if (!user.isLoggedIn) return;
  const reset = opts.reset ?? false;
  if (reset) {
    candGen += 1;
    candidates.value = [];
    candidatesTotal.value = 0;
    candidatesPage.value = 0;
    candidatesError.value = "";
    loadingCandidates.value = true;
    loadingMore.value = false;
    listScrollTop.value = 0;
    listKey.value += 1;
  } else {
    if (loadingCandidates.value || loadingMore.value || !hasMoreCandidates.value) return;
    loadingMore.value = true;
  }
  const gen = candGen;
  try {
    const next = reset ? 1 : candidatesPage.value + 1;
    const res = await listActivityCandidates({ q: q.value.trim(), page: next });
    if (gen !== candGen) return;
    const items = res.items ?? [];
    candidates.value = next === 1 ? items : [...candidates.value, ...items];
    candidatesTotal.value = res.total ?? 0;
    candidatesPage.value = next;
  } catch (e) {
    if (gen !== candGen) return;
    if (reset) {
      candidates.value = [];
      candidatesTotal.value = 0;
      candidatesError.value = errMessage(e);
    } else {
      uni.showToast({ title: errMessage(e), icon: "none" });
    }
  } finally {
    if (gen === candGen) {
      loadingCandidates.value = false;
      loadingMore.value = false;
    }
  }
}

async function maybeLoadMore() {
  if (loadingCandidates.value || loadingMore.value || !hasMoreCandidates.value) return;
  const threshold = (candidates.value.length - 2) * CAND_ROW_PX;
  if (listScrollTop.value + CAND_VIEW_PX >= threshold) {
    await loadCandidates();
  }
}

function isSelected(id: string) {
  return selected.value.some((a) => a.id === id);
}

function toggleActivity(act: ActivityCandidate) {
  if (isSelected(act.id)) {
    selected.value = selected.value.filter((a) => a.id !== act.id);
    return;
  }
  if (selected.value.length >= ACTIVITIES_MAX) {
    uni.showToast({ title: `最多关联 ${ACTIVITIES_MAX} 个活动`, icon: "none" });
    return;
  }
  selected.value = [...selected.value, { id: act.id, title: act.title }];
}

async function fetchSheetDetail(id: string) {
  sheetActivity.value = null;
  sheetError.value = "";
  sheetCoverBroken.value = false;
  sheetLoading.value = true;
  sheetGen += 1;
  const gen = sheetGen;
  try {
    const res = await getPublicActivity(id);
    if (gen !== sheetGen) return;
    detailCache.set(id, res);
    sheetActivity.value = res;
  } catch (e) {
    if (gen !== sheetGen) return;
    sheetError.value = errMessage(e);
  } finally {
    if (gen === sheetGen) sheetLoading.value = false;
  }
}

function openActivityDetail(act: ActivityCandidate) {
  sheetActivityId.value = act.id;
  sheetOpen.value = true;
  sheetError.value = "";
  sheetCoverBroken.value = false;
  const cached = detailCache.get(act.id);
  if (cached) {
    sheetActivity.value = cached;
    sheetLoading.value = false;
    return;
  }
  void fetchSheetDetail(act.id);
}

function retrySheetDetail() {
  if (!sheetActivityId.value) return;
  void fetchSheetDetail(sheetActivityId.value);
}

function closeSheet() {
  sheetOpen.value = false;
  sheetGen += 1;
  sheetLoading.value = false;
}

function onConfirmSelection() {
  if (!sheetActivity.value) return;
  if (!sheetSelected.value && selected.value.length >= ACTIVITIES_MAX) {
    uni.showToast({ title: `最多关联 ${ACTIVITIES_MAX} 个活动`, icon: "none" });
    return;
  }
  toggleActivity({ id: sheetActivity.value.id, title: sheetActivity.value.title });
  closeSheet();
}

function chooseImages(count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success: (res) => resolve(res.tempFilePaths as string[]),
      fail: (err) => {
        const msg = err.errMsg || "";
        if (msg.includes("cancel")) {
          resolve([]);
          return;
        }
        reject(new Error(msg || "选择图片失败"));
      },
    });
  });
}

async function onPickImages() {
  if (uploading.value) return;
  if (!(await user.promptLogin("登录后即可发布动态"))) return;
  const remain = IMAGES_MAX - images.value.length;
  if (remain <= 0) return;
  uploading.value = true;
  try {
    const paths = (await chooseImages(remain)).slice(0, remain);
    for (const path of paths) {
      const { url } = await uploadCommunityImage(path);
      images.value = [...images.value, { url }];
    }
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    uploading.value = false;
  }
}

function removeImage(index: number) {
  images.value = images.value.filter((_, i) => i !== index);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(iso?: string | null) {
  const d = toDate(iso);
  if (!d) return iso || "时间待定";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatTimeRange(start?: string | null, end?: string | null) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return "时间待定";
  const date = `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()}`;
  const startClock = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
  if (!e) return `${date} ${startClock}`;
  const endClock = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameDay) return `${date} ${startClock} — ${endClock}`;
  return `${formatDateTime(start)} — ${formatDateTime(end)}`;
}

async function onSubmit() {
  if (submitting.value || uploading.value) return;
  const text = body.value.trim();
  if (!text && !images.value.length) {
    uni.showToast({ title: "写点什么或添加图片吧", icon: "none" });
    return;
  }
  if (!(await user.promptLogin("登录后即可发布动态"))) return;
  submitting.value = true;
  try {
    await createCommunityPost({
      body: text,
      imageUrls: images.value.map((i) => i.url),
      activityIds: selected.value.map((a) => a.id),
    });
    uni.showToast({ title: "发布成功", icon: "success" });
    setTimeout(() => {
      uni.navigateBack({
        fail: () => uni.switchTab({ url: "/pages/community/index" }),
      });
    }, 600);
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadCandidates({ reset: true });
});
</script>

<style scoped lang="scss">
.compose-page {
  padding-bottom: calc(56rpx + env(safe-area-inset-bottom));
}

.intro {
  margin-top: 28rpx;
}

.intro-kicker {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
  color: $ed-color-brand;
}

.intro-title {
  display: block;
  margin-top: 10rpx;
  font-size: 44rpx;
  font-weight: 800;
  line-height: 1.2;
  color: $ed-color-text;
}

.intro-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
  margin-top: 24rpx;
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.label {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.label-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: $ed-color-brand;
}

.label-text {
  font-size: 26rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.counter {
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.counter.is-warn {
  color: $ed-color-terracotta;
  font-weight: 600;
}

.body-input {
  width: 100%;
  min-height: 220rpx;
  font-size: 30rpx;
  line-height: 1.7;
  color: $ed-color-text;
}

.placeholder {
  color: $ed-color-text-muted;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.thumb {
  position: relative;
  width: 190rpx;
  height: 190rpx;
  border-radius: 24rpx;
}

.thumb-img {
  width: 100%;
  height: 100%;
  border-radius: 24rpx;
  background: $ed-color-border;
}

.thumb-del {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(36, 49, 45, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-del-x {
  font-size: 26rpx;
  line-height: 1;
  color: #ffffff;
}

.thumb-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  background: $ed-color-canvas;
  border: 2rpx dashed $ed-color-border;
}

.thumb-plus {
  font-size: 48rpx;
  line-height: 1;
  color: $ed-color-text-secondary;
}

.thumb-count {
  font-size: 20rpx;
  color: $ed-color-text-muted;
}

.thumb-hint {
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}

.hint {
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.section-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
  flex-shrink: 0;
}

.section-titles {
  flex: 1;
  min-width: 0;
}

.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.section-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.section-count {
  flex-shrink: 0;
  padding: 4rpx 18rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-btn-secondary;
  font-size: 22rpx;
  font-weight: 600;
  color: $ed-color-text-secondary;
}

.section-count.is-full {
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.selected {
  margin-bottom: 20rpx;
}

.selected-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  max-width: 100%;
  padding: 10rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.chip-pressed {
  background: #c4ece2;
}

.chip-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 24rpx;
  font-weight: 500;
}

.chip-x {
  font-size: 24rpx;
  line-height: 1;
  opacity: 0.7;
}

.search-wrap {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 80rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  background: $ed-color-canvas;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-pill;
  color: $ed-color-text-muted;
}

.search {
  flex: 1;
  min-width: 0;
  height: 80rpx;
  font-size: 28rpx;
  color: $ed-color-text;
}

.search-clear {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: $ed-color-btn-secondary;
}

.search-clear-x {
  font-size: 22rpx;
  line-height: 1;
  color: $ed-color-text-secondary;
}

.cand-panel {
  position: relative;
  margin-top: 20rpx;
  overflow: hidden;
  border: 1rpx solid $ed-color-border;
  border-radius: 24rpx;
  background: $ed-color-canvas;
}

.cand-scroll {
  height: 336rpx;
}

.cand-fade {
  position: absolute;
  left: 1rpx;
  right: 1rpx;
  bottom: 1rpx;
  height: 28rpx;
  background: linear-gradient(to bottom, rgba(255, 254, 251, 0), #fffefb);
  pointer-events: none;
}

.cand {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 112rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  background: $ed-color-surface;
  border-bottom: 1rpx solid $ed-color-border;
}

.cand.is-selected {
  background: #f1faf7;
}

.cand-pressed {
  background: $ed-color-canvas;
}

.cand-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
  flex-shrink: 0;
}

.cand-main {
  flex: 1;
  min-width: 0;
}

.cand-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: $ed-color-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cand-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.cand-pill {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 92rpx;
  height: 48rpx;
  padding: 0 18rpx;
  box-sizing: border-box;
  border-radius: $ed-radius-pill;
  border: 1rpx solid $ed-color-border;
  background: $ed-color-surface;
}

.cand-pill.is-on {
  background: $ed-color-brand;
  border-color: $ed-color-brand;
}

.cand-pill-text {
  font-size: 22rpx;
  font-weight: 600;
  color: $ed-color-text-secondary;
}

.cand-pill.is-on .cand-pill-text {
  color: #ffffff;
}

.cand-more {
  padding: 20rpx 0;
  text-align: center;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.cand-hint {
  margin-top: 14rpx;
  text-align: center;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.cand-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 336rpx;
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

.cand-retry {
  color: $ed-color-brand;
}

.submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  height: 92rpx;
  margin: 40rpx 0 0;
  font-weight: 600;
  box-shadow: 0 8rpx 20rpx rgba(30, 155, 136, 0.2);
}

.submit-text {
  font-size: 28rpx;
  color: #ffffff;
}

/* 活动详情弹层 */
.sheet-mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 190;
  background: rgba(36, 49, 45, 0.46);
  animation: sheet-mask-in 0.2s $ed-motion-ease both;
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding-top: 16rpx;
  padding-bottom: env(safe-area-inset-bottom);
  background: $ed-color-surface;
  border-radius: 40rpx 40rpx 0 0;
  box-shadow: 0 -10rpx 40rpx rgba(36, 49, 45, 0.18);
  animation: sheet-in 0.2s $ed-motion-ease both;
}

.sheet-handle {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 12rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-border;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx 12rpx;
}

.sheet-heading {
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: $ed-color-btn-secondary;
}

.sheet-close-pressed {
  opacity: 0.7;
}

.sheet-close-x {
  font-size: 30rpx;
  line-height: 1;
  color: $ed-color-text-secondary;
}

.sheet-body {
  height: 52vh;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.sheet-cover {
  width: 100%;
  height: 260rpx;
  border-radius: 24rpx;
  background: $ed-color-border;
}

.sheet-cover-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  background: linear-gradient(160deg, $ed-color-brand-soft, #f3f8f2);
  color: $ed-color-brand-strong;
}

.sheet-cover-hint {
  font-size: 22rpx;
  color: $ed-color-brand-strong;
  opacity: 0.75;
}

.sheet-title-row {
  margin-top: 20rpx;
}

.sheet-title {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  line-height: 1.35;
  color: $ed-color-text;
}

.sheet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 14rpx;
}

.sheet-tag {
  padding: 6rpx 18rpx;
  border-radius: $ed-radius-pill;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.4;
}

.sheet-tag-open {
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.sheet-tag-muted {
  background: $ed-color-btn-secondary;
  color: $ed-color-text-secondary;
}

.sheet-tag-fee {
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
}

.sheet-meta {
  margin-top: 20rpx;
  padding: 8rpx 20rpx;
  background: $ed-color-canvas;
  border-radius: 24rpx;
}

.meta-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 14rpx 0;
  color: $ed-color-brand-strong;
}

.meta-label {
  flex-shrink: 0;
  width: 64rpx;
  font-size: 24rpx;
  line-height: 34rpx;
  color: $ed-color-text-muted;
}

.meta-value {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  line-height: 34rpx;
  color: $ed-color-text;
  word-break: break-all;
}

.sheet-desc {
  margin-top: 24rpx;
  padding-bottom: 16rpx;
}

.sheet-desc-label {
  display: block;
  margin-bottom: 10rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.sheet-desc-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.7;
  color: $ed-color-text-secondary;
  word-break: break-all;
  white-space: pre-wrap;
}

.sheet-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300rpx;
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

.sheet-retry {
  color: $ed-color-brand;
}

.sheet-foot {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 32rpx 12rpx;
  border-top: 1rpx solid $ed-color-border;
}

.sheet-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  height: 84rpx;
  margin: 0;
  font-size: 28rpx;
  font-weight: 600;
}

.sheet-btn.is-off {
  opacity: 0.45;
}

.sheet-btn-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
}

@keyframes sheet-mask-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes sheet-in {
  from {
    transform: translate3d(0, 100%, 0);
  }
  to {
    transform: translate3d(0, 0, 0);
  }
}
</style>
