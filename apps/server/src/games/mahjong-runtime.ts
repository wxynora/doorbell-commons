import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

/** Fail startup with the configured Python instead of silently hiding Hu actions. */
export function verifyMahjongRuntime(config:{pythonExecutable:string;repositoryRoot:string}):void {
  const root=resolve(config.repositoryRoot);
  const result=spawnSync(config.pythonExecutable,[resolve(root,'deploy/scripts/verify-mahjong-native.py'),root],{
    cwd:root,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',shell:false,
  });
  if(result.error || result.status!==0) {
    throw new Error(`Mahjong native runtime is incompatible: ${result.error?.message ?? result.stderr.trim()}`);
  }
}
