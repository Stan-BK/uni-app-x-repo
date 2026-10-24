<template>
  <view class="page page-l1">
    <EdLeafDeco />
    <view
      class="profile card"
      hover-class="none"
      @click="onProfileTap"
    >
      <image
        v-if="user.me?.avatarUrl"
        class="avatar"
        :src="user.me.avatarUrl"
        mode="aspectFill"
      />
      <view v-else class="avatar avatar-fallback">
        <view class="avatar-head" />
        <view class="avatar-body" />
      </view>
      <view class="profile-meta">
        <text class="nickname">{{
          user.isLoggedIn ? user.me?.nickname || "微信用户" : "未登录"
        }}</text>
        <text class="profile-sub">{{
          user.isLoggedIn ? "微信账号" : "点击登录微信账号"
        }}</text>
        <text
          v-if="user.isLoggedIn && user.me && !user.canPublish"
          class="msg"
        >发布权限已关闭</text>
      </view>
    </view>
    <view v-if="user.isLoggedIn" class="entry-row">
      <view class="entry entry-secondary" hover-class="none" @click="goOrganizerMine">
        <view class="ico ico-list" />
        <text>我的活动</text>
      </view>
      <view class="entry entry-primary" hover-class="none" @click="goProfile">
        <view class="ico ico-person" />
        <text>我的信息</text>
      </view>
    </view>

    <text class="section-title block">我的报名</text>
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!user.isLoggedIn" class="state empty">
      <text class="empty-title">登录后查看报名</text>
      <text class="empty-desc">点击上方头像区域，使用微信账号登录</text>
    </view>
    <view v-else-if="!items.length" class="state empty">
      <text class="empty-title">还没有报名记录</text>
      <text class="empty-desc">去首页看看近期活动吧</text>
      <button class="ed-btn" @click="goHome">浏览活动</button>
    </view>
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
            class="card reg-card"
            @click="goDetail(item)"
          >
            <image
              v-if="coverSrc(item)"
              class="cover-img"
              :src="coverSrc(item)"
              mode="aspectFill"
              @error="onCoverError(item.id)"
            />
            <view v-else class="cover cover-placeholder">
              <text class="cover-label">活动</text>
            </view>
            <view class="body">
              <view class="title">{{ item.activity?.title || "活动" }}</view>
              <view class="row-tags">
                <text
                  class="status ed-tag"
                  :class="statusTagClass(item.status)"
                >{{ statusLabel(item.status) }}</text>
              </view>
              <text class="meta">{{ item.activity?.place || "—" }}</text>
              <text class="meta last">{{ formatTime(item.activity?.startAt) }}</text>
              <view v-if="canPay(item) || canCancel(item)" class="actions">
                <button
                  v-if="canPay(item)"
                  class="pay-btn ed-btn"
                  hover-class="none"
                  :loading="payingId === item.id"
                  :disabled="payingId === item.id"
                  @click.stop="onPay(item)"
                >
                  去支付
                </button>
                <text
                  v-if="canCancel(item)"
                  class="ed-btn-link"
                  @click.stop="onCancel(item)"
                >取消报名</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
    <EdTabBar />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import EdTabBar from "@/components/ed-tab-bar/ed-tab-bar.vue";
import EdLeafDeco from "@/components/ed-leaf-deco/ed-leaf-deco.vue";
import {
  cancelRegistration,
  createRegistration,
  listMyRegistrations,
  type Registration,
} from "@/api/registrations";
import { useUserStore } from "@/stores/user";
import {
  isRegistrationPaymentConfirmed,
  launchWechatRegistrationPay,
  syncAfterPaymentSheet,
} from "@/utils/registration-payment";
import { ApiError } from "@/utils/request";

const STATUS_LABEL: Record<string, string> = {
  pending: "待确认",
  pending_payment: "待支付",
  confirmed: "已确认",
  cancelled: "已取消",
  waitlist: "候补中",
};

const user = useUserStore();
const loading = ref(true);
const items = ref<Registration[]>([]);
const busy = ref(false);
const payingId = ref("");
const brokenCovers = ref<Record<string, boolean>>({});
const masonryCols = computed(() => {
  const cols: [Registration[], Registration[]] = [[], []];
  items.value.forEach((item, index) => {
    cols[index % 2].push(item);
  });
  return cols;
});

function coverSrc(item: Registration) {
  const url = item.activity?.coverUrl?.trim() ?? "";
  if (!url || brokenCovers.value[item.id]) return "";
  return url;
}

function onCoverError(id: string) {
  brokenCovers.value = { ...brokenCovers.value, [id]: true };
}

function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

function statusTagClass(status: string) {
  if (status === "confirmed") return "ed-tag-confirmed";
  if (status === "pending_payment") return "ed-tag-pending";
  if (status === "pending") return "ed-tag-pending";
  if (status === "waitlist") return "ed-tag-waitlist";
  if (status === "cancelled") return "ed-tag-muted";
  return "ed-tag-muted";
}

function canPay(item: Registration): boolean {
  return item.status === "pending_payment" && activityNotEnded(item);
}

function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function activityNotEnded(item: Registration): boolean {
  const a = item.activity;
  if (!a) return false;
  if (a.displayStatus !== "ended") return true;
  if (a.endAt && new Date(a.endAt).getTime() > Date.now()) return true;
  return false;
}

function canCancel(item: Registration): boolean {
  if (item.status !== "confirmed" || !activityNotEnded(item)) return false;
  return item.activity?.allowUserCancel !== false;
}

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
  return err instanceof Error ? err.message : "请求失败";
}

async function loadRegistrations() {
  if (!user.isLoggedIn) {
    items.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const res = await listMyRegistrations({ pageSize: 50 });
    items.value = res.items ?? [];
  } catch (e) {
    items.value = [];
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    loading.value = false;
  }
}

async function onPay(item: Registration) {
  if (payingId.value) return;
  payingId.value = item.id;
  try {
    const result = await createRegistration({
      activityId: item.activityId,
      name: item.name,
      phone: item.phone,
    });
    if (
      isRegistrationPaymentConfirmed({
        status: result.status,
        paymentStatus: result.paymentStatus,
      })
    ) {
      uni.showToast({ title: "支付成功", icon: "success" });
      await loadRegistrations();
      return;
    }
    if (!result.pay) {
      uni.showToast({ title: "暂无法拉起支付", icon: "none" });
      return;
    }
    await launchWechatRegistrationPay(result.pay);
    try {
      const synced = await syncAfterPaymentSheet(result.id);
      if (
        isRegistrationPaymentConfirmed({
          status: synced.status,
          paymentStatus: synced.paymentStatus,
        })
      ) {
        uni.showToast({ title: "支付成功", icon: "success" });
        await loadRegistrations();
        return;
      }
    } catch (syncErr) {
      uni.showToast({ title: errMessage(syncErr), icon: "none" });
    }
    uni.showToast({ title: "待支付", icon: "none" });
    await loadRegistrations();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  } finally {
    payingId.value = "";
  }
}

async function onCancel(item: Registration) {
  const res = await uni.showModal({
    title: "取消报名",
    content: "确定取消该活动报名？",
  });
  if (!res.confirm) return;
  try {
    await cancelRegistration(item.id);
    uni.showToast({ title: "已取消", icon: "none" });
    await loadRegistrations();
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  }
}

async function onLogin() {
  if (busy.value) return;
  busy.value = true;
  try {
    await user.login();
    uni.showToast({ title: "登录成功", icon: "none" });
    await loadRegistrations();
  } catch (e) {
    uni.showToast({
      title: e instanceof Error ? e.message : "登录失败",
      icon: "none",
    });
  } finally {
    busy.value = false;
  }
}

function onProfileTap() {
  if (!user.isLoggedIn) void onLogin();
}

function goOrganizerMine() {
  uni.navigateTo({ url: "/pages/organizer/list" });
}

function goProfile() {
  uni.navigateTo({ url: "/pages/mine/profile" });
}

function goHome() {
  uni.switchTab({ url: "/pages/home/index" });
}

function goDetail(item: Registration) {
  const activityId = item.activity?.id || item.activityId;
  if (!activityId) {
    uni.showToast({ title: "活动不存在", icon: "none" });
    return;
  }
  uni.navigateTo({
    url: `/pages/activity/detail?id=${encodeURIComponent(activityId)}`,
  });
}

onMounted(() => {
  void loadRegistrations();
});

onShow(() => {
  void loadRegistrations();
  if (user.isLoggedIn) {
    void user.refreshIdentity().catch(() => {
      /* 网络失败时保留本地态 */
    });
  }
});
</script>

<style scoped lang="scss">
.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  margin-bottom: 12rpx;
}

.section-title.block {
  display: block;
  margin: 8rpx 0 16rpx;
}

.profile {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-bottom: 20rpx;
}

.avatar {
  width: 112rpx;
  height: 112rpx;
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
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 8rpx;
}

.avatar-body {
  width: 64rpx;
  height: 28rpx;
  border-radius: 32rpx 32rpx 0 0;
  background: $ed-color-brand;
}

.profile-meta {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}

.msg {
  display: block;
  font-size: 24rpx;
  color: $ed-color-terracotta;
  margin-top: 8rpx;
}

.entry-row {
  display: flex;
  gap: 16rpx;
  margin: 0 0 24rpx;
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

.ico {
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
}

.ico-list,
.ico-person {
  width: 32rpx;
  height: 32rpx;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.ico-list {
  -webkit-mask-image: url("/static/ico/person-list.png");
  mask-image: url("/static/ico/person-list.png");
}

.ico-person {
  -webkit-mask-image: url("/static/ico/person.svg");
  mask-image: url("/static/ico/person.svg");
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
  padding-top: 80rpx;
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
}

.profile.card {
  padding: $ed-space-card;
}

.reg-card {
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

.title {
  font-size: 26rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 10rpx;
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.status {
  flex-shrink: 0;
}

.meta {
  display: block;
  font-size: 22rpx;
  color: $ed-color-text-secondary;
  margin-bottom: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta.last {
  margin-bottom: 0;
}

.actions {
  border-top: 1rpx solid $ed-color-border;
  margin-top: 16rpx;
  padding-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.pay-btn {
  width: 100%;
  margin: 0;
  font-size: 26rpx;
  font-weight: 600;
}

.pay-btn::after {
  border: none;
}
</style>
