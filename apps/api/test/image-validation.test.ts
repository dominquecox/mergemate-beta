import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,it,expect} from 'vitest';
import {inspectImage,stripPngMetadata} from '../src/images/validate';
import {normalizeHighlight} from '../src/images/normalize';
import {fixtureImages,imagePng,pngChunk} from './image-fixtures';
describe('private screenshot preprocessing',()=>{
 it.each(['metadata.jpg','metadata.webp','pixels.png'])('accepts a real decoded-format fixture %s and strips all output metadata',async(name)=>{
  const bytes=new Uint8Array(readFileSync(join(import.meta.dirname,'fixtures/highlight',name)));expect(inspectImage(bytes)).toMatchObject({width:32,height:16});
  const clean=await normalizeHighlight(fixtureImages(imagePng()),bytes);expect(new TextDecoder().decode(clean)).not.toContain('PRIVATE_EXIF_FIXTURE');
 });
 it('accepts complete PNG and removes metadata from re-encoded pixels',async()=>{const original=imagePng(1,1,'GPS_PRIVATE_FIXTURE'),clean=await normalizeHighlight(fixtureImages(imagePng(1,1,'EXIF_PRIVATE_FIXTURE')),original);expect(inspectImage(clean)).toEqual({type:'image/png',width:1,height:1});expect(new TextDecoder().decode(clean)).not.toMatch(/GPS_PRIVATE|EXIF_PRIVATE|tEXt/);});
 it('rejects truncation, CRC corruption, trailing polyglot bytes and animations',()=>{
  const bytes=imagePng();const corrupt=bytes.slice();corrupt[20]=(corrupt[20]??0)^1;
  const trailing=new Uint8Array(bytes.length+8);trailing.set(bytes);trailing.set(new TextEncoder().encode('<script>'),bytes.length);
  const animation=new Uint8Array(bytes.length+20);animation.set(bytes.subarray(0,33));animation.set(pngChunk('acTL',new Uint8Array(8)),33);animation.set(bytes.subarray(33),53);
  for(const image of [bytes.slice(0,-4),corrupt,trailing,animation,new TextEncoder().encode('<svg/>')])expect(()=>inspectImage(image)).toThrow();
 });
 it('bounds bytes, dimensions and pixel count before calling a decoder',()=>{for(const bytes of [imagePng(8193,1),imagePng(8192,8192),new Uint8Array(5*1024*1024+1)])expect(()=>inspectImage(bytes)).toThrow();});
 it('never falls back to original bytes without a decoder and rejects wrong output',async()=>{
  await expect(normalizeHighlight(undefined,imagePng())).rejects.toMatchObject({code:'upstream_unavailable'});
  await expect(normalizeHighlight(fixtureImages(new Uint8Array([1,2])),imagePng())).rejects.toMatchObject({code:'validation_failed'});
  expect(()=>stripPngMetadata(imagePng(2049,1))).toThrow();
 });
 it('refuses decoder failure and never invokes a hosted upload API',async()=>{const images=fixtureImages();images.info=async()=>{throw {code:9412};};await expect(normalizeHighlight(images,imagePng())).rejects.toMatchObject({code:'validation_failed'});});
 it('rejects fake JPEG/WebP signatures instead of forwarding unsupported bytes',()=>{for(const bytes of [new Uint8Array([255,216,255,217]),new TextEncoder().encode('RIFF1234WEBPpayload')])expect(()=>inspectImage(bytes)).toThrow();});
});
