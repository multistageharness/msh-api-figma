# figma-dev-resources (TypeScript)

TypeScript port of the `figma-dev-resources` package — a Node.js client, SDK, and CLI for the
Figma Dev Resources API. Ported faithfully (line-for-line) from the sibling `mjs/dev-resources`
JavaScript module; see [`../CONVENTIONS.md`](../CONVENTIONS.md) for the port rules.

## Install

```bash
npm install @internal/figma-dev-resources
```

This package depends on the abstract fetch client [`@internal/figma-api-fetch`](../figma-fetch)
(provided as a peer dependency, resolved from `file:../figma-fetch`).

## Build

```bash
npm run build      # clean + build:esm + build:cjs + rename:mjs + fix:imports
npm run typecheck  # tsc -p tsconfig.json --noEmit
```

Outputs ESM to `dist/` (`*.mjs` + `*.d.ts`) and CommonJS to `lib/` (`*.js`).

## Usage

```ts
import { FigmaApiClient } from '@internal/figma-api-fetch';
import { FigmaDevResourcesSDK } from '@internal/figma-dev-resources';

const fetcher = new FigmaApiClient({ apiToken: process.env.FIGMA_TOKEN });
const sdk = new FigmaDevResourcesSDK({ fetcher });

const resources = await sdk.getFileDevResources('FILE_KEY');
```

## CLI

```bash
figma-dev-resources get <file-key>
figma-dev-resources create <file-key> <node-id> --name "Docs" --url "https://example.com"
figma-dev-resources stats <file-key>
```

See [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) and [`EXAMPLES.md`](./EXAMPLES.md) for the full
command and method reference.

## Public surface

- `FigmaDevResourcesSDK` — high-level SDK facade (`src/sdk.ts`)
- `FigmaDevResourcesService` — business-logic layer (`src/service.ts`)
- Types — `DevResource`, `SyncResult`, `DevResourcesStats`, … (`src/types.ts`)
