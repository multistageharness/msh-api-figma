/**
 * Client barrel export
 */

export type { EgressConfig } from "./config.js";
export {
  DEFAULT_BASE_URL,
  egressNeedsProxyAdapter,
  FIGMA_TOKEN_ENV_VARS,
  FIGMA_TOKEN_HEADER,
  resolveBaseUrl,
  resolveEgress,
  resolveFigmaToken,
} from "./config.js";
export { FigmaApiClient } from "./FigmaApiClient.js";
