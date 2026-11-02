import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runnerArgs,assertSnapshot,assertPullRequest,runStep,artifactManifest} from './qa-runner-core.mjs';
const sha='a'.repeat(40),origin='https://github.com/dominquecox/mergemate.git';
test('runner requires exact SHA, explicit PR and fixed options; rejects injected or repeated arguments',()=>{
 assert.deepEqual(runnerArgs(['--head',sha,'--pr','7']),{headSha:sha,pullRequest:7});
 for(const args of [[],['--head','$(bad)','--pr','7'],['--head',sha,'--cmd','rm'],['--head',sha,'--head',sha],['--pr','0','--head',sha]])assert.throws(()=>runnerArgs(args));
});
test('runner refuses dirty, wrong-head and untrusted-origin checkouts',()=>{
 assert.doesNotThrow(()=>assertSnapshot({head:sha,expected:sha,dirty:'',origin}));
 for(const change of [{head:'b'.repeat(40)},{dirty:' M source.ts'},{origin:'https://github.com/untrusted/project.git'}])assert.throws(()=>assertSnapshot({head:sha,expected:sha,dirty:'',origin,...change}));
});
test('PR identity must match the current private repository head; closed/public/fork PRs fail closed',()=>{
 const pr={head:sha,headRepo:'dominquecox/mergemate',baseRepo:'dominquecox/mergemate',private:true,state:'open'};
 assert.doesNotThrow(()=>assertPullRequest(pr,{headSha:sha}));
 for(const delta of [{head:'b'.repeat(40)},{headRepo:'other/fork'},{baseRepo:'other/repo'},{private:false},{state:'closed'}])assert.throws(()=>assertPullRequest({...pr,...delta},{headSha:sha}));
});
test('real child process outcomes retain failures/timeouts and bounded logs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qa-core-test-'));
 try{
  const opts={file:process.execPath,cwd:dir,env:process.env};
  const success=await runStep({...opts,args:['-e','console.log("fixture")'],logPath:join(dir,'pass.log')});assert.equal(success.status,'passed');assert.equal(success.exitCode,0);assert.equal((await readFile(join(dir,'pass.log'),'utf8')).trim(),'fixture');
  const failure=await runStep({...opts,args:['-e','process.exit(7)'],logPath:join(dir,'fail.log')});assert.equal(failure.status,'failed');assert.equal(failure.exitCode,7);
  const timeout=await runStep({...opts,args:['-e','setInterval(()=>{},1000)'],logPath:join(dir,'timeout.log'),timeoutMs:50});assert.equal(timeout.status,'timed_out');assert.equal(timeout.exitCode,null);
  const flood=await runStep({...opts,args:['-e','console.log("x".repeat(10000))'],logPath:join(dir,'flood.log'),maxOutput:100});assert.equal(flood.status,'output_limit');
  const controller=new AbortController();setTimeout(()=>controller.abort(),50);const cancelled=await runStep({...opts,args:['-e','setInterval(()=>{},1000)'],logPath:join(dir,'cancel.log'),signal:controller.signal});assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.exitCode,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('artifact manifest hashes exact screenshot bytes and refuses symlinks',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'qa-artifact-test-'));try{
  await mkdir(join(dir,'suite'));await writeFile(join(dir,'suite','proof.png'),'fixture-png');await writeFile(join(dir,'suite','private.log'),'excluded');
  assert.deepEqual(await artifactManifest(dir),[{name:'suite/proof.png',bytes:11,sha256:createHash('sha256').update('fixture-png').digest('hex')}]);
  await symlink(join(dir,'suite','proof.png'),join(dir,'leak.png'));await assert.rejects(()=>artifactManifest(dir),/symlinks/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
