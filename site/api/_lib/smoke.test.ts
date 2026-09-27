// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

// @vitest-environment node
import { describe, expect, it } from "vitest";
import handler from "../command.js";
import { compareIntent, UTTERANCES } from "./contract.js";
import type { CommandResponse } from "./schema.js";

// Real-API contract run on the 12 utterances (SPEC.md section 14.7), target 11 of 12.
// Spends real tokens, so it runs only on request:
//   COMMAND_SMOKE=1 ANTHROPIC_API_KEY=... npx vitest run api/_lib/smoke.test.ts

const enabled = process.env.COMMAND_SMOKE === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!enabled)("real-API smoke run", () => {
  it("passes at least 11 of the 12 utterances", { timeout: 180_000 }, async () => {
    const lines: string[] = [];
    let passed = 0;
    for (const { text, expected } of UTTERANCES) {
      const started = Date.now();
      const res = await handler.fetch(
        new Request("http://localhost/api/command", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "smoke" },
          body: JSON.stringify({ text, context: { level: "nation", layers: ["composite"] } }),
        }),
      );
      const body = (await res.json()) as CommandResponse;
      const problems = body.ok ? compareIntent(body.intent, expected) : [`HTTP ${res.status} ${body.error}`];
      if (problems.length === 0) passed++;
      const got = body.ok ? JSON.stringify(body.intent) : "-";
      lines.push(`${problems.length ? "FAIL" : "PASS"} ${Date.now() - started}ms  ${text}\n     ${got}`);
      for (const p of problems) lines.push(`     ! ${p}`);
    }
    console.log(`model ${process.env.COMMAND_MODEL ?? "claude-haiku-4-5"}: ${passed}/12 passed\n${lines.join("\n")}`);
    expect(passed).toBeGreaterThanOrEqual(11);
  });
});
