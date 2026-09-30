# BADSC 上线检查清单

本文记录把 `web/` 部署为公开站点前必须确认的事项，以及每项的实测依据。文中「实测」指
2026-09-30 用 headless Chrome 对本地静态服务器真实跑出的结果，不是静态阅读代码的推断。

## 结论摘要

`web/` 目录是**自包含**的静态站点，不依赖 `server.cjs`。任意能返回文件的静态托管都能服务它。
实测覆盖三种部署姿势，编解码功能全部通过：

| 场景 | 上传→分享码 | 分享码→`.dek` | WASM 告警 | 页面错误 |
|---|---|---|---|---|
| 根路径 + 正确 MIME | 5/5 | 通过 | 无 | 无 |
| 根路径 + 错误 MIME | 5/5 | 通过 | 1 条降级告警 | 无 |
| 子路径 `/badsc/` | 5/5 | 通过 | 无 | 无 |

## 一、发布目录与文件清单

**发布目录：仓库的 `web/`**。必须完整包含：

```
web/
  index.html
  app.js  i18n.js  codec.js  bads3-binary.js  bads3-columns.js  style.css
  dictionaries/manifest.json
  dictionaries/2d60d18a6a896cb6.json
  vendor/index.web.js
  vendor/pkg.web/brotli_wasm.js
  vendor/pkg.web/brotli_wasm_bg.wasm
  vendor/LICENSE
```

不需要发布：`tools/`、`test_dek/`、`node_modules/`、`docs/`、`server.cjs`、`*.cmd`、`README.md`。

⚠️ `web/vendor/LICENSE` 是 brotli-wasm 的许可证文件，**必须随站点一起发布**。

## 二、MIME 与响应头

### `.wasm` 的 Content-Type

理想值 `application/wasm`。**但它不是硬性要求**——`brotli_wasm.js` 的 `load()` 自带降级：
`instantiateStreaming` 因 MIME 失败时会退回 `WebAssembly.instantiate`，功能不受影响，只在
控制台留一条 warning，代价是稍慢。

实测的错误 MIME 告警原文：

```
`WebAssembly.instantiateStreaming` failed because your server does not serve wasm
with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which
is slower.
```

因此平台若默认给 `.wasm` 发 `application/octet-stream`，站点仍可用，但建议显式配好。

### Content-Security-Policy

`server.cjs` 目前发送：

```
default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self';
connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'
```

上线后 `'self'` 自动指向站点自身域名，语义仍然正确，**建议原样保留**。
注意两条不能少：

- `script-src 'self' 'wasm-unsafe-eval'` —— 缺少 `wasm-unsafe-eval` 会导致 WASM 编译被拦。
- `connect-src 'self'` —— 页面要 `fetch('./dictionaries/manifest.json')`。

### 缓存

`server.cjs` 现在对**所有**响应发 `Cache-Control: no-store`（见 `server.cjs` 第 34 行）。
上线后建议改为分级策略，因为字典快照是内容寻址的：

| 资源 | 建议 |
|---|---|
| `dictionaries/<sha16>.json` | `public, max-age=31536000, immutable` |
| `dictionaries/manifest.json` | `no-cache`（必须每次校验，否则发新字典后旧页面读不到） |
| `*.js` `*.css` `index.html` | `no-cache` 或带 hash 的长期缓存 |

字典快照文件名即内容 SHA-256 前 16 位（见 `docs/BADS3.md`），内容永不改变，最适合 immutable 缓存。

## 三、路径解析（已修复的坑）

**2026-09-30 发现并修复**：`index.html` 原先使用根绝对路径 `/style.css`、`/app.js`，
以及品牌链接 `href="/"`。这在根路径部署时正常，但**部署到子路径（如 GitHub Pages 项目页
`user.github.io/BADSC/`）会 404 白屏**。实测证据：

```
HTTP 404 http://127.0.0.1:8793/style.css
HTTP 404 http://127.0.0.1:8793/app.js
```

已全部改为相对路径（`./style.css`、`./app.js`、`./`）。修复后子路径部署实测 10 个请求全部 200：

```
/badsc/  /badsc/style.css  /badsc/app.js  /badsc/codec.js  /badsc/i18n.js
/badsc/vendor/index.web.js  /badsc/bads3-binary.js  /badsc/bads3-columns.js
/badsc/vendor/pkg.web/brotli_wasm.js  /badsc/vendor/pkg.web/brotli_wasm_bg.wasm
```

**结论：根路径和子路径现在都能部署。**

## 四、隐私与文案一致性

站点全部转换在浏览器内完成，服务器只发静态文件。但上线使 README 中
「服务仅监听本机地址」的表述不再完整，**README 需同步措辞**（已处理）。

若将来加入任何服务端处理，必须更新此节和 README 的隐私说明。

## 五、已知可优化项（非阻塞）

1. **字典 JSON 未压缩**。`web/dictionaries/2d60d18a6a896cb6.json` 为 43 KB 明文。
   `docs/COMPRESSION-RESEARCH.md` 已记录「当前静态服务器不压缩 JSON」。
   上线后若平台支持，应开启 Brotli/gzip 预压缩，或预生成 `.json.br`。
2. **`Cache-Control: no-store` 通吃**，见第二节的分级建议。
3. **favicon 缺失**。浏览器会请求 `/favicon.ico` 得到 404。无害，但可在
   `index.html` 加 `<link rel="icon">` 消除噪音。

## 六、上线后验收步骤

```sh
# 1. 确认发布目录内容完整
ls web/dictionaries web/vendor/pkg.web

# 2. 本地模拟静态托管（该脚本故意不为 .wasm 返回正确 MIME，用于验证降级路径）
node tools/_accept-static-server.mjs 8791 wrong

# 3. 真实浏览器验收：上传 5 份样本 + 一次完整往返
node tools/_accept-browser-check.mjs http://127.0.0.1:8791 static-wrong-mime
```

`_accept-browser-check.mjs` 需要 Playwright。它从 WorkBuddy 隔离工作区导入，并复用本机
Chrome，不向仓库引入依赖。验收输出中 `pageErrors` 必须为空数组。

线上部署后，把 `base` 换成线上 URL 再跑一次即可。

## 七、编解码回归基线

改动站点资源后，回归基线是项目自带的编解码测试：

```sh
node tools/bads3-test.mjs
```

当前基线（471 份样本，全部通过）：长度中位 411、p90 461、最大 799、457 份在 500 字符内。

Node 18 与 Node 22+ 均可运行。脚本原先直接给 `globalThis.crypto` 赋值，在 Node 22 下会因
该属性是只读 getter 而抛 `TypeError`；已改为仅在缺失时兜底（`tools/bads3-test.mjs`）。
