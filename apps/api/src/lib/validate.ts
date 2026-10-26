import type { Context } from "hono";
import type { z } from "zod";
import { ApiError } from "../errors";

/** Parses a JSON body against a contract schema; anything else is `validation_failed`. */
export const parseBody = async <T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> => {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError("validation_failed", "The request is not valid.");
  return result.data;
};

export const parseValue = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("validation_failed", "The request is not valid.");
  return result.data;
};
