<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "ok" | "warn" | "danger" | "info" | "neutral";
    label: string;
    dot?: boolean;
  }>(),
  { tone: "neutral", dot: true },
);
</script>

<template>
  <span class="pill" :class="`pill--${tone}`">
    <i v-if="dot" class="pill__dot" />
    {{ label }}
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 550;
  line-height: 1;
  white-space: nowrap;
  background: var(--bg-surface-muted);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.pill__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

.pill--ok {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 24%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
}

.pill--warn {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 26%, transparent);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

.pill--danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 24%, transparent);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.pill--info {
  color: var(--brand-500);
  border-color: color-mix(in srgb, var(--brand-500) 24%, transparent);
  background: color-mix(in srgb, var(--brand-500) 10%, transparent);
}
</style>
