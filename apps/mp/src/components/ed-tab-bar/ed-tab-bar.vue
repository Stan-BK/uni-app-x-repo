<template>
  <view class="ed-tab">
    <view class="ed-tab__bar" />
    <view class="ed-tab__row">
      <view
        v-for="(tab, index) in tabs"
        :key="tab.path"
        class="ed-tab__item"
        :class="{ 'is-on': selected === index }"
        hover-class="none"
        @click="onTap(index)"
      >
        <view v-if="selected === index" class="ed-tab__disc">
          <view class="ed-tab__halo">
            <view class="ed-tab__halo-ring" />
          </view>
          <view :class="['ed-tab__glyph', `is-${tab.icon}`]" />
        </view>
        <view v-else :class="['ed-tab__glyph', 'is-flat', `is-${tab.icon}`]" />
        <text class="ed-tab__label">{{ tab.text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";

type TabItem = {
  path: string;
  text: string;
  icon: "ticket" | "mine";
};

const tabs: TabItem[] = [
  { path: "/pages/home/index", text: "首页", icon: "ticket" },
  { path: "/pages/mine/registrations", text: "我的", icon: "mine" },
];

const selected = ref(0);

function syncSelected() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1] as { route?: string } | undefined;
  const route = current?.route ?? "";
  const index = tabs.findIndex((tab) => tab.path.replace(/^\//, "") === route);
  selected.value = index >= 0 ? index : 0;
  uni.hideTabBar({ animation: false });
}

function onTap(index: number) {
  if (index === selected.value) return;
  uni.switchTab({ url: tabs[index].path });
}

onShow(() => {
  syncSelected();
});
</script>

<style lang="scss" scoped>
.ed-tab {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  padding-top: 56rpx;
  pointer-events: none;
}

.ed-tab__bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(108rpx + env(safe-area-inset-bottom));
  background: $ed-color-surface;
  border-top: 1rpx solid $ed-color-border;
}

.ed-tab__row {
  position: relative;
  z-index: 1;
  display: flex;
  height: calc(108rpx + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: border-box;
  pointer-events: auto;
}

.ed-tab__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 10rpx;
  position: relative;
}

.ed-tab__disc {
  position: absolute;
  left: 50%;
  bottom: 36rpx;
  width: 112rpx;
  height: 112rpx;
  margin-left: -56rpx;
  border-radius: 50%;
  background: $ed-color-surface;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 只让超出 Tab 上沿的那一截露出细边和淡阴影 */
.ed-tab__halo {
  position: absolute;
  left: -16rpx;
  top: -16rpx;
  width: 144rpx;
  height: 56rpx;
  overflow: hidden;
  pointer-events: none;
}

.ed-tab__halo-ring {
  position: absolute;
  left: 16rpx;
  top: 16rpx;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  box-sizing: border-box;
  border: 2rpx solid $ed-color-border;
  box-shadow: 0 -6rpx 12rpx rgba(36, 49, 45, 0.06);
}

.ed-tab__label {
  font-size: 22rpx;
  line-height: 1.2;
  color: $ed-color-text-secondary;
}

.ed-tab__item.is-on .ed-tab__label {
  color: $ed-color-brand;
  font-weight: 600;
}

.ed-tab__glyph {
  color: $ed-color-text-secondary;
  position: relative;
  box-sizing: border-box;
}

.ed-tab__item.is-on .ed-tab__glyph {
  color: $ed-color-brand;
}

.ed-tab__glyph.is-ticket {
  width: 56rpx;
  height: 44rpx;
  border: 4rpx solid currentColor;
  border-radius: 10rpx;
}

.ed-tab__glyph.is-ticket::after {
  content: "";
  position: absolute;
  left: 8rpx;
  right: 8rpx;
  top: 14rpx;
  height: 4rpx;
  background: currentColor;
  border-radius: 2rpx;
}

.ed-tab__glyph.is-ticket::before {
  content: "";
  position: absolute;
  left: 12rpx;
  top: 6rpx;
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 14rpx 0 0 currentColor;
}

.ed-tab__glyph.is-mine {
  width: 48rpx;
  height: 52rpx;
  border: 4rpx solid currentColor;
  border-radius: 10rpx;
}

.ed-tab__glyph.is-mine::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 8rpx;
  width: 14rpx;
  height: 14rpx;
  margin-left: -7rpx;
  border: 3rpx solid currentColor;
  border-radius: 50%;
  box-sizing: border-box;
}

.ed-tab__glyph.is-mine::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 6rpx;
  width: 26rpx;
  height: 12rpx;
  margin-left: -13rpx;
  border: 3rpx solid currentColor;
  border-bottom: 0;
  border-radius: 14rpx 14rpx 0 0;
  box-sizing: border-box;
}

.ed-tab__glyph.is-flat.is-ticket {
  width: 48rpx;
  height: 38rpx;
  margin-bottom: 6rpx;
}

.ed-tab__glyph.is-flat.is-mine {
  width: 40rpx;
  height: 44rpx;
  margin-bottom: 6rpx;
}
</style>
