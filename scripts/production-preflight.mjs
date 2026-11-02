import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {migrationFiles} from './verify-d1-retention.mjs';

const REQUIRED_BINDINGS=['DB','AI','IMAGES','TOKEN_REFRESHER','RATE_ADMISSION','GITHUB_EVENTS','POSTS'];
const REQUIRED_SECRETS=['GITHUB_APP_CLIENT_SECRET','GITHUB_WEBHOOK_SECRET','TOKEN_ENCRYPTION_KEY','TURNSTILE_SECRET_KEY'];
/** An operator supplies an observed snapshot, not desired Wrangler configuration. Never print values. */
export function preflight(snapshot,env=process.env,now=Date.now()){
 const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
 check('snapshot-version',snapshot?.version===1);
 check('snapshot-current',Number.isFinite(Date.parse(snapshot?.observedAt))&&now-Date.parse(snapshot.observedAt)>=0&&now-Date.parse(snapshot.observedAt)<=15*60000);
 check('environment-matches',snapshot?.environment===env.APP_ENV&&['development','production'].includes(env.APP_ENV));
 check('account-matches',/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??'')&&snapshot?.accountId===env.CLOUDFLARE_ACCOUNT_ID);
 check('worker-identity',typeof snapshot?.worker==='string'&&snapshot.worker===(env.APP_ENV==='production'?'mergemate-api':'mergemate-api-dev'));
 for(const name of REQUIRED_BINDINGS)check(`binding:${name}`,snapshot?.bindings?.includes(name));
 for(const name of REQUIRED_SECRETS)check(`secret:${name}`,typeof env[name]==='string'&&env[name].trim().length>0&&snapshot?.secrets?.includes(name));
 check('web-origin',env.WEB_ORIGIN===(env.APP_ENV==='production'?'https://app.mergemate.dev':'https://dev.mergemate.dev'));
 check('site-origin',env.SITE_ORIGIN===(env.APP_ENV==='production'?'https://mergemate.dev':'https://dev.mergemate.dev'));
 check('model-base',env.MODEL_BASE_URL==='https://api.meta.ai/v1');
 const tasks=['SUMMARY','RISK','TRIAGE','HIGHLIGHT'];
 const routes=tasks.map(task=>env[`MODEL_ROUTE_${task}`]);
 for(const [i,route] of routes.entries())check(`model-route:${tasks[i]}`,typeof route==='string'&&/^(meta|workers-ai):[A-Za-z0-9@/_.-]+$/.test(route));
 if(routes.some(route=>route?.startsWith('meta:')))check('secret:MODEL_API_KEY',!!env.MODEL_API_KEY?.trim()&&snapshot?.secrets?.includes('MODEL_API_KEY'));
 const files=migrationFiles();
 check('migrations-current',Array.isArray(snapshot?.appliedMigrations)&&files.every(file=>snapshot.appliedMigrations.includes(file)));
 check('backup-restoration-receipt',snapshot?.backup?.restored===true&&snapshot.backup.sourceCompared===true&&snapshot.backup.integrity==='ok'&&snapshot.backup.foreignKeys==='ok'&&snapshot.backup.schema==='ok');
 return {ok:checks.every(item=>item.ok),checks,scope:'Offline evidence audit only; does not authorize deployment or override production HOLD.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const path=process.argv[2];if(!path||statSync(path).size>65536)throw new Error();const result=preflight(JSON.parse(readFileSync(path,'utf8')));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
 catch{console.error('Preflight failed: provide a valid bounded observed snapshot JSON. Secret values and exception details are suppressed.');process.exitCode=1;}
}
