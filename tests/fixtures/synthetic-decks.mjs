// Deterministic, invented conversion fixtures. These are not playable game decks.
// Encrypt independently with Node crypto to check browser decoding byte-for-byte.
import { createCipheriv } from 'node:crypto';
import fs from 'node:fs';
const dictionaryRoot = new URL('../../web/dictionaries/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', dictionaryRoot), 'utf8'));
const dictionary = JSON.parse(fs.readFileSync(new URL(`${manifest.current}.json`, dictionaryRoot), 'utf8'));
const categories = ['Recon', 'Infantry', 'GroundCombatVehicles', 'Support', 'Logistic', 'Helicopters', 'Aircrafts'];
function mod(index = 0) {
  const [modId, optId, cost, run, cwun] = dictionary.entries[index];
  return { modId, optId, cost, run, cwun, type: 0 };
}
function deck(name) {
  const set2 = Object.fromEntries(categories.map((category, cat) => [category, Array.from({ length: 5 }, (_, slot) => {
    const common = { unitId: 900000 + cat * 10 + slot, cat, slot, tranId: 910000 + cat,
      modList: [mod()], modListTr: [mod(1)], count: 1, tranCount: 1 };
    if (slot === 1) return { cat, slot, modList: [], modListTr: [] };
    if (slot === 2) return { unitId: common.unitId, cat, slot, modList: [mod()], modListTr: [], count: 2 };
    if (slot === 3) return { unitId: common.unitId, unitSkinId: 3, cat, slot, modList: [mod()], modListTr: [], count: 1 };
    if (slot === 4) return { tranSkinId: 4, ...common };
    return common;
  })]));
  return { set2, v: 6, name, spec1: 1, spec2: 2, country: 0 };
}
function encrypt(value, seed, canonical = true) {
  const iv = Buffer.alloc(16, seed);
  const plain = JSON.stringify(value, null, 2);
  const cipher = createCipheriv('aes-256-cbc', Buffer.from('09234237536700238099172758697347'), iv);
  return Buffer.concat([Buffer.from('fhk3s0g3'), iv,
    cipher.update(Buffer.from(canonical ? plain.replace(/\n/g, '\r\n') : plain)), cipher.final()]);
}
export function syntheticFixtures() {
  const base = deck('Synthetic conversion fixture');
  const unknown = structuredClone(base); unknown.set2.Recon[0].extraTestField = null;
  const inline = structuredClone(base);
  Object.assign(inline.set2.Recon[0].modList[0], { modId: 2147483640, optId: 2147483641, cost: -7, run: '', cwun: null, type: 3 });
  return [
    { name: 'structured.dek', bytes: encrypt(base, 1) },
    { name: 'unicode-name.dek', bytes: encrypt(deck('测试-Deck-1'), 2) },
    { name: 'unknown-field.dek', bytes: encrypt(unknown, 3) },
    { name: 'different-formatting.dek', bytes: encrypt(base, 4, false) },
    { name: 'inline-modification.dek', bytes: encrypt(inline, 5) },
  ];
}
