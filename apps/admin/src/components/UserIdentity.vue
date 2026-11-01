<script setup lang="ts">
import { computed } from "vue";
import { avatarColor, initialOf } from "../utils/format";

const props = withDefaults(
  defineProps<{
    name: string;
    sub?: string;
    size?: number;
  }>(),
  { size: 32, sub: undefined },
);

const color = computed(() => avatarColor(props.name || "?"));
</script>

<template>
  <div class="identity">
    <span
      class="identity__avatar"
      :style="{
        width: `${props.size}px`,
        height: `${props.size}px`,
        background: color,
        fontSize: `${Math.round(props.size * 0.42)}px`,
      }"
    >
      {{ initialOf(props.name) }}
    </span>
    <span class="identity__text">
      <span class="identity__name">{{ props.name }}</span>
      <span v-if="props.sub" class="identity__sub mono">{{ props.sub }}</span>
    </span>
  </div>
</template>

<style scoped>
.identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.identity__avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 999px;
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.02em;
  user-select: none;
}

.identity__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.identity__name {
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity__sub {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
