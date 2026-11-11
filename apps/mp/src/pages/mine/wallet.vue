<template>
  <view class="page page-l2">
    <view class="summary card">
      <view
        class="summary-main"
        hover-class="none"
        @click="selectTab('ledger')"
      >
        <text class="summary-label">可用余额</text>
        <view class="summary-amount">
          <text class="summary-currency">¥</text>
          <text class="summary-figure">{{ availableDisplay }}</text>
        </view>
      </view>
      <view
        class="summary-side"
        hover-class="none"
        @click="selectTab('pending')"
      >
        <text class="summary-label">待结算</text>
        <text class="summary-pending">{{ pendingDisplay }}</text>
      </view>
    </view>

    <view class="tabs">
      <text
        class="tab"
        :class="{ active: activeTab === 'ledger' }"
        @click="selectTab('ledger')"
      >
        余额明细
      </text>
      <text
        class="tab"
        :class="{ active: activeTab === 'pending' }"
        @click="selectTab('pending')"
      >
        待结算
      </text>
    </view>

    <view v-if="activeTab === 'ledger'">
      <view v-if="ledgerLoading && !ledgerLoaded" class="state">加载中…</view>
      <view v-else-if="ledgerError && !ledgerLoaded" class="state empty">
        <text class="empty-title">{{ ledgerError }}</text>
        <button class="ed-btn" hover-class="none" @click="loadLedger">
          重试
        </button>
      </view>
      <view v-else-if="!ledgerItems.length" class="state empty">
        <text class="empty-title">暂无流水</text>
      </view>
      <view v-else class="list">
        <view
          v-for="item in ledgerItems"
          :key="item.id"
          class="row card"
          hover-class="none"
          @click="goActivity(item.activityId)"
        >
          <view class="row-main">
            <text class="row-title">{{ item.title }}</text>
            <text class="row-meta">{{ ledgerTypeLabel(item.type) }}</text>
            <text class="row-meta last">{{ formatTime(item.createdAt) }}</text>
          </view>
          <text
            class="row-amount"
            :class="{ credit: item.availableDeltaCents > 0 }"
          >
            {{ formatSignedYuan(item.availableDeltaCents) }}
          </text>
        </view>
      </view>
    </view>

    <view v-else>
      <view v-if="pendingLoading && !pendingLoaded" class="state">加载中…</view>
      <view v-else-if="pendingError && !pendingLoaded" class="state empty">
        <text class="empty-title">{{ pendingError }}</text>
        <button class="ed-btn" hover-class="none" @click="loadPending">
          重试
        </button>
      </view>
      <view v-else-if="!pendingItems.length" class="state empty">
        <text class="empty-title">暂无待结算活动</text>
      </view>
      <view v-else class="list">
        <view
          v-for="item in pendingItems"
          :key="item.activityId"
          class="row card"
          hover-class="none"
          @click="goActivity(item.activityId)"
        >
          <view class="row-main">
            <text class="row-title">{{ item.title }}</text>
            <text class="row-meta last">{{ formatTime(item.endAt) }}</text>
          </view>
          <text class="row-amount credit">
            ¥{{ formatYuan(item.pendingCents) }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { LEDGER_ENTRY_TYPE_LABEL } from "@activity/shared";
import {
  getWallet,
  getWalletLedger,
  getWalletPending,
  type WalletLedgerItem,
  type WalletPendingItem,
} from "@/api/wallet";
import { ApiError } from "@/utils/request";

type WalletTab = "ledger" | "pending";

const PAGE_SIZE = 50;

const activeTab = ref<WalletTab>("ledger");
const availableDisplay = ref("--");
const pendingDisplay = ref("--");

const ledgerItems = ref<WalletLedgerItem[]>([]);
const ledgerLoading = ref(false);
const ledgerLoaded = ref(false);
const ledgerError = ref("");

const pendingItems = ref<WalletPendingItem[]>([]);
const pendingLoading = ref(false);
const pendingLoaded = ref(false);
const pendingError = ref("");

let summaryGen = 0;
let ledgerGen = 0;
let pendingGen = 0;

function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatSignedYuan(cents: number): string {
  const yuan = formatYuan(Math.abs(cents));
  if (cents > 0) return `+¥${yuan}`;
  if (cents < 0) return `-¥${yuan}`;
  return `¥${yuan}`;
}

function ledgerTypeLabel(type: string): string {
  return (
    LEDGER_ENTRY_TYPE_LABEL[type as keyof typeof LEDGER_ENTRY_TYPE_LABEL] ??
    type
  );
}

function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
  return err instanceof Error ? err.message : "请求失败";
}

function clearSummaryDisplay() {
  availableDisplay.value = "--";
  pendingDisplay.value = "--";
}

async function loadSummary() {
  summaryGen += 1;
  const gen = summaryGen;
  clearSummaryDisplay();
  try {
    const wallet = await getWallet();
    if (gen !== summaryGen) return;
    availableDisplay.value = formatYuan(wallet.availableCents);
    pendingDisplay.value = formatYuan(wallet.pendingCents);
  } catch {
    if (gen !== summaryGen) return;
    clearSummaryDisplay();
  }
}

async function loadLedger() {
  ledgerGen += 1;
  const gen = ledgerGen;
  ledgerLoading.value = true;
  ledgerError.value = "";
  try {
    const res = await getWalletLedger({ page: 1, pageSize: PAGE_SIZE });
    if (gen !== ledgerGen) return;
    ledgerItems.value = res.items ?? [];
    ledgerLoaded.value = true;
  } catch (e) {
    if (gen !== ledgerGen) return;
    ledgerError.value = errMessage(e);
    if (!ledgerLoaded.value) ledgerItems.value = [];
  } finally {
    if (gen === ledgerGen) ledgerLoading.value = false;
  }
}

async function loadPending() {
  pendingGen += 1;
  const gen = pendingGen;
  pendingLoading.value = true;
  pendingError.value = "";
  try {
    const res = await getWalletPending({ page: 1, pageSize: PAGE_SIZE });
    if (gen !== pendingGen) return;
    pendingItems.value = res.items ?? [];
    pendingLoaded.value = true;
  } catch (e) {
    if (gen !== pendingGen) return;
    pendingError.value = errMessage(e);
    if (!pendingLoaded.value) pendingItems.value = [];
  } finally {
    if (gen === pendingGen) pendingLoading.value = false;
  }
}

function ensureTabLoaded(tab: WalletTab) {
  if (tab === "ledger") {
    if (!ledgerLoaded.value && !ledgerLoading.value) void loadLedger();
    return;
  }
  if (!pendingLoaded.value && !pendingLoading.value) void loadPending();
}

function selectTab(tab: WalletTab) {
  activeTab.value = tab;
  ensureTabLoaded(tab);
}

function goActivity(activityId: string | null | undefined) {
  if (!activityId) return;
  uni.navigateTo({
    url: `/pages/activity/detail?id=${encodeURIComponent(activityId)}`,
  });
}

onLoad((query) => {
  const tab = String(query?.tab ?? "").trim();
  activeTab.value = tab === "pending" ? "pending" : "ledger";
  void loadSummary();
  ensureTabLoaded(activeTab.value);
});
</script>

<style scoped lang="scss">
.summary {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 16rpx;
  padding: $ed-space-card;
}

.summary-main {
  flex: 1;
  min-width: 0;
}

.summary-label {
  display: block;
  font-size: 22rpx;
  color: $ed-color-text-secondary;
}

.summary-amount {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
  color: $ed-color-text;
}

.summary-currency {
  margin-right: 4rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.summary-figure {
  font-size: 56rpx;
  font-weight: 700;
  line-height: 1;
}

.summary-side {
  text-align: right;
  flex-shrink: 0;
  padding-left: 24rpx;
}

.summary-pending {
  display: block;
  margin-top: 10rpx;
  font-size: 32rpx;
  font-weight: 700;
  color: $ed-color-brand;
}

.tabs {
  display: flex;
  gap: 16rpx;
  margin: 24rpx 0 8rpx;
}

.tab {
  font-size: 26rpx;
  color: $ed-color-text-secondary;
  padding: 10rpx 20rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-surface;
}

.tab.active {
  color: $ed-color-brand-strong;
  background: $ed-color-brand-soft;
  font-weight: 600;
}

.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 16rpx;
}

.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: $ed-space-card;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.4;
  margin-bottom: 8rpx;
}

.row-meta {
  display: block;
  font-size: 22rpx;
  color: $ed-color-text-secondary;
  margin-bottom: 6rpx;
}

.row-meta.last {
  margin-bottom: 0;
}

.row-amount {
  flex-shrink: 0;
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.4;
}

.row-amount.credit {
  color: $ed-color-brand;
}

.state {
  padding: 80rpx 0;
  text-align: center;
  color: $ed-color-text-muted;
  font-size: 28rpx;
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
  margin-bottom: 24rpx;
}

.empty .ed-btn {
  width: auto;
  margin: 0;
}
</style>
