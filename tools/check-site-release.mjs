import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { siteUrl } from './site-git.mjs';
const base = new URL(process.argv[2] || siteUrl);
if (!base.pathname.endsWith('/')) base.pathname += '/';
const expected = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../.publish/site/release.json', import.meta.url)), 'utf8'));
const response = await fetch(new URL('release.json', base), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200);
assert.equal(new URL(response.url).protocol, 'https:', '线上必须使用 HTTPS');
const actual = await response.json();
assert.deepEqual(actual, expected, '线上发布记录必须与本地产物相同');
let count = 0;
for (const [name, expectedHash] of Object.entries(actual.assets)) {
  assert.ok(!name.split('/').some(part => part === '..'), '资源路径不能越界');
  const resource = await fetch(new URL(name, base), { signal: AbortSignal.timeout(30000) });
  assert.equal(resource.status, 200, name);
  if (name.endsWith('.wasm')) assert.equal(resource.headers.get('content-type')?.split(';')[0], 'application/wasm');
  const hash = createHash('sha256').update(Buffer.from(await resource.arrayBuffer())).digest('hex');
  assert.equal(hash, expectedHash, `${name} 的线上字节必须与本地产物一致`);
  count++;
}
console.log(JSON.stringify({ requestedUrl: base.href, finalReleaseUrl: response.url, sourceCommit: actual.sourceCommit,
  assetsVerified: count, wasmMime: 'application/wasm', preview: actual.preview }, null, 2));
