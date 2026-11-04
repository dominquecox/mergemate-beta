import {Hono,type Context} from "hono";
import {NoteContext,SavePrivateNote,noteContextKey,type PrivateNote} from "@mergemate/contracts";
import {requireBinding} from "../config";
import {ApiError} from "../errors";
import type {AppEnv} from "../env";
import {parseBody,parseValue} from "../lib/validate";
import {getAccessToken} from "../lib/github-tokens";
import {githubGet} from "../lib/github";
import {cardIn,ownedProject} from "../brain/store";

async function access(c:Context<AppEnv>,context:NoteContext){
 const session=c.get("session");
 if(session.demo || !session.userId)throw new ApiError("forbidden","Private notes are unavailable in demo mode.");
 if(context.kind==="pr"){
  const token=await getAccessToken(c.env,session.userId,c.get("deps").now());
  const [owner="",repo=""]=context.repo.split("/");
  await githubGet(c.get("deps"),token,`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${context.number}`);
 }
 if(context.kind==="card"){
  // Throws not-found unless the board belongs to this user and the card is on it.
  const project=await ownedProject(c.env,session.userId,context.projectId);
  await cardIn(c.env,project.id,context.cardId);
 }
 return session.userId;
}
type Row={id:string;context_json:string;text:string;created_at:string};
const present=(row:Row):PrivateNote=>({id:row.id,context:NoteContext.parse(JSON.parse(row.context_json)),text:row.text,createdAt:row.created_at});
const queryContext=(c:Context<AppEnv>)=>{
 const raw=c.req.query("context")??"";
 if(raw.length>400)throw new ApiError("validation_failed","Invalid note context.");
 try{return parseValue(NoteContext,JSON.parse(raw));}catch{throw new ApiError("validation_failed","Invalid note context.");}
};
export const notes=new Hono<AppEnv>();
notes.use(async(c,next)=>{c.header("Cache-Control","no-store");await next();});
notes.get("/notes",async c=>{
 const context=queryContext(c);const userId=await access(c,context);
 const rows=await requireBinding(c.env,"DB").prepare("SELECT id,context_json,text,created_at FROM private_notes WHERE user_id=? AND context_key=? ORDER BY created_at,id LIMIT 100").bind(userId,noteContextKey(context)).all<Row>();
 return c.json({items:rows.results.map(present)});
});
notes.post("/notes",async c=>{
 const input=await parseBody(c,SavePrivateNote);const userId=await access(c,input.context);const db=requireBinding(c.env,"DB");
 const key=noteContextKey(input.context),now=c.get("deps").now().toISOString();
 await db.prepare(`INSERT OR IGNORE INTO private_notes(user_id,id,context_key,context_json,text,created_at)
 SELECT ?1,?2,?3,?4,?5,?6 WHERE (SELECT COUNT(*) FROM private_notes WHERE user_id=?1 AND context_key=?3)<100`).bind(userId,input.id,key,JSON.stringify(input.context),input.text,now).run();
 const row=await db.prepare("SELECT id,context_json,text,created_at FROM private_notes WHERE user_id=? AND id=?").bind(userId,input.id).first<Row>();
 if(!row)throw new ApiError("validation_failed","This workspace has 100 notes. Remove a note before saving another.");
 if(row.text!==input.text || noteContextKey(NoteContext.parse(JSON.parse(row.context_json)))!==key)throw new ApiError("validation_failed","That note was already saved with different content.");
 return c.json(present(row));
});
notes.delete("/notes/:id",async c=>{
 const context=queryContext(c);const userId=await access(c,context);
 await requireBinding(c.env,"DB").prepare("DELETE FROM private_notes WHERE user_id=? AND id=? AND context_key=?").bind(userId,c.req.param("id"),noteContextKey(context)).run();
 return c.body(null,204);
});
