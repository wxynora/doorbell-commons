#!/usr/bin/env python3
"""Farm's existing release sequence, with an explicit revision and file manifest."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone


PATHS = {
    'repo': Path('/opt/aifarm'),
    'data': Path('/var/lib/aifarm'),
    'backups': Path('/var/backups/aifarm/releases'),
    'lock': Path('/run/lock/aifarm-deploy.lock'),
    'log': Path('/var/log/nginx/access.log'),
}
SERVICE = 'aifarm.service'
DIRECT = 'http://127.0.0.1:8091/'
PUBLIC = 'https://doorbellcommons.com/farm/'
PREFIXES = (b'/farm', b'/mcp', b'/api/farm', b'/api/lingye', b'/api/settings',
            b'/api/owner-profile', b'/api/mcp-access')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def parse_plan(plan):
    require(isinstance(plan, dict), '发布单必须是对象')
    for key in ('base', 'target'):
        require(isinstance(plan.get(key), str) and re.fullmatch('[0-9a-f]{40}', plan[key]),
                key + ' 必须是完整版本')
    require(plan['base'] != plan['target'], '基线与目标版本相同，无需部署')
    files = plan.get('files')
    require(isinstance(files, list) and files, 'files 必须列出本次运行文件')
    for name in files:
        require(isinstance(name, str) and not any(ord(c) < 32 for c in name)
                and '\\' not in name and name.split('/')[0] in ('dist', 'content', 'assets')
                and len(name.split('/')) > 1 and all(p not in ('', '.', '..') for p in name.split('/')),
                '文件清单只支持 dist/content/assets 下的明确相对路径')
    require(len(files) == len(set(files)), '文件清单包含重复项')
    return {'base': plan['base'], 'target': plan['target'], 'files': sorted(files)}


def run_command(args, *, cwd=None, check=True):
    result = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(f'{args[0]} 执行失败（{result.returncode}）：{result.stderr.strip()}')
    return result


def emit(event):
    print(json.dumps(event, ensure_ascii=False), flush=True)


def wait_for_quiet(paths, run=run_command, clock=time.monotonic, sleep=time.sleep, report=emit):
    """Keep the published 60s quiet condition and 1s/15s observation intervals."""
    marker = paths['data'] / 'maintenance'
    require(not marker.exists(), 'maintenance already active')
    with paths['log'].open('rb') as source:
        source.seek(0, 2)
        last_activity = clock()
        reported = 0
        while True:
            require(os.fstat(source.fileno()).st_ino == paths['log'].stat().st_ino,
                    'log rotated; restart fresh quiet check')
            for line in source.read().splitlines():
                request = re.search(rb'"(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) ([^ ]+) HTTP/', line)
                if request and request.group(1).startswith(PREFIXES):
                    last_activity = clock()
            connections = run(['ss', '-tnH', 'state', 'established', 'sport = :8091']).stdout.strip().splitlines()
            now = clock()
            age = now - last_activity
            if age >= 60 and not connections:
                fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                os.close(fd)
                report({'maintenance': 'on', 'fresh_quiet_seconds': round(age, 1), 'connections': 0})
                return
            if now - reported >= 15:
                report({'waiting_for_quiet': True, 'quiet_seconds': round(age, 1), 'connections': len(connections)})
                reported = now
            sleep(1)


def deploy(plan, paths=PATHS, run=run_command, clock=time.monotonic, sleep=time.sleep, report=emit):
    plan = parse_plan(plan)
    repo, data = paths['repo'], paths['data']
    marker = data / 'maintenance'
    result = {'base': plan['base'], 'target': plan['target'], 'files': plan['files'], 'stage': 'preflight'}
    backup = None

    def record():
        if backup:
            temporary = backup / 'report.json.tmp'
            temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
            temporary.replace(backup / 'report.json')

    def stage(name):
        result['stage'] = name
        record()
        report({'stage': name})

    def git(*args):
        return run(['git', *args], cwd=repo).stdout

    def service_property(name):
        return run(['systemctl', 'show', SERVICE, '-p', name, '--value']).stdout.strip()

    def health(url, timeout=15, check=True):
        return run(['curl', '-sS', '--max-time', str(timeout), '-o', '/dev/null', '-w', '%{http_code}', url],
                   check=check).stdout.strip()

    def source_unchanged():
        require(git('rev-parse', 'HEAD').strip() == plan['base'], '服务器版本与发布基线不一致')
        require(not git('status', '--porcelain'), '服务器源码有未提交文件')

    old_umask = os.umask(0o022)
    try:
        with paths['lock'].open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                source_unchanged()
                require(not marker.exists(), '农场已在维护，须先核对原任务')
                require(run(['systemctl', 'is-active', SERVICE]).stdout.strip() == 'active', '农场服务未运行')
                git('fetch', 'origin', 'farm')
                require(git('rev-parse', 'refs/remotes/origin/farm').strip() == plan['target'],
                        'farm 发布线已变化，须重新准备发布单')
                git('merge-base', '--is-ancestor', plan['base'], plan['target'])
                changed = git('diff', '--name-only', '--no-renames', '-z', plan['base'], plan['target']).split('\0')[:-1]
                require(sorted(changed) == plan['files'], '目标版本实际变更与文件清单不一致')
                old_files, new_files = [], []
                for revision, names in ((plan['base'], old_files), (plan['target'], new_files)):
                    for item in git('ls-tree', '-r', '-z', revision).split('\0'):
                        if not item:
                            continue
                        meta, name = item.split('\t', 1)
                        if name in plan['files']:
                            require(meta.split()[0] in ('100644', '100755'), '不支持符号链接／子模块发布：' + name)
                            names.append(name)
                result['before_pid'] = service_property('MainPID')
                result['NRestarts'] = service_property('NRestarts')
                require(result['before_pid'].isdigit() and int(result['before_pid']) > 0, '没有有效农场进程')

                stage('quiet')
                wait_for_quiet(paths, run, clock, sleep, report)
                stage('maintenance')
                source_unchanged()
                require(health(DIRECT) == '503' and health(PUBLIC) == '503', '维护入口没有全部拒绝请求')
                stage('stop')
                run(['systemctl', 'stop', SERVICE])
                require(run(['systemctl', 'is-active', SERVICE], check=False).stdout.strip() == 'inactive'
                        and service_property('MainPID') == '0', '农场未完全停服，不备份存档')
                stage('backup')
                stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
                location = paths['backups'] / f'{stamp}-pre-{plan["target"][:7]}'
                location.mkdir(parents=True, mode=0o700, exist_ok=False)
                backup = location
                result['backup'] = str(backup)
                record()
                for name in ('lingye-world.sqlite', 'world.json'):
                    shutil.copy2(data / name, backup / name)
                for suffix in ('-wal', '-shm'):
                    companion = data / ('lingye-world.sqlite' + suffix)
                    if companion.exists():
                        shutil.copy2(companion, backup / companion.name)
                with tarfile.open(backup / 'runtime-before.tar', 'w') as archive:
                    for name in old_files:
                        archive.add(repo / name, arcname=name, recursive=False)
                (backup / 'source-before.txt').write_text(plan['base'] + '\n')
                (backup / 'release.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
                result['backup_complete'] = True

                stage('install')
                git('merge', '--ff-only', plan['target'])
                require(git('rev-parse', 'HEAD').strip() == plan['target'] and not git('status', '--porcelain'),
                        '快进后源码状态不符')
                for name in new_files:
                    run(['runuser', '-u', 'aifarm', '--', 'test', '-r', str(repo / name)])

                stage('start')
                result['started_at'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                run(['systemctl', 'start', SERVICE])
                ready = False
                for _ in range(30):
                    require(service_property('NRestarts') == result['NRestarts'], '新服务出现自动重启')
                    if health(DIRECT, timeout=2, check=False) == '503':
                        ready = True
                        break
                    sleep(1)
                require(ready, '新服务未就绪')
                require(run(['systemctl', 'is-active', SERVICE]).stdout.strip() == 'active'
                        and service_property('ExecMainStatus') == '0'
                        and service_property('NRestarts') == result['NRestarts'], '启动状态未通过')
                result['after_pid'] = service_property('MainPID')
                require(result['after_pid'].isdigit() and int(result['after_pid']) > 0
                        and result['after_pid'] != result['before_pid'], '进程未成功切换')

                stage('health')
                marker.unlink()
                require(health(DIRECT) == '200' and health(PUBLIC) == '200', '解除维护后健康检查未通过')
                result.update(maintenance='off', direct_health=200, public_health=200)
                stage('complete')
                report(result)
                return result
            except Exception as error:
                # Match the existing startup failure behavior: stop the broken new
                # process, retain maintenance and backups; never invent rollback.
                if result['stage'] == 'start':
                    try:
                        run(['systemctl', 'stop', SERVICE])
                    except Exception as stop_error:
                        result['stop_error'] = str(stop_error)
                result['error'] = str(error)
                result['maintenance'] = 'on' if marker.exists() else 'off'
                record()
                report(result)
                raise
    finally:
        os.umask(old_umask)


if __name__ == '__main__':
    try:
        deploy(json.load(sys.stdin))
    except Exception as error:
        print(f'Farm 发布未完成：{error}', file=sys.stderr)
        sys.exit(1)
