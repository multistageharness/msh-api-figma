/**
 * Frontier collection — the first stage of a chunked download. Ported verbatim
 * from the downloader's `chunk.mjs`; a pure function of a parsed skeleton with
 * no IO. Traversal ORDER is preserved deliberately: ids feed `batch()`,
 * batches feed `sha256OfBatch`, and part filenames derive from those hashes,
 * so a different order changes part filenames (and the manifest the parity
 * gate compares) even though `full.json` would be unaffected.
 */

import { ValidationError } from "@internal/figma-api-fetch";

/**
 * Walk the skeleton document and collect the ids of every node at exactly
 * `depth` (document = 0, pages/CANVAS = 1, top frames = 2). These are the
 * chunk roots. Document order, de-duplicated.
 */
export function collectFrontierIds(skeleton: any, depth: number): string[] {
  const doc = skeleton?.document;
  if (!doc)
    throw new ValidationError(
      "skeleton has no `document` — cannot plan chunks.",
      "skeleton",
    );
  const ids: string[] = [];
  (function walk(node: any, level: number) {
    if (!node || typeof node !== "object") return;
    if (level === depth) {
      if (node.id) ids.push(node.id);
      return; // do not descend past the frontier
    }
    for (const child of node.children || []) walk(child, level + 1);
  })(doc, 0);
  return [...new Set(ids)];
}

export default collectFrontierIds;
