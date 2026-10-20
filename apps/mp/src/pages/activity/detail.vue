<template>
  <view class="page">
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
          <text class="title">{{ activity.title }}</text>
          <text class="fee" :class="{ free: isFree }">{{ feeLabel }}</text>
        </view>
        <text class="status" :class="activity.displayStatus">{{
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
            <text class="value">{{ activity.organizer.displayName }}</text>
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
          class="share"
          open-type="share"
        >
          分享
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button
          v-if="canShare"
          class="share"
          @click="onShare"
        >
          分享
        </button>
        <!-- #endif -->
        <button
          class="cta"
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
  upcoming: "未开始",
  open: "报名中",
  ended: "已结束",
  full: "已满员",
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

const registrationClosed = computed(() => {
  const a = activity.value;
  if (!a) return false;
  const deadlineIso = a.registrationDeadlineAt ?? a.startAt;
  if (!deadlineIso) return false;
  const d = new Date(deadlineIso);
  return !Number.isNaN(d.getTime()) && Date.now() >= d.getTime();
});

const canRegister = computed(() => {
  const a = activity.value;
  if (!a) return false;
  if (alreadyRegistered.value) return false;
  if (a.feeType === "paid") return false;
  if (registrationClosed.value) return false;
  return a.displayStatus === "open" || a.displayStatus === "upcoming";
});

const canShare = computed(() => canShareActivity(activity.value));

const ctaText = computed(() => {
  const a = activity.value;
  if (!a) return "立即报名";
  if (alreadyRegistered.value) return "已报名";
  if (a.feeType === "paid") return "暂不支持线上报名";
  if (a.displayStatus === "ended") return "活动已结束";
  if (registrationClosed.value) return "报名已截止";
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

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding-bottom: env(safe-area-inset-bottom);
}

.state {
  padding: 160rpx 0;
  text-align: center;
  color: #8a9099;
  font-size: 28rpx;
}

.cover-img {
  width: 100%;
  height: 360rpx;
  display: block;
  background: #e5e7eb;
}

.cover {
  height: 360rpx;
  display: flex;
  align-items: flex-end;
  padding: 32rpx;
  box-sizing: border-box;
}

.cover-placeholder {
  background: #0f766e;
}

.cover-label {
  color: rgba(255, 255, 255, 0.95);
  font-size: 28rpx;
  letter-spacing: 2rpx;
}

.panel {
  margin: 24rpx;
  padding: 32rpx;
  background: #ffffff;
  border-radius: 16rpx;
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
  font-size: 36rpx;
  font-weight: 600;
  color: #1a1d23;
  line-height: 1.35;
}

.fee {
  flex-shrink: 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #c2410c;
}

.fee.free {
  color: #0f766e;
}

.status {
  display: inline-block;
  font-size: 22rpx;
  padding: 6rpx 14rpx;
  border-radius: 8rpx;
  color: #0f766e;
  background: #ecfdf5;
  margin-bottom: 28rpx;
}

.status.ended {
  color: #6b7280;
  background: #f3f4f6;
}

.status.upcoming {
  color: #1e3a5f;
  background: #eff6ff;
}

.status.full {
  color: #b45309;
  background: #fffbeb;
}

.info-row {
  display: flex;
  gap: 24rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid #f0f1f3;
}

.info-row:first-child {
  border-top: none;
  padding-top: 0;
}

.label {
  width: 72rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: #9ca3af;
}

.value {
  flex: 1;
  font-size: 26rpx;
  color: #374151;
  line-height: 1.45;
}

.section-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1d23;
  margin-bottom: 16rpx;
}

.rules {
  display: block;
  font-size: 26rpx;
  color: #4b5563;
  line-height: 1.7;
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
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.96);
  border-top: 1rpx solid #eef0f3;
}

.share {
  flex: 0 0 180rpx;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #0f766e;
  font-size: 28rpx;
  font-weight: 600;
  border-radius: 12rpx;
  border: 2rpx solid #0f766e;
}

.share::after {
  border: none;
}

.cta {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  margin: 0;
  background: #0f766e;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 12rpx;
  border: none;
}

.cta.disabled,
.cta[disabled] {
  background: #cbd5e1;
  color: #ffffff;
}

.cta::after {
  border: none;
}
</style>
