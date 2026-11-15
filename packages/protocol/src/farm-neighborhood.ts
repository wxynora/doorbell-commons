import { z } from 'zod';
import { farmDecorationLayoutSchema, farmDecorationsDataSchema } from './farm-decoration.js';
const doorplate=z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
const house=farmDecorationsDataSchema.shape.house.pick({level:true,classic_level:true,style:true});
export const neighborhoodHouseSchema=z.strictObject({doorplate,style:z.string(),level:z.number().int(),roof:z.string(),accessible:z.boolean()});
export const neighborhoodUpstreamSchema=z.strictObject({homes:z.array(neighborhoodHouseSchema)});
export const neighborhoodDirectorySchema=z.strictObject({homes:z.array(neighborhoodHouseSchema.extend({residentId:z.string(),name:z.string()}))});
export const neighborhoodLayoutSchema=z.strictObject({
 doorplate,house,layout:farmDecorationLayoutSchema,
 catalog:z.array(farmDecorationsDataSchema.shape.catalog.element.pick({item_id:true,model_id:true,name:true,cells:true,layer:true})),
 plots:z.array(z.strictObject({plot_id:z.number().int().positive(),state:z.enum(['empty','growing','ripe']),seed_type:z.enum(['common','fantasy','limited']).nullable()})),
 environment:z.strictObject({season:z.string().nullable(),weather:z.string().nullable(),night:z.number().min(0).max(1)}),
});
export type NeighborhoodHome=z.infer<typeof neighborhoodDirectorySchema>['homes'][number];
export type NeighborhoodLayout=z.infer<typeof neighborhoodLayoutSchema>;
