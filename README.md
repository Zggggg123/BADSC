# BADSC

BADSC 是《Broken Arrow》卡组文件 `.dek` 与分享码双向转换的本地网页。上传卡组可复制分享码；粘贴分享码可下载逐字节还原的 `.dek` 文件。

## 快速开始

在线使用：[BADSC 网站](https://zgggg.top/BADSC-web/)（[GitHub Pages 入口](https://zggggg123.github.io/BADSC-web/)会自动跳转）。在线转换也只在浏览器内进行，不会上传卡组文件或分享码。

下面是本地运行方式：

需要 **Node.js 18 或更新版本**。Windows 用户双击 [启动网页.cmd](启动网页.cmd)；其他系统或习惯命令行的用户，在项目目录运行：

```sh
node server.cjs
```

然后打开 <http://127.0.0.1:8765/>。网页所需的 Brotli WASM 和字典快照已在仓库内，日常使用不需要执行 `npm install`。默认配置下服务仅监听本机地址；卡组文件和分享码在浏览器内处理，不会上传或保存到服务器。

界面顶部提供中/英切换（右上角），选择会记在浏览器本地；顶栏 `GitHub` 按钮跳转到本仓库。

### 从卡组生成分享码

1. 选择或拖入一个 `.dek` 文件（最大 1 MB）。
2. 查看卡组名字、阵营 ID、两个专精 ID 和卡片数，点击“复制分享码”。
3. 分享**完整的** `卡组名-内容码`，不要只复制连字符后面的内容。

### 从分享码还原卡组

1. 粘贴完整分享码，点击“确定并还原 .dek”。
2. 核对页面显示的基本信息，点击“下载 .dek 文件”。

（英文界面下按钮文案为 `Copy share code`、`Restore .dek`、`Download .dek`，功能相同。）

页面不显示逐卡详情，不编辑卡组，也不判断卡组能否用于某个游戏版本。原文件中的 `Logistic` 等数据会保留；转换不会用数据库名称或价格改写卡组内容。

## 分享码与兼容范围

- 当前网页生成 `卡组名-内容码` 形式的分享码。编码器比较内部 BADS3 和 BADS2 表示的完整长度，选较短的一种；内容码不显示文字版本前缀。
- 旧 `BADS2:` / `BADS3:` 前缀码不能直接导入当前网页。[当前格式示例](sample-share-code-current.txt) 可用于识别格式；[旧格式样本](docs/legacy-share-codes) 仅作开发记录。
- 完整分享码的长度随卡组变化，不能保证少于 500 字符。校验和用于发现损坏，不是防恶意篡改的签名。
- 当前字典快照来自 [JohnJinHM/BA-Units](https://github.com/JohnJinHM/BA-Units) 的公开 `Options.json`，来源标记为 **1.1.1.1、2026-08-08**，包含 1810 项改装数据。这些元数据不证明它是最新游戏数据库，也不证明卡组兼容特定补丁。
- BADS3 分享码记录其字典快照 ID。解码时网页按 ID 加载并校验对应快照；若将来发布新版字典，需要保留已发布分享码依赖的旧快照。当前仓库只有一版字典。

格式与字典生命周期见 [BADS3 协议与维护](docs/BADS3.md)。项目目前暂停进一步的编码压缩优化；既有测量结果保存在 [分享码长度试验记录](docs/COMPRESSION-RESEARCH.md)。

## 网站发布

开发仓库为 `Zggggg123/BADSC`，正式网站文件保存在独立的 [BADSC-web](https://github.com/Zggggg123/BADSC-web) 仓库，由 GitHub Pages 发布其 `main` 分支根目录。

修改后先本地预览、测试并提交开发改动，再双击 [发布网站.cmd](发布网站.cmd)。发布脚本会运行本地编解码回归、生成静态站点并推送到网站仓库；不会推送开发仓库。线上更新通常需要等待 Pages 部署完成。

只生成本地预览产物：`node tools/build-site.mjs --preview`。产物与网站仓库缓存位于被 Git 忽略的 `.publish/`。每次发布包含 `release.json`，记录开发提交和资源 SHA-256。详细流程见 [GitHub Pages 发布说明](docs/GITHUB-PAGES.md)。

## 开发与验证

运行主要的浏览器编解码测试：

```sh
node tools/browser-codec-test.mjs
node tools/bads3-test.mjs
```

`bads3-test.mjs` 使用仓库内 `test_dek` 的 471 份样本检查编解码与原文件逐字节往返，并覆盖名称、字段差异、未知结构、字典缺失或篡改及损坏输入等边界。长度实验可分别运行 `node tools/analyze-content-code.mjs` 和 `node tools/analyze-structure-dictionaries.mjs`；它们不会修改正式格式。

已有的 [更新字典.cmd](更新字典.cmd) 和 `tools/build-dictionary.cjs` 可从 BA-Units 提取器产出的 `Options.json` 构建本地快照。例如：

```sh
node tools/build-dictionary.cjs path/to/Options.json --version 1.1.1.1 --date 2026-08-08
```

版本号和日期应填写实际来源信息。构建新字典并不自动发布网页；未来字典升级的数据来源和发布流程仍待决定。快照规则见 [BADS3 协议与维护](docs/BADS3.md)。

## 部署上线

`web/` 是自包含的静态站点，不依赖 `server.cjs`，可发布到任意静态托管（Cloudflare Pages、Netlify、GitHub Pages 等）。根路径和子路径都能部署。

发布目录选 `web/`；上线检查清单、响应头建议与验收脚本见 [部署检查清单](docs/DEPLOYMENT.md)。

## 当前未验证

尚未验证生成的分享码在其他游戏补丁中的可导入性，也未接入更新版数据库。浏览器上传、复制与下载交互已在无头 Chrome 中覆盖（见部署检查清单第六节），但复制按钮依赖 `navigator.clipboard`，仍需在带用户手势的常规浏览器中复核；编解码测试通过不能代替这项交互验收。
