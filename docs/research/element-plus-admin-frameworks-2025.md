# Element Plus 后台管理框架选型调研与对比结论

> **数据抓取时间：2026-11-01（Asia/Shanghai，本会话系统时间）。**
> 任务书写的口径是「2025 年底」，实际抓取时点比它晚约 11 个月。本文所有 star / 发版 / 提交日期都取**抓取时点的真实值**，不做回溯估算；若需要严格对齐 2025-12 的截面，请按各仓库 release / commit 日期自行回看（下文已给出精确日期，可据此还原）。
> 所有数字均来自 GitHub REST API、jsDelivr 读取的 `package.json` / `README` / `LICENSE`、Element Plus 官方文档与官方推荐列表，**没有凭记忆填写**。

---

## 0. 结论先行（先读这 6 条）

1. **Element Plus 生态里没有「官方全功能后台框架」**。Element Plus 官方只维护极简 starter（`element-plus-vite-starter`，1.4k star，无 RBAC、无 license 文件）；官方社区的 `awesome-element-plus` 的 Templates 列表里只认可 4 个：官方 starter、`element-plus-best-practices`、**vue-pure-admin**、**v3-admin-vite**。所以「官方生态」这条线索的价值是：它把 pure-admin 和 v3-admin-vite 视为社区共识度最高的两个 EP admin 模板。
2. **综合最优（EP 原生 + 现代工具链 + 结构克制 + MIT + 仍在活跃发版）：`un-pany/v3-admin-vite`**（7.1k star，v5.2.0 / 2026-07-10，2026-07 仍有提交）。
3. **功能最全、生态最大：`pure-admin/vue-pure-admin`**（20.7k star，v7.0.0 / 2026-04-07）。但完整版仓库约 440 MB、依赖 90+、工具链激进（Vite 8 / Vue Router 5 / Pinia 4 / TS 6 / **Node ≥22.22.1、pnpm ≥11**）。真实项目应使用其精简版 `pure-admin-thin`（3.1k star），但 thin 最后提交是 **2025-10-30**，已比完整版滞后约一年。
4. **`vbenjs/vue-vben-admin`（33.7k star）不是「Element Plus 框架」**。vben5 默认 UI 是自研 shadcn-vue + 主 playground 走 antdv-next，Element Plus 只是 `apps/web-ele` 一个适配应用（package version 5.8.0）。把它当 EP 框架选型会踩坑，只有「多产品线 + 多 UI 库 + 10 人以上团队」才值得。
5. **`Geeker-Admin`（8.1k star）的 ProTable 依旧是 EP 生态最好的表格封装**，但正式 release 停在 v1.2.0（2023-09-15），只有零散 commit（最近 2026-07-29），无 CI、无 Docker、mock 依赖外部平台 —— 「可用但低强度维护」。
6. **`newbee-ltd/vue3-admin` 直接排除：GPL-3.0 + 停更（最后 commit 2023-03-15）**。GPL-3.0 对闭源商业后台是法务级别的否决项。`cool-admin-vue` 只有在你采用它的 Node 后端（cool-admin-midway/egg）时才成立，前端与它的 CRUD 契约强耦合，套 NestJS 是负收益。

**针对你的项目（4 页面、约 1,000 行、无 pinia 的小后台）：选「借鉴框架的布局与设计系统，在原项目内重构 UI」，不要整体迁移。** 详见第 7 节（含人日级成本估算与切换触发条件）。

---

## 1. 调研方法与数据口径

| 项 | 说明 |
| --- | --- |
| 数据源 | `api.github.com/repos/{owner}/{repo}`（star / fork / license / pushed_at / 默认分支）、`/releases?per_page=2`、`/commits?per_page=1`、`/contents`（目录结构、CI 工作流）、`cdn.jsdelivr.net`（读 `package.json` / `README.md` / `LICENSE`） |
| 抓取时间 | 2026-11-01，单次抓取，未做多日趋势 |
| star 口径 | GitHub `stargazers_count`，抓取时点值 |
| 「最近提交」口径 | 默认分支最新 commit 的 author date（UTC，只取到日） |
| 「是否 Element Plus」判定 | 依据仓库 description / topics / `package.json` 依赖 / EP 官方推荐列表，三方交叉核对 |
| 未核验项 | 表格中写「未核验」的格子表示没有找到一手证据，不猜测 |

---

## 2. 核心数据总表（抓取日 2026-11-01）

| 项目 | 仓库 | Star | License | 最新版本 / 日期 | 最近提交 | 是否 EP | 维护状态 |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| vue-pure-admin（完整版） | [pure-admin/vue-pure-admin](https://github.com/pure-admin/vue-pure-admin) | **20,724** | MIT | v7.0.0 / 2026-04-07 | 2026-10-12 | ✅ 原生 | 活跃（近 3 年持续发版） |
| pure-admin-thin（精简版） | [pure-admin/pure-admin-thin](https://github.com/pure-admin/pure-admin-thin) | **3,056** | MIT | v6.2.0 / 2025-10-30 | 2025-10-30 | ✅ 原生 | 低速（滞后完整版约 1 年） |
| vue-vben-admin（vben5） | [vbenjs/vue-vben-admin](https://github.com/vbenjs/vue-vben-admin) | **33,717** | MIT | v5.7.0 / 2026-05-21 | 2026-10-31 | ⚠️ 可选适配（`apps/web-ele`） | 非常活跃 |
| v3-admin-vite | [un-pany/v3-admin-vite](https://github.com/un-pany/v3-admin-vite) | **7,070** | MIT | v5.2.0 / 2026-07-10 | 2026-07-11 | ✅ 原生 | 活跃（单人主导） |
| vue-element-plus-admin（v3） | [kailong321200875/vue-element-plus-admin](https://github.com/kailong321200875/vue-element-plus-admin) | **3,697** | MIT | v3.1.0 / 2026-09-01 | 2026-09-01 | ✅ 原生 | 活跃（v3 刚重构，142 open issues） |
| Geeker-Admin | [HalseySpicy/Geeker-Admin](https://github.com/HalseySpicy/Geeker-Admin) | **8,100** | MIT | v1.2.0 / 2023-09-15 | 2026-07-29 | ✅ 原生 | 低强度维护（无正式发版 2 年+） |
| cool-admin-vue（8.x） | [cool-team-official/cool-admin-vue](https://github.com/cool-team-official/cool-admin-vue) | **2,449** | MIT（LICENSE 文件） / GitHub 识别 NOASSERTION | 8.0.0（无正式 release tag） | 2025-12-17 | ✅ 原生 | 低频（配套商业后端） |
| newbee vue3-admin | [newbee-ltd/vue3-admin](https://github.com/newbee-ltd/vue3-admin) | **3,468** | **GPL-3.0** | 无正式 release | **2023-03-15** | ✅（EP 2.2 旧版） | **已停更** |
| element-plus-vite-starter（官方） | [element-plus/element-plus-vite-starter](https://github.com/element-plus/element-plus-vite-starter) | **1,414** | 无 LICENSE 文件 | 无 release（滚动提交） | 2026-09-06 | ✅ 官方 | 维护（极简模板） |
| *（参照）Element Plus 本体* | [element-plus/element-plus](https://github.com/element-plus/element-plus) | **27,833** | MIT | 2.14.7 / 2026-09-30 | 2026-11-01 | ✅ | 非常活跃 |
| *（参照）vue-manage-system* | [lin-xin/vue-manage-system](https://github.com/lin-xin/vue-manage-system) | **19,586** | MIT | — | **2024-08-17** | ✅ | 停滞，不推荐 |

补充信号（同一时点）：open issues 数为 pure-admin **2**、vben **45**、v3-admin-vite **25**、Geeker **78**、vue-element-plus-admin **142**、cool-admin **25**、newbee **5**。仓库体积（GitHub `size`，KB）：pure-admin ≈ 440 MB、v3-admin-vite ≈ 53 MB、vben ≈ 48 MB、Geeker ≈ 29 MB、cool-admin ≈ 19 MB、kailong ≈ 10 MB —— 对「克隆 → 学会 → 裁剪」的上手成本有直接影响。

---

## 3. 技术栈对比（以各仓库默认分支 `package.json` 为准，2026-11-01）

| 项目 | 构建 | 状态管理 | 样式 / CSS 方案 | TS | i18n | 内置 Mock | 工程形态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vue-pure-admin 7.x | Vite **8.3** | Pinia **4** | Tailwind **4** + SCSS + stylelint | **TS 6** | `vue-i18n` 11 | `vite-plugin-fake-server` | 单应用（巨型 demo 集） |
| pure-admin-thin 6.2 | Vite 7 线 | Pinia | Tailwind + SCSS | TS 5/6 线 | 分「非国际化 / 国际化」两个分支 | 有 | 单应用（精简） |
| vben 5.x | Vite（monorepo catalog）+ Turborepo 风格包管理 | Pinia | Tailwind **4** + shadcn-vue（默认） | TS | ✅ 完整 | `apps/backend-mock` | **pnpm monorepo，多 UI 适配应用** |
| v3-admin-vite 5.2 | Vite **7.3** | Pinia **3** | **UnoCSS** 66 + SCSS + CSS 变量 | TS 5.9 | ❌ 无 | ❌ 无（直连后端） | 单应用（结构最简） |
| vue-element-plus-admin 3.x | Vite **8** | Pinia **4** | **UnoCSS** + CSS 变量 | TS（catalog） | ✅ `vue-i18n` 11 | ✅ 内置（可打进生产演示） | **pnpm workspace**（`apps/admin` + `apps/docs` + 4 个 `packages/*`） |
| Geeker-Admin | Vite **6.3** | Pinia 3 + 持久化插件 | SCSS + PostCSS | TS 5.8 | ✅ `vue-i18n` 11 | △ 依赖 fastmock / easymock 在线平台 | 单应用 |
| cool-admin-vue 8.x | Vite **5.4** | Pinia 2.3 | Tailwind **3** | TS 5.5 | ✅ `vue-i18n` 11 | 未核验 | 单应用 + 私有 CRUD 内核 |
| newbee vue3-admin | Vite **2.1** | ❌ 无 pinia | SCSS | ❌ 纯 JS | ❌ | ❌ | 单应用（教学项目） |
| element-plus-vite-starter | Vite | ❌ | 原生 CSS | ✅ | ❌ | ❌ | 单应用（≈ 10 个文件） |

> ⚠️ 版本落差提示：`pure-admin 7.x` 的 `engines` 明确要求 **Node ≥ 22.22.1、pnpm ≥ 11**；`v3-admin-vite` README 要求 Node 20.19+ / 22.12+、pnpm 10+；`vue-element-plus-admin v3` 要求 Node ^20.19 ‖ ^22.13 ‖ ≥24、pnpm ≥ 9.5（与你们当前 pnpm 9.15 最接近）。`Geeker-Admin` 是唯一仍用 **vue-router 4.x** 的候选，对现有代码的兼容摩擦最小。

---

## 4. 内置能力矩阵

图例：✅ 内置 / △ 部分或需自行补 / ❌ 无 / — 未核验

| 项目 | RBAC / 按钮权限 | 后端动态路由 | 暗黑模式 | 表格封装 | 表单封装 | CRUD 生成 | 多布局 / 标签页 | Docker | CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vue-pure-admin | ✅ | ✅ | ✅ | ✅ `@pureadmin/table` + `RePureTableBar` | ✅ `plus-pro-components` 生态 | ❌ | ✅ 多布局 + 标签页 | ✅ 提供 Dockerfile | △ 仅 lint / pages |
| vben 5 | ✅ `@vben/access` | ✅ | ✅ + 偏好设置面板 | ✅ VxeTable 封装 | ✅ schema 表单 | ❌ | ✅ 多布局 + 标签页 | ✅ | ✅ build / ci / deploy / CodeQL |
| v3-admin-vite | ✅ 页面级 + 按钮级指令 | ✅（v5.2 新增，接口下发路由） | ✅ 三主题 | △ 未提供重型封装（带 `vxe-table` 依赖） | △ 基础封装 | ❌ | ✅ 三种布局 + 标签页 | ❌ | △ deploy / release |
| vue-element-plus-admin v3 | ✅ 服务端路由 + 按钮权限 | ✅（核心设计） | ✅ | △ 刻意不提供重型 Table 封装 | ✅ `useForm` hooks | △ `useCrud` hooks（半自动） | ✅ 四种布局 + TagsView | 未提及 | ✅ ci / release |
| Geeker-Admin | ✅ 动态路由 + 按钮权限指令 | ✅ | ✅ | ✅ **ProTable（列配置化，生态最佳）** | ✅ 常用组件封装 | ❌ | ✅ + 数据大屏 | ❌ | ❌ |
| cool-admin-vue | ✅ | ✅ | — | ✅ | ✅ | ✅ `@cool-vue/crud` + AI 生成 | ✅ | — | — |
| newbee vue3-admin | ❌（仅登录态） | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| element-plus-vite-starter | ❌ | ❌ | ✅（示例里切换） | ❌ | ❌ | ❌ | ❌ | ❌ | 未核验 |

---

## 5. 逐个点评

### 5.1 vue-pure-admin（20.7k star / MIT / v7.0.0 2026-04-07）

- **定位**：EP 生态事实上的「全家桶」模板。`@pureadmin/table`、`@pureadmin/utils`、`@pureadmin/descriptions`、`@pureadmin/cli` 形成了独立生态，中文文档与配套视频完整。
- **技术栈**：Vue 3.5 + Vite 8（Rolldown/Oxc）+ EP 2.14.7 + Pinia 4 + Tailwind 4 + TS 6 + vue-router 5。
- **能力**：RBAC、动态路由、i18n、暗黑、标签页、四类布局、表格/描述列表封装、Docker、mock。**没有**代码生成器。
- **活跃度**：极活跃，近三年每年两次以上发版；open issues 仅 2，说明维护响应积极。但 v7 已上 Rolldown/Oxc、TS 6、Router 5 —— **走在生态最前沿也意味着踩坑最先**。
- **上手成本：高**。完整版是「组件演示厅」，`package.json` 依赖 90+（含 mqtt、xgplayer、logicflow、vditor 等与后台无关的重型库），克隆体积约 440 MB。README 自己建议实际项目用精简版。
- **适合**：5–20 人、页面 30+、需要大量现成组件示例与设计参考的中大型团队；也适合作为「抄布局/抄封装」的源码库。
- **主要风险**：直接整迁会把 Node/pnpm 主版本抬到 22/11，与你们的 uni-app + pnpm 9 monorepo 冲突。

### 5.2 pure-admin-thin（3.1k star / MIT / v6.2.0 2025-10-30）

- 完整版的「主体功能骨架」，分「非国际化 / 国际化」两个分支，官方称打包后 < 2.3 MB（brotli+CDN 可到 350 KB 级）。
- **但**：最后提交 2025-10-30，而完整版已到 2026-10，README 承诺的「永久同步完整版代码」在数据上并不及时。适合**取用**，不适合作为长期跟踪的上游。
- 适合：1–5 人小团队，想要「pure-admin 的质感 + 可控体积」。

### 5.3 vbenjs/vue-vben-admin（33.7k star / MIT / v5.7.0 2026-05-21）

- **关键事实**：仓库 description 是 "built with Vue3, **Shadcn UI**, Vite, TypeScript, and Monorepo"；`apps/` 下有 `web-antd`、`web-antdv-next`、`web-ele`、`web-naive`、`web-tdesign` 五个适配应用，v5.6.1 的 changelog 里还有 `refactor: playground use antdv-next`。**所以「vben5 默认 EP」是错的**：EP 是并列适配之一，文档、示例、默认 playground 的重心都不在 EP。
- 能力最全（access 权限包、偏好设置、i18n、主题、ViteTable/表单 schema、backend-mock、Docker、CodeQL），工程化程度最高（sonar、codeql、多 workflow）。
- **上手成本：极高**。monorepo + 40 个左右 workspace 包 + catalog 版本管理，先学框架再写业务是常态。
- **适合**：10 人以上、多产品线、需要同时支持 antd/EP/naive 多 UI 的团队。**不适合**只为 4 个 EP 页面选型。

### 5.4 v3-admin-vite（7.1k star / MIT / v5.2.0 2026-07-10）— 综合推荐第一

- **定位**：极简 EP 模板，「不做复杂封装、不做类型体操，够用就好」，注释详尽，结构一眼能读完。
- 技术栈：Vue 3.5.39 + Vite 7.3.6 + EP 2.14.2 + Pinia 3 + UnoCSS 66 + vue-router 5.1 + vitest；带 `vxe-table`。
- v5.2 补上了**后端下发的动态路由权限**（此前只有前端路由表 + 按钮权限），这条补齐后，它与大框架的差距主要只剩「i18n」和「重型表格封装」。
- **明确短板**：无 i18n、无内置 mock、无 Docker（README 未提供），CI 只有 deploy/release。
- 项目本身是「AI friendly」导向（AGENTS.md / CLAUDE.md / skills / `vite-plugin-mcp`），对 AI 辅助开发友好，这点与你们仓库的文档驱动 + AI 协作方式契合。
- **适合**：1–5 人团队、5–30 页、想「拿来即用但不被框架绑架」。

### 5.5 vue-element-plus-admin（kailong，3.7k star / MIT / v3.1.0 2026-09-01）

- 2026-08 做了不兼容重构：**pnpm workspace**（`apps/admin`、`apps/docs` + `packages/{components,hooks,request,styles}`），核心设计是**服务端下发路由树**（只保留 layout/login/redirect/error 四条静态路由）。
- 明确的产品取舍：「lean UI layer，不提供 BaseButton 和配置化 Table/Search/Dialog 包装」，只给 `useCrud` / `useForm` hooks —— 这与 v3-admin-vite 的取向接近，但工程分层更正式（可被多应用复用）。
- 技术栈最新（Vite 8 / Router 5 / Pinia 4 / UnoCSS / ECharts 6 / VitePress 文档站），Node 20.19+、pnpm ≥ 9.5 —— **pnpm 要求与你们仓库一致**。
- 风险：v3 刚重构完，142 个 open issues，API 与文档仍在收敛；社区规模只有 v3-admin-vite 的一半。
- **适合**：3–15 人、计划「一个后台壳 + 多个业务应用」复用、能接受跟着 v3 演进的中型团队。

### 5.6 Geeker-Admin（8.1k star / MIT / v1.2.0 2023-09-15）

- **核心资产是 ProTable**：基于 EP 二次封装、纯 columns 配置驱动，是 EP 生态公认最好用的表格方案；另有 KeepAlive 多级路由缓存、权限/复制/水印/拖拽/节流等指令集、数据大屏。
- 技术栈偏稳：Vue 3.5 + Vite 6.3 + EP 2.9.8 + Pinia 3 + **vue-router 4.5** + i18n 11。
- 维护画像：正式 release 停在 2023-09（v1.2.0），2026-07-29 仍有 commit（改 env 的 API 地址），**无 CI、无 Docker、mock 依赖 fastmock/easymock 在线服务**。属于「作者还在，但项目不再发布版本」。
- **适合**：2–10 人、表格密集型 CRUD 后台；愿意自己接手维护。
- **不适合**：需要长期跟随上游升级、或要求供应链规范的团队。

### 5.7 cool-admin-vue（2.4k star / LICENSE 为 MIT，GitHub 识别 NOASSERTION / 8.0.0）

- 前端本身质量不错（EP 2.10 + pinia + tailwind + i18n + `@cool-vue/crud` 配置化 CRUD + AI 生成页面），但**它是 cool-admin 全栈方案的前端**，README 明确配套后端是 `cool-admin-midway`。
- 对你们（NestJS 后端）意味着：要么放弃自己的 API 约定去适配 cool 的 CRUD 契约，要么只用它的 UI 外壳 —— 两头都不划算。
- 另注：仓库 API 的 `license` 字段是 `NOASSERTION`（GitHub 没识别出标准 license），但 8.x 分支的 `LICENSE` 文件是标准 MIT（版权方「厦门闪酷科技开发有限公司」，2025）。企业使用建议以 LICENSE 文件为准并留存快照。
- **结论**：仅当采用 cool-admin 后端时选用。

### 5.8 newbee-ltd/vue3-admin（3.5k star / **GPL-3.0** / 2023 停更）— 直接排除

- 最后 commit 2023-03-15，技术栈是 Vue 3.2 + Vite **2.1** + EP 2.2 + 无 TypeScript + 无 pinia，本质是《Vue3 企业级项目开发》课程的配套代码。
- **GPL-3.0**：如果后台是闭源商业系统，分发/网络使用都可能触发传染性义务；你们仓库已有 `deploy/` 交付形态，这是硬否决项。
- 唯一价值：作为「EP 后台入门教学」参考，不可作为代码来源。

### 5.9 Element Plus 官方生态里的 admin starter

- 官方维护的模板只有极简款：`element-plus-vite-starter`（1,414 star，最后提交 2026-09-06，**仓库无 LICENSE 文件**）、`element-plus-webpack4-starter`、`element-plus-webpack5-starter`、`element-plus-nuxt-starter`（README 标注 WIP）。这些是「Vite + EP + 路由」的最小起手式，**不含权限、布局、表格封装**。
- 官方认可的社区清单 `sxzz/awesome-element-plus` 的 **Templates** 段只有 4 条：官方 starter、`element-plus-best-practices`（sxzz，最佳实践示例）、**vue-pure-admin**、**v3-admin-vite**。
- 结论：EP 生态的「官方背书」= 官方 starter（入门）+ 社区两个 admin 模板（pure-admin / v3-admin-vite）；kailong 的 vue-element-plus-admin 与 Geeker 属于高 star 但不在该清单内。

---

## 6. 推荐排序

### 6.1 通用排序（新项目从零起步）

| 排名 | 项目 | 推荐理由 | 什么情况下不选 |
| ---: | --- | --- | --- |
| 1 | **v3-admin-vite** | EP 原生、MIT、结构最简、活跃、v5.2 补齐动态路由、AI 友好、上手最快 | 需要 i18n / 重型表格封装 / 大量现成业务组件 |
| 2 | **pure-admin-thin**（源码参考用完整版） | 功能最全、文档/视频/CLI 生态最成熟、设计质感最好 | 团队小、Node/pnpm 主版本不能抬；不能接受 1 年同步滞后 |
| 3 | **vue-element-plus-admin v3** | 工程分层最好（workspace packages + 服务端路由 + 文档站），Node/pnpm 要求与现仓库最匹配 | 不能接受 v3 重构期的不稳定、或需要成熟稳定的社区答案 |
| 4 | **Geeker-Admin** | ProTable 无可替代，表格型后台开发效率最高 | 需要正规发版节奏 / CI / Docker，或要求「上游持续升级」 |
| 5 | **vben 5** | 工程化天花板、多 UI 适配、超大团队协作范式 | 只想用 Element Plus；团队 < 10 人 |
| 6 | **cool-admin-vue** | CRUD 生成 + 模块化插件化 | 后端不是 cool-admin |
| 7 | **element-plus-vite-starter** | 官方最小起手式，适合学习/写 demo | 需要后台框架能力 |
| — | ~~newbee vue3-admin~~ | GPL-3.0 + 停更 + 无 TS | 任何商业场景 |
| — | ~~lin-xin/vue-manage-system~~ | 19.6k star 但 2024-08 后无提交 | 已进入维护停滞 |

### 6.2 一句话选型口诀

- 想「少即是多」→ **v3-admin-vite**
- 想「什么都有、照着抄」→ **vue-pure-admin / thin**
- 想「工程规范、可持续演进」→ **vue-element-plus-admin v3**
- 想「表格 CRUD 快」→ **Geeker-Admin**
- 想「多端多 UI 大中台」→ **vben**
- 后端是 cool-admin → **cool-admin-vue**

---

## 7. 针对本仓库：迁移 vs 借鉴重构

### 7.1 现状量化（实测，非估计）

`apps/admin`（`@activity/admin`）：

| 项 | 现状 |
| --- | --- |
| 代码量 | **1,035 行**（`main.ts` 7、`router.ts` 46、`App.vue` 20、`api/*` 233、4 个页面 714） |
| 页面 | 登录 / 用户 / 活动 / 审计日志（4 个） |
| 依赖 | `element-plus ^2.14.7`、`@element-plus/icons-vue`、`vue ^3.5.13`、`vue-router 4`、`@activity/shared`（workspace） |
| 缺失 | 无 pinia、无 i18n、无 UnoCSS/Tailwind、无 mock、无权限指令（仅 `meta.roles` + 全局守卫） |
| 工具链 | 根 `pnpm@9.15.0`、`node>=20`；admin 用 Vite 5.4 + vue-tsc 2.x；同一 monorepo 内 `apps/mp` 锁 uni-app + Vue 3.4.21 + Vite 5.2.8 + Pinia 2.1.7 |
| 后端 | NestJS（`apps/api`），已有 `deploy/` 的 Docker+Nginx 单机方案 |

关键点：**1,035 行是一个「已经跑通、接口已对齐、能交付」的资产**。任何「整框架迁移」都是在替换它，而不是在它上面加功能。

### 7.2 方案 A：整框架迁移（换掉 `apps/admin`）的真实成本

以最合适的 **v3-admin-vite 5.2** 为基线估算（单人、熟悉 Vue3、不含后端接口重构）：

| 工作项 | 人日 | 说明 |
| --- | ---: | --- |
| monorepo 工具链升级 | 1.5–3 | admin 的 Vite 5→7、vue-router 4→5、补 pinia 3/UnoCSS；根 `pnpm` 9→10、Node 20.x→22.x；`apps/mp` 的 uni-app 链需回归验证 |
| 框架学习 + 裁剪 | 2–4 | 删 demo、理清目录约定、权限/路由/请求三套约定 |
| 4 个页面重写 + NestJS 契约适配 | 3–5 | 响应包裹（框架普遍假设 `{code,data,message}`）、token 头、分页参数、错误处理都要写适配层 |
| 权限模型对齐 | 2–4 | 后端要新增「下发路由/按钮」接口，或改造框架走静态路由 |
| 部署 / CI / nginx base 回归 | 1–2 | `deploy/` 的镜像构建与 base path |
| **合计** | **9.5–18 人日** | ≈ 2–4 周，且是「有中断风险」的大 PR |

若选 pure-admin 7.x，还要额外承担 Node ≥22.22.1 + pnpm ≥11 的硬门槛（其 `engines` 明确写死），以及 Tailwind 4 + Vite 8 的迁移面 —— 成本上浮 30–50%。若选 kailong v3，Node/pnpm 门槛匹配，但 Vite 8 / Router 5 仍在，且要接受「v3 重构期 + 142 open issues」的不确定性。若选 Geeker，工具链最省（router 4 兼容），但等于把上游冻结在 2023 年的发版线上。

**收益**：立刻获得成熟布局（多布局/标签页/面包屑/主题编辑器）、i18n、按钮权限、表格/表单封装、403/404、文档与社区答案。

### 7.3 方案 B：借鉴布局与设计系统，在原项目内重构 UI

| 工作项 | 人日 | 说明 |
| --- | ---: | --- |
| 布局壳（`el-container` + `el-menu` 路由模式 + 折叠/响应式抽屉 + Header/面包屑/用户菜单） | 2–3 | 约 300–500 行，直接由现有 `router` 的 `meta` 生成菜单 |
| 设计 token + 暗黑模式 | 0.5–1 | EP 2.14 原生支持 `html.dark` + CSS 变量，覆盖 `--el-color-primary` 等 |
| 通用封装（`PageContainer` / `SearchForm` / `ProTable-lite` / `useTable` / `useDialog` / `v-auth`） | 2–4 | 参照 v3-admin-vite 与 Geeker，按需实现，控制总量 < 600 行 |
| 4 个页面迁到新壳 + 交互统一 | 2–3 | 只改视图层，`api/*` 与路由守卫不动 |
| *可选* 引入 pinia 管 auth/profile | 0.5–1 | 也可继续用现在的模块级状态 |
| **合计** | **7–12 人日** | 可拆成 5–6 个独立可回滚的 PR，**零工具链风险** |

**收益**：保留全部既有资产与 monorepo 一致性；包体最小；无上游 API 变更/大版本升级负担；无 license 传导。

### 7.4 结论：**选 B（借鉴重构），不建议整体迁移**

理由按权重排序：

1. **规模不匹配**。4 个页面 / 1,035 行，属于「布局壳 + 两个封装」就能覆盖的量级。整框架迁移要引入数万行模板代码、几十个依赖、一套你不一定需要的抽象（多布局、偏好设置、mock、CDN 替换……），**维护面积膨胀 20–50 倍，而业务需求只值 1,000 行**。
2. **工具链冲突是硬成本**。你们 monorepo 里 `apps/mp` 锁在 uni-app 的 Vue 3.4.21 / Vite 5.2.8，根 `pnpm@9.15.0` + `node>=20`。主流 EP 框架已经跑到 Vite 7/8 + Router 5 + Pinia 3/4，pure-admin 更是要 Node 22.22 + pnpm 11。为一个 4 页后台抬整仓工具链，收益/风险比很差。
3. **后端契约定制成本高**。框架普遍自带请求封装与响应包裹约定，而你们的 NestJS 契约已经稳定（`apps/admin/src/api/http.ts` 123 行）。迁移必然要写适配层，等于「为框架改自己的后端契约」，方向反了。
4. **借鉴路径的成本已足够低**。布局壳 + 设计 token + 3 个 composable 约 7–12 人日，且可以增量交付：第一个 PR 只换布局，第二个 PR 统一表格页，随时可停。
5. **未来仍然可切换**。选 B 不锁死方向：一旦页面数上来了，`apps/admin` 的结构（layout/components/composables 分层）本身就是平滑迁移到 v3-admin-vite 的最佳前置条件。

**唯一应该选 A 的情形**：6 个月内 admin 会变成「10+ 页面 + 多角色数据权限 + 多语言 + 多主题」的重量级中后台，且团队有 2 人以上专职前端 —— 此时框架的前置投入才能被摊薄。

### 7.5 具体「借什么、从哪借」

| 需要的东西 | 借鉴来源 | 怎么用 |
| --- | --- | --- |
| 整体布局 / 菜单 / 面包屑 / 标签页 | **vue-pure-admin**（视觉与交互）、**v3-admin-vite**（实现更简） | 抄结构与交互，重写为 300–500 行，不引入其依赖 |
| 设计 token / 暗黑模式 / 主题色 | Element Plus 2.14 原生 CSS 变量 + pure-admin 的变量命名 | `html.dark` + `--el-*` 覆盖 |
| 表格页范式（搜索 + 工具栏 + 分页 + 列配置） | **Geeker ProTable**（columns 配置思路） | 做一个 150 行 `ProTableLite`，不要照搬 800 行的 ProTable |
| `useTable` / `useCrud` / `useForm` | **v3-admin-vite**（最克制）、**kailong v3 的 `@vea/hooks`** | MIT，复制后保留版权声明 |
| 按钮级权限 | v3-admin-vite 的 `v-auth` 指令 | 与现有 `meta.roles` 守卫合并，不引入后端动态路由 |
| i18n / mock / Docker | — | 你们当前**不需要**：单一中文运营后台，后端已就绪，`deploy/` 已有 Docker 方案 |

### 7.6 触发「整体切换框架」的量化条件（任一满足即重新评估）

- admin 页面数 ≥ 12–15 个，或新增「多租户 / 多角色数据权限 / 多语言」中 ≥ 2 项；
- 需要「后端下发菜单 + 按钮权限」且后端愿意新增菜单接口；
- 前端专职人力 ≥ 2 人且能接受 2 周一次性迁移；
- 现有自研壳的维护成本连续 2 个迭代超过「迁移摊薄成本」。

满足时优先级：**v3-admin-vite > vue-element-plus-admin v3 > pure-admin-thin > Geeker**（若届时仍只做表格 CRUD 且能接受低维护上游，Geeker 可提前）。

### 7.7 建议的落地拆分（方案 B）

1. **PR1（1–2 天）**：新增 `src/layouts/AdminLayout.vue` + 由 `router` 生成菜单；所有页面套进 layout；`App.vue` 只留 `<RouterView/>`。验收：4 个页面外观不变但有了侧边栏/头部/用户菜单，路由守卫逻辑零改动。
2. **PR2（1 天）**：`styles/tokens.scss` + 暗黑模式开关（`html.dark`），Header 右上角切换。验收：刷新后主题持久化。
3. **PR3（2–3 天）**：`components/ProTableLite.vue` + `composables/useTable.ts`，先把「用户」「活动」两个列表页迁过去。验收：搜索/分页/加载/空态行为与旧版一致。
4. **PR4（1 天）**：`v-auth` 指令 + `usePermission`，把 `meta.roles` 的写法收敛成统一 API；审计日志页接入。
5. **PR5（1 天）**：`PageContainer` + `SearchForm` 统一 4 个页面骨架，清理重复样式。
6. **可选 PR6（0.5 天）**：pinia `useAuthStore`（仅当页面间共享状态开始变多时再加）。

每步都可以独立上线、独立回滚，且**不触碰 `apps/mp` 与 `apps/api`**。

### 7.8 迁移成本对照（结论表）

| 维度 | 方案 A 整框架迁移 | 方案 B 借鉴重构 |
| --- | --- | --- |
| 一次性成本 | 9.5–18 人日（pure-admin 需 +30–50%） | **7–12 人日** |
| 工具链风险 | 高（Vite 5→7/8、Router 4→5、pnpm 9→10/11、Node 20→22） | **无** |
| monorepo 影响 | 全仓（lockfile、engines、mp 回归） | 仅 `apps/admin` |
| 后端改动 | 通常需要（响应包裹 / 菜单接口） | **不需要** |
| 维护面积 | 数万行模板代码 + 上游升级跟踪 | ~1,000 行自有代码 |
| License 风险 | 需逐个核对（newbee 为 GPL-3.0） | 仅借鉴 MIT 片段，保留声明 |
| 立即获得的能力 | 多布局/i18n/主题编辑器/403/404/成熟表格封装 | 布局/暗黑/表格封装（i18n 等按需再加） |
| 可回滚性 | 差（大 PR） | **好（按 PR 增量）** |

---

## 8. 风险与合规提示

1. **License**：MIT 项目（pure-admin / v3-admin-vite / vue-element-plus-admin / Geeker / vben / cool-admin 的 LICENSE 文件）可商用，但**保留版权与许可声明**；`newbee vue3-admin` 是 **GPL-3.0**，闭源商用应排除；`element-plus-vite-starter` 仓库**没有 LICENSE 文件**，直接复制其代码有授权不确定性（代码量极小，建议自己写）。
2. **「免费开源」≠「无商业后端」**：pure-admin 有付费服务页、Geeker 有 React 付费版、cool-admin 配套商业后端；使用开源部分没问题，但不要把「文档里提到的付费能力」当成内置能力。
3. **工具链前沿风险**：pure-admin v7 与 kailong v3 已上 Vite 8（Rolldown/Oxc）/ TS 6；生产项目应先在 side branch 验证再合入。
4. **供应链**：模板类仓库依赖多，整迁会把 90+ 依赖（含 `xlsx`、`vditor`、`mqtt` 等）带入构建面。方案 B 可以做到「零新增运行时依赖」。
5. **数据时效**：star 是抓取时点值，本文所有日期见第 2 节；决策前建议再跑一次确认（尤其 Geeker、pure-admin-thin、cool-admin 这类低频仓库）。

---

## 9. 参考链接

**候选仓库与发版**

- [pure-admin/vue-pure-admin](https://github.com/pure-admin/vue-pure-admin) · [releases](https://github.com/pure-admin/vue-pure-admin/releases) · [v7.0.0](https://github.com/pure-admin/vue-pure-admin/releases/tag/v7.0.0) · [在线预览](https://pure-admin.github.io/vue-pure-admin) · [文档](https://pure-admin.cn/)
- [pure-admin/pure-admin-thin](https://github.com/pure-admin/pure-admin-thin)
- [vbenjs/vue-vben-admin](https://github.com/vbenjs/vue-vben-admin) · [releases](https://github.com/vbenjs/vue-vben-admin/releases) · [v5.7.0](https://github.com/vbenjs/vue-vben-admin/releases/tag/v5.7.0) · [文档](https://doc.vben.pro/) · [Element Plus 适配应用 apps/web-ele](https://github.com/vbenjs/vue-vben-admin/tree/main/apps/web-ele)
- [un-pany/v3-admin-vite](https://github.com/un-pany/v3-admin-vite) · [releases](https://github.com/un-pany/v3-admin-vite/releases) · [v5.2.0](https://github.com/un-pany/v3-admin-vite/releases/tag/v5.2.0) · [在线预览](https://un-pany.github.io/v3-admin-vite)
- [kailong321200875/vue-element-plus-admin](https://github.com/kailong321200875/vue-element-plus-admin) · [releases](https://github.com/kailong321200875/vue-element-plus-admin/releases) · [v3.1.0](https://github.com/kailong321200875/vue-element-plus-admin/releases/tag/v3.1.0) · [在线 demo](https://element-plus-admin.cn/)
- [HalseySpicy/Geeker-Admin](https://github.com/HalseySpicy/Geeker-Admin) · [releases](https://github.com/HalseySpicy/Geeker-Admin/releases) · [在线预览](https://admin.spicyboy.cn) · [文档](https://docs.spicyboy.cn)
- [cool-team-official/cool-admin-vue](https://github.com/cool-team-official/cool-admin-vue) · [配套后端 cool-admin-midway](https://github.com/cool-team-official/cool-admin-midway) · [文档](https://cool-js.com)
- [newbee-ltd/vue3-admin](https://github.com/newbee-ltd/vue3-admin)（GPL-3.0，停更）
- [lin-xin/vue-manage-system](https://github.com/lin-xin/vue-manage-system)（参照，2024-08 后停滞）

**Element Plus 官方与生态**

- [element-plus/element-plus](https://github.com/element-plus/element-plus) · [2.14.7 release](https://github.com/element-plus/element-plus/releases/tag/2.14.7) · [官网](https://element-plus.org/)
- [element-plus/element-plus-vite-starter](https://github.com/element-plus/element-plus-vite-starter) · [在线预览](https://vite-starter.element-plus.org)
- [sxzz/awesome-element-plus](https://github.com/sxzz/awesome-element-plus)（官方认可社区清单，Templates 段列出 pure-admin / v3-admin-vite）
- [sxzz/element-plus-best-practices](https://github.com/sxzz/element-plus-best-practices)

**数据抓取接口（可复现）**

- `https://api.github.com/repos/{owner}/{repo}`、`/releases?per_page=2`、`/commits?per_page=1`、`/contents/{path}`
- `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/package.json`（及 `README.md` / `LICENSE`）

---

### 附：本文档信息

| 项 | 值 |
| --- | --- |
| 文档路径 | `docs/research/element-plus-admin-frameworks-2025.md` |
| 数据抓取日期 | 2026-11-01（Asia/Shanghai） |
| 覆盖候选 | 9 个主候选 + 3 个参照 |
| 结论 | 通用选型第一：v3-admin-vite；本项目：借鉴重构（方案 B），不整体迁移 |
