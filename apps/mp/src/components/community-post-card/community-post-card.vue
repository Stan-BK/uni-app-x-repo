<template>
  <view class="post card" @click="emit('open', post.id)">
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
        @click.stop="previewImage(index)"
      />
    </view>

    <view v-if="post.activities.length" class="tags">
      <text
        v-for="act in post.activities"
        :key="act.id"
        class="ed-tag ed-tag-open tag"
        @click.stop="emit('open-activity', act.id)"
      >{{ act.title }}</text>
    </view>

    <view class="foot">
      <view class="foot-item" hover-class="none" @click.stop="emit('open', post.id)">
        <text class="foot-label">赞 {{ post.likeCount }}</text>
      </view>
      <view class="foot-item" hover-class="none" @click.stop="emit('open', post.id)">
        <text class="foot-label">评论 {{ post.commentCount }}</text>
      </view>
      <button
        class="foot-item share-btn"
        open-type="share"
        hover-class="none"
        :data-id="post.id"
        @click.stop
      >
        <text class="foot-label">分享</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CommunityPost } from "@/api/community";
import { formatPostTime } from "@/utils/community";

const props = defineProps<{ post: CommunityPost }>();
const emit = defineEmits<{
  (e: "open", id: string): void;
  (e: "open-activity", id: string): void;
}>();

function previewImage(current: number) {
  uni.previewImage({
    urls: props.post.images.map((i) => i.url),
    current,
  });
}
</script>

<style lang="scss" scoped>
.card {
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  box-shadow: 0 2rpx 8rpx rgba(36, 49, 45, 0.06);
  padding: $ed-space-card;
  margin-bottom: 24rpx;
}

.head {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.avatar {
  width: 72rpx;
  height: 72rpx;
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
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  background: $ed-color-brand;
  margin-bottom: 4rpx;
}

.avatar-body {
  width: 42rpx;
  height: 18rpx;
  border-radius: 21rpx 21rpx 0 0;
  background: $ed-color-brand;
}

.head-meta {
  flex: 1;
  min-width: 0;
}

.nickname {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.body {
  display: block;
  font-size: 28rpx;
  line-height: 1.6;
  color: $ed-color-text;
  word-break: break-all;
  white-space: pre-wrap;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.img {
  width: 190rpx;
  height: 190rpx;
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.images.is-single .img {
  width: 400rpx;
  height: 300rpx;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foot {
  display: flex;
  align-items: center;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $ed-color-border;
}

.foot-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  margin: 0;
  padding: 0;
  height: 56rpx;
  line-height: 56rpx;
  border-radius: 0;
}

.share-btn::after {
  border: none;
}

.foot-label {
  font-size: 24rpx;
  color: $ed-color-text-secondary;
}
</style>
