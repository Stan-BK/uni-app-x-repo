# 活动报名小程序｜统一视觉规范 v1.1

> 设计风格：**城市生活编辑部（Urban Editorial）**  
> 来源：产品提供的 v1.0；v1.1 按试运营反馈调整品牌绿与按钮圆角。  
> 关键词：温暖、克制、轻生活方式、清晰、可信赖；在米白底上略提亮主色，避免沉闷，也不上高饱和渐变。

适用范围：`apps/mp` 全部页面。Admin 不在本期。

## 1. 设计原则

- 用温暖的米白底色替代冷灰背景。  
- 青绿承担品牌与主要操作；陶土橙、雾霾蓝用于价格和状态区分。  
- 信息优先：活动名称、时间、地点、价格和报名状态需要快速扫读。  
- 卡片轻量化：细边框、柔和阴影、统一圆角。  
- 封面可用大色块占位，文字对比度必须足够。

## 2. 色彩 Tokens

| Token | HEX | 用途 |
| --- | --- | --- |
| `color.canvas` | `#F6F3EC` | 页面底色 |
| `color.surface` | `#FFFEFB` | 卡片、导航栏、输入框 |
| `color.text.primary` | `#24312D` | 主标题、正文 |
| `color.text.secondary` | `#77837A` | 时间、辅助信息 |
| `color.text.muted` | `#929B92` | 次要说明 |
| `color.brand` | `#1E9B88` | 主按钮、链接、Tab 选中（v1.1，原 `#286F62`） |
| `color.brand.strong` | `#157A6A` | 浅底上的标签字，保证对比 |
| `color.brand.soft` | `#D4F3EC` | 浅色品牌底、报名中/已确认 |
| `color.accent.terracotta` | `#B94E2D` | 付费、待确认 |
| `color.accent.terracotta.soft` | `#FBE9DF` | 价格标签、待确认背景 |
| `color.accent.navy` | `#3A5A78` | 候补预留 |
| `color.accent.navy.soft` | `#E4EAF0` | 候补背景预留 |
| `color.border` | `#E7E2D9` | 细分隔线、输入框描边 |
| `color.status.full.bg` | `#F8F0DF` | 已满员背景 |
| `color.status.full.text` | `#A6752A` | 已满员文字 |
| `color.button.secondary.bg` | `#F0F1EB` | 次按钮底 |

## 3. 字体与层级

优先系统中文无衬线：iOS PingFang SC；Android Noto Sans CJK SC。

| 用途 | 字号 | 字重 |
| --- | --- | --- |
| 导航栏标题 | 系统默认 | Medium |
| 二级页主视觉标题 | 19 px | Semibold |
| 区块标题 | 17–18 px | Bold |
| 卡片活动标题 | 13–14 px | Bold |
| 正文 | 12–14 px | Regular |
| 辅助、标签 | 10–11 px | Medium |

行高 1.4–1.6 倍。小程序实现用 rpx（750 宽，1px ≈ 2rpx）。

## 4. 间距与圆角

4 px 基础网格。

| 项 | px | rpx |
| --- | --- | --- |
| 页面左右边距 | 22 | 44 |
| 大区块垂直间距 | 20–24 | 40–48 |
| 卡片内边距 | 16 | 32 |
| 常规控件间距 | 8–12 | 16–24 |
| 小标签圆角 | 7–8 | 14–16 |
| 输入框圆角 | 12 | 24 |
| 内容卡片圆角 | 16 | 32 |
| 主/次按钮 | 全胶囊 | `999rpx` |
| 筛选项 | 全胶囊 | `999rpx` |

## 5. 一二级页壳

| 级别 | 页面 | 特征 |
| --- | --- | --- |
| 一级 `.page-l1` | `pages/home/index`、`pages/mine/registrations` | 有 Tab；列表卡片；canvas 底 |
| 二级 `.page-l2` | 活动详情、报名、`organizer/*` | 无 Tab；主标题更大；封面可通栏 |

空间 tokens 两级共用，只改页框，不另开色板。

## 6. 组件约定

### 活动卡片

顺序：封面 → 标题（最多两行）→ 时间 → 地点 → 价格标签 + 报名状态。  
时间/地点用 `text.secondary`，不用 muted。状态必须有文字。

### 报名 / 展示态

| 态 | 样式 |
| --- | --- |
| 报名中 `open`、已确认 | `brand.soft` 底 + `brand.strong` 字 |
| 付费标签、待确认 | terracotta.soft + terracotta |
| 候补（预留 class） | navy.soft + navy |
| 已满员 `full` | full.bg + full.text |
| 已结束 `ended`、未开始 `upcoming` | 无色块，`text.secondary` 文字 |

### 按钮

- 主按钮：`brand` 底、白字、全胶囊  
- 次按钮：`#F0F1EB` 底、`text.primary` 字、全胶囊  
- 链接：`brand` 字，无描边  

### 导航 / Tab

顶栏、Tab 表面 `#FFFEFB`；页面背景 `#F6F3EC`。  
Tab 选中 `#1E9B88`，未选中 `#77837A`。微信 `borderStyle` 只能 black/white，用 `white`。  
选中态图标按品牌绿微调，不改图标含义。

## 7. 后续新页面提示词

请严格沿用《活动报名小程序｜统一视觉规范 v1.1》。保持色板、4px 间距、卡片 16px 圆角、全胶囊主按钮、一二级页壳。米白底 + 青绿主色 + 陶土/雾霾蓝辅助。不要引入新品牌色或高饱和渐变。先复用 tokens 与页壳，再补业务结构。
