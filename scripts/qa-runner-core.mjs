import {spawn} from 'node:child_process';
import {open, mkdir, readdir, lstat, realpath, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, resolve, sep} from 'node:path';

export const QA_SUITES = ['export-web', 'mobile-polish', 'session-lifecycle'];
export function runnerArgs(args) {
  const allowed = new Set(['--head', '--pr']);
  if (args.length !== 4 || !args.every((v,i) => i % 2 || allowed.has(v)) || new Set(args.filter((_,i) => i % 2 === 0)).size !== 2) throw new Error('Usage: npm run qa:run -- --pr NUMBER --head FULL_COMMIT_SHA');
  const options = Object.fromEntries([0,2].map(i=>[args[i],args[i+1]]));
  if (!/^[a-f0-9]{40}$/.test(options['--head']) || !/^[1-9]\d{0,9}$/.test(options['--pr']) || Number(options['--pr']) > 2147483647) throw new Error('Provide an exact full commit SHA and positive PR number.');
  return {headSha:options['--head'],pullRequest:Number(options['--pr'])};
}
export function assertSnapshot({head, expected, dirty, origin}) {
  if (head !== expected || dirty) throw new Error('QA requires a clean checkout at the exact requested commit.');
  if (!['https://github.com/dominquecox/mergemate.git','git@github.com:dominquecox/mergemate.git','https://github.com/dominquecox/mergemate'].includes(origin)) throw new Error('This runner is restricted to the trusted MergeMate working repository.');
}
export function assertPullRequest(pr, {headSha}) {
  if (pr?.head !== headSha || pr?.headRepo?.toLowerCase() !== 'dominquecox/mergemate' || pr?.baseRepo?.toLowerCase() !== 'dominquecox/mergemate' || pr?.private !== true || pr?.state !== 'open') throw new Error('PR must be open in the private trusted repository at this exact commit.');
}
/** Fixed, operator-selected commands only; never a shell or commands from PR/report content. */
export async function runStep({file,args,cwd,env,logPath,timeoutMs=600000,maxOutput=8*1024*1024,signal}) {
  await mkdir(resolve(logPath,'..'),{recursive:true});
  const handle=await open(logPath,'wx',0o600),start=Date.now();
  let child, timer, forced=null, output=0, writes=Promise.resolve();
  try {
    return await new Promise(resolveResult=>{
      let settled=false;
      const finish=(exitCode)=>{if(settled)return;settled=true;clearTimeout(timer);resolveResult({status:forced??(exitCode===0?'passed':'failed'),exitCode:forced?null:Number.isInteger(exitCode)&&exitCode>=0?exitCode:null,durationMs:Date.now()-start});};
      child=spawn(file,args,{cwd,env,stdio:['ignore','pipe','pipe'],shell:false,detached:process.platform!=='win32'});
      const stop=(kind='timed_out')=>{forced??=kind;try {if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{child.kill('SIGKILL');}};
      // Descriptor writes avoid retaining private log text in report memory.
      child.stdout.on('data',chunk=>{output+=chunk.length;if(output>maxOutput)stop('output_limit');else writes=writes.then(()=>handle.write(chunk)).catch(()=>stop('output_limit'));});
      child.stderr.on('data',chunk=>{output+=chunk.length;if(output>maxOutput)stop('output_limit');else writes=writes.then(()=>handle.write(chunk)).catch(()=>stop('output_limit'));});
      child.on('error',()=>finish(null));child.on('close',code=>finish(code));const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();child.once('close',()=>signal?.removeEventListener('abort',abort));timer=setTimeout(()=>stop('timed_out'),timeoutMs);
    });
  } finally {clearTimeout(timer);await writes;await handle.close();}
}
export async function artifactManifest(root) {
  const base=await realpath(root),rows=[];
  let total=0;
  async function walk(path) {
    for (const entry of await readdir(path,{withFileTypes:true})) {
      if(entry.isSymbolicLink())throw new Error('Artifact symlinks are not permitted.');
      const full=join(path,entry.name);if(entry.isDirectory()){await walk(full);continue;}
      if(!entry.isFile()||!entry.name.endsWith('.png'))continue;
      const stat=await lstat(full),actual=await realpath(full);
      if(!actual.startsWith(base+sep)||stat.size>20*1024*1024)throw new Error('Invalid artifact boundary or size.');
      total+=stat.size;if(rows.length>=80||total>200*1024*1024)throw new Error('Artifact limit exceeded.');
      const bytes=await readFile(full);rows.push({name:full.slice(base.length+1).split(sep).join('/'),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
    }
  }
  await walk(base);return rows.sort((a,b)=>a.name.localeCompare(b.name));
}
