import { MetaKeyInput } from '@mergemate/contracts';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { requireBinding, webOrigin } from '../config';
import { metaKeyStatus, saveMetaKey, verifyMetaKey } from '../lib/user-meta-key';
import { createTokenCipher } from '../lib/crypto';
import { parseBody } from '../lib/validate';
import { createDbUsageStore } from './ai-engine';

/** Key checks per user per day. Failed checks count too, so the endpoint cannot be used to test many keys. */
export const META_KEY_CHECKS_PER_DAY = 10;

function webUser(c: Context<AppEnv>) {
  const session=c.get('session');
  if(session.demo || !session.userId || session.transport!=='cookie')throw new ApiError('forbidden','Manage your Meta key in web Settings.');
  if(c.req.header('origin')!==webOrigin(c.env))throw new ApiError('forbidden','Use web Settings to manage your Meta key.');
  return session.userId;
}
export const metaKey=new Hono<AppEnv>()
  .get('/settings/meta-key',async c=>{
    const session=c.get('session');
    if(session.demo)return c.json({configured:false});
    if(!session.userId)throw new ApiError('unauthorized','Sign in to continue.');
    return c.json(await metaKeyStatus(c.env,session.userId));
  })
  .put('/settings/meta-key',async c=>{
    const userId=webUser(c);
    const {key}=await parseBody(c,MetaKeyInput);
    // Validate encryption configuration before making even the small verification call.
    // Actual storage happens only after the key is accepted; rejected replacements keep the old value.
    await createTokenCipher(c.env);
    const check=await createDbUsageStore(requireBinding(c.env,'DB')).reserve(`${userId}:metakey`,META_KEY_CHECKS_PER_DAY);
    if(!check)throw new ApiError('rate_limited','Too many key checks today. Try again tomorrow.');
    await verifyMetaKey(c.env,c.get('deps'),key);
    await saveMetaKey(c.env,userId,key,c.get('deps').now());
    return c.json({configured:true});
  })
  .delete('/settings/meta-key',async c=>{
    const userId=webUser(c);
    await requireBinding(c.env,'DB').prepare('DELETE FROM user_meta_keys WHERE user_id=?').bind(userId).run();
    return c.body(null,204);
  });
