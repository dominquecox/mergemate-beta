export async function releasePickedImage(uri:string):Promise<void>{if(uri.startsWith('blob:'))URL.revokeObjectURL(uri);}
