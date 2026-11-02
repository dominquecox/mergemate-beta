import {describe,it,expect} from 'vitest';
import {testContext} from './helpers';
import {appFor,signIn} from './sign-in';
import {applyGitHubEvent} from '../src/lib/github-webhooks';

describe('access-scoped content-free activity audit',()=>{
 it('deduplicates deliveries, separates actor, filters access and persists per-user reads',async()=>{
  const ctx=testContext();const {headers,userId}=await signIn(ctx);const call=appFor(ctx);
  ctx.net.on('GET','https://api.github.com/user/installations',{installations:[{id:22,suspended_at:null}]}).on('GET','https://api.github.com/user/installations/22/repositories',{total_count:1,repositories:[{full_name:'acme/api'}]});
  const message={deliveryId:'audit-delivery',event:'pull_request_review',receivedAt:ctx.time.now().toISOString(),actor:'reviewer',data:{kind:'pr' as const,installationId:null,repo:'acme/api',numbers:[7],headSha:null,event:'review' as const}};
  await applyGitHubEvent(ctx.env.DB,message);await applyGitHubEvent(ctx.env.DB,message);
  await applyGitHubEvent(ctx.env.DB,{...message,deliveryId:'private-delivery',data:{...message.data,repo:'secret/other'}});
  const res=await call('/v1/activity/history',{headers});expect(res.status).toBe(200);
  const body=await res.json() as {items:{id:string;actor:string;read:boolean}[]};expect(body.items).toHaveLength(1);expect(body.items[0]).toMatchObject({actor:'reviewer',read:false});
  ctx.net.on('GET','https://api.github.com/repos/acme/api/pulls/7',{number:7});
  const firstItem = body.items[0];
  expect(firstItem).toBeDefined();
  if (!firstItem) throw new Error('missing item');
  const id = firstItem.id;
  expect((await call('/v1/activity/history/'+encodeURIComponent(id)+'/read',{method:'POST',headers})).status).toBe(204);
  expect(ctx.db.rows('SELECT user_id,event_id FROM activity_read')).toEqual([{user_id:userId,event_id:id}]);
  const reread=await (await call('/v1/activity/history',{headers})).json() as {items:{read:boolean}[]};expect(reread.items[0]?.read).toBe(true);
 });
});
