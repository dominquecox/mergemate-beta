import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AgentError, validateConfig, validateJob, validateChanges, limitedResponseText, sha256 } from './agent-policy.mjs';
import { validateArchive } from './agent-archive.mjs';
import { sourceManifest } from './agent-manifest.mjs';
import { DockerExecutor, runBounded } from './agent-process.mjs';
import { GitHubPublisher } from './agent-github.mjs';
import { WorkflowBridge, LeaseGuard } from './agent-bridge.mjs';
import { executeJob } from './agent-runner.mjs';

const sha = c => c.repeat(40);
const policy = () => validateConfig({serverOrigin:'https://api.example.test',repositories:['owner/repo'],image:`node@sha256:${'a'.repeat(64)}`,tests:[['npm','test']],runnerId:'fixture-runner'});
const job = () => ({id:'job_1',runId:'run_1',repository:'owner/repo',repositoryId:101,baseSha:sha('a'),targetKind:'repository',baseBranch:'main',intent:'Fix the label',stage:'patch',leaseToken:'x'.repeat(32),leaseExpiresAt:new Date(Date.now()+60000).toISOString()});
async function temporary(fn){const dir=await mkdtemp(path.join(tmpdir(),'mm-agent-test-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
function tar(entries){const blocks=[];for(const item of entries){const data=Buffer.from(item.content??''),h=Buffer.alloc(512);h.write(item.path,0,100);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(`${data.length.toString(8).padStart(11,'0')}\0`,124);h.write('00000000000\0',136);h.fill(32,148,156);h[156]=(item.type??'0').charCodeAt(0);if(item.link)h.write(item.link,157,100);h.write('ustar\0',257);let sum=0;for(const x of h)sum+=x;h.write(`${sum.toString(8).padStart(6,'0')}\0 `,148);blocks.push(h,data,Buffer.alloc((512-data.length%512)%512));}blocks.push(Buffer.alloc(1024));return gzipSync(Buffer.concat(blocks));}

 test('configuration rejects unpinned images, traversal repositories, invalid IDs and unbounded limits',()=>{
 const good=policy();assert.equal(good.runnerId,'fixture-runner');assert.equal(good.maxArchiveBytes,16777216);
 for(const bad of [{image:'node:latest'},{repositories:['owner/..']},{runnerId:'bad/id'},{maxSandboxMb:99999},{tests:[['sh','-c','anything']]}])assert.throws(()=>validateConfig({...good,...bad}),AgentError);
 assert.throws(()=>validateJob({...job(),limits:{maxFiles:'not-a-number'}},good),/limits/);
 assert.throws(()=>validateJob({...job(),repository:'other/repo'},good),/invalid/);
 assert.throws(()=>validateJob({...job(),githubAccessToken:'must-never-reach-runner'},good),/invalid/);
 });
 test('patches reject traversal, protected files, symlinks, credentials and byte overrun',async()=>temporary(async root=>{
 await mkdir(path.join(root,'apps/mobile/src'),{recursive:true});await writeFile(path.join(root,'apps/mobile/src/a.ts'),'old');
 for(const change of [{path:'../escape.ts',content:'x'},{path:'apps/mobile/src/auth.ts',content:'x'},{path:'apps/mobile/src/.mergemate/policy.ts',content:'x'},{path:'apps/mobile/src/deploy/config.ts',content:'x'},{path:'apps/mobile/src/a.ts',content:`ghp_${'a'.repeat(40)}`}])await assert.rejects(validateChanges(root,[change],policy()));
 await symlink('/tmp',path.join(root,'apps/mobile/src/link'));await assert.rejects(validateChanges(root,[{path:'apps/mobile/src/link/a.ts',content:'x'}],policy()),/Symlinks/);
 await assert.rejects(validateChanges(root,[{path:'apps/mobile/src/a.ts',content:'x'.repeat(10)}],policy(),{maxPatchBytes:5}),/byte/);
 assert.equal((await validateChanges(root,[{path:'apps/mobile/src/a.ts',content:'new'}],policy())).patchHash.length,64);
 }));
 test('archive validates normal roots and rejects traversal, links, duplicate paths, bombs and truncation',async()=>temporary(async root=>{
 const archive=path.join(root,'source.tgz');const write=async entries=>writeFile(archive,tar(entries));
 await write([{path:'source/',type:'5'},{path:'source/apps/a.ts',content:'good'}]);assert.equal((await validateArchive(archive,policy())).entries,2);
 for(const entries of [[{path:'source/../../escape',content:'bad'}],[{path:'source/link',type:'2',link:'/etc/passwd'}],[{path:'source/a',content:'a'},{path:'source/a',content:'b'}]]){await write(entries);await assert.rejects(validateArchive(archive,policy()));}
 await write([{path:'source/a',content:'x'.repeat(2000)}]);await assert.rejects(validateArchive(archive,{...policy(),maxCheckoutBytes:1024}),/Expanded/);
 await writeFile(archive,Buffer.from('not gzip'));await assert.rejects(validateArchive(archive,policy()),/malformed/);
 }));
 test('source manifest covers unpatched files and refuses symlinks',async()=>temporary(async root=>{
 await mkdir(path.join(root,'apps/mobile/src'),{recursive:true});await writeFile(path.join(root,'apps/mobile/src/a.ts'),'first');await writeFile(path.join(root,'package.json'),'{}');
 const first=await sourceManifest(root,policy());await writeFile(path.join(root,'package.json'),'changed');const second=await sourceManifest(root,policy());assert.notEqual(first.hash,second.hash);assert.equal(first.files.length,2);
 await symlink('/etc/passwd',path.join(root,'apps/mobile/src/b.ts'));await assert.rejects(sourceManifest(root,policy()),/symlinks/);
 }));
 test('test isolation uses read-only source, bounded tmpfs and removes networking before test execution',async()=>temporary(async root=>{
 await mkdir(path.join(root,'workspace'));await writeFile(path.join(root,'workspace/package.json'),'{}');const calls=[];
 const docker=new DockerExecutor(policy(),{uid:1000,gid:1000,run:async(executable,args)=>{calls.push({executable,args});return {exitCode:0,durationMs:1,outputHash:'a'.repeat(64)};}});
 await docker.install(path.join(root,'workspace'));await docker.test(path.join(root,'workspace'),new AbortController().signal);await docker.cleanup(path.join(root,'workspace'));
 const create=calls.find(c=>c.args[0]==='create').args;assert(create.includes('--read-only'));assert(create.includes('--cap-drop'));assert(create.some(x=>x.endsWith('target=/source,readonly')));assert(create.some(x=>x.startsWith('/workspace:rw')&&x.includes('size=2048m')));assert(!create.some(x=>x.includes('GITHUB_TOKEN')||x.includes('docker.sock')));
 const disconnect=calls.findIndex(c=>c.args[0]==='network'),tests=calls.findIndex(c=>c.args[0]==='exec'&&c.args[2]==='npm'&&c.args[3]==='test');assert(disconnect>=0&&disconnect<tests);assert(calls.find(c=>c.args.includes('ci')).args.includes('--ignore-scripts'));assert(calls.some(c=>c.args.at(-1)==='verify'));assert.equal(calls.at(-1).args[0],'rm');
 }));
 test('cleanup and network-isolation nonzero exits block rather than claim safety',async()=>temporary(async root=>{
 const docker=new DockerExecutor(policy(),{uid:1000,run:async(_x,args)=>({exitCode:args[0]==='rm'?1:0})});await assert.rejects(docker.remove('fixture'),/cleanup/);
 await mkdir(path.join(root,'workspace'));await writeFile(path.join(root,'workspace/package.json'),'{}');const failure=new DockerExecutor(policy(),{uid:1000,run:async(_x,args)=>({exitCode:args[0]==='network'?1:0})});await assert.rejects(failure.install(path.join(root,'workspace')),e=>e.code==='network_isolation_failed');await failure.cleanup(path.join(root,'workspace'));
 }));
 test('bounded processes stop on output limits and cancellation without reporting pass',async()=>temporary(async root=>{
 const data=path.join(root,'output.txt');await writeFile(data,'x'.repeat(100000));
 await assert.rejects(runBounded('/bin/cat',[data],{maxOutputBytes:100,timeoutMs:5000}),e=>e.code==='output_limit');
 const controller=new AbortController();const promise=runBounded('/bin/sleep',['10'],{signal:controller.signal,timeoutMs:5000});controller.abort();await assert.rejects(promise,e=>e.code==='cancelled');
 }));
 test('bridge pins origin, requires signed runner and Access credentials, and rejects expired leases and oversized bodies',async()=>{
 assert.throws(()=>new WorkflowBridge(policy(),'short'),/credential/);let seen;
 const bridge=new WorkflowBridge(policy(),'x'.repeat(64),{accessClientId:'fixture-id',accessClientSecret:'fixture-secret',fetcher:async(url,options)=>{seen={url,options};return Response.json({active:false});}});
 const guard=new LeaseGuard(bridge,job(),undefined,{intervalMs:100000});await assert.rejects(guard.assertActive(),/lease/);guard.stop();assert(seen.url.startsWith('https://api.example.test/internal/workflows/'));assert.equal(seen.options.redirect,'error');assert(!('Origin' in seen.options.headers));assert.equal(seen.options.headers['CF-Access-Client-Id'],'fixture-id');assert.equal(seen.options.headers['CF-Access-Client-Secret'],'fixture-secret');
 const archiveBridge=new WorkflowBridge(policy(),'x'.repeat(64),{accessClientId:'fixture-id',accessClientSecret:'fixture-secret',fetcher:async()=>new Response(Buffer.from([31,139,8,0]))});assert.deepEqual(await archiveBridge.archive(job()),Buffer.from([31,139,8,0]));
 const oversized=new WorkflowBridge({...policy(),maxArchiveBytes:3},'x'.repeat(64),{accessClientId:'fixture-id',accessClientSecret:'fixture-secret',fetcher:async()=>new Response(Buffer.from([1,2,3,4]))});await assert.rejects(oversized.archive(job()),/limit/);
 await assert.rejects(limitedResponseText(new Response('x'.repeat(100)),20),/byte limit/);
 });
function githubFixture({existing=false,collision=false,failDraft=false,permission=true}={}) {
 const requests=[],state={ref:existing?sha('d'):null,pr:existing?true:false};
 const pr=()=>({html_url:'https://github.com/owner/repo/pull/9',draft:true,state:'open',head:{sha:sha('d'),ref:'mergemate-agent/run_1',repo:{full_name:'owner/repo'}},base:{sha:sha('a'),ref:'main',repo:{full_name:'owner/repo'}}});
 const fetcher=async(input,options={})=>{
  const url=new URL(input),method=options.method??'GET',body=options.body?JSON.parse(options.body):undefined;requests.push({url:url.href,method,body});
  if(url.pathname==='/repos/owner/repo')return Response.json({full_name:'owner/repo',permissions:{push:permission},default_branch:'main'});
  if(url.pathname==='/repos/owner/repo/branches/main')return Response.json({commit:{sha:sha('a')}});
  if(url.pathname===`/repos/owner/repo/git/commits/${sha('a')}`)return Response.json({sha:sha('a'),tree:{sha:sha('b')}});
  if(url.pathname===`/repos/owner/repo/git/commits/${sha('d')}`)return Response.json({sha:sha('d'),tree:{sha:collision?sha('f'):sha('c')},parents:[{sha:sha('a')}],message:'fix: agent task run_1'});
  if(url.pathname==='/repos/owner/repo/git/blobs')return Response.json({sha:sha('e')});
  if(url.pathname==='/repos/owner/repo/git/trees'){assert.equal(body.base_tree,sha('b'));return Response.json({sha:sha('c')});}
  if(url.pathname.startsWith('/repos/owner/repo/git/ref/heads/'))return state.ref?Response.json({object:{sha:state.ref}}):Response.json({}, {status:404});
  if(url.pathname==='/repos/owner/repo/git/commits'&&method==='POST')return Response.json({sha:sha('d')});
  if(url.pathname==='/repos/owner/repo/git/refs'){state.ref=body.sha;return Response.json({object:{sha:body.sha}});}
  if(url.pathname==='/repos/owner/repo/pulls'&&method==='GET')return Response.json(state.pr?[pr()]:[]);
  if(url.pathname==='/repos/owner/repo/pulls'&&method==='POST'){if(failDraft)return Response.json({}, {status:403});assert.equal(body.draft,true);state.pr=true;return Response.json(pr());}
  throw new Error(`Unexpected fake GitHub operation ${method} ${url}`);
 };
 return {requests,state,fetcher};
}
 test('publisher uses the actual base tree, creates draft only after tests, and reconciles retries',async()=>temporary(async root=>{
 await mkdir(path.join(root,'apps/mobile/src'),{recursive:true});await writeFile(path.join(root,'apps/mobile/src/a.ts'),'fixed');const changes=[{path:'apps/mobile/src/a.ts',content:'fixed'}],tests=[{command:'npm test',exitCode:0,durationMs:2,outputHash:'f'.repeat(64)}];
 const fake=githubFixture();const publisher=new GitHubPublisher('fixture-token',{fetcher:fake.fetcher});
 await assert.rejects(publisher.publish(job(),root,changes,[],sha256('patch'),{assertActive:async()=>{}}),/tests/);
 const result=await publisher.publish(job(),root,changes,tests,sha256('patch'),{assertActive:async()=>{}});assert.equal(result.draftPrUrl,'https://github.com/owner/repo/pull/9');
 assert.equal(fake.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/pulls')).length,1);
 const retried=await publisher.publish(job(),root,changes,tests,sha256('patch'),{assertActive:async()=>{}});assert.equal(retried.commitSha,result.commitSha);assert.equal(fake.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/pulls')).length,1);assert.equal(fake.requests.filter(r=>r.method==='POST'&&r.url.endsWith('/git/refs')).length,1);
 }));
 test('publisher blocks collisions/missing permissions/cancellation and retains partial branch evidence',async()=>temporary(async root=>{
 await mkdir(path.join(root,'apps/mobile/src'),{recursive:true});await writeFile(path.join(root,'apps/mobile/src/a.ts'),'fixed');const changes=[{path:'apps/mobile/src/a.ts',content:'fixed'}],tests=[{command:'npm test',exitCode:0,durationMs:2}];
 const denied=githubFixture({permission:false});await assert.rejects(new GitHubPublisher('fixture',{fetcher:denied.fetcher}).publish(job(),root,changes,tests,sha256('x'),{assertActive:async()=>{}}),/write/);assert(!denied.requests.some(r=>r.method==='POST'));
 const collision=githubFixture({existing:true,collision:true});await assert.rejects(new GitHubPublisher('fixture',{fetcher:collision.fetcher}).publish(job(),root,changes,tests,sha256('x'),{assertActive:async()=>{}}),e=>e.code==='branch_collision');assert(!collision.requests.some(r=>r.url.endsWith('/git/refs')&&r.method==='POST'));
 const cancelled=githubFixture();await assert.rejects(new GitHubPublisher('fixture',{fetcher:cancelled.fetcher}).publish(job(),root,changes,tests,sha256('x'),{assertActive:async()=>{throw new AgentError('cancelled','cancelled','cancelled');}}),/cancelled/);assert(!cancelled.requests.some(r=>r.method==='POST'));
 const partial=githubFixture({failDraft:true});await assert.rejects(new GitHubPublisher('fixture',{fetcher:partial.fetcher}).publish(job(),root,changes,tests,sha256('x'),{assertActive:async()=>{}}),e=>e.publicationEvidence?.commitSha===sha('d'));
 }));
async function fakeJobRun({failTests=false,mutateOther=false,cancel=false,stage='patch'}={}) {
 const reports=[];let published=false,cleaned=false;const testResult={command:'npm test',exitCode:0,durationMs:1,outputHash:'c'.repeat(64)};
 const docker={available:async()=>true,extract:async root=>{await mkdir(path.join(root,'apps/mobile/src'),{recursive:true});await writeFile(path.join(root,'apps/mobile/src/a.ts'),'old');await writeFile(path.join(root,'apps/mobile/src/b.ts'),'other');await writeFile(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{}}));},install:async()=>{},test:async root=>{if(failTests)throw Object.assign(new AgentError('tests_failed','tests failed','failed'),{tests:[{...testResult,exitCode:1}]});if(mutateOther)await writeFile(path.join(root,'apps/mobile/src/b.ts'),'mutated');return[testResult];},cleanup:async()=>{cleaned=true;}};
 const bridge={archive:async()=>tar([{path:'source/package-lock.json',content:'{}'}]),jobOperation:async(_job,op,value)=>{if(op==='patch')return {changes:[{path:'apps/mobile/src/a.ts',content:'fixed'}]};reports.push(value);return{};}};
 let checks=0;const guard={signal:new AbortController().signal,assertActive:async()=>{if(cancel&&++checks>3)throw new AgentError('cancelled','fixture cancel','cancelled');},stop:()=>{}};
 const changes=[{path:'apps/mobile/src/a.ts',content:'fixed'}],rawJob=stage==='qa'?{...job(),stage:'qa',approvedPatch:{changes,summary:'Approved fixture'},patchHash:sha256(JSON.stringify(changes))}:job();
 const outcome=await executeJob(rawJob,{policy:policy(),bridge,docker,makeGuard:()=>guard});return{outcome,reports,published,cleaned};
}
 test('patch generation stops for approval and QA reports only the exact approved patch without runner publication',async()=>{
 const proposal=await fakeJobRun();assert.equal(proposal.outcome.status,'waiting_approval');assert(!proposal.published&&proposal.cleaned);assert.deepEqual(proposal.reports.map(r=>r.stage),['patch']);
 const result=await fakeJobRun({stage:'qa'});assert.equal(result.outcome.status,'succeeded');assert(!result.published&&result.cleaned);assert.deepEqual(result.reports.map(r=>r.stage),['qa']);assert.equal(result.outcome.evidence.tests[0].exitCode,0);
 });
 test('failed tests, source drift and cancellation never publish success',async()=>{
 for(const options of [{failTests:true,stage:'qa'},{mutateOther:true,stage:'qa'},{cancel:true,stage:'qa'}]){const result=await fakeJobRun(options);assert(!result.published);assert.notEqual(result.outcome.status,'succeeded');assert(result.cleaned);}
 });
 test('archive download pins repo/SHA and never forwards host credentials to codeload',async()=>temporary(async root=>{
 const calls=[],content=tar([{path:'source/a.ts',content:'ok'}]);
 const publisher=new GitHubPublisher('fixture-secret',{fetcher:async(url,options)=>{calls.push({url:String(url),headers:options.headers});return calls.length===1?new Response(null,{status:302,headers:{location:`https://codeload.github.com/owner/repo/legacy.tar.gz/${sha('a')}`}}):new Response(content);}});
 await publisher.downloadArchive(job(),path.join(root,'source.tgz'),new AbortController().signal);assert.equal(calls.length,2);assert.equal(calls[0].headers.Authorization,'Bearer fixture-secret');assert.equal(calls[1].headers.Authorization,undefined);
 const bad=new GitHubPublisher('fixture',{fetcher:async()=>new Response(null,{status:302,headers:{location:`https://codeload.github.com/other/repo/legacy.tar.gz/${sha('a')}`}})});await assert.rejects(bad.downloadArchive(job(),path.join(root,'bad.tgz'),new AbortController().signal),/pinned/);
 }));
 test('missing archives and unsafe PAX metadata are refused cleanly',async()=>temporary(async root=>{
 await assert.rejects(validateArchive(path.join(root,'missing'),policy()),/malformed/);
 const file=path.join(root,'pax.tgz');await writeFile(file,tar([{path:'metadata',type:'x',content:'11 size=99\n'},{path:'source/a',content:'x'}]));await assert.rejects(validateArchive(file,policy()));
 }));
 test('owner setup pins only a reviewed local image and does not accept missing digests',async()=>{
 const {initialPolicy}=await import('./agent-init-policy.mjs');
 const config=initialPolicy('owner/repo',{inspect:()=>JSON.stringify([`node@sha256:${'a'.repeat(64)}`])});assert.equal(config.repositories[0],'owner/repo');assert(config.image.includes('@sha256:'));assert(config.tests.length===3);
 assert.throws(()=>initialPolicy('owner/repo',{inspect:()=>JSON.stringify([])}),/digest/);
 });
