// Read-only prototypes: train ID and card-template indexes outside MAIN/9.22, then test there.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecipheriv, webcrypto } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';
import { encodePacked, decodePacked } from '../web/bads3-binary.js';
import { encodeColumns, decodeColumns } from '../web/bads3-columns.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const categories = ['Recon', 'Infantry', 'GroundCombatVehicles', 'Support', 'Logistic', 'Helicopters', 'Aircrafts'];
const schemas = [
  ['unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
  ['cat', 'slot', 'modList', 'modListTr'],
  ['unitId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['unitId', 'unitSkinId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['tranSkinId', 'unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
];
const idFields = ['unitId', 'tranId', 'unitSkinId', 'tranSkinId'];
const modFields = ['modId', 'optId', 'cost', 'run', 'cwun', 'type'];
const key = Buffer.from('09234237536700238099172758697347');
const dictionaryManifest = JSON.parse(await fs.readFile(path.join(root, 'web/dictionaries/manifest.json')));
const dictionary = JSON.parse(await fs.readFile(path.join(root, 'web/dictionaries', `${dictionaryManifest.current}.json`)));
globalThis.crypto = webcrypto;
globalThis.fetch = async (url) => {
  const value = String(url);
  const file = value.startsWith('file:') ? fileURLToPath(url) : path.join(root, 'web/dictionaries', path.basename(value));
  return new Response(await fs.readFile(file), { headers: { 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'application/json' } });
};
const { encodeShareCode } = await import('../web/codec.js');

async function* files(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (file.endsWith('.dek')) yield file;
  }
}
function packCard(card) {
  const tag = schemas.findIndex((fields) => fields.join(',') === Object.keys(card).join(','));
  if (tag < 0) throw new Error('Unexpected card schema');
  return [tag, ...schemas[tag].map((field) => field.startsWith('modList')
    ? card[field].map((mod) => modFields.map((name) => mod[name])) : card[field])];
}
function packedDeck(bytes) {
  const decipher = createDecipheriv('aes-256-cbc', key, bytes.subarray(8, 24));
  const plain = Buffer.concat([decipher.update(bytes.subarray(24)), decipher.final()]);
  const deck = JSON.parse(plain.toString('utf8'));
  return [categories.map((category) => deck.set2[category].map(packCard)), deck.v, '', deck.spec1, deck.spec2, deck.country];
}
function eachId(packed, callback) {
  for (const cards of packed[0]) for (const card of cards) {
    const fields = schemas[card[0]];
    for (const field of idFields) {
      const index = fields.indexOf(field);
      if (index >= 0) card[index + 1] = callback(field, card[index + 1]);
    }
  }
}
const rows = [];
for await (const file of files(path.join(root, 'test_dek'))) {
  rows.push({ file, packed: packedDeck(await fs.readFile(file)), holdout: file.includes(`${path.sep}MAIN${path.sep}9.22${path.sep}`) });
}
if (rows.length !== 471) throw new Error('Corpus count changed');
const counts = Object.fromEntries(idFields.map((field) => [field, new Map()]));
for (const row of rows.filter((item) => !item.holdout)) eachId(row.packed, (field, value) => {
  counts[field].set(value, (counts[field].get(value) || 0) + 1);
  return value;
});
const tables = Object.fromEntries(idFields.map((field) => [field,
  [...counts[field]].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([value]) => value),
]));
const indexes = Object.fromEntries(idFields.map((field) => [field, new Map(tables[field].map((value, index) => [value, index]))]));
const tableJson = Buffer.from(JSON.stringify(tables));
const tableCompressed = brotliCompressSync(tableJson, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
const templateCounts = new Map();
function cardTemplate(card) {
  const fields = schemas[card[0]];
  return JSON.stringify([card[0], ...fields.flatMap((field, index) => field === 'cat' || field === 'slot' ? [] : [card[index + 1]])]);
}
for (const row of rows.filter((item) => !item.holdout)) for (const cards of row.packed[0]) for (const card of cards) {
  const template = cardTemplate(card);
  templateCounts.set(template, (templateCounts.get(template) || 0) + 1);
}
const templates = [...templateCounts.keys()];
const repeatedTemplates = [...templateCounts].filter(([, count]) => count >= 2).map(([value]) => value);
const rankedTemplates = [...templateCounts].sort((a, b) => b[1] - a[1]).map(([value]) => value);
const templateIndexes = new Map(rankedTemplates.map((value, index) => [value, index]));
const holdoutCards = rows.filter((item) => item.holdout).flatMap((row) => row.packed[0].flat());
function templateStat(entries) {
  const lookup = new Set(entries);
  const raw = Buffer.from(`[${entries.join(',')}]`);
  return { entries: entries.length, rawBytes: raw.length, compressedBytes: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    holdoutCards: holdoutCards.length, holdoutMatches: holdoutCards.filter((card) => lookup.has(cardTemplate(card))).length,
    unseenUniqueHoldout: new Set(holdoutCards.map(cardTemplate).filter((template) => !lookup.has(template))).size };
}
function zig(value) { return value < 0 ? -value * 2 - 1 : value * 2; }
function unzig(value) { return value % 2 ? -(value + 1) / 2 : value / 2; }
function makeWriter() {
  const bytes = [];
  const u = (number) => { do { const byte = number % 128; number = Math.floor(number / 128); bytes.push(byte + (number ? 128 : 0)); } while (number); };
  const str = (value) => { const raw = Buffer.from(value); u(raw.length); bytes.push(...raw); };
  return { u, str, finish: () => Buffer.from(bytes) };
}
function encodeTemplates(packed, indexMap = templateIndexes) {
  const writer = makeWriter();
  writer.u(1);
  for (const value of [packed[1], packed[3], packed[4], packed[5]]) writer.u(zig(value));
  for (let category = 0; category < 7; category++) {
    const cards = packed[0][category]; writer.u(cards.length);
    for (let slot = 0; slot < cards.length; slot++) {
      const card = cards[slot], index = indexMap.get(cardTemplate(card));
      if (index === undefined) { writer.u(0); writer.str(JSON.stringify(card)); continue; }
      const fields = schemas[card[0]], cardCategory = card[fields.indexOf('cat') + 1], cardSlot = card[fields.indexOf('slot') + 1];
      const changed = cardCategory !== category || cardSlot !== slot;
      writer.u((index + 1) * 2 + Number(changed));
      if (changed) { writer.u(zig(cardCategory)); writer.u(zig(cardSlot)); }
    }
  }
  return writer.finish();
}
function decodeTemplates(bytes, dictionaryTemplates = rankedTemplates) {
  let position = 0;
  const u = () => { let value = 0, power = 1, byte; do { if (position >= bytes.length) throw new Error('Template payload truncated'); byte = bytes[position++]; value += (byte & 127) * power; power *= 128; } while (byte & 128); return value; };
  const str = () => { const n = u(); const value = bytes.subarray(position, position + n).toString(); position += n; return value; };
  if (u() !== 1) throw new Error('Template version');
  const meta = [u(), u(), u(), u()].map(unzig);
  const packed = [[], meta[0], '', meta[1], meta[2], meta[3]];
  for (let category = 0; category < 7; category++) {
    const cards = [], count = u();
    for (let slot = 0; slot < count; slot++) {
      const token = u();
      if (token === 0) { cards.push(JSON.parse(str())); continue; }
      const index = Math.floor(token / 2) - 1;
      const template = JSON.parse(dictionaryTemplates[index]);
      const fields = schemas[template[0]];
      const actualCategory = token % 2 ? unzig(u()) : category;
      const actualSlot = token % 2 ? unzig(u()) : slot;
      let at = 1;
      cards.push([template[0], ...fields.map((field) => field === 'cat' ? actualCategory : field === 'slot' ? actualSlot : template[at++])]);
    }
    packed[0].push(cards);
  }
  if (position !== bytes.length) throw new Error('Extra template data');
  return packed;
}
function base64Length(n) { return Math.floor(n / 3) * 4 + (n % 3 ? n % 3 + 1 : 0); }
function bestLength(packed) {
  const options = [encodePacked(packed, dictionary), encodeColumns(packed, dictionary)];
  return Math.min(...options.flatMap((raw) => [raw.length,
    brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  ])).valueOf();
}
function stats(items) {
  const sorted = items.map((item) => item.saving).sort((a, b) => a - b);
  return { count: items.length, medianSaving: sorted[Math.floor(sorted.length / 2)],
    totalSaving: sorted.reduce((a, b) => a + b, 0), improved: sorted.filter((value) => value > 0).length,
    escapedIds: items.reduce((sum, item) => sum + item.escaped, 0),
    idCount: items.reduce((sum, item) => sum + item.ids, 0) };
}
const results = [];
const templateResults = [];
const templateActualHoldout = [];
const caps = [128, 256, 512, 1024];
const cappedTemplates = new Map(caps.map((cap) => [cap, rankedTemplates.slice(0, cap)]));
const cappedIndexes = new Map(caps.map((cap) => [cap, new Map(cappedTemplates.get(cap).map((value, index) => [value, index]))]));
const cappedResults = new Map(caps.map((cap) => [cap, []]));
for (const row of rows) {
  const baseline = bestLength(row.packed);
  const transformed = structuredClone(row.packed);
  let escaped = 0, ids = 0;
  eachId(transformed, (field, value) => {
    ids++;
    const index = indexes[field].get(value);
    if (index !== undefined) return index;
    if (!Number.isInteger(value) || value < 0) throw new Error('Cannot escape ID');
    escaped++;
    return -value - 1;
  });
  // A decoder would use the same immutable tables and negative escape values.
  const encoded = [encodePacked(transformed, dictionary), encodeColumns(transformed, dictionary)];
  for (const [decode, bytes] of [[decodePacked, encoded[0]], [decodeColumns, encoded[1]]]) {
    const restored = decode(bytes, dictionary);
    eachId(restored, (field, value) => value < 0 ? -value - 1 : tables[field][value]);
    if (JSON.stringify(restored) !== JSON.stringify(row.packed)) throw new Error(`ID round trip changed ${row.file}`);
  }
  const candidate = Math.min(...encoded.flatMap((raw) => [raw.length,
    brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  ]));
  const fixed = 2 + 16 + 8 + 1 + 8;
  const saving = Math.max(0, base64Length(fixed + baseline) - base64Length(fixed + candidate));
  results.push({ holdout: row.holdout, saving, escaped, ids });
  const templateRaw = encodeTemplates(row.packed);
  if (JSON.stringify(decodeTemplates(templateRaw)) !== JSON.stringify(row.packed)) throw new Error(`Template round trip changed ${row.file}`);
  const templateCompressed = brotliCompressSync(templateRaw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  const templateBest = Math.min(templateRaw.length, templateCompressed.length);
  templateResults.push({ holdout: row.holdout,
    saving: Math.max(0, base64Length(fixed + baseline) - base64Length(fixed + templateBest)), escaped: 0, ids: 0 });
  if (row.holdout) {
    const current = await encodeShareCode(await fs.readFile(row.file));
    const contentLength = current.length - current.lastIndexOf('-') - 1;
    templateActualHoldout.push({ saving: Math.max(0, contentLength - base64Length(fixed + templateBest)), escaped: 0, ids: 0 });
    for (const cap of caps) {
      const raw = encodeTemplates(row.packed, cappedIndexes.get(cap));
      if (JSON.stringify(decodeTemplates(raw, cappedTemplates.get(cap))) !== JSON.stringify(row.packed)) throw new Error(`Capped template round trip changed ${row.file}`);
      const best = Math.min(raw.length, brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length);
      cappedResults.get(cap).push({ saving: Math.max(0, contentLength - base64Length(fixed + best)), escaped: 0, ids: 0 });
    }
  }
}
console.log(JSON.stringify({ tableEntries: Object.fromEntries(idFields.map((field) => [field, tables[field].length])),
  tableBytes: tableJson.length, tableBrotliBytes: tableCompressed.length,
  training: stats(results.filter((row) => !row.holdout)), holdout: stats(results.filter((row) => row.holdout)),
  cardTemplates: { all: templateStat(templates), repeated: templateStat(repeatedTemplates),
    candidateTraining: stats(templateResults.filter((row) => !row.holdout)),
    candidateHoldout: stats(templateResults.filter((row) => row.holdout)),
    candidateVsActualHoldout: stats(templateActualHoldout),
    cappedHoldout: Object.fromEntries(caps.map((cap) => [cap, { dictionary: templateStat(cappedTemplates.get(cap)), savings: stats(cappedResults.get(cap)) }])) } }, null, 2));
