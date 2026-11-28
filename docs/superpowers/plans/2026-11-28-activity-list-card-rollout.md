# 活动列表横卡推广 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽 `activity-list-card`，首页迁入；「我的报名」「组织者活动列表」改为同系单列横卡，有操作时三列（封面 | 信息 | 操作）。

**Architecture:** 展示与布局集中在公共组件；脚头与操作经 `#foot` / `#actions` 由各页注入；业务 `can*` 与导航仍留在页面。去掉 masonry。时间格式抽到共享 util，三页共用首页短中文格式。

**Tech Stack:** uni-app Vue3 + SCSS（`$ed-*`）；easycom 自动扫描 `components/`。

**规格：** [2026-11-28-activity-list-card-rollout-design.md](../specs/2026-11-28-activity-list-card-rollout-design.md)、[2026-11-23-home-activity-list-card-design.md](../specs/2026-11-23-home-activity-list-card-design.md)

---

## File map

| 路径 | 职责 |
| --- | --- |
| `apps/mp/src/utils/format-activity-time.ts`（新建） | 首页同款短时间文案 |
| `apps/mp/src/components/activity-list-card/activity-list-card.vue`（新建） | 公共横卡：封面 + 信息 + 可选操作列 |
| `apps/mp/src/pages/home/index.vue` | 迁入组件；删内联横卡 DOM/样式；用 util |
| `apps/mp/src/pages/mine/registrations.vue` | 单列 + 组件 + `#actions` |
| `apps/mp/src/pages/organizer/list.vue` | 单列 + 组件 + `#actions` |
| `docs/superpowers/specs/2026-11-28-activity-list-card-rollout-design.md` | 状态改为 Implemented；勾验收 |

本仓库 `apps/mp` 无组件单测脚手架；以 `pnpm --filter @activity/mp type-check` + 模拟器手测为准。

---

### Task 1: 时间格式 util

**Files:**
- Create: `apps/mp/src/utils/format-activity-time.ts`

- [ ] **Step 1: 从首页逻辑抽出 util**

```ts
// apps/mp/src/utils/format-activity-time.ts
const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** 活动列表横卡用短时间：`11月30日 (周日) 10:00`；无效为「时间待定」。 */
export function formatActivityTime(iso?: string | null): string {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间待定";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const week = WEEKDAY_LABEL[d.getDay()];
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${month}月${day}日 (${week}) ${clock}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mp/src/utils/format-activity-time.ts
git commit -m "$(cat <<'EOF'
refactor(mp): 抽出活动列表短时间格式

EOF
)"
```

---

### Task 2: 新建 `activity-list-card`

**Files:**
- Create: `apps/mp/src/components/activity-list-card/activity-list-card.vue`

- [ ] **Step 1: 实现组件（完整 SFC）**

```vue
<template>
  <view class="alc" @click="emit('click')">
    <image
      v-if="resolvedCover"
      class="alc-cover-img"
      :src="resolvedCover"
      mode="aspectFill"
      @error="onCoverError"
    />
    <view v-else class="alc-cover alc-cover-placeholder">
      <text class="alc-cover-label">活动</text>
    </view>

    <view class="alc-body">
      <text class="alc-title">{{ title }}</text>
      <view class="alc-meta-row">
        <EdIcon name="clock" size="24rpx" color="currentColor" />
        <text class="alc-meta-text">{{ timeText }}</text>
      </view>
      <view class="alc-meta-row">
        <EdIcon name="pin" size="24rpx" color="currentColor" />
        <text class="alc-meta-text alc-place">{{ place || "—" }}</text>
      </view>
      <view class="alc-foot">
        <slot name="foot" />
      </view>
    </view>

    <view v-if="hasActions" class="alc-actions" @click.stop>
      <slot name="actions" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, useSlots } from "vue";
import EdIcon from "@/components/ed-icon/ed-icon.vue";

const props = withDefaults(
  defineProps<{
    coverUrl?: string | null;
    title: string;
    timeText: string;
    place?: string | null;
  }>(),
  { coverUrl: "", place: "" },
);

const emit = defineEmits<{ click: [] }>();

const broken = ref(false);
const slots = useSlots();
const hasActions = computed(() => typeof slots.actions === "function");

const resolvedCover = computed(() => {
  const url = (props.coverUrl ?? "").trim();
  if (!url || broken.value) return "";
  return url;
});

function onCoverError() {
  broken.value = true;
}
</script>

<style scoped lang="scss">
/* $ed-* 由工程全局注入，与 home / community-post-card 一致，勿重复 @import */

.alc {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 20rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  background: $ed-color-surface;
  border-radius: $ed-radius-card;
  border: 1rpx solid $ed-color-border;
  box-shadow: 0 2rpx 8rpx rgba(36, 49, 45, 0.06);
  box-sizing: border-box;
}

.alc-cover-img,
.alc-cover {
  width: 168rpx;
  height: 168rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  overflow: hidden;
}

.alc-cover-img {
  display: block;
  background: $ed-color-border;
}

.alc-cover {
  display: flex;
  align-items: flex-end;
  padding: 12rpx;
  box-sizing: border-box;
}

.alc-cover-placeholder {
  background: $ed-color-brand;
}

.alc-cover-label {
  color: rgba(255, 255, 255, 0.92);
  font-size: 22rpx;
  letter-spacing: 2rpx;
}

.alc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.alc-title {
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alc-meta-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: $ed-color-text-secondary;
  min-width: 0;
}

.alc-meta-text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  line-height: 1.2;
}

.alc-place {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: auto;
  min-width: 0;
}

.alc-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 8rpx;
  max-width: 160rpx;
}
</style>
```

- [ ] **Step 2: 确认 easycom / 手动 import**

`pages.json` 已 `autoscan: true`，页面可写 `<ActivityListCard>` 或显式：

```ts
import ActivityListCard from "@/components/activity-list-card/activity-list-card.vue";
```

本计划各页采用**显式 import**（与 `EdIcon` / `community-post-card` 用法一致，避免命名歧义）。

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/components/activity-list-card/activity-list-card.vue
git commit -m "$(cat <<'EOF'
feat(mp): 新增 activity-list-card 公共横卡

EOF
)"
```

---

### Task 3: 首页迁入组件

**Files:**
- Modify: `apps/mp/src/pages/home/index.vue`

- [ ] **Step 1: 增加 import**

```ts
import ActivityListCard from "@/components/activity-list-card/activity-list-card.vue";
import { formatActivityTime } from "@/utils/format-activity-time";
```

删除本文件内 `WEEKDAY_LABEL` / `pad2` / `formatTime`，调用改为 `formatActivityTime(...)`。保留 `EdIcon` 仅当页内别处仍用；若仅卡片用则可从 home 移除 EdIcon import（组件内已引）。

- [ ] **Step 2: 替换列表项模板**

将 `v-for` 内整块 `.card` 换为：

```vue
<ActivityListCard
  :cover-url="item.coverUrl"
  :title="item.title"
  :time-text="formatActivityTime(item.startAt)"
  :place="item.place"
  @click="goDetail(item.id)"
>
  <template #foot>
    <text
      class="fee ed-tag"
      :class="isFree(item) ? 'ed-tag-open' : 'ed-tag-paid'"
    >{{ feeLabel(item) }}</text>
    <view class="foot-right">
      <view
        v-if="cardFaces(item).length"
        class="faces"
        :class="{ 'is-overflow': cardFaces(item).length >= 3 }"
      >
        <view
          v-for="(person, index) in cardFaces(item)"
          :key="`${item.id}-${person.nickname}-${index}`"
          class="face"
          :style="{ zIndex: index + 1 }"
        >
          <image
            v-if="person.avatarUrl"
            class="face-img"
            :src="person.avatarUrl"
            mode="aspectFill"
          />
          <view v-else class="face-img face-fallback">
            <view class="face-head" />
            <view class="face-body" />
          </view>
        </view>
      </view>
      <text
        class="status ed-tag"
        :class="[item.displayStatus, statusTag(item.displayStatus)]"
      >{{ displayLabel(item.displayStatus) }}</text>
    </view>
  </template>
</ActivityListCard>
```

`#foot` 内左右结构：组件 `.alc-foot` 已是 `space-between`，故脚头内两个根节点（费用 + `foot-right`）即可；**不要**再包一层会破坏两端对齐的多余 wrapper（若 Vue 多根 slot 在小程序有问题，则用单个 `<view class="foot-inner">` 并在 home 样式里设 `display:flex; width:100%; justify-content:space-between;`）。

- [ ] **Step 3: 删除 home 中已迁走的卡片样式**

删除 `.card` / `.cover*` / `.body` / `.title` / `.meta-*` / `.row-foot` 中已由组件承担的规则；**保留** `.fee`、`.status`、`.foot-right`、`.faces`、`.face*`（脚头仍在页内）。

- [ ] **Step 4: type-check**

```bash
pnpm --filter @activity/mp type-check
```

Expected: 无因本次改动引入的错误。

- [ ] **Step 5: Commit**

```bash
git add apps/mp/src/pages/home/index.vue apps/mp/src/utils/format-activity-time.ts
git commit -m "$(cat <<'EOF'
refactor(mp): 首页活动列表迁入 activity-list-card

EOF
)"
```

---

### Task 4: 我的报名横卡

**Files:**
- Modify: `apps/mp/src/pages/mine/registrations.vue`

- [ ] **Step 1: import**

```ts
import ActivityListCard from "@/components/activity-list-card/activity-list-card.vue";
import { formatActivityTime } from "@/utils/format-activity-time";
```

删除或停用本页 `formatTime`（改为 util）；删除 `masonryCols` computed 及对双列的依赖，列表直接 `v-for="item in items"`（或现有列表源变量名）。

- [ ] **Step 2: 替换列表模板**

去掉 `.masonry` / `.masonry-col`，改为：

```vue
<view v-else class="list">
  <ActivityListCard
    v-for="item in items"
    :key="item.id"
    :cover-url="coverSrc(item)"
    :title="item.activity?.title || '活动'"
    :time-text="formatActivityTime(item.activity?.startAt)"
    :place="item.activity?.place"
    @click="goDetail(item)"
  >
    <template #foot>
      <text class="status ed-tag" :class="statusTagClass(item.status)">
        {{ statusLabel(item.status) }}
      </text>
    </template>
    <template
      v-if="canPay(item) || canCheckIn(item) || canCancel(item)"
      #actions
    >
      <button
        v-if="canPay(item)"
        class="pay-btn ed-btn"
        hover-class="none"
        :loading="payingId === item.id"
        :disabled="payingId === item.id"
        @click.stop="onPay(item)"
      >
        去支付
      </button>
      <text
        v-if="canCheckIn(item)"
        class="ed-btn-link"
        @click.stop="goCheckInCode(item)"
      >签到码</text>
      <text
        v-if="canCancel(item)"
        class="ed-btn-link"
        @click.stop="onCancel(item)"
      >取消报名</text>
    </template>
  </ActivityListCard>
</view>
```

注意：uni-app 对 `v-if` 写在 `<template #actions>` 上的支持若不稳，改为始终提供 `#actions`，内部用 `v-if` 包按钮；**仅当至少有一个操作时**才让 slot 有内容——否则 `hasActions` 仍为 true（空 slot 函数存在）。更稳妥：

```vue
<template #actions>
  <block v-if="canPay(item) || canCheckIn(item) || canCancel(item)">
    <!-- buttons -->
  </block>
</template>
```

若空 `block` 仍占 slot，则在组件侧改 `hasActions` 为 prop `showActions` 由页传入。实现时优先尝试 slot 检测；若真机第三列空白条出现，再加：

```ts
// activity-list-card.vue
showActions: { type: Boolean, default: undefined }
// hasActions = showActions ?? !!slots.actions
```

并在报名/组织者页 `:show-actions="..."`。

- [ ] **Step 3: 清理样式**

删除 `.masonry*`、竖卡 `.card` / `.cover*` / `.body` 等与旧布局冲突的规则；保留支付按钮、链接、状态 tag、钱包区样式。为操作列按钮加窄列适配（如 `.pay-btn { font-size: 22rpx; padding: 0 12rpx; }`）。

- [ ] **Step 4: type-check + Commit**

```bash
pnpm --filter @activity/mp type-check
git add apps/mp/src/pages/mine/registrations.vue apps/mp/src/components/activity-list-card/activity-list-card.vue
git commit -m "$(cat <<'EOF'
feat(mp): 我的报名列表改用横卡三列布局

EOF
)"
```

---

### Task 5: 组织者列表横卡

**Files:**
- Modify: `apps/mp/src/pages/organizer/list.vue`

- [ ] **Step 1: import + 去掉 masonry**

同 Task 4：引入 `ActivityListCard`、`formatActivityTime`；`v-for="item in filteredItems"`（或当前过滤后的列表 computed 名，保留 shelf filter 逻辑）。

- [ ] **Step 2: 模板**

```vue
<ActivityListCard
  v-for="item in filteredItems"
  :key="item.id"
  :cover-url="coverSrc(item)"
  :title="item.title || '未命名活动'"
  :time-text="formatActivityTime(item.startAt)"
  :place="item.place"
  @click="goDetail(item.id)"
>
  <template #foot>
    <text
      class="status ed-tag"
      :class="lifecycleTagClass(displayLifecycle(item))"
    >{{ lifecycleLabel(displayLifecycle(item)) }}</text>
  </template>
  <template #actions>
    <block v-if="canMutate(item)">
      <button
        v-if="displayLifecycle(item) === 'draft' && user.canPublish"
        class="ed-btn"
        size="mini"
        hover-class="none"
        :disabled="actingId === item.id"
        @click.stop="onPublish(item.id)"
      >
        发布
      </button>
      <button
        v-if="displayLifecycle(item) === 'published'"
        class="ed-btn-secondary"
        size="mini"
        hover-class="none"
        :disabled="actingId === item.id"
        @click.stop="onUnpublish(item.id)"
      >
        退回草稿
      </button>
      <button
        v-if="displayLifecycle(item) === 'published'"
        class="danger"
        size="mini"
        hover-class="none"
        :disabled="actingId === item.id"
        @click.stop="onCancel(item.id)"
      >
        取消
      </button>
      <button
        v-if="displayLifecycle(item) === 'draft'"
        class="ed-btn-secondary"
        size="mini"
        hover-class="none"
        @click.stop="goEdit(item.id)"
      >
        编辑
      </button>
    </block>
  </template>
</ActivityListCard>
```

（`filteredItems` 换成本页实际变量名。）

- [ ] **Step 3: 清理 masonry/竖卡样式；type-check；Commit**

```bash
pnpm --filter @activity/mp type-check
git add apps/mp/src/pages/organizer/list.vue
git commit -m "$(cat <<'EOF'
feat(mp): 组织者活动列表改用横卡三列布局

EOF
)"
```

---

### Task 6: 文档验收勾选

**Files:**
- Modify: `docs/superpowers/specs/2026-11-28-activity-list-card-rollout-design.md`

- [ ] **Step 1: 模拟器手测**

按规格 §6：三页组件一致；首页两列；报名/组织者单列三列；按钮不进详情；原操作可用。

- [ ] **Step 2: 更新规格状态**

- 文首 `Draft` → `Implemented`  
- §6 验收清单全部勾 `[x]`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-28-activity-list-card-rollout-design.md
git commit -m "$(cat <<'EOF'
docs: 活动列表横卡推广规格标为已实现

EOF
)"
```

---

## Spec coverage (self-review)

| 规格项 | Task |
| --- | --- |
| 抽 `activity-list-card` | 2 |
| 首页迁入、两列 | 3 |
| 我的报名单列 + 操作列 | 4 |
| 组织者列表单列 + 操作列 | 5 |
| 封面 168、高度节奏 | 2 样式 |
| `#foot` / `#actions` | 2–5 |
| 去掉 masonry | 4–5 |
| 不改 API / 非列表页 | 无任务改动 |
| 验收与状态 | 6 |
| 时间格式对齐 | 1 + 各页 |

无 TBD 占位；组件 props/slot 名在 Task 2–5 一致。
