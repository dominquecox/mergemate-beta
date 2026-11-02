import type {ModelTelemetry} from '@mergemate/contracts';
import {safeExecutiveText} from './executiveExport';
export function telemetryLabel(value:ModelTelemetry|undefined,sample=false){
 if(sample)return 'Meta telemetry · Sample, no execution';
 if(!value)return 'Meta telemetry · No execution evidence';
 return `${value.modelId} · ${value.provider==='workers-ai'?'Workers AI':'Meta API'}`;
}
export function telemetryResponse(value:ModelTelemetry|undefined,sample=false){
 if(sample||!value)return 'No live response was recorded for this view.';
 try{return JSON.stringify(JSON.parse(value.responseJson),(_key,item)=>typeof item==='string'?safeExecutiveText(item,400):item,2).slice(0,20000);}
 catch{return 'Response details were unavailable or truncated. Execution metrics are shown separately.';}
}
