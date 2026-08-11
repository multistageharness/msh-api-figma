/**
 * figma-fetch - Abstract fetch client for Figma API
 *
 * Main exports for the figma-fetch module
 */

// Adapters
export {
  NativeFetchAdapter,
  ProxyTlsFetchAdapter,
  UndiciFetchAdapter,
} from "./adapters/index.js";
export type { EgressConfig } from "./client/index.js";
// Client
// Client config (token resolver + base URL + egress contract)
export {
  DEFAULT_BASE_URL,
  egressNeedsProxyAdapter,
  FIGMA_TOKEN_ENV_VARS,
  FIGMA_TOKEN_HEADER,
  FigmaApiClient,
  resolveBaseUrl,
  resolveEgress,
  resolveFigmaToken,
} from "./client/index.js";
// Core
export { FetchAdapter } from "./core/FetchAdapter.js";
// Errors
export {
  AuthenticationError,
  createErrorFromResponse,
  FigmaApiError,
  FigmaFetchError,
  isRetryableError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "./errors/index.js";
// zod boundary-validation schemas (opt-in)
export {
  FileKeySchema,
  IdSchema,
  ImageFormatSchema,
  ImageScaleSchema,
  NodeIdSchema,
  NodeIdsSchema,
  parseOrThrow,
  safeParse,
  setNodeTreeValidator,
  validateNodeTree,
} from "./schemas/index.js";
export type {
  FakeFigmaClientConfig,
  FakeRoute,
  RecordedCall,
} from "./testing/index.js";
// Testing rail (offline check + fixture-serving fake client)
export { FakeFigmaClient, isOffline } from "./testing/index.js";
// Types
export type {
  CacheConfig,
  CacheEntry,
  CacheStats,
  ClientStats,
  ErrorCode,
  ErrorInterceptor,
  FetchRequest,
  FetchResponse,
  FigmaApiClientConfig,
  FigmaErrorMeta,
  Headers,
  HealthCheckResult,
  HttpMethod,
  Logger,
  ProxyConfig,
  RateLimiterConfig,
  RateLimiterStats,
  RequestInterceptor,
  ResponseInterceptor,
  RetryConfig,
  RetryContext,
} from "./types/index.js";
// Utilities
export { RateLimiter, RequestCache, RetryHandler } from "./utils/index.js";
