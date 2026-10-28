import {describe,it,expect} from 'vitest';
import {resolveSession,rotateSession,purgeExpiredSessions} from '../src/lib/sessions';
import {sha256Hex} from '../src/lib/crypto';
import {testContext,fakeLimiter} from './helpers';
import {appFor,signIn} from './sign-in';
describe('atomic session lifecycle',()=>{
 it('allows revocation after the session budget is exhausted, using independent IP admission',async()=>{const ctx=testContext();ctx.env.SESSION_RATE_LIMITER=fakeLimiter(1);const session=await signIn(ctx,'ios');const call=appFor(ctx);expect((await call('/v1/me',{headers:session.headers})).status).toBe(200);expect((await call('/v1/me',{headers:session.headers})).status).toBe(429);expect((await call('/v1/auth/logout',{method:'POST',headers:session.headers})).status).toBe(204);expect((await call('/v1/me',{headers:session.headers})).status).toBe(401);});
 it('uses explicit Android bearer transport and the fixed HTTPS native callback',async()=>{const ctx=testContext();const session=await signIn(ctx,'android');expect(session.headers.authorization).toMatch(/^Bearer /);expect(session.res.headers.get('set-cookie')).toBeNull();expect((await appFor(ctx)('/v1/me',{headers:session.headers})).status).toBe(200);const exchange=ctx.net.calls.find(x=>x.url.startsWith('https://github.com/login/oauth/access_token'));expect(exchange).toBeDefined();expect(exchange?.headers.get('content-type')).toBe('application/json');expect(exchange?.body).toContain('"redirect_uri":"https://dev.mergemate.dev/auth/callback"');});
 it('purges idle current and spent credentials while preserving fresh sessions',async()=>{const ctx=testContext();const a=await signIn(ctx,'ios');await appFor(ctx)('/v1/auth/refresh',{method:'POST',headers:a.headers});ctx.time.advance(7*24*60*60_000+1);const fresh=await signIn(ctx,'ios');await purgeExpiredSessions(ctx.env.DB,ctx.time.now());expect(ctx.db.rows('SELECT * FROM sessions')).toHaveLength(1);expect(ctx.db.rows('SELECT * FROM session_lineage')).toHaveLength(0);expect((await appFor(ctx)('/v1/me',{headers:fresh.headers})).status).toBe(200);});
 it('allows one winner for parallel refreshes resolved against the same old session',async()=>{
  const ctx=testContext();const session=await signIn(ctx,'ios');const token=(session.headers.authorization??'').slice(7);const old=await resolveSession(ctx.env.DB,token,ctx.time.now());if(!old)throw new Error('Fixture session missing');expect(old).not.toBeNull();
  const outcomes=await Promise.allSettled([rotateSession(ctx.env.DB,old,ctx.time.now()),rotateSession(ctx.env.DB,old,ctx.time.now())]);expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);expect(ctx.db.rows('SELECT * FROM sessions')).toHaveLength(1);expect(ctx.db.rows('SELECT * FROM session_lineage')).toHaveLength(1);
 });
 it('rolls back a partial rotation, keeping the original credential usable',async()=>{
  const ctx=testContext();const session=await signIn(ctx,'ios');const token=(session.headers.authorization??'').slice(7);const old=await resolveSession(ctx.env.DB,token,ctx.time.now());if(!old)throw new Error('Fixture session missing');ctx.db.sqlite.exec("CREATE TRIGGER reject_rotation BEFORE INSERT ON session_lineage BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");
  await expect(rotateSession(ctx.env.DB,old,ctx.time.now())).rejects.toThrow();expect(ctx.db.rows('SELECT token_hash FROM sessions')).toEqual([{token_hash:await sha256Hex(token)}]);expect((await appFor(ctx)('/v1/me',{headers:session.headers})).status).toBe(200);
 });
 it('spent bearer credentials can only revoke their own family, never read or rotate again',async()=>{
  const ctx=testContext();const session=await signIn(ctx,'ios');const call=appFor(ctx);const response=await call('/v1/auth/refresh',{method:'POST',headers:session.headers});const {session:next}=await response.json() as {session:{token:string}};expect(response.status).toBe(200);
  expect((await call('/v1/me',{headers:session.headers})).status).toBe(401);expect((await call('/v1/auth/refresh',{method:'POST',headers:session.headers})).status).toBe(401);
  expect((await call('/v1/auth/logout',{method:'POST',headers:session.headers})).status).toBe(204);expect((await call('/v1/me',{headers:{authorization:`Bearer ${next.token}`}})).status).toBe(401);expect(ctx.db.rows('SELECT * FROM session_lineage')).toHaveLength(0);
 });
 it('spent cookie logout still requires the matching old CSRF and clears the replacement',async()=>{
  const ctx=testContext();const session=await signIn(ctx,'web');const call=appFor(ctx);const refreshed=await call('/v1/auth/refresh',{method:'POST',headers:{...session.headers,'x-csrf-token':session.csrf??''}});expect(refreshed.status).toBe(200);const cookie=refreshed.headers.get('set-cookie')?.split(';')[0]??'';
  const bootstrap=await call('/v1/auth/csrf',{headers:session.headers});expect(bootstrap.status).toBe(200);expect(await bootstrap.json()).toEqual({csrfToken:session.csrf});expect((await call('/v1/settings',{headers:session.headers})).status).toBe(401);expect((await call('/v1/auth/logout',{method:'POST',headers:{...session.headers,'x-csrf-token':'wrong'}})).status).toBe(403);expect((await call('/v1/me',{headers:{cookie}})).status).toBe(200);
  const logout=await call('/v1/auth/logout',{method:'POST',headers:{...session.headers,'x-csrf-token':session.csrf??''}});expect(logout.status).toBe(204);expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');expect((await call('/v1/me',{headers:{cookie}})).status).toBe(401);
 });
 it('logout leaves other sign-in families active and remains available to suspended accounts',async()=>{
  const ctx=testContext();const a=await signIn(ctx,'ios'),b=await signIn(ctx,'ios');const call=appFor(ctx);expect((await call('/v1/auth/logout',{method:'POST',headers:a.headers})).status).toBe(204);expect((await call('/v1/me',{headers:b.headers})).status).toBe(200);ctx.db.sqlite.exec("UPDATE users SET status='suspended'");expect((await call('/v1/auth/logout',{method:'POST',headers:b.headers})).status).toBe(204);
 });
 it('preserves session admission identity across rotation',async()=>{
  const ctx=testContext();const limiter=fakeLimiter();ctx.env.SESSION_RATE_LIMITER=limiter;const session=await signIn(ctx,'ios');const call=appFor(ctx);await call('/v1/me',{headers:session.headers});const response=await call('/v1/auth/refresh',{method:'POST',headers:session.headers});const body=await response.json() as {session:{token:string}};await call('/v1/me',{headers:{authorization:`Bearer ${body.session.token}`}});expect(new Set(limiter.keys).size).toBe(1);
 });
 it('rejects a session suspended between middleware resolution and rotation',async()=>{
  const ctx=testContext();const session=await signIn(ctx,'ios');const old=await resolveSession(ctx.env.DB,(session.headers.authorization??'').slice(7),ctx.time.now());if(!old)throw new Error('Fixture session missing');ctx.db.sqlite.exec("UPDATE users SET status='suspended'");await expect(rotateSession(ctx.env.DB,old,ctx.time.now())).rejects.toMatchObject({code:'unauthorized'});expect(ctx.db.rows('SELECT * FROM sessions')).toHaveLength(1);
 });
});
