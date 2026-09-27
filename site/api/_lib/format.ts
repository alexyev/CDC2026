// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { z } from "zod";
import { IntentSchema, type Intent } from "./schema.js";

// Structured-output schema for the Intent, and the parse that re-checks it.
// The SDK's zodOutputFormat (0.128.0) moves `enum` into the description text, so the closed layer
// list would be a hint rather than a decoding constraint. We send zod's JSON Schema with real enums,
// minus only the keywords structured outputs rejects (length, count, and numeric limits), which move
// into the description as hints; parseIntent then enforces every limit with the zod schema.

type JsonSchema = { [key: string]: unknown };

const UNSUPPORTED = new Set(["minLength", "maxLength", "maxItems", "minimum", "maximum", "multipleOf"]);

function strict(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  const hints: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema") continue;
    if (UNSUPPORTED.has(key) || (key === "minItems" && value !== 0 && value !== 1)) {
      hints.push(`${key}: ${JSON.stringify(value)}`);
    } else if (key === "properties") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([name, prop]) => [name, strict(prop)]),
      );
    } else if (key === "items") {
      out.items = strict(value as JsonSchema);
    } else {
      out[key] = value;
    }
  }
  if (out.type === "object") out.additionalProperties = false;
  if (hints.length) out.description = [out.description, `{${hints.join(", ")}}`].filter(Boolean).join("\n\n");
  return out;
}

export const INTENT_JSON_SCHEMA = strict(z.toJSONSchema(IntentSchema, { io: "output" }) as JsonSchema);

// The model's JSON text to a valid Intent, or null when it is not JSON or breaks a limit.
export function parseIntent(text: string | undefined): Intent | null {
  if (text === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const result = IntentSchema.safeParse(json);
  return result.success ? result.data : null;
}
