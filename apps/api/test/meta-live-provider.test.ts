import {describe,it,expect} from 'vitest';
import {createModelProvider} from '../src/ai/provider';
import {normalizeUiSegments,parseSegmentBoxes} from '../src/routes/ai-engine-segment';
import {ModelHighlight} from '@mergemate/contracts';
import {fakeAi,mockTransport,validModelEnv} from './helpers';
import {demoAiFor} from '../src/routes/ai-demo-fixtures';

describe('Meta execution boundary (fixture transport, not live proof)',()=>{
 it('runs the configured vision wire shape and validates segments without inventing usage',async()=>{
  const ai=fakeAi(async()=>({response:JSON.stringify({explanation:'Small button',regions:[],segments:[{id:'a',label:'Button',bbox:[0,0,0.1,0.1],touchTargetSizePt:{width:32,height:44},touchTargetCompliant:true}]}),usage:{prompt_tokens:10}}));
  const provider=createModelProvider({...validModelEnv(),MODEL_ROUTE_HIGHLIGHT:'workers-ai:@cf/meta/llama-3.2-11b-vision-instruct'},'highlight',{transport:mockTransport(),ai});
  const response=await provider.complete({system:'Inspect',prompt:'Screenshot',maxOutputTokens:200,image:{dataUrl:'data:image/png;base64,AQID'}});
  expect(response.modelId).toBe('@cf/meta/llama-3.2-11b-vision-instruct');expect(response.usage).toBeUndefined();
  const parsed=ModelHighlight.parse(JSON.parse(response.text));expect(normalizeUiSegments(parsed.segments)[0]?.touchTargetCompliant).toBe(false);
  expect(ai.runs[0]?.inputs).toMatchObject({image:[1,2,3]});
 });
 it('parses SAM bounds and rejects invalid geometry',()=>{
  expect(parseSegmentBoxes('0<|box;x1=10;y1=20;x2=80;y2=90;w=100;h=100|>')).toMatchObject([{xMin:100,yMin:200,xMax:800,yMax:900}]);
  expect(parseSegmentBoxes('0<|box;x1=80;y1=20;x2=10;y2=90;w=100;h=100|>')).toEqual([]);
 });
 it('provides deterministic labeled samples without credentials and never labels them live',()=>{
  const ref={owner:'acme-demo',repo:'payments-api',number:42};
  expect(demoAiFor(ref)).toEqual(demoAiFor(ref));expect(demoAiFor(ref).summary.model).toBe('sample:demo');
 });
});
