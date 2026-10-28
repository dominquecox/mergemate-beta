let stop=()=>{};
export function registerReadoutStop(cancel:()=>void){stop=cancel;return()=>{if(stop===cancel)stop=()=>{};};}
export function cancelReadout(){stop();}
