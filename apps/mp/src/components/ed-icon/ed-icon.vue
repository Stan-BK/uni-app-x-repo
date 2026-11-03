<template>
  <view class="ed-icon" :class="`ed-icon-${name}`" :style="iconStyle" />
</template>

<script setup lang="ts">
import { computed } from "vue";

type EdIconName =
  | "like"
  | "like-active"
  | "comment"
  | "reply"
  | "share"
  | "calendar"
  | "clock"
  | "pin"
  | "person"
  | "yen"
  | "search"
  | "send"
  | "check";

const props = withDefaults(
  defineProps<{ name: EdIconName; size?: string; color?: string }>(),
  { size: "32rpx", color: "" },
);

/** 图标用 mask 渲染，颜色跟随 currentColor；显式传 color 时覆盖。 */
const iconStyle = computed(() => {
  const style: Record<string, string> = {
    width: props.size,
    height: props.size,
  };
  if (props.color) style.backgroundColor = props.color;
  return style;
});
</script>

<style scoped lang="scss">
.ed-icon {
  display: inline-block;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.ed-icon-like {
  -webkit-mask-image: url("/static/ico/like.svg");
  mask-image: url("/static/ico/like.svg");
}

.ed-icon-like-active {
  -webkit-mask-image: url("/static/ico/like-active.svg");
  mask-image: url("/static/ico/like-active.svg");
}

.ed-icon-comment {
  -webkit-mask-image: url("/static/ico/comment.svg");
  mask-image: url("/static/ico/comment.svg");
}

.ed-icon-reply {
  -webkit-mask-image: url("/static/ico/reply.svg");
  mask-image: url("/static/ico/reply.svg");
}

.ed-icon-share {
  -webkit-mask-image: url("/static/ico/share-line.svg");
  mask-image: url("/static/ico/share-line.svg");
}

.ed-icon-calendar {
  -webkit-mask-image: url("/static/ico/calendar.svg");
  mask-image: url("/static/ico/calendar.svg");
}

.ed-icon-clock {
  -webkit-mask-image: url("/static/ico/clock.svg");
  mask-image: url("/static/ico/clock.svg");
}

.ed-icon-pin {
  -webkit-mask-image: url("/static/ico/pin.svg");
  mask-image: url("/static/ico/pin.svg");
}

.ed-icon-person {
  -webkit-mask-image: url("/static/ico/person.svg");
  mask-image: url("/static/ico/person.svg");
}

.ed-icon-yen {
  -webkit-mask-image: url("/static/ico/yen.svg");
  mask-image: url("/static/ico/yen.svg");
}

.ed-icon-search {
  -webkit-mask-image: url("/static/ico/search.svg");
  mask-image: url("/static/ico/search.svg");
}

.ed-icon-send {
  -webkit-mask-image: url("/static/ico/send.svg");
  mask-image: url("/static/ico/send.svg");
}

.ed-icon-check {
  -webkit-mask-image: url("/static/ico/check.svg");
  mask-image: url("/static/ico/check.svg");
}
</style>
