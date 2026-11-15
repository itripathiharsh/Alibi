/**
 * ALIBI Generated API Client
 * Built on openapi-fetch and auto-generated OpenAPI TypeScript schema.
 */

import createFetchClient, { type ClientOptions } from "openapi-fetch";
import type { paths, operations, components } from "./schema.js";

export type { paths, operations, components };
export type ApiClient = ReturnType<typeof createApiClient>;

export interface ApiClientConfig extends Omit<ClientOptions, "baseUrl"> {
  baseUrl: string;
}

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, ...options } = config;
  const client = createFetchClient<paths>({
    baseUrl,
    ...options,
  });

  return client;
}

export default createApiClient;
