import type { Context } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "../errors";
import { appEnv } from "../config";
import { sha256Hex } from "../lib/crypto";
import type { AdmissionScope } from "../rate-policy";

interface LimitOptions { scope: AdmissionScope; key: string }
const unavailable = () => new ApiError("rate_limit_unavailable", "MergeMate is temporarily unavailable. Try again shortly.", {"retry-after":"1"});

/** Authoritative global admission; absence, failure, timeout or invalid replies never fail open. */
export const limit = async (c: Context<AppEnv>, options: LimitOptions) => {
  if(!c.env.RATE_ADMISSION)throw unavailable();
  const name=`${options.scope}:${await sha256Hex(`${appEnv(c.env)}:${options.scope}:${options.key}`)}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result=await Promise.race([
      c.env.RATE_ADMISSION.getByName(name).admit(options.scope),
      new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(unavailable()),2000);}),
    ]);
    if(typeof result?.success!=="boolean" || !Number.isSafeInteger(result.retryAfter) || result.retryAfter<0 || result.retryAfter>60 || (result.success?result.retryAfter!==0:result.retryAfter<1))throw unavailable();
    if(!result.success)throw new ApiError("rate_limited","Too many requests. Try again shortly.",{"retry-after":String(result.retryAfter)});
  } catch(error) {
    if(error instanceof ApiError && error.code==='rate_limited')throw error;
    throw unavailable();
  } finally { if(timer!==undefined)clearTimeout(timer); }
};

export const clientIp = (c: Context<AppEnv>) => c.req.header("cf-connecting-ip") ?? "unknown";
