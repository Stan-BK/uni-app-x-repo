<template>
  <view class="page">
    <view class="identity card">
      <text class="section-title">账号</text>
      <text class="line">状态：{{ user.isLoggedIn ? "已登录" : "未登录" }}</text>
      <text class="line">昵称：{{ user.me?.nickname || "-" }}</text>
      <text class="line">组织者：{{ user.publishStatusLabel }}</text>
      <text v-if="identityMsg" class="msg">{{ identityMsg }}</text>

      <view class="btn-row">
        <button
          v-if="!user.isLoggedIn"
          class="primary"
          size="mini"
          :loading="busy"
          @click="onLogin"
        >
          登录
        </button>
        <template v-else>
          <button class="ghost" size="mini" :disabled="busy" @click="onLogout">
            退出
          </button>
          <button
            class="ghost"
            size="mini"
            :disabled="busy"
            @click="onRefresh"
          >
            刷新状态
          </button>
          <button
            v-if="user.canApplyOrganizer"
            class="primary"
            size="mini"
            :disabled="busy"
            @click="onApply"
          >
            申请组织者
          </button>
          <button
            v-if="user.publishStatus === 'pending'"
            class="ghost"
            size="mini"
            disabled
          >
            审核中
          </button>
          <button
            v-if="user.canPublish"
            class="primary"
            size="mini"
            @click="goOrganizer"
          >
            发布活动
          </button>
          <button
            v-if="user.canPublish"
            class="ghost"
            size="mini"
            @click="goOrganizerMine"
          >
            我的活动
          </button>
        </template>
      </view>
    </view>

    <text class="section-title block">我的报名</text>
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state empty">
      <text class="empty-title">还没有报名记录</text>
      <text class="empty-desc">去首页看看近期活动吧</text>
      <button class="empty-btn" @click="goHome">浏览活动</button>
    </view>
    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-top">
          <text class="title">{{ item.activityTitle }}</text>
          <text class="status" :class="item.status">{{ item.statusLabel }}</text>
        </view>
        <view class="meta">
          <text>报名人：{{ item.name }}</text>
          <text>手机：{{ item.phone }}</text>
          <text>提交时间：{{ item.createdAt }}</text>
        </view>
        <view class="actions">
          <text class="link" @click="goDetail(item.activityId)">查看活动</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { listRegistrations, type Registration } from "@/mocks/activities";
import { useUserStore } from "@/stores/user";

const user = useUserStore();
const loading = ref(true);
const items = ref<Registration[]>([]);
const busy = ref(false);
const identityMsg = ref("");

function loadRegistrations() {
  loading.value = true;
  setTimeout(() => {
    items.value = listRegistrations();
    loading.value = false;
  }, 150);
}

async function withBusy(fn: () => Promise<void>) {
  busy.value = true;
  identityMsg.value = "";
  try {
    await fn();
  } catch (e) {
    identityMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function onLogin() {
  await withBusy(async () => {
    await user.login();
    identityMsg.value = user.canPublish
      ? "登录成功，已具备发布权限"
      : "登录成功";
  });
}

async function onApply() {
  await withBusy(async () => {
    const org = await user.applyOrganizer("MP Dev Club", "我的页申请");
    identityMsg.value = `申请已提交：${org.publishStatus}`;
  });
}

async function onRefresh() {
  await withBusy(async () => {
    await user.refreshIdentity();
    identityMsg.value = `已刷新：${user.publishStatusLabel}`;
  });
}

function onLogout() {
  user.logout();
  identityMsg.value = "已退出";
}

function goOrganizer() {
  uni.navigateTo({ url: "/pages/organizer/create" });
}

function goOrganizerMine() {
  uni.navigateTo({ url: "/pages/organizer/list" });
}

function goHome() {
  uni.switchTab({ url: "/pages/home/index" });
}

function goDetail(activityId: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${activityId}` });
}

onMounted(() => {
  loadRegistrations();
});

onShow(() => {
  loadRegistrations();
  if (user.isLoggedIn) {
    void user.refreshIdentity().catch(() => {
      /* 网络失败时保留本地态 */
    });
  }
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx 24rpx 48rpx;
  box-sizing: border-box;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1d23;
  margin-bottom: 12rpx;
}

.section-title.block {
  display: block;
  margin: 8rpx 0 16rpx;
}

.identity .line {
  display: block;
  font-size: 24rpx;
  color: #4b5563;
  margin-bottom: 8rpx;
}

.msg {
  display: block;
  font-size: 24rpx;
  color: #b45309;
  margin: 8rpx 0;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}

button.primary {
  background: #0f766e;
  color: #fff;
}

button.ghost {
  background: #e5e7eb;
  color: #111827;
}

button::after {
  border: none;
}

.state {
  padding: 80rpx 0;
  text-align: center;
  color: #8a9099;
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
  color: #1a1d23;
  font-weight: 600;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #9ca3af;
  margin-bottom: 40rpx;
}

.empty-btn {
  width: 280rpx;
  height: 80rpx;
  line-height: 80rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 28rpx;
  border-radius: 12rpx;
  border: none;
}

.empty-btn::after {
  border: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.title {
  flex: 1;
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1d23;
  line-height: 1.35;
}

.status {
  flex-shrink: 0;
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  color: #b45309;
  background: #fffbeb;
}

.status.confirmed {
  color: #0f766e;
  background: #ecfdf5;
}

.status.cancelled {
  color: #6b7280;
  background: #f3f4f6;
}

.status.waitlist {
  color: #1e3a5f;
  background: #eff6ff;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  font-size: 24rpx;
  color: #6b7280;
  margin-bottom: 20rpx;
}

.actions {
  border-top: 1rpx solid #f0f1f3;
  padding-top: 20rpx;
}

.link {
  font-size: 26rpx;
  color: #0f766e;
}
</style>
