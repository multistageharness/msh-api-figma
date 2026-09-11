/**
 * The chunked download driver — the fetch-and-plan half of the downloader's
 * `chunk.mjs` `downloadChunks`, split along the sink seam (plan decision D2):
 *
 *   • the DRIVER decides WHAT to fetch (batching, bounded concurrency) and HOW
 *     to re-chunk an over-budget batch (shallow parent part + full child
 *     parts, recursively);
 *   • the CONSUMER decides how bytes land on disk, via the `sink` callback —
 *     the downloader writes content-hashed part files, tests collect into an
 *     array.
 *
 * Nothing in this module touches `node:fs`; part-file bytes stay under the
 * consumer's control because they anchor the cross-language parity contract.
 * The serialized `json` handed to the sink is byte-identical to what
 * `chunk.mjs` wrote (`stringify` + `sha256OfBatch` are unchanged ports).
 */

import { FigmaFetchError } from "@internal/figma-api-fetch";
import type { FigmaFileClient } from "../client/FigmaFileClient.js";
import {
  batch,
  byteLength,
  type Limiter,
  pool,
  sha256OfBatch,
  stringify,
} from "./util.js";

/** One part yielded by the driver — everything a sink needs to persist it. */
export interface ChunkPart {
  /** Suggested content-hashed filename, `part-<sha>.json`. */
  file: string;
  /** The 12-hex content hash of the part's (sorted) id set. */
  sha: string;
  /** The node ids this part covers. */
  ids: string[];
  /** The payload as fetched / re-chunked. */
  payload: unknown;
  /** Canonical serialization of `payload` — write these bytes verbatim. */
  json: string;
  /** UTF-8 byte length of `json`. */
  bytes: number;
  /** Fetch wall time for whole-batch parts; 0 for re-chunked splits. */
  elapsedMs: number;
  /** Index of the planned group this part belongs to. */
  groupIndex: number;
  /** Content hash of the planned group. */
  groupSha: string;
  /** Whether this part came out of a re-chunk split. */
  rechunked: boolean;
}

/** Persists one part. Awaited; a throw fails the group. */
export type ChunkSink = (part: ChunkPart) => void | Promise<void>;

/** Asked once per group when resuming; lets the consumer reuse prior parts. */
export interface ResumeQuery {
  groupSha: string;
  ids: string[];
  groupIndex: number;
}

/** A prior group the consumer can fully serve without fetching. */
export interface ResumedGroup {
  parts: Array<{ file: string; ids?: string[]; bytes?: number }>;
  rechunked?: boolean;
}

/** Metadata for one emitted part (mirrors `manifest.parts[]` in `chunk.mjs`). */
export interface PartMeta {
  file: string;
  ids: string[];
  sha: string;
  bytes: number;
  elapsedMs: number;
}

/** Metadata for one planned group (mirrors `manifest.groups[]`). */
export interface GroupMeta {
  sha: string;
  ids: string[];
  parts: string[];
  rechunked: boolean;
  resumed?: boolean;
}

/** The manifest-shaped result; the consumer adds its own disk concerns. */
export interface ChunkDownloadResult {
  fileKey: string;
  frontierDepth: number;
  batchSize: number;
  concurrency: number;
  idCount: number;
  batchCount: number;
  downloaded: number;
  resumedSkipped: number;
  rechunked: number;
  oversizedLeaves: string[];
  frontierIds: string[];
  parts: PartMeta[];
  groups: GroupMeta[];
}

/**
 * A batch that failed after the client exhausted its retries. Carries the
 * affected ids and the underlying error (whose `code` this error adopts, so
 * exit-code classification is preserved).
 */
export class ChunkBatchError extends FigmaFetchError {
  constructor(ids: string[], groupSha: string, cause: Error) {
    super(
      `chunk batch ${groupSha} (${ids.length} id(s): ${ids.join(",")}) failed: ${cause.message}`,
      cause instanceof FigmaFetchError ? cause.code : undefined,
      { ids: [...ids], groupSha, cause },
    );
  }
}

export interface DownloadChunksOptions {
  /** The endpoint client (supplies transport, auth, retry, timeout). */
  client: FigmaFileClient;
  fileKey: string;
  frontierIds: string[];
  /** The skeleton truncation depth the frontier was collected at. */
  depth: number;
  /** Receives every completed part. */
  sink: ChunkSink;
  batchSize?: number;
  concurrency?: number;
  geometry?: boolean;
  version?: string;
  nodeDepth?: number;
  /** Per-request timeout override, in ms. */
  timeoutMs?: number;
  /** Enable byte/time-aware re-chunking of over-budget batches. */
  rechunk?: boolean;
  maxPartBytes?: number;
  maxPartMs?: number;
  maxRechunkDepth?: number;
  /** Gates each batch's start against a shared rate ceiling. */
  limiter?: Limiter | null;
  /** Consulted per group before fetching; return prior parts to skip it. */
  resumeGroup?: (
    query: ResumeQuery,
  ) => Promise<ResumedGroup | null> | ResumedGroup | null;
  log?: (message: string) => void;
}

/** Drop a node's `children` array, keeping everything else (a graft stub). */
function stripChildren(node: any): any {
  const { children, ...rest } = node;
  return rest;
}

/**
 * Fetch the full subtree for every frontier id in content-hashed parts,
 * re-chunking any over-budget subtree, yielding each part to `sink` in a
 * single pass. Returns manifest-shaped metadata.
 */
export async function downloadChunks({
  client,
  fileKey,
  frontierIds,
  depth,
  sink,
  batchSize = 10,
  concurrency = 4,
  geometry = false,
  version,
  nodeDepth,
  timeoutMs,
  rechunk = false,
  maxPartBytes = 0,
  maxPartMs = 0,
  maxRechunkDepth = 4,
  limiter = null,
  resumeGroup,
  log = () => {},
}: DownloadChunksOptions): Promise<ChunkDownloadResult> {
  const batches = batch(frontierIds, batchSize);

  const partsMeta: PartMeta[] = [];
  const groupsMeta: GroupMeta[] = new Array(batches.length);
  const emittedFiles = new Set<string>();
  let written = 0;
  let skipped = 0;
  let rechunked = 0;
  const oversizedLeaves: string[] = [];

  const mapsOf = (entry: any) => ({
    components: entry?.components || {},
    componentSets: entry?.componentSets || {},
    styles: entry?.styles || {},
  });
  const nodePart = (node: any, maps: object) => ({
    nodes: { [node.id]: { document: node, ...maps } },
  });

  const emitPart = async (
    file: string,
    payload: unknown,
    ids: string[],
    context: { groupIndex: number; groupSha: string; rechunked: boolean },
    elapsedMs = 0,
  ): Promise<number> => {
    const json = stringify(payload);
    const bytes = byteLength(json);
    await sink({
      file,
      sha: file.slice(5, -5),
      ids: [...ids],
      payload,
      json,
      bytes,
      elapsedMs,
      ...context,
    });
    if (!emittedFiles.has(file)) {
      emittedFiles.add(file);
      partsMeta.push({
        file,
        ids: [...ids],
        sha: file.slice(5, -5),
        bytes,
        elapsedMs,
      });
      written += 1;
    }
    return bytes;
  };

  // Split one over-budget node into a shallow parent part + full child parts.
  const splitNode = async (
    node: any,
    level: number,
    maps: object,
    groupFiles: string[],
    context: { groupIndex: number; groupSha: string },
  ): Promise<void> => {
    const bytes = byteLength(stringify(node));
    const kids: any[] = Array.isArray(node.children) ? node.children : [];
    const over = maxPartBytes > 0 && bytes > maxPartBytes;
    const canSplit = rechunk && level < maxRechunkDepth && kids.length > 0;
    if (!over || !canSplit) {
      // Termination guard: a leaf (or depth-capped node) that is still over
      // budget is accepted as-is and recorded, never re-split.
      if (over && kids.length === 0 && !oversizedLeaves.includes(node.id))
        oversizedLeaves.push(node.id);
      const file = `part-${sha256OfBatch([node.id])}.json`;
      await emitPart(file, nodePart(node, maps), [node.id], {
        ...context,
        rechunked: true,
      });
      groupFiles.push(file);
      return;
    }
    rechunked += 1;
    const shallow = { ...node, children: kids.map(stripChildren) };
    const file = `part-${sha256OfBatch([node.id])}.json`;
    await emitPart(file, nodePart(shallow, maps), [node.id], {
      ...context,
      rechunked: true,
    });
    groupFiles.push(file);
    for (const child of kids)
      await splitNode(child, level + 1, maps, groupFiles, context);
  };

  const tasks = batches.map((ids, bi) => async () => {
    const gsha = sha256OfBatch(ids);
    const groupFiles: string[] = [];

    // --- Resume: let the consumer reuse a prior group's parts. ---
    if (resumeGroup) {
      const prior = await resumeGroup({
        groupSha: gsha,
        ids,
        groupIndex: bi,
      });
      if (prior?.parts?.length) {
        skipped += 1;
        for (const p of prior.parts) {
          if (!emittedFiles.has(p.file)) {
            emittedFiles.add(p.file);
            partsMeta.push({
              file: p.file,
              ids: p.ids || ids,
              sha: p.file.slice(5, -5),
              bytes: p.bytes ?? 0,
              elapsedMs: 0,
            });
          }
          groupFiles.push(p.file);
        }
        groupsMeta[bi] = {
          sha: gsha,
          ids,
          parts: groupFiles,
          rechunked: !!prior.rechunked,
          resumed: true,
        };
        log(
          `  [${bi + 1}/${batches.length}] resume: skip group ${gsha} (${groupFiles.length} part(s))`,
        );
        return;
      }
    }

    // --- Fetch the batch. ---
    const t0 = Date.now();
    let data: any;
    try {
      data = await client.fetchNodes(fileKey, ids, {
        geometry,
        version,
        nodeDepth,
        timeoutMs,
      });
    } catch (error: any) {
      throw new ChunkBatchError(ids, gsha, error);
    }
    const elapsedMs = Date.now() - t0;
    const batchBytes = byteLength(stringify(data));
    const overBudget =
      rechunk &&
      ((maxPartBytes > 0 && batchBytes > maxPartBytes) ||
        (maxPartMs > 0 && elapsedMs > maxPartMs));

    if (!overBudget) {
      const file = `part-${gsha}.json`;
      await emitPart(
        file,
        data,
        ids,
        { groupIndex: bi, groupSha: gsha, rechunked: false },
        elapsedMs,
      );
      groupFiles.push(file);
      groupsMeta[bi] = { sha: gsha, ids, parts: groupFiles, rechunked: false };
      const got = Object.keys(data.nodes || {}).length;
      log(
        `  [${bi + 1}/${batches.length}] wrote ${file} — ${got}/${ids.length} node(s), ${batchBytes}B`,
      );
      return;
    }

    // --- Over budget: re-chunk each subtree in memory. ---
    log(
      `  [${bi + 1}/${batches.length}] over budget (${batchBytes}B / ${elapsedMs}ms) — re-chunking`,
    );
    for (const id of ids) {
      const entry = data.nodes?.[id];
      if (!entry?.document) continue;
      await splitNode(entry.document, depth, mapsOf(entry), groupFiles, {
        groupIndex: bi,
        groupSha: gsha,
      });
    }
    groupsMeta[bi] = { sha: gsha, ids, parts: groupFiles, rechunked: true };
  });

  await pool(tasks, concurrency, { limiter });

  partsMeta.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  return {
    fileKey,
    frontierDepth: depth,
    batchSize,
    concurrency,
    idCount: frontierIds.length,
    batchCount: batches.length,
    downloaded: written,
    resumedSkipped: skipped,
    rechunked,
    oversizedLeaves,
    frontierIds: [...frontierIds],
    parts: partsMeta,
    groups: groupsMeta.filter(Boolean),
  };
}

export default downloadChunks;
