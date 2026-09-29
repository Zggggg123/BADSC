// BADS3 binary payload, format 1. All integers are safe signed integers.
const schemas = [
  ['unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
  ['cat', 'slot', 'modList', 'modListTr'],
  ['unitId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['unitId', 'unitSkinId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['tranSkinId', 'unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
];
const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', { fatal: true });
const MAX_ITEMS = 100000;
const MAX_STRING = 1024 * 1024;

function checkInt(n) {
  if (!Number.isSafeInteger(n) || Math.abs(n) > 0x7fffffff) throw new Error('BADS3 数值超出编码范围');
  return n;
}
class Writer {
  constructor() { this.data = []; }
  u(n) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw new Error('BADS3 数量无效');
    do { const part = n % 128; n = Math.floor(n / 128); this.data.push(part | (n ? 128 : 0)); } while (n);
  }
  s(n) { checkInt(n); this.u(n < 0 ? -n * 2 - 1 : n * 2); }
  str(value) {
    if (typeof value !== 'string') throw new Error('BADS3 文本无效');
    const bytes = utf8.encode(value);
    if (bytes.length > MAX_STRING) throw new Error('BADS3 文本过长');
    this.u(bytes.length); for (const byte of bytes) this.data.push(byte);
  }
  finish() { return Uint8Array.from(this.data); }
}
class Reader {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }
  u() {
    let value = 0; let factor = 1;
    for (let i = 0; i < 5; i++) {
      if (this.pos >= this.bytes.length) throw new Error('BADS3 数据截断');
      const byte = this.bytes[this.pos++]; value += (byte & 127) * factor;
      if (value > 0xffffffff) throw new Error('BADS3 数值溢出');
      if (!(byte & 128)) return value;
      factor *= 128;
    }
    throw new Error('BADS3 varint 过长');
  }
  s() { const n = this.u(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  count() { const n = this.u(); if (n > MAX_ITEMS) throw new Error('BADS3 项目过多'); return n; }
  str() {
    const n = this.u(); if (n > MAX_STRING || this.pos + n > this.bytes.length) throw new Error('BADS3 文本长度无效');
    const result = text.decode(this.bytes.subarray(this.pos, this.pos + n)); this.pos += n; return result;
  }
  done() { if (this.pos !== this.bytes.length) throw new Error('BADS3 含额外数据'); }
}
function key(mod) { return JSON.stringify(mod); }
function dictIndex(dictionary) { return new Map(dictionary.entries.map((row, i) => [`${row[0]}:${row[1]}`, i])); }
function validMod(row) {
  if (!Array.isArray(row) || row.length !== 6) throw new Error('BADS3 改装结构无效');
  for (const i of [0, 1, 2, 5]) checkInt(row[i]);
  for (const i of [3, 4]) if (row[i] !== null && typeof row[i] !== 'string') throw new Error('BADS3 改装文本无效');
}

export function encodePacked(packed, dictionary) {
  if (!Array.isArray(packed) || packed.length !== 6 || !Array.isArray(packed[0]) || packed[0].length !== 7) throw new Error('BADS3 卡组结构无效');
  const w = new Writer();
  const strings = []; const stringMap = new Map();
  const intern = (value) => {
    if (value === null) return 0;
    if (typeof value !== 'string') throw new Error('BADS3 文本无效');
    if (!stringMap.has(value)) { stringMap.set(value, strings.length + 1); strings.push(value); }
    return stringMap.get(value);
  };
  const pool = []; const poolMap = new Map();
  const cardData = [];
  for (let cat = 0; cat < 7; cat++) {
    const cards = packed[0][cat];
    if (!Array.isArray(cards) || cards.length > MAX_ITEMS) throw new Error('BADS3 分类无效');
    const rows = [];
    for (let slot = 0; slot < cards.length; slot++) {
      const card = cards[slot], schema = Array.isArray(card) ? schemas[card[0]] : null;
      if (!schema || card.length !== schema.length + 1) throw new Error('BADS3 卡片无效');
      const values = schema.map((field, i) => {
        const value = card[i + 1];
        if (field === 'modList' || field === 'modListTr') {
          if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error('BADS3 改装列表无效');
          return value.map((mod) => {
            validMod(mod); const id = key(mod);
            if (!poolMap.has(id)) { poolMap.set(id, pool.length); pool.push(mod); }
            return poolMap.get(id);
          });
        }
        return checkInt(value);
      });
      rows.push([card[0], values]);
    }
    cardData.push(rows);
  }
  if (pool.length > MAX_ITEMS) throw new Error('BADS3 改装过多');
  intern(packed[2]);
  for (const mod of pool) { intern(mod[3]); intern(mod[4]); }
  w.u(1); // binary payload format
  w.u(strings.length); for (const value of strings) w.str(value);
  for (const i of [1, 3, 4, 5]) w.s(packed[i]);
  w.u(intern(packed[2]));
  for (let cat = 0; cat < 7; cat++) {
    w.u(cardData[cat].length);
    for (let slot = 0; slot < cardData[cat].length; slot++) {
      const [tag, values] = cardData[cat][slot]; w.u(tag);
      schemas[tag].forEach((field, i) => {
        const value = values[i];
        if (field === 'modList' || field === 'modListTr') {
          w.u(value.length); for (const ref of value) w.u(ref);
        } else if (field === 'cat' || field === 'slot') {
          const expected = field === 'cat' ? cat : slot;
          w.u(value === expected ? 0 : (value < 0 ? -value * 2 : value * 2 + 1));
        } else w.s(value);
      });
    }
  }
  const lookup = dictIndex(dictionary);
  w.u(pool.length);
  for (const mod of pool) {
    const index = lookup.get(`${mod[0]}:${mod[1]}`);
    if (index === undefined) {
      w.u(0); for (const i of [0, 1, 2]) w.s(mod[i]);
      w.u(intern(mod[3])); w.u(intern(mod[4])); w.s(mod[5]);
      continue;
    }
    const base = [...dictionary.entries[index], 0];
    let mask = 0; for (let i = 0; i < 6; i++) if (mod[i] !== base[i]) mask |= 1 << i;
    w.u(index + 1); w.u(mask);
    for (let i = 0; i < 6; i++) if (mask & (1 << i)) {
      if (i === 3 || i === 4) w.u(intern(mod[i])); else w.s(mod[i]);
    }
  }
  return w.finish();
}

export function decodePacked(bytes, dictionary) {
  const r = new Reader(bytes);
  if (r.u() !== 1) throw new Error('未知 BADS3 二进制版本');
  const stringCount = r.count(); const strings = [null];
  for (let i = 0; i < stringCount; i++) strings.push(r.str());
  const getString = () => { const n = r.u(); if (n >= strings.length) throw new Error('BADS3 文本引用无效'); return strings[n]; };
  const [version, spec1, spec2, country] = [r.s(), r.s(), r.s(), r.s()];
  const name = getString();
  const categories = []; let cardTotal = 0;
  for (let cat = 0; cat < 7; cat++) {
    const count = r.count(); cardTotal += count;
    if (cardTotal > MAX_ITEMS) throw new Error('BADS3 卡片过多');
    const cards = [];
    for (let slot = 0; slot < count; slot++) {
      const tag = r.u(), schema = schemas[tag];
      if (!schema) throw new Error('BADS3 卡片类型无效');
      const fields = schema.map((field) => {
        if (field === 'modList' || field === 'modListTr') {
          const n = r.count(); return Array.from({ length: n }, () => r.u());
        }
        if (field === 'cat' || field === 'slot') {
          const n = r.u(); return n === 0 ? (field === 'cat' ? cat : slot) : (n % 2 ? (n - 1) / 2 : -n / 2);
        }
        return r.s();
      });
      cards.push([tag, ...fields]);
    }
    categories.push(cards);
  }
  const poolCount = r.count(); const pool = [];
  for (let n = 0; n < poolCount; n++) {
    const ref = r.u(); let mod;
    if (!ref) mod = [r.s(), r.s(), r.s(), getString(), getString(), r.s()];
    else {
      if (ref > dictionary.entries.length) throw new Error('BADS3 字典引用无效');
      const mask = r.u(); if (mask > 63) throw new Error('BADS3 差异掩码无效');
      mod = [...dictionary.entries[ref - 1], 0];
      for (let i = 0; i < 6; i++) if (mask & (1 << i)) mod[i] = i === 3 || i === 4 ? getString() : r.s();
    }
    validMod(mod); pool.push(mod);
  }
  for (const cards of categories) for (const card of cards) {
    const schema = schemas[card[0]];
    schema.forEach((field, i) => {
      if (field !== 'modList' && field !== 'modListTr') return;
      card[i + 1] = card[i + 1].map((ref) => {
        if (ref >= pool.length) throw new Error('BADS3 改装引用无效');
        return pool[ref];
      });
    });
  }
  r.done(); return [categories, version, name, spec1, spec2, country];
}
