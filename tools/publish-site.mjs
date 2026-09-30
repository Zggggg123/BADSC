import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSite, root, output } from './build-site.mjs';
import { git, repository, siteUrl } from './site-git.mjs';

try {
  console.log(`发布目标：${repository}\n发布分支：main\n网站：${siteUrl}`);
  const release = buildSite();
  // 发布前运行编解码回归。有本地样本时覆盖完整语料，否则至少检查每份发布资源。
  if (fs.existsSync(path.join(root, 'test_dek', 'MAIN', '近坦 海步.dek'))) {
    for (const script of ['browser-codec-test.mjs', 'bads3-test.mjs']) {
      const result = spawnSync(process.execPath, [path.join(root, 'tools', script)], {
        cwd: root, stdio: 'inherit', windowsHide: true,
      });
      if (result.error || result.status !== 0) throw new Error(`回归失败：${script}`);
    }
  } else console.log('未找到本地 test_dek 样本；本次不运行语料回归。');
  const checkout = path.join(root, '.publish', 'repository');
  if (fs.existsSync(checkout) && fs.lstatSync(checkout).isSymbolicLink()) throw new Error('网站仓库缓存不能是符号链接');
  if (!fs.existsSync(checkout)) git(['clone', repository, checkout], root);
  if (git(['remote', 'get-url', 'origin'], checkout).output !== repository) throw new Error('网站远端不匹配，停止发布');
  if (git(['status', '--porcelain'], checkout).output) throw new Error('网站缓存有未提交改动，停止发布');
  const hasCommit = git(['rev-parse', '--verify', 'HEAD'], checkout, { allowFailure: true }).ok;
  git(['fetch', 'origin'], checkout);
  if (hasCommit) {
    if (git(['branch', '--show-current'], checkout).output !== 'main') throw new Error('网站仓库必须使用 main 分支');
    git(['merge', '--ff-only', 'origin/main'], checkout);
  } else git(['switch', '-C', 'main'], checkout);

  // 只删除由本脚本管理的旧文件；没有发布记录的非空仓库不能覆盖。
  const tracked = git(['ls-files', '-z'], checkout).output.split('\0').filter(Boolean);
  const previousPath = path.join(checkout, 'release.json');
  if (tracked.length && !fs.existsSync(previousPath)) throw new Error('目标仓库缺少 release.json，拒绝覆盖已有内容');
  const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : { assets: {} };
  const managed = new Set([...Object.keys(previous.assets), 'release.json', 'README.md', '.nojekyll', '.gitattributes']);
  if (tracked.some(name => !managed.has(name))) throw new Error('网站仓库有额外文件，停止发布以避免覆盖手工改动');
  for (const name of tracked) {
    if (!fs.existsSync(path.join(output, name))) {
      const absolute = path.resolve(checkout, name);
      if (!absolute.startsWith(checkout + path.sep)) throw new Error('旧资源路径越界');
      fs.unlinkSync(absolute);
    }
  }
  fs.cpSync(output, checkout, { recursive: true });
  git(['add', '--all'], checkout);
  if (git(['diff', '--cached', '--quiet'], checkout, { allowFailure: true }).ok) console.log('网页资源未变化。');
  else git(['commit', '-m', `Publish BADSC from ${release.sourceCommit.slice(0, 12)}`], checkout);
  git(['push', 'origin', 'HEAD:main'], checkout);
  console.log(`网站仓库已更新。等待 GitHub Pages 部署完成后访问：${siteUrl}\n线上版本可查看：${siteUrl}release.json`);
} catch (error) { console.error(`发布未完成：${error.message}`); process.exitCode = 1; }
