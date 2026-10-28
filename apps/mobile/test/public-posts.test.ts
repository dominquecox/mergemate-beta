import { expect, it } from "vitest";
import { makeClient, jsonResponse, errorResponse } from "./helpers";
import { mapPostSummary } from "../src/api/mappers";
const summary={slug:"release-one",type:"news" as const,title:"Published title",excerpt:"Only a preview",publishedAt:"2026-10-28T12:00:00Z"};
it("fetches full body publicly and maps UTF/escaped newlines without private fields",async()=>{
  const {client,calls}=makeClient(()=>jsonResponse({...summary,body:"Full body\\nSecond line — 日本語",draft_note:"private",actor_email:"private"}),{platform:"native",token:"private-session-token"});
  const post=await client.getPublicPost(summary.slug);
  expect(post.content).toBe("Full body\nSecond line — 日本語");expect(post.summary).toBe(summary.excerpt);
  expect(calls[0]?.path).toBe("/public/posts/release-one");expect(calls[0]?.headers.authorization).toBeUndefined();
  expect(calls[0]?.credentials).toBe("omit");expect(JSON.stringify(post)).not.toContain("draft_note");
});
it("paginates/deduplicates summaries and rejects repeated or malformed cursors",async()=>{
  const {client,calls}=makeClient(req=>jsonResponse({items:[summary,{...summary,title:"Stale copy"}],nextCursor:req.path.includes('cursor=')?null:'50'}));
  const page=await client.getPublicPostPage('news');expect(page.items).toHaveLength(1);expect(page.items[0].title).toBe(summary.title);
  expect((await client.getPublicPostPage('news','50')).nextCursor).toBeNull();expect(calls[1]?.path).toContain('cursor=50');
  await expect(client.getPublicPostPage('news','bad')).rejects.toMatchObject({code:'validation_failed'});
  const repeated=makeClient(()=>jsonResponse({items:[summary],nextCursor:'50'})).client;
  await expect(repeated.getPublicPostPage('news','50')).rejects.toMatchObject({code:'parse_failed'});
});
it("keeps empty published body empty and rejects unknown/mismatched detail instead of fabricating it",async()=>{
  expect(mapPostSummary({...summary,body:''}).content).toBe('');
  const {client,calls}=makeClient(()=>jsonResponse({...summary,slug:'different',body:'Other article'}));
  await expect(client.getPublicPost(summary.slug)).rejects.toMatchObject({code:'parse_failed'});
  const before=calls.length;await expect(client.getPublicPost('../private')).rejects.toMatchObject({code:'not_found'});expect(calls).toHaveLength(before);
  const missing=makeClient(()=>errorResponse('not_found',404)).client;
  await expect(missing.getPublicPost(summary.slug)).rejects.toMatchObject({code:'not_found'});
});
