import type {PrFile} from '../types';
export interface AgentGuardrailFinding {
 type:'ghost_dependency'|'mock_creep'|'guard_deletion'|'wildcard_permission';
 severity:'high'|'medium';message:string;file:string;line?:number;
}
const testFile=/(^|\/)(__tests__|__mocks__|tests?|fixtures?|mocks?|demo|samples?)(\/|\.)|\.(test|spec|fixtures?)\./i;
const builtins=new Set(['assert','async_hooks','buffer','child_process','cluster','console','crypto','dgram','diagnostics_channel','dns','events','fs','http','http2','https','module','net','os','path','perf_hooks','process','querystring','readline','repl','stream','string_decoder','timers','tls','trace_events','tty','url','util','v8','vm','wasi','worker_threads','zlib','test']);
const packageName=(name:string)=>name.startsWith('@')?name.split('/').slice(0,2).join('/'):name.split('/')[0]??'';
export const productionPatch=(f:PrFile)=>!testFile.test(f.filename)&&/\.(?:[cm]?[jt]sx?|json|ya?ml|rules|py|go|rs|toml|tf|tfvars|conf|ini|env)$/i.test(f.filename);
/** Full manifest snapshots may be supplied by the read-only dependency-context endpoint. */
export function scanAgentGuardrails(files:readonly PrFile[]):AgentGuardrailFinding[]{
 const findings:AgentGuardrailFinding[]=[],seen=new Set<string>();
 const manifestNames=new Map<string,string[]>();
 for(const file of files.filter(f=>/package\.json$/.test(f.filename)&&f.status==='added'&&f.patchState!=='partial')){
  const raw=(file.patchSnippet??'').split('\n').filter(l=>!l.startsWith('@@')&&!l.startsWith('---')&&!l.startsWith('+++')&&!l.startsWith('-')).map(l=>l.startsWith('+')||l.startsWith(' ')?l.slice(1):l).join('\n');
  try{const pkg=JSON.parse(raw) as Record<string,unknown>;if(!pkg||typeof pkg!=='object')continue;const names=['dependencies','devDependencies','peerDependencies','optionalDependencies'].flatMap(key=>pkg[key]&&typeof pkg[key]==='object'?Object.keys(pkg[key] as object):[]);manifestNames.set(file.filename.replace(/(^|\/)package\.json$/,''),names);}catch{/* Partial manifest diffs cannot establish dependency availability. */}
 }
 for(const file of files){
  if(!productionPatch(file))continue;
  const manifest=[...manifestNames].filter(([dir])=>!dir||file.filename.startsWith(dir+'/')).sort((a,b)=>b[0].length-a[0].length)[0];
  const deps=file.dependencyNames??manifest?.[1];
  let addedLine=1,oldLine=1;
  const add=(type:AgentGuardrailFinding['type'],severity:AgentGuardrailFinding['severity'],message:string,line:number)=>{const key=`${type}:${file.filename}:${line}:${message}`;if(!seen.has(key)&&findings.length<100){seen.add(key);findings.push({type,severity,message,file:file.filename,line});}};
  for(const line of (file.patchSnippet??'').slice(0,250_000).split('\n')){
   const hunk=/^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);if(hunk){oldLine=Number(hunk[1]);addedLine=Number(hunk[2]);continue;}
   if(line.startsWith('+++')||line.startsWith('---')||line.startsWith('diff '))continue;
   const added=line.startsWith('+'),deleted=line.startsWith('-'),text=line.slice(1);
   if(added){
    if(deps){for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?|\brequire\s*\()\s*['"]([^'"]+)['"]/g)){const name=match[1]??'',pkg=packageName(name);if(!/^(?:[./~#]|@\/|(?:node|bun|cloudflare):|https?:)/.test(name)&&!builtins.has(pkg)&&!deps.includes(pkg))add('ghost_dependency','medium',`Import is not declared in the available manifest: ${pkg}`,addedLine);}}
    if(/\breturn\s*\{\s*status\s*:\s*200\b|\/\/\s*mock for test|\breturn\s*\[\]\s*\/\*\s*dummy/i.test(text))add('mock_creep','medium','Possible test/mock shortcut added to production code; inspect implementation.',addedLine);
    if(/\/\/.*\b(?:requireAuth|authenticate|authorize|verifyToken|checkPermission|csrf)\b|\b(?:authRequired|requireAuth|verifyToken|checkPermission)\s*[:=]\s*false\b/i.test(text))add('guard_deletion','high','Security check may have been disabled or commented out.',addedLine);
    if(/0\.0\.0\.0\/0|allow\s+read\s*,\s*write\s*:\s*if\s+true|\bpermissions\s*:\s*write-all|\b(?:permissions?|actions?|resources?|origins?)\b[^\n]*['"]\*['"]/i.test(text))add('wildcard_permission','high','Unrestricted network or permission rule added; explicit security review required.',addedLine);
   }
   if(deleted&&/\b(?:requireAuth|authenticate|authorize|verifyToken|checkPermission|requirePermission|csrfProtection)\s*\(/i.test(text)&&!/^\s*(?:\/\/|\*)/.test(text))add('guard_deletion','high','Authentication or permission check removed from the patch.',oldLine);
   if(!deleted)addedLine++;if(!added)oldLine++;
  }
 }
 return findings;
}
export function guardrailCoverage(files:readonly PrFile[],total=files.length){
 const production=files.filter(productionPatch),patched=production.filter(f=>!!f.patchSnippet&&f.patchState!=='partial');
 const dependenciesKnown=production.filter(f=>/\.[cm]?[jt]sx?$/.test(f.filename)).every(f=>f.dependencyNames!==undefined);
 return {checked:patched.length,total:production.length,complete:files.length>=total&&production.length>0&&patched.length===production.length,dependenciesKnown};
}
