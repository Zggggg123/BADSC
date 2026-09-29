// Build an immutable BADS3 dictionary from BA-Units output/Options.json.
// No third-party code is executed; input JSON is treated as data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function fail(message) { throw new Error(message); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function integer(value, label) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 0x7fffffff) fail(`${label} 不是支持的整数`);
  return value;
}
function nullable(value, label) {
  if (value !== null && typeof value !== 'string') fail(`${label} 不是字符串或 null`);
  return value;
}
function locate(input) {
  const stat = fs.statSync(input);
  if (stat.isFile()) return { options: input, manifest: null };
  for (const candidate of ['Options.json', 'output/Options.json']) {
    const file = path.join(input, candidate);
    if (fs.existsSync(file)) {
      const manifest = path.join(path.dirname(file), 'manifest.json');
      return { options: file, manifest: fs.existsSync(manifest) ? manifest : null };
    }
  }
  fail('目录中找不到 Options.json 或 output/Options.json');
}
function atomicWrite(file, bytes) {
  const temp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp, bytes, { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function main(args) {
  const input = args[0]; if (!input) fail('用法：node tools/build-dictionary.cjs <BA-Units 输出目录或 Options.json> --version <版本> [--date YYYY-MM-DD]');
  const source = locate(path.resolve(input));
  const flags = Object.fromEntries(args.slice(1).filter((_, i, a) => i % 2 === 0).map((name, i) => [name, args[2 * i + 2]]));
  let upstream = {};
  if (source.manifest) upstream = JSON.parse(fs.readFileSync(source.manifest, 'utf8'));
  const version = flags['--version'] || upstream.version || upstream.Version;
  if (!version || typeof version !== 'string' || version.length > 80) fail('请用 --version 指定来源数据库版本');
  const date = flags['--date'] || upstream.date || upstream.Date || null;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('来源日期需为 YYYY-MM-DD');
  const sourceBytes = fs.readFileSync(source.options);
  const options = JSON.parse(sourceBytes.toString('utf8'));
  if (!Array.isArray(options)) fail('Options.json 不是数组');
  const entries = options.map((row, i) => {
    if (!row || typeof row !== 'object') fail(`第 ${i + 1} 行无效`);
    return [integer(row.ModificationId, 'ModificationId'), integer(row.Id, 'Id'),
      integer(row.Cost, 'Cost'), nullable(row.ReplaceUnitName, 'ReplaceUnitName'),
      nullable(row.ConcatenateWithUnitName, 'ConcatenateWithUnitName')];
  });
  entries.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 1; i < entries.length; i++) if (entries[i][0] === entries[i - 1][0] && entries[i][1] === entries[i - 1][1]) fail('Options 中有重复的 ModificationId/Id');
  const snapshot = { format: 1, source: { repository: 'JohnJinHM/BA-Units', version, date,
    optionsSha256: sha(sourceBytes), manifestSha256: source.manifest ? sha(fs.readFileSync(source.manifest)) : null,
    mapping: 'ModificationId,Id,Cost,ReplaceUnitName,ConcatenateWithUnitName; deck type defaults to 0' }, entries };
  const bytes = Buffer.from(JSON.stringify(snapshot) + '\n');
  const hash = sha(bytes), id = hash.slice(0, 16);
  const out = flags['--out'] ? path.resolve(flags['--out']) : path.resolve(__dirname, '..', 'web', 'dictionaries');
  fs.mkdirSync(out, { recursive: true });
  const fileName = `${id}.json`, file = path.join(out, fileName), indexFile = path.join(out, 'manifest.json');
  let manifest = { format: 1, current: id, snapshots: [] };
  if (fs.existsSync(indexFile)) {
    manifest = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    if (manifest.format !== 1 || !Array.isArray(manifest.snapshots)) fail('现有字典清单格式无效');
  }
  if (fs.existsSync(file) && sha(fs.readFileSync(file)) !== hash) fail('快照文件内容冲突，未覆盖');
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { flag: 'wx' });
  const existing = manifest.snapshots.find((row) => row.id === id);
  if (existing && existing.sha256 !== hash) fail('字典 ID 冲突，未修改清单');
  if (!existing) manifest.snapshots.push({ id, file: fileName, sha256: hash, version, date });
  manifest.current = id;
  atomicWrite(indexFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`字典 ${id}：${entries.length} 项；来源版本 ${version}；Options SHA-256 ${snapshot.source.optionsSha256}`);
  console.log(`已保留 ${manifest.snapshots.length} 个可解码快照。只更新本地静态资源，未发布网站。`);
}
try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
