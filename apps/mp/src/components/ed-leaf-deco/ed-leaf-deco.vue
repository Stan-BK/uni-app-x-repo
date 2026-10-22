<template>
  <view class="ed-leaf-deco" aria-hidden="true">
    <view class="ed-leaf-deco__green" />
    <view class="ed-leaf-deco__peach" />
  </view>
</template>

<style lang="scss" scoped>
.ed-leaf-deco__green,
.ed-leaf-deco__peach {
  position: fixed;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: 100% 100%;
  pointer-events: none;
  z-index: -1;
}

.ed-leaf-deco__green {
  left: -48rpx;
  bottom: 20rpx;
  width: 320rpx;
  height: 320rpx;
  background-image: url("/static/deco-leaves.svg");
}

.ed-leaf-deco__peach {
  top: 140rpx;
  right: 0;
  width: 98rpx;
  height: 100rpx;
  background-image: url("/static/deco-leaves-peach.svg");
  background-position: 100% 0;
}
</style>
