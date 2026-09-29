// BADS3 column payload format 2. Strict bounds are intentional for untrusted codes.
const schema = [
  ['unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
  ['cat', 'slot', 'modList', 'modListTr'],
  ['unitId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['unitId', 'unitSkinId', 'cat', 'slot', 'modList', 'modListTr', 'count'],
  ['tranSkinId', 'unitId', 'cat', 'slot', 'tranId', 'modList', 'modListTr', 'count', 'tranCount'],
];
const numericKeys = ['unitId', 'unitSkinId', 'tranId', 'tranSkinId', 'count', 'tranCount'];
const utf8 = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX = 100000;
function integer(n) { if (!Number.isSafeInteger(n) || Math.abs(n) > 0x7fffffff) throw new Error('BADS3 数值无效'); return n; }
function zig(n) { integer(n); return n < 0 ? -n * 2 - 1 : n * 2; }
function unzig(n) { return n % 2 ? -(n + 1) / 2 : n / 2; }
class Writer {
  constructor() { this.a = []; }
  u(n) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) throw new Error('BADS3 无符号数无效');
    do { const p = n % 128; n = Math.floor(n / 128); this.a.push(p + (n ? 128 : 0)); } while (n);
  }
  raw(bytes) { for (const byte of bytes) this.a.push(byte); }
  str(value) { const b = utf8.encode(value); if (b.length > 1048576) throw new Error('BADS3 文本过长'); this.u(b.length); this.raw(b); }
  bytes() { return Uint8Array.from(this.a); }
}
class Reader {
  constructor(b) { this.b = b; this.p = 0; }
  u() {
    let n = 0, m = 1;
    for (let i = 0; i < 5; i++) {
      if (this.p >= this.b.length) throw new Error('BADS3 截断');
      const v = this.b[this.p++]; n += (v & 127) * m;
      if (n > 0xffffffff) throw new Error('BADS3 数值溢出');
      if (!(v & 128)) return n;
      m *= 128;
    }
    throw new Error('BADS3 varint 过长');
  }
  count() { const n = this.u(); if (n > MAX) throw new Error('BADS3 项目过多'); return n; }
  str() { const n = this.u(); if (n > 1048576 || this.p + n > this.b.length) throw new Error('BADS3 文本长度无效'); const s = decoder.decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
  done() { if (this.p !== this.b.length) throw new Error('BADS3 含额外数据'); }
}
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function vector(values, mode) {
  const w = new Writer();
  if (mode === 0) for (const n of values) w.u(n);
  if (mode === 2) { let prev = 0; for (const n of values) { w.u(zig(n - prev)); prev = n; } }
  if (mode === 1) {
    let min = 0xffffffff, max = 0;
    for (const n of values) { min = Math.min(min, n); max = Math.max(max, n); }
    let step = 0; for (const n of values) step = gcd(step, n - min);
    step ||= 1; const width = Math.ceil(Math.log2((max - min) / step + 1));
    w.u(min); w.u(step); w.u(width);
    let acc = 0, bits = 0;
    for (const n of values) {
      const scaled = (n - min) / step;
      for (let i = 0; i < width; i++) {
        acc += (Math.floor(scaled / 2 ** i) % 2) * 2 ** bits;
        if (++bits === 8) { w.a.push(acc); acc = 0; bits = 0; }
      }
    }
    if (bits) w.a.push(acc);
  }
  return w.bytes();
}
function readVector(r, n, mode) {
  if (mode === 0) return Array.from({ length: n }, () => r.u());
  if (mode === 2) {
    let prev = 0;
    return Array.from({ length: n }, () => {
      prev += unzig(r.u()); if (prev < 0 || prev > 0xffffffff) throw new Error('BADS3 差分溢出'); return prev;
    });
  }
  if (mode !== 1) throw new Error('BADS3 列模式无效');
  const min = r.u(), step = r.u(), width = r.u();
  if (!step || width > 32 || Math.ceil(n * width / 8) > r.b.length - r.p) throw new Error('BADS3 位列无效');
  const start = r.p; let bit = 0;
  const values = Array.from({ length: n }, () => {
    let scaled = 0;
    for (let i = 0; i < width; i++, bit++) scaled += ((r.b[start + Math.floor(bit / 8)] >> (bit % 8)) & 1) * 2 ** i;
    const value = min + scaled * step;
    if (!Number.isSafeInteger(value) || value > 0xffffffff) throw new Error('BADS3 位列溢出');
    return value;
  });
  r.p += Math.ceil(bit / 8); return values;
}
function validateMod(mod) {
  if (!Array.isArray(mod) || mod.length !== 6) throw new Error('BADS3 改装无效');
  for (const i of [0, 1, 2, 5]) integer(mod[i]);
  for (const i of [3, 4]) if (mod[i] !== null && typeof mod[i] !== 'string') throw new Error('BADS3 改装文本无效');
}
export function encodeColumns(packed, dictionary) {
  if (!Array.isArray(packed) || packed.length !== 6 || !Array.isArray(packed[0]) || packed[0].length !== 7) throw new Error('BADS3 卡组无效');
  const strings = [], stringMap = new Map();
  const stringIndex = (s) => {
    if (s === null) return 0;
    if (typeof s !== 'string') throw new Error('BADS3 文本无效');
    if (!stringMap.has(s)) { strings.push(s); stringMap.set(s, strings.length); }
    return stringMap.get(s);
  };
  const cols = Array.from({ length: 24 }, () => []);
  cols[0] = [zig(packed[1]), zig(packed[3]), zig(packed[4]), zig(packed[5])];
  cols[15] = [stringIndex(packed[2])];
  const mods = [], modMap = new Map();
  for (let cat = 0; cat < 7; cat++) {
    const cards = packed[0][cat];
    if (!Array.isArray(cards) || cards.length > MAX) throw new Error('BADS3 分类无效');
    cols[1].push(cards.length);
    for (let slot = 0; slot < cards.length; slot++) {
      const card = cards[slot], fields = Array.isArray(card) ? schema[card[0]] : null;
      if (!fields || card.length !== fields.length + 1) throw new Error('BADS3 卡片无效');
      const obj = Object.fromEntries(fields.map((field, i) => [field, card[i + 1]]));
      cols[2].push(card[0]);
      cols[3].push(obj.cat === cat ? 0 : zig(obj.cat) + 1);
      cols[4].push(obj.slot === slot ? 0 : zig(obj.slot) + 1);
      numericKeys.forEach((field, i) => { if (field in obj) cols[5 + i].push(zig(obj[field])); });
      for (let side = 0; side < 2; side++) {
        const list = obj[side ? 'modListTr' : 'modList'];
        if (!Array.isArray(list) || list.length > MAX) throw new Error('BADS3 改装列表无效');
        cols[11 + side * 2].push(list.length);
        for (const mod of list) {
          validateMod(mod); const key = JSON.stringify(mod);
          if (!modMap.has(key)) { modMap.set(key, mods.length); mods.push(mod); }
          cols[12 + side * 2].push(modMap.get(key));
        }
      }
    }
  }
  if (mods.length > MAX) throw new Error('BADS3 改装过多');
  const lookup = new Map(dictionary.entries.map((row, i) => [`${row[0]}:${row[1]}`, i]));
  for (const mod of mods) {
    const index = lookup.get(`${mod[0]}:${mod[1]}`);
    const base = index === undefined ? null : [...dictionary.entries[index], 0];
    let mask = base ? 0 : 63;
    if (base) for (let i = 0; i < 6; i++) if (mod[i] !== base[i]) mask |= 1 << i;
    cols[16].push(index === undefined ? 0 : index + 1);
    cols[17].push(mask);
    for (let i = 0; i < 6; i++) if (mask & (1 << i)) cols[18 + i].push(i === 3 || i === 4 ? stringIndex(mod[i]) : zig(mod[i]));
  }
  const w = new Writer(); w.u(2);
  w.u(strings.length); for (const value of strings) w.str(value);
  for (const values of cols) {
    if (values.length > MAX) throw new Error('BADS3 列过长');
    w.u(values.length);
    if (!values.length) continue;
    const choices = [0, 1, 2].flatMap((mode) => {
      try { return [{ mode, bytes: vector(values, mode) }]; } catch { return []; }
    });
    choices.sort((a, b) => a.bytes.length - b.bytes.length);
    w.u(choices[0].mode); w.raw(choices[0].bytes);
  }
  return w.bytes();
}

export function decodeColumns(bytes, dictionary) {
  const r = new Reader(bytes);
  if (r.u() !== 2) throw new Error('BADS3 列版本无效');
  const count = r.count(), strings = [null];
  for (let i = 0; i < count; i++) strings.push(r.str());
  const cols = []; let total = 0;
  for (let i = 0; i < 24; i++) {
    const n = r.count(); total += n;
    if (total > 1000000) throw new Error('BADS3 列数据过多');
    cols.push(n ? readVector(r, n, r.u()) : []);
  }
  r.done();
  const at = Array(24).fill(0), next = (i) => { if (at[i] >= cols[i].length) throw new Error('BADS3 列引用截断'); return cols[i][at[i]++]; };
  const str = (n) => { if (n >= strings.length) throw new Error('BADS3 文本引用无效'); return strings[n]; };
  if (cols[0].length !== 4 || cols[1].length !== 7 || cols[15].length !== 1 || cols[16].length !== cols[17].length) throw new Error('BADS3 列形状无效');
  const meta = cols[0].map(unzig), name = str(next(15));
  const categories = [];
  for (let cat = 0; cat < 7; cat++) {
    const cards = [], cardCount = next(1);
    if (cardCount > MAX) throw new Error('BADS3 卡片过多');
    for (let slot = 0; slot < cardCount; slot++) {
      const tag = next(2), fields = schema[tag];
      if (!fields) throw new Error('BADS3 卡片类型无效');
      const cv = next(3), sv = next(4);
      const obj = { cat: cv ? unzig(cv - 1) : cat, slot: sv ? unzig(sv - 1) : slot };
      numericKeys.forEach((key, i) => { if (fields.includes(key)) obj[key] = unzig(next(5 + i)); });
      for (let side = 0; side < 2; side++) {
        const n = next(11 + side * 2);
        if (n > MAX) throw new Error('BADS3 改装列表过长');
        obj[side ? 'modListTr' : 'modList'] = Array.from({ length: n }, () => next(12 + side * 2));
      }
      cards.push([tag, ...fields.map((key) => obj[key])]);
    }
    categories.push(cards);
  }
  const mods = [];
  for (let i = 0; i < cols[16].length; i++) {
    const ref = next(16), mask = next(17);
    if (mask > 63 || (ref === 0 && mask !== 63) || ref > dictionary.entries.length) throw new Error('BADS3 字典引用无效');
    const mod = ref ? [...dictionary.entries[ref - 1], 0] : Array(6).fill(null);
    for (let j = 0; j < 6; j++) if (mask & (1 << j)) mod[j] = j === 3 || j === 4 ? str(next(18 + j)) : unzig(next(18 + j));
    validateMod(mod); mods.push(mod);
  }
  for (const cards of categories) for (const card of cards) {
    schema[card[0]].forEach((field, i) => {
      if (field !== 'modList' && field !== 'modListTr') return;
      card[i + 1] = card[i + 1].map((index) => {
        if (index >= mods.length) throw new Error('BADS3 改装引用无效');
        return mods[index];
      });
    });
  }
  for (let i = 0; i < 24; i++) if (at[i] !== cols[i].length && i !== 0) throw new Error('BADS3 列含未使用数据');
  return [categories, meta[0], name, meta[1], meta[2], meta[3]];
}
