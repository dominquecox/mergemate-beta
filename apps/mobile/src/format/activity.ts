import type { Notification } from '../types';

export function relativeTime(iso:string,now=Date.now()):string {
  const elapsed=now-Date.parse(iso);
  if(!Number.isFinite(elapsed))return 'Time unavailable';
  const minutes=Math.max(0,Math.floor(elapsed/60_000));
  if(minutes<1)return 'now';
  if(minutes<60)return `${minutes}m`;
  if(minutes<1440)return `${Math.floor(minutes/60)}h`;
  return `${Math.floor(minutes/1440)}d`;
}
export function activityAction(kind:Notification['kind']):string {
  return kind==='review'?'authored a pull request · review requested':kind==='mention'?'authored a pull request · mentions you':'authored this pull request';
}
