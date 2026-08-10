/**
 * figma-fetch - Abstract fetch client for Figma API
 *
 * Main exports for the figma-fetch module
 */

// Core
export { FetchAdapter } from './core/FetchAdapter.js';

// Adapters
export { NativeFetchAdapter, UndiciFetchAdapter, ProxyTlsFetchAdapter } from './adapters/index.js';

// Client
export { FigmaApiClient } from './client/index.js';

// Client config (token resolver + base URL + egress contract)
export {
  DEFAULT_BASE_URL,
  FIGMA_TOKEN_HEADER,
  FIGMA_TOKEN_ENV_VARS,
  resolveFigmaToken,
  resolveBaseUrl,
  resolveEgress,
  egressNeedsProxyAdapter,
} from './client/index.js';
export type { EgressConfig } from './client/index.js';

// Utilities
export { RateLimiter, RequestCache, RetryHandler } from './utils/index.js';

// Errors
export {
  FigmaFetchError,
  FigmaApiError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ServerError,
  createErrorFromResponse,
  isRetryableError,
} from './errors/index.js';

// Testing rail (offline check + fixture-serving fake client)
export { FakeFigmaClient, isOffline } from './testing/index.js';
export type { FakeFigmaClientConfig, FakeRoute, RecordedCall } from './testing/index.js';

// zod boundary-validation schemas (opt-in)
export {
  FileKeySchema,
  NodeIdSchema,
  NodeIdsSchema,
  ImageScaleSchema,
  ImageFormatSchema,
  IdSchema,
  parseOrThrow,
  safeParse,
  setNodeTreeValidator,
  validateNodeTree,
} from './schemas/index.js';

// Types
export type {
  HttpMethod,
  Headers,
  FetchRequest,
  FetchResponse,
  Logger,
  RateLimiterConfig,
  RateLimiterStats,
  CacheConfig,
  CacheStats,
  CacheEntry,
  RetryConfig,
  RetryContext,
  ProxyConfig,
  FigmaApiClientConfig,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  ClientStats,
  HealthCheckResult,
  FigmaErrorMeta,
  ErrorCode,
} from './types/index.js';
