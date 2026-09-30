import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const siteConfig = JSON.parse(fs.readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
export const repository = siteConfig.publishRepository;
export const siteUrl = siteConfig.siteUrl;
export const branch = siteConfig.branch;
if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(repository) ||
    !/^[\w.-]+$/.test(branch) || !siteUrl.startsWith('https://')) {
  throw new Error('site.config.json 的发布目标无效');
}

export function git(args, cwd, { allowFailure = false } = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  let command = 'git';
  const options = [];
  if (process.platform === 'win32') {
    const gitRoot = path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git');
    const executable = path.join(gitRoot, 'cmd', 'git.exe');
    if (fs.existsSync(executable)) {
      command = executable;
      env.PATH = `${path.join(gitRoot, 'usr', 'bin')};${path.join(gitRoot, 'mingw64', 'bin')};${env.PATH}`;
      // 仅作用于此发布命令，绕过失效的其它应用凭据 helper。
      options.push('-c', 'credential.helper=', '-c', 'credential.helper=manager');
    }
  }
  const result = spawnSync(command, [...options, ...args], {
    cwd, env, encoding: 'utf8', windowsHide: true, timeout: 120_000,
  });
  if ((result.error || result.status !== 0) && !allowFailure) {
    throw new Error(result.error?.message || result.stderr.trim() || `git ${args[0]} failed`);
  }
  return { ok: !result.error && result.status === 0, output: result.stdout?.trim() || '' };
}
