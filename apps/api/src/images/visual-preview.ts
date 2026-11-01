import {ApiError} from '../errors';
import {readBoundedBody} from '../lib/bounded-body';
import {normalizeHighlight} from './normalize';
import {IMAGE_MAX_BYTES,inspectImage,stripPngMetadata} from './validate';
/** Conservative static SVG subset: reject active content, CSS, external resources and entities. */
export function staticSvg(bytes:Uint8Array):string{
 let text:string;try{text=new TextDecoder().decode(bytes);}catch{throw new ApiError('validation_failed','Invalid SVG image.');}
 if(text.includes('\uFFFD'))throw new ApiError('validation_failed','Invalid SVG encoding.');
 const tags=[...text.matchAll(/<\/?\s*([\w:-]+)/g)].map(x=>x[1]?.toLowerCase());
 const allowed=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','title','desc']);
 if(!/^\s*<svg\b/i.test(text)||tags.some(tag=>!tag||!allowed.has(tag))||/&|<!|<\?|\bon[\w]+\s*=|\b(?:href|src|style)\s*=|url\s*\(|javascript:|data:/i.test(text))throw new ApiError('validation_failed','Use a static SVG without scripts, styles or external resources.');
 return text;
}
export async function normalizeVisualPreview(images:ImagesBinding|undefined,bytes:Uint8Array,path:string):Promise<Uint8Array>{
 if(!/\.svg$/i.test(path))return normalizeHighlight(images,bytes);
 staticSvg(bytes);
 if(!images)throw new ApiError('upstream_unavailable','Image preview processing unavailable.');
 try{const result=await images.input(new Blob([bytes]).stream()).transform({width:2048,height:2048,fit:'scale-down'}).output({format:'image/png',anim:false});const res=result.response();if(!res.ok||result.contentType()!=='image/png')throw new Error('Invalid preview');const clean=stripPngMetadata(new Uint8Array(await readBoundedBody(res,IMAGE_MAX_BYTES)));inspectImage(clean);return clean;}
 catch{throw new ApiError('upstream_unavailable','This SVG could not be rasterized safely. Use a PNG screenshot instead.');}
}
