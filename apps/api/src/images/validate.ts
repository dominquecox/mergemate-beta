import {ApiError} from '../errors';
export const IMAGE_MAX_BYTES=5*1024*1024;
export const IMAGE_MAX_PIXELS=16*1024*1024;
export type ImageType='image/png'|'image/jpeg'|'image/webp';
export interface ImageShape {type:ImageType;width:number;height:number}
const bad=()=>new ApiError('validation_failed','Use a complete, still JPEG, PNG or WebP image.');
const text=(b:Uint8Array,a:number,n:number)=>String.fromCharCode(...b.subarray(a,a+n));
const CRC_TABLE=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
export function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const b of bytes)crc=(crc>>>8)^(CRC_TABLE[(crc^b)&255]??0);return (crc^0xffffffff)>>>0;}
function png(bytes:Uint8Array,strip=false){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=8,width=0,height=0,data=false,end=false,chunks=0;const clean:Uint8Array[]=[bytes.subarray(0,8)];
 while(at+12<=bytes.length){if(++chunks>4096)throw bad();const size=v.getUint32(at),kind=text(bytes,at+4,4),next=at+12+size;if(next>bytes.length || crc32(bytes.subarray(at+4,next-4))!==v.getUint32(next-4))throw bad();
  if(at===8 && (kind!=='IHDR'||size!==13))throw bad();
  if(kind==='IHDR'){if(width!==0||size!==13)throw bad();width=v.getUint32(at+8);height=v.getUint32(at+12);}
  if(['acTL','fcTL','fdAT'].includes(kind))throw bad();
  if(kind==='IDAT')data=true;
  if(kind==='IEND'){if(size!==0||next!==bytes.length)throw bad();end=true;}
  if(!['IHDR','PLTE','tRNS','IDAT','IEND'].includes(kind) && kind[0]===kind[0]?.toUpperCase())throw bad();
  if(!strip || ['IHDR','PLTE','tRNS','IDAT','IEND'].includes(kind))clean.push(bytes.subarray(at,next));
  at=next;if(end)break;
 }
 if(!end||!data)throw bad();return {width,height,clean};
}
export function inspectImage(bytes:Uint8Array):ImageShape{
 if(bytes.length>IMAGE_MAX_BYTES)throw new ApiError('payload_too_large','Choose an image smaller than 5 MB.');
 let shape:ImageShape|undefined;
 try{
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(text(bytes,0,8)==='\x89PNG\r\n\x1a\n'){const {width,height}=png(bytes);shape={type:'image/png',width,height};}
 else if(bytes[0]===255&&bytes[1]===216){
  let at=2,width=0,height=0,end=false,scan=false;
  while(at<bytes.length){
   if(scan){while(at<bytes.length && bytes[at]!==255)at++;if(bytes[at+1]===0 || ((bytes[at+1]??0)>=208&&(bytes[at+1]??0)<=215)){at+=2;continue;}scan=false;}
   if(bytes[at++]!==255)throw bad();while(bytes[at]===255)at++;const marker=bytes[at++];
   if(marker===217){if(at!==bytes.length)throw bad();end=true;break;}
   if(marker===undefined || marker===216||marker===0)throw bad();const size=v.getUint16(at);if(size<2||at+size>bytes.length)throw bad();
   if([192,193,194].includes(marker)){if(size<8||width!==0)throw bad();height=v.getUint16(at+3);width=v.getUint16(at+5);}
   if(marker===218)scan=true;at+=size;
  }
  if(!end)throw bad();shape={type:'image/jpeg',width,height};
 }else if(text(bytes,0,4)==='RIFF'&&text(bytes,8,4)==='WEBP'){
  if(v.getUint32(4,true)+8!==bytes.length)throw bad();let at=12,width=0,height=0,images=0,chunks=0,canvasWidth=0,canvasHeight=0;
  while(at+8<=bytes.length){if(++chunks>4096)throw bad();const kind=text(bytes,at,4),size=v.getUint32(at+4,true),data=at+8,next=data+size+(size%2);if(next>bytes.length)throw bad();
   if(kind==='VP8X'){if(size!==10 || ((bytes[data]??0)&2))throw bad();canvasWidth=1+(bytes[data+4]??0)+((bytes[data+5]??0)<<8)+((bytes[data+6]??0)<<16);canvasHeight=1+(bytes[data+7]??0)+((bytes[data+8]??0)<<8)+((bytes[data+9]??0)<<16);}
   else if(kind==='VP8 '){if(size<10||text(bytes,data+3,3)!=='\x9d\x01\x2a'||((bytes[data]??0)&1))throw bad();width=v.getUint16(data+6,true)&16383;height=v.getUint16(data+8,true)&16383;images++;}
   else if(kind==='VP8L'){if(size<5||bytes[data]!==47||((bytes[data+4]??0)&224))throw bad();const bits=v.getUint32(data+1,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;images++;}
   else if(!['ALPH','ICCP','EXIF','XMP '].includes(kind))throw bad();
   at=next;
  }
  if(at!==bytes.length||images!==1||(canvasWidth!==0&&(canvasWidth!==width||canvasHeight!==height)))throw bad();shape={type:'image/webp',width,height};
 }
 }catch(error){if(error instanceof ApiError)throw error;throw bad();}
 if(!shape||shape.width<1||shape.height<1||shape.width>8192||shape.height>8192||shape.width*shape.height>IMAGE_MAX_PIXELS)throw bad();
 return shape;
}
/** Defense in depth after mandatory decoder re-encoding: keep pixels/palette/alpha only. */
export function stripPngMetadata(bytes:Uint8Array):Uint8Array{
 const shape=inspectImage(bytes);if(shape.type!=='image/png'||shape.width>2048||shape.height>2048)throw bad();
 const parts=png(bytes,true).clean;const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
}
