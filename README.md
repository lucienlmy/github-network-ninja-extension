# GitHub Network Ninja（浏览器扩展）

改进 GitHub 仓库 **Network Graph** 页面的体验：

- **可切换全屏**：默认正常布局，需要时一键全屏；`Esc` 或点「退出全屏」退出
- **可搜索提交列表**：拉取网络图中的提交，支持按作者 / 信息 / 日期过滤
- 按钮在「网络图 / Network graph」标题旁

## 安装（开发者模式）

```powershell
cd "你的目录\github-network-ninja-extension"
git pull

# 生成彩色蜘蛛网图标（任选一种）
py scripts\write_icons.py
# 或
powershell -ExecutionPolicy Bypass -File scripts\write_icons.ps1
```

1. 打开 `chrome://extensions/`
2. 打开 **开发者模式**
3. **加载已解压的扩展程序** → 选择本仓库目录

> 若暂时不生成图标，扩展也能加载（使用 Chrome 默认图标）。

## 使用

打开任意仓库 Network 页面，例如：  
https://github.com/dexyfex/CodeWalker/network

- 标题旁：**全屏网络图** / **提交列表**
- 全屏时右上角：**退出全屏** / **提交列表**
