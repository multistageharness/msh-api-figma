/**
 * figma-fetch-file — the Figma file-download domain.
 *
 * Composes `FigmaApiClient` (from `@internal/figma-api-fetch`) into the three
 * file endpoints plus the chunked large-file download engine:
 * skeleton → frontier → batched `/nodes` → adaptive re-chunking, with a sink
 * callback seam so disk writing stays with the consumer.
 */

export type {
  ChunkDownloadResult,
  ChunkPart,
  ChunkSink,
  DownloadChunksOptions,
  GroupMeta,
  Limiter,
  PartMeta,
  ResumedGroup,
  ResumeQuery,
  TokenBucket,
} from "./chunk/index.js";
// Chunk engine
export {
  batch,
  byteLength,
  ChunkBatchError,
  collectFrontierIds,
  countNodes,
  downloadChunks,
  escapeLineSeparators,
  pad,
  pool,
  sha256OfBatch,
  sleep,
  stringify,
  tokenBucket,
} from "./chunk/index.js";
export type {
  FigmaFileClientConfig,
  FileFetchOptions,
  NodesOptions,
  SkeletonOptions,
} from "./client/index.js";
// Client
export {
  DEFAULT_TIMEOUT_MS,
  DOWNLOAD_RETRY_PROFILE,
  FigmaFileClient,
} from "./client/index.js";
export type {
  ResolvedStrategy,
  ResolveStrategyOptions,
  SizeSignals,
  Tier,
  TierBounds,
  TierPreset,
} from "./sizing/index.js";
// Sizing
export {
  classify,
  DEFAULT_THRESHOLDS,
  PRESETS,
  resolveStrategy,
  TIERS,
} from "./sizing/index.js";
// Testing rail
export { FixtureFetchAdapter } from "./testing/index.js";
// SDK facade — re-exported so a consumer of the file-download domain (e.g. the
// chunked downloader CLI) needs exactly one dependency. These are
// `@internal/figma-api-fetch`'s canonical symbols, unchanged.
export {
  AuthenticationError,
  FigmaApiClient,
  FigmaApiError,
  FigmaFetchError,
  isRetryableError,
  NativeFetchAdapter,
  NetworkError,
  NotFoundError,
  parseFileKey,
  ProxyTlsFetchAdapter,
  RateLimitError,
  redactProxy,
  resolveFigmaToken,
  ServerError,
  TimeoutError,
  ValidationError,
} from "@internal/figma-api-fetch";
export type { RetryEvent } from "@internal/figma-api-fetch";
