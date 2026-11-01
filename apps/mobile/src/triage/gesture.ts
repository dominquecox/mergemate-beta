import type { TriageLane } from '../types';
/** Horizontal intent wins only when it dominates the upward movement. */
export function swipeLane(dx:number,dy:number,commit=false):TriageLane|null {
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return null;
  const x=commit?120:80,y=commit?100:80;
  if(dy < -y && -dy > Math.abs(dx))return 'fyi';
  if(dx < -x)return 'ignore';
  if(dx > x)return 'needs_you';
  return null;
}
