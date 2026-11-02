import {appFor,signIn} from './sign-in';
import {testContext,json} from './helpers';
import {fixtureImages,imagePng} from './image-fixtures';
import {describe,it,expect} from 'vitest';
import {ModelHighlight,UiSegment} from '@mergemate/contracts';
import {normalizeUiSegments} from '../src/routes/ai-engine-segment';
import {createModelProvider} from '../src/ai/provider';
import {fakeAi,mockTransport,validModelEnv} from './helpers';
const region={id:'a',label:'Toggle',bbox:[0.2,0.1,0.3,0.2] as [number,number,number,number],touchTargetSizePt:{width:32,height:48},touchTargetCompliant:true};
describe('UI segment evidence contract',()=>{
 it('returns normalized UI metrics through the authenticated consent-gated API',async()=>{
  const ctx=testContext({...validModelEnv(),MODEL_ROUTE_HIGHLIGHT:'meta:muse-spark-1.2',IMAGES:fixtureImages()});ctx.kv.set('flags:v1',JSON.stringify({highlight:true}));
  ctx.net.on('POST','https://api.meta.ai/v1/responses',()=>json({object:'response',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({explanation:'Toggle needs review.',segments:[region]})}]}]}));
  const call=appFor(ctx),{headers}=await signIn(ctx,'ios');
  await call('/v1/consent',{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({ai:{granted:true,version:'1'}})});
  const form=new FormData();form.append('image',new File([imagePng()],'shot.png',{type:'image/png'}));
  const res=await call('/v1/highlight',{method:'POST',headers,body:form});expect(res.status).toBe(200);
  const body=await res.json() as {segments:{touchTargetCompliant:boolean;higViolation:string}[]};expect(body.segments[0]?.touchTargetCompliant).toBe(false);expect(body.segments[0]?.higViolation).toContain('44pt');
 });
 it('rejects off-image, inverted, nonfinite and negative dimension evidence',()=>{for(const patch of [{bbox:[0,0,2,1]},{bbox:[0.8,0,0.1,1]},{touchTargetSizePt:{width:NaN,height:44}},{touchTargetSizePt:{width:-1,height:44}}])expect(UiSegment.safeParse({...region,...patch}).success).toBe(false);});
 it('recomputes compliance and warning rather than trusting model claims',()=>{const [s]=normalizeUiSegments([region]);expect(s?.touchTargetCompliant).toBe(false);expect(s?.higViolation).toMatch(/44pt/);expect(normalizeUiSegments([{...region,touchTargetSizePt:{width:44,height:44},touchTargetCompliant:false}])[0]?.touchTargetCompliant).toBe(true);});
 it('keeps old vision answers compatible and preserves new structured segments',()=>{expect(ModelHighlight.parse({explanation:'Image',regions:[]}).segments).toBeUndefined();expect(ModelHighlight.parse({explanation:'Image',segments:[region]}).segments).toHaveLength(1);});
 it('sends llama3.2 vision image bytes and parses its JSON response',async()=>{const ai=fakeAi(async()=>({response:JSON.stringify({explanation:'Target',segments:[region]})}));const provider=createModelProvider({...validModelEnv(),MODEL_ROUTE_HIGHLIGHT:'workers-ai:@cf/meta/llama-3.2-11b-vision-instruct'},'highlight',{transport:mockTransport(),ai});const result=await provider.complete({system:'Inspect',prompt:'Screenshot',maxOutputTokens:500,image:{dataUrl:'data:image/png;base64,AQID'}});expect(ModelHighlight.parse(JSON.parse(result.text)).segments).toHaveLength(1);expect(ai.runs[0]?.inputs).toMatchObject({image:[1,2,3],max_tokens:500});});
});
