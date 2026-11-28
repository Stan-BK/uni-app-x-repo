<template>
  <view class="alc" @click="emit('click')">
    <image
      v-if="resolvedCover"
      class="alc-cover-img"
      :src="resolvedCover"
      mode="aspectFill"
      @error="onCoverError"
    />
    <view v-else class="alc-cover alc-cover-placeholder">
      <text class="alc-cover-label">活动</text>
    </view>

    <view class="alc-body">
      <text class="alc-title">{{ title }}</text>
      <view class="alc-meta-row">
        <EdIcon name="clock" size="24rpx" color="currentColor" />
        <text class="alc-meta-text">{{ timeText }}</text>
      </view>
      <view class="alc-meta-row">
        <EdIcon name="pin" size="24rpx" color="currentColor" />
        <text class="alc-meta-text alc-place">{{ place || "—" }}</text>
      </view>
      <view class="alc-foot">
        <slot name="foot" />
      </view>
    </view>

    <view v-if="hasActions" class="alc-actions" @click.stop>
      <slot name="actions" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch } from "vue";
import EdIcon from "@/components/ed-icon/ed-icon.vue";

const props = withDefaults(
  defineProps<{
    coverUrl?: string | null;
    title: string;
    timeText: string;
    place?: string | null;
    showActions?: boolean;
  }>(),
  { coverUrl: "", place: "", showActions: undefined },
);

const emit = defineEmits<{ click: [] }>();

const broken = ref(false);
const slots = useSlots();
// 条件操作调用方应传 :show-actions="..."，避免空 #actions 插槽预留第三列。
const hasActions = computed(
  () => props.showActions ?? typeof slots.actions === "function",
);

watch(
  () => props.coverUrl,
  () => {
    broken.value = false;
  },
);

const resolvedCover = computed(() => {
  const url = (props.coverUrl ?? "").trim();
  if (!url || broken.value) return "";
  return url;
});

function onCoverError() {
  broken.value = true;
}
</script>

<style scoped lang="scss">
/* $ed-* 由工程全局注入，与 home / community-post-card 一致，勿重复 @import */

.alc {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 20rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  box-shadow: 0 2rpx 8rpx rgba(36, 49, 45, 0.06);
  box-sizing: border-box;
}

.alc-cover-img,
.alc-cover {
  width: 168rpx;
  height: 168rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  overflow: hidden;
}

.alc-cover-img {
  display: block;
  background: $ed-color-border;
}

.alc-cover {
  display: flex;
  align-items: flex-end;
  padding: 12rpx;
  box-sizing: border-box;
}

.alc-cover-placeholder {
  background: $ed-color-brand;
}

.alc-cover-label {
  color: rgba(255, 255, 255, 0.92);
  font-size: 22rpx;
  letter-spacing: 2rpx;
}

.alc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.alc-title {
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alc-meta-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: $ed-color-text-secondary;
  min-width: 0;
}

.alc-meta-text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  line-height: 1.2;
}

.alc-place {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: auto;
  min-width: 0;
}

.alc-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 8rpx;
  max-width: 160rpx;
}
</style>
