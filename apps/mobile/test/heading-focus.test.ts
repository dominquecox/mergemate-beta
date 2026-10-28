import {afterEach,describe,it,expect,vi} from 'vitest';
import {focusVisibleHeading,releaseWebFocus} from '../src/navigation/heading-focus';
afterEach(()=>vi.unstubAllGlobals());
function dom(){
  const document={activeElement:null as ElementFixture|null};
  class ElementFixture {
    isConnected=true;hidden=false;visible=true;tabIndex=0;attributes:Record<string,string>={};
    closest(){return this.hidden?this:null;}
    getClientRects(){return this.visible?[{}]:[];}
    setAttribute(key:string,value:string){this.attributes[key]=value;}
    focus=vi.fn((options:unknown)=>{document.activeElement=this;});
    blur=vi.fn(()=>{document.activeElement=null;});
  }
  vi.stubGlobal('HTMLElement',ElementFixture);vi.stubGlobal('document',document);
  return {document,node:new ElementFixture()};
}
describe('screen heading keyboard focus',()=>{
  it('puts a visible heading outside the tab order and focuses without scrolling',()=>{const {document,node}=dom();expect(focusVisibleHeading(node)).toBe(true);expect(node.tabIndex).toBe(-1);expect(node.attributes['aria-level']).toBe('1');expect(node.focus).toHaveBeenCalledWith({preventScroll:true});expect(document.activeElement).toBe(node);});
  it.each(['hidden','removed','no-layout'])('does not focus %s screens',kind=>{const {node}=dom();if(kind==='hidden')node.hidden=true;if(kind==='removed')node.isConnected=false;if(kind==='no-layout')node.visible=false;expect(focusVisibleHeading(node)).toBe(false);expect(node.focus).not.toHaveBeenCalled();});
  it('releases outgoing focus so hiding the old screen cannot retain keyboard focus',()=>{const {document,node}=dom();node.focus({});releaseWebFocus();expect(node.blur).toHaveBeenCalledOnce();expect(document.activeElement).toBeNull();});
  it('is a safe no-op without a browser DOM',()=>{vi.stubGlobal('HTMLElement',undefined);vi.stubGlobal('document',undefined);expect(focusVisibleHeading(null)).toBe(false);expect(()=>releaseWebFocus()).not.toThrow();});
});
