<template>
  <view class="page page-l2">
    <view v-if="phase === 'loading'" class="state">加载中…</view>

    <view v-else-if="phase === 'done'" class="card done">
      <view class="done-mark">✓</view>
      <text class="done-title">已签到</text>
      <text v-if="checkedInAt" class="done-time">{{ formatTime(checkedInAt) }}</text>
      <text v-if="activityTitle" class="activity-title">{{ activityTitle }}</text>
    </view>

    <view v-else-if="phase === 'unavailable'" class="card unavailable">
      <text class="empty-title">暂无法签到</text>
      <text class="empty-desc">{{ unavailableMessage }}</text>
    </view>

    <view v-else-if="phase === 'error'" class="card unavailable">
      <text class="empty-title">签到码获取失败</text>
      <text class="empty-desc">{{ errorMessage }}</text>
      <button class="ed-btn retry-btn" hover-class="none" @click="onManualRefresh">
        重试
      </button>
    </view>

    <view v-else class="card qr-card">
      <text v-if="activityTitle" class="activity-title">{{ activityTitle }}</text>
      <text class="qr-hint">请向组织者出示二维码完成签到</text>
      <view class="qr-box">
        <canvas
          canvas-id="check-in-qr"
          id="check-in-qr"
          class="qr-canvas"
          :style="{ width: QR_SIZE + 'px', height: QR_SIZE + 'px' }"
        />
      </view>
      <text class="countdown">{{ remainingSec }} 秒后自动刷新</text>
      <button
        class="ed-btn-secondary refresh-btn"
        hover-class="none"
        :disabled="refreshing"
        :loading="refreshing"
        @click="onManualRefresh"
      >
        立即刷新
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { CheckInErrorCode } from "@activity/shared";
import {
  issueCheckInToken,
  listMyRegistrations,
  type Registration,
} from "@/api/registrations";
import { drawQrToCanvas } from "@/utils/check-in-qr";
import { ApiError } from "@/utils/request";

type Phase = "loading" | "qr" | "done" | "unavailable" | "error";

const QR_SIZE = 240;

const registrationId = ref("");
const phase = ref<Phase>("loading");
const activityTitle = ref("");
const checkedInAt = ref<string | null>(null);
const unavailableMessage = ref("");
const errorMessage = ref("");
const remainingSec = ref(0);
const refreshing = ref(false);

let timer: ReturnType<typeof setInterval> | null = null;
let deadlineMs = 0;
let gen = 0;
let started = false;

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function activityNotEnded(item: Registration): boolean {
  const a = item.activity;
  if (!a) return true;
  if (a.displayStatus !== "ended") return true;
  if (a.endAt && new Date(a.endAt).getTime() > Date.now()) return true;
  return false;
}

function showDone(at?: string | null) {
  clearTimer();
  gen += 1;
  if (at) checkedInAt.value = at;
  phase.value = "done";
}

function showUnavailable(message: string) {
  clearTimer();
  gen += 1;
  unavailableMessage.value = message;
  phase.value = "unavailable";
}

function showError(message: string) {
  clearTimer();
  errorMessage.value = message;
  phase.value = "error";
}

async function findRegistration(): Promise<Registration | undefined> {
  try {
    const res = await listMyRegistrations({ pageSize: 50 });
    return (res.items ?? []).find((r) => r.id === registrationId.value);
  } catch {
    return undefined;
  }
}

function applyRegistration(reg: Registration): boolean {
  activityTitle.value = reg.activity?.title ?? "";
  if (reg.checkedInAt) {
    showDone(reg.checkedInAt);
    return true;
  }
  if (reg.status !== "confirmed") {
    showUnavailable("报名尚未确认，暂不能签到");
    return true;
  }
  if (!activityNotEnded(reg)) {
    showUnavailable("活动已结束，无法签到");
    return true;
  }
  return false;
}

async function renderQr(token: string) {
  phase.value = "qr";
  await nextTick();
  try {
    await drawQrToCanvas("check-in-qr", token, QR_SIZE);
  } catch {
    showError("二维码生成失败，请重试");
  }
}

function startCountdown() {
  clearTimer();
  tick();
  timer = setInterval(tick, 1000);
}

function tick() {
  const left = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
  remainingSec.value = left;
  if (left <= 0) {
    clearTimer();
    void fetchToken(true);
  }
}

async function handleIssueError(err: unknown) {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === CheckInErrorCode.AlreadyDone) {
    const reg = await findRegistration();
    if (reg?.activity?.title) activityTitle.value = reg.activity.title;
    showDone(reg?.checkedInAt ?? null);
    return;
  }
  if (
    code === CheckInErrorCode.NotAllowed ||
    code === CheckInErrorCode.Forbidden ||
    code === CheckInErrorCode.RegistrationNotFound
  ) {
    showUnavailable(
      (err instanceof ApiError && err.message) || "当前无法签到，活动可能已结束",
    );
    return;
  }
  showError(
    err instanceof Error && err.message ? err.message : "网络异常，请稍后重试",
  );
}

async function fetchToken(isRefresh = false) {
  const myGen = ++gen;
  refreshing.value = isRefresh;
  try {
    const res = await issueCheckInToken(registrationId.value);
    if (myGen !== gen) return;
    deadlineMs = Date.now() + Math.max(1, res.expiresInSec) * 1000;
    await renderQr(res.token);
    if (myGen !== gen || phase.value !== "qr") return;
    startCountdown();
  } catch (err) {
    if (myGen !== gen) return;
    await handleIssueError(err);
  } finally {
    if (myGen === gen) refreshing.value = false;
  }
}

async function init() {
  phase.value = "loading";
  const reg = await findRegistration();
  if (reg && applyRegistration(reg)) return;
  await fetchToken();
}

function onManualRefresh() {
  if (refreshing.value) return;
  clearTimer();
  void fetchToken(true);
}

onLoad((query) => {
  const id = typeof query?.registrationId === "string" ? query.registrationId : "";
  registrationId.value = decodeURIComponent(id);
  if (!registrationId.value) {
    showUnavailable("缺少报名信息");
    return;
  }
  started = true;
  void init();
});

onShow(() => {
  // 从后台/其他页返回时，倒计时按绝对时间恢复；已过期则立刻换码
  if (started && phase.value === "qr" && !timer) {
    if (deadlineMs - Date.now() <= 0) void fetchToken(true);
    else startCountdown();
  }
});

onHide(() => {
  clearTimer();
});

onUnload(() => {
  clearTimer();
  gen += 1;
});
</script>

<style scoped lang="scss">
.state {
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.card {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
}

.activity-title {
  font-size: 30rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.4;
}

.qr-hint {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.qr-box {
  margin: 32rpx 0 24rpx;
  padding: 16rpx;
  background: #ffffff;
  border: 1rpx solid $ed-color-border;
  border-radius: $ed-radius-card;
  line-height: 0;
}

.qr-canvas {
  display: block;
}

.countdown {
  font-size: 26rpx;
  color: $ed-color-brand;
  font-weight: 600;
}

.refresh-btn,
.retry-btn {
  width: 100%;
  margin: 32rpx 0 0;
}

.done {
  padding: 80rpx $ed-space-card;
}

.done-mark {
  width: 120rpx;
  height: 120rpx;
  line-height: 120rpx;
  border-radius: 50%;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
  font-size: 64rpx;
  font-weight: 700;
}

.done-title {
  margin-top: 24rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.done-time {
  margin: 12rpx 0 24rpx;
  font-size: 26rpx;
  color: $ed-color-text-secondary;
}

.unavailable {
  padding: 80rpx $ed-space-card;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: $ed-color-text-muted;
}
</style>
