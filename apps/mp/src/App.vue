<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
onLaunch(() => {
  console.log("App Launch");
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style lang="scss">
page {
  background-color: $ed-color-canvas;
  color: $ed-color-text;
}

.page-l1,
.page-l2 {
  min-height: 100vh;
  box-sizing: border-box;
  background: $ed-color-canvas;
  color: $ed-color-text;
}

.page-l1 {
  padding: 24rpx $ed-space-page-x 48rpx;
}

.page-l2 {
  padding: 0 $ed-space-page-x 48rpx;
}

.ed-btn,
.ed-btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 28rpx;
  border-radius: $ed-radius-pill;
  border: none;
  padding: 0 32rpx;
}

.ed-btn {
  background: $ed-color-brand;
  color: #ffffff;
}

.ed-btn-secondary {
  background: $ed-color-btn-secondary;
  color: $ed-color-text;
}

.ed-btn-link {
  background: transparent;
  color: $ed-color-brand;
  border: none;
  font-size: 26rpx;
}

button.ed-btn::after,
button.ed-btn-secondary::after,
button.ed-btn-link::after {
  border: none;
}

.ed-tag {
  display: inline-block;
  font-size: 20rpx;
  font-weight: 500;
  line-height: 1.4;
  padding: 6rpx 16rpx;
  border-radius: $ed-radius-tag;
}

.ed-tag-open,
.ed-tag-confirmed {
  background: $ed-color-brand-soft;
  color: $ed-color-brand-strong;
}

.ed-tag-paid,
.ed-tag-pending {
  background: $ed-color-terracotta-soft;
  color: $ed-color-terracotta;
}

.ed-tag-waitlist {
  background: $ed-color-navy-soft;
  color: $ed-color-navy;
}

.ed-tag-full {
  background: $ed-color-full-bg;
  color: $ed-color-full-text;
}

.ed-tag-muted {
  background: transparent;
  color: $ed-color-text-secondary;
  padding-left: 0;
  padding-right: 0;
}
</style>
