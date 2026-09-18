import type {
  Questions,
  RequestOptions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";

/**
 * Minimal surface of the TypeSafe client that evaluation depends on.
 * `TypeSafeClient#systemOne` satisfies it structurally; the mock implements it directly.
 */
export interface JevBackend {
  readonly kind: "typesafe" | "mock";
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions,
  ): Promise<SystemOneResult<Q>>;
}
