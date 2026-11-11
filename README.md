# GitHub Network Ninja（浏览器扩展）

改进 GitHub 仓库 **Network Graph** 页面：可切换全屏 + 可搜索提交列表。

## 安装（Windows / 开发者模式）

在扩展目录执行：

```powershell
git pull
py scripts\write_icons.py
```

成功后会生成：

- `icons\icon16.png`
- `icons\icon32.png`
- `icons\icon48.png`
- `icons\icon128.png`

然后：

1. 打开 `chrome://extensions/`
2. 打开 **开发者模式**
3. **加载已解压的扩展程序** → 选本仓库目录  
   （若已加载则点 **重新加载**）

> 必须先运行 `write_icons.py` 生成 PNG，否则会因缺少图标无法加载清单。

## 使用

打开任意仓库 Network 页面，例如：  
https://github.com/dexyfex/CodeWalker/network

- 标题旁：**全屏网络图** / **提交列表**
- 全屏时右上角：**退出全屏** / **提交列表**
