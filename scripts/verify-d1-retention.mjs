import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
export function migrationFiles(){return readdirSync(resolve(root,'apps/api/migrations')).filter(f=>/^\d+.*\.sql$/.test(f)).sort();}
export function expectedDatabase(){const db=new DatabaseSync(':memory:');for(const file of migrationFiles())db.exec(readFileSync(resolve(root,'apps/api/migrations',file),'utf8'));return db;}
function schema(db){return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY type,name").all();}
function signature(rows){return createHash('sha256').update(JSON.stringify(rows,(_,v)=>typeof v==='bigint'?v.toString():v instanceof Uint8Array?Buffer.from(v).toString('hex'):v)).digest('hex');}
function dataSignature(db,table){const rows=db.prepare(`SELECT * FROM ${quote(table)}`).all();return signature(rows.map(row=>signature(row)).sort());}
export function verifyDatabase(db,expected){
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('integrity');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('foreign-keys');
 const wanted=schema(expected),actual=schema(db);
 // Compare semantic table layouts and required indexes, allowing D1 administrative tables.
 for(const item of wanted){
  if(!actual.some(row=>row.name===item.name&&row.type===item.type))throw new Error('missing-schema');
  if(item.type==='table'&&signature(db.prepare(`PRAGMA table_info(${quote(item.name)})`).all())!==signature(expected.prepare(`PRAGMA table_info(${quote(item.name)})`).all()))throw new Error('table-layout');
 }
 return {integrity:'ok',foreignKeys:'ok',schema:'ok',tables:wanted.filter(r=>r.type==='table').length};
}
export function verifyDump(dumpPath,sourcePath){
 if(statSync(dumpPath).size>64*1024*1024)throw new Error('dump-too-large');
 const dump=readFileSync(dumpPath,'utf8');
 // Dumps are executable SQL. Forbid filesystem/extension operations even in an offline drill.
 if(/\b(ATTACH|DETACH|load_extension|writefile|readfile)\b/i.test(dump)||/^\s*\./m.test(dump))throw new Error('unsupported-dump');
 const restored=new DatabaseSync(':memory:');const expected=expectedDatabase();let source;
 try{
  restored.exec(dump);const result=verifyDatabase(restored,expected);
  if(sourcePath){source=new DatabaseSync(resolve(sourcePath),{readOnly:true});verifyDatabase(source,expected);
   for(const table of schema(expected).filter(r=>r.type==='table'))if(dataSignature(source,table.name)!==dataSignature(restored,table.name))throw new Error('restore-content');
  }
  const now=new Date().toISOString(),old=new Date(Date.now()-7*86400000).toISOString();
  const stale=restored.prepare("SELECT count(*) AS count FROM sessions WHERE expires_at<=? OR last_seen_at<=?").get(now,new Date(Date.now()-7*86400000).toISOString()).count;
  const tombstones=restored.prepare("SELECT count(*) AS count FROM account_deletions WHERE state='completed' AND completed_at<=?").get(old).count;
  return {...result,restored:true,sourceCompared:!!sourcePath,retention:{expiredSessions:Number(stale),expiredDeletionReceipts:Number(tombstones),reviewRequired:Number(stale)+Number(tombstones)>0}};
 }finally{source?.close();restored.close();expected.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args[0]!=='--dump'||!args[1]||args.length>4||(args[2]&&args[2]!=='--source'))throw new Error();console.log(JSON.stringify(verifyDump(resolve(args[1]),args[3]),null,2));}
 catch{console.error('D1 offline verification failed. Supply --dump <trusted SQL dump> [--source <local SQLite snapshot>]. No remote database was changed.');process.exitCode=1;}
}
