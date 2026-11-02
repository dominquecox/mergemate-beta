import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expectedDatabase,verifyDatabase,verifyDump,migrationFiles} from './verify-d1-retention.mjs';
import {preflight} from './production-preflight.mjs';

test('restores all real migrations offline and rejects missing schema or malicious SQL',()=>{
 const db=expectedDatabase(),dir=mkdtempSync(join(tmpdir(),'mm-d1-'));
 try{
  assert.equal(verifyDatabase(db,db).schema,'ok');
  const sql=db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(row=>row.sql+';').join('\n');
  const dump=join(dir,'dump.sql');writeFileSync(dump,sql);
  assert.equal(verifyDump(dump).restored,true);
  const snapshot=join(dir,'source.sqlite');db.exec("VACUUM INTO '"+snapshot.replaceAll("'","''")+"'");
  assert.equal(verifyDump(dump,snapshot).sourceCompared,true);
  writeFileSync(dump,sql+"\nINSERT INTO activity_audit VALUES('extra','acme/app',1,'review',NULL,'2026-11-01T00:00:00Z');");assert.throws(()=>verifyDump(dump,snapshot));
  writeFileSync(dump,"VACUUM INTO '/tmp/unwanted-backup.sqlite';");assert.throws(()=>verifyDump(dump));
  writeFileSync(dump,'CREATE TABLE wrong(id TEXT);');assert.throws(()=>verifyDump(dump));
  writeFileSync(dump,"ATTACH '/tmp/elsewhere' AS other;");assert.throws(()=>verifyDump(dump));
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('preflight fails closed on stale, wrong-account, missing-migration and missing-secret evidence without leaking values',()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),APP_ENV:'development',WEB_ORIGIN:'https://dev.mergemate.dev',SITE_ORIGIN:'https://dev.mergemate.dev',MODEL_BASE_URL:'https://api.meta.ai/v1'};
 const secrets=['GITHUB_APP_CLIENT_SECRET','GITHUB_WEBHOOK_SECRET','TOKEN_ENCRYPTION_KEY','TURNSTILE_SECRET_KEY','MODEL_API_KEY'];for(const name of secrets)env[name]='fixture-sensitive-value';
 for(const task of ['SUMMARY','RISK','TRIAGE','HIGHLIGHT'])env[`MODEL_ROUTE_${task}`]='meta:muse-spark-1.2';
 const now=Date.now(),snapshot={version:1,accountId:'a'.repeat(32),observedAt:new Date(now).toISOString(),environment:'development',worker:'mergemate-api-dev',bindings:['DB','AI','IMAGES','TOKEN_REFRESHER','RATE_ADMISSION','GITHUB_EVENTS','POSTS'],secrets,appliedMigrations:migrationFiles(),backup:{restored:true,sourceCompared:true,integrity:'ok',foreignKeys:'ok',schema:'ok'}};
 assert.equal(preflight(snapshot,env,now).ok,true);
 for(const patch of [{observedAt:'2000-01-01'}, {worker:'elsewhere'}, {appliedMigrations:[]}, {secrets:[]}])assert.equal(preflight({...snapshot,...patch},env,now).ok,false);
 assert.equal(JSON.stringify(preflight(snapshot,env,now)).includes('fixture-sensitive-value'),false);
});
