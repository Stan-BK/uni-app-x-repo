<template>
  <view class="page page-l2">
    <view v-if="!activityId" class="state">缺少活动 ID</view>
    <template v-else>
      <view class="card summary">
        <view class="summary-item">
          <text class="summary-num summary-num--ok">{{ checkedInCount }}</text>
          <text class="summary-label">已签到</text>
        </view>
        <view class="summary-divider" />
        <view class="summary-item">
          <text class="summary-num">{{ notCheckedInCount }}</text>
          <text class="summary-label">未签到</text>
        </view>
      </view>

      <view v-if="ended" class="notice">活动已结束，仅可查看签到名单</view>

      <view class="tabs">
        <view
          v-for="t in TABS"
          :key="t.key"
          class="tab"
          :class="{ 'tab--active': tab === t.key }"
          @click="switchTab(t.key)"
        >
          <text>{{ t.label }}</text>
        </view>
      </view>

      <view v-if="tab === 'scan'" class="card scan-card">
        <text class="scan-title">扫描参与者签到码</text>
        <text class="scan-desc">
          请参与者在「我的报名」中打开签到码，点击下方按钮扫码核销。可连续扫码。
        </text>
        <button
          class="ed-btn scan-btn"
          hover-class="none"
          :disabled="ended || scanning"
          @click="onScan"
        >
          {{ scanning ? "处理中…" : "扫码签到" }}
        </button>
        <view v-if="lastResult" class="last-result">
          <text class="last-name">{{ lastResult.name }}</text>
          <text class="last-meta">
            {{ lastResult.alreadyCheckedIn ? "已签到过" : "签到成功" }} ·
            {{ formatTime(lastResult.checkedInAt) }}
          </text>
        </view>
      </view>

      <view v-else>
        <view v-if="listLoading && !items.length" class="state">加载中…</view>
        <view v-else-if="!items.length" class="empty card">
          <text class="empty-title">{{
            tab === "unchecked" ? "暂无未签到" : "暂无已签到"
          }}</text>
          <text class="empty-desc">{{
            tab === "unchecked" ? "已确认报名的人都已签到。" : "还没有人完成签到。"
          }}</text>
        </view>
        <view v-else class="list">
          <view v-for="item in items" :key="item.id" class="card">
            <view class="card-top">
              <image
                v-if="personAvatar(item)"
                class="avatar"
                :src="personAvatar(item)"
                mode="aspectFill"
              />
              <view v-else class="avatar avatar-fallback">
                <view class="avatar-head" />
                <view class="avatar-body" />
              </view>
              <view class="card-meta">
                <text class="name">{{ personName(item) }}</text>
                <text v-if="weixinLine(item)" class="meta">{{
                  weixinLine(item)
                }}</text>
                <text class="meta">手机：{{ item.phone || "—" }}</text>
                <text v-if="tab === 'checked'" class="meta">
                  签到时间：{{ formatTime(item.checkedInAt) }}
                </text>
              </view>
              <button
                v-if="tab === 'unchecked'"
                class="ed-btn-secondary row-btn"
                hover-class="none"
                :disabled="ended || actingId === item.id"
                @click="onManual(item)"
              >
                标记到场
              </button>
            </view>
          </view>

          <view v-if="hasMore" class="more" @click="loadMore">
            <text>{{ listLoading ? "加载中…" : "加载更多" }}</text>
          </view>
          <view v-else class="more muted">
            <text>没有更多了</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { getActivity, type Activity } from "@/api/activities";
import {
  checkInManual,
  checkInWithToken,
  listOrganizerRegistrations,
  type CheckInResult,
  type Registration,
} from "@/api/registrations";
import { scanQrCode } from "@/adapters/scan";
import { effectiveLifecycle } from "@/utils/activity-lifecycle";
import {
  displayRegistrationName,
  registrationWeixinSubtitle,
} from "@/utils/registration-display";
import { showApiErrorToast } from "@/utils/request";

type TabKey = "scan" | "unchecked" | "checked";

const TABS: { key: TabKey; label: string }[] = [
  { key: "scan", label: "扫码" },
  { key: "unchecked", label: "未签到" },
  { key: "checked", label: "已签到" },
];

const pageSize = 20;

const activityId = ref("");
const activity = ref<Activity | null>(null);
const tab = ref<TabKey>("scan");
const checkedInCount = ref(0);
const notCheckedInCount = ref(0);

const items = ref<Registration[]>([]);
const total = ref(0);
const page = ref(1);
const listLoading = ref(false);
const actingId = ref("");
const scanning = ref(false);
const lastResult = ref<CheckInResult | null>(null);

const ended = computed(() =>
  activity.value ? effectiveLifecycle(activity.value) === "ended" : false,
);
const hasMore = computed(() => items.value.length < total.value);

function personName(item: Registration) {
  return displayRegistrationName(item);
}

function weixinLine(item: Registration) {
  return registrationWeixinSubtitle(item);
}

function personAvatar(item: Registration) {
  return item.avatarUrl?.trim() || "";
}

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

async function loadActivity() {
  try {
    activity.value = await getActivity(activityId.value);
  } catch (e) {
    showApiErrorToast(e, "加载活动失败");
  }
}

/** 拉取当前 tab 对应名单；同时刷新头部计数。 */
async function loadList(opts: { reset?: boolean } = {}) {
  if (!activityId.value || tab.value === "scan") return;
  if (listLoading.value) return;
  const reset = opts.reset === true;
  const requestPage = reset ? 1 : page.value + 1;
  const requestTab = tab.value;
  listLoading.value = true;
  try {
    const res = await listOrganizerRegistrations(activityId.value, {
      page: requestPage,
      pageSize,
      status: "confirmed",
      checkedIn: requestTab === "checked",
    });
    if (tab.value !== requestTab) return;
    const next = res.items ?? [];
    items.value = reset ? next : [...items.value, ...next];
    total.value = res.total ?? items.value.length;
    page.value = requestPage;
    checkedInCount.value = res.checkedInCount ?? checkedInCount.value;
    notCheckedInCount.value = res.notCheckedInCount ?? notCheckedInCount.value;
  } catch (e) {
    if (reset && tab.value === requestTab) {
      items.value = [];
      total.value = 0;
      page.value = 1;
    }
    showApiErrorToast(e, "加载失败");
  } finally {
    listLoading.value = false;
  }
}

/** 扫码 tab 无列表，仅刷新计数（pageSize=1 取 count）。 */
async function refreshCounts() {
  if (!activityId.value) return;
  try {
    const res = await listOrganizerRegistrations(activityId.value, {
      page: 1,
      pageSize: 1,
      status: "confirmed",
      checkedIn: false,
    });
    checkedInCount.value = res.checkedInCount ?? 0;
    notCheckedInCount.value = res.notCheckedInCount ?? 0;
  } catch {
    /* 计数刷新失败不打断主流程 */
  }
}

async function refresh() {
  if (tab.value === "scan") await refreshCounts();
  else await loadList({ reset: true });
}

function switchTab(next: TabKey) {
  if (tab.value === next) return;
  tab.value = next;
  items.value = [];
  total.value = 0;
  page.value = 1;
  if (next !== "scan") void loadList({ reset: true });
}

function loadMore() {
  if (!hasMore.value || listLoading.value) return;
  void loadList();
}

function isUserCancel(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { cancelled?: boolean; errMsg?: string; message?: string };
  return (
    err.cancelled === true ||
    /cancel/i.test(err.errMsg ?? "") ||
    /cancel/i.test(err.message ?? "")
  );
}

async function onScan() {
  if (ended.value || scanning.value || !activityId.value) return;
  scanning.value = true;
  try {
    const token = await scanQrCode();
    if (!token) {
      uni.showToast({ title: "未识别到签到码", icon: "none" });
      return;
    }
    const res = await checkInWithToken(activityId.value, token);
    lastResult.value = res;
    uni.showToast({
      title: `${res.name} ${res.alreadyCheckedIn ? "已签到" : "签到成功"}`,
      icon: res.alreadyCheckedIn ? "none" : "success",
    });
    await refresh();
  } catch (e) {
    if (isUserCancel(e)) return;
    showApiErrorToast(e, "签到失败");
  } finally {
    scanning.value = false;
  }
}

async function onManual(item: Registration) {
  if (ended.value || actingId.value || !activityId.value) return;
  const name = personName(item);
  const modal = await uni.showModal({
    title: "标记到场",
    content: `确认将「${name}」标记为已到场？签到后不可撤销。`,
  });
  if (!modal.confirm) return;
  actingId.value = item.id;
  try {
    const res = await checkInManual(activityId.value, item.id);
    uni.showToast({
      title: res.alreadyCheckedIn ? `${res.name} 已签到` : `${res.name} 签到成功`,
      icon: res.alreadyCheckedIn ? "none" : "success",
    });
    await refresh();
  } catch (e) {
    showApiErrorToast(e, "签到失败");
  } finally {
    actingId.value = "";
  }
}

onLoad((query) => {
  const id = String(query?.activityId ?? "").trim();
  activityId.value = id;
  if (!id) uni.showToast({ title: "缺少活动 ID", icon: "none" });
});

onShow(() => {
  if (!activityId.value) return;
  void loadActivity();
  void refresh();
});
</script>

<style scoped lang="scss">
.state,
.empty,
.list {
  margin-top: 24rpx;
}

.state {
  padding: 120rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  padding: $ed-space-card;
  margin-bottom: 20rpx;
}

.summary {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.summary-divider {
  width: 1rpx;
  height: 56rpx;
  background: $ed-color-border;
}

.summary-num {
  font-size: 48rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.summary-num--ok {
  color: $ed-color-brand;
}

.summary-label {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: $ed-color-text-muted;
}

.notice {
  margin-bottom: 20rpx;
  padding: 16rpx 24rpx;
  border-radius: $ed-radius-card;
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
  font-size: 24rpx;
  text-align: center;
}

.tabs {
  display: flex;
  margin-bottom: 20rpx;
  border-bottom: 1rpx solid $ed-color-border;
}

.tab {
  flex: 1;
  padding: 20rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: $ed-color-text-muted;
  border-bottom: 4rpx solid transparent;
}

.tab--active {
  color: $ed-color-brand;
  font-weight: 600;
  border-bottom-color: $ed-color-brand;
}

.scan-card {
  text-align: center;
}

.scan-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 8rpx;
}

.scan-desc {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-muted;
  line-height: 1.6;
  margin-bottom: 28rpx;
}

.scan-btn {
  margin: 0;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0;
  font-size: 30rpx;
  font-weight: 600;
}

.last-result {
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid $ed-color-border;
}

.last-name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: $ed-color-text;
}

.last-meta {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.empty {
  text-align: center;
}

.empty-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 8rpx;
}

.empty-desc {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-muted;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $ed-color-brand-soft;
  border: 1rpx solid $ed-color-border;
  box-sizing: border-box;
}

.avatar-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
}

.avatar-head {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 6rpx;
}

.avatar-body {
  width: 52rpx;
  height: 22rpx;
  border-radius: 26rpx 26rpx 0 0;
  background: $ed-color-brand;
}

.card-meta {
  flex: 1;
  min-width: 0;
}

.name {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: $ed-color-text;
  margin-bottom: 6rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: block;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  line-height: 1.5;
}

.row-btn {
  flex-shrink: 0;
  margin: 0;
  padding: 0 28rpx;
  height: 64rpx;
  line-height: 64rpx;
  font-size: 26rpx;
}

.more {
  padding: 24rpx 0 40rpx;
  text-align: center;
  font-size: 26rpx;
  color: $ed-color-brand;
}

.more.muted {
  color: $ed-color-text-muted;
}

button[disabled] {
  opacity: 0.5;
}
</style>
