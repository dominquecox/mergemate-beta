import type {ExecutiveVerdictLevel} from './executiveVerdict';
/** Redact common credential forms before text enters clipboard, narration or telemetry viewers. */
export function safeExecutiveText(value:string,max=300):string{
 return value.slice(0,4000).replace(/-----BEGIN[\s\S]*?-----END[^\n]*/g,'[redacted]')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk_(?:live|test)_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{12,})\b/g,'[redacted]')
  .replace(/\b(?:bearer|token|password|secret|api[_ -]?key)\s*[:= ]\s*['"]?[^\s,'"}]+/gi,'[credential omitted]')
  .replace(/https?:\/\/\S+/gi,'[link omitted]').replace(/[A-Za-z0-9_+/=-]{40,}/g,'[identifier omitted]')
  .replace(/\p{Cc}/gu,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
export interface ExecutiveBriefEntry {prRef:string;title:string;agent:string;level:ExecutiveVerdictLevel;reason?:string;lane:'ignore'|'fyi'|'needs_you'}
const markdown=(s:string)=>Array.from(safeExecutiveText(s)).filter(c=>!['\\','`','*','_','[',']','<','>'].includes(c)).join('');
export function executiveBrief(entries:readonly ExecutiveBriefEntry[],elapsedSeconds:number):string{
 const labels={safe:'Safe to Ship',caution:'Review on Desktop',blocked:'Blocked'};
 const lines=entries.map(entry=>`- **PR #${/^.*#([1-9]\d*)$/.exec(entry.prRef)?.[1]??'?'}**: ${labels[entry.level]} · ${markdown(entry.agent)||'Author unavailable'} · ${markdown(entry.title)}${entry.reason?' · '+markdown(entry.reason):''} · ${entry.lane==='needs_you'?'Needs you':entry.lane==='fyi'?'FYI':'Ignore'}`);
 const elapsed=Number.isFinite(elapsedSeconds)?Math.max(0,Math.round(elapsedSeconds)):0;
 return ['# Morning PR Triage Brief (MergeMate · Meta AI)',...lines,`\nObserved triage elapsed time: ${elapsed}s. ${entries.length} successfully triaged PRs.`, 'Read-only review signals; no GitHub approval or merge was performed.'].join('\n');
}
