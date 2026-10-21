# 小程序 Urban Editorial 视觉改版设计规格

- **日期：** 2026-10-21  
- **状态：** Accepted  
- **视觉规范：** [docs/design/mp-urban-editorial.md](../../design/mp-urban-editorial.md)（v1.1）  
- **范围：** 仅 `apps/mp`；不改 API / Admin / 报名状态机

## 1. 目标

把小程序从默认冷灰，换成 Urban Editorial：米白底、青绿主色、统一 4px 间距。全部现有页都改；用一二级页壳区分 Tab 页与栈页。不改业务逻辑与接口。

成功标准：H5/`mp-weixin` 下首页、详情、报名、我的、发布链路视觉与 v1.1 tokens 一致；主按钮为全胶囊；对比度足够扫读。

## 2. 已确认决策

| 项 | 结论 |
| --- | --- |
| 范围 | 小程序全部页 |
| 分层 | Tab（首页、我的）= 一级；其余栈页 = 二级 |
| 实现 | `uni.scss` tokens + `.page-l1` / `.page-l2`；不先抽组件库 |
| 品牌绿 | `#1E9B88`（比 v1.0 `#286F62` 更亮）；浅底 `#D4F3EC`；标签字 `#157A6A` |
| 按钮 | 主/次全胶囊；输入框 12px 圆角；卡片 16px |
| 规范入库 | `docs/design/mp-urban-editorial.md` |
| 非目标 | Admin、OSS 封面、新插画、改 tab 文案/信息架构、支付 UI |

## 3. 实现落点

| 路径 | 作用 |
| --- | --- |
| `apps/mp/src/uni.scss` | 写入 v1.1 色彩/间距变量（可保留 uni 默认变量，业务改用 `$ed-*`） |
| `apps/mp/src/App.vue` 或 `apps/mp/src/styles/editorial.scss` | `.page-l1` / `.page-l2`、主/次/链接按钮、状态标签公共 class |
| `apps/mp/src/pages.json` | `globalStyle` / `tabBar` 色值 |
| 各 `pages/**/*.vue` | 根节点换页壳 class；卡片/按钮/标签改用 tokens，去掉冷灰硬编码 |
| `apps/mp/src/static/tab-*-active.png` | 必要时按 `#1E9B88` 微调选中态 |

750 宽：1px ≈ 2rpx。左右 44rpx，卡片内边距 32rpx，卡片圆角 32rpx，按钮 `999rpx`。

## 4. 页壳

**一级** `pages/home/index`、`pages/mine/registrations`  
canvas 底、列表卡片、底部 Tab。

**二级** `pages/activity/detail`、`pages/register/index`、`pages/organizer/{home,create,list,detail,registrations}`  
同一左右边距；详情封面可通栏；主标题约 38rpx Semibold；无 Tab。

## 5. 组件映射（现有结构，不新建组件文件）

- 列表卡：封面 → 标题两行 → 时间 → 地点 → 费用标签 + `displayStatus` 文案。  
- `open` / 我的报名 confirmed：brand.soft + brand.strong。  
- `full`：满员暖金。  
- `ended` / `upcoming`：仅 secondary 文字。  
- `feeType=paid`：陶土价格标签（仍不可支付）。  
- 主 CTA（报名、发布、提交）：胶囊 brand。  
- 次操作（取消）：胶囊 `#F0F1EB`。

不把候补/待确认做成新业务态，只预留 class。

## 6. 导航

- `navigationBarBackgroundColor`: `#FFFEFB`  
- `backgroundColor`: `#F6F3EC`  
- `tabBar.backgroundColor`: `#FFFEFB`  
- `tabBar.selectedColor`: `#1E9B88`  
- `tabBar.color`: `#77837A`  
- `tabBar.borderStyle`: `white`  

## 7. 验收

- [ ] tokens 只在 `uni.scss`（或单一 editorial 文件）定义，页面不散落另一套 HEX  
- [ ] 一级两页、二级七页均使用对应页壳  
- [ ] 主/次按钮全胶囊；输入框非胶囊  
- [ ] 状态标签含文字  
- [ ] 无新品牌色、无渐变主按钮、无 Admin 改动  

## 8. 非目标

管理后台、HTTPS/OSS、新页面、改接口、抽独立 UI 包、替换封面摄影。
