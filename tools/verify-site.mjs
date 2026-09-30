import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const base = new URL(process.argv[2] || 'http://127.0.0.1:8793/badsc/');
if (!base.pathname.endsWith('/')) base.pathname += '/';
let playwright;
try { playwright = await import('playwright'); }
catch {
  const modulePath = process.env.BADSC_PLAYWRIGHT_PATH || 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js';
  playwright = await import(pathToFileURL(modulePath).href);
}
playwright = playwright.default || playwright;
const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.origin });
const page = await context.newPage();
const errors = [];
const failures = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('requestfailed', req => failures.push(`${req.url()}: ${req.failure()?.errorText}`));
page.on('response', res => { if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) failures.push(`${res.status()} ${res.url()}`); });
try {
  await page.goto(base.href, { waitUntil: 'networkidle', timeout: 60000 });
  assert.equal(await page.evaluate(() => window.isSecureContext), true, '需要 HTTPS 或 localhost');
  assert.ok(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'));
  const samples = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.dek')) samples.push(full);
    }
  }
  walk(path.join(root, 'test_dek'));
  assert.ok(samples.length >= 5, '至少需要五份本地 .dek 样本');
  for (const sample of samples.slice(0, 5)) {
    await page.locator('#file-input').setInputFiles(sample);
    await page.locator('#share-section:not(.hidden)').waitFor({ timeout: 30000 });
    const code = await page.locator('#generated-code').inputValue();
    assert.ok(code.length && !/^BADS[23]:/.test(code));
    await page.locator('#copy-button').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
    await page.locator('#code-input').fill(code);
    await page.locator('#decode-button').click();
    await page.locator('#download-section:not(.hidden)').waitFor({ timeout: 30000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-button').click()]);
    const downloaded = await download.path();
    assert.deepEqual(fs.readFileSync(downloaded), fs.readFileSync(sample), '下载内容必须与原 .dek 逐字节相同');
  }
  const before = await page.locator('html').getAttribute('lang');
  await page.locator('#lang-toggle').click();
  const after = await page.locator('html').getAttribute('lang');
  assert.notEqual(after, before);
  assert.equal(await page.locator('#download-section').isVisible(), true);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('lang'), after);
  await page.locator('#code-input').fill('damaged-share-code');
  await page.locator('#decode-button').click();
  await page.locator('#status.error').waitFor();
  assert.equal(await page.locator('#download-section').isVisible(), false);
  assert.deepEqual(errors, [], '页面不应有错误');
  assert.deepEqual(failures, [], '站点资源请求必须成功');
  const screenshot = path.join(root, '.publish', base.hostname === '127.0.0.1' ? 'local.png' : 'online.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(JSON.stringify({ base: base.href, uploadCopyDownloadRoundtrips: 5, downloadedBytesEqual: true,
    languagePersistence: true, damagedInputRejected: true, pageErrors: errors, failedRequests: failures, screenshot }, null, 2));
} finally { await browser.close(); }
