import {AiPreferences,Settings} from '@mergemate/contracts';
import {ApiError} from '../errors';
import {defaultSettings} from './settings';
export const CURRENT_AI_CONSENT_VERSION='1';
export interface AiPolicyFence{revision:string;assertCurrent():Promise<void>}
export async function readAiPreferences(db:D1Database,userId:string){
 const row=await db.prepare('SELECT p.revision,c.granted,c.version,c.at,s.settings FROM ai_policy p LEFT JOIN consent_grants c ON c.user_id=p.user_id LEFT JOIN user_settings s ON s.user_id=p.user_id WHERE p.user_id=?').bind(userId).first<{revision:string;granted:number|null;version:string|null;at:string|null;settings:string|null}>();
 if(!row)throw new ApiError('internal','AI choices are unavailable. Try again.');
 let settings;try{settings=row.settings?Settings.parse(JSON.parse(row.settings)):defaultSettings();}catch{throw new ApiError('internal','AI choices could not be read.');}
 return AiPreferences.parse({ai:{granted:row.granted===1,version:row.version??CURRENT_AI_CONSENT_VERSION,currentVersion:CURRENT_AI_CONSENT_VERSION,...(row.at?{at:row.at}:{})},aiSummaries:settings.aiSummaries,revision:row.revision});
}
export async function captureAiPolicy(db:D1Database,userId:string,summaries=false):Promise<AiPolicyFence>{
 const state=await readAiPreferences(db,userId);
 const check=(current:typeof state)=>{if(!current.ai.granted||current.ai.version!==CURRENT_AI_CONSENT_VERSION)throw new ApiError('consent_required','Review the current AI consent first.');if(summaries&&!current.aiSummaries)throw new ApiError('forbidden','AI summaries and risk are turned off in Settings.');};
 check(state);
 return {revision:state.revision,async assertCurrent(){const current=await readAiPreferences(db,userId);check(current);if(current.revision!==state.revision)throw new ApiError('consent_changed','Your AI choices changed. Review them before trying again.');}};
}
