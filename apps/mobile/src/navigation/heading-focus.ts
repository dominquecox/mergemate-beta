/** DOM-only heading focus. Never focus a screen the navigator has hidden or removed. */
export function focusVisibleHeading(node:unknown):boolean {
  if(typeof HTMLElement==='undefined' || !(node instanceof HTMLElement) || !node.isConnected || node.closest('[aria-hidden="true"], [inert]') || node.getClientRects().length===0)return false;
  node.tabIndex=-1;
  node.setAttribute("aria-level","1");
  node.focus({preventScroll:true});
  return document.activeElement===node;
}
/** Release outgoing keyboard focus before the navigator hides its screen. */
export function releaseWebFocus():void {
  if(typeof document!=='undefined' && document.activeElement instanceof HTMLElement)document.activeElement.blur();
}
