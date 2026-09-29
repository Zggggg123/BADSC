// Smoke test the browser ESM/WASM codec with local static resources.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, createCipheriv, createDecipheriv } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';

globalThis.crypto = webcrypto;
globalThis.fetch = async (url) => {
  const name = String(url);
  const file = name.startsWith('file:')
    ? fileURLToPath(url)
    : path.join(fileURLToPath(new URL('../web/dictionaries/', import.meta.url)), path.basename(name));
  return new Response(await fs.readFile(file), { headers: { 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'application/json' } });
};

const { decodeDek, encodeShareCode, decodeShareCode, parseDeck } = await import('../web/codec.js');
const root = fileURLToPath(new URL('..', import.meta.url));
const sample = new Uint8Array(await fs.readFile(path.join(root, 'test_dek', 'MAIN', '近坦 海步.dek')));
const plain = (await decodeDek(sample)).plain;
const name = parseDeck(plain).name;
const code = await encodeShareCode(sample);
if (!code.startsWith(`${name}-`) || /BADS[23]:/.test(code)) throw new Error('Share code did not show the deck name');
if (!Buffer.from((await decodeShareCode(code)).original).equals(sample)) throw new Error('Share code changed the file');
const compact = Buffer.from(code.slice(code.lastIndexOf('-') + 1).replace(/\./g, '-'), 'base64url');
const compressedDeck = compact[26] % 2 === 1 ? brotliDecompressSync(compact.subarray(27, -8)) : compact.subarray(27, -8);
if (compact[0] !== 3 || compressedDeck.includes(Buffer.from(name))) throw new Error('Structured payload still contains the deck name');

const key = Buffer.from('09234237536700238099172758697347');
const iv = sample.subarray(8, 24);
const decipher = createDecipheriv('aes-256-cbc', key, iv);
const plainWithSpace = Buffer.concat([decipher.update(sample.subarray(24)), decipher.final(), Buffer.from(' ')]);
const cipher = createCipheriv('aes-256-cbc', key, iv);
const unusualDek = Buffer.concat([sample.subarray(0, 24), cipher.update(plainWithSpace), cipher.final()]);
const fallbackCode = await encodeShareCode(unusualDek);
const payload = Buffer.from(fallbackCode.slice(fallbackCode.lastIndexOf('-') + 1).replace(/\./g, '-'), 'base64url');
if (payload[0] !== 2 || payload[18] !== 2) throw new Error('Unusual formatting did not use name-free raw fallback');
if (brotliDecompressSync(payload.subarray(19, -8)).includes(Buffer.from(name))) throw new Error('Raw fallback still compresses the deck name');
if (!Buffer.from((await decodeShareCode(fallbackCode)).original).equals(unusualDek)) throw new Error('Fallback changed the file');

const changedName = `别的名字${code.slice(code.lastIndexOf('-'))}`;
try { await decodeShareCode(changedName); throw new Error('Changed name was accepted'); }
catch (error) { if (error.message !== '分享码校验失败') throw error; }
console.log(`Browser codec: visible name, exact bytes, raw fallback and name checksum passed (${code.length} characters)`);
