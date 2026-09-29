import brotliPromise from './vendor/index.web.js';
import { encodePacked, decodePacked } from './bads3-binary.js';
import { encodeColumns, decodeColumns } from './bads3-columns.js';

export const MAX_DEK_BYTES = 1024 * 1024;
const MAX_PLAIN_BYTES = 2 * 1024 * 1024;
const MAX_CODE_CHARS = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const marker = encoder.encode('fhk3s0g3');
const keyBytes = encoder.encode('09234237536700238099172758697347');
const categories = ['Recon', 'Infantry', 'GroundCombatVehicles', 'Support', 'Logistic', 'Helicopters', 'Aircrafts'];
const rootKeys = ['set2', 'v', 'name', 'spec1', 'spec2', 'country'];
const modKeys = ['modId', 'optId', 'cost', 'run', 'cwun', 'type'];
const cardSchemas = [
  ['unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
  ['cat', 'slot', 'modList', 'modListTr'],
  ['unitId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['unitId', 'unitSkinId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['tranSkinId', 'unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
];
const aesKey = crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt', 'decrypt']);
const dictionaryCache = new Map();

function concat(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function equal(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function keysMatch(value, keys) {
  return value && !Array.isArray(value) && typeof value === 'object'
    && Object.keys(value).join(',') === keys.join(',');
}

function packCard(card) {
  const tag = cardSchemas.findIndex((schema) => keysMatch(card, schema));
  if (tag < 0) throw new Error('未知卡片结构');
  return [tag, ...cardSchemas[tag].map((key) => {
    if (key !== 'modList' && key !== 'modListTr') return card[key];
    if (!Array.isArray(card[key])) throw new Error('改装列表无效');
    return card[key].map((mod) => {
      if (!keysMatch(mod, modKeys)) throw new Error('未知改装结构');
      return modKeys.map((field) => mod[field]);
    });
  })];
}

function unpackCard(card) {
  const schema = Array.isArray(card) ? cardSchemas[card[0]] : null;
  if (!schema || card.length !== schema.length + 1) throw new Error('分享码卡片结构无效');
  return Object.fromEntries(schema.map((key, index) => {
    let value = card[index + 1];
    if (key === 'modList' || key === 'modListTr') {
      if (!Array.isArray(value)) throw new Error('分享码改装列表无效');
      value = value.map((mod) => {
        if (!Array.isArray(mod) || mod.length !== modKeys.length) throw new Error('分享码改装无效');
        return Object.fromEntries(modKeys.map((field, i) => [field, mod[i]]));
      });
    }
    return [key, value];
  }));
}

function unpackStructured(bytes) {
  const packed = JSON.parse(decoder.decode(bytes));
  if (!Array.isArray(packed) || packed.length !== rootKeys.length
    || !Array.isArray(packed[0]) || packed[0].length !== categories.length) {
    throw new Error('分享码卡组结构无效');
  }
  const set2 = Object.fromEntries(categories.map((name, index) => {
    if (!Array.isArray(packed[0][index])) throw new Error('分享码分类无效');
    return [name, packed[0][index].map(unpackCard)];
  }));
  const deck = { set2, v: packed[1], name: packed[2], spec1: packed[3], spec2: packed[4], country: packed[5] };
  return encoder.encode(JSON.stringify(deck, null, 2).replace(/\n/g, '\r\n'));
}

function packStructured(plain) {
  const deck = JSON.parse(decoder.decode(plain));
  if (!keysMatch(deck, rootKeys) || !keysMatch(deck.set2, categories)) throw new Error('未知卡组结构');
  const packed = [categories.map((name) => {
    if (!Array.isArray(deck.set2[name])) throw new Error('分类无效');
    return deck.set2[name].map(packCard);
  }), deck.v, deck.name, deck.spec1, deck.spec2, deck.country];
  const bytes = encoder.encode(JSON.stringify(packed));
  if (!equal(unpackStructured(bytes), plain)) throw new Error('原始排版不可重建');
  return bytes;
}

function base64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('分享码含无效字符');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (base64Url(bytes) !== value) throw new Error('分享码长度无效');
  return bytes;
}

// The readable name is separated by the final hyphen. A dot stands for the
// Base64URL hyphen so the encoded portion never contains the separator.
function compactBase64(bytes) { return base64Url(bytes).replace(/-/g, '.'); }
function fromCompactBase64(value) {
  if (!/^[A-Za-z0-9_.]+$/.test(value)) throw new Error('分享码含无效字符');
  return fromBase64Url(value.replace(/\./g, '-'));
}

async function checksum(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).subarray(0, 8);
}

function hex(bytes) { return Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join(''); }
function unhex(value) { return Uint8Array.from(value.match(/../g), (pair) => parseInt(pair, 16)); }
async function sha256(bytes) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }

async function dictionaryManifest() {
  const response = await fetch('./dictionaries/manifest.json');
  if (!response.ok) throw new Error('字典清单缺失');
  const manifest = await response.json();
  if (manifest.format !== 1 || !Array.isArray(manifest.snapshots)
    || !/^[0-9a-f]{16}$/.test(manifest.current)) throw new Error('字典清单无效');
  return manifest;
}

async function loadDictionary(id) {
  if (dictionaryCache.has(id)) return dictionaryCache.get(id);
  const manifest = await dictionaryManifest();
  const entry = manifest.snapshots.find((item) => item.id === id);
  if (!entry || entry.file !== `${id}.json` || !/^[0-9a-f]{64}$/.test(entry.sha256)
    || entry.sha256.slice(0, 16) !== id) throw new Error(`缺少分享码指定的字典快照 ${id}`);
  const response = await fetch(`./dictionaries/${id}.json`);
  if (!response.ok) throw new Error(`字典快照 ${id} 缺失`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 512 * 1024 || await sha256(bytes) !== entry.sha256) throw new Error(`字典快照 ${id} 校验失败`);
  let dictionary;
  try { dictionary = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('字典内容不是有效 JSON'); }
  if (dictionary.format !== 1 || !Array.isArray(dictionary.entries) || dictionary.entries.length > 10000) throw new Error('字典格式无效');
  let previous = null;
  for (const row of dictionary.entries) {
    if (!Array.isArray(row) || row.length !== 5
      || row.slice(0, 3).some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 0x7fffffff)
      || row.slice(3).some((s) => s !== null && typeof s !== 'string')) throw new Error('字典条目无效');
    const pair = `${row[0]}:${row[1]}`;
    if (previous !== null && (row[0] < previous[0] || (row[0] === previous[0] && row[1] <= previous[1]))) throw new Error('字典顺序或重复项无效');
    previous = row;
  }
  dictionaryCache.set(id, dictionary);
  return dictionary;
}

export async function decodeDek(original) {
  if (original.length < 40 || original.length > MAX_DEK_BYTES
    || !equal(original.subarray(0, 8), marker) || (original.length - 24) % 16 !== 0) {
    throw new Error('不支持的 .dek 文件头或大小');
  }
  const iv = original.subarray(8, 24);
  let plain;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, await aesKey, original.subarray(24))); }
  catch { throw new Error('.dek 解密失败'); }
  if (plain.length > MAX_PLAIN_BYTES) throw new Error('卡组数据过大');
  return { iv, plain };
}

async function encryptDek(iv, plain) {
  if (iv.length !== 16 || plain.length > MAX_PLAIN_BYTES) throw new Error('卡组数据大小无效');
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, await aesKey, plain));
  const original = concat(marker, iv, encrypted);
  if (original.length > MAX_DEK_BYTES) throw new Error('还原的 .dek 文件过大');
  return original;
}

function decompressLimited(brotli, compressed) {
  const stream = new brotli.DecompressStream();
  const chunks = [];
  let size = 0;
  let offset = 0;
  try {
    for (let steps = 0; steps < 100000; steps++) {
      const result = stream.decompress(compressed.subarray(offset), 65536);
      offset += result.input_offset;
      size += result.buf.length;
      if (size > MAX_PLAIN_BYTES) throw new Error('分享码解压后过大');
      chunks.push(result.buf);
      if (result.code === brotli.BrotliStreamResultCode.ResultSuccess) {
        if (offset !== compressed.length) throw new Error('分享码含额外数据');
        return concat(...chunks);
      }
      if (result.code === brotli.BrotliStreamResultCode.NeedsMoreInput && offset === compressed.length) {
        throw new Error('分享码数据不完整');
      }
      if (result.buf.length === 0 && result.input_offset === 0) throw new Error('分享码解压失败');
    }
    throw new Error('分享码解压次数超限');
  } finally { stream.free(); }
}

async function decodeBads2Body(body) {
  if (body[16] !== 0) throw new Error('未知分享码模式');
  const brotli = await brotliPromise;
  const data = decompressLimited(brotli, body.subarray(17));
  const plain = unpackStructured(data);
  const original = await encryptDek(body.subarray(0, 16), plain);
  return { original, plain };
}

export async function encodeShareCode(original) {
  const { iv, plain } = await decodeDek(original);
  const deck = JSON.parse(decoder.decode(plain));
  if (typeof deck.name !== 'string' && deck.name !== null) throw new Error('卡组名不是文本或 null');
  const name = deck.name ?? '';
  const nameKind = deck.name === null ? 1 : 0;
  // The structured representation omits the name. The raw representation
  // replaces only the top-level name token, preserving all other bytes.
  let mode = 0;
  let fallbackData;
  let packed;
  try {
    packed = JSON.parse(decoder.decode(packStructured(plain)));
    packed[2] = '';
    fallbackData = encoder.encode(JSON.stringify(packed));
  } catch {
    fallbackData = stripRawName(plain, name, nameKind);
    mode = 2;
  }
  const brotli = await brotliPromise;
  const fallbackBody = concat(iv, Uint8Array.of(mode), brotli.compress(fallbackData, { quality: 11 }));
  const fallback = await compactCode(name, nameKind, 2, fallbackBody);
  if (!packed) return fallback;
  const manifest = await dictionaryManifest();
  const id = manifest.current;
  const dictionary = await loadDictionary(id);
  const candidates = [];
  for (const [offset, encode, decode] of [[0, encodePacked, decodePacked], [2, encodeColumns, decodeColumns]]) {
    try {
      const binary = encode(packed, dictionary);
      if (!equal(restoreName(unpackStructured(encoder.encode(JSON.stringify(decode(binary, dictionary)))), name, nameKind), plain)) continue;
      const compressed = brotli.compress(binary, { quality: 11 });
      candidates.push({ mode: offset, bytes: binary }, { mode: offset + 1, bytes: compressed });
    } catch { /* This representation is not lossless for this input. */ }
  }
  if (!candidates.length) return fallback;
  candidates.sort((a, b) => a.bytes.length - b.bytes.length);
  const best = candidates[0];
  const body = concat(iv, unhex(id), Uint8Array.of(best.mode), best.bytes);
  const result = await compactCode(name, nameKind, 3, body);
  return result.length < fallback.length ? result : fallback;
}

function restoreName(plain, name, nameKind) {
  const deck = JSON.parse(decoder.decode(plain));
  deck.name = nameKind === 1 ? null : name;
  return encoder.encode(JSON.stringify(deck, null, 2).replace(/\n/g, '\r\n'));
}

function topLevelNameSpan(json) {
  let position = 0;
  const space = () => { while (/\s/.test(json[position] || '')) position++; };
  const stringEnd = (start) => {
    let escaped = false;
    for (let i = start + 1; i < json.length; i++) {
      if (escaped) escaped = false;
      else if (json[i] === '\\') escaped = true;
      else if (json[i] === '"') return i + 1;
    }
    throw new Error('JSON 字符串不完整');
  };
  space();
  if (json[position++] !== '{') throw new Error('卡组不是 JSON 对象');
  let span = null;
  while (position < json.length) {
    space();
    if (json[position] === '}') break;
    if (json[position] !== '"') throw new Error('JSON 键无效');
    const keyStart = position;
    position = stringEnd(position);
    const key = JSON.parse(json.slice(keyStart, position));
    space();
    if (json[position++] !== ':') throw new Error('JSON 冒号缺失');
    space();
    const start = position;
    let depth = 0, inString = false, escaped = false;
    for (; position < json.length; position++) {
      const char = json[position];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        if (depth === 0) break;
        depth--;
      } else if (char === ',' && depth === 0) break;
    }
    if (key === 'name') {
      if (span) throw new Error('重复的卡组名');
      let end = position;
      while (end > start && /\s/.test(json[end - 1])) end--;
      span = { start, end };
    }
    if (json[position] === ',') position++;
    else if (json[position] === '}') break;
    else throw new Error('JSON 对象不完整');
  }
  if (!span) throw new Error('卡组名缺失');
  return span;
}

function replaceRawName(plain, expected, replacement) {
  const json = decoder.decode(plain);
  const { start, end } = topLevelNameSpan(json);
  if (json.slice(start, end) !== expected) throw new Error('卡组名原始格式不支持外置');
  return encoder.encode(json.slice(0, start) + replacement + json.slice(end));
}

function stripRawName(plain, name, nameKind) {
  return replaceRawName(plain, JSON.stringify(nameKind === 1 ? null : name), '""');
}

function restoreRawName(plain, name, nameKind) {
  return replaceRawName(plain, '""', JSON.stringify(nameKind === 1 ? null : name));
}

async function compactCode(name, nameKind, version, body) {
  const payload = concat(Uint8Array.of(version, nameKind), body);
  const digest = await checksum(concat(encoder.encode(name), payload));
  return `${name}-${compactBase64(concat(payload, digest))}`;
}

export async function decodeShareCode(code) {
  code = code.trimEnd();
  if (/^BADS[23]:/.test(code)) throw new Error('旧版分享码已不支持，请重新生成');
  return decodeCompactCode(code);
}

async function decodeBads3Body(body) {
  const id = hex(body.subarray(16, 24));
  if (body[24] > 3) throw new Error('未知 BADS3 压缩模式');
  const dictionary = await loadDictionary(id);
  const brotli = await brotliPromise;
  const packedBytes = body[24] % 2 ? decompressLimited(brotli, body.subarray(25)) : body.subarray(25);
  if (packedBytes.length > MAX_PLAIN_BYTES) throw new Error('BADS3 数据过大');
  const packed = body[24] < 2 ? decodePacked(packedBytes, dictionary) : decodeColumns(packedBytes, dictionary);
  const plain = unpackStructured(encoder.encode(JSON.stringify(packed)));
  if (plain.length > MAX_PLAIN_BYTES) throw new Error('卡组数据过大');
  const original = await encryptDek(body.subarray(0, 16), plain);
  return { original, plain };
}

async function decodeCompactCode(code) {
  if (code.length > MAX_CODE_CHARS) throw new Error('分享码过长');
  const separator = code.lastIndexOf('-');
  if (separator < 0) throw new Error('分享码格式应为 卡组名-内容码');
  const name = code.slice(0, separator);
  const bytes = fromCompactBase64(code.slice(separator + 1));
  if (bytes.length < 28) throw new Error('分享码长度无效');
  const payload = bytes.subarray(0, -8);
  if (!equal(await checksum(concat(encoder.encode(name), payload)), bytes.subarray(-8))) throw new Error('分享码校验失败');
  const version = payload[0], nameKind = payload[1];
  if ((version !== 2 && version !== 3) || nameKind > 1 || (nameKind === 1 && name)) throw new Error('未知分享码格式');
  const body = payload.subarray(2);
  if (body.length < (version === 2 ? 18 : 26)) throw new Error('分享码长度无效');
  let plain;
  if (version === 2 && body[16] === 2) {
    const brotli = await brotliPromise;
    plain = restoreRawName(decompressLimited(brotli, body.subarray(17)), name, nameKind);
  } else {
    const decoded = version === 2 ? await decodeBads2Body(body) : await decodeBads3Body(body);
    plain = restoreName(decoded.plain, name, nameKind);
  }
  return { plain, original: await encryptDek(body.subarray(0, 16), plain) };
}

export function parseDeck(plain) {
  const deck = JSON.parse(decoder.decode(plain));
  if (!deck || typeof deck !== 'object' || Array.isArray(deck) || !deck.set2 || typeof deck.set2 !== 'object') {
    throw new Error('卡组 JSON 结构无效');
  }
  return deck;
}

// Display only the six in-game categories. Keep Logistic in the file schema above
// to preserve existing codes and byte-for-byte .dek reconstruction.
export const categoryNames = Object.freeze({
  Recon: '侦察', Infantry: '步兵', GroundCombatVehicles: '载具',
  Support: '支援', Helicopters: '直升机', Aircrafts: '固定翼',
});
