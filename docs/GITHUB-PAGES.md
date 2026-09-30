# GitHub Pages 发布说明

## 仓库与网址

- 开发仓库：`https://github.com/Zggggg123/BADSC.git`。
- 网站仓库：`https://github.com/Zggggg123/BADSC-web.git`，公开仓库。
- 网站：<https://zggggg123.github.io/BADSC-web/>。
- Pages 来源：`main` 分支、`/(root)`，启用 HTTPS。

所有改动在开发仓库完成。网站仓库保存可直接发布的静态文件，由发布脚本管理，不在里面手工修改。

## 日常发布

1. 修改 `web/`，双击 `启动网页.cmd` 预览。
2. 测试并提交开发改动；发布脚本会拒绝含有未提交改动的开发仓库。
3. 双击 `发布网站.cmd`，或者运行 `node tools/publish-site.mjs`。
4. 在网站仓库 Actions 页面确认 `pages build and deployment` 成功，再检查线上操作。
5. 查看线上 `release.json` 的 `sourceCommit`，确认对应本次开发提交。

脚本打印固定目标 `BADSC-web.git` 和 `main`，运行本地编解码回归，将 `web/` 的网页、字典和 vendor 资源复制到 `.publish/site/`，补上 `.nojekyll`、网站 README 和资源校验清单，然后在 `.publish/repository/` 创建或复用网站仓库、正常提交和推送。脚本不会推送开发仓库，也不会使用强制推送。

`test_dek/` 没有纳入 Git。在没有本地语料的机器上会明确提示跳过语料回归；首次发布和重要转换改动应在保存语料的开发机器运行。

本机需要 Node.js 18+、Git 和有权限写入网站仓库的 GitHub 登录。Windows 上脚本优先使用标准安装的 Git 凭据管理器，配置仅作用于脚本的子进程，不改变全局 Git 配置。不保存访问令牌。

生成本地预览产物（允许未提交改动，不上传）：

```sh
node tools/build-site.mjs --preview
```

## 发布内容与 Pages 适配

只发布网页资源和第三方许可证。开发工具、测试卡组、历史样本、`server.cjs`、本地启动脚本不会进入网站仓库。`.nojekyll` 表明这些文件可以直接作为静态站点提供。

网页和 WASM 使用相对路径，适配 `/BADSC-web/` 项目子路径。网页在 `index.html` 中配置 meta CSP，以支持 GitHub Pages 的静态部署；其中 `wasm-unsafe-eval` 用于 WASM，`connect-src 'self'` 用于加载本站字典。

GitHub Pages 不应用 Cloudflare 的 `_headers` 文件，因此发布包不包含它。`X-Content-Type-Options` 和自定义缓存响应头没有由本项目在 Pages 上设置；不能把本地服务器或 Cloudflare 的响应头当成 Pages 已具备的配置。

字典快照不可改写，旧分享码需要的快照必须继续保留在 `web/dictionaries/`。打包时核对所有清单中的快照 SHA-256，发现缺失或损坏就停止。`release.json` 记录全部已发布网页资源的 SHA-256，并记录开发提交；生成的 `.gitattributes` 禁用网站仓库的行尾转换，确保 Windows 本地产物与线上字节一致。网页所需 JavaScript 本身会随网站公开。

## 失败处理与回退

- 测试失败、开发仓库有改动、远端不匹配、网站缓存存在未提交改动或网站仓库出现额外手工文件：停止发布，处理原因后重试。
- 网络或认证失败：不会强制覆盖远端。若本地网站提交已经创建但推送失败，修复登录或网络后重新运行脚本。
- Pages 部署失败：先查看网站仓库 Actions 日志，推送成功不等于网站已更新。
- 回退网站：在开发仓库恢复希望发布的旧网页资源并创建新提交，再正常运行发布脚本。不要用强制推送改写历史。

## 线上验收

```sh
node tools/verify-site.mjs https://zggggg123.github.io/BADSC-web/
```

验收脚本需要 Node.js 20+、Playwright 和 Chrome；网站使用及发布仍支持 Node.js 18+。优先导入安装的 Playwright，也可通过 `BADSC_PLAYWRIGHT_PATH` 指定其模块入口。当前开发机可复用 WorkBuddy 中已有的 Playwright，不影响网站运行，也不会将此依赖上传到网站。

检查五份真实样本的上传、完整分享码生成、点击复制、还原与实际下载，并将下载文件和原文件逐字节比较；检查语言切换与刷新保持、损坏输入处理、页面异常和资源加载。提供剪贴板权限的无头浏览器验收仍需配合日常浏览器手动检查。
