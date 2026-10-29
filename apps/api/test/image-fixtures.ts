import {deflateSync} from 'node:zlib';
import {inspectImage,crc32} from '../src/images/validate';
export function pngChunk(type:string,data:Uint8Array){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(out.length-4,crc32(out.subarray(4,out.length-4)));return out;}
export function imagePng(width=1,height=1,metadata=''):Uint8Array{
 const h=new Uint8Array(13),v=new DataView(h.buffer);v.setUint32(0,width);v.setUint32(4,height);h[8]=8;h[9]=2;
 const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',h),...(metadata?[pngChunk('tEXt',new TextEncoder().encode('Comment\0'+metadata))]:[]),pngChunk('IDAT',deflateSync(new Uint8Array([0,255,0,0]))),pngChunk('IEND',new Uint8Array())];
 const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
}
/** Decoder fixture only: no Cloudflare or provider call. Header checks are real production code. */
export function fixtureImages(output=imagePng(),seen:{transform?:unknown;format?:unknown}={}):ImagesBinding{
 const unsupported=()=>{throw new Error('Hosted Images is forbidden in this fixture.');};
 const transformer:ImageTransformer={transform(options){seen.transform=options;return transformer;},draw:unsupported,async output(options){seen.format=options.format;return {response:()=>new Response(output),contentType:()=> 'image/png',image:()=>new Blob([output]).stream()};}};
 return {hosted:{image:unsupported,list:unsupported,upload:unsupported},async info(input){const bytes=new Uint8Array(await new Response(input).arrayBuffer());const shape=inspectImage(bytes);return {format:shape.type,width:shape.width,height:shape.height,fileSize:bytes.length};},input(){return transformer;}};
}
