import { createHash } from "node:crypto";

/**
 * The gate compares hashes, not stories.
 * A bot can describe a listing one way and send another. The hash is of the
 * exact JSON that would be published, so a changed price is a different card.
 */

export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function payloadHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortKeys(source[key]);
    }
    return out;
  }
  return value;
}
