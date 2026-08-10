# figma-webhooks (TypeScript)

TypeScript port of the `figma-webhooks` package — a Node.js client + SDK for the
Figma Webhooks API v2. Ported faithfully (line-for-line) from `../../mjs/webhooks`.

## Install

```bash
npm install figma-webhooks @figma-api/fetch
```

`@figma-api/fetch` is a peer dependency (resolves to `../figma-fetch` in this workspace).

## Usage

```ts
import { FigmaApiClient } from '@figma-api/fetch';
import { FigmaWebhooksSDK } from 'figma-webhooks';

const fetcher = new FigmaApiClient({ apiToken: process.env.FIGMA_TOKEN });
const sdk = new FigmaWebhooksSDK({ fetcher });

// Create a file-update webhook
const webhook = await sdk.createFileWebhook({
  fileKey: 'abc123',
  endpoint: 'https://example.com/hook',
  passcode: 's3cr3t'
});

// List webhooks for a context
const webhooks = await sdk.listWebhooks({ context: 'team', contextId: 'TEAM_ID' });

// Health-check a webhook's recent deliveries
const health = await sdk.checkWebhookHealth(webhook.id);
```

### Errors

```ts
import {
  WebhookError,
  WebhookAuthError,
  WebhookValidationError,
  WebhookRateLimitError
} from 'figma-webhooks/errors';
```

## CLI

The package ships a `figma-webhooks` binary (built to `lib/cli.js`):

```bash
figma-webhooks list --plan PLAN_API_ID
figma-webhooks get <webhook-id>
figma-webhooks create -e FILE_UPDATE -c file -i <fileKey> -u https://example.com/hook -p s3cr3t
figma-webhooks update <webhook-id> --status PAUSED
figma-webhooks delete <webhook-id> --force
figma-webhooks pause <webhook-id>
figma-webhooks activate <webhook-id>
figma-webhooks history <webhook-id>
figma-webhooks health <webhook-id>
figma-webhooks test-endpoint <url>
figma-webhooks search --plan PLAN_API_ID --inactive
figma-webhooks info
figma-webhooks bulk-create --file webhooks.json
```

Provide the token via `--token` or the `FIGMA_TOKEN` environment variable.

## Health-check server

```bash
node dist/health-check-server.mjs
# or, CJS build:
node lib/health-check-server.js
```

Runs a Fastify server (default port `3009`, override with `PORT`) exposing
`/`, `/test`, and example webhook routes.

## Build

```bash
npm run build      # clean + build:esm (dist/) + build:cjs (lib/) + rename:mjs + fix:imports
npm run typecheck  # tsc -p tsconfig.json --noEmit
```

ESM output lands in `dist/` (`.mjs` + `.d.ts`); CJS output in `lib/` (`.js`).

## API surface

- `FigmaWebhooksSDK` (default export of `./sdk`) — webhook management, monitoring,
  bulk operations, discovery, and convenience helpers.
- `WebhookError`, `WebhookAuthError`, `WebhookValidationError`, `WebhookRateLimitError`.
- `VERSION` — package version string.
