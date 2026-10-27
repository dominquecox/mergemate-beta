import { requireBinding } from '../config';
import type { Deps, Env } from '../env';
import { ApiError } from '../errors';
import { createTokenCipher } from './crypto';
import { resolveModelConfig } from '../ai/provider';
import { resolveRoute, type AiTask } from '../ai/routes';

const context = (userId: string) => `meta:${userId}:key`;
export async function metaKeyStatus(env: Env, userId: string) {
  return { configured: !!(await requireBinding(env,'DB').prepare('SELECT 1 FROM user_meta_keys WHERE user_id=?').bind(userId).first()) };
}
export async function saveMetaKey(env: Env, userId: string, key: string, at: Date) {
  const cipher=await createTokenCipher(env);
  const sealed=await cipher.encrypt(key,context(userId));
  await requireBinding(env,'DB').prepare(`INSERT INTO user_meta_keys(user_id,key_version,ciphertext,verified_at) VALUES(?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET key_version=excluded.key_version,ciphertext=excluded.ciphertext,verified_at=excluded.verified_at`)
    .bind(userId,cipher.version,sealed,at.toISOString()).run();
}

/** One small, fixed prompt, one request, no retries and no repository data. */
export async function verifyMetaKey(env: Env,deps: Deps,key: string) {
  const config=resolveModelConfig({...env,MODEL_ROUTE_SUMMARY:'meta:muse-spark-1.2'},'summary');
  if(config.provider!=='meta')throw new Error('Invalid verification route');
  let response: Response;
  try {
    response=await deps.fetch(`${config.baseUrl}/responses`,{
      method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','cf-aig-collect-log':'false','cf-aig-skip-cache':'true','cf-aig-max-attempts':'1','cf-aig-no-wholesale':'true'},
      body:JSON.stringify({model:config.modelId,input:'Reply OK.',max_output_tokens:16,reasoning:{effort:'low'},store:false}),
      signal:AbortSignal.timeout(20_000),redirect:'error',
    });
  } catch { throw new ApiError('upstream_unavailable','The Meta key could not be checked. Try again.'); }
  if(!response.ok){
    await response.body?.cancel();
    if(response.status===401 || response.status===403)throw new ApiError('validation_failed','Meta rejected this key. Check the key and its access.');
    throw new ApiError('upstream_unavailable','The Meta key could not be checked. Try again.');
  }
  // A token-limited response may have no visible text. A valid Responses envelope
  // confirms authentication without requiring more billable output.
  const body=await response.json().catch(()=>null) as {object?:unknown}|null;
  if(body?.object!=='response')throw new ApiError('upstream_unavailable','The Meta key could not be checked. Try again.');
}

/** Request-local credential context. Never mutates Worker bindings or falls back on a broken saved key. */
export async function userModelContext(env: Env,userId: string,task: AiTask): Promise<{env:Env;ownsMetaKey:boolean}> {
  const row=await requireBinding(env,'DB').prepare('SELECT key_version,ciphertext FROM user_meta_keys WHERE user_id=?')
    .bind(userId).first<{key_version:string;ciphertext:string}>();
  if(!row || resolveRoute(env,task).provider!=='meta')return {env,ownsMetaKey:false};
  try {
    const cipher=await createTokenCipher(env);
    const key=await cipher.decrypt(row.key_version,row.ciphertext,context(userId));
    return {env:{...env,MODEL_API_KEY:key},ownsMetaKey:true};
  } catch { throw new ApiError('upstream_unavailable','Your saved Meta key is unavailable. Replace or remove it in web Settings.'); }
}
