import { createApiClient } from "@alibi/api-client";

export const api = createApiClient({
  baseUrl: typeof window !== "undefined" ? window.location.origin : "http://localhost:8000",
});

export default api;

