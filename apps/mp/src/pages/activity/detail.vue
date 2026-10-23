<template>
  <view class="page page-l2 page-detail">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="errorMessage" class="state">{{ errorMessage }}</view>
    <template v-else-if="activity">
      <view class="hero">
        <image
          v-if="activity.coverUrl"
          class="hero-img"
          :src="activity.coverUrl"
          mode="aspectFill"
        />
        <view v-else class="hero-img hero-placeholder" />
        <view class="hero-scrim" />
        <view class="hero-body">
          <text class="hero-title">{{ activity.title }}</text>
          <view class="hero-tags">
            <text class="hero-tag">{{ displayLabel }}</text>
            <text class="hero-tag">{{ feeLabel }}</text>
            <text v-if="showQuotaHint" class="hero-tag hero-tag-accent">名额有限</text>
          </view>
        </view>
      </view>

      <view class="panel">
        <view class="meta-row">
          <view class="ed-ico ed-ico-calendar" />
          <text class="meta-label">时间</text>
          <text class="meta-value">{{
            formatTimeRange(activity.startAt, activity.endAt)
          }}</text>
        </view>
        <view class="meta-row">
          <view class="ed-ico ed-ico-pin" />
          <text class="meta-label">地点</text>
          <text class="meta-value">{{ activity.place || "—" }}</text>
        </view>
      </view>

      <view class="panel">
        <view class="section-head">
          <image
            class="section-ico"
            src="/static/ico/people-title.png"
            mode="aspectFit"
          />
          <text class="section-title">活动人员</text>
          <text class="attendees-quota"
            >{{ confirmedCount }}/{{ activity.capacity }}</text
          >
        </view>
        <view class="people-row">
          <scroll-view
            class="attendees-scroll"
            scroll-x
            :show-scrollbar="false"
            enable-flex
            @scroll="onAttendeesScroll"
          >
            <view class="attendees">
              <view
                v-for="(person, index) in attendees"
                :key="`${person.nickname}-${index}`"
                class="attendee"
              >
                <image
                  v-if="person.avatarUrl"
                  class="attendee-avatar"
                  :src="person.avatarUrl"
                  mode="aspectFill"
                />
                <view v-else class="attendee-avatar attendee-fallback">
                  <view class="attendee-head" />
                  <view class="attendee-body" />
                </view>
                <text class="attendee-name">{{ person.nickname }}</text>
              </view>
              <view
                v-if="showRegisterSlot"
                class="attendee"
                hover-class="none"
                @click.stop="onCta"
              >
                <view class="attendee-plus">+</view>
              </view>
            </view>
          </scroll-view>
          <view
            v-if="attendeesFadeStart"
            class="attendees-fade attendees-fade-start"
          />
          <view
            v-if="attendeesFadeEnd && attendees.length > 3"
            class="attendees-fade attendees-fade-end"
          />
          <image
            v-if="remainingSeats > 0"
            class="people-invite"
            src="/static/invite-more.png"
            mode="aspectFit"
          />
        </view>
      </view>

      <view class="panel panel-details">
        <image
          class="panel-deco"
          src="/static/deco-leaves-pair.svg"
          mode="aspectFit"
        />
        <view class="section-head">
          <view class="ed-ico ed-ico-doc" />
          <text class="section-title">活动详情</text>
        </view>
        <text v-if="activity.rules" class="rules">{{ activity.rules }}</text>
        <view class="meta-row">
          <view class="ed-ico ed-ico-clock" />
          <text class="meta-label">报名截止</text>
          <text class="meta-value">{{
            formatDateTime(activity.registrationDeadlineAt ?? activity.startAt)
          }}</text>
        </view>
        <view class="meta-row">
          <view class="ed-ico ed-ico-person" />
          <text class="meta-label">主办</text>
          <text class="meta-value">{{ activity.hostName }}</text>
        </view>
        <view class="meta-row">
          <view class="ed-ico ed-ico-shield" />
          <text class="meta-label">取消政策</text>
          <text class="meta-value">{{
            activity.allowUserCancel === false
              ? "报名后不可取消"
              : "允许用户取消报名"
          }}</text>
        </view>
        <view class="meta-row">
          <view class="ed-ico ed-ico-yen" />
          <text class="meta-label">退款政策</text>
          <text class="meta-value">{{
            activity.refundable ? "可退款（支付上线后生效）" : "不可退款"
          }}</text>
        </view>
      </view>

      <view class="cta-bar">
        <!-- 微信：open-type=share；H5：走适配层 Web Share / 复制链接 -->
        <!-- #ifdef MP-WEIXIN -->
        <button
          v-if="canShare"
          class="share ed-btn-secondary"
          hover-class="none"
          open-type="share"
        >
          <view class="ed-ico ed-ico-share" />
          <text>分享</text>
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button
          v-if="canShare"
          class="share ed-btn-secondary"
          hover-class="none"
          @click="onShare"
        >
          <view class="ed-ico ed-ico-share" />
          <text>分享</text>
        </button>
        <!-- #endif -->
        <button
          class="cta ed-btn"
          hover-class="none"
          :class="{ disabled: !canRegister, withShare: canShare }"
          :disabled="!canRegister"
          @click="onCta"
        >
          <view v-if="alreadyRegistered" class="ed-ico ed-ico-check ed-ico-on-cta" />
          <text>{{ ctaText }}</text>
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
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
import { useUserStore } from "@/stores/user";
import { ApiError, getUserToken } from "@/utils/request";

const user = useUserStore();
const ctaActing = ref(false);

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

const attendees = computed(() => activity.value?.attendees ?? []);

const confirmedCount = computed(() => activity.value?.confirmedCount ?? 0);

const remainingSeats = computed(() => {
  const cap = activity.value?.capacity ?? 0;
  return Math.max(0, cap - confirmedCount.value);
});

const showQuotaHint = computed(
  () => remainingSeats.value > 0 && (activity.value?.capacity ?? 0) > 0,
);

const attendeesFadeStart = ref(false);
const attendeesFadeEnd = ref(true);
let attendeesNativeEl: HTMLElement | null = null;

function syncAttendeesFade(
  scrollLeft: number,
  clientWidth?: number,
  scrollWidth?: number,
) {
  attendeesFadeStart.value = scrollLeft > 12;
  if (clientWidth && scrollWidth) {
    attendeesFadeEnd.value = scrollLeft + clientWidth < scrollWidth - 8;
  } else {
    attendeesFadeEnd.value = true;
  }
}

function onAttendeesScroll(e: {
  detail?: { scrollLeft?: number; scrollWidth?: number };
}) {
  syncAttendeesFade(Number(e.detail?.scrollLeft ?? 0), undefined, e.detail?.scrollWidth);
}

function onAttendeesNativeScroll() {
  if (!attendeesNativeEl) return;
  syncAttendeesFade(
    attendeesNativeEl.scrollLeft,
    attendeesNativeEl.clientWidth,
    attendeesNativeEl.scrollWidth,
  );
}

function bindAttendeesNativeScroll() {
  unbindAttendeesNativeScroll();
  // #ifdef H5
  const root = document.querySelector(".attendees-scroll");
  const scroller = (root?.querySelector(".uni-scroll-view") ??
    root) as HTMLElement | null;
  if (!scroller) return;
  attendeesNativeEl = scroller;
  scroller.addEventListener("scroll", onAttendeesNativeScroll, {
    passive: true,
  });
  onAttendeesNativeScroll();
  // #endif
}

function unbindAttendeesNativeScroll() {
  attendeesNativeEl?.removeEventListener("scroll", onAttendeesNativeScroll);
  attendeesNativeEl = null;
}

onMounted(() => {
  nextTick(() => bindAttendeesNativeScroll());
});
onBeforeUnmount(unbindAttendeesNativeScroll);

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

const canRegister = computed(() => {
  const a = activity.value;
  if (!a) return false;
  if (alreadyRegistered.value) return false;
  if (a.feeType === "paid") return false;
  return a.displayStatus === "open" || a.displayStatus === "upcoming";
});

const showRegisterSlot = computed(
  () => canRegister.value && remainingSeats.value > 0,
);

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
    nextTick(() => bindAttendeesNativeScroll());
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

async function refreshActivity(id: string) {
  try {
    activity.value = await getPublicActivity(id);
  } catch {
    // 保持已展示详情，避免返回页时整页闪错
  }
}

onShow(() => {
  // 从报名/取消返回时刷新「是否已报名」与已报名名单
  if (loadedActivityId.value && activity.value) {
    void loadMyRegistration(loadedActivityId.value);
    void refreshActivity(loadedActivityId.value);
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

async function onCta() {
  if (!activity.value || !canRegister.value || ctaActing.value) return;
  ctaActing.value = true;
  try {
    if (!(await user.promptLogin("登录后才能报名"))) return;
    uni.navigateTo({
      url: `/pages/register/index?activityId=${encodeURIComponent(activity.value.id)}`,
    });
  } finally {
    ctaActing.value = false;
  }
}
</script>

<style scoped lang="scss">
$ed-color-canvas: #f6f3ec !default;
$ed-color-surface: #fffefb !default;
$ed-color-text: #24312d !default;
$ed-color-text-secondary: #77837a !default;
$ed-color-text-muted: #929b92 !default;
$ed-color-brand: #1e9b88 !default;
$ed-color-brand-soft: #d4f3ec !default;
$ed-color-border: #e7e2d9 !default;
$ed-color-accent: #e56f3e !default;
$ed-space-page-x: 44rpx !default;
$ed-space-card: 32rpx !default;
$ed-radius-card: 32rpx !default;
$ed-radius-pill: 999rpx !default;

.state {
  padding: 160rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.page-detail {
  min-height: calc(100vh - var(--window-top, 0px));
  padding-top: 24rpx;
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
}

.hero {
  position: relative;
  height: 360rpx;
  border-radius: $ed-radius-card;
  overflow: hidden;
  background: $ed-color-brand;
}

.hero-img {
  width: 100%;
  height: 360rpx;
  display: block;
  background: $ed-color-border;
}

.hero-placeholder {
  background: $ed-color-brand;
}

.hero-scrim {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: linear-gradient(
    180deg,
    rgba(36, 49, 45, 0.08) 20%,
    rgba(36, 49, 45, 0.62) 100%
  );
}

.hero-body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28rpx 28rpx 24rpx;
}

.hero-title {
  display: block;
  max-width: 72%;
  color: #ffffff;
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.28;
  text-shadow: 0 2rpx 12rpx rgba(36, 49, 45, 0.35);
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 16rpx;
}

.hero-tag {
  display: inline-flex;
  align-items: center;
  height: 40rpx;
  padding: 0 16rpx;
  border-radius: $ed-radius-pill;
  background: rgba(30, 155, 136, 0.92);
  color: #ffffff;
  font-size: 20rpx;
  font-weight: 500;
}

.hero-tag-accent {
  background: rgba(255, 254, 251, 0.92);
  color: $ed-color-accent;
  box-shadow: inset 0 0 0 1rpx rgba(229, 111, 62, 0.4);
}

.panel {
  margin-top: 24rpx;
  padding: $ed-space-card;
  background: $ed-color-surface;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-card;
}

.panel-details {
  position: relative;
  overflow: hidden;
}

.panel-deco {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 35px;
  height: 35px;
  pointer-events: none;
  z-index: 1;
}

.ed-ico {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
  background-color: $ed-color-brand;
  -webkit-mask-image: var(--ico);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-image: var(--ico);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.ed-ico-calendar {
  --ico: url("/static/ico/calendar.svg");
}

.ed-ico-pin {
  --ico: url("/static/ico/pin.svg");
}

.ed-ico-person {
  --ico: url("/static/ico/person.svg");
}

.ed-ico-doc {
  --ico: url("/static/ico/doc.svg");
}

.ed-ico-clock {
  --ico: url("/static/ico/clock.svg");
}

.ed-ico-shield {
  --ico: url("/static/ico/shield.svg");
}

.ed-ico-yen {
  --ico: url("/static/ico/yen.svg");
}

.ed-ico-share {
  --ico: url("/static/ico/share.svg");
}

.ed-ico-check {
  --ico: url("/static/ico/check.svg");
}

.ed-ico-on-cta {
  color: #ffffff;
}

.meta-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 16rpx 0;
}

.meta-row + .meta-row {
  border-top: 1rpx solid $ed-color-border;
}

.panel > .meta-row:first-child {
  padding-top: 0;
}

.panel > .meta-row:last-child {
  padding-bottom: 0;
}

.meta-label {
  width: 128rpx;
  flex-shrink: 0;
  font-size: 26rpx;
  color: $ed-color-text-secondary;
  line-height: 32rpx;
}

.meta-value {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: $ed-color-text;
  line-height: 1.45;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 18rpx;
}

.section-ico {
  width: 56rpx;
  height: 44rpx;
  flex-shrink: 0;
}

.section-title {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.3;
}

.attendees-quota {
  font-size: 24rpx;
  color: $ed-color-text-muted;
}

.people-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.attendees-scroll {
  flex: 1;
  min-width: 0;
  height: 140rpx;
  white-space: nowrap;
}

.attendees-scroll::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.attendees {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  height: 140rpx;
}

.attendee {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 132rpx;
  height: 140rpx;
  flex-shrink: 0;
}

.attendee-avatar,
.attendee-plus {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.attendee-avatar {
  background: $ed-color-brand-soft;
  border: 1rpx solid $ed-color-border;
  box-sizing: border-box;
}

.attendee-plus {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed $ed-color-border;
  color: $ed-color-text-muted;
  font-size: 36rpx;
  line-height: 1;
  box-sizing: border-box;
}

.attendee-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.attendee-head {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 6rpx;
}

.attendee-body {
  width: 52rpx;
  height: 22rpx;
  border-radius: 26rpx 26rpx 0 0;
  background: $ed-color-brand;
}

.attendee-name {
  margin-top: 8rpx;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-text;
  line-height: 1.3;
}

.attendees-fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 48rpx;
  pointer-events: none;
  z-index: 1;
}

.attendees-fade-start {
  left: 0;
  background: linear-gradient(
    to right,
    $ed-color-surface 0%,
    rgba(255, 254, 251, 0) 100%
  );
}

.attendees-fade-end {
  right: 168rpx;
  background: linear-gradient(
    to left,
    $ed-color-surface 0%,
    rgba(255, 254, 251, 0) 100%
  );
}

.people-invite {
  width: 160rpx;
  height: 140rpx;
  flex-shrink: 0;
}

.rules {
  display: block;
  font-size: 26rpx;
  color: $ed-color-text;
  line-height: 1.6;
  margin-bottom: 8rpx;
}

.cta-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
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
  gap: 8rpx;
}

.share {
  flex: 0 0 200rpx;
  width: 200rpx;
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
