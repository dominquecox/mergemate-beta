import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {describe,it,expect} from 'vitest';
describe('0012 upgrade preserves existing auth data',()=>{
 it('backfills legacy session families and keeps pending flows, indexes and push FKs valid',()=>{
  const db=new DatabaseSync(':memory:');try{
   db.exec('PRAGMA foreign_keys=ON');const dir=join(import.meta.dirname,'../migrations');for(const file of readdirSync(dir).sort().filter(name=>name<'0012_session_families_android.sql'))db.exec(readFileSync(join(dir,file),'utf8'));
   db.prepare('INSERT INTO users(id,github_id,login,name,avatar_url,created_at,updated_at)VALUES(?,?,?,?,?,?,?)').run('legacy-user',1,'legacy',null,'https://example.com/avatar','2026-10-28','2026-10-28');
   db.prepare('INSERT INTO sessions(token_hash,user_id,demo,transport,csrf_token,created_at,last_seen_at,expires_at)VALUES(?,?,?,?,?,?,?,?)').run('legacy-hash','legacy-user',0,'bearer',null,'2026-10-28','2026-10-28','2099-01-01');
   db.prepare('INSERT INTO push_tokens(user_id,device_id,token,session_hash,updated_at)VALUES(?,?,?,?,?)').run('legacy-user','fixture-device','ExpoPushToken[fixture]','legacy-hash','2026-10-28');
   db.prepare('INSERT INTO oauth_states(state,code_challenge,platform,redirect_uri,expires_at)VALUES(?,?,?,?,?)').run('pending-legacy','c'.repeat(43),'ios','https://dev.mergemate.dev/auth/callback','2099-01-01');
   db.exec(readFileSync(join(dir,'0012_session_families_android.sql'),'utf8'));
   expect(db.prepare('SELECT family_id FROM sessions WHERE token_hash=?').get('legacy-hash')).toEqual({family_id:'legacy-hash'});expect(db.prepare('SELECT platform FROM oauth_states WHERE state=?').get('pending-legacy')).toEqual({platform:'ios'});expect(db.prepare('SELECT session_hash FROM push_tokens').get()).toEqual({session_hash:'legacy-hash'});expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
   const insert=db.prepare('INSERT INTO oauth_states VALUES(?,?,?,?,?)');expect(()=>insert.run('android-state','c'.repeat(43),'android','https://dev.mergemate.dev/auth/callback','2099-01-01')).not.toThrow();expect(()=>insert.run('invalid-state','c'.repeat(43),'unknown','https://dev.mergemate.dev/auth/callback','2099-01-01')).toThrow();expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='oauth_states_expires'").get()).toEqual({name:'oauth_states_expires'});
  }finally{db.close();}
 });
});
