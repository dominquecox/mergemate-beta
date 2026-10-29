export type DiffLineKind='add'|'del'|'context'|'hunk'|'meta';
export interface DiffLine{kind:DiffLineKind;number:number|null;marker:string;text:string}
/** Line numbers advance only inside a hunk. Headers/EOF markers never consume a code line. */
export function parseDiff(patch:string):DiffLine[]{
 let oldLine=0,newLine=0,oldLeft=0,newLeft=0;
 const rawLines=patch.split('\n');if(rawLines.at(-1)==='')rawLines.pop();
 return rawLines.map(value=>{const raw=value.replace(/\r$/,'');const hunk=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
  if(hunk){oldLine=Number(hunk[1]);newLine=Number(hunk[3]);oldLeft=Number(hunk[2]??1);newLeft=Number(hunk[4]??1);return {kind:'hunk',number:null,marker:'',text:raw};}
  if(raw.startsWith('\\')||oldLeft<=0&&newLeft<=0)return {kind:'meta',number:null,marker:'',text:raw};
  if(raw.startsWith('+')){newLeft--;return {kind:'add',number:newLine++,marker:'+',text:raw.slice(1)};}
  if(raw.startsWith('-')){oldLeft--;return {kind:'del',number:oldLine++,marker:'-',text:raw.slice(1)};}
  if(raw.startsWith(' ')){oldLeft--;newLeft--;const line:DiffLine={kind:'context',number:newLine++,marker:'',text:raw.slice(1)};oldLine++;return line;}
  return {kind:'meta',number:null,marker:'',text:raw};
 });
}
