import type {PrDetail} from '../types';
import type {ExecutiveBriefEntry} from '../workspace/executiveExport';
import {safeExecutiveText} from '../workspace/executiveExport';
import {getExecutiveVerdict} from '../workspace/executiveVerdict';
import {scanAgentGuardrails,guardrailCoverage} from '../workspace/agentGuardrails';
import {detectBlastRadius} from '../workspace/blastRadius';
import {narrationSentences} from './text';
const bounded=(parts:string[],limit=32)=>{
 let budget=limit;
 return narrationSentences(parts.map(p=>safeExecutiveText(p,500))).flatMap(s=>{if(budget<=0)return [];const words=s.split(/\s+/).slice(0,budget);budget-=words.length;return [words.join(' ')];});
};
export function prExecutiveNarration(detail:PrDetail):string[]{
 const verdict=getExecutiveVerdict(detail),findings=scanAgentGuardrails(detail.files),coverage=guardrailCoverage(detail.files,detail.changedFilesCount);
 return bounded([`Pull request ${detail.number}. ${verdict.headline.replace('·','.')}.`,
 `Blast radius: ${detectBlastRadius(detail.files).map(x=>x.label).join(', ')||'not assessed'}.`,
 findings.length?`${findings.length} agent guardrail findings need human review.`:coverage.complete?'No guardrail findings in the loaded patches.':'Guardrail coverage is incomplete.',
 'Human review is still required.']);
}
export function triageExecutiveNarration(items:readonly Pick<ExecutiveBriefEntry,'prRef'|'agent'|'level'|'title'>[]):string[]{
 const labels={safe:'low risk signal',blocked:'blocked for review',caution:'requires desktop review'};
 return bounded([`You have ${items.length} loaded pull requests to review.`,...items.slice(0,3).map(item=>`PR ${/^.*#([1-9]\d*)$/.exec(item.prRef)?.[1]??'unknown'} from ${safeExecutiveText(item.agent,30)||'an unknown author'} ${labels[item.level]}. ${safeExecutiveText(item.title,100)}.`)],80);
}
