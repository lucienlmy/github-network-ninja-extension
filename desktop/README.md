# GitHub Network Ninja · Desktop (Tauri)

本地版 GitHub Network 图查看器，视图对齐扩展里的增强网络图。

## 开发

需要：Node.js 20+、Rust stable、系统 Tauri 依赖  
（见 https://v2.tauri.app/start/prerequisites/）

```bash
cd desktop
npm install
python scripts/generate_icons.py
npm run tauri:dev
```

## 打包

```bash
cd desktop
npm install
python scripts/generate_icons.py
npm run tauri:build
```

产物在 `desktop/src-tauri/target/release/bundle/`。

## 使用

1. 输入 `owner/repo`（例如 `dexyfex/CodeWalker`）
2. 点击「加载网络图」
3. 拖拽平移、滚轮缩放、悬停看提交、单击打开 GitHub

数据来自公开接口：`/network/meta` 与 `/network/chunk`。
