// Read-only size experiment for the current content code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, deflateRawSync, constants } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const dictRoot = path.join(root, 'web', 'dictionaries');
globalThis.crypto = webcrypto;
globalThis.fetch = async (url) => {
  const value = String(url);
  const file = value.startsWith('file:') ? fileURLToPath(url) : path.join(dictRoot, path.basename(value));
  return new Response(await fs.readFile(file), { headers: { 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'application/json' } });
};
const { encodeShareCode } = await import('../web/codec.js');

async function* files(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (file.endsWith('.dek')) yield file;
  }
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function base64Chars(length) { return Math.floor(length / 3) * 4 + (length % 3 ? length % 3 + 1 : 0); }
function summarize(rows) {
  const fields = ['full', 'name', 'content', 'base85Saving', 'brotliSaving', 'deflateSaving'];
  return Object.fromEntries(fields.map((field) => [field, {
    median: median(rows.map((row) => row[field])),
    total: rows.reduce((sum, row) => sum + row[field], 0),
    improved: rows.filter((row) => row[field] > 0).length,
  }]));
}
const rows = [];
for await (const file of files(path.join(root, 'test_dek'))) {
  const code = await encodeShareCode(await fs.readFile(file));
  const separator = code.lastIndexOf('-');
  const content = code.slice(separator + 1);
  const bytes = Buffer.from(content.replace(/\./g, '-'), 'base64url');
  const version = bytes[0];
  const mode = bytes[version === 3 ? 26 : 18];
  const offset = version === 3 ? 27 : 19;
  const stored = bytes.subarray(offset, -8);
  const raw = version === 3 && mode % 2 ? brotliDecompressSync(stored) : stored;
  const alternatives = version === 3 ? [
    brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } }).length,
    brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 16 } }).length,
    brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_LGWIN]: 18 } }).length,
  ] : [];
  const base85Chars = Math.floor(bytes.length / 4) * 5 + (bytes.length % 4 ? bytes.length % 4 + 1 : 0);
  const currentChars = base64Chars(bytes.length);
  rows.push({ file, full: code.length, name: separator, content: content.length,
    base85Saving: Math.max(0, content.length - base85Chars),
    brotliSaving: Math.max(0, currentChars - base64Chars(bytes.length - stored.length + Math.min(stored.length, ...alternatives))),
    deflateSaving: version === 3 ? Math.max(0, currentChars - base64Chars(bytes.length - stored.length + deflateRawSync(raw, { level: 9 }).length)) : 0,
  });
}
if (rows.length !== 471) throw new Error('Corpus count changed');
const holdout = rows.filter((row) => row.file.includes(`${path.sep}MAIN${path.sep}9.22${path.sep}`));
console.log(JSON.stringify({ count: rows.length, all: summarize(rows), holdoutCount: holdout.length, holdout: summarize(holdout) }, null, 2));
