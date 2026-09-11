# figma-api-module

## Conventions

- [SSL verification contract](docs/ssl-verify-contract.md) — every httpx client in this tree
  takes a keyword-only `verify` parameter that defaults to verification on, overridable per call
  or via `FIGMA_SSL_VERIFY`.
