/**
 * Client barrel export
 */

export { FigmaApiClient } from './FigmaApiClient.js';
export {
  DEFAULT_BASE_URL,
  FIGMA_TOKEN_HEADER,
  FIGMA_TOKEN_ENV_VARS,
  resolveFigmaToken,
  resolveBaseUrl,
  resolveEgress,
  egressNeedsProxyAdapter,
} from './config.js';
export type { EgressConfig } from './config.js';
