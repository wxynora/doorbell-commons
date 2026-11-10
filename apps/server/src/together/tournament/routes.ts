import type { FastifyInstance } from "fastify";
import { OneBotUnavailableError } from "../../qq-group-membership.js";
import { AuthenticationRequiredError, QqNotGroupMemberError, RegistrationProfileRequiredError, type RegistrationAuthService } from "../../registration-auth.js";
import { readHumanSessionToken, serializeClearedHumanSessionCookie } from "../../session-cookie.js";
import type { SnowTournamentService } from "./service.js";
import type { SnowReplicaBattle, SnowTournamentResponse } from "@doorbell/protocol";
import {BattleStreamEncoder,editionStreamFrame,SharedSnowStreams} from "./stream-wire.js";
import type {SnowDanmakuUpdate} from "./spectators.js";
import type { ServerResponse } from "node:http";
import { snowDanmakuInputSchema } from "@doorbell/protocol";
import { z } from "zod";

type MatchRef = { editionId: string; matchId: string };
export type SnowTournamentBattleRead = {
  read(ref: MatchRef): SnowReplicaBattle | null;
  subscribe(ref: MatchRef, listener: (read: () => SnowReplicaBattle | null) => void): () => void;
};

export function registerSnowTournamentRoutes(app: FastifyInstance, options: {
  registrationAuth: Pick<RegistrationAuthService, "getCurrentSession">;
  service: Pick<SnowTournamentService, "readPublic"> & Partial<Pick<SnowTournamentService,"subscribe"|"spectators"|"hasMatch">>;
  secureCookies: boolean;
  battleRead?: SnowTournamentBattleRead;
  keepalive?: (response: ServerResponse) => void;
}) {
  app.get("/api/snow-tournament", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const error = (status: number, code: string) => reply.code(status).send({ error: { code } });
    const query = request.query as Record<string, unknown>;
    if (Object.keys(query).some(key => key !== "editionId") ||
        (query.editionId !== undefined && (typeof query.editionId !== "string" || !query.editionId)))
      return error(400, "invalid_request");
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return error(401, "authentication_required");
    try {
      await options.registrationAuth.getCurrentSession(token);
      return options.service.readPublic(query.editionId as string | undefined);
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError) return error(401, "authentication_required");
      if (cause instanceof QqNotGroupMemberError) {
        reply.header("set-cookie", serializeClearedHumanSessionCookie(options.secureCookies));
        return error(403, "qq_not_group_member");
      }
      if (cause instanceof RegistrationProfileRequiredError) return error(409, "registration_profile_required");
      if (cause instanceof OneBotUnavailableError) return error(503, "onebot_unavailable");
      request.log.error({ error_name: "SnowTournamentReadError" }, "Snow tournament read failed");
      return error(503, "service_unavailable");
    }
  });
  const connections = new Set<() => void>();
  app.addHook("preClose", async () => { for (const close of connections) close(); });
  // One pending notification per connection, without a queue of old frames.
  const stream=(raw:ServerResponse,token:string,subscribe:(listener:()=>void)=>()=>void,read:()=>string|null,eventId?:()=>number)=>{
    raw.writeHead(200,{"content-type":"text/event-stream; charset=utf-8","cache-control":"no-store",connection:"keep-alive","x-accel-buffering":"no"});
    options.keepalive?.(raw);
    let closed=false,sending=false,pending=false,admitted=true;
    let unsubscribe:(()=>void)|undefined;
    const close=()=>{if(closed)return;closed=true;unsubscribe?.();connections.delete(close);if(!raw.writableEnded)raw.end();};
    const send=async()=>{
      if(closed)return;pending=true;if(sending||raw.writableNeedDrain)return;sending=true;
      try {while(pending&&!closed&&!raw.writableNeedDrain){
        pending=false;
        const data=read();if(data===null)continue;
        if(!admitted)await options.registrationAuth.getCurrentSession(token);
        admitted=false;
        if(!closed)raw.write(`${eventId?`id: ${eventId()}\n`:""}event: update\ndata: ${data}\n\n`);
      }}catch{close();}finally{sending=false;}
    };
    connections.add(close);raw.once("close",close);raw.on("drain",()=>{if(pending)void send();});
    try {unsubscribe=subscribe(()=>{void send();});void send();}catch{close();}
  };
  const sharedStream=(raw:ServerResponse,token:string,connect:(listener:()=>void)=>{
    read(after:number):{revision:number;text:string}|null;close():void;
  })=>{
    let revision=0,connection:ReturnType<typeof connect>;
    stream(raw,token,listener=>{connection=connect(listener);return connection.close;},()=>{
      const packet=connection.read(revision);
      if(!packet)return null;
      revision=packet.revision;return packet.text;
    });
  };
  const subscribeEdition=options.service.subscribe?.bind(options.service);
  const editions=subscribeEdition?new SharedSnowStreams<string|undefined,SnowTournamentResponse>(id=>id??"",id=>{
    const read=()=>options.service.readPublic(id);
    let previous:ReturnType<typeof read>|null=null,revision=0;
    return {initial:read,subscribe:changed=>subscribeEdition(()=>changed(read)),
      encode(next){const frame=editionStreamFrame(previous,next,revision);if(frame){previous=next;revision=frame.revision;}return frame;},
      snapshot:(data,revision)=>({kind:"snapshot",revision,data})};
  }):null;
  if(editions)app.get("/api/snow-tournament/stream",{exposeHeadRoute:false},async(request,reply)=>{
    const query=request.query as Record<string,unknown>;
    if(Object.keys(query).some(key=>key!=="editionId")||(query.editionId!==undefined&&(typeof query.editionId!=="string"||!query.editionId)))
      return reply.code(400).send({error:{code:"invalid_request"}});
    const token=readHumanSessionToken(request.headers.cookie);if(!token)return reply.code(401).send({error:{code:"authentication_required"}});
    try {await options.registrationAuth.getCurrentSession(token);}catch(error){
      const status=error instanceof AuthenticationRequiredError?401:error instanceof QqNotGroupMemberError?403:503;
      return reply.code(status).send({error:{code:status===503?"service_unavailable":"authentication_required"}});
    }
    if(reply.raw.destroyed)return reply;
    reply.hijack();
    sharedStream(reply.raw,token,listener=>editions.connect(query.editionId as string|undefined,listener));return reply;
  });
  const live = options.battleRead;
  const spectators = options.service.spectators;
  if (spectators) {
    const root = "/api/snow-tournament/:editionId/matches/:matchId/danmaku";
    const cursor = z.object({after:z.coerce.number().int().nonnegative().optional()}).strict();
    const reject = (reply: import("fastify").FastifyReply, cause: unknown) => {
      const code = cause instanceof AuthenticationRequiredError ? "authentication_required"
        : cause instanceof QqNotGroupMemberError ? "qq_not_group_member"
        : cause instanceof RegistrationProfileRequiredError ? "registration_profile_required"
        : cause instanceof z.ZodError ? "invalid_request"
        : cause instanceof Error && ["match_not_found","message_conflict","activity_unavailable","origin_mismatch"].includes(cause.message) ? cause.message : "service_unavailable";
      const status = code==="authentication_required"?401:code==="qq_not_group_member"||code==="origin_mismatch"?403:
        code==="match_not_found"?404:code==="invalid_request"?400:code==="service_unavailable"?503:409;
      if(code==="qq_not_group_member")reply.header("set-cookie",serializeClearedHumanSessionCookie(options.secureCookies));
      return reply.code(status).send({error:{code}});
    };
    const authenticate = async (cookie: string | undefined) => {
      const token=readHumanSessionToken(cookie);if(!token)throw new AuthenticationRequiredError();
      return {token,community:await options.registrationAuth.getCurrentSession(token)};
    };
    app.get<{Params:MatchRef}>(root,async(request,reply)=>{
      reply.header("cache-control","no-store");
      try {const query=cursor.parse(request.query);await authenticate(request.headers.cookie);
        return {messages:spectators.read(request.params,query.after)};
      }catch(cause){return reject(reply,cause);}
    });
    app.post<{Params:MatchRef}>(root,async(request,reply)=>{
      reply.header("cache-control","no-store");
      try {
        z.object({}).strict().parse(request.query);
        const input=snowDanmakuInputSchema.parse(request.body);
        if(request.headers.origin){let host:string;try{host=new URL(request.headers.origin).host;}catch{throw Error("origin_mismatch");}
          if(host!==request.headers.host)throw Error("origin_mismatch");}
        const {community}=await authenticate(request.headers.cookie);
        return spectators.send(request.params,{accountId:community.account.accountId,residentName:community.resident.residentName},input);
      }catch(cause){return reject(reply,cause);}
    });
    app.get<{Params:MatchRef}>(`${root}/stream`,{exposeHeadRoute:false},async(request,reply)=>{
      try {
        const query=cursor.parse(request.query),{token}=await authenticate(request.headers.cookie);
        let after=request.headers["last-event-id"]===undefined?query.after??0:z.coerce.number().int().nonnegative().parse(request.headers["last-event-id"]);
        const initial=spectators.read(request.params,after);let first=true;
        let next:SnowDanmakuUpdate|undefined,catchUp=false;
        if(reply.raw.destroyed)return reply;
        reply.hijack();
        stream(reply.raw,token,listener=>spectators.subscribe(request.params,update=>{
          if(update.sequence<=after)return;
          catchUp ||= next!==undefined;
          next=update;
          listener();
        }),()=>{
          if(first){
            first=false;
            after=initial.at(-1)?.sequence??after;
            return JSON.stringify({messages:initial});
          }
          if(!next)return null;
          const update=next,needsCatchUp=catchUp;next=undefined;catchUp=false;
          if(!needsCatchUp){after=update.sequence;return update.text;}
          // Only a connection that missed intermediate packets reads history.
          const messages=spectators.read(request.params,after);
          if(!messages.length)return null;
          after=messages.at(-1)!.sequence;
          return JSON.stringify({messages});
        },()=>after);return reply;
      }catch(cause){return reject(reply,cause);}
    });
  }
  if (!live) return;
  const battles=new SharedSnowStreams<MatchRef,SnowReplicaBattle|null>(ref=>JSON.stringify([ref.editionId,ref.matchId]),ref=>{
    const encoder=new BattleStreamEncoder();
    return {initial:()=>live.read(ref),subscribe:changed=>live.subscribe(ref,changed),encode:next=>encoder.read(next),
      snapshot:(battle,revision)=>({kind:"snapshot",revision,battle})};
  });
  app.get<{Params: MatchRef}>("/api/snow-tournament/:editionId/matches/:matchId/stream", { exposeHeadRoute: false }, async (request, reply) => {
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return reply.code(401).send({ error:{code:"authentication_required"} });
    try {
      await options.registrationAuth.getCurrentSession(token);
      const {editionId,matchId}=request.params;
      const exists=options.service.hasMatch?.(editionId,matchId)??options.service.readPublic(editionId).edition?.matches.some(m=>m.id===matchId);
      if (!exists) {
        return reply.code(404).send({ error:{code:"match_not_found"} });
      }
    } catch (error) {
      const status = error instanceof AuthenticationRequiredError ? 401 : error instanceof QqNotGroupMemberError ? 403 : 503;
      return reply.code(status).send({ error:{code:status === 503 ? "service_unavailable" : "authentication_required"} });
    }
    if (reply.raw.destroyed) return reply;
    reply.hijack();
    sharedStream(reply.raw,token,listener=>battles.connect(request.params,listener));
    return reply;
  });
}
