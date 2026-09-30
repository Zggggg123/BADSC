import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { syntheticFixtures } from './fixtures/synthetic-decks.mjs';
import { launchBrowser } from './helpers/browser-runtime.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
let server;
let address = process.argv.find((value, index) => index > 1 && /^https?:\/\//.test(value));
if (!address) {
  server = spawn(process.execPath, [fileURLToPath(new URL('./helpers/subpath-server.mjs', import.meta.url)), '0'], { cwd: root, windowsHide: true });
  address = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { server.kill(); reject(new Error('测试服务器启动超时')); }, 10000);
    server.on('error', error => { clearTimeout(timeout); reject(error); });
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`测试服务器退出：${code}`)); });
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/badsc\//);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
}
const base = new URL(address);
if (!base.pathname.endsWith('/')) base.pathname += '/';
let browser;
try { browser = await launchBrowser(); }
catch (error) { server?.kill(); throw error; }
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
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
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
  const corpus = process.argv.includes('--corpus');
  if (corpus) walk(path.join(root, 'test_dek'));
  const fixtures = corpus ? samples.slice(0, 5).map(file => ({ name: path.basename(file), bytes: fs.readFileSync(file) })) : syntheticFixtures();
  assert.ok(fixtures.length >= 5, '至少需要五份样本');
  for (const fixture of fixtures) {
    const sample = { name: fixture.name, mimeType: 'application/octet-stream', buffer: fixture.bytes };
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
    assert.deepEqual(fs.readFileSync(downloaded), fixture.bytes, '下载内容必须与原 .dek 逐字节相同');
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
  const output = path.join(root, 'test-results');
  fs.mkdirSync(output, { recursive: true });
  const screenshot = path.join(output, base.hostname === '127.0.0.1' ? 'local.png' : 'online.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(JSON.stringify({ base: page.url(), samples: corpus ? 'local corpus' : 'synthetic', uploadCopyDownloadRoundtrips: 5, downloadedBytesEqual: true,
    languagePersistence: true, damagedInputRejected: true, pageErrors: errors, failedRequests: failures, screenshot }, null, 2));
} finally { await browser.close(); server?.kill(); }
