import { readFile, writeFile, rename } from 'node:fs/promises';

function nonempty(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} 必须填写`);
  return value.trim();
}

export function parseRelease(input) {
  if (!input || !['main', 'farm'].includes(input.line)) throw new Error('line 必须是 main 或 farm');
  const target = nonempty(input.target, 'target');
  if (!/^[0-9a-f]{40}$/.test(target)) throw new Error('target 必须是完整发布版本');
  const host = nonempty(input.host, 'host');
  if (host.startsWith('-') || /\s/.test(host)) throw new Error('host 必须是一个 SSH 主机名称');
  const plan = { line: input.line, target, host };
  if (input.announcement !== undefined) {
    plan.announcement = {
      title: nonempty(input.announcement?.title, 'announcement.title'),
      body: nonempty(input.announcement?.body, 'announcement.body'),
    };
  } else {
    if (!Array.isArray(input.changes) || !input.changes.length) throw new Error('changes 必须提供本次面向玩家的变更说明');
    plan.changes = input.changes.map((item, index) => nonempty(item, `changes[${index}]`));
  }
  if (plan.line === 'farm') {
    if (input.farmScript !== undefined) throw new Error('Farm日常发布改用 base/files，不再接受当次脚本路径');
    plan.base = nonempty(input.base, 'base');
    if (!/^[0-9a-f]{40}$/.test(plan.base) || plan.base === target)
      throw new Error('base 必须是与目标不同的完整当前版本');
    if (!Array.isArray(input.files) || !input.files.length) throw new Error('files 必须列出本次运行文件');
    plan.files = input.files.map(name => {
      if (typeof name !== 'string' || /[\x00-\x1f\\]/.test(name) ||
          !/^(dist|content|assets)\//.test(name) || name.split('/').some(part => ['', '.', '..'].includes(part)))
        throw new Error('文件清单只支持 dist/content/assets 下的明确相对路径');
      return name;
    }).sort();
    if (new Set(plan.files).size !== plan.files.length) throw new Error('文件清单包含重复项');
  }
  return plan;
}

export function renderAnnouncement(plan) {
  return {
    id: `release-${plan.line}-${plan.target}`,
    ...(plan.announcement ?? {
      title: `${plan.line === 'farm' ? '农场' : '社区'}更新`,
      body: `本次更新：\n${plan.changes.map(change => `• ${change}`).join('\n')}`,
    }),
  };
}

export async function readState(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

export async function saveState(path, state) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }

// These programs use existing read-only release checks and the existing Human
// announcement wrapper. Announcement text travels through stdin, not a shell.
export const REMOTE_VERIFY_SOURCE = `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const plan = JSON.parse(fs.readFileSync(0, 'utf8'));
const main = plan.line === 'main';
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const source = run('git', ['-C', main ? '/opt/doorbell-commons-source' : '/opt/aifarm', 'rev-parse', 'HEAD']);
if (source !== plan.target) throw new Error('目标版本与服务器源码版本不一致');
if (main && fs.readFileSync('/opt/doorbell-commons/.doorbell-release-sha', 'utf8').trim() !== plan.target)
  throw new Error('Main运行版本尚未到达目标版本');
if (!main && fs.existsSync('/var/lib/aifarm/maintenance')) throw new Error('Farm仍在维护中');
const service = main ? 'doorbell-commons.service' : 'aifarm.service';
if (run('systemctl', ['is-active', service]) !== 'active' ||
    run('systemctl', ['show', service, '-p', 'ExecMainStatus', '--value']) !== '0')
  throw new Error('服务状态未通过验收');
const urls = main
  ? ['http://127.0.0.1:3000/api/health', 'https://doorbellcommons.com/api/health']
  : ['http://127.0.0.1:8091/', 'https://doorbellcommons.com/farm/'];
for (const url of urls) {
  if (run('curl', ['--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}', url]) !== '200')
    throw new Error('直连或公网健康检查未通过');
}
process.stdout.write(JSON.stringify({ target: plan.target, line: plan.line, healthy: true }));
`;

export const REMOTE_PUBLISH_SOURCE = `
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { id, title, body } = JSON.parse(readFileSync(0, 'utf8'));
const result = execFileSync('/usr/local/sbin/doorbell-publish-human-announcement',
  ['--id', id, '--title', title, '--body', body], { encoding: 'utf8' });
process.stdout.write(result);
`;

export function remoteNodeCommand(source) {
  return `sudo -n /usr/bin/node -e ${shellQuote(source)}`;
}
