import { TypeSafeClient, type TypeSafeClientConfig } from "@typesafe-ai/sdk";
import type { JevBackend } from "./backend";

export const DEFAULT_MODEL = "jev-latest";

/**
 * Wraps the official SDK. The API key comes from `config.apiKey` or the
 * `TYPESAFE_API_KEY` environment variable; it is never read from files.
 * Retries (429/5xx, backoff) are handled by the SDK's RetryPolicy.
 */
export function createTypeSafeBackend(config: TypeSafeClientConfig = {}): JevBackend {
  const client = new TypeSafeClient({ defaultModel: DEFAULT_MODEL, ...config });
  return {
    kind: "typesafe",
    systemOne: (request, options) => client.systemOne(request, options),
  };
}
