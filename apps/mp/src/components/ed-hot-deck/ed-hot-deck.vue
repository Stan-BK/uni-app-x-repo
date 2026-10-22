<template>
  <view class="hot">
    <text class="hot-title">热门活动</text>
    <view
      class="deck"
      @touchstart="onPointerStart"
      @touchend="onPointerEnd"
      @mousedown="onMouseDown"
      @mouseup="onMouseUp"
    >
      <view
        v-for="(card, i) in deck"
        :key="card.key"
        class="slide"
        :class="slotClass(i)"
        @click="onTap(card, i)"
      >
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
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
const startX = ref(0);
const swiping = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const deck = computed<HotCard[]>(() =>
  props.items.slice(0, 3).map((item) => ({
    key: item.id,
    id: item.id,
    title: item.title || "活动",
    coverUrl: item.coverUrl?.trim() || undefined,
  })),
);

function offsetOf(index: number) {
  const n = deck.value.length;
  let delta = (index - current.value) % n;
  if (delta > n / 2) delta -= n;
  if (delta < -n / 2) delta += n;
  return delta;
}

function slotClass(index: number) {
  const delta = offsetOf(index);
  if (delta === 0) return "is-front";
  if (delta === 1) return "is-next";
  return "is-prev";
}

function step(dir: 1 | -1) {
  const n = deck.value.length;
  current.value = (current.value + dir + n) % n;
}

function pointerX(e: {
  changedTouches?: { clientX: number }[];
  clientX?: number;
}) {
  return e.changedTouches?.[0]?.clientX ?? e.clientX ?? 0;
}

function onPointerStart(e: {
  changedTouches?: { clientX: number }[];
  clientX?: number;
}) {
  startX.value = pointerX(e);
  swiping.value = false;
  stopAuto();
}

function onPointerEnd(e: {
  changedTouches?: { clientX: number }[];
  clientX?: number;
}) {
  const dx = pointerX(e) - startX.value;
  if (Math.abs(dx) >= 40) {
    swiping.value = true;
    step(dx < 0 ? 1 : -1);
  }
  startAuto();
}

function onMouseDown(e: { clientX?: number }) {
  onPointerStart(e);
}

function onMouseUp(e: { clientX?: number }) {
  onPointerEnd(e);
}

function onTap(card: HotCard, index: number) {
  if (swiping.value) return;
  if (offsetOf(index) !== 0) {
    current.value = index;
    return;
  }
  emit("select", card.id);
}

function startAuto() {
  stopAuto();
  timer = setInterval(() => step(1), 4200);
}

function stopAuto() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(
  () => props.items.map((item) => item.id).join(","),
  () => {
    current.value = 0;
  },
);

onMounted(() => startAuto());
onUnmounted(() => stopAuto());
</script>

<style scoped lang="scss">
.hot {
  margin: 0 0 28rpx;
}

.hot-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  margin-bottom: 8rpx;
}

.deck {
  position: relative;
  height: 400rpx;
}

.slide {
  position: absolute;
  left: 50%;
  top: 20rpx;
  width: 460rpx;
  height: 340rpx;
  margin-left: -230rpx;
  border-radius: $ed-radius-card;
  overflow: hidden;
  box-shadow: 0 16rpx 36rpx rgba(36, 49, 45, 0.16);
  transition: transform 0.38s cubic-bezier(0.22, 0.61, 0.36, 1);
  transform-origin: center center;
}

.slide.is-front {
  transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
  z-index: 3;
}

.slide.is-next {
  transform: translate3d(96rpx, 6rpx, 0) rotate(3.5deg) scale(0.94);
  z-index: 2;
}

.slide.is-prev {
  transform: translate3d(-96rpx, 6rpx, 0) rotate(-3.5deg) scale(0.94);
  z-index: 1;
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
  right: 28rpx;
  bottom: 24rpx;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
