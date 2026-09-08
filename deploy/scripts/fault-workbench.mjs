#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const assets = new URL('../maintenance/fault-workbench/', import.meta.url);
const cli = fileURLToPath(new URL('../../apps/server/dist/fault-reports/cli.js', import.meta.url));

export function faultExecutor({ host, directory }) {
  if ((!host && !directory) || (host && directory)) throw new Error('请选择服务器连接或本地记录目录。');
  if (host && (!/^[A-Za-z0-9_][A-Za-z0-9_.@-]*$/.test(host))) throw new Error('服务器连接名称无效。');
  return command => new Promise((accept, reject) => {
    const child = host
      ? spawn('ssh', ['-T', '-o', 'BatchMode=yes', '--', host,
        'sudo -n -u doorbell /usr/bin/node /opt/doorbell-commons/apps/server/dist/fault-reports/cli.js --directory /var/lib/doorbell-commons/fault-reports'], { stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(process.execPath, [cli, '--directory', resolve(directory)], { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.resume(); // Never forward remote error text or credentials into the page.
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error('故障记录读取失败'));
      try { accept(JSON.parse(Buffer.concat(output).toString())); } catch { reject(new Error('故障记录读取失败')); }
    });
    child.stdin.end(JSON.stringify(command));
  });
}

export function createWorkbench({ execute }) {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const origin = `http://127.0.0.1:${server.address().port}`;
    const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };
    if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)
        || request.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: '请从本机工作台打开。' });
    const pathname = new URL(request.url, origin).pathname;
    try {
      const file = { '/': ['index.html', 'text/html'], '/workbench.css': ['workbench.css', 'text/css'], '/workbench.js': ['workbench.js', 'text/javascript'] }[pathname];
      if (request.method === 'GET' && file) {
        response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` });
        return response.end(await readFile(new URL(file[0], assets)));
      }
      if (request.method === 'GET' && pathname === '/api/faults') return json(200, await execute({ op: 'list' }));
      if (request.method === 'POST' && ['/api/report', '/api/manual'].includes(pathname)) {
        if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return json(403, { error: '请从本机工作台操作。' });
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json(400, { error: '请检查填写内容。' }); }
        if (!input || typeof input !== 'object') return json(400, { error: '请检查填写内容。' });
        if (pathname === '/api/report') {
          if (typeof input.id !== 'string') return json(400, { error: '请先选择一条故障。' });
          const result = await execute({ op: 'report', id: input.id });
          return json(result.record ? 200 : 410, result.record ? result : { error: '这条记录已到期删除，请刷新列表。' });
        }
        if (typeof input.page !== 'string' || !input.page.trim() || typeof input.occurredAt !== 'number'
            || !Number.isFinite(input.occurredAt) || Number.isNaN(new Date(input.occurredAt).getTime())) return json(400, { error: '请补充大概时间和页面名称。' });
        return json(200, await execute({ op: 'manual', page: input.page, occurredAt: input.occurredAt }));
      }
      json(404, { error: '没有这个入口。' });
    } catch { json(503, { error: '暂时读不到记录。请检查服务器连接，以及故障采集是否已部署。' }); }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  try {
    const options = { port: 0 };
    for (let i = 2; i < process.argv.length; i += 2) {
      const flag = process.argv[i], value = process.argv[i + 1];
      if (!['--host', '--directory', '--port'].includes(flag) || !value) throw new Error('用法：fault-workbench.mjs --host <SSH连接名> [--port <端口>]；本地验证使用 --directory <记录目录>。');
      options[flag.slice(2)] = flag === '--port' ? Number(value) : value;
    }
    const server = createWorkbench({ execute: faultExecutor(options) });
    server.on('error', () => { process.stderr.write('工作台启动失败，请检查本机端口。\n'); process.exitCode = 1; });
    server.listen(options.port, '127.0.0.1', () => process.stdout.write(`故障材料工作台：http://127.0.0.1:${server.address().port}\n`));
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
