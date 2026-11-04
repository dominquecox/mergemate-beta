import { startAuthentication,startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON,PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

export const passkeysAvailable=typeof window!=='undefined'&&!!window.PublicKeyCredential;
export async function createPasskeyCredential(options:Record<string,unknown>){return startRegistration({optionsJSON:options as unknown as PublicKeyCredentialCreationOptionsJSON}) as unknown as Record<string,unknown>;}
export async function getPasskeyCredential(options:Record<string,unknown>){return startAuthentication({optionsJSON:options as unknown as PublicKeyCredentialRequestOptionsJSON}) as unknown as Record<string,unknown>;}
