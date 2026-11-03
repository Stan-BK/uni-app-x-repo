<template>
  <view class="page page-l2">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="needLogin" class="state empty">
      <text class="empty-title">登录后查看动态</text>
      <button class="ed-btn" @click="onLogin">登录微信账号</button>
    </view>
    <view v-else-if="errorText" class="state empty">
      <text class="empty-title">{{ deleted ? "动态已删除" : "加载失败" }}</text>
      <text class="empty-desc">{{ errorText }}</text>
      <button class="ed-btn" @click="goCommunity">回到社区</button>
    </view>
    <template v-else-if="post">
      <view class="card">
        <view class="head">
          <image
            v-if="post.author.avatarUrl"
            class="avatar"
            :src="post.author.avatarUrl"
            mode="aspectFill"
          />
          <view v-else class="avatar avatar-fallback">
            <view class="avatar-head" />
            <view class="avatar-body" />
          </view>
          <view class="head-meta">
            <text class="nickname">{{ post.author.nickname }}</text>
            <text class="time">{{ formatPostTime(post.createdAt) }}</text>
          </view>
        </view>

        <text v-if="post.body" class="body">{{ post.body }}</text>

        <view
          v-if="post.images.length"
          class="images"
          :class="{ 'is-single': post.images.length === 1 }"
        >
          <image
            v-for="(img, index) in post.images"
            :key="`${img.url}-${index}`"
            class="img"
            :src="img.url"
            mode="aspectFill"
            @click="previewImage(index)"
          />
        </view>

        <view v-if="post.activities.length" class="tags">
          <text
            v-for="act in post.activities"
            :key="act.id"
            class="ed-tag ed-tag-open tag"
            @click="goActivity(act.id)"
          >{{ act.title }}</text>
        </view>
      </view>

      <view class="card engage">
        <text class="engage-text">互动功能即将开放</text>
      </view>

      <view class="actions">
        <button class="ed-btn share" open-type="share" hover-class="none">分享给好友</button>
        <text v-if="isAuthor" class="ed-btn-link del" @click="onDelete">删除动态</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import { getPostShareMessage } from "@/adapters/share";
import {
  deleteCommunityPost,
  getCommunityPost,
  type CommunityPost,
} from "@/api/community";
import { useUserStore } from "@/stores/user";
import { formatPostTime } from "@/utils/community";
import { ApiError } from "@/utils/request";

const user = useUserStore();
const postId = ref("");
const post = ref<CommunityPost | null>(null);
const loading = ref(true);
const needLogin = ref(false);
const errorText = ref("");
const deleted = ref(false);

const isAuthor = computed(
  () => Boolean(post.value && user.me && user.me.id === post.value.author.id),
);

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message || "请求失败";
  return err instanceof Error ? err.message : "请求失败";
}

async function load() {
  if (!postId.value) {
    loading.value = false;
    errorText.value = "缺少动态参数";
    return;
  }
  // 登录闸：接口需 JWT，分享进入的游客先走登录
  if (!user.isLoggedIn) {
    loading.value = false;
    needLogin.value = true;
    await user.promptLogin("登录后即可查看社区动态");
    if (!user.isLoggedIn) return;
  }
  needLogin.value = false;
  // 再次 onShow（如预览图返回）时保留已有内容，避免闪烁
  loading.value = !post.value;
  errorText.value = "";
  deleted.value = false;
  try {
    if (!user.me) await user.refreshIdentity().catch(() => undefined);
    post.value = await getCommunityPost(postId.value);
  } catch (e) {
    post.value = null;
    if (e instanceof ApiError && e.status === 401) {
      user.logout();
      needLogin.value = true;
    } else {
      deleted.value = e instanceof ApiError && e.status === 404;
      errorText.value = deleted.value
        ? "该动态已被删除或不存在"
        : errMessage(e);
    }
  } finally {
    loading.value = false;
  }
}

async function onLogin() {
  await user.promptLogin("登录后即可查看社区动态");
  if (user.isLoggedIn) await load();
}

function previewImage(current: number) {
  if (!post.value) return;
  uni.previewImage({ urls: post.value.images.map((i) => i.url), current });
}

function goActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${encodeURIComponent(id)}` });
}

function goCommunity() {
  uni.switchTab({ url: "/pages/community/index" });
}

async function onDelete() {
  if (!post.value) return;
  const res = await uni.showModal({
    title: "删除动态",
    content: "删除后无法恢复，确定删除？",
    confirmText: "删除",
  });
  if (!res.confirm) return;
  try {
    await deleteCommunityPost(post.value.id);
    uni.showToast({ title: "已删除", icon: "none" });
    setTimeout(() => {
      uni.navigateBack({ fail: goCommunity });
    }, 500);
  } catch (e) {
    uni.showToast({ title: errMessage(e), icon: "none" });
  }
}

onLoad((query) => {
  postId.value = String(query?.id ?? "");
});

onShow(() => {
  void load();
});

onShareAppMessage(() => {
  if (!post.value) return { title: "社区", path: "/pages/community/index" };
  return getPostShareMessage(post.value);
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

.head {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $ed-color-brand-soft;
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
  margin-bottom: 4rpx;
}

.avatar-body {
  width: 50rpx;
  height: 22rpx;
  border-radius: 25rpx 25rpx 0 0;
  background: $ed-color-brand;
}

.head-meta {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $ed-color-text;
}

.time {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.body {
  display: block;
  font-size: 30rpx;
  line-height: 1.7;
  color: $ed-color-text;
  word-break: break-all;
  white-space: pre-wrap;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;
}

.img {
  width: 190rpx;
  height: 190rpx;
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.images.is-single .img {
  width: 500rpx;
  height: 380rpx;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;
}

.tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.engage {
  text-align: center;
}

.engage-text {
  font-size: 26rpx;
  color: $ed-color-text-muted;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  margin-top: 40rpx;
}

.share {
  width: 100%;
  margin: 0;
  font-weight: 600;
}

.del {
  color: $ed-color-terracotta;
}

.state {
  padding: 120rpx 0;
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
</style>
