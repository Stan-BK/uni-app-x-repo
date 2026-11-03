<template>
  <view class="page page-l2">
    <view class="card">
      <textarea
        class="body-input"
        :value="body"
        :maxlength="BODY_MAX"
        placeholder="分享你的活动见闻…"
        placeholder-class="placeholder"
        auto-height
        @input="onBodyInput"
      />
      <text class="counter">{{ body.length }}/{{ BODY_MAX }}</text>

      <view class="images">
        <view v-for="(img, index) in images" :key="img.url" class="thumb">
          <image class="thumb-img" :src="img.url" mode="aspectFill" />
          <view class="thumb-del" hover-class="none" @click="removeImage(index)">
            <text>×</text>
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
        </view>
      </view>
      <text class="hint">最多 {{ IMAGES_MAX }} 张图片，可只发图片</text>
    </view>

    <view class="card">
      <view class="section-head">
        <text class="section-title">关联活动</text>
        <text class="section-sub">{{ selected.length }}/{{ ACTIVITIES_MAX }}</text>
      </view>
      <view v-if="selected.length" class="chips">
        <view
          v-for="act in selected"
          :key="act.id"
          class="chip"
          hover-class="none"
          @click="toggleActivity(act)"
        >
          <text class="chip-text">{{ act.title }}</text>
          <text class="chip-x">×</text>
        </view>
      </view>
      <view class="search-wrap">
        <input
          class="search"
          type="text"
          confirm-type="search"
          :value="q"
          placeholder="搜索活动标题"
          placeholder-class="placeholder"
          @input="onQInput"
          @confirm="searchCandidates"
        />
      </view>
      <view v-if="searching" class="state">搜索中…</view>
      <view v-else-if="!candidates.length" class="state">暂无可关联的活动</view>
      <view v-else class="cand-list">
        <view
          v-for="act in candidates"
          :key="act.id"
          class="cand"
          :class="{ on: isSelected(act.id) }"
          hover-class="none"
          @click="toggleActivity(act)"
        >
          <text class="cand-title">{{ act.title }}</text>
          <text class="cand-mark">{{ isSelected(act.id) ? "已选" : "选择" }}</text>
        </view>
      </view>
    </view>

    <button
      class="ed-btn submit"
      :loading="submitting"
      :disabled="submitting || uploading"
      @click="onSubmit"
    >
      发布
    </button>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
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
import { useUserStore } from "@/stores/user";
import { ApiError } from "@/utils/request";

const BODY_MAX = COMMUNITY_POST_BODY_MAX;
const IMAGES_MAX = COMMUNITY_POST_IMAGES_MAX;
const ACTIVITIES_MAX = COMMUNITY_POST_ACTIVITIES_MAX;

const user = useUserStore();
const body = ref("");
const images = ref<{ url: string }[]>([]);
const uploading = ref(false);
const submitting = ref(false);
const q = ref("");
const candidates = ref<ActivityCandidate[]>([]);
const selected = ref<ActivityCandidate[]>([]);
const searching = ref(false);
let searchGen = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
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
  searchTimer = setTimeout(() => void searchCandidates(), 300);
}

async function searchCandidates() {
  if (searchTimer) clearTimeout(searchTimer);
  if (!user.isLoggedIn) return;
  searchGen += 1;
  const gen = searchGen;
  searching.value = true;
  try {
    const res = await listActivityCandidates({ q: q.value.trim(), page: 1 });
    if (gen !== searchGen) return;
    candidates.value = res.items ?? [];
  } catch (e) {
    if (gen !== searchGen) return;
    candidates.value = [];
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    if (gen === searchGen) searching.value = false;
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
  void searchCandidates();
});
</script>

<style scoped lang="scss">
.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
  margin-top: 24rpx;
}

.body-input {
  width: 100%;
  min-height: 200rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: $ed-color-text;
}

.placeholder {
  color: $ed-color-text-muted;
}

.counter {
  display: block;
  text-align: right;
  font-size: 22rpx;
  color: $ed-color-text-muted;
  margin-bottom: 16rpx;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.thumb {
  position: relative;
  width: 190rpx;
  height: 190rpx;
  border-radius: $ed-radius-tag;
}

.thumb-img {
  width: 100%;
  height: 100%;
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.thumb-del {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 38rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(36, 49, 45, 0.6);
  color: #ffffff;
  font-size: 28rpx;
}

.thumb-add {
  display: flex;
  align-items: center;
  justify-content: center;
  background: $ed-color-btn-secondary;
}

.thumb-plus {
  font-size: 56rpx;
  color: $ed-color-text-secondary;
}

.thumb-hint {
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.hint {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.section-sub {
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.chip {
  display: flex;
  align-items: center;
  gap: 8rpx;
  max-width: 100%;
  padding: 8rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
  font-size: 24rpx;
}

.chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-wrap {
  padding: 0 24rpx;
  background: $ed-color-canvas;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-input;
}

.search {
  height: 72rpx;
  font-size: 28rpx;
  color: $ed-color-text;
}

.state {
  padding: 32rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 26rpx;
}

.cand-list {
  margin-top: 8rpx;
}

.cand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid $ed-color-border;
}

.cand:last-child {
  border-bottom: none;
}

.cand-title {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: $ed-color-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cand-mark {
  flex-shrink: 0;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.cand.on .cand-mark {
  color: $ed-color-brand;
  font-weight: 600;
}

.submit {
  margin: 40rpx 0 0;
  font-weight: 600;
}
</style>
