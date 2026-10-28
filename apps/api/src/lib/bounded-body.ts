import { ApiError } from "../errors";

/** Bound bytes actually read, regardless of absent or misleading Content-Length. */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const tooLarge = () => new ApiError("payload_too_large", "Payload is too large.");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    await request.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  // A single bounded allocation also avoids per-chunk memory growth for tiny chunks.
  const result = new Uint8Array(maxBytes);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      result.set(value, length - value.byteLength);
    }
  } finally {
    reader.releaseLock();
  }
  return result.buffer.slice(0, length);
}
