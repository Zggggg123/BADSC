# BADSC

《Broken Arrow》卡组文件 `.dek` 与分享码的浏览器转换工具。

**[在线使用](https://zgggg.top/BADSC-web/)** · [开发说明](docs/DEVELOPMENT.md) · [格式协议](docs/BADS3.md) · [MIT 许可证](LICENSE)

上传卡组生成完整的 `卡组名-内容码`；粘贴分享码后，可以下载逐字节还原的 `.dek` 文件。转换在浏览器内完成，不会上传或保存卡组文件、分享码；服务器只提供网页资源。

## 使用方法

1. 打开网站，选择或拖入 `.dek` 文件（最大 1 MB）。
2. 核对卡组名称、阵营 ID、专精 ID 和卡片数量，点击“复制分享码”。
3. 分享完整的 `卡组名-内容码`；只复制内容码不能还原。
4. 接收者粘贴完整分享码，点击还原，再下载 `.dek`。

右上角可以切换中英文，语言选择保存在浏览器本地。复制与编解码需要 HTTPS 或 localhost 安全环境；直接双击 HTML 文件不是受支持的运行方式。

## 功能范围

- 提供本地转换、基本信息显示、复制分享码与下载还原文件。
- 不编辑卡组、不显示逐卡详情、不判断卡组在某个游戏补丁中能否使用。
- 保留原文件中的数据，包括 `Logistic`；不使用字典名称或价格改写卡组。
- 完整分享码长度随卡组而变化，不能保证小于 500 字符。
- 校验和用于发现损坏，不是防恶意篡改的数字签名。
- 当前入口不接受旧 `BADS2:` / `BADS3:` 前缀码；[当前分享码示例](sample-share-code-current.txt)可用于识别格式。

当前字典来源为 [JohnJinHM/BA-Units](https://github.com/JohnJinHM/BA-Units)，快照标记为 `1.1.1.1 / 2026-08-08`，包含 1810 项改装数据。这是来源记录，不代表最新游戏数据库或卡组兼容性证明。分享码引用的历史字典必须继续保留，详见[协议与维护规则](docs/BADS3.md)。

## 本地运行

需要 Node.js 18+。克隆仓库后，在项目目录运行：

```sh
node server.cjs
```

Windows 也可以双击 `启动网页.cmd`。浏览器打开 <http://127.0.0.1:8765/>；本地服务器只监听本机地址。日常使用不需要 `npm install`，Brotli WASM 和字典已随仓库提供。

## 开发与测试

基础编解码测试使用仓库内的五份合成样本，不依赖未公开卡组，也不需要安装依赖：

```sh
npm test
```

合成样本覆盖结构化数据、中文名称、未知字段、不同排版和字典未命中，并检查逐字节往返、损坏输入及字典生命周期等边界。它们不是可用于游戏的卡组。

浏览器开发建议使用 Node.js 22+，需要安装锁定依赖和 Chromium：

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

完整 471 份本地语料没有纳入 Git。有语料的维护者可以另外运行 `npm run test:corpus`。环境配置、真实浏览器测试与字典更新说明见 [DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 仓库结构

```text
web/                   正式网页、编解码、字典、内置 WASM
tests/                 编解码与浏览器测试
  fixtures/            合成样本生成器
  helpers/             测试服务器与浏览器依赖入口
tools/                 字典构建、静态打包与维护工具
  experiments/         历史压缩实验，不接入正式网页
  archive/             已被替代的历史工具
docs/                  协议、开发、部署说明
  archive/             历史研究记录
  legacy-share-codes/   旧格式样本
licenses/              第三方许可证
```

源码维护在本仓库，正式网站文件独立保存在 [BADSC-web](https://github.com/Zggggg123/BADSC-web)。维护者的本地发布启动器不进入当前公开版本；Fork 自行部署请先修改 `site.config.json`，详见[发布说明](docs/GITHUB-PAGES.md)。网站仓库写权限由 GitHub 管理，不由脚本授予。

## 许可证与来源

原创代码和文档采用 [MIT](LICENSE)。内置 `brotli-wasm`、字典数据来源和游戏内容的边界见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，第三方许可证不会被项目 MIT 许可证替代。

这是独立社区工具，不是官方游戏服务。欢迎通过 Issue 报告转换问题；贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。请使用合成样本或自行确认可以公开的卡组，避免提交个人信息。

当前分享码格式已冻结，暂不继续扩展编码压缩方案。[历史试验记录](docs/archive/COMPRESSION-RESEARCH.md)仅用于追溯。常规浏览器手动验收、国内不同网络的访问效果和其他游戏补丁的兼容性仍需独立验证。
