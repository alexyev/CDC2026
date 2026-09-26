// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk";
import { Messages } from "@anthropic-ai/sdk/resources/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../command.js";
import { INTENT_JSON_SCHEMA } from "./format.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { resetRateLimit } from "./ratelimit.js";
import type { Intent } from "./schema.js";

// Handler tests with the SDK's messages.create mocked (SPEC.md section 14.7).

const INTENT: Intent = {
  action: "compare",
  layers: ["crime", "education"],
  places: [
    { query: "LA County", kind: "county", stateHint: "California" },
    { query: "California", kind: "state" },
  ],
};

const BODY = {
  text: "compare crime and education in LA County and California",
  context: { level: "nation", layers: [] },
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/command", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function message(text: string, stop_reason = "end_turn") {
  return { stop_reason, content: [{ type: "text", text }] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK's overloaded create() signature is irrelevant here
let create: any;

beforeEach(() => {
  resetRateLimit();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  create = vi.spyOn(Messages.prototype, "create");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("request validation", () => {
  it.each(["GET", "PUT", "DELETE"])("answers 405 to %s", async (method) => {
    const res = await handler.fetch(new Request("http://localhost/api/command", { method }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["an empty body", ""],
    ["a missing context", { text: "crime in Texas" }],
    ["empty text", { ...BODY, text: "" }],
    ["oversized text", { ...BODY, text: "x".repeat(301) }],
    ["an unknown level", { ...BODY, context: { level: "planet", layers: [] } }],
    ["three current layers", { ...BODY, context: { level: "nation", layers: ["a", "b", "c"] } }],
  ])("answers 400 to %s", async (_name, body) => {
    const res = await handler.fetch(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bad_request" });
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts text of exactly 300 characters", async () => {
    create.mockResolvedValue(message(JSON.stringify(INTENT)));
    const res = await handler.fetch(post({ ...BODY, text: "x".repeat(300) }));
    expect(res.status).toBe(200);
  });

  it("answers 503 not_configured without a key and never calls the API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await handler.fetch(post(BODY));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "not_configured" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  it("returns the validated intent and the model", async () => {
    create.mockResolvedValue(message(JSON.stringify(INTENT)));
    const res = await handler.fetch(post(BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, intent: INTENT, model: "claude-haiku-4-5" });
  });

  it("sends a deterministic structured-output request", async () => {
    create.mockResolvedValue(message(JSON.stringify(INTENT)));
    const context = { level: "state", layers: ["crime"], selected: "Texas" };
    await handler.fetch(post({ ...BODY, context }));
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0][0];
    expect(params).toEqual({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify({ text: BODY.text, context }) }],
      output_config: { format: { type: "json_schema", schema: INTENT_JSON_SCHEMA } },
    });
  });
});

describe("model outcomes", () => {
  it.each([
    ["a refusal", message("", "refusal")],
    ["a max_tokens cut", message('{"action":"explore","layers":["cri', "max_tokens")],
    ["no text block", { stop_reason: "end_turn", content: [] }],
    ["text that is not JSON", message("Sure! Here is the intent.")],
    ["an unknown layer id", message(JSON.stringify({ ...INTENT, layers: ["crime_rate"] }))],
    ["three layers", message(JSON.stringify({ ...INTENT, layers: ["crime", "health", "housing"] }))],
    ["a note over 140 characters", message(JSON.stringify({ ...INTENT, note: "x".repeat(141) }))],
  ])("maps %s to 422 no_parse", async (_name, response) => {
    create.mockResolvedValue(response);
    const res = await handler.fetch(post(BODY));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "no_parse" });
  });
});

describe("upstream errors", () => {
  const headers = new Headers();
  it.each([
    [
      "RateLimitError",
      new Anthropic.RateLimitError(429, undefined, "slow down", headers),
      503,
      "upstream_rate_limited",
    ],
    ["APIConnectionError", new Anthropic.APIConnectionError({ message: "down" }), 503, "upstream_unreachable"],
    ["APIConnectionTimeoutError", new Anthropic.APIConnectionTimeoutError(), 503, "upstream_unreachable"],
    ["InternalServerError", new Anthropic.InternalServerError(500, undefined, "boom", headers), 502, "upstream_error"],
    ["BadRequestError", new Anthropic.BadRequestError(400, undefined, "bad", headers), 502, "upstream_error"],
    [
      "AuthenticationError",
      new Anthropic.AuthenticationError(401, undefined, "bad key", headers),
      502,
      "upstream_error",
    ],
    ["a plain AnthropicError", new Anthropic.AnthropicError("misconfigured"), 500, "unknown"],
    ["a non-SDK error", new Error("surprise"), 500, "unknown"],
  ])("maps %s", async (_name, error, status, code) => {
    create.mockRejectedValue(error);
    const res = await handler.fetch(post(BODY));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, error: code });
  });
});

describe("rate limit", () => {
  it("answers 429 after 30 requests a minute from one IP, keyed on the first forwarded address", async () => {
    create.mockResolvedValue(message(JSON.stringify(INTENT)));
    const from = (ip: string) => post(BODY, { "x-forwarded-for": `${ip}, 10.0.0.1` });
    for (let i = 0; i < 30; i++) expect((await handler.fetch(from("203.0.113.7"))).status).toBe(200);
    const limited = await handler.fetch(from("203.0.113.7"));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: "rate_limited" });
    expect((await handler.fetch(from("198.51.100.2"))).status).toBe(200);
    expect(create).toHaveBeenCalledTimes(31);
  });
});
