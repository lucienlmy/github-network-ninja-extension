# GitHub Network Ninja（浏览器扩展）

改进 GitHub 仓库 **Network Graph** 页面的体验：

- **可切换全屏**：默认保持正常布局，需要时一键全屏查看大图，再点一次或按 `Esc` 退出
- **可搜索提交列表**：拉取网络图中的提交，支持按作者 / 信息 / 日期过滤
- 按钮放在「Network graph」标题旁，不遮挡原有界面

## 安装（开发者模式，无需审核）

### Chrome / Edge / Brave 等 Chromium 浏览器

1. 下载或克隆本仓库到本地  
   ```bash
   git clone https://github.com/lucienlmy/github-network-ninja-extension.git
   ```
2. 打开浏览器，地址栏输入：`chrome://extensions/`
3. 打开右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择本仓库的根目录（包含 `manifest.json` 的文件夹）

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击 **临时载入附加组件**
3. 选择本仓库中的 `manifest.json`

## 使用

1. 打开任意 GitHub 仓库的 Network 页面，例如：  
   `https://github.com/dexyfex/CodeWalker/network`
2. 在「Network graph」标题右侧会出现两个按钮：
   - **全屏网络图** → 进入全屏；全屏时右上角有 **退出全屏**
   - **提交列表** → 打开可搜索的提交列表弹窗

## 文件结构

```
manifest.json   # MV3 清单
content.js      # 页面逻辑
styles.css      # 样式
```

## 说明

基于原 userscript [GitHub Network Ninja](https://github.com/maliayas/github-network-ninja) 思路重写为扩展，并改进了全屏与按钮布局。

仅在 `https://github.com/*/*/network` 页面生效。
