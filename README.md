# GitHub Network Ninja（浏览器扩展）

改进 GitHub 仓库 **Network Graph** 页面的体验：

- **可切换全屏**：默认保持正常布局，需要时一键全屏；按 `Esc` 或点「退出全屏」退出
- **可搜索提交列表**：拉取网络图中的提交，支持按作者 / 信息 / 日期过滤
- 按钮放在「网络图 / Network graph」标题旁

## 安装（开发者模式）

```bash
git clone https://github.com/lucienlmy/github-network-ninja-extension.git
cd github-network-ninja-extension
python3 scripts/decode_icons.py   # 生成 icons/*.png
```

1. 打开 `chrome://extensions/`
2. 打开 **开发者模式**
3. **加载已解压的扩展程序** → 选择本仓库目录

## 使用

打开任意仓库的 Network 页面，例如：
https://github.com/dexyfex/CodeWalker/network

- 标题旁：**全屏网络图** / **提交列表**
- 全屏时右上角仅保留一行：**退出全屏** / **提交列表**

## 图标

彩色蜘蛛网风格图标以 base64 存放在 `icons/*.png.b64`。
执行 `python3 scripts/decode_icons.py` 生成 PNG。
