/**
 * Normalise whatever a user has to hand — a Figma URL, a path from a previous
 * download, or a bare key — into a Figma file key. Ported from the downloader's
 * `figmaClient.mjs` so every workspace package shares one extractor.
 *
 * Accepts:
 *   https://www.figma.com/design/TFTCSGbqpyxex6QRYqqbzb/Name
 *   https://www.figma.com/file/TFTCSGbqpyxex6QRYqqbzb/Name
 *   out/TFTCSGbqpyxex6QRYqqbzb/full.json   (path segment)
 *   TFTCSGbqpyxex6QRYqqbzb                 (bare key)
 *
 * Returns '' when no plausible key is found — deliberately not a throw, so a
 * CLI can treat it as a user error with its own message and exit code.
 *
 * The two length thresholds are intentional: a URL's path position gives
 * certainty a bare string does not, so the URL pattern accepts 10+ characters
 * while path segments and bare keys require 20+.
 */
export function parseFileKey(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const url = s.match(/figma\.com\/(?:file|design)\/([0-9A-Za-z]{10,})/i);
  if (url) return url[1];
  const segs = s.split(/[\\/]/).filter(Boolean);
  const keyish = segs.filter((seg) => /^[0-9A-Za-z]{20,}$/.test(seg));
  if (keyish.length) return keyish.sort((a, b) => b.length - a.length)[0];
  if (/^[0-9A-Za-z]{20,}$/.test(s)) return s;
  return "";
}

export default parseFileKey;
