import type {ModelTelemetry} from '@mergemate/contracts';
import type {CompletionResult} from './provider';
import {redactSecrets} from '../routes/ai-engine-scan';
/** Only validated output geometry/task metadata is exposed; raw prompts and arbitrary output are excluded. */
export function executionTelemetry(reply:CompletionResult,latencyMs:number,requestId:string,response:unknown):ModelTelemetry{
 const serialized=JSON.stringify(response)??'{}';
 return {provider:reply.provider,modelId:reply.modelId,environment:reply.provider==='workers-ai'?'Cloudflare Workers AI':'Meta Model API',latencyMs:Math.max(0,latencyMs),promptTokens:reply.usage?.inputTokens??null,completionTokens:reply.usage?.outputTokens??null,precision:null,observedAt:new Date().toISOString(),requestId,responseJson:redactSecrets(serialized).text.slice(0,20000)};
}
