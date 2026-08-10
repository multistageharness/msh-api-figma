/**
 * Centralized client configuration (R3 + R2).
 *
 * One place owns the Figma base URL, the auth header name, the token-resolution
 * chain, and the proxy/TLS egress contract. Every other module (the client, the
 * adapters, downstream packages) reads these instead of hard-coding
 * `https://api.figma.com`, `X-Figma-Token`, or a one-off `process.env.FIGMA_TOKEN`
 * lookup. This kills the divergent token chains and the dropped-`FIGMA_ACCESS_TOKEN`
 * bug called out in the gap analysis.
 */

/** Canonical Figma REST base URL. */
export const DEFAULT_BASE_URL = 'https://api.figma.com';

/** The personal-access-token header Figma expects. */
export const FIGMA_TOKEN_HEADER = 'X-Figma-Token';

/**
 * Accepted environment variable names for the Figma personal access token, in
 * precedence order. `FIGMA_ACCESS_TOKEN` is included so the SDK matches every
 * call site in the app (the canonical app accessor previously dropped it).
 */
export const FIGMA_TOKEN_ENV_VARS = [
  'FIGMA_TOKEN',
  'FIGMA_API_TOKEN',
  'FIGMA_ACCESS_TOKEN',
] as const;

/**
 * Resolve the Figma token from an explicit value, falling back to the accepted
 * env vars in precedence order. Returns '' when none is set (the offline rail
 * keys off the empty string rather than a throw).
 *
 * @param explicit - An explicitly provided token (e.g. config.apiToken)
 * @param envSource - Environment object to read from (defaults to process.env)
 */
export function resolveFigmaToken(
  explicit?: string,
  envSource: Record<string, string | undefined> = process.env
): string {
  if (explicit) return explicit;
  for (const name of FIGMA_TOKEN_ENV_VARS) {
    const value = envSource[name];
    if (value) return value;
  }
  return '';
}

/**
 * Resolve the API base URL from an explicit value, falling back to
 * `FIGMA_API_BASE_URL` then the canonical default.
 */
export function resolveBaseUrl(
  explicit?: string,
  envSource: Record<string, string | undefined> = process.env
): string {
  return (explicit || envSource.FIGMA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * The app egress contract (R2): a proxy URL and a TLS-verification toggle. An
 * empty proxy normalizes to `null` so callers can branch on it directly.
 */
export interface EgressConfig {
  proxy: string | null;
  sslVerify: boolean;
}

/** Parse a boolean-ish env value; absent → default. */
function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return !/^(0|false|no|off)$/i.test(value.trim());
}

/**
 * Resolve the proxy/TLS egress settings, honoring the app's
 * `FIGMA_PROXY_URL` + `FIGMA_SSL_VERIFY` contract. Explicit config wins over env.
 *
 * @param explicit - { proxyUrl?, sslVerify? } from client config
 * @param envSource - Environment object to read from (defaults to process.env)
 */
export function resolveEgress(
  explicit: { proxyUrl?: string | null; sslVerify?: boolean } = {},
  envSource: Record<string, string | undefined> = process.env
): EgressConfig {
  const proxy =
    explicit.proxyUrl !== undefined
      ? explicit.proxyUrl || null
      : envSource.FIGMA_PROXY_URL || null;

  const sslVerify =
    explicit.sslVerify !== undefined
      ? explicit.sslVerify
      : parseBoolEnv(envSource.FIGMA_SSL_VERIFY, true);

  return { proxy, sslVerify };
}

/**
 * Whether the egress contract requires the proxy/TLS-aware transport (a proxy is
 * set, or TLS verification has been explicitly disabled). The default native
 * path can't do either.
 */
export function egressNeedsProxyAdapter(egress: EgressConfig): boolean {
  return !!egress.proxy || egress.sslVerify === false;
}
