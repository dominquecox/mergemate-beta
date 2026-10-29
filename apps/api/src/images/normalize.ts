import {ApiError} from '../errors';
import {readBoundedBody} from '../lib/bounded-body';
import {IMAGE_MAX_BYTES,inspectImage,stripPngMetadata} from './validate';
const stream=(bytes:Uint8Array)=>new Blob([bytes]).stream();
/** The Images decoder is mandatory; there is no original-byte fallback or hosted upload. */
export async function normalizeHighlight(images:ImagesBinding|undefined,bytes:Uint8Array):Promise<Uint8Array>{
 if(!images)throw new ApiError('upstream_unavailable','Screenshot processing is unavailable. Try again later.');
 const shape=inspectImage(bytes);
 try{
  const info=await images.info(stream(bytes));
  if(!('width' in info)||info.format!==shape.type||info.width!==shape.width||info.height!==shape.height)throw new ApiError('validation_failed','That image could not be decoded safely.');
  const result=await images.input(stream(bytes)).transform({width:2048,height:2048,fit:'scale-down'}).output({format:'image/png',anim:false});
  const response=result.response();
  if(!response.ok||result.contentType()!=='image/png')throw new Error('Invalid normalized output');
  return stripPngMetadata(new Uint8Array(await readBoundedBody(response,IMAGE_MAX_BYTES)));
 }catch(error){
  if(error instanceof ApiError)throw error;
  if(error && typeof error==='object' && 'code' in error && error.code===9412)throw new ApiError('validation_failed','That image could not be decoded. Choose a different screenshot.');
  throw new ApiError('upstream_unavailable','Screenshot processing is unavailable. Try again later.');
 }
}
