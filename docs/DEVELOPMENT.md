# 开发与验证

## 环境

网页及基础编解码测试支持 Node.js 18+。包含浏览器依赖的开发建议使用 Node.js 22+；锁定的 Playwright 需要 Node.js 20+。

```sh
npm ci
npm test
```

`package.json` 中的 `private: true` 仅防止误发布到 npm，不表示 GitHub 仓库是私有的。

## 公开合成样本

`tests/fixtures/synthetic-decks.mjs` 用确定性的 IV 和 Node.js 加密生成五份虚构 `.dek`。没有复制用户的真实卡组。测试数据用于验证转换，不宣称游戏可导入。

`npm test` 检查浏览器 ESM/WASM 编解码、Node 加密独立比较、未知结构和排版回退、名称与字段边界、损坏输入、字典缺失/损坏、历史快照共存及解压大小限制。保存的历史分享码示例也检查解码与重编码一致性。

## 浏览器测试

```sh
npx playwright install chromium
npm run test:browser
```

脚本会自动启动随机端口的本机子路径服务器，完成五份合成样本的上传、复制、还原与下载字节比较，检查语言切换、刷新保持、损坏输入和资源错误，结束后关闭服务器。剪贴板权限仅授予这个测试浏览器会话。

指定网站进行同样的验收：

```sh
node tests/browser.mjs https://zgggg.top/BADSC-web/
```

默认使用 Playwright 安装的 Chromium。可用环境变量 `BADSC_BROWSER_CHANNEL=chrome` 选择本机 Chrome，或者用 `BADSC_BROWSER_EXECUTABLE` 指定浏览器路径。若复用外部安装的 Playwright，可用 `BADSC_PLAYWRIGHT_PATH` 显式指定模块入口；代码没有默认的本机用户目录。

输出截图放在被 Git 忽略的 `.publish/`。无头浏览器验收不能替代常规浏览器和不同网络环境的手动验证。

## 私有完整语料

维护者的 471 份真实 `.dek` 保存在本地 `test_dek/`，不随仓库提供。基础测试不读取这个目录。

```sh
npm run test:corpus
node tests/browser.mjs https://zgggg.top/BADSC-web/ --corpus
```

`--corpus` 明确启用完整语料回归；缺失语料会失败，不会伪装成通过。当前本地基线仍要求 471 份，样本名和历史分享码示例只用于维护者的基线检查。

## 更新字典

`更新字典.cmd` 和 `tools/build-dictionary.cjs` 读取 BA-Units 导出的 JSON，不执行第三方提取器：

```sh
node tools/build-dictionary.cjs path/to/Options.json --version 1.1.1.1 --date 2026-08-08
```

版本和日期应填写输入的实际来源。构建会校验字段并保存内容寻址快照；旧快照不可覆盖或删除。新快照需要重新测试并单独发布，不能把来源版本当成兼容性判断。

## 历史实验

`tools/experiments/` 的压缩分析需要本地完整语料，输出只供研究；`share-code-prototype.cjs` 的旧码不能导入当前网页。正式格式未使用这些实验方案。

`tools/archive/browser-check.mjs` 保留早期验收过程，仅供追溯；正式浏览器验收入口为 `tests/browser.mjs`，它会检查实际下载字节并以非零退出码报告失败。
