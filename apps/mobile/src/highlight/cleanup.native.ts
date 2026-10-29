import {File,Paths} from 'expo-file-system';
/** Delete only the ImagePicker copy inside this app's own cache, never a library original. */
export async function releasePickedImage(uri:string):Promise<void>{
 const normalized=new URL(uri).href;const prefix=new URL('ImagePicker/',Paths.cache.uri).href;
 if(!normalized.startsWith(prefix))return;
 const file=new File(normalized);if(file.exists)file.delete();
}
