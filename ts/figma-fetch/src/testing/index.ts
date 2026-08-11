/**
 * Testing rail for the Figma SDK (R8).
 *
 * Provides:
 *   - `isOffline()` — the no-token degradation check every consumer shares
 *     (no resolvable Figma token → run against fixtures instead of throwing).
 *   - `FakeFigmaClient` — a drop-in stand-in for `FigmaApiClient` that serves
 *     fixtures over the SAME generic-verb surface the services depend on
 *     (`get/post/put/delete/request/getMe/healthCheck/getStats`). Pass one as a
 *     service's `fetcher` to exercise the full service layer with zero network.
 *
 * This consolidates the three hand-rolled offline implementations the app grew
 * (`src/figma/mock.mjs`, the downloader submodule `mock.mjs`, and
 * `client.mjs:isOffline`) into one shared, tested rail.
 */

import { resolveFigmaToken } from "../client/config.js";
import { createErrorFromResponse } from "../errors/index.js";
import type { ClientStats, HealthCheckResult } from "../types/index.js";

/**
 * Whether the SDK should run in offline mode — i.e. no Figma token is resolvable
 * from config or the environment. Consumers branch on this to load fixtures
 * instead of hitting the network (preserving the no-token rail).
 */
export function isOffline(
  explicitToken?: string,
  envSource: Record<string, string | undefined> = process.env,
): boolean {
  return resolveFigmaToken(explicitToken, envSource) === "";
}

/** A recorded call against the fake client. */
export interface RecordedCall {
  method: string;
  path: string;
  params?: Record<string, any>;
  body?: any;
}

/**
 * A route handler: given the request context, returns the response payload (or
 * throws to simulate an error). Registered by `(METHOD, pathPattern)` where the
 * pattern may contain `:param` segments.
 */
export type FakeRoute = (ctx: {
  method: string;
  path: string;
  params: Record<string, any>;
  pathParams: Record<string, string>;
  body?: any;
}) => any;

export interface FakeFigmaClientConfig {
  /** A fake authenticated user returned by `getMe()` / `GET /v1/me`. */
  user?: any;
  /** Fixture file documents keyed by file key (served by `GET /v1/files/:key`). */
  files?: Record<string, any>;
  /** Image-render URLs keyed by node id (served by `GET /v1/images/:key`). */
  images?: Record<string, string | null>;
  /** Custom route overrides, keyed by `"<METHOD> <pathPattern>"`. */
  routes?: Record<string, FakeRoute>;
  /** Default response for any unmatched route (defaults to `{}`). */
  fallback?: any;
}

/** Compile a `/v1/files/:key` style pattern into a matcher. */
function matchPattern(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const pSeg = pattern.split("/").filter(Boolean);
  const aSeg = path.split("/").filter(Boolean);
  if (pSeg.length !== aSeg.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i++) {
    if (pSeg[i].startsWith(":")) {
      out[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i]);
    } else if (pSeg[i] !== aSeg[i]) {
      return null;
    }
  }
  return out;
}

const DEFAULT_USER = {
  id: "fake-user",
  handle: "offline",
  email: "offline@example.test",
};

/**
 * Offline/fixture stand-in for `FigmaApiClient`. Mirrors the public verb surface
 * the SDK services rely on, so it can be injected as a `fetcher`.
 */
export class FakeFigmaClient {
  readonly calls: RecordedCall[] = [];
  private user: any;
  private files: Record<string, any>;
  private images: Record<string, string | null>;
  private routes: Record<string, FakeRoute>;
  private fallback: any;
  private stats: ClientStats;

  constructor(config: FakeFigmaClientConfig = {}) {
    this.user = config.user ?? DEFAULT_USER;
    this.files = config.files ?? {};
    this.images = config.images ?? {};
    this.routes = config.routes ?? {};
    this.fallback = config.fallback ?? {};
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedResponses: 0,
      retries: 0,
      avgResponseTime: 0,
      lastRequestTime: null,
    };
  }

  /** Register or replace a route handler at runtime. */
  setRoute(method: string, pattern: string, handler: FakeRoute): this {
    this.routes[`${method.toUpperCase()} ${pattern}`] = handler;
    return this;
  }

  private dispatch(
    method: string,
    rawPath: string,
    params: Record<string, any>,
    body?: any,
  ): any {
    this.stats.totalRequests++;
    this.stats.lastRequestTime = new Date().toISOString();
    const [path] = rawPath.split("?");
    this.calls.push({ method, path, params, body });

    // 1. Explicit custom routes win.
    for (const key of Object.keys(this.routes)) {
      const [rMethod, rPattern] = key.split(" ");
      if (rMethod !== method) continue;
      const pathParams = matchPattern(rPattern, path);
      if (pathParams) {
        this.stats.successfulRequests++;
        return this.routes[key]({ method, path, params, pathParams, body });
      }
    }

    // 2. Built-in defaults for the common endpoints.
    const built = this.builtinRoute(method, path, params);
    if (built !== undefined) {
      this.stats.successfulRequests++;
      return built;
    }

    // 3. Fallback.
    this.stats.successfulRequests++;
    return this.fallback;
  }

  private builtinRoute(
    method: string,
    path: string,
    _params: Record<string, any>,
  ): any {
    if (method === "GET") {
      if (matchPattern("/v1/me", path)) return this.user;

      const file = matchPattern("/v1/files/:key", path);
      if (file) {
        const doc = this.files[file.key];
        if (doc === undefined) {
          throw createErrorFromResponse({
            status: 404,
            statusText: "Not Found",
            url: path,
          });
        }
        return doc;
      }

      const img = matchPattern("/v1/images/:key", path);
      if (img) return { err: null, images: this.images };
    }
    return undefined;
  }

  // --- Generic verb surface (matches FigmaApiClient) ---

  async request<T = any>(path: string, options: any = {}): Promise<T> {
    const method = options.method || "GET";
    const body = options.body ? safeJsonParse(options.body) : undefined;
    return this.dispatch(method, path, {}, body) as T;
  }

  async get<T = any>(
    path: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    return this.dispatch("GET", path, params) as T;
  }

  async post<T = any>(path: string, data: any = {}): Promise<T> {
    return this.dispatch("POST", path, {}, data) as T;
  }

  async put<T = any>(path: string, data: any = {}): Promise<T> {
    return this.dispatch("PUT", path, {}, data) as T;
  }

  async patch<T = any>(path: string, data: any = {}): Promise<T> {
    return this.dispatch("PATCH", path, {}, data) as T;
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.dispatch("DELETE", path, {}) as T;
  }

  async getMe<T = any>(): Promise<T> {
    return this.dispatch("GET", "/v1/me", {}) as T;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      status: "healthy",
      latencyMs: 0,
      user: this.user,
      timestamp: new Date().toISOString(),
    };
  }

  getStats(): ClientStats {
    return { ...this.stats };
  }

  reset(): void {
    this.calls.length = 0;
  }
}

function safeJsonParse(value: any): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export default FakeFigmaClient;
