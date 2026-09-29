import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { webcrypto, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { brotliCompressSync } from 'node:zlib';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dictRoot = path.join(root, 'web', 'dictionaries');
let alternateRoot = null;
globalThis.crypto = webcrypto;
globalThis.fetch = async (url) => {
  const name = String(url);
  let file;
  if (name.startsWith('file:')) file = fileURLToPath(url);
  else if (name.startsWith('./dictionaries/')) file = path.join(alternateRoot || dictRoot, path.basename(name));
  else throw new Error(`Unexpected fetch ${name}`);
  try { return new Response(await fs.readFile(file), { status: 200, headers: { 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'application/json' } }); }
  catch { return new Response('missing', { status: 404 }); }
};
const { encodeShareCode, decodeShareCode } = await import('../web/codec.js');
const { decodePacked } = await import('../web/bads3-binary.js');
const key = Buffer.from('09234237536700238099172758697347');
const originalFiles = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file); else if (file.endsWith('.dek')) originalFiles.push(file);
  }
}
function check(ok, message) { if (!ok) throw new Error(message); }
function checksum(body) { return createHash('sha256').update(body).digest().subarray(0, 8); }
function compactBytes(code) { return Buffer.from(code.slice(code.lastIndexOf('-') + 1).replace(/\./g, '-'), 'base64url'); }
function codeFromBody(body, name = '近坦 海步', version = 3, nameKind = 0) {
  const payload = Buffer.concat([Buffer.from([version, nameKind]), body]);
  return name + '-' + Buffer.concat([payload, checksum(Buffer.concat([Buffer.from(name), payload]))]).toString('base64url').replace(/-/g, '.');
}
function mutateCode(code, change) {
  const name = code.slice(0, code.lastIndexOf('-'));
  const bytes = compactBytes(code);
  const body = bytes.subarray(2, -8);
  change(body); return codeFromBody(body, name, bytes[0], bytes[1]);
}
function reencrypt(raw, plain) {
  const cipher = createCipheriv('aes-256-cbc', key, raw.subarray(8, 24));
  return Buffer.concat([raw.subarray(0, 24), cipher.update(plain), cipher.final()]);
}
function nodePlain(raw) {
  const decipher = createDecipheriv('aes-256-cbc', key, raw.subarray(8, 24));
  return Buffer.concat([decipher.update(raw.subarray(24)), decipher.final()]);
}
async function rejects(fn, pattern) {
  try { await fn(); } catch (e) { if (pattern.test(e.message)) return; throw e; }
  throw new Error(`Expected rejection: ${pattern}`);
}
await walk(path.join(root, 'test_dek'));
check(originalFiles.length === 471, 'Corpus count changed');
const lengths = [], records = [], versions = { BADS2: 0, BADS3: 0 }, modes = {};
for (const file of originalFiles) {
  const raw = await fs.readFile(file);
  const code = await encodeShareCode(raw);
  const version = compactBytes(code)[0];
  versions[`BADS${version}`]++;
  if (version === 3) {
    const mode = compactBytes(code)[26];
    modes[mode] = (modes[mode] || 0) + 1;
  }
  const restored = await decodeShareCode(code);
  check(Buffer.from(restored.original).equals(raw), `Browser round trip: ${file}`);
  check(Buffer.from(restored.plain).equals(nodePlain(raw)), `Node crypto comparison: ${file}`);
  lengths.push(code.length);
  const deck = JSON.parse(Buffer.from(restored.plain).toString('utf8'));
  check(code.startsWith(`${deck.name || ''}-`), `Visible deck name: ${file}`);
  check(!code.includes('BADS2:') && !code.includes('BADS3:'), `Visible format prefix: ${file}`);
  const filled = Object.values(deck.set2).flat().filter((card) => card.unitId !== undefined).length;
  records.push({ file, length: code.length, filled });
}
const sample = await fs.readFile(path.join(root, 'test_dek', 'MAIN', '近坦 海步.dek'));
await rejects(() => decodeShareCode('BADS2:AAAA'), /旧版分享码已不支持/);
const plain = nodePlain(sample);
const deck = JSON.parse(plain.toString('utf8'));
const card = Object.values(deck.set2).flat().find((item) => item.modList?.length);
check(card, 'No fixture modification');
const transport = Object.values(deck.set2).flat().find((item) => item.modListTr?.length);
check(transport, 'No fixture transport modification');
const canonical = (value) => Buffer.from(JSON.stringify(value, null, 2).replace(/\n/g, '\r\n'));
for (const change of [
  (d) => { d.set2.Recon[0].unknownField = null; },
  (d) => { const m = Object.values(d.set2).flat().find((x) => x.modList?.length).modList[0]; m.optId = 2147483647; m.type = 9; m.cost += 7; m.run = ''; m.cwun = null; },
  (d) => { const m = Object.values(d.set2).flat().find((x) => x.modListTr?.length).modListTr[0]; m.type = 2147483647; m.cost = -2147483648; m.run = null; m.cwun = ''; },
  (d) => { d.name = ''; },
  (d) => { d.name = null; },
]) {
  const modified = structuredClone(deck); change(modified);
  const raw = reencrypt(sample, canonical(modified));
  const code = await encodeShareCode(raw);
  if (Object.hasOwn(modified.set2.Recon[0], 'unknownField')) check(compactBytes(code)[0] === 2, 'Unknown field must use BADS2');
  check(Buffer.from((await decodeShareCode(code)).original).equals(raw), 'Synthetic deck changed');
}
const spaced = reencrypt(sample, Buffer.concat([plain, Buffer.from(' ')]));
check(compactBytes(await encodeShareCode(spaced))[0] === 2, 'Unknown formatting must use BADS2 fallback');
check(Buffer.from((await decodeShareCode(await encodeShareCode(spaced))).original).equals(spaced), 'Formatting fallback changed bytes');
const valid = await encodeShareCode(sample);
check(compactBytes(valid)[0] === 3, 'Sample did not choose BADS3');
await rejects(() => decodeShareCode('BADS3:AAAA'), /旧版分享码已不支持/);
if (process.argv.includes('--update-sample')) await fs.writeFile(path.join(root, 'sample-share-code-current.txt'), valid + '\n');
const savedCurrent = (await fs.readFile(path.join(root, 'sample-share-code-current.txt'), 'utf8')).trimEnd();
check(savedCurrent === valid && Buffer.from((await decodeShareCode(savedCurrent)).original).equals(sample), 'Saved current sample');
await rejects(() => decodeShareCode(mutateCode(valid, (body) => body.fill(255, 16, 24))), /缺少分享码指定的字典快照/);
const altered = valid.slice(0, -1) + (valid.endsWith('A') ? 'B' : 'A');
await rejects(() => decodeShareCode(altered), /校验失败|长度无效/);
await rejects(() => decodeShareCode('改名' + valid.slice(valid.lastIndexOf('-'))), /校验失败/);
const hyphenated = reencrypt(sample, canonical({ ...deck, name: '中文-Deck-1' }));
const hyphenatedCode = await encodeShareCode(hyphenated);
check(hyphenatedCode.startsWith('中文-Deck-1-') && Buffer.from((await decodeShareCode(hyphenatedCode)).original).equals(hyphenated), 'Hyphenated visible name');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'badsc-v3-test-'));
try {
  const out = path.join(tmp, 'dictionaries');
  const originalManifest = JSON.parse(await fs.readFile(path.join(dictRoot, 'manifest.json')));
  const base = JSON.parse(await fs.readFile(path.join(dictRoot, `${originalManifest.current}.json`)));
  await fs.mkdir(out);
  const snapshots = [];
  for (const version of ['test-1', 'test-2']) {
    const modified = structuredClone(base);
    modified.source.version = version;
    const bytes = Buffer.from(JSON.stringify(modified) + '\n');
    const hash = createHash('sha256').update(bytes).digest('hex'), id = hash.slice(0, 16);
    await fs.writeFile(path.join(out, `${id}.json`), bytes);
    snapshots.push({ id, file: `${id}.json`, sha256: hash, version, date: null });
  }
  const manifest = { format: 1, current: snapshots[1].id, snapshots };
  check(manifest.snapshots[0].id !== manifest.snapshots[1].id, 'Snapshot coexistence');
  // The code still finds its exact original snapshot even when current changes.
  await fs.copyFile(path.join(dictRoot, `${originalManifest.current}.json`), path.join(out, `${originalManifest.current}.json`));
  manifest.snapshots.push(originalManifest.snapshots[0]);
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest));
  alternateRoot = out;
  check(Buffer.from((await decodeShareCode(valid)).original).equals(sample), 'Old snapshot after current changed');
  const bad = Buffer.from(await fs.readFile(path.join(out, `${manifest.current}.json`)));
  bad[10] ^= 1;
  await fs.writeFile(path.join(out, `${manifest.current}.json`), bad);
  await rejects(() => encodeShareCode(sample), /校验失败/);
  alternateRoot = null;
} finally { alternateRoot = null; await fs.rm(tmp, { recursive: true, force: true }); }

const oversizedBody = Buffer.concat([sample.subarray(8, 24), compactBytes(valid).subarray(18, 26), Buffer.from([1]), brotliCompressSync(Buffer.alloc(2 * 1024 * 1024 + 1))]);
await rejects(() => decodeShareCode(codeFromBody(oversizedBody)), /解压后过大/);
const dict = JSON.parse(await fs.readFile(path.join(dictRoot, `${JSON.parse(await fs.readFile(path.join(dictRoot, 'manifest.json'))).current}.json`)));
await rejects(async () => decodePacked(Uint8Array.of(1, 0, 0, 0, 0, 0, 0), dict), /截断/);
function varuint(n) { const bytes = []; do { const byte = n % 128; n = Math.floor(n / 128); bytes.push(byte + (n ? 128 : 0)); } while (n); return bytes; }
await rejects(async () => decodePacked(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, ...varuint(dict.entries.length + 1)]), dict), /字典引用无效/);
lengths.sort((a, b) => a - b);
function stats(items) { const a = items.map((x) => x.length).sort((x, y) => x - y); return { count: a.length, min: a[0], median: a[Math.floor(a.length / 2)], p90: a[Math.floor(a.length * .9)], max: a.at(-1), under500: a.filter((n) => n < 500).length }; }
console.log(JSON.stringify({ all: stats(records), filled20: stats(records.filter((x) => x.filled >= 20)), holdoutFilled20: stats(records.filter((x) => x.filled >= 20 && x.file.includes(`${path.sep}MAIN${path.sep}9.22${path.sep}`))), versions, modes }, null, 2));
if (process.argv.includes('--print-sample')) console.log(valid);
