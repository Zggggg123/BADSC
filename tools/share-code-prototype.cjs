// Prototype codec for the encrypted Broken Arrow .dek format in test_dek/.
// Requires Node.js 18+ and no third-party packages.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const MARKER = Buffer.from('fhk3s0g3', 'ascii');
const KEY = Buffer.from('09234237536700238099172758697347', 'ascii');
const PREFIX_V1 = 'BADS1:';
const PREFIX_V2 = 'BADS2:';
const MAX_DEK_BYTES = 1024 * 1024;
const MAX_PLAIN_BYTES = 2 * 1024 * 1024;
const CATEGORIES = [
  'Recon', 'Infantry', 'GroundCombatVehicles', 'Support',
  'Logistic', 'Helicopters', 'Aircrafts',
];
const ROOT_KEYS = ['set2', 'v', 'name', 'spec1', 'spec2', 'country'];
const MOD_KEYS = ['modId', 'optId', 'cost', 'run', 'cwun', 'type'];
const CARD_SCHEMAS = [
  ['unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
  ['cat', 'slot', 'modList', 'modListTr'],
  ['unitId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['unitId', 'unitSkinId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['tranSkinId', 'unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
];

function keysMatch(value, expected) {
  return value && !Array.isArray(value) && typeof value === 'object'
    && Object.keys(value).join(',') === expected.join(',');
}

function packCard(card) {
  const tag = CARD_SCHEMAS.findIndex((schema) => keysMatch(card, schema));
  if (tag < 0) throw new Error('Unknown card schema');
  return [tag, ...CARD_SCHEMAS[tag].map((key) => {
    if (key !== 'modList' && key !== 'modListTr') return card[key];
    if (!Array.isArray(card[key])) throw new Error('Invalid modification list');
    return card[key].map((mod) => {
      if (!keysMatch(mod, MOD_KEYS)) throw new Error('Unknown modification schema');
      return MOD_KEYS.map((modKey) => mod[modKey]);
    });
  })];
}

function unpackCard(card) {
  if (!Array.isArray(card) || !CARD_SCHEMAS[card[0]]
      || card.length !== CARD_SCHEMAS[card[0]].length + 1) {
    throw new Error('Invalid packed card');
  }
  const result = {};
  CARD_SCHEMAS[card[0]].forEach((key, index) => {
    const value = card[index + 1];
    if (key !== 'modList' && key !== 'modListTr') {
      result[key] = value;
      return;
    }
    if (!Array.isArray(value)) throw new Error('Invalid packed modification list');
    result[key] = value.map((mod) => {
      if (!Array.isArray(mod) || mod.length !== MOD_KEYS.length) {
        throw new Error('Invalid packed modification');
      }
      return Object.fromEntries(MOD_KEYS.map((modKey, i) => [modKey, mod[i]]));
    });
  });
  return result;
}

function packStructured(plain) {
  const deck = JSON.parse(plain.toString('utf8'));
  if (!keysMatch(deck, ROOT_KEYS) || !keysMatch(deck.set2, CATEGORIES)) {
    throw new Error('Unknown deck schema');
  }
  const packed = [
    CATEGORIES.map((name) => {
      if (!Array.isArray(deck.set2[name])) throw new Error('Invalid category');
      return deck.set2[name].map(packCard);
    }),
    deck.v, deck.name, deck.spec1, deck.spec2, deck.country,
  ];
  if (!unpackStructured(Buffer.from(JSON.stringify(packed))).equals(plain)) {
    throw new Error('Original JSON formatting cannot be reconstructed');
  }
  return Buffer.from(JSON.stringify(packed));
}

function unpackStructured(bytes) {
  const packed = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(packed) || packed.length !== ROOT_KEYS.length
      || !Array.isArray(packed[0]) || packed[0].length !== CATEGORIES.length) {
    throw new Error('Invalid packed deck');
  }
  const set2 = Object.fromEntries(CATEGORIES.map((name, index) => {
    if (!Array.isArray(packed[0][index])) throw new Error('Invalid packed category');
    return [name, packed[0][index].map(unpackCard)];
  }));
  const deck = {
    set2, v: packed[1], name: packed[2], spec1: packed[3],
    spec2: packed[4], country: packed[5],
  };
  return Buffer.from(JSON.stringify(deck, null, 2).replace(/\n/g, '\r\n'), 'utf8');
}

function decryptDek(original) {
  if (original.length < 40 || original.length > MAX_DEK_BYTES
      || !original.subarray(0, 8).equals(MARKER)
      || (original.length - 24) % 16 !== 0) {
    throw new Error('Unsupported .dek header or size');
  }
  const iv = original.subarray(8, 24);
  const decryptor = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  const plain = Buffer.concat([decryptor.update(original.subarray(24)), decryptor.final()]);
  if (plain.length > MAX_PLAIN_BYTES) throw new Error('Deck is too large');
  return { iv, plain };
}

function encryptDek(iv, plain) {
  if (iv.length !== 16 || plain.length > MAX_PLAIN_BYTES) throw new Error('Invalid deck size');
  const encryptor = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  const encrypted = Buffer.concat([encryptor.update(plain), encryptor.final()]);
  const result = Buffer.concat([MARKER, iv, encrypted]);
  if (result.length > MAX_DEK_BYTES) throw new Error('Deck is too large');
  return result;
}

function checksum(bytes) {
  return crypto.createHash('sha256').update(bytes).digest().subarray(0, 8);
}

function decodeBody(encoded, prefix) {
  const base64 = encoded.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(base64)) throw new Error('Invalid sharing code characters');
  const data = Buffer.from(base64, 'base64url');
  if (data.toString('base64url') !== base64 || data.length < 26) {
    throw new Error('Invalid sharing code length');
  }
  const body = data.subarray(0, -8);
  if (!crypto.timingSafeEqual(checksum(body), data.subarray(-8))) {
    throw new Error('Sharing code checksum mismatch');
  }
  return body;
}

function encode(original) {
  const { iv, plain } = decryptDek(original);
  let mode = 0;
  let data;
  try {
    data = packStructured(plain);
  } catch {
    mode = 1; // Preserve unknown JSON formats without changing their bytes.
    data = plain;
  }
  const compressed = zlib.brotliCompressSync(data, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  const body = Buffer.concat([iv, Buffer.from([mode]), compressed]);
  return PREFIX_V2 + Buffer.concat([body, checksum(body)]).toString('base64url');
}

function decode(code) {
  let body;
  let plain;
  if (code.startsWith(PREFIX_V2)) {
    body = decodeBody(code, PREFIX_V2);
    if (body.length < 18) throw new Error('Invalid sharing code length');
    const mode = body[16];
    const data = zlib.brotliDecompressSync(body.subarray(17), {
      maxOutputLength: MAX_PLAIN_BYTES,
    });
    if (mode === 0) plain = unpackStructured(data);
    else if (mode === 1) plain = data;
    else throw new Error('Unknown sharing code mode');
  } else if (code.startsWith(PREFIX_V1)) {
    body = decodeBody(code, PREFIX_V1);
    plain = zlib.inflateSync(body.subarray(16), { maxOutputLength: MAX_PLAIN_BYTES });
  } else {
    throw new Error('Unknown sharing code version');
  }
  return encryptDek(body.subarray(0, 16), plain);
}

function* dekFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* dekFiles(filename);
    else if (entry.name.toLowerCase().endsWith('.dek')) yield filename;
  }
}

if (require.main === module) {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'encode' && first) {
    process.stdout.write(`${encode(fs.readFileSync(first))}\n`);
  } else if (command === 'decode' && first && second) {
    fs.writeFileSync(second, decode(first.trim()));
  } else if (command === 'selftest' && first) {
    let count = 0;
    const lengths = [];
    for (const filename of dekFiles(first)) {
      const original = fs.readFileSync(filename);
      const code = encode(original);
      if (!decode(code).equals(original)) throw new Error(`Round trip failed: ${filename}`);
      lengths.push(code.length);
      count += 1;
    }
    lengths.sort((a, b) => a - b);
    process.stdout.write(`Exact round trips: ${count}; code length min/median/max: `
      + `${lengths[0]}/${lengths[Math.floor(lengths.length / 2)]}/${lengths.at(-1)}\n`);
  } else {
    process.stderr.write('Usage: node tools/share-code-prototype.cjs encode file.dek\n'
      + '       node tools/share-code-prototype.cjs decode BADS2:... output.dek\n'
      + '       node tools/share-code-prototype.cjs selftest test_dek\n');
    process.exitCode = 2;
  }
}

module.exports = { encode, decode };
