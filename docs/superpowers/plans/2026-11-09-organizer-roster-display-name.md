# 所有者名单优先展示报名姓名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有者报名名单与管理详情头像条主标题优先显示报名表单 `name`，微信昵称仅作次要信息。

**Architecture:** 在 mp 抽出纯函数解析主名与「微信：」次行文案，供 `organizer/registrations` 与 `organizer/detail` 共用。不改 API、shared、公开活动详情。mp 无 vitest，用纯函数 + 手测验收（规格 §5）。

**Tech Stack:** uni-app Vue3、TypeScript、pnpm workspace `@activity/mp`

**前置文档：** [设计规格](../specs/2026-11-09-organizer-roster-display-name-design.md)、[ADR-0007](../../adr/0007-registration-idempotency-and-capacity.md)

---

## 文件结构

```text
apps/mp/src/utils/registration-display.ts   # 新建：主名 + 微信次行
apps/mp/src/pages/organizer/registrations.vue  # 改 personName + 次行
apps/mp/src/pages/organizer/detail.vue         # 改 personName
docs/superpowers/specs/2026-11-09-organizer-roster-display-name-design.md  # 状态 → Implemented
```

不改：`apps/api`、`packages/shared`、`pages/activity/detail.vue`、Admin。

---

### Task 1: 展示纯函数

**Files:**
- Create: `apps/mp/src/utils/registration-display.ts`

- [ ] **Step 1: 新增工具文件**

```ts
/** 报名记录上用于展示的姓名相关字段 */
export type RegistrationDisplayPerson = {
  name?: string | null;
  nickname?: string | null;
};

/**
 * 所有者侧主标题：报名姓名优先，其次昵称，否则「用户」。
 */
export function displayRegistrationName(
  person: RegistrationDisplayPerson,
): string {
  const name = person.name?.trim() ?? "";
  if (name) return name;
  const nickname = person.nickname?.trim() ?? "";
  if (nickname) return nickname;
  return "用户";
}

/**
 * 名单卡片次行：昵称非空且与主名不同时返回「微信：{nickname}」，否则 null。
 */
export function registrationWeixinSubtitle(
  person: RegistrationDisplayPerson,
): string | null {
  const nickname = person.nickname?.trim() ?? "";
  if (!nickname) return null;
  const primary = displayRegistrationName(person);
  if (nickname === primary) return null;
  return `微信：${nickname}`;
}
```

- [ ] **Step 2: 本地快速核对（node）**

Run:

```bash
node --input-type=module -e "
import { createRequire } from 'module';
// 直接内联断言逻辑副本：实现后改用 tsx 或手动对照
const cases = [
  [{ name: '张三', nickname: '小明' }, '张三', '微信：小明'],
  [{ name: '张三', nickname: '张三' }, '张三', null],
  [{ name: '', nickname: '小明' }, '小明', null],
  [{ name: null, nickname: null }, '用户', null],
];
console.log('实现后用手测/对照函数；本步仅确认文件已创建');
"
test -f apps/mp/src/utils/registration-display.ts && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/utils/registration-display.ts
git commit -m "$(cat <<'EOF'
feat(mp): 所有者展示优先报名姓名的纯函数

EOF
)"
```

---

### Task 2: 报名名单页

**Files:**
- Modify: `apps/mp/src/pages/organizer/registrations.vue`

- [ ] **Step 1: 引入工具并替换 `personName`**

在 `<script setup>` 增加：

```ts
import {
  displayRegistrationName,
  registrationWeixinSubtitle,
} from "@/utils/registration-display";
```

删除本地 `personName`，改为：

```ts
function personName(item: Registration) {
  return displayRegistrationName(item);
}

function weixinLine(item: Registration) {
  return registrationWeixinSubtitle(item);
}
```

- [ ] **Step 2: 模板增加次行**

在手机行之前插入（主名下方）：

```vue
            <text v-if="weixinLine(item)" class="meta">{{ weixinLine(item) }}</text>
            <text class="meta">手机：{{ item.phone || "—" }}</text>
```

保持 `personName(item)` 绑定在 `.name` 上不变。

- [ ] **Step 3: Commit**

```bash
git add apps/mp/src/pages/organizer/registrations.vue
git commit -m "$(cat <<'EOF'
fix(mp): 报名名单主标题改为报名姓名，昵称作次行

EOF
)"
```

---

### Task 3: 管理详情头像条

**Files:**
- Modify: `apps/mp/src/pages/organizer/detail.vue`

- [ ] **Step 1: 引入并替换 `personName`**

```ts
import { displayRegistrationName } from "@/utils/registration-display";
```

将：

```ts
function personName(person: Registration) {
  return person.nickname?.trim() || person.name?.trim() || "用户";
}
```

改为：

```ts
function personName(person: Registration) {
  return displayRegistrationName(person);
}
```

不在头像条加「微信：」次行（规格明确）。

- [ ] **Step 2: Commit**

```bash
git add apps/mp/src/pages/organizer/detail.vue
git commit -m "$(cat <<'EOF'
fix(mp): 管理详情报名头像条优先显示报名姓名

EOF
)"
```

---

### Task 4: 规格状态与手测

**Files:**
- Modify: `docs/superpowers/specs/2026-11-09-organizer-roster-display-name-design.md`

- [ ] **Step 1: 规格状态**

将文首 `- **状态：** Approved` 改为 `- **状态：** Implemented`，并在文首增加：

```markdown
- **实现计划：** [docs/superpowers/plans/2026-11-09-organizer-roster-display-name.md](../plans/2026-11-09-organizer-roster-display-name.md)
```

- [ ] **Step 2: 手测（开发者工具 / 真机）**

前置：API + `pnpm dev:mp-weixin` 已启；用所有者账号。

1. 准备一条报名：`name=张三`，用户昵称为不同值（如「小明」）  
2. 打开「我的活动 → 详情 → 报名名单」→ 主行「张三」，次行「微信：小明」，手机仍可见  
3. 管理详情头像条文案为「张三」  
4. 公开活动详情参加者仍为昵称（不出现报名姓名强制替换）  
5. 边界：姓名与昵称相同 → 无「微信：」次行；无姓名有昵称 → 主行昵称  

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-09-organizer-roster-display-name-design.md
git commit -m "$(cat <<'EOF'
docs: 报名姓名展示规格标为 Implemented

EOF
)"
```

---

## Spec coverage（自检）

| 规格项 | Task |
| --- | --- |
| 主名优先 `name` | Task 1–3 |
| 次行「微信：」仅名单页且与主名不同 | Task 1–2 |
| 管理详情只改主文案 | Task 3 |
| 公开详情不改 | 明确排除 |
| API 不改 | 明确排除 |
| 验收用例 | Task 4 |

无 TBD / 无跨任务签名不一致。
