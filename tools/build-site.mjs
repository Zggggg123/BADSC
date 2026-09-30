import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { git, siteUrl } from './site-git.mjs';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const output = path.join(root, '.publish', 'site');
const entries = [
  'index.html', 'app.js', 'i18n.js', 'codec.js', 'bads3-binary.js',
  'bads3-columns.js', 'style.css', 'favicon.svg', 'dictionaries', 'vendor',
];

export function buildSite({ preview = false } = {}) {
  const dirty = git(['status', '--porcelain', '--untracked-files=normal'], root).output;
  if (dirty && !preview) throw new Error('开发仓库有未提交改动。请先提交，或用 --preview 仅生成本地预览。');
  const sourceCommit = git(['rev-parse', 'HEAD'], root).output;
  const cache = path.dirname(output);
  // 只清理固定的构建目录；拒绝符号链接，避免误删外部路径。
  if (fs.existsSync(cache) && fs.lstatSync(cache).isSymbolicLink()) throw new Error('发布缓存不能是符号链接');
  fs.mkdirSync(cache, { recursive: true });
  if (fs.existsSync(output)) {
    if (fs.lstatSync(output).isSymbolicLink() || fs.realpathSync(output) !== path.join(fs.realpathSync(cache), 'site')) {
      throw new Error('发布目录路径检查失败');
    }
    fs.rmSync(output, { recursive: true });
  }
  fs.mkdirSync(output);
  const assets = {};
  function copy(relative) {
    const source = path.join(root, 'web', relative);
    const destination = path.join(output, relative);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`禁止发布符号链接：${relative}`);
    if (stat.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      for (const name of fs.readdirSync(source).sort()) copy(`${relative}/${name}`);
    } else if (stat.isFile()) {
      fs.copyFileSync(source, destination);
      assets[relative] = createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
    } else throw new Error(`不支持的文件：${relative}`);
  }
  for (const entry of entries) copy(entry);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'dictionaries', 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !manifest.snapshots.some(snapshot => snapshot.id === manifest.current)) {
    throw new Error('字典清单无效');
  }
  for (const snapshot of manifest.snapshots) {
    if (!/^[0-9a-f]{16}$/.test(snapshot.id) || snapshot.file !== `${snapshot.id}.json` ||
        snapshot.sha256?.slice(0, 16) !== snapshot.id || assets[`dictionaries/${snapshot.file}`] !== snapshot.sha256) {
      throw new Error(`字典快照缺失或校验失败：${snapshot.id}`);
    }
  }
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  // Pages 的 Linux checkout 与 Windows 发布目录必须保留相同字节。
  fs.writeFileSync(path.join(output, '.gitattributes'), '* -text\n');
  const release = { sourceRepository: 'https://github.com/Zggggg123/BADSC', sourceCommit, preview: Boolean(dirty), assets };
  fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), `# BADSC website\n\nLive site: ${siteUrl}\n\nGenerated from the BADSC development repository, commit ${sourceCommit}.\nDo not edit website files here. Publish through the development repository.\n\nDeck files and share codes are processed entirely in the browser.\nThird-party license: [brotli-wasm](vendor/LICENSE).\n`);
  return release;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const release = buildSite({ preview: process.argv.includes('--preview') });
    console.log(`站点已生成：${output}\n开发提交：${release.sourceCommit}\n资源数：${Object.keys(release.assets).length}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
