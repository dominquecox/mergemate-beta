import { ApiClient } from "./client";
import { MockApiClient } from "./mock";

// Default to the comprehensive mock client so screens work before the real API lands
export const api: ApiClient = new MockApiClient();
export * from "./client";
export * from "./mock";
