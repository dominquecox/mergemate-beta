import {File,Paths} from 'expo-file-system';
/** Delete only the ImagePicker copy inside this app's own cache, never a library original. */
export async function releasePickedImage(uri:string):Promise<void>{
 if(!uri.startsWith(Paths.cache.uri)||!uri.includes('/ImagePicker/'))return;
 const file=new File(uri);if(file.exists)file.delete();
}
