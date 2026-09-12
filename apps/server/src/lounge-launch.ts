import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { PythonGameEngineAdapter } from './games/engine-adapter.js';
import { GameEconomyClient } from './games/game-economy-client.js';
import { GameReactionClient } from './games/game-reaction-client.js';
import { createLoungeRuntime, type LoungeRuntimeOptions } from './lounge-runtime.js';

const launchSchema=z.strictObject({
  pythonExecutable:z.string().min(1),repositoryRoot:z.string().min(1),
  chatWakeMessage:z.string().min(1),invitationMessage:z.string().min(1),
});
/** Only reviewed copy is loaded here. Absence keeps the existing read-only lounge. */
export function launchLounge(path:string|undefined, options:Pick<LoungeRuntimeOptions,'database'|'registrationAuth'|'bell'|'onError'> & {
  farm:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number};
  humanName(residentId:string):Promise<string>;
}) {
  if(!path)return null;
  const config=launchSchema.parse(JSON.parse(readFileSync(path,'utf8')));
  const names:Record<string,string>={mahjong:'麻将',doudizhu:'斗地主','leaf-game':'叶子戏',uno:'UNO',monopoly:'大富翁','flying-chess':'飞行棋'};
  const format=(template:string,values:Record<string,string>)=>template.replace(/\{(sender|game)\}/g,(_,key:string)=>values[key]??'');
  return createLoungeRuntime({
    database:options.database,registrationAuth:options.registrationAuth,bell:options.bell,onError:options.onError,
    engine:new PythonGameEngineAdapter(config),economy:new GameEconomyClient(options.farm),
    reactionCharge:new GameReactionClient(options.farm),chatWakeMessage:config.chatWakeMessage,
    invitationFormatter:input=>format(config.invitationMessage,{sender:input.fromDisplayName,game:names[input.kind]!}),
    turnFormatter:input=>input.message,
    nameOf:async playerId=>{
      const community=options.database.listActiveHumanCommunities().find(c=>playerId===`resident:${c.resident.residentId}`||playerId===`human:${c.account.accountId}`);
      if(!community)throw new Error('player_not_active');
      return playerId.startsWith('human:') ? options.humanName(community.resident.residentId) : community.resident.residentName;
    },
  });
}
