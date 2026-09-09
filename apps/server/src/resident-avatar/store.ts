import type Database from 'better-sqlite3';
import { residentAvatarManifestSchema, type ResidentAvatarManifest } from '@doorbell/protocol';
export class AvatarRevisionConflict extends Error { constructor(){super('avatar_revision_conflict');} }
export class ResidentAvatarStore {
 constructor(private readonly database:Database.Database){}
 read(residentId:string){
  const row=this.database.prepare('SELECT revision, manifest_json FROM resident_avatars WHERE resident_id = ?').get(residentId) as {revision:number;manifest_json:string}|undefined;
  return {resident_id:residentId,revision:row?.revision??0,manifest:row?residentAvatarManifestSchema.parse(JSON.parse(row.manifest_json)):null};
 }
 save(residentId:string,expectedRevision:number,manifest:ResidentAvatarManifest){
  const json=JSON.stringify(residentAvatarManifestSchema.parse(manifest));
  return this.database.transaction(()=>{
   if(this.read(residentId).revision!==expectedRevision)throw new AvatarRevisionConflict();
   this.database.prepare('INSERT INTO resident_avatars (resident_id, revision, manifest_json) VALUES (?, ?, ?) ON CONFLICT(resident_id) DO UPDATE SET revision=excluded.revision, manifest_json=excluded.manifest_json').run(residentId,expectedRevision+1,json);
   return this.read(residentId);
  }).immediate();
 }
}
