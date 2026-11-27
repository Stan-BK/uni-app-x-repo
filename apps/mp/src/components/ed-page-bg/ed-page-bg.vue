<template>
  <view class="ed-page-bg" aria-hidden="true">
    <view class="ed-page-bg__wash" />
    <view class="ed-page-bg__grain" />
    <view class="ed-page-bg__hill-left" />
    <view class="ed-page-bg__hill-right" />
    <!-- 微信端本地 PNG 不走 CSS background-image，改用 image -->
    <image
      class="ed-page-bg__sun"
      src="/static/deco/bg-sun-rings.png"
      mode="aspectFit"
    />
    <image
      class="ed-page-bg__sprig-peach"
      src="/static/deco/bg-sprig-peach.png"
      mode="aspectFit"
    />
    <image
      class="ed-page-bg__sprig-mint"
      src="/static/deco/bg-sprig-mint.png"
      mode="aspectFit"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 一级页背景（按设计稿分层还原）
 *
 * 分层（自下而上，全部 pointer-events: none）：
 *   wash / grain / hill-*  CSS 渐变 + 纸感 SVG（内联 base64）
 *   sun / sprig-*          设计切图 PNG，用 <image> 以保证微信端可见
 */
</script>

<style lang="scss" scoped>
.ed-page-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background-color: #fcf4e9;
}

.ed-page-bg__wash,
.ed-page-bg__grain,
.ed-page-bg__hill-left,
.ed-page-bg__hill-right {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.ed-page-bg__wash {
  background-image:
    radial-gradient(
      ellipse 90% 55% at 100% -5%,
      rgba(253, 220, 186, 0.7) 0%,
      rgba(253, 232, 205, 0.28) 38%,
      transparent 68%
    ),
    radial-gradient(
      ellipse 75% 50% at -5% 105%,
      rgba(185, 214, 198, 0.55) 0%,
      rgba(210, 228, 216, 0.22) 42%,
      transparent 70%
    ),
    linear-gradient(180deg, #fff9f0 0%, #fcf4e9 42%, #f5f3ea 100%);
}

.ed-page-bg__grain {
  background-image: url("/static/deco/bg-grain.svg");
  background-repeat: repeat;
  background-size: 200rpx 200rpx;
  opacity: 0.4;
}

.ed-page-bg__hill-left {
  background-image: radial-gradient(
    ellipse 70% 42% at 8% 108%,
    rgba(176, 208, 190, 0.55) 0%,
    rgba(196, 220, 205, 0.28) 45%,
    transparent 72%
  );
}

.ed-page-bg__hill-right {
  background-image: radial-gradient(
    ellipse 58% 36% at 98% 112%,
    rgba(186, 214, 198, 0.42) 0%,
    rgba(210, 226, 214, 0.18) 48%,
    transparent 74%
  );
}

.ed-page-bg__sun {
  position: absolute;
  top: 0rpx;
  right: -20rpx;
  width: 520rpx;
  height: 520rpx;
  display: block;
  opacity: 0.95;
}

.ed-page-bg__sprig-peach {
  position: absolute;
  top: calc(
    #{$ed-nav-bar-height} + var(--status-bar-height, 0px) +
      env(safe-area-inset-top, 0px) - 0rpx
  );
  right: -80rpx;
  width: 260rpx;
  height: 220rpx;
  display: block;
  opacity: 0.6;
}

.ed-page-bg__sprig-mint {
  position: absolute;
  left: -180rpx;
  bottom: 40rpx;
  width: 360rpx;
  height: 300rpx;
  display: block;
  opacity: 0.7;
}
</style>
