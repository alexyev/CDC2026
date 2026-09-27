// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import Anthropic from "@anthropic-ai/sdk";
import * as TypeSafe from "@typesafe-ai/sdk";
import { INTENT_JSON_SCHEMA, parseIntent } from "./_lib/format.js";
import { jevDecision, jevQuestions, type JevAnswers } from "./_lib/jev.js";
import { SYSTEM_PROMPT } from "./_lib/prompt.js";
import { allow } from "./_lib/ratelimit.js";
import { CommandRequestSchema, type CommandError, type CommandRequest, type CommandResponse } from "./_lib/schema.js";

// POST /api/command: turns one typed request into a validated Intent (SPEC.md section 14.3).
// Engines in order, each skipped when its key is unset and left on any error or timeout: Jev (TYPESAFE_API_KEY),
// then Claude (ANTHROPIC_API_KEY). Any non-200 answer sends the browser to its local parser, so every failure is a
// small JSON error.

const MODEL = process.env.COMMAND_MODEL ?? "claude-haiku-4-5";
// Pinned because the confidence thresholds in _lib/jev.ts are tuned against this version.
const JEV_MODEL = process.env.JEV_MODEL ?? "jev-1.13.0";
const JEV_TIMEOUT_MS = 2_500;
/** Claude's budget after a failed Jev call, so both fit inside the browser's 8 s cap. */
const CLAUDE_AFTER_JEV_MS = 5_000;

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 8_000, maxRetries: 1 }); // reads ANTHROPIC_API_KEY
  return client;
}

let jevClient: TypeSafe.TypeSafeClient | undefined;
function getJevClient(): TypeSafe.TypeSafeClient {
  // Reads TYPESAFE_API_KEY. A failed Jev call falls through to the next engine instead of retrying.
  jevClient ??= new TypeSafe.TypeSafeClient({ timeout: JEV_TIMEOUT_MS, retry: { maxRetries: 0 }, logLevel: "off" });
  return jevClient;
}

type Outcome = { ok: true; body: CommandResponse } | { ok: false; error: CommandError; status: number };

function reply(body: CommandResponse, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(error: CommandError, status: number): Response {
  return reply({ ok: false, error }, status);
}

async function askJev(req: CommandRequest): Promise<Outcome> {
  try {
    const response = await getJevClient().systemOne({ model: JEV_MODEL, ...jevQuestions(req) });
    const decision = jevDecision(req, response.answers as JevAnswers);
    return { ok: true, body: { ok: true, engine: "jev", model: response.model, ...decision } };
  } catch (err) {
    if (err instanceof TypeSafe.RateLimitError) return { ok: false, error: "upstream_rate_limited", status: 503 };
    if (err instanceof TypeSafe.APIConnectionError) return { ok: false, error: "upstream_unreachable", status: 503 };
    if (err instanceof TypeSafe.APIError) return { ok: false, error: "upstream_error", status: 502 };
    if (err instanceof TypeSafe.TypeSafeError) return { ok: false, error: "unknown", status: 500 };
    return { ok: false, error: "no_parse", status: 422 }; // jevDecision rejected the answers
  }
}

async function askClaude({ text, context }: CommandRequest, afterJev: boolean): Promise<Outcome> {
  try {
    const response = await getClient().messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify({ text, context }) }],
        output_config: { format: { type: "json_schema", schema: INTENT_JSON_SCHEMA } },
      },
      afterJev ? { timeout: CLAUDE_AFTER_JEV_MS, maxRetries: 0 } : undefined,
    );
    // A refusal or a max_tokens cut can break the schema, so only a finished turn is parsed.
    if (response.stop_reason !== "end_turn") return { ok: false, error: "no_parse", status: 422 };
    const intent = parseIntent(response.content.find((block) => block.type === "text")?.text);
    if (!intent) return { ok: false, error: "no_parse", status: 422 };
    return { ok: true, body: { ok: true, engine: "claude", intent, model: MODEL } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "upstream_rate_limited", status: 503 };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, error: "upstream_unreachable", status: 503 };
    if (err instanceof Anthropic.APIError) return { ok: false, error: "upstream_error", status: 502 };
    return { ok: false, error: "unknown", status: 500 };
  }
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
    const useJev = Boolean(process.env.TYPESAFE_API_KEY);
    let outcome: Outcome = { ok: false, error: "not_configured", status: 503 };
    if (useJev) outcome = await askJev(parsed.data);
    if (!outcome.ok && process.env.ANTHROPIC_API_KEY) outcome = await askClaude(parsed.data, useJev);
    if (outcome.ok === true) return reply(outcome.body, 200);
    return fail(outcome.error, outcome.status);
  },
};
