<template>
  <view class="page page-l2">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="errorMessage" class="state">{{ errorMessage }}</view>
    <template v-else-if="activity">
      <image
        v-if="activity.coverUrl"
        class="cover-img"
        :src="activity.coverUrl"
        mode="aspectFill"
      />
      <view v-else class="cover cover-placeholder">
        <text class="cover-label">活动</text>
      </view>

      <view class="panel">
        <view class="title-row">
          <view class="title">{{ activity.title }}</view>
          <text
            class="fee ed-tag"
            :class="isFree ? 'ed-tag-open' : 'ed-tag-paid'"
          >{{ feeLabel }}</text>
        </view>
        <text class="status ed-tag" :class="statusTagClass">{{
          displayLabel
        }}</text>

        <view class="info">
          <view class="info-row">
            <text class="label">时间</text>
            <text class="value"
              >{{ formatTime(activity.startAt) }} —
              {{ formatTime(activity.endAt) }}</text
            >
          </view>
          <view class="info-row">
            <text class="label">报名截止</text>
            <text class="value">{{
              formatTime(
                activity.registrationDeadlineAt ?? activity.startAt,
              )
            }}</text>
          </view>
          <view class="info-row">
            <text class="label">地点</text>
            <text class="value">{{ activity.place || "—" }}</text>
          </view>
          <view class="info-row">
            <text class="label">费用</text>
            <text class="value">{{ feeLabel }}（首期线下结算）</text>
          </view>
          <view class="info-row">
            <text class="label">取消政策</text>
            <text class="value">{{
              activity.allowUserCancel === false
                ? "报名后不可取消"
                : "允许用户取消报名"
            }}</text>
          </view>
          <view class="info-row">
            <text class="label">退款政策</text>
            <text class="value">{{
              activity.refundable ? "可退款（支付上线后生效）" : "不可退款"
            }}</text>
          </view>
          <view class="info-row">
            <text class="label">主办</text>
            <text class="value">{{ activity.hostName }}</text>
          </view>
          <view class="info-row">
            <text class="label">名额</text>
            <text class="value">上限 {{ activity.capacity }} 人</text>
          </view>
        </view>
      </view>

      <view v-if="activity.rules" class="panel">
        <text class="section-title">活动须知</text>
        <text class="rules">{{ activity.rules }}</text>
      </view>

      <view class="bottom-space" />
      <view class="cta-bar">
        <!-- 微信：open-type=share；H5：走适配层 Web Share / 复制链接 -->
        <!-- #ifdef MP-WEIXIN -->
        <button
          v-if="canShare"
          class="share ed-btn-secondary"
          hover-class="none"
          open-type="share"
        >
          分享
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button
          v-if="canShare"
          class="share ed-btn-secondary"
          hover-class="none"
          @click="onShare"
        >
          分享
        </button>
        <!-- #endif -->
        <button
          class="cta ed-btn"
          hover-class="none"
          :class="{ disabled: !canRegister, withShare: canShare }"
          :disabled="!canRegister"
          @click="onCta"
        >
          {{ ctaText }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  onLoad,
  onShow,
  onShareAppMessage,
  onShareTimeline,
} from "@dcloudio/uni-app";
import {
  getPublicActivity,
  type PublicActivity,
} from "@/api/public-activities";
import {
  listMyRegistrations,
  type Registration,
} from "@/api/registrations";
import {
  canShareActivity,
  getActivityShareMessage,
  shareActivity,
} from "@/adapters/share";
import { ApiError, getUserToken } from "@/utils/request";

const DISPLAY_LABEL: Record<string, string> = {
  upcoming: "报名中",
  open: "报名中",
  ended: "已结束",
  full: "已满员",
  closed: "报名截止",
};

const activity = ref<PublicActivity | null>(null);
const myRegistration = ref<Registration | null>(null);
const loading = ref(true);
const errorMessage = ref("");

const alreadyRegistered = computed(
  () => myRegistration.value?.status === "confirmed",
);

const isFree = computed(() => {
  const a = activity.value;
  if (!a) return true;
  return a.feeType === "free" || a.feeCents === 0;
});

const feeLabel = computed(() => {
  const a = activity.value;
  if (!a || isFree.value) return "免费";
  return `¥${(a.feeCents / 100).toFixed(2)}`;
});

const displayLabel = computed(() => {
  const status = activity.value?.displayStatus ?? "";
  return DISPLAY_LABEL[status] ?? status;
});

const statusTagClass = computed(() => {
  const status = activity.value?.displayStatus ?? "";
  if (status === "open") return "ed-tag-open";
  if (status === "full") return "ed-tag-full";
  return "ed-tag-muted";
});

const canRegister = computed(() => {
  const a = activity.value;
  if (!a) return false;
  if (alreadyRegistered.value) return false;
  if (a.feeType === "paid") return false;
  return a.displayStatus === "open" || a.displayStatus === "upcoming";
});

const canShare = computed(() => canShareActivity(activity.value));

const ctaText = computed(() => {
  const a = activity.value;
  if (!a) return "立即报名";
  if (alreadyRegistered.value) return "已报名";
  if (a.feeType === "paid") return "暂不支持线上报名";
  if (a.displayStatus === "ended") return "活动已结束";
  if (a.displayStatus === "closed") return "报名已截止";
  if (a.displayStatus === "full") return "名额已满";
  return "立即报名";
});

function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function resolveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "ACTIVITY_CANCELLED") return "活动已取消";
    if (err.code === "ACTIVITY_REMOVED") return "活动已下架";
    if (err.status === 404) return "活动不存在或已下架";
    return err.message || "加载失败";
  }
  return "加载失败";
}

async function loadMyRegistration(activityId: string) {
  myRegistration.value = null;
  if (!getUserToken()) return;
  try {
    const res = await listMyRegistrations({
      activityId,
      status: "confirmed",
      page: 1,
      pageSize: 1,
    });
    myRegistration.value = res.items?.[0] ?? null;
  } catch {
    // 未登录或拉取失败时不阻断详情；保持可报名态由服务端校验兜底
    myRegistration.value = null;
  }
}

async function load(id: string) {
  loading.value = true;
  errorMessage.value = "";
  activity.value = null;
  myRegistration.value = null;
  try {
    const data = await getPublicActivity(id);
    activity.value = data;
    uni.setNavigationBarTitle({ title: "活动详情" });
    await loadMyRegistration(id);
  } catch (err) {
    errorMessage.value = resolveErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

const loadedActivityId = ref("");

onLoad((query) => {
  const id = String(query?.id ?? "").trim();
  if (!id) {
    loading.value = false;
    errorMessage.value = "活动不存在或已下架";
    return;
  }
  loadedActivityId.value = id;
  void load(id);
});

onShow(() => {
  // 从报名/取消返回时刷新「是否已报名」
  if (loadedActivityId.value && activity.value) {
    void loadMyRegistration(loadedActivityId.value);
  }
});

onShareAppMessage(() => {
  const a = activity.value;
  if (!canShareActivity(a)) {
    return { title: "活动", path: "/pages/home/index" };
  }
  return getActivityShareMessage(a!);
});

onShareTimeline(() => {
  const a = activity.value;
  if (!canShareActivity(a)) {
    return { title: "活动" };
  }
  const msg = getActivityShareMessage(a!);
  return {
    title: msg.title,
    query: `id=${encodeURIComponent(a!.id)}`,
    imageUrl: msg.imageUrl,
  };
});

async function onShare() {
  const a = activity.value;
  if (!canShareActivity(a)) return;
  try {
    await shareActivity(a!);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    uni.showToast({ title: "分享失败", icon: "none" });
  }
}

function onCta() {
  if (!activity.value || !canRegister.value) return;
  uni.navigateTo({
    url: `/pages/register/index?activityId=${encodeURIComponent(activity.value.id)}`,
  });
}
</script>

<style scoped lang="scss">
.state {
  padding: 160rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.cover-img,
.cover {
  margin-left: -$ed-space-page-x;
  margin-right: -$ed-space-page-x;
  width: calc(100% + 88rpx);
}

.cover-img {
  height: 360rpx;
  display: block;
  background: $ed-color-border;
}

.cover {
  height: 360rpx;
  display: flex;
  align-items: flex-end;
  padding: 32rpx;
  box-sizing: border-box;
}

.cover-placeholder {
  background: $ed-color-brand;
}

.cover-label {
  color: rgba(255, 255, 255, 0.95);
  font-size: 28rpx;
  letter-spacing: 2rpx;
}

.panel {
  margin-top: $ed-space-section;
  padding: $ed-space-card;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-card;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.title {
  flex: 1;
  min-width: 0;
  font-size: 38rpx;
  font-weight: 600;
  color: $ed-color-text;
  line-height: 1.4;
}

.fee {
  flex-shrink: 0;
}

.status {
  margin-bottom: 28rpx;
}

.info-row {
  display: flex;
  gap: 24rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid $ed-color-border;
}

.info-row:first-child {
  border-top: none;
  padding-top: 0;
}

.label {
  width: 128rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: $ed-color-text-secondary;
}

.value {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: $ed-color-text;
  line-height: 1.45;
}

.section-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: $ed-color-text;
  margin-bottom: 16rpx;
}

.rules {
  display: block;
  font-size: 26rpx;
  color: $ed-color-text;
  line-height: 1.6;
}

.bottom-space {
  height: 160rpx;
}

.cta-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx $ed-space-page-x calc(16rpx + env(safe-area-inset-bottom));
  background: $ed-color-surface;
  border-top: 1rpx solid $ed-color-border;
}

.share,
.cta {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-weight: 600;
}

.share {
  flex: 0 0 180rpx;
  width: 180rpx;
}

.share::after,
.cta::after {
  border: none;
}

.cta {
  flex: 1;
  width: auto;
}

.cta.disabled,
.cta[disabled] {
  opacity: 0.45;
  background: $ed-color-brand;
  color: #ffffff;
}
</style>
