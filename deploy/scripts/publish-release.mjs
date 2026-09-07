#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, realpath, open, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseRelease, renderAnnouncement, readState, saveState, shellQuote,
  REMOTE_VERIFY_SOURCE, REMOTE_PUBLISH_SOURCE, remoteNodeCommand,
} from './release-announcement.mjs';

export function runProcess(command, args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    child.stdout.on('data', data => { stdout.push(data); if (options.stream) process.stdout.write(data); });
    child.stderr.on('data', data => { stderr.push(data); if (options.stream) process.stderr.write(data); });
    child.on('error', reject);
    child.on('close', (code, signal) => resolveResult({ code, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
    if (child.stdin) {
      child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
      child.stdin.end(options.input);
    }
  });
}

function requireSuccess(result, step) {
  if (result.code !== 0) throw new Error(`${step}未完成（${result.signal ?? result.code}）：${result.stderr.trim()}`);
  return result.stdout;
}

export async function publishRelease(planPath, { prepareOnly = false, announceOnly = false, run = runProcess } = {}) {
  planPath = resolve(planPath);
  const plan = parseRelease(JSON.parse(await readFile(planPath, 'utf8')));
  const statePath = `${planPath}.state.json`;
  // Only claim this release record. Server deployment locks remain authoritative.
  const lockPath = `${statePath}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`本发布记录正在执行或上次执行中断，请先核对：${lockPath}`);
    throw error;
  }
  try {
    let state = await readState(statePath);
    if (!state) {
      state = { plan, announcement: renderAnnouncement(plan), phase: 'prepared' };
      await saveState(statePath, state);
    } else if (JSON.stringify(state.plan) !== JSON.stringify(plan)) {
      throw new Error('发布单与已保存记录不一致；请保留原单补发，不覆盖已定稿公告');
    }
    if (!['prepared', 'deploying', 'deployment_failed', 'deployed', 'verified', 'published'].includes(state.phase))
      throw new Error('发布记录阶段无效，请核对原记录');
    if (prepareOnly || state.phase === 'published') return { statePath, ...state };
    if (state.phase === 'deploying' || state.phase === 'deployment_failed')
      throw new Error('上次部署未完整结束，线上结果待核对；不会自动重跑部署或发送公告');

    if (state.phase === 'prepared') {
      if (announceOnly) throw new Error('尚无部署成功记录，不能直接补发公告');
      state.phase = 'deploying';
      await saveState(statePath, state);
      try {
        if (plan.line === 'main') {
          const publisher = join(dirname(fileURLToPath(import.meta.url)), 'publish-doorbell-main.sh');
          requireSuccess(await run('bash', [publisher, plan.target, plan.host], { stream: true }), 'Main部署');
        } else {
          const deployer = await readFile(new URL('./deploy-farm.py', import.meta.url), 'utf8');
          const output = requireSuccess(await run('ssh', ['--', plan.host, `sudo -n python3 -c ${shellQuote(deployer)}`], {
            input: JSON.stringify({ base: plan.base, target: plan.target, files: plan.files }), stream: true,
          }), 'Farm部署');
          const receipt = JSON.parse(output.trim().split('\n').at(-1));
          if (receipt.stage !== 'complete' || receipt.base !== plan.base || receipt.target !== plan.target ||
              receipt.backup_complete !== true || !receipt.backup || receipt.maintenance !== 'off' ||
              receipt.direct_health !== 200 || receipt.public_health !== 200)
            throw new Error('Farm部署完成回执不匹配，须核对实际阶段');
          state.deployment = receipt;
        }
      } catch (error) {
        state.phase = 'deployment_failed';
        state.error = error.message;
        await saveState(statePath, state);
        throw new Error(`${error.message}\n线上最终状态待核对，公告未发送。记录：${statePath}`);
      }
      state.phase = 'deployed';
      await saveState(statePath, state);
    }

    // A failed announcement resumes here; it never calls the deployer again.
    // Recheck live state even if a previous attempt already passed acceptance.
    try {
      const output = requireSuccess(await run('ssh', ['--', plan.host, remoteNodeCommand(REMOTE_VERIFY_SOURCE)], {
        input: JSON.stringify({ line: plan.line, target: plan.target }),
      }), '发布验收');
      const receipt = JSON.parse(output);
      if (receipt.target !== plan.target || receipt.line !== plan.line || receipt.healthy !== true)
        throw new Error('发布验收回执不匹配');
      state.phase = 'verified';
      state.acceptance = receipt;
      delete state.error;
      await saveState(statePath, state);

      const result = requireSuccess(await run('ssh', ['--', plan.host, remoteNodeCommand(REMOTE_PUBLISH_SOURCE)], {
        input: JSON.stringify(state.announcement),
      }), '公告发布').trim();
      const prefix = `Human announcement ${state.announcement.id}: `;
      if (result !== `${prefix}published` && result !== `${prefix}already_published`)
        throw new Error('公告回执不确定，保留原稿待核对／补发');
      state.phase = 'published';
      state.announcementReceipt = result.slice(prefix.length);
      delete state.error;
      await saveState(statePath, state);
      return { statePath, ...state };
    } catch (error) {
      state.error = error.message;
      await saveState(statePath, state);
      const status = state.phase === 'verified' ? '版本已验收，公告待补发' : '部署步骤已结束，发布验收待处理，公告未发送';
      throw new Error(`${status}：${error.message}\n再次执行此入口只继续验收／公告，不重跑部署。记录：${statePath}`);
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href) {
  const [planPath, mode, ...extra] = process.argv.slice(2);
  if (!planPath || extra.length || (mode && !['--prepare-only', '--announce-only'].includes(mode))) {
    console.error('用法：node deploy/scripts/publish-release.mjs <发布单.json> [--prepare-only|--announce-only]');
    process.exitCode = 1;
  } else {
    try {
      const result = await publishRelease(planPath, { prepareOnly: mode === '--prepare-only', announceOnly: mode === '--announce-only' });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
