<template>
  <view class="ed-page-bg" aria-hidden="true">
    <view class="ed-page-bg__wash" />
    <view class="ed-page-bg__grain" />
    <view class="ed-page-bg__sun" />
    <view class="ed-page-bg__sprig-mint" />
    <view class="ed-page-bg__sprig-peach" />
  </view>
</template>

<script setup lang="ts">
/**
 * 一级页背景（Urban Editorial v1.2）
 *
 * 分层（自下而上，全部 pointer-events: none）：
 *   wash  晨光：顶部米白提亮 + 右上橘粉日出光 + 左下薄荷冷光
 *   grain 纸感：200rpx 无缝颗粒，给纯色底一点纸张纤维
 *   sun   日出弧线：右上角细圆环 + 珠串弧，编辑部的“晨间”意象
 *   sprig 植物线稿：左下薄荷枝（被 Tab 栏裁切，像长进来的花枝）、右上橘粉小枝
 *
 * 装饰资源统一走 CSS background-image：uni-app 构建时会把 svg 内联成 base64，
 * 微信小程序与 H5 表现一致，也不占用 <image> 的布局尺寸。
 * 不使用 filter / mix-blend-mode，避免小程序端渲染差异。
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
  background-color: $ed-color-canvas;
}

.ed-page-bg__wash,
.ed-page-bg__grain {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* 晨光固定不随内容滚动：滚动时像透过同一扇窗的光 */
.ed-page-bg__wash {
  background-image: url("/static/deco/bg-wash.svg");
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: 100% 100%;
}

/* 纸感颗粒平铺 */
.ed-page-bg__grain {
  background-image: url("/static/deco/bg-grain.svg");
  background-repeat: repeat;
  background-size: 200rpx 200rpx;
  opacity: 0.55;
}

/* 日出弧线：从右上角探进来，被热门卡片压住一半 */
.ed-page-bg__sun {
  position: absolute;
  top: 30rpx;
  right: -210rpx;
  width: 600rpx;
  height: 600rpx;
  background-image: url("/static/deco/sun-rings.svg");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
}

/* 左下薄荷枝：从页脚长出来，被 Tab 栏与卡片遮挡一部分 */
.ed-page-bg__sprig-mint {
  position: absolute;
  left: -96rpx;
  bottom: 56rpx;
  width: 470rpx;
  height: 626rpx;
  background-image: url("/static/deco/sprig-mint.svg");
  background-repeat: no-repeat;
  background-position: 0 100%;
  background-size: 100% 100%;
  opacity: 0.8;
}

/* 右上橘粉小枝：给顶部留白一点生气 */
.ed-page-bg__sprig-peach {
  position: absolute;
  top: calc(
    #{$ed-nav-bar-height} + var(--status-bar-height, 0px) +
      env(safe-area-inset-top, 0px) + 16rpx
  );
  right: -14rpx;
  width: 236rpx;
  height: 292rpx;
  background-image: url("/static/deco/sprig-peach.svg");
  background-repeat: no-repeat;
  background-position: 100% 0;
  background-size: 100% 100%;
  opacity: 0.92;
}
</style>
