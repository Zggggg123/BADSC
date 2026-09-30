// 真实浏览器验收：用 headless Chromium 打开页面，跑一次完整的编码/解码往返，
// 并捕获 console 消息与页面错误。用于验证 web/ 在纯静态托管下能否独立工作。
// 历史验收脚本，当前入口是 tests/browser.mjs。
import { launchBrowser } from '../../tests/helpers/browser-runtime.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.argv[2] || 'http://127.0.0.1:8791';
const label = process.argv[3] || 'static';

const browser = await launchBrowser();
const page = await browser.newPage();

// 页面需要把 .dek 交给浏览器处理，这里用 setInputFiles 走真实的上传路径。
const logs = [];
const errors = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(base + '/', { waitUntil: 'networkidle' });

// 1) 检查 WASM 是否真的初始化完成（页面加载即触发，失败会在 status 或 console 体现）
await page.waitForTimeout(1500);

// 2) 找一个真实样本，走上传 -> 生成分享码（样本嵌在多层子目录里，需递归）
const sampleDir = path.join(root, 'test_dek');
const dekFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.toLowerCase().endsWith('.dek')) dekFiles.push(full);
  }
})(sampleDir);
if (!dekFiles.length) throw new Error('test_dek 中没有 .dek 样本');

const results = [];
let tested = 0;
for (const full of dekFiles) {
  if (tested >= 5) break;
  const name = path.relative(sampleDir, full);
  await page.setInputFiles('#file-input', full);
  try {
    await page.waitForSelector('#share-section:not(.hidden)', { timeout: 15000 });
  } catch {
    const status = await page.textContent('#status');
    results.push({ name, ok: false, why: `share-section 未出现，status=${status}` });
    continue;
  }
  const code = await page.inputValue('#generated-code');
  results.push({ name, ok: code.length > 0, codeLen: code.length, full });
  tested++;
}
const uploadPass = results.filter((r) => r.ok).length;

// 3) 反向：粘贴分享码 -> 还原 .dek（用刚生成的第一个码）
const firstCode = results.find((r) => r.ok);
let roundtrip = { attempted: false };
if (firstCode) {
  await page.setInputFiles('#file-input', firstCode.full);
  await page.waitForSelector('#share-section:not(.hidden)', { timeout: 15000 });
  const code = await page.inputValue('#generated-code');
  await page.fill('#code-input', code);
  await page.click('#decode-button');
  try {
    await page.waitForSelector('#download-section:not(.hidden)', { timeout: 15000 });
    const fname = await page.textContent('#download-filename');
    roundtrip = { attempted: true, ok: true, filename: fname };
  } catch {
    const status = await page.textContent('#status');
    roundtrip = { attempted: true, ok: false, why: status };
  }
}

// 只保留与 WASM/MIME 相关的 console 输出，其余忽略
const wasmLogs = logs.filter((l) => /wasm|MIME|instantiate/i.test(l));

console.log(JSON.stringify({
  label,
  base,
  upload: { total: results.length, pass: uploadPass, details: results },
  roundtrip,
  wasmRelatedConsole: wasmLogs,
  pageErrors: errors,
}, null, 2));

await browser.close();
