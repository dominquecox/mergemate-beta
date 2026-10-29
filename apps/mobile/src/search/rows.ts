import type {PrSearchItem} from '@mergemate/contracts';
export function mergeSearchRows(rows:PrSearchItem[]){const byId=new Map<string,PrSearchItem>();for(const row of rows){const old=byId.get(row.id);if(!old||Date.parse(old.updatedAt)<=Date.parse(row.updatedAt))byId.set(row.id,row);}// Preserve first-seen page order: live/tied upstream pages can otherwise insert rows above the reading position.
return [...byId.values()];}
