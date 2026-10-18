<template>
  <view class="page">
    <view class="card">
      <text class="title">发布活动</text>
      <text class="desc">
        你已具备发布权限。活动创建 / 草稿 / 提交审核将在 P0-2 活动域接入服务端；本页先占位，避免无入口。
      </text>
      <view class="field">
        <text class="label">活动标题（本地草稿）</text>
        <input v-model="title" class="input" placeholder="例如：周末城市徒步" />
      </view>
      <button class="primary" :disabled="!title.trim()" @click="saveDraft">
        保存本地草稿
      </button>
      <text v-if="msg" class="msg">{{ msg }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/stores/user";

const user = useUserStore();
const title = ref("");
const msg = ref("");

const DRAFT_KEY = "organizer_activity_drafts";

function saveDraft() {
  if (!user.canPublish) {
    msg.value = "无发布权限";
    return;
  }
  const raw = uni.getStorageSync(DRAFT_KEY);
  const list = Array.isArray(raw) ? raw : [];
  list.unshift({
    id: `local-${Date.now()}`,
    title: title.value.trim(),
    status: "draft",
    createdAt: new Date().toISOString(),
  });
  uni.setStorageSync(DRAFT_KEY, list.slice(0, 20));
  msg.value = "已保存到本机草稿，可在「我的活动」查看";
  title.value = "";
}

onShow(() => {
  if (!user.isLoggedIn) {
    uni.showToast({ title: "请先登录", icon: "none" });
    return;
  }
  void user.refreshIdentity().then(() => {
    if (!user.canPublish) {
      uni.showToast({ title: "暂无发布权限", icon: "none" });
    }
  });
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f4f5f7;
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.desc {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 28rpx;
}
.field {
  margin-bottom: 24rpx;
}
.label {
  display: block;
  font-size: 26rpx;
  margin-bottom: 8rpx;
}
.input {
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
}
button.primary {
  background: #0f766e;
  color: #fff;
}
button::after {
  border: none;
}
button[disabled] {
  opacity: 0.5;
}
.msg {
  display: block;
  margin-top: 16rpx;
  color: #0f766e;
  font-size: 24rpx;
}
</style>
