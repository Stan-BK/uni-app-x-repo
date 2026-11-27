# 首页活动列表横卡改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页发现列表从双列瀑布流竖卡改为单列横卡，对齐 [设计规格](../specs/2026-11-23-home-activity-list-card-design.md)。

**Architecture:** 仅改 `apps/mp/src/pages/home/index.vue`：去掉 `masonryCols`，列表 `v-for` 直接遍历 `items`；卡片改为左封面右文案；时间/地点用已有 `EdIcon`；标签色与费用/状态逻辑不变。`apps/mp` 无前端单测脚手架，验收以 `vue-tsc` + 真机/开发者工具目视为准。

**Tech Stack:** uni-app Vue3、`<script setup>`、SCSS `$ed-*` tokens、`EdIcon`

**前置文档：** [规格](../specs/2026-11-23-home-activity-list-card-design.md)

---

## 文件结构

```text
apps/mp/src/pages/home/index.vue   # 唯一实现落点：模板 + script + 样式
apps/mp/src/components/ed-icon/    # 只读复用 clock / pin（不改）
```

不改：我的报名、组织者列表、API、热门轮播、搜索/排序逻辑。

---

### Task 1: 脚本 — 引入 EdIcon、去掉瀑布流、改时间格式

**Files:**
- Modify: `apps/mp/src/pages/home/index.vue`（`<script setup>`）

- [ ] **Step 1: 增加 EdIcon import**

在现有 import 区块中加入（与 `EdTabBar` 等并列）：

```ts
import EdIcon from "@/components/ed-icon/ed-icon.vue";
```

- [ ] **Step 2: 删除 `masonryCols` computed**

删除整段：

```ts
const masonryCols = computed(() => {
  const cols: [PublicActivity[], PublicActivity[]] = [[], []];
  items.value.forEach((item, index) => {
    cols[index % 2].push(item);
  });
  return cols;
});
```

保留 `hasMore` 等其它 computed。若 `computed` 仍被 `hasMore` 使用，勿删 `computed` import。

- [ ] **Step 3: 替换 `formatTime` 为参考图短格式**

将现有：

```ts
function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
```

替换为：

```ts
const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"] as const;

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(iso?: string | null) {
  if (!iso) return "时间待定";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间待定";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const week = WEEKDAY_SHORT[d.getDay()];
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${month}月${day}日 (${week}) ${clock}`;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mp/src/pages/home/index.vue
git commit -m "$(cat <<'EOF'
refactor(mp): 首页列表去掉瀑布流并改时间短格式

为横卡改版做脚本前置；展示逻辑仍待模板接入。
EOF
)"
```

---

### Task 2: 模板 — 单列横卡结构

**Files:**
- Modify: `apps/mp/src/pages/home/index.vue`（`<template>` 中 `.list` 区块）

- [ ] **Step 1: 用下列结构替换现有 `.list` 内的 `.masonry` 整块**

保留外层：

```vue
    <view v-if="loading && !items.length" class="state">加载中…</view>
    <view v-else-if="!items.length" class="state">暂无活动</view>
    <view v-else class="list">
```

以及末尾的「加载更多 / 没有更多了」。中间改为：

```vue
      <view
        v-for="item in items"
        :key="item.id"
        class="card"
        @click="goDetail(item.id)"
      >
        <image
          v-if="item.coverUrl"
          class="cover-img"
          :src="item.coverUrl"
          mode="aspectFill"
        />
        <view v-else class="cover cover-placeholder">
          <text class="cover-label">活动</text>
        </view>
        <view class="body">
          <text class="title">{{ item.title }}</text>
          <view class="meta-row">
            <EdIcon name="clock" size="24rpx" color="currentColor" />
            <text class="meta-text">{{ formatTime(item.startAt) }}</text>
          </view>
          <view class="meta-row">
            <EdIcon name="pin" size="24rpx" color="currentColor" />
            <text class="meta-text place">{{ item.place || "—" }}</text>
          </view>
          <view class="row-foot">
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
          </view>
        </view>
      </view>
```

要点对照规格：

- 单列：`v-for="item in items"`，无 `masonry` / `masonry-col`
- 标题用单行 class（样式 Task 3）
- 头像仅 `cardFaces(item).length` 为真时渲染，且在状态标签左侧（`.foot-right`）
- 费用/状态 class 与改版前一致

- [ ] **Step 2: Commit**

```bash
git add apps/mp/src/pages/home/index.vue
git commit -m "$(cat <<'EOF'
feat(mp): 首页活动列表改为单列横卡模板

左封面右文案，头像置于状态标签左侧。
EOF
)"
```

---

### Task 3: 样式 — 横卡布局与标题单行

**Files:**
- Modify: `apps/mp/src/pages/home/index.vue`（`<style scoped lang="scss">`）

- [ ] **Step 1: 删除不再使用的瀑布流样式**

删除 `.masonry`、`.masonry-col` 整块规则。

- [ ] **Step 2: 将 `.card` 及封面/正文相关样式替换为横卡**

用下列规则替换（或等价改写）现有 `.card` → `.place` 一段，并保留 `.faces` / `.face*` / `.more`：

```scss
.card {
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

.cover-img,
.cover {
  width: 168rpx;
  height: 168rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  overflow: hidden;
}

.cover-img {
  display: block;
  background: $ed-color-border;
}

.cover {
  display: flex;
  align-items: flex-end;
  padding: 12rpx;
  box-sizing: border-box;
}

.cover-placeholder {
  background: $ed-color-brand;
}

.cover-label {
  color: rgba(255, 255, 255, 0.92);
  font-size: 22rpx;
  letter-spacing: 2rpx;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 0;
}

.title {
  font-size: 28rpx;
  font-weight: 700;
  color: $ed-color-text;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: $ed-color-text-secondary;
  min-width: 0;
}

.meta-text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: $ed-color-text-secondary;
  line-height: 1.3;
}

.meta-text.place {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: auto;
  padding-top: 4rpx;
}

.fee,
.status {
  flex-shrink: 0;
}

.foot-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
  min-width: 0;
}

.faces {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 0;
  padding-left: 0;
}
```

注意：

- 标题**禁止**再使用 `-webkit-line-clamp: 2`
- 删除旧的 `.row-title`、`.row-tags`、独立 `.meta` / `.place`（若已被新 class 取代）
- `.face` 尺寸可维持 44rpx；若横卡偏挤可改为 36rpx，但需与 overflow mask 一并协调

- [ ] **Step 3: 类型检查**

Run:

```bash
pnpm --filter @activity/mp type-check
```

Expected: 退出码 0，无与本次改动相关的报错。

- [ ] **Step 4: 目视验收（开发者工具 / H5）**

对照规格 §7：

1. 列表单列横卡  
2. 标题单行省略  
3. clock / pin 可见  
4. 免费/付费、报名中/已满员等标签色与改版前一致  
5. 有 attendees 时头像在状态左侧；无则仅状态  
6. 热门 / 搜索 / 排序 / FAB 仍可用  
7. `mine/registrations`、`organizer/list` 未改

- [ ] **Step 5: 勾选规格验收清单并 Commit**

将 `docs/superpowers/specs/2026-11-23-home-activity-list-card-design.md` 中 §7 清单全部勾为 `[x]`，状态改为 `Implemented`。

```bash
git add apps/mp/src/pages/home/index.vue docs/superpowers/specs/2026-11-23-home-activity-list-card-design.md
git commit -m "$(cat <<'EOF'
feat(mp): 首页活动列表横卡样式落地

单列左图右文，标题单行，标签色沿用 ed-tag。
EOF
)"
```

---

## Spec 覆盖自检

| 规格要求 | 对应任务 |
| --- | --- |
| 仅首页、不抽组件 | 文件结构 + 全部 Task |
| 单列横卡、去 masonry | Task 1 Step 2 + Task 2 |
| 标题单行省略 | Task 3 `.title` |
| clock / pin + 时间短格式 | Task 1 Step 3 + Task 2 |
| 费用/状态标签色沿用 | Task 2 保留 `ed-tag-*` |
| 头像在状态左侧、无则不占位 | Task 2 `.foot-right` + `v-if` |
| 不改其他列表/API | 非目标声明 |

无 TBD / 占位步骤。
