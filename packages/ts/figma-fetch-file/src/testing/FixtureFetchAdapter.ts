/**
 * FixtureFetchAdapter — an offline fake of the three file-domain endpoints,
 * injected per client instance via `FigmaApiClientConfig.fetchAdapter`. No
 * module-level binding is reassigned anywhere (unlike the downloader's mutable
 * `_http.fetch` holder this replaces).
 *
 * Testing-rail decision (plan Story 02/04/01, recorded): `figma-fetch`'s
 * existing `FakeFigmaClient` was evaluated first and NOT extended. It is a
 * client stand-in — it replaces `FigmaApiClient` wholesale, so nothing behind
 * it (retry, adapters, request building) executes. The chunked engine's tests
 * need the REAL `FigmaApiClient` + `FigmaFileClient` code path with only the
 * transport faked, which is precisely the `FetchAdapter` seam. Its route table
 * also has no way to express `?depth=N` truncation, which is the one behaviour
 * that makes the skeleton path testable. Hence a transport-level adapter here.
 *
 * Endpoint behaviour is ported from the downloader's `mock.mjs`:
 *   • GET …/files/:key?depth=N — deep-clone + delete `children` below depth
 *   • GET …/files/:key/nodes?ids= — locate each id, wrap in the
 *     `{ document, components, componentSets, styles }` envelope
 *   • GET …/files/:key (no depth) — the whole document
 */

import type { FetchRequest, FetchResponse } from "@internal/figma-api-fetch";
import { FetchAdapter } from "@internal/figma-api-fetch";

/** Deep-clone + truncate a tree so nodes below `depth` lose their children. */
function truncate(node: any, level: number, depth: number): any {
  const copy = { ...node };
  if (Array.isArray(node.children)) {
    if (level >= depth) delete copy.children;
    else
      copy.children = node.children.map((c: any) =>
        truncate(c, level + 1, depth),
      );
  }
  return copy;
}

function findNode(node: any, id: string): any {
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export class FixtureFetchAdapter extends FetchAdapter {
  private readonly file: any;

  /** @param file - the fixture document (a whole `/files/:key` response body) */
  constructor(file: any) {
    super();
    this.file = file;
  }

  async fetch<T = any>(request: FetchRequest): Promise<FetchResponse<T>> {
    const u = new URL(request.url);
    const file = this.file;

    const ok = (obj: any): FetchResponse<T> => ({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      data: obj,
      ok: true,
      rawBody: JSON.stringify(obj),
    });

    if (u.pathname.includes("/nodes")) {
      const ids = (u.searchParams.get("ids") || "").split(",").filter(Boolean);
      const nodes: Record<string, any> = {};
      for (const id of ids) {
        const found = findNode(file.document, decodeURIComponent(id));
        if (found)
          nodes[id] = {
            document: found,
            components: {},
            componentSets: {},
            styles: {},
          };
      }
      return ok({
        name: file.name,
        lastModified: file.lastModified,
        version: file.version,
        nodes,
      });
    }

    // /files/:key — honour the depth param (absent → whole file).
    const depthParam = u.searchParams.get("depth");
    if (depthParam === null) return ok(file); // whole-file fast path
    const depth = Number(depthParam) || Infinity;
    return ok({ ...file, document: truncate(file.document, 0, depth) });
  }
}

export default FixtureFetchAdapter;
