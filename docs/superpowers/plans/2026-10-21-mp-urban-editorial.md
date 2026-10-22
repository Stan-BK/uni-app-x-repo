# 小程序 Urban Editorial 视觉改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 v1.1 把 `apps/mp` 全部页换成米白底 + 青绿主色 + 一二级页壳，不改业务逻辑。

**Architecture:** `uni.scss` 定义 `$ed-*` tokens。`App.vue` 放无 scoped 的页壳/按钮/标签。各页根节点加 `page-l1` 或 `page-l2`，scoped 样式改用 tokens。`pages.json` 同步导航与 Tab 色。

**Tech Stack:** uni-app Vue3、`<script setup>`、dart-sass、`pages.json`

**前置文档：** [规格](../specs/2026-10-21-mp-urban-editorial-design.md)、[视觉规范 v1.1](../../design/mp-urban-editorial.md)

---

## 文件结构

```text
apps/mp/src/uni.scss                 # $ed-* tokens
apps/mp/src/App.vue                  # .page-l1 / .page-l2 / .ed-btn*
apps/mp/src/pages.json               # nav / tabBar
apps/mp/src/pages/home/index.vue
apps/mp/src/pages/mine/registrations.vue
apps/mp/src/pages/activity/detail.vue
apps/mp/src/pages/register/index.vue
apps/mp/src/pages/organizer/home.vue
apps/mp/src/pages/organizer/create.vue
apps/mp/src/pages/organizer/list.vue
apps/mp/src/pages/organizer/detail.vue
apps/mp/src/pages/organizer/registrations.vue
docs/superpowers/specs/2026-10-21-mp-urban-editorial-design.md
```

不改 API、Admin、stores、接口。不要新建组件库。

---

### Task 1: tokens 与全局页壳

**Files:**
- Modify: `apps/mp/src/uni.scss`
- Modify: `apps/mp/src/App.vue`

- [ ] **Step 1: 在 `uni.scss` 末尾追加（保留原 uni 变量）**

```scss
/* Urban Editorial v1.1 */
$ed-color-canvas: #f6f3ec;
$ed-color-surface: #fffefb;
$ed-color-text: #24312d;
$ed-color-text-secondary: #77837a;
$ed-color-text-muted: #929b92;
$ed-color-brand: #1e9b88;
$ed-color-brand-strong: #157a6a;
$ed-color-brand-soft: #d4f3ec;
$ed-color-terracotta: #b94e2d;
$ed-color-terracotta-soft: #fbe9df;
$ed-color-navy: #3a5a78;
$ed-color-navy-soft: #e4eaf0;
$ed-color-border: #e7e2d9;
$ed-color-full-bg: #f8f0df;
$ed-color-full-text: #a6752a;
$ed-color-btn-secondary: #f0f1eb;
$ed-space-page-x: 44rpx;
$ed-space-section: 44rpx;
$ed-space-card: 32rpx;
$ed-radius-card: 32rpx;
$ed-radius-input: 24rpx;
$ed-radius-tag: 16rpx;
$ed-radius-pill: 999rpx;
```

- [ ] **Step 2: `App.vue` 的 `<style>` 改为（不要 scoped）**

```vue
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
```

保留原有 `<script setup>`。

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/uni.scss apps/mp/src/App.vue
git commit -m "feat(mp): 增加 Urban Editorial tokens 与页壳"
```

---

### Task 2: pages.json 导航与 Tab

**Files:**
- Modify: `apps/mp/src/pages.json`

- [ ] **Step 1: 改 `tabBar` 与 `globalStyle`**

```json
  "tabBar": {
    "color": "#77837A",
    "selectedColor": "#1E9B88",
    "backgroundColor": "#FFFEFB",
    "borderStyle": "white",
```

```json
  "globalStyle": {
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "活动",
    "navigationBarBackgroundColor": "#FFFEFB",
    "backgroundColor": "#F6F3EC"
  }
```

不要改 `list` 的 path / text / 图标文件名。不要改各页 `navigationBarTitleText`。

- [ ] **Step 2: Commit**

```bash
git add apps/mp/src/pages.json
git commit -m "feat(mp): 导航与 Tab 对齐 Editorial 色板"
```

---

### Task 3: 首页一级

**Files:**
- Modify: `apps/mp/src/pages/home/index.vue`

- [ ] **Step 1: 根节点**

`class="page"` → `class="page page-l1"`

- [ ] **Step 2: 标签 class**

费用：免费加 `ed-tag ed-tag-open`，付费加 `ed-tag ed-tag-paid`（可与现有 `fee` 并存）。  
`displayStatus`：`open` → `ed-tag ed-tag-open`；`full` → `ed-tag ed-tag-full`；`ended`/`upcoming` → `ed-tag ed-tag-muted`。

- [ ] **Step 3: 替换 `<style scoped>` 中颜色与间距**（逻辑 class 名保持）

`.page` 去掉 background/padding（交给 `.page-l1`）。其余：

- 搜索框：`$ed-color-surface`、边框 `$ed-color-border`、圆角 `$ed-radius-input`、字 `$ed-color-text`
- `.sort-item.active`：底 `$ed-color-brand-soft`、字 `$ed-color-brand-strong`
- `.card`：`$ed-color-surface`、圆角 `$ed-radius-card`、`border: 1rpx solid $ed-color-border`、轻阴影 `0 2rpx 8rpx rgba(36, 49, 45, 0.06)`
- `.body`：padding `$ed-space-card`
- `.title`：26–28rpx Bold、`$ed-color-text`、最多两行 `-webkit-line-clamp: 2`
- `.meta` / `.place`：`$ed-color-text-secondary`（地点不要 muted）
- `.cover-placeholder`：`$ed-color-brand` 或 `$ed-color-navy`
- `.more`：`$ed-color-brand`

禁止再写 `#f4f5f7` `#0f766e` `#1a1d23` `#ecfdf5`。

- [ ] **Step 4: `pnpm --filter @activity/mp type-check`**

Expected: 无因 class 改动的 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add apps/mp/src/pages/home/index.vue
git commit -m "feat(mp): 首页套一级页壳与 Editorial 卡片"
```

---

### Task 4: 我的报名一级

**Files:**
- Modify: `apps/mp/src/pages/mine/registrations.vue`

- [ ] **Step 1:** `class="page"` → `class="page page-l1"`

- [ ] **Step 2: 按钮**

登录 / 发布活动 / 浏览活动：加 `ed-btn`（可去掉 `size="mini"` 或保留但样式走胶囊）。  
退出 / 刷新 / 我的活动：`ed-btn-secondary`。  
取消报名链接：`ed-btn-link`。

- [ ] **Step 3: 状态标签**

`confirmed` → `ed-tag ed-tag-confirmed`；`pending` → `ed-tag-pending`；`waitlist` → `ed-tag-waitlist`；`cancelled` → `ed-tag-muted`。

- [ ] **Step 4: scoped 样式**

卡片 surface + 32rpx 圆角 + border。区块标题 Bold。meta `$ed-color-text-secondary`。去掉冷灰 HEX。

- [ ] **Step 5: type-check + Commit**

```bash
git add apps/mp/src/pages/mine/registrations.vue
git commit -m "feat(mp): 我的页套一级页壳与胶囊按钮"
```

---

### Task 5: 活动详情二级

**Files:**
- Modify: `apps/mp/src/pages/activity/detail.vue`

- [ ] **Step 1:** `class="page"` → `class="page page-l2"`

封面 `.cover-img` / `.cover`：负边距拉通栏  
`margin-left: -$ed-space-page-x; margin-right: -$ed-space-page-x; width: calc(100% + 88rpx);`

- [ ] **Step 2:** `.title` 约 38rpx Semibold。`.panel` 为 surface 卡片。  
CTA：`.cta` 加 `ed-btn`；`.share` 加 `ed-btn-secondary`。禁用 CTA 用降低透明度，不要换色板。

- [ ] **Step 3:** 展示态标签规则同首页。type-check。Commit：

```bash
git add apps/mp/src/pages/activity/detail.vue
git commit -m "feat(mp): 活动详情套二级页壳"
```

---

### Task 6: 报名表二级

**Files:**
- Modify: `apps/mp/src/pages/register/index.vue`

- [ ] **Step 1:** `page page-l2`

- [ ] **Step 2:** `.input`：surface、border `$ed-color-border`、圆角 `$ed-radius-input`（**不是**胶囊）。`.submit` 加 `ed-btn` 全胶囊。

- [ ] **Step 3:** type-check + commit

```bash
git add apps/mp/src/pages/register/index.vue
git commit -m "feat(mp): 报名表套二级页壳与胶囊提交"
```

---

### Task 7: 发布栈五页二级

**Files:**
- Modify: `apps/mp/src/pages/organizer/home.vue`
- Modify: `apps/mp/src/pages/organizer/create.vue`
- Modify: `apps/mp/src/pages/organizer/list.vue`
- Modify: `apps/mp/src/pages/organizer/detail.vue`
- Modify: `apps/mp/src/pages/organizer/registrations.vue`

- [ ] **Step 1:** 五页根节点均为 `page page-l2`

- [ ] **Step 2:** 主操作（发布活动、保存、提交）`ed-btn`；次操作（我的活动、返回类）`ed-btn-secondary`。卡片/表单输入用 tokens。create 页 input 圆角 `$ed-radius-input`。

- [ ] **Step 3:** 五页 scoped 中删除 `#f4f5f7` `#fff` 作页面底（改 canvas/surface）。type-check。

- [ ] **Step 4: Commit**

```bash
git add apps/mp/src/pages/organizer/*.vue
git commit -m "feat(mp): 发布栈五页套二级 Editorial 样式"
```

---

### Task 8: 扫残留色 + 文档收尾

**Files:**
- Modify: `docs/superpowers/specs/2026-10-21-mp-urban-editorial-design.md`
- Modify: `docs/superpowers/specs/2026-10-21-mp-urban-editorial-design.md`（状态 Implemented；勾选 §7）
- 仅当选中态图标明显偏灰/偏蓝时才改 `apps/mp/src/static/tab-*-active.png`

- [ ] **Step 1: 扫描**

```bash
rg -n "#[0-9a-fA-F]{3,8}|#f4f5f7|#0f766e|#007aff|#1a1d23|#ecfdf5|#9ca3af" apps/mp/src --glob '!uni.scss'
```

Expected：业务页无第二套冷灰/旧青绿；`uni.scss` 可保留官方 `$uni-*`。`pages.json` 只允许规格里的 HEX。

- [ ] **Step 2:** `pnpm --filter @activity/mp type-check`

- [ ] **Step 3:** 规格状态 `Implemented`；§7 五项勾选；增加实现计划链接（若尚无）。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-21-mp-urban-editorial-design.md apps/mp/src/static
git commit -m "docs: 小程序 Urban Editorial 改版已落地"
```

若 static 无改动，不要 `git add` 空路径。

---

## 规格对照

| 规格 | 任务 |
| --- | --- |
| §3 tokens / 页壳文件 | Task 1–2 |
| §4 一二级页面 | Task 3–7 |
| §5 卡片状态按钮 | Task 3–6 |
| §6 导航 | Task 2 |
| §7 验收 | Task 8 |
| §8 非目标 | 全任务不改 Admin/API |
