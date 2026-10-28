export type SessionChange='signed-in'|'signed-out';
const listeners=new Set<(kind:SessionChange)=>void>();let channel:BroadcastChannel|undefined;
function connection(){
  if(typeof window==='undefined' || typeof window.BroadcastChannel!=='function')return;
  if(!channel){channel=new window.BroadcastChannel('mergemate-session-v1');channel.onmessage=event=>{const value:unknown=event.data;if(value && typeof value==='object' && 'v' in value && value.v===1 && 'kind' in value && (value.kind==='signed-in'||value.kind==='signed-out'))for(const listener of listeners)listener(value.kind);};}
  return channel;
}
/** Same-origin notification only; no token, user identifier or private data crosses tabs. */
export function notifySessionChange(kind:SessionChange){connection()?.postMessage({v:1,kind});}
export function onSessionChange(listener:(kind:SessionChange)=>void){listeners.add(listener);connection();return()=>{listeners.delete(listener);if(!listeners.size){channel?.close();channel=undefined;}};}
let logoutPending=false;
const LOGOUT_INTENT='mergemate_logout_pending';
/** Non-secret, same-origin sign-out intent. Prevents cookie restoration after an offline logout. */
export function hasPendingLogout(){try{return typeof window!=='undefined' ? window.localStorage.getItem(LOGOUT_INTENT)==='1' : logoutPending;}catch{return logoutPending;}}
export function setPendingLogout(pending:boolean){logoutPending=pending;try{if(typeof window!=='undefined'){if(pending)window.localStorage.setItem(LOGOUT_INTENT,'1');else window.localStorage.removeItem(LOGOUT_INTENT);}}catch{/* Keep the in-memory intent; actual logout failures are reported to the person. */}}
