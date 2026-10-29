import {z} from 'zod';
import {Notification} from './github';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number(value.slice(0,4))>=1970&&Number(value.slice(0,4))<9999&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,'Use a valid UTC date');
export const PrSearchFilters=z.object({
 query:z.string().trim().max(120).regex(/^[\p{L}\p{N}\s._/#'@+-]*$/u).refine(value=>value.split(/\s+/).filter(Boolean).length<=8,'Use up to eight title terms').default(''),
 repo:z.string().regex(/^(?:[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)?$/).max(200).refine(value=>!value||!['.','..'].includes(value.split('/')[1]??'')).default(''),
 author:z.string().regex(/^[A-Za-z0-9_-]*$/).max(100).default(''),
 risk:z.enum(['all','high','medium','low','unassessed']).default('all'),
 from:day.optional(),to:day.optional(),
}).strict().refine(value=>!value.from||!value.to||value.from<=value.to,{message:'From must be before To',path:['from']});
export type PrSearchFilters=z.infer<typeof PrSearchFilters>;
export const PrSearchItem=Notification.omit({kind:true,read:true});
export type PrSearchItem=z.infer<typeof PrSearchItem>;
export const PrSearchPage=z.object({items:z.array(PrSearchItem),nextCursor:z.string().nullable(),candidates:z.number().int().min(0).max(20),incomplete:z.boolean(),capped:z.boolean()});
export type PrSearchPage=z.infer<typeof PrSearchPage>;
