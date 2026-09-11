/**
 * Dependency-free helpers for the chunked download engine — a faithful port of
 * the downloader's `util.mjs`. `sha256OfBatch` and `stringify` are
 * PARITY-RELEVANT: `sha256OfBatch` names part files and the Python twin
 * computes the same hash over the same canonical serialization, so their
 * inputs (id order handling, separator, encoding) must not change.
 */

import { createHash } from "node:crypto";

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The two Unicode line terminators JSON.stringify emits *literally*: Line
// Separator (U+2028) and Paragraph Separator (U+2029). Built from char codes so
// this source file itself never contains a raw separator.
const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/**
 * JSON.stringify, but escape U+2028 / U+2029. Figma text nodes frequently
 * contain them; left raw they become real line breaks in the output file.
 * Escaping them yields semantically identical — and strictly safer — JSON that
 * still parses to the same value.
 */
export function stringify(obj: unknown, pretty = false): string {
  const json = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  return escapeLineSeparators(json);
}

/** Escape U+2028 / U+2029 in an already-serialized JSON string. */
export function escapeLineSeparators(json: string): string {
  return json.replace(LS, "\\u2028").replace(PS, "\\u2029");
}

/** A token source gating task starts (see `tokenBucket`). */
export interface Limiter {
  acquire: () => Promise<void>;
}

/**
 * Run async tasks with bounded concurrency, preserving input order in the
 * result array. `tasks` is an array of thunks `() => Promise<T>`. An optional
 * `limiter` (token bucket) gates each task's *start* so a shared rate ceiling
 * holds across the whole pool, not just a parallelism cap.
 */
export async function pool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  opts: { limiter?: Limiter | null } = {},
): Promise<T[]> {
  const limit = Math.max(1, concurrency | 0);
  const results = new Array<T>(tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      if (opts.limiter) await opts.limiter.acquire();
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return results;
}

export interface TokenBucket extends Limiter {
  setCapacity(c: number): void;
  readonly capacity: number;
}

/**
 * A simple token-bucket rate limiter. `rate` tokens are added per second up to
 * `burst` capacity; `acquire()` resolves when a token is available. Used to
 * hold a global request ceiling (and to step down under sustained 429s). Pass
 * `rate <= 0` to disable.
 */
export function tokenBucket({
  rate = 0,
  burst = 1,
  now = () => Date.now(),
}: {
  rate?: number;
  burst?: number;
  now?: () => number;
} = {}): TokenBucket {
  let tokens = burst;
  let last = now();
  let cap = burst;
  const refill = () => {
    if (rate <= 0) return;
    const t = now();
    tokens = Math.min(cap, tokens + ((t - last) / 1000) * rate);
    last = t;
  };
  return {
    async acquire() {
      if (rate <= 0) return;
      refill();
      while (tokens < 1) {
        const waitMs = Math.max(10, Math.ceil(((1 - tokens) / rate) * 1000));
        await sleep(waitMs);
        refill();
      }
      tokens -= 1;
    },
    setCapacity(c: number) {
      cap = Math.max(1, c);
      tokens = Math.min(tokens, cap);
    },
    get capacity() {
      return cap;
    },
  };
}

/** Split `arr` into consecutive sub-arrays of at most `size` items. */
export function batch<T>(arr: T[], size: number): T[][] {
  const n = Math.max(1, size | 0);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Zero-pad an integer to `width` (for stable, sortable indices). */
export function pad(num: number, width = 4): string {
  return String(num).padStart(width, "0");
}

/**
 * Deterministic content hash of an id-batch: sort the ids, join with `,`,
 * sha256, take a short hex prefix. Two runs over the same logical batch produce
 * the same part filename, so an unchanged batch is reused on resume.
 * PARITY-RELEVANT: the Python twin computes the identical hash.
 */
export function sha256OfBatch(ids: string[], len = 12): string {
  const canon = [...ids].sort().join(",");
  return createHash("sha256").update(canon).digest("hex").slice(0, len);
}

/** Count every node in a Figma (sub)tree rooted at `node`. */
export function countNodes(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let n = 1;
  for (const child of node.children || []) n += countNodes(child);
  return n;
}

/** Byte length of `s` as UTF-8. */
export function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}
