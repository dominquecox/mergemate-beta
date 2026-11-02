import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {QaReport} from '../packages/contracts/src/qa-evidence.ts';
import {runnerArgs,assertSnapshot,assertPullRequest,runStep,artifactManifest,QA_SUITES} from './qa-runner-core.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const snapshot=()=>({head:git('rev-parse','HEAD'),dirty:git('status','--porcelain','--untracked-files=normal'),origin:git('remote','get-url','origin')});
const prReference=(number)=>JSON.parse(execFileSync('gh',['api',`repos/dominquecox/mergemate/pulls/${number}`,'--jq','{head:.head.sha,headRepo:.head.repo.full_name,baseRepo:.base.repo.full_name,private:.base.repo.private,state:.state}'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}));
const cancellation=new AbortController(),cancel=()=>cancellation.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
let lock,output,acquired=false;
try {
  const request=runnerArgs(process.argv.slice(2));assertSnapshot({...snapshot(),expected:request.headSha});assertPullRequest(prReference(request.pullRequest),request);
  // Installed toolchain is trusted operator tooling; do not run this against unreviewed code/dependencies.
  const lockPath=git('rev-parse','--git-path','mergemate-qa.lock');lock=resolve(root,lockPath);await mkdir(lock);acquired=true; // existing lock fails closed
  output=await mkdtemp(join(tmpdir(),'mergemate-qa-'));
  const artifacts=join(output,'artifacts');await mkdir(artifacts,{mode:0o700});
  const startedAt=new Date().toISOString(),suites=[];
  // No inherited public client values or Cloudflare service credentials enter this fixture export.
  const env={...process.env,EXPO_NO_TELEMETRY:'1',EXPO_NO_DOTENV:'1',EXPO_PUBLIC_API_BASE_URL:'/__api',MM_POLISH_PROOF_DIR:join(artifacts,'mobile-polish'),MM_SESSION_PROOF_DIR:join(artifacts,'session-lifecycle')};
  for(const key of Object.keys(env))if(key.startsWith('EXPO_PUBLIC_')&&key!=='EXPO_PUBLIC_API_BASE_URL')delete env[key];
  const commands=[['npm',['run','export:web','-w','@mergemate/mobile']],['node',['apps/mobile/scripts/check-mobile-polish.mjs']],['node',['apps/mobile/scripts/check-session-lifecycle.mjs']]];
  let failed=false;
  for(const [i,[file,args]] of commands.entries()) {
    const result=failed?{status:'not_run',exitCode:null,durationMs:0}:await runStep({file,args,cwd:root,env,logPath:join(output,'logs',QA_SUITES[i]+'.log'),signal:cancellation.signal});
    suites.push({id:QA_SUITES[i],...result});failed ||= result.status!=='passed';
  }
  let status=failed?'failed':'passed';
  try {assertSnapshot({...snapshot(),expected:request.headSha});assertPullRequest(prReference(request.pullRequest),request);}catch {status='invalidated';}
  const report=QaReport.parse({version:1,runId:randomUUID(),repository:'dominquecox/mergemate',...request,scope:'browser-fixtures',runner:'MergeMate local runner',startedAt,completedAt:new Date().toISOString(),status,cleanCheckout:true,suites,artifacts:await artifactManifest(artifacts)});
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(`QA ${status}. Scope: browser fixtures, not native/live provider acceptance.\nPrivate artifacts: ${output}\nReport: ${join(output,'report.json')}`);
  process.exitCode=status==='passed'?0:1;
} catch {
  console.error(`QA failed closed: check arguments, clean exact-commit checkout, trusted origin and runner lock.${output?' Private diagnostics directory: '+output:''}`);process.exitCode=1;
} finally {process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);if(acquired)await rm(lock,{recursive:true,force:true});}
