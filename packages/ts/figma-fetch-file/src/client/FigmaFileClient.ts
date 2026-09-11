/**
 * FigmaFileClient — the three file-domain endpoints the chunked downloader
 * needs, composed over `FigmaApiClient` (which supplies transport, auth,
 * retry, timeout and error handling; nothing is re-implemented here):
 *
 *   1. fetchSkeleton  — GET /v1/files/:key?depth=N   (shallow tree: the frame
 *                       at which to split, with no deep children)
 *   2. fetchNodes     — GET /v1/files/:key/nodes?ids= (full subtree for a
 *                       batch of node ids)
 *   3. fetchWholeFile — GET /v1/files/:key            (the `sm` fast path)
 *
 * URL-construction decision (pinned by tests): query strings are built BY HAND,
 * exactly as the downloader's `figmaClient.mjs` builds them —
 * `ids.map(encodeURIComponent).join(",")` keeps the comma LITERAL, where
 * `URLSearchParams` (what `FigmaApiClient.get` uses) would emit `%2C`. Figma
 * accepts both, but the downloader's mock splits `ids` on the literal comma and
 * "different URL" is the first suspect if the cross-language parity gate ever
 * diverges, so the emitted URLs are kept byte-identical to the code being
 * replaced.
 */

import {
  type FetchRequest,
  FigmaApiClient,
  type FigmaApiClientConfig,
  FileKeySchema,
  NodeIdsSchema,
  parseOrThrow,
} from "@internal/figma-api-fetch";

/**
 * The download profile the chunked downloader has always used, expressible
 * since the Epic 01 hardening: deterministic 0.5s→15s doubling backoff with no
 * jitter, timeouts retried (a timeout is the EXPECTED transient failure when
 * pulling a deep subtree), Retry-After honoured by the retry layer.
 */
export const DOWNLOAD_RETRY_PROFILE = {
  maxRetries: 3,
  initialDelay: 500,
  backoffFactor: 2,
  maxDelay: 15_000,
  jitterFactor: 0,
  retryTimeouts: true,
} as const;

/** Default per-request timeout, matching the downloader's `figmaGet`. */
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface FigmaFileClientConfig extends FigmaApiClientConfig {
  /** Retries for transient failures (429/5xx/network/timeout). Default 3. */
  retries?: number;
  /** Per-request timeout in ms. Default 60,000. Alias for `timeout`. */
  timeoutMs?: number;
}

/** Per-call options shared by the three endpoints. */
export interface FileFetchOptions {
  /** `true` → append `geometry=paths`. */
  geometry?: boolean;
  /** A specific file version id. */
  version?: string;
  /** Per-call timeout override in ms. */
  timeoutMs?: number;
  /** Per-call cancellation. */
  signal?: AbortSignal;
}

export interface SkeletonOptions extends FileFetchOptions {
  /** Truncation depth: 1 = pages, 2 = pages + top frames. Default 2. */
  depth?: number;
}

export interface NodesOptions extends FileFetchOptions {
  /** Subtree truncation depth for `/nodes` (absent = full subtrees). */
  nodeDepth?: number;
}

export class FigmaFileClient {
  /** The composed transport client — exposed for stats and health checks. */
  public readonly client: FigmaApiClient;

  constructor(config: FigmaFileClientConfig = {}) {
    const { retries, timeoutMs, retry, timeout, ...rest } = config;
    this.client = new FigmaApiClient({
      ...rest,
      timeout: timeout ?? timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retry: {
        ...DOWNLOAD_RETRY_PROFILE,
        ...(retries !== undefined ? { maxRetries: retries } : {}),
        ...retry,
      },
    });
  }

  /** Translate per-call options into the generic request options. */
  private callOptions(opts: FileFetchOptions): Partial<FetchRequest> {
    const options: Partial<FetchRequest> = { method: "GET" };
    if (opts.timeoutMs !== undefined) options.timeout = opts.timeoutMs;
    if (opts.signal) options.signal = opts.signal;
    return options;
  }

  /**
   * Fetch the shallow file "skeleton": the document tree truncated at `depth`.
   * depth=1 → pages only; depth=2 → pages + their top-level frames (no
   * children). The truncation frontier (nodes at `depth`) is what is then
   * fetched in full.
   */
  async fetchSkeleton<T = any>(
    fileKey: string,
    opts: SkeletonOptions = {},
  ): Promise<T> {
    const key = parseOrThrow(FileKeySchema, fileKey, "fileKey");
    const depth = opts.depth ?? 2;
    const geometry = opts.geometry ? `&geometry=paths` : "";
    const version = opts.version
      ? `&version=${encodeURIComponent(opts.version)}`
      : "";
    return this.client.request<T>(
      `/v1/files/${encodeURIComponent(key)}?depth=${depth}${geometry}${version}`,
      this.callOptions(opts),
    );
  }

  /**
   * Fetch the entire file in one request (the `sm` fast path; no chunking).
   * With neither `geometry` nor `version` set the path carries no query string
   * at all.
   */
  async fetchWholeFile<T = any>(
    fileKey: string,
    opts: FileFetchOptions = {},
  ): Promise<T> {
    const key = parseOrThrow(FileKeySchema, fileKey, "fileKey");
    const params: string[] = [];
    if (opts.geometry) params.push("geometry=paths");
    if (opts.version)
      params.push(`version=${encodeURIComponent(opts.version)}`);
    const query = params.length ? `?${params.join("&")}` : "";
    return this.client.request<T>(
      `/v1/files/${encodeURIComponent(key)}${query}`,
      this.callOptions(opts),
    );
  }

  /**
   * Fetch the full subtree for a batch of node ids. An empty `ids` array
   * short-circuits to `{ nodes: {} }` with no request issued.
   *
   * Node ids are validated with `NodeIdsSchema` (digits + colons, e.g.
   * `1:100`) — every id in the shared fixture
   * (`msh-sdk-figma-downloader/v300/packages/shared/fixtures/mock-file.json`)
   * conforms, so validation adds safety without breaking the mock rail.
   */
  async fetchNodes<T = any>(
    fileKey: string,
    ids: string[],
    opts: NodesOptions = {},
  ): Promise<T> {
    const key = parseOrThrow(FileKeySchema, fileKey, "fileKey");
    if (!ids?.length) return { nodes: {} } as T;
    const validIds = parseOrThrow(NodeIdsSchema, ids, "ids");
    // Literal-comma join — see the module docstring for why this must not
    // become URLSearchParams.
    const idsParam = validIds.map(encodeURIComponent).join(",");
    const geometry = opts.geometry ? `&geometry=paths` : "";
    const depthQ = opts.nodeDepth ? `&depth=${opts.nodeDepth}` : "";
    const version = opts.version
      ? `&version=${encodeURIComponent(opts.version)}`
      : "";
    return this.client.request<T>(
      `/v1/files/${encodeURIComponent(key)}/nodes?ids=${idsParam}${depthQ}${geometry}${version}`,
      this.callOptions(opts),
    );
  }
}

export default FigmaFileClient;
