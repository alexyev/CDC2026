// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
import Anthropic from "@anthropic-ai/sdk";
import { Messages } from "@anthropic-ai/sdk/resources/messages";
import * as TypeSafe from "@typesafe-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../command.js";
import { INTENT_JSON_SCHEMA } from "./format.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { resetRateLimit } from "./ratelimit.js";
import type { Intent } from "./schema.js";

// Handler tests with the SDKs' messages.create and systemOne mocked (SPEC.md section 14.7).

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK's generic systemOne() signature is irrelevant here
let systemOne: any;

beforeEach(() => {
  resetRateLimit();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("TYPESAFE_API_KEY", "");
  create = vi.spyOn(Messages.prototype, "create");
  systemOne = vi.spyOn(TypeSafe.TypeSafeClient.prototype, "systemOne");
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

  it("answers 503 not_configured without either key and never calls an API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await handler.fetch(post(BODY));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "not_configured" });
    expect(create).not.toHaveBeenCalled();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it.each([
    [
      "more than 20 candidates",
      Array.from({ length: 21 }, (_, i) => ({ label: `P${i}`, kind: "city", text: "p", start: 0 })),
    ],
    ["duplicate labels", [0, 1].map(() => ({ label: "Texas", kind: "state", text: "Texas", start: 0 }))],
    ["an unknown kind", [{ label: "Mars", kind: "planet", text: "Mars", start: 0 }]],
  ])("answers 400 to %s", async (_name, candidates) => {
    const res = await handler.fetch(post({ ...BODY, candidates }));
    expect(res.status).toBe(400);
  });
});

describe("happy path", () => {
  it("returns the validated intent and the model", async () => {
    create.mockResolvedValue(message(JSON.stringify(INTENT)));
    const res = await handler.fetch(post(BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, engine: "claude", intent: INTENT, model: "claude-haiku-4-5" });
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

describe("engine order: Jev, then Claude, then the browser's local parser", () => {
  const CANDIDATES = [
    { label: "Los Angeles County, California", kind: "county", state: "California", text: "LA County", start: 31 },
    { label: "California", kind: "state", text: "California", start: 45 },
  ];
  const choice = (value: string) => ({ type: "choice", choice: value, confidence: 1, probabilities: { [value]: 1 } });
  const JEV_RESULT = {
    model: "jev-1.13.0",
    usage: { input_tokens: 3000, output_tokens: 60 },
    answers: {
      action: choice("compare"),
      layer_1: choice("crime"),
      layer_2: choice("education"),
      place_1: choice("Los Angeles County, California"),
      place_2: choice("California"),
      percentile: { type: "noul", noul: 0.03 },
    },
  };
  const JEV_BODY = { ...BODY, candidates: CANDIDATES };

  beforeEach(() => vi.stubEnv("TYPESAFE_API_KEY", "test-typesafe-key"));

  it("answers with Jev when its key is set, and never calls Claude", async () => {
    systemOne.mockResolvedValue(JEV_RESULT);
    const res = await handler.fetch(post(JEV_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      engine: "jev",
      model: "jev-1.13.0",
      intent: INTENT,
      picks: ["Los Angeles County, California", "California"],
    });
    expect(create).not.toHaveBeenCalled();
    const [request] = systemOne.mock.calls[0];
    expect(request.model).toBe("jev-1.13.0");
    expect(request.state).toEqual({ request: BODY.text });
    expect(Object.keys(request.questions).sort()).toEqual(
      ["action", "layer_1", "layer_2", "percentile", "place_1", "place_2"].sort(),
    );
  });

  it.each([
    ["a timeout", new TypeSafe.APITimeoutError(2500)],
    ["a rate limit", new TypeSafe.RateLimitError(429, undefined, new Headers())],
    ["a server error", new TypeSafe.InternalServerError(529, undefined, new Headers())],
    ["an answer it cannot map", null],
  ])("falls back to Claude on %s, with a budget that fits the browser's cap", async (_name, error) => {
    if (error) systemOne.mockRejectedValue(error);
    else
      systemOne.mockResolvedValue({ ...JEV_RESULT, answers: { ...JEV_RESULT.answers, layer_1: choice("crime_rate") } });
    create.mockResolvedValue(message(JSON.stringify(INTENT)));
    const res = await handler.fetch(post(JEV_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, engine: "claude", intent: INTENT, model: "claude-haiku-4-5" });
    expect(create.mock.calls[0][1]).toEqual({ timeout: 5_000, maxRetries: 0 });
  });

  it.each([
    ["APITimeoutError", new TypeSafe.APITimeoutError(2500), 503, "upstream_unreachable"],
    ["APIConnectionError", new TypeSafe.APIConnectionError("down"), 503, "upstream_unreachable"],
    ["RateLimitError", new TypeSafe.RateLimitError(429, undefined, new Headers()), 503, "upstream_rate_limited"],
    ["AuthenticationError", new TypeSafe.AuthenticationError(401, undefined, new Headers()), 502, "upstream_error"],
    ["a plain TypeSafeError", new TypeSafe.TypeSafeError("misconfigured"), 500, "unknown"],
  ])("without a Claude key, maps Jev's %s so the browser runs its local parser", async (_name, error, status, code) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    systemOne.mockRejectedValue(error);
    const res = await handler.fetch(post(JEV_BODY));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, error: code });
    expect(create).not.toHaveBeenCalled();
  });

  it("reports Claude's error when both engines fail", async () => {
    systemOne.mockRejectedValue(new TypeSafe.APITimeoutError(2500));
    create.mockResolvedValue(message("", "refusal"));
    const res = await handler.fetch(post(JEV_BODY));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "no_parse" });
  });

  it("returns a low-confidence answer as a question for the browser", async () => {
    systemOne.mockResolvedValue({
      ...JEV_RESULT,
      answers: {
        ...JEV_RESULT.answers,
        layer_1: {
          type: "choice",
          choice: "crime",
          confidence: 0.2,
          probabilities: { crime: 0.45, violent_crime: 0.4, none: 0.15 },
        },
      },
    });
    const body = await (await handler.fetch(post(JEV_BODY))).json();
    expect(body.ask).toEqual({ kind: "layer", index: 0, options: ["crime", "violent_crime"] });
  });
});
