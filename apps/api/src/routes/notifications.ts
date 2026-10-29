import {InboxPreference,InboxMutation,type InboxReceipt} from "@mergemate/contracts";
import {base64url,sha256Hex} from "../lib/crypto";
import {
  type Notification,
  NotificationFilter,
  type NotificationKind,
  type NotificationPage,
  SnoozeRequest,
  IsoDateTime,
} from "@mergemate/contracts";
import { type Context, Hono } from "hono";
import { requireBinding } from "../config";
import type { AppEnv, Deps, Env } from "../env";
import { ApiError } from "../errors";
import { notificationId } from "../lib/notification-id";
export { notificationId } from "../lib/notification-id";
import { githubGet } from "../lib/github";
import { getAccessToken } from "../lib/github-tokens";
import { parseBody, parseValue } from "../lib/validate";
import { prStatus } from "./github";
import { DEMO_NOTIFICATIONS } from "./github.fixtures";

const PAGE_SIZE = 50;
const STATE_CHUNK = 90;
const MAX_SNOOZE_MS = 365 * 24 * 60 * 60 * 1000;

// Highest priority first: an item matching several queries keeps the first kind.
const QUERIES: { kind: NotificationKind; filter: NotificationFilter; q: string }[] = [
  { kind: "review", filter: "review", q: "is:pr is:open archived:false review-requested:@me" },
  { kind: "mention", filter: "mentions", q: "is:pr is:open archived:false mentions:@me" },
  { kind: "mine", filter: "mine", q: "is:pr is:open archived:false author:@me" },
];

interface SearchItem {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  user: { login: string } | null;
  updated_at: string;
  repository_url: string;
  pull_request?: { merged_at: string | null };
}

const ITEM_ID = /^[A-Za-z0-9_-]{8,400}$/;

const parseItemId = (id: string) => {
  if (!ITEM_ID.test(id) && !/^demo\.[A-Za-z0-9_.-]+$/.test(id)) {
    throw new ApiError("validation_failed", "The notification id is not valid.");
  }
  return id;
};

const userId = (c: Context<AppEnv>) => {
  const id = c.get("session").userId;
  if (!id) throw new ApiError("forbidden", "Not available in the demo.");
  return id;
};

/**
 * One page of the user's open inbox, built with the user's own GitHub token so GitHub enforces
 * their access, minus done and snoozed items and muted repositories. Shared by the inbox and the
 * triage queue so both apply the same source and rules.
 */
export const loadInbox = async (
  env: Env,
  deps: Deps,
  uid: string,
  filter: NotificationFilter,
  page: number,
  pageSize = PAGE_SIZE,
  search = "",
): Promise<NotificationPage> => {
  const now = deps.now();
  const token = await getAccessToken(env, uid, now);
  const queries = QUERIES.filter((q) => filter === "all" || q.filter === filter);
  const results = await Promise.all(
    queries.map((q) =>
      githubGet<{ total_count: number; items: SearchItem[] }>(
        deps,
        token,
        `/search/issues?q=${encodeURIComponent(q.q)}&sort=updated&order=desc&per_page=${pageSize}&page=${page}`,
      ),
    ),
  );

  const byId = new Map<string, Notification>();
  results.forEach((result, i) => {
    const kind = queries[i]?.kind;
    if (!kind) return;
    for (const item of result.items) {
      const repo = item.repository_url.split("/repos/")[1];
      if (!repo) continue;
      const id = notificationId(repo, item.number);
      const existing=byId.get(id);
      if(existing && Date.parse(existing.updatedAt)>=Date.parse(item.updated_at))continue;
      byId.set(id, {
        id,
        kind:existing?.kind??kind,
        repo,
        number: item.number,
        title: item.title,
        author: item.user?.login ?? "ghost",
        status: prStatus({ state: item.state, draft: item.draft ?? false, merged_at: item.pull_request?.merged_at ?? null }),
        updatedAt: item.updated_at,
        read: false,
      });
    }
  });

  const db = requireBinding(env, "DB");
  const ids = [...byId.keys()];
  const hidden = new Set<string>();
  // D1 allows 100 bound values per statement, so look the ids up in chunks.
  for (let i = 0; i < ids.length; i += STATE_CHUNK) {
    const chunk = ids.slice(i, i + STATE_CHUNK);
    const states = await db
      .prepare(
        `SELECT item_id, done_at, snoozed_until, operation_id FROM notification_state
         WHERE user_id = ? AND item_id IN (${chunk.map(() => "?").join(",")})`,
      )
      .bind(uid, ...chunk)
      .all<{ item_id: string; done_at: string | null; snoozed_until: string | null;operation_id:string|null }>();
    for (const s of states.results) {
      const item = byId.get(s.item_id);
      if(item)item.stateToken=s.operation_id;
      // Done stays done until the pull request changes again; snooze hides it until the time passes.
      if (item && s.done_at && Date.parse(item.updatedAt) <= Date.parse(s.done_at)) hidden.add(s.item_id);
      if (s.snoozed_until && Date.parse(s.snoozed_until) > now.getTime()) hidden.add(s.item_id);
    }
  }
  const unwatched = await db
    .prepare("SELECT full_name FROM repo_watch WHERE user_id = ? AND watching = 0")
    .bind(uid)
    .all<{ full_name: string }>();
  const muted = new Set(unwatched.results.map((r) => r.full_name.toLowerCase()));

  const items = [...byId.values()]
    .filter((n) => !hidden.has(n.id) && !muted.has(n.repo.toLowerCase()) && `${n.title} ${n.repo} ${n.author}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.id<b.id?-1:a.id>b.id?1:0));
  const more = page < Math.ceil(1000 / pageSize) && results.some((r) => r.total_count > page * pageSize);
  const wake=await db.prepare('SELECT MIN(snoozed_until) AS at FROM notification_state WHERE user_id=? AND snoozed_until>?').bind(uid,now.toISOString()).first<{at:string|null}>();
  return {items:items.map(item=>({...item,stateToken:item.stateToken??null})),nextCursor:more?await encodeCursor(uid,filter,pageSize,search,page+1):null,serverTime:now.toISOString(),refreshAt:wake?.at??null};
};

const scopeFor=async(uid:string,filter:string,limit:number,search:string)=>sha256Hex(JSON.stringify([uid,filter,limit,search]));
async function encodeCursor(uid:string,filter:string,limit:number,search:string,page:number){return base64url(new TextEncoder().encode(JSON.stringify({v:1,page,scope:await scopeFor(uid,filter,limit,search)})));}
async function decodeCursor(raw:string|undefined,uid:string,filter:string,limit:number,search:string){
 if(!raw)return 1;
 // Existing development clients may still send page numbers; fresh searches remain user-token scoped.
 if(/^\d{1,3}$/.test(raw))return Number(raw);
 try{if(raw.length>512)throw new Error();const value:unknown=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));if(!value||typeof value!=='object'||!('v'in value)||value.v!==1||!('page'in value)||typeof value.page!=='number'||!('scope'in value)||value.scope!==await scopeFor(uid,filter,limit,search))throw new Error();return value.page;}catch{throw new ApiError('validation_failed','The cursor is not valid for this inbox view.');}
}
type StateRow={operation_id:string|null;done_at:string|null;snoozed_until:string|null;updated_at:string};
const receipt=(row:StateRow):InboxReceipt=>{if(!row.operation_id)throw new ApiError('state_conflict','Refresh this inbox item.');return {operationId:row.operation_id,doneAt:row.done_at,snoozedUntil:row.snoozed_until,updatedAt:row.updated_at};};
async function checkItemAccess(c:Context<AppEnv>,uid:string,id:string){
 let reference:string;
 try{reference=atob(id.replace(/-/g,'+').replace(/_/g,'/'));}catch{throw new ApiError('validation_failed','Invalid inbox item.');}
 const match=/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9]\d*)$/.exec(reference);const owner=match?.[1],repo=match?.[2],number=match?.[3];
 if(!owner||!repo||!number||[owner,repo].some(part=>part==='.'||part==='..'))throw new ApiError('validation_failed','Invalid inbox item.');
 const token=await getAccessToken(c.env,uid,c.get('deps').now());
 await githubGet(c.get('deps'),token,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`);
}

async function requireLegacyState(c:Context<AppEnv>,id:string){
 const state=await requireBinding(c.env,'DB').prepare('SELECT operation_id FROM notification_state WHERE user_id=? AND item_id=?').bind(userId(c),id).first<{operation_id:string|null}>();
 if(state?.operation_id)throw new ApiError('state_conflict','Use the current app to update this item, then refresh your Inbox.');
}
export const notifications = new Hono<AppEnv>()
  .get("/notifications", async (c) => {
    const filter = parseValue(NotificationFilter, c.req.query("filter") ?? "all");
    const search = (c.req.query('search') ?? '').trim();
    if(search.length > 120 || [...search].some(char=>char.charCodeAt(0)<32))throw new ApiError('validation_failed','Search is too long or contains invalid characters.');
    const limit = Number(c.req.query('limit') ?? PAGE_SIZE);
    if(!Number.isInteger(limit) || limit<1 || limit>50)throw new ApiError('validation_failed','Limit must be between 1 and 50.');
    const uid=c.get("session").demo?"demo":userId(c);
    const page=await decodeCursor(c.req.query("cursor"),uid,filter,limit,search);
    if (!Number.isInteger(page) || page < 1 || page > Math.ceil(1000/limit)) {
      throw new ApiError("validation_failed", "The cursor is not valid.");
    }

    if (c.get("session").demo) {
      const all = DEMO_NOTIFICATIONS.filter(n => (filter === 'all' || n.kind === QUERIES.find(q=>q.filter===filter)?.kind) && `${n.title} ${n.repo} ${n.author}`.toLowerCase().includes(search.toLowerCase()));
      const offset=(page-1)*limit;
      return c.json({items:all.slice(offset,offset+limit),nextCursor:offset+limit<all.length?await encodeCursor("demo",filter,limit,search,page+1):null} satisfies NotificationPage);
    }

    return c.json(await loadInbox(c.env, c.get("deps"), userId(c), filter, page, limit, search));
  })

  .post("/notifications/:id/done", async (c) => {
    const id = parseItemId(c.req.param("id"));
    await requireLegacyState(c,id);
    const now = c.get("deps").now().toISOString();
    let observed=now;
    if(c.req.header('content-type')?.includes('application/json')){
      const body=await c.req.json().catch(()=>null) as {observedUpdatedAt?:unknown}|null;
      const parsed=IsoDateTime.safeParse(body?.observedUpdatedAt);
      if(!parsed.success || Date.parse(parsed.data)>Date.parse(now))throw new ApiError('validation_failed','Invalid notification update time.');
      observed=parsed.data;
    }
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO notification_state (user_id, item_id, done_at, snoozed_until, updated_at) VALUES (?, ?, ?, NULL, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET done_at = excluded.done_at, snoozed_until = NULL, updated_at = excluded.updated_at WHERE notification_state.operation_id IS NULL AND (notification_state.done_at IS NULL OR notification_state.done_at<=excluded.done_at) AND (notification_state.done_at IS NOT excluded.done_at OR notification_state.snoozed_until IS NOT NULL)`,
      )
      .bind(userId(c), id, observed, now)
      .run();
    return c.body(null, 204);
  })

  .post("/notifications/:id/snooze", async (c) => {
    const id = parseItemId(c.req.param("id"));
    await requireLegacyState(c,id);
    const { until } = await parseBody(c, SnoozeRequest);
    const now = c.get("deps").now();
    const untilMs = Date.parse(until);
    if (untilMs <= now.getTime() || untilMs - now.getTime() > MAX_SNOOZE_MS) {
      throw new ApiError("validation_failed", "Snooze time must be in the future and within a year.");
    }
    await requireBinding(c.env, "DB")
      .prepare(
        `INSERT INTO notification_state (user_id, item_id, done_at, snoozed_until, updated_at) VALUES (?, ?, NULL, ?, ?)
         ON CONFLICT (user_id, item_id) DO UPDATE SET snoozed_until = excluded.snoozed_until, done_at = NULL, updated_at = excluded.updated_at WHERE notification_state.operation_id IS NULL AND notification_state.snoozed_until IS NOT excluded.snoozed_until`,
      )
      .bind(userId(c), id, new Date(untilMs).toISOString(), now.toISOString())
      .run();
    return c.body(null, 204);
  })

  // Undo for done and snooze.
  .post("/notifications/:id/restore", async (c) => {
    const id = parseItemId(c.req.param("id"));
    await requireLegacyState(c,id);
    await requireBinding(c.env, "DB")
      .prepare("DELETE FROM notification_state WHERE user_id = ? AND item_id = ? AND operation_id IS NULL")
      .bind(userId(c), id)
      .run();
    return c.body(null, 204);
  });

notifications.get('/inbox/preference',async c=>{
 if(c.get('session').demo)return c.json({filter:'all'});
 const row=await requireBinding(c.env,'DB').prepare('SELECT filter FROM inbox_preferences WHERE user_id=?').bind(userId(c)).first<{filter:string}>();
 return c.json(InboxPreference.parse(row??{filter:'all'}));
});
notifications.put('/inbox/preference',async c=>{
 const uid=userId(c),body=await parseBody(c,InboxPreference);
 await requireBinding(c.env,'DB').prepare('INSERT INTO inbox_preferences(user_id,filter) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET filter=excluded.filter').bind(uid,body.filter).run();return c.json(body);
});
notifications.post('/notifications/:id/state',async c=>{
 const uid=userId(c),id=parseItemId(c.req.param('id')),input=await parseBody(c,InboxMutation),now=c.get('deps').now();
 if(Date.parse(input.observedUpdatedAt)>now.getTime())throw new ApiError('validation_failed','Invalid observed update time.');
 await checkItemAccess(c,uid,id);const db=requireBinding(c.env,'DB');
 const previous=await db.prepare('SELECT operation_id,done_at,snoozed_until,updated_at FROM notification_state WHERE user_id=? AND item_id=?').bind(uid,id).first<StateRow>();
 const done=input.action==='done'?new Date(input.observedUpdatedAt).toISOString():null;
 const snooze=input.action==='snooze'?new Date(now.getTime()+(input.durationMinutes??0)*60000).toISOString():null;
 if(previous?.operation_id===input.operationId){
  const same=input.action==='done'?previous.done_at!==null&&Date.parse(previous.done_at)>=Date.parse(done??'')&&previous.snoozed_until===null:input.action==='snooze'?previous.done_at===null&&previous.snoozed_until!==null:previous.done_at===null&&previous.snoozed_until===null;
  if(!same)throw new ApiError('validation_failed','Do not reuse an operation id for a different action.');
  return c.json(receipt(previous));
 }
 await db.prepare(`INSERT INTO notification_state(user_id,item_id,done_at,snoozed_until,updated_at,operation_id)
 SELECT ?1,?2,?3,?4,?5,?6 WHERE ?7 IS NULL
 ON CONFLICT(user_id,item_id) DO UPDATE SET done_at=CASE WHEN excluded.done_at IS NOT NULL AND notification_state.done_at>excluded.done_at THEN notification_state.done_at ELSE excluded.done_at END,snoozed_until=excluded.snoozed_until,updated_at=excluded.updated_at,operation_id=excluded.operation_id
 WHERE notification_state.operation_id IS ?7`).bind(uid,id,done,snooze,now.toISOString(),input.operationId,input.expectedOperationId).run();
 // The INSERT SELECT predicate must permit updates of an existing state as well.
 if(input.expectedOperationId!==null)await db.prepare(`UPDATE notification_state SET done_at=CASE WHEN ?3 IS NOT NULL AND done_at>?3 THEN done_at ELSE ?3 END,snoozed_until=?4,updated_at=?5,operation_id=?6 WHERE user_id=?1 AND item_id=?2 AND operation_id=?7`).bind(uid,id,done,snooze,now.toISOString(),input.operationId,input.expectedOperationId).run();
 const current=await db.prepare('SELECT operation_id,done_at,snoozed_until,updated_at FROM notification_state WHERE user_id=? AND item_id=?').bind(uid,id).first<StateRow>();
 if(!current||current.operation_id!==input.operationId)throw new ApiError('state_conflict','This item changed on another device. Refresh the inbox.');
 return c.json(receipt(current));
});

notifications.get('/inbox/undo',async c=>{
 if(c.get('session').demo)return c.json(null);
 const uid=userId(c),now=c.get('deps').now().toISOString();
 const row=await requireBinding(c.env,'DB').prepare('SELECT item_id,operation_id,done_at,snoozed_until,updated_at FROM notification_state WHERE user_id=? AND operation_id IS NOT NULL AND (done_at IS NOT NULL OR snoozed_until>?) ORDER BY updated_at DESC,item_id LIMIT 1').bind(uid,now).first<StateRow&{item_id:string}>();
 if(!row)return c.json(null);
 try{await checkItemAccess(c,uid,row.item_id);}catch(error){if(error instanceof ApiError&&(error.code==='not_found'||error.code==='forbidden'))return c.json(null);throw error;}
 return c.json({itemId:row.item_id,receipt:receipt(row)});
});
