import { ModelRisk, ModelSummary } from "@mergemate/contracts";
import { z } from "zod";

const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete out["$schema"];
  return out;
};

/** JSON Schemas sent to providers with a native JSON mode. Answers are still validated with the zod schemas. */
export const SUMMARY_JSON_SCHEMA = jsonSchemaOf(ModelSummary);
export const RISK_JSON_SCHEMA = jsonSchemaOf(ModelRisk);
