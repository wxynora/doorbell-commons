import {z} from "zod";
const name=z.string().min(1);
export const patrolNoticeSchema=z.discriminatedUnion("kind",[
  z.strictObject({notice_id:name,kind:z.literal("patrol_result"),created_at:z.number().int().nonnegative(),
    facts:z.discriminatedUnion("disposition",[
      z.strictObject({actor_resident_id:z.uuid(),disposition:z.literal("fine"),amount_gold:z.number().int().positive()}),
      z.strictObject({actor_resident_id:z.uuid(),disposition:z.literal("detention"),duration_hours:z.union([z.literal(4),z.literal(12),z.literal(48),z.literal(72)])}),
    ])}),
  z.strictObject({notice_id:name,kind:z.literal("patrol_day"),created_at:z.number().int().nonnegative(),
    facts:z.strictObject({beijing_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)})}),
  z.strictObject({notice_id:name,kind:z.literal("patrol_theft"),created_at:z.number().int().nonnegative(),
    facts:z.strictObject({occurred_at:z.number().int().nonnegative(),thief_name:name,victim_name:name,crop_name:name})}),
]);
export const patrolPendingSchema=z.strictObject({resident_id:z.uuid(),notices:z.array(patrolNoticeSchema)});
export type PatrolNotice=z.infer<typeof patrolNoticeSchema>;
export interface PatrolClient {
  pending(residentId:string):Promise<PatrolNotice[]>;
  acknowledge(residentId:string,noticeIds:string[]):Promise<void>;
}
