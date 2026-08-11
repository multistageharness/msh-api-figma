/**
 * zod request/response validation layer (R5).
 *
 * Centralizes runtime safety at the SDK boundary: the inputs every Figma call
 * shares (file keys, node ids, image scale/format) get one canonical zod schema
 * instead of the per-service hand-rolled regex checks. Validation is **opt-in**
 * per call — services may call `parseOrThrow(FileKeySchema, key)` where they want
 * the guarantee; large file-JSON node-tree validation stays lazy/pluggable (see
 * `setNodeTreeValidator`) so the heavy `primitive-figma-node-types` schema can be
 * injected by a consumer without the SDK taking a hard dependency on it.
 */

import { ZodError, type ZodSchema, z } from "zod";
import { ValidationError } from "../errors/index.js";

/** A Figma file key: alphanumeric plus `-` and `_`. */
export const FileKeySchema = z
  .string()
  .min(1, "File key is required")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid file key format");

/** A single Figma node id (digits and colons, e.g. `12:345`). */
export const NodeIdSchema = z
  .string()
  .min(1, "Node id is required")
  .regex(/^[\d:]+$/, "Invalid node id format");

/** One or more node ids: a comma string or an array, normalized to a string[]. */
export const NodeIdsSchema = z
  .union([z.string().min(1), z.array(z.string()).min(1)])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(",")).map((s) => s.trim()),
  )
  .pipe(z.array(NodeIdSchema).min(1, "At least one node id is required"));

/** Image render scale: 0.01 .. 4. */
export const ImageScaleSchema = z.coerce.number().min(0.01).max(4);

/** Image render format. */
export const ImageFormatSchema = z.enum(["jpg", "png", "svg", "pdf"]);

/** A team id / project id: a non-empty string. */
export const IdSchema = z.string().trim().min(1, "Id is required");

/**
 * Parse a value against a schema, throwing the SDK's own `ValidationError`
 * (not a raw `ZodError`) so callers catch one error hierarchy (R4).
 *
 * @param schema - The zod schema
 * @param value - The value to validate
 * @param field - Optional field name for the error
 */
export function parseOrThrow<T>(
  schema: ZodSchema<T>,
  value: unknown,
  field?: string,
): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const path = field || first?.path.join(".") || undefined;
      throw new ValidationError(first?.message || "Validation failed", path);
    }
    throw error;
  }
}

/** Non-throwing variant: returns `{ success, data | error }`. */
export function safeParse<T>(
  schema: ZodSchema<T>,
  value: unknown,
): { success: true; data: T } | { success: false; error: ValidationError } {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  const first = result.error.issues[0];
  return {
    success: false,
    error: new ValidationError(
      first?.message || "Validation failed",
      first?.path.join(".") || undefined,
    ),
  };
}

/**
 * Pluggable node-tree validator seam. The full document/node-tree schema lives
 * in the separate `primitive-figma-node-types` zod lib; a consumer injects it
 * here once, and `validateNodeTree` becomes active. Until then it is a no-op
 * pass-through so the SDK never hard-depends on the heavy schema and large file
 * JSON isn't validated on the hot path by default.
 */
type NodeTreeValidator = (doc: unknown) => unknown;
let nodeTreeValidator: NodeTreeValidator | null = null;

/** Inject the node-tree validator (e.g. from `primitive-figma-node-types`). */
export function setNodeTreeValidator(
  validator: NodeTreeValidator | null,
): void {
  nodeTreeValidator = validator;
}

/**
 * Validate a document/node tree if a validator has been injected; otherwise
 * return it unchanged (lazy / opt-in, per R5).
 */
export function validateNodeTree<T = unknown>(doc: T): T {
  return nodeTreeValidator ? (nodeTreeValidator(doc) as T) : doc;
}

export { z };
