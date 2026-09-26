import Anthropic from "@anthropic-ai/sdk";
import { INTENT_JSON_SCHEMA, parseIntent } from "./_lib/format.js";
import { SYSTEM_PROMPT } from "./_lib/prompt.js";
import { allow } from "./_lib/ratelimit.js";
import { CommandRequestSchema, type CommandError, type CommandResponse } from "./_lib/schema.js";

// POST /api/command: turns one typed request into a validated Intent (SPEC.md section 14.3).
// Any non-200 answer sends the browser to its local parser, so every failure is a small JSON error.

const MODEL = process.env.COMMAND_MODEL ?? "claude-haiku-4-5";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 8_000, maxRetries: 1 }); // reads ANTHROPIC_API_KEY
  return client;
}

function reply(body: CommandResponse, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(error: CommandError, status: number): Response {
  return reply({ ok: false, error }, status);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allow(ip)) return fail("rate_limited", 429);
    const parsed = CommandRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", 400);
    if (!process.env.ANTHROPIC_API_KEY) return fail("not_configured", 503);
    const { text, context } = parsed.data;

    try {
      const response = await getClient().messages.create({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify({ text, context }) }],
        output_config: { format: { type: "json_schema", schema: INTENT_JSON_SCHEMA } },
      });
      // A refusal or a max_tokens cut can break the schema, so only a finished turn is parsed.
      if (response.stop_reason !== "end_turn") return fail("no_parse", 422);
      const intent = parseIntent(response.content.find((block) => block.type === "text")?.text);
      if (!intent) return fail("no_parse", 422);
      return reply({ ok: true, intent, model: MODEL }, 200);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return fail("upstream_rate_limited", 503);
      if (err instanceof Anthropic.APIConnectionError) return fail("upstream_unreachable", 503);
      if (err instanceof Anthropic.APIError) return fail("upstream_error", 502);
      return fail("unknown", 500);
    }
  },
};
