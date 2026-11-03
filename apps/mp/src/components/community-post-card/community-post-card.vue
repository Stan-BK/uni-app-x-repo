<template>
  <view class="post" hover-class="post-pressed" @click="emit('open', post.id)">
    <view class="post-deco" aria-hidden="true" />

    <view class="head">
      <view class="avatar-ring">
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
      </view>
      <view class="head-meta">
        <text class="nickname">{{ post.author.nickname }}</text>
        <text class="time">{{ formatPostTime(post.createdAt) }}</text>
      </view>
    </view>

    <view v-if="!post.images.length && post.body" class="quote-deco" aria-hidden="true">“</view>

    <text v-if="post.body" class="body" :class="{ 'is-clamped': clamped }">{{ post.body }}</text>
    <text v-if="clamped" class="expand" @click.stop="expanded = true">展开全文</text>

    <view v-if="post.images.length" class="images" :class="imageLayoutClass">
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
      <view
        v-for="act in post.activities"
        :key="act.id"
        class="tag"
        hover-class="tag-pressed"
        @click.stop="emit('open-activity', act.id)"
      >
        <EdIcon name="calendar" size="22rpx" />
        <text class="tag-text">{{ act.title }}</text>
      </view>
    </view>

    <view class="foot">
      <view
        class="act"
        :class="{ 'is-on': post.likedByMe }"
        hover-class="act-pressed"
        @click.stop="emit('open', post.id)"
      >
        <EdIcon :name="post.likedByMe ? 'like-active' : 'like'" size="30rpx" />
        <text class="act-label">{{ post.likeCount || "点赞" }}</text>
      </view>
      <view class="act" hover-class="act-pressed" @click.stop="emit('open', post.id)">
        <EdIcon name="comment" size="30rpx" />
        <text class="act-label">{{ post.commentCount || "评论" }}</text>
      </view>
      <button
        class="act act-share"
        open-type="share"
        hover-class="act-pressed"
        :data-id="post.id"
        @click.stop
      >
        <EdIcon name="share" size="30rpx" />
        <text class="act-label">分享</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { CommunityPost } from "@/api/community";
import EdIcon from "@/components/ed-icon/ed-icon.vue";
import { formatPostTime } from "@/utils/community";

const props = defineProps<{ post: CommunityPost }>();
const emit = defineEmits<{
  (e: "open", id: string): void;
  (e: "open-activity", id: string): void;
}>();

const COLLAPSE_LIMIT = 120;

const expanded = ref(false);

const isLong = computed(() => props.post.body.length > COLLAPSE_LIMIT);
const clamped = computed(() => isLong.value && !expanded.value);
const imageLayoutClass = computed(() => `count-${Math.min(props.post.images.length, 3)}`);

function previewImage(current: number) {
  uni.previewImage({
    urls: props.post.images.map((i) => i.url),
    current,
  });
}
</script>

<style lang="scss" scoped>
.post {
  position: relative;
  overflow: hidden;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  box-shadow: 0 2rpx 10rpx rgba(36, 49, 45, 0.05);
  padding: $ed-space-card;
  margin-bottom: 24rpx;
  transition: transform 0.2s $ed-motion-ease, box-shadow 0.2s $ed-motion-ease;
}

.post-pressed {
  transform: scale(0.994);
  box-shadow: 0 1rpx 6rpx rgba(36, 49, 45, 0.04);
}

/* 右上角淡青绿光晕，给纯白卡片一点编辑部氛围 */
.post-deco {
  position: absolute;
  top: -90rpx;
  right: -70rpx;
  width: 260rpx;
  height: 260rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(30, 155, 136, 0.12) 0%, rgba(30, 155, 136, 0) 68%);
  pointer-events: none;
}

.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 20rpx;
}

.avatar-ring {
  flex-shrink: 0;
  padding: 4rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, $ed-color-brand-soft, rgba(229, 111, 62, 0.22));
}

.avatar {
  display: block;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
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
  margin-top: 6rpx;
  font-size: 22rpx;
  color: $ed-color-text-muted;
}

.quote-deco {
  position: absolute;
  top: 118rpx;
  right: 26rpx;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 132rpx;
  line-height: 1;
  color: rgba(30, 155, 136, 0.09);
  pointer-events: none;
}

.body {
  position: relative;
  display: block;
  font-size: 29rpx;
  line-height: 1.65;
  color: $ed-color-text;
  word-break: break-all;
  white-space: pre-wrap;
}

.body.is-clamped {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.expand {
  display: inline-block;
  margin-top: 8rpx;
  padding: 4rpx 0;
  font-size: 24rpx;
  font-weight: 600;
  color: $ed-color-brand;
}

.images {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 22rpx;
}

.img {
  border-radius: $ed-radius-tag;
  background: $ed-color-border;
}

.images.count-1 .img {
  width: 100%;
  height: 400rpx;
  border-radius: 24rpx;
}

.images.count-2 .img {
  width: calc(50% - 6rpx);
  height: 300rpx;
}

.images.count-3 .img {
  width: calc(33.33% - 8rpx);
  height: 190rpx;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 22rpx;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  max-width: 100%;
  padding: 8rpx 18rpx;
  border-radius: $ed-radius-pill;
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.tag-pressed {
  background: #c4ece2;
}

.tag-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.4;
}

.foot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 24rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid $ed-color-border;
}

.act {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  height: 64rpx;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: $ed-radius-pill;
  background: transparent;
  line-height: 1;
  color: $ed-color-text-secondary;
  transition: background-color 0.2s $ed-motion-ease, color 0.2s $ed-motion-ease;
}

.act::after {
  border: none;
}

.act-pressed {
  background: $ed-color-canvas;
}

.act.is-on {
  color: $ed-color-brand-strong;
}

.act.is-on .act-label {
  font-weight: 600;
}

.act-label {
  font-size: 24rpx;
  color: currentColor;
}
</style>
