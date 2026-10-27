<template>
  <view class="hot">
    <view class="hot-head">
      <image
        class="hot-banner"
        src="/static/ico/hot-title.png"
        mode="heightFix"
      />
    </view>
    <view class="stage">
      <swiper
        class="deck"
        circular
        autoplay
        :interval="4200"
        @change="onChange"
      >
        <swiper-item v-for="card in deck" :key="card.key">
          <view class="slide" hover-class="none" @click="onTap(card)">
            <image
              v-if="card.coverUrl"
              class="slide-cover"
              :src="card.coverUrl"
              mode="aspectFill"
            />
            <view v-else class="slide-cover slide-fallback" />
            <view class="slide-mask" />
            <text class="slide-title">{{ card.title }}</text>
          </view>
        </swiper-item>
      </swiper>
      <view class="dots">
        <view
          v-for="(card, i) in deck"
          :key="`${card.key}-dot`"
          class="dot"
          :class="dotClass(i)"
        />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PublicActivity } from "@/api/public-activities";

type HotCard = {
  key: string;
  id: string;
  title: string;
  coverUrl?: string;
};

const props = defineProps<{ items: PublicActivity[] }>();
const emit = defineEmits<{
  select: [id: string];
}>();

const current = ref(0);

const deck = computed<HotCard[]>(() =>
  props.items.slice(0, 3).map((item) => ({
    key: item.id,
    id: item.id,
    title: item.title || "活动",
    coverUrl: item.coverUrl?.trim() || undefined,
  })),
);

function onChange(e: { detail: { current: number } }) {
  current.value = e.detail.current;
}

function onTap(card: HotCard) {
  emit("select", card.id);
}

function dotClass(index: number) {
  const dist = Math.abs(index - current.value);
  if (dist === 0) return "is-main";
  if (dist === 1) return "is-near";
  return "is-far";
}

watch(
  () => props.items.map((item) => item.id).join(","),
  () => {
    current.value = 0;
  },
);
</script>

<style scoped lang="scss">
.hot {
  margin: 0 0 28rpx;
}

.hot-head {
  margin: 0 0 8rpx;
}

.hot-banner {
  height: 120rpx;
  display: block;
}

.stage {
  position: relative;
  border-radius: $ed-radius-card;
  overflow: hidden;
}

.deck {
  width: 100%;
  height: 400rpx;
}

.slide {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.slide-cover {
  width: 100%;
  height: 100%;
  display: block;
  background: $ed-color-brand;
}

.slide-fallback {
  background: $ed-color-brand;
}

.slide-mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 160rpx;
  background: linear-gradient(
    180deg,
    rgba(36, 49, 45, 0) 0%,
    rgba(36, 49, 45, 0.72) 100%
  );
}

.slide-title {
  position: absolute;
  left: 28rpx;
  right: 120rpx;
  bottom: 24rpx;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dots {
  position: absolute;
  right: 24rpx;
  bottom: 24rpx;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12rpx;
  pointer-events: none;
}

.dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #ffffff;
  opacity: 0.22;
  transform: scale(0.33);
  transition:
    transform 0.28s ease,
    opacity 0.28s ease;
}

.dot.is-near {
  opacity: 0.45;
  transform: scale(0.66);
}

.dot.is-main {
  opacity: 1;
  transform: scale(1);
}
</style>
