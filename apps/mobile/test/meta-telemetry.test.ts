import {describe,it,expect} from 'vitest';
import {telemetryLabel,telemetryResponse} from '../src/workspace/metaTelemetry';
import {ModelTelemetry} from '@mergemate/contracts';
const metric=ModelTelemetry.parse({provider:'workers-ai',modelId:'@cf/meta/llama-3.2-11b-vision-instruct',environment:'Cloudflare Workers AI',latencyMs:27,promptTokens:null,completionTokens:4,precision:null,observedAt:'2026-11-01T12:00:00Z',requestId:'fixture-request',responseJson:JSON.stringify({bbox:[0.1,0.2,0.3,0.4]})});
describe('Meta execution evidence',()=>{
 it('never presents samples or absent metrics as live inference',()=>{expect(telemetryLabel(metric,true)).toContain('Sample, no execution');expect(telemetryResponse(metric,true)).toContain('No live response');expect(telemetryLabel(undefined)).toContain('No execution evidence');});
 it('shows the actual model and preserves unavailable precision/token counts',()=>{expect(telemetryLabel(metric)).toContain(metric.modelId);expect(metric.precision).toBeNull();expect(metric.promptTokens).toBeNull();expect(telemetryResponse(metric)).toContain('0.3');expect(telemetryResponse({...metric,responseJson:'not-json'})).toContain('unavailable');});
 it('scrubs credential-shaped text from the geometry viewer',()=>{const secret='ghp_'+'a'.repeat(40);expect(telemetryResponse({...metric,responseJson:JSON.stringify({label:secret})})).not.toContain(secret);});
});
