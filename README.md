# uni-app-x-repo

多端小程序项目（主打微信，扩展抖音、小红书）。

## 技术选型

本项目使用 **传统 uni-app（Vue3 + Vite + Pinia + TypeScript）**，不使用 uni-app x。完整说明见：

- [docs/技术栈.md](./docs/技术栈.md)

后续开发（含 AI 辅助）以该文档为约束基线。

## 环境要求

- Node.js 18+ / 20+（推荐 20 LTS）
- npm 10+

## 安装与启动

```bash
npm install

# 微信小程序（产物：dist/dev/mp-weixin，用微信开发者工具导入）
npm run dev:mp-weixin

# 抖音小程序
npm run dev:mp-toutiao

# 小红书小程序
npm run dev:mp-xhs

# H5 本地预览
npm run dev:h5
```

发行构建：

```bash
npm run build:mp-weixin
npm run build:mp-toutiao
npm run build:mp-xhs
```

类型检查：

```bash
npm run type-check
```

## 编译器升级

```bash
printf 'npm\n' | npx @dcloudio/uvm@latest
```
