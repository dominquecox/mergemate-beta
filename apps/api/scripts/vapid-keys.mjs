/* global console, Buffer */
// Prints a new Web Push (VAPID) key pair for one environment. Writes no file and sends nothing.
//   VAPID_PUBLIC_KEY   goes in wrangler.toml [vars] (public)
//   VAPID_PRIVATE_KEY  is set with `wrangler secret put VAPID_PRIVATE_KEY --env <env>` (never commit it)
// Use a different pair for dev and production. Changing a pair later invalidates existing browser subscriptions.
import { webcrypto } from "node:crypto";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const { publicKey, privateKey } = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const jwk = await webcrypto.subtle.exportKey("jwk", privateKey);
const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey("raw", publicKey));
console.log(`VAPID_PUBLIC_KEY=${b64url(publicRaw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
