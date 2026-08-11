/**
 * Proxy + TLS-aware fetch adapter (R2).
 *
 * A zero-dependency transport built on Node's http/https/tls modules — the SDK
 * port of the app's `makeNodeFetch` (donor:
 * components/tools-figma-downloader/.../httpFetch.mjs). It exists for the two
 * things the global/undici `fetch` can't do without extra config:
 *
 *   • route requests through an HTTP/HTTPS proxy (CONNECT tunnel for https), and
 *   • toggle TLS certificate verification (rejectUnauthorized).
 *
 * Unlike the GET-only donor, this adapter forwards an arbitrary method + body so
 * the write-heavy domains (variables, webhooks) work through a proxy too. It is
 * installed only when the egress contract (`FIGMA_PROXY_URL` / `FIGMA_SSL_VERIFY`)
 * actually requires it; the default path stays on native/undici fetch.
 */

import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import type { EgressConfig } from "../client/config.js";
import { FetchAdapter } from "../core/FetchAdapter.js";
import { NetworkError, TimeoutError } from "../errors/index.js";
import type { FetchRequest, FetchResponse } from "../types/index.js";

/** Convert a request body to a Buffer the node http layer can write. */
function bodyToBuffer(body: FetchRequest["body"]): Buffer | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (Buffer.isBuffer(body)) return body as unknown as Buffer;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  // Fallback: stringify anything else (FormData/Blob are not expected on this path).
  return Buffer.from(String(body), "utf8");
}

export class ProxyTlsFetchAdapter extends FetchAdapter {
  private proxyUrl: URL | null;
  private sslVerify: boolean;

  constructor(egress: Partial<EgressConfig> = {}) {
    super();
    this.proxyUrl = egress.proxy ? new URL(egress.proxy) : null;
    this.sslVerify = egress.sslVerify !== false;
  }

  async fetch<T = any>(request: FetchRequest): Promise<FetchResponse<T>> {
    const transformed = this.transformRequest(request);
    const {
      url: urlStr,
      method = "GET",
      headers = {},
      body,
      timeout,
    } = transformed;
    const bodyBuf = bodyToBuffer(body);

    // Honor the request timeout by wiring an AbortController, mirroring how the
    // native/undici adapters surface a TimeoutError.
    const controller = new AbortController();
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;
    if (timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);
    }
    const signal = transformed.signal || controller.signal;

    try {
      const raw = await this.nodeFetch(urlStr, {
        method,
        headers,
        body: bodyBuf,
        signal,
      });
      const contentType = raw.headers.get("content-type");
      const data = await this.parseResponseData(raw, contentType);
      const fetchResponse: FetchResponse<T> = {
        status: raw.status,
        statusText: raw.statusText,
        headers: raw.headersObject,
        data,
        ok: raw.ok,
      };
      return this.transformResponse(fetchResponse);
    } catch (error: any) {
      if (timedOut || error?.name === "AbortError") {
        throw new TimeoutError(timeout || 30000);
      }
      throw new NetworkError(error?.message || "Network request failed", error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Low-level fetch over node http/https with optional proxy + TLS toggle.
   * Resolves a minimal Response-like object the adapter normalizes above.
   */
  private nodeFetch(
    urlStr: string,
    opts: {
      method: string;
      headers: Record<string, string>;
      body: Buffer | null;
      signal?: AbortSignal;
    },
  ): Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: { get: (n: string) => string | null };
    headersObject: Record<string, string>;
    json: () => Promise<any>;
    text: () => Promise<string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
  }> {
    const proxyUrl = this.proxyUrl;
    const sslVerify = this.sslVerify;
    const { method, headers, body, signal } = opts;

    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(urlStr);
      } catch (err) {
        reject(err);
        return;
      }
      const isHttps = url.protocol === "https:";

      let settled = false;
      let req: http.ClientRequest | null = null;
      const cleanup = () => {
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const succeed = (val: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(val);
      };
      function onAbort() {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        try {
          req?.destroy(err);
        } catch {
          /* ignore */
        }
        fail(err);
      }
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const collect = (res: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          const status = res.statusCode || 0;
          const headersObject: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            headersObject[k] = Array.isArray(v)
              ? v.join(", ")
              : String(v ?? "");
          }
          succeed({
            ok: status >= 200 && status < 300,
            status,
            statusText: res.statusMessage || "",
            headers: {
              get: (n: string) =>
                (res.headers[String(n).toLowerCase()] as string) ?? null,
            },
            headersObject,
            text: async () => text,
            json: async () => JSON.parse(text),
            arrayBuffer: async () =>
              buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
          });
        });
        res.on("error", fail);
      };

      const sendBody = (request: http.ClientRequest) => {
        if (body) request.write(body);
        request.end();
      };

      // --- Direct (no proxy). ---
      if (!proxyUrl) {
        const mod = isHttps ? https : http;
        const reqOpts: https.RequestOptions = {
          method,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          headers,
        };
        if (isHttps) reqOpts.rejectUnauthorized = sslVerify;
        req = mod.request(reqOpts, collect);
        req.on("error", fail);
        sendBody(req);
        return;
      }

      // --- Through a proxy. ---
      const proxyIsHttps = proxyUrl.protocol === "https:";
      const proxyAuth = proxyUrl.username
        ? "Basic " +
          Buffer.from(
            `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`,
          ).toString("base64")
        : null;

      if (!isHttps) {
        // HTTP target through the proxy: absolute-form request URI.
        const mod = proxyIsHttps ? https : http;
        const h: Record<string, string> = { ...headers, Host: url.host };
        if (proxyAuth) h["Proxy-Authorization"] = proxyAuth;
        const reqOpts: https.RequestOptions = {
          method,
          hostname: proxyUrl.hostname,
          port: proxyUrl.port || (proxyIsHttps ? 443 : 80),
          path: url.href,
          headers: h,
        };
        if (proxyIsHttps) reqOpts.rejectUnauthorized = sslVerify;
        req = mod.request(reqOpts, collect);
        req.on("error", fail);
        sendBody(req);
        return;
      }

      // HTTPS target through the proxy: CONNECT tunnel, then TLS over the socket.
      const connMod = proxyIsHttps ? https : http;
      const targetPort = Number(url.port) || 443;
      const connHeaders: Record<string, string> = {};
      if (proxyAuth) connHeaders["Proxy-Authorization"] = proxyAuth;
      const connectReq = connMod.request({
        method: "CONNECT",
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || (proxyIsHttps ? 443 : 80),
        path: `${url.hostname}:${targetPort}`,
        headers: connHeaders,
        ...(proxyIsHttps ? { rejectUnauthorized: sslVerify } : {}),
      });
      req = connectReq;
      connectReq.on("error", fail);
      connectReq.on("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          fail(
            new Error(
              `proxy CONNECT to ${url.hostname}:${targetPort} failed: HTTP ${res.statusCode}`,
            ),
          );
          return;
        }
        const tlsSocket = tls.connect({
          socket,
          servername: url.hostname,
          rejectUnauthorized: sslVerify,
        });
        tlsSocket.on("error", fail);
        const innerReq = https.request(
          {
            method,
            hostname: url.hostname,
            port: targetPort,
            path: url.pathname + url.search,
            headers,
            createConnection: () => tlsSocket,
          },
          collect,
        );
        req = innerReq;
        innerReq.on("error", fail);
        sendBody(innerReq);
      });
      connectReq.end();
    });
  }
}

export default ProxyTlsFetchAdapter;
