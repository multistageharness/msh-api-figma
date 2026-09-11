/**
 * Sizing — make the download work for a file of ANY size: sm / md / large /
 * xl / xxxxl. A faithful port of the downloader's `sizing.mjs`.
 *
 * Seam decision (plan Story 02/03/03): the whole module moves INTO the package.
 * It is pure (presets, classification, strategy resolution — no IO), and its
 * budgets drive the driver's re-chunk decision, which lives here too. The byte
 * budget is evaluated on the canonical `stringify` serialization, which is
 * exactly what the consumer writes to disk, so no part of it is a
 * consumer-side concern.
 *
 * Two mechanisms that compose:
 *   1. Tier PRESETS — each size maps to a download strategy (mode, depth,
 *      batchSize, concurrency, streaming, re-chunk budgets).
 *   2. AUTO classification — pick the tier from cheap skeleton signals without
 *      ever fetching the whole file to "measure" it.
 *
 * Correctness for any size does NOT depend on getting the tier right: the
 * re-chunk loop splits any part that breaches its byte/time budget. The tier
 * is a performance hint, not a correctness dependency.
 */

export const TIERS = ["sm", "md", "large", "xl", "xxxxl"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierPreset {
  mode: "whole" | "frontier";
  depth: number;
  batchSize: number;
  concurrency: number;
  stream: boolean;
  rechunk: boolean;
  maxPartBytes: number;
  maxPartMs: number;
  resume: boolean;
}

/**
 * Strategy presets per tier. `maxPartBytes` / `maxPartMs` drive the re-chunk
 * loop; `mode: 'whole'` is the small-file fast path (single GET, no chunking).
 */
export const PRESETS: Record<Tier, TierPreset> = {
  sm: {
    mode: "whole",
    depth: 2,
    batchSize: 10,
    concurrency: 1,
    stream: false,
    rechunk: false,
    maxPartBytes: 0,
    maxPartMs: 0,
    resume: false,
  },
  md: {
    mode: "frontier",
    depth: 2,
    batchSize: 10,
    concurrency: 4,
    stream: false,
    rechunk: true,
    maxPartBytes: 32 * 1024 * 1024,
    maxPartMs: 45000,
    resume: false,
  },
  large: {
    mode: "frontier",
    depth: 2,
    batchSize: 5,
    concurrency: 6,
    stream: true,
    rechunk: true,
    maxPartBytes: 24 * 1024 * 1024,
    maxPartMs: 45000,
    resume: true,
  },
  xl: {
    mode: "frontier",
    depth: 3,
    batchSize: 3,
    concurrency: 8,
    stream: true,
    rechunk: true,
    maxPartBytes: 16 * 1024 * 1024,
    maxPartMs: 40000,
    resume: true,
  },
  xxxxl: {
    mode: "frontier",
    depth: 3,
    batchSize: 2,
    concurrency: 8,
    stream: true,
    rechunk: true,
    maxPartBytes: 8 * 1024 * 1024,
    maxPartMs: 30000,
    resume: true,
  },
};

export interface TierBounds {
  nodes: number;
  frontier: number;
  bytes: number;
}

/** Default classification thresholds (overridable in tests). */
export const DEFAULT_THRESHOLDS: Record<Exclude<Tier, "xxxxl">, TierBounds> = {
  // upper bounds (inclusive) for each tier; anything above xl's bound is xxxxl
  sm: { nodes: 3_000, frontier: 0, bytes: 2 * 1024 * 1024 },
  md: { nodes: 30_000, frontier: 50, bytes: 8 * 1024 * 1024 },
  large: { nodes: 150_000, frontier: 300, bytes: 50 * 1024 * 1024 },
  xl: { nodes: 1_000_000, frontier: 2_000, bytes: 50 * 1024 * 1024 },
};

export interface SizeSignals {
  nodeCount?: number;
  frontierWidth?: number;
  skeletonBytes?: number;
  hasFrontier?: boolean;
}

/**
 * Classify a file into a tier from skeleton-derived signals. A signal that
 * pushes into a larger tier wins (we never under-provision).
 */
export function classify(
  signals: SizeSignals = {},
  thresholds = DEFAULT_THRESHOLDS,
): Tier {
  const nodes = signals.nodeCount ?? 0;
  const frontier = signals.frontierWidth ?? 0;
  const bytes = signals.skeletonBytes ?? 0;

  // A truncation-free tiny skeleton (the whole doc fit in the probe) is `sm`.
  if (signals.hasFrontier === false && nodes <= thresholds.sm.nodes)
    return "sm";

  const tierByNodes = byBound(nodes, "nodes", thresholds);
  const tierByFrontier = byBound(frontier, "frontier", thresholds);
  const tierByBytes = byBound(bytes, "bytes", thresholds);
  return maxTier(tierByNodes, tierByFrontier, tierByBytes);
}

function byBound(
  value: number,
  key: keyof TierBounds,
  thresholds: typeof DEFAULT_THRESHOLDS,
): Tier {
  if (value <= thresholds.sm[key]) return "sm";
  if (value <= thresholds.md[key]) return "md";
  if (value <= thresholds.large[key]) return "large";
  if (value <= thresholds.xl[key]) return "xl";
  return "xxxxl";
}

function maxTier(...tiers: Tier[]): Tier {
  return tiers.reduce<Tier>(
    (a, b) => (TIERS.indexOf(b) > TIERS.indexOf(a) ? b : a),
    "sm",
  );
}

export interface ResolveStrategyOptions {
  size?: string;
  depth?: number;
  batchSize?: number;
  concurrency?: number;
  maxPartBytes?: number;
  maxPartMs?: number;
  signals?: SizeSignals;
  thresholds?: typeof DEFAULT_THRESHOLDS;
  explicit?: {
    depth?: boolean;
    batchSize?: boolean;
    concurrency?: boolean;
  };
}

export type ResolvedStrategy = TierPreset & { size: Tier };

/**
 * Resolve the final strategy for a run. Explicit CLI options win over the tier
 * preset, which wins over `auto`.
 */
export function resolveStrategy(
  opts: ResolveStrategyOptions = {},
): ResolvedStrategy {
  const explicit = opts.explicit || {};
  let size = (
    opts.size && opts.size !== "auto" ? opts.size : null
  ) as Tier | null;
  if (!size)
    size = classify(opts.signals || {}, opts.thresholds || DEFAULT_THRESHOLDS);
  if (!PRESETS[size]) throw new Error(`unknown size tier: ${size}`);

  const preset = { ...PRESETS[size] };
  // Explicit CLI values override the preset.
  if (explicit.depth && opts.depth !== undefined) preset.depth = opts.depth;
  if (explicit.batchSize && opts.batchSize !== undefined)
    preset.batchSize = opts.batchSize;
  if (explicit.concurrency && opts.concurrency !== undefined)
    preset.concurrency = opts.concurrency;
  if (opts.maxPartBytes !== undefined) {
    preset.maxPartBytes = opts.maxPartBytes;
    preset.rechunk = opts.maxPartBytes > 0;
  }
  if (opts.maxPartMs !== undefined) preset.maxPartMs = opts.maxPartMs;

  return { size, ...preset };
}
