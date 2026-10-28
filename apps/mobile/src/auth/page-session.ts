const COVER='mergemate-session-cover';
/** Hide private DOM synchronously before a browser can freeze it into its Back/Forward cache. */
export function hideSessionForPageCache(){
 if(typeof document==='undefined')return;
 const root=document.getElementById('root');if(!root)return;root.style.visibility='hidden';
 let cover=document.getElementById(COVER);
 if(!cover){cover=document.createElement('div');cover.id=COVER;cover.textContent='Checking your session…';cover.setAttribute('role','status');cover.tabIndex=-1;Object.assign(cover.style,{position:'fixed',inset:'0',zIndex:'2147483647',display:'grid',placeItems:'center',padding:'24px',background:'#0B0B12',color:'#FFFFFF',font:'16px system-ui',boxSizing:'border-box'});document.body.appendChild(cover);}
 cover.focus({preventScroll:true});
}
/** Called only after React committed a verified session or a signed-out screen. */
export function revealSessionAfterCheck(){if(typeof document==='undefined')return;const root=document.getElementById('root');if(root)root.style.visibility='';document.getElementById(COVER)?.remove();}
