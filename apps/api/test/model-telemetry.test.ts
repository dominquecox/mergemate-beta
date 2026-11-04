import {describe,it,expect} from 'vitest';
import {ModelHighlight,ModelTelemetry} from '@mergemate/contracts';
import {executionTelemetry} from '../src/ai/execution-telemetry';
import {createModelProvider} from '../src/ai/provider';
import {runModelTask} from '../src/routes/ai-engine-gate';
import {validModelEnv,fakeAi,mockTransport,testContext,json} from './helpers';
import {appFor,signIn} from './sign-in';
import {fixtureImages,imagePng} from './image-fixtures';
describe('request-scoped model execution evidence',()=>{
 it('records actual fallback provider/model with null unknown metrics, never invented FP16',async()=>{
  const env={...validModelEnv(),MODEL_ROUTE_HIGHLIGHT:'meta:muse-spark-1.2'},ai=fakeAi(async()=>({response:'{"explanation":"Image","regions":[]}',usage:{prompt_tokens:12,completion_tokens:7}}));
  const provider=createModelProvider(env,'highlight',{ai,transport:mockTransport(async()=>{throw new Error('upstream down');})});let metric:ReturnType<typeof executionTelemetry>|undefined;
  await runModelTask(env,provider,'highlight',{system:'Inspect',prompt:'Image',maxOutputTokens:100,image:{dataUrl:'data:image/png;base64,AQID'}},ModelHighlight,undefined,(reply,latency)=>{metric=executionTelemetry(reply,latency,'req',{regions:[]});});
  expect(metric?.provider).toBe('workers-ai');expect(metric?.modelId).toContain('llama-4-scout');expect(metric?.promptTokens).toBe(12);expect(metric?.precision).toBeNull();expect(ModelTelemetry.safeParse(metric).success).toBe(true);
 });
 it('redacts response labels and keeps unreported counts null',()=>{const secret='ghp_'+'a'.repeat(40);const metric=executionTelemetry({provider:'meta',modelId:'muse-spark-1.2',text:'not retained'},2,'req',{label:secret});expect(metric.responseJson).not.toContain(secret);expect(metric.promptTokens).toBeNull();expect(JSON.stringify(metric)).not.toContain('not retained');});
 it('returns correlated execution metrics but never prompts/images in a real Highlight response',async()=>{
  const ctx=testContext({...validModelEnv(),MODEL_ROUTE_HIGHLIGHT:'meta:muse-spark-1.2',IMAGES:fixtureImages()});ctx.kv.set('flags:v1',JSON.stringify({highlight:true}));
  const secret='ghp_'+'a'.repeat(40);let body='';ctx.net.on('POST','https://api.meta.ai/v1/responses',(call:import('./helpers').RecordedCall)=>{body=call.body??'';return json({object:'response',output:[{type:'message',content:[{type:'output_text',text:'{"explanation":"Image","regions":[]}'}]}],usage:{input_tokens:6,output_tokens:4}});});
  const call=appFor(ctx),{headers}=await signIn(ctx,'ios');await call('/v1/consent',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({ai:{granted:true,version:'2'}})});
  const form=new FormData();form.append('image',new File([imagePng()],'shot.png',{type:'image/png'}));form.append('note',secret);
  const res=await call('/v1/highlight',{method:'POST',headers,body:form});expect(res.status).toBe(200);const result=await res.json() as {telemetry:ReturnType<typeof executionTelemetry>};expect(result.telemetry.requestId).toBe(res.headers.get('x-request-id'));expect(result.telemetry.precision).toBeNull();expect(body).not.toContain(secret);expect(JSON.stringify(result.telemetry)).not.toContain('data:image');
 });
});
