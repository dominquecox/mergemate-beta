import {describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({deleted:[] as string[]}));
vi.mock('expo-file-system',()=>({Paths:{cache:{uri:'file:///app/cache/'}},File:class{exists=true;constructor(readonly uri:string){}delete(){fixture.deleted.push(this.uri);}}}));
import {releasePickedImage} from '../src/highlight/cleanup.native';
describe('native screenshot cache cleanup',()=>{
 it('removes its own selected picker copy',async()=>{fixture.deleted=[];await releasePickedImage('file:///app/cache/ImagePicker/shot.png');expect(fixture.deleted).toEqual(['file:///app/cache/ImagePicker/shot.png']);});
 it('never deletes a library original, different directory or path traversal alias',async()=>{fixture.deleted=[];for(const uri of ['ph://library/original','file:///app/Documents/original.png','file:///app/cache-other/ImagePicker/x.png','file:///app/cache/ImagePicker/../../Documents/original.png'])await releasePickedImage(uri);expect(fixture.deleted).toEqual([]);});
});
