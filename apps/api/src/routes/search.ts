import {getSettings} from '../lib/settings';
import {requireConsent,createDbConsentStore} from './consent';
import {Hono} from 'hono';
import {PrSearchFilters,PrSearchPage,PrRisk,type PrSearchItem} from '@mergemate/contracts';
import type {AppEnv} from '../env';
import {ApiError} from '../errors';
import {parseValue} from '../lib/validate';
import {base64url,sha256Hex} from '../lib/crypto';
import {getAccessToken} from '../lib/github-tokens';
import {githubGet} from '../lib/github';
import {requireBinding} from '../config';
import {notificationId} from '../lib/notification-id';
import {prStatus} from './github';
import {DEMO_NOTIFICATIONS} from './github.fixtures';
const SIZE=20,MAX_PAGE=50;
type Hit={number:number;title:string;state:string;draft?:boolean;user:{login:string}|null;updated_at:string;repository_url:string;pull_request?:{merged_at:string|null}};
export function githubSearchQuery(filters:PrSearchFilters){
 const terms=['is:pr','is:open','archived:false',...filters.query.split(/\s+/).filter(Boolean).map(term=>`"${term}"`)];
 if(filters.query)terms.push('in:title');
 if(filters.repo)terms.push(`repo:${filters.repo}`);
 if(filters.author)terms.push(`author:${filters.author}`);
 if(filters.from)terms.push(`updated:>=${filters.from}T00:00:00Z`);
 if(filters.to){const end=new Date(filters.to+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);terms.push(`updated:<${end.toISOString().replace('.000Z','Z')}`);}
 return terms.join(' ');
}
export const searchPrs=new Hono<AppEnv>().get('/search/prs',async c=>{
 const query=c.req.query();const {cursor,...raw}=query;const filters=parseValue(PrSearchFilters,raw);
 const session=c.get('session'),uid=session.demo?'demo':session.userId;if(!uid)throw new ApiError('unauthorized','Sign in to search.');
 const scope=await sha256Hex(JSON.stringify([uid,filters]));let page=1;
 if(cursor){try{if(cursor.length>512)throw new Error();const decoded:unknown=JSON.parse(atob(cursor.replace(/-/g,'+').replace(/_/g,'/')));if(!decoded||typeof decoded!=='object'||!('scope'in decoded)||decoded.scope!==scope||!('page'in decoded)||typeof decoded.page!=='number'||!Number.isInteger(decoded.page)||decoded.page<1||decoded.page>MAX_PAGE)throw new Error();page=decoded.page;}catch{throw new ApiError('validation_failed','The cursor does not match this search.');}}
 if(session.demo){
  const filtered=DEMO_NOTIFICATIONS.filter(row=>filters.query.split(/\s+/).every(term=>row.title.toLowerCase().includes(term.toLowerCase()))&&(!filters.repo||row.repo.toLowerCase()===filters.repo.toLowerCase())&&(!filters.author||row.author.toLowerCase()===filters.author.toLowerCase())&&(!filters.from||row.updatedAt>=filters.from)&&(!filters.to||row.updatedAt.slice(0,10)<=filters.to)&&(filters.risk==='all'||(filters.risk==='unassessed'?!row.risk:row.risk===filters.risk)));
  return c.json(PrSearchPage.parse({items:filtered.slice(0,SIZE),nextCursor:null,candidates:Math.min(filtered.length,SIZE),incomplete:false,capped:false}));
 }
 if(filters.risk!=='all'){if(!(await getSettings(c.env,uid)).aiSummaries)throw new ApiError('forbidden','Saved risk is disabled in Settings.');await requireConsent(createDbConsentStore(requireBinding(c.env,'DB')),uid);}
 if(githubSearchQuery(filters).length>256)throw new ApiError('validation_failed','Shorten your title, repository or author filters.');
 const baseDeps=c.get('deps'),deadline=AbortSignal.timeout(20_000);
 const deps={...baseDeps,fetch:(input:RequestInfo|URL,init?:RequestInit)=>baseDeps.fetch(input,{...init,signal:AbortSignal.any([deadline,c.req.raw.signal,...(init?.signal?[init.signal]:[])])})};
 const token=await getAccessToken(c.env,uid,deps.now());
 // One search page; never scan unbounded upstream pages to fill a filtered page.
 const result=await githubGet<{total_count:number;incomplete_results?:boolean;items:Hit[]}>(deps,token,`/search/issues?q=${encodeURIComponent(githubSearchQuery(filters))}&sort=updated&order=desc&per_page=${SIZE}&page=${page}`);
 const items:PrSearchItem[]=[];
 // At most20 current-head/access reads for a saved-risk filter, with only4 in flight.
 const hits=result.items.slice(0,SIZE);for(let start=0;start<hits.length;start+=4){
  const batch=await Promise.all(hits.slice(start,start+4).map(async hit=>{
   const reference=hit.repository_url.split('/repos/')[1];if(!reference||!/^[-A-Za-z0-9_]+\/[-A-Za-z0-9_.]+$/.test(reference)||!Number.isSafeInteger(hit.number)||hit.number<1)return null;
   const [owner,repo]=reference.split('/');if(repo==='.'||repo==='..')return null;
   // Defense in depth: structured filters also hold if upstream returns an unexpected row.
   if((filters.repo&&reference.toLowerCase()!==filters.repo.toLowerCase())||(filters.author&&hit.user?.login.toLowerCase()!==filters.author.toLowerCase())||(filters.from&&hit.updated_at<filters.from)||(filters.to&&hit.updated_at.slice(0,10)>filters.to))return null;
   const row:PrSearchItem={id:notificationId(reference,hit.number),repo:reference,number:hit.number,title:hit.title,author:hit.user?.login??'ghost',status:prStatus({state:hit.state,draft:hit.draft??false,merged_at:hit.pull_request?.merged_at??null}),updatedAt:hit.updated_at};
   if(filters.risk!=='all'){
    let head:{head:{sha:string}};try{head=await githubGet(deps,token,`/repos/${encodeURIComponent(owner??'')}/${encodeURIComponent(repo??'')}/pulls/${hit.number}`);}catch(error){if(error instanceof ApiError&&(error.code==='not_found'||error.code==='forbidden'))return null;throw error;}
    if(!/^[a-f0-9]{7,64}$/i.test(head.head?.sha??''))throw new ApiError('upstream_unavailable','GitHub returned an invalid PR revision.');
    const cached=await requireBinding(c.env,'DB').prepare('SELECT body FROM ai_results_cache WHERE user_id=? AND key=?').bind(uid,`${uid}:risk:${reference}#${hit.number}@${head.head.sha}`).first<{body:string}>();
    let risk:PrSearchItem['risk'];try{const parsed=PrRisk.safeParse(cached?JSON.parse(cached.body):null);if(parsed.success)risk=parsed.data.level;}catch{/* Invalid cache is unassessed; never infer a safe level. */}
    if(filters.risk==='unassessed'?risk!==undefined:risk!==filters.risk)return null;row.risk=risk;
   }
   return row;
  }));for(const row of batch)if(row)items.push(row);
 }
 const unique=new Map<string,PrSearchItem>();for(const row of items){const old=unique.get(row.id);if(!old||Date.parse(row.updatedAt)>Date.parse(old.updatedAt))unique.set(row.id,row);}
 const more=page<MAX_PAGE&&result.total_count>page*SIZE;
 return c.json(PrSearchPage.parse({items:[...unique.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||(a.id<b.id?-1:a.id>b.id?1:0)),nextCursor:more?base64url(new TextEncoder().encode(JSON.stringify({page:page+1,scope}))):null,candidates:hits.length,incomplete:result.incomplete_results===true,capped:result.total_count>SIZE*MAX_PAGE}));
});
