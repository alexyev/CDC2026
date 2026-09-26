// @vitest-environment node
import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json" with { type: "json" };
import { INTENT_JSON_SCHEMA, parseIntent } from "./format.js";
import type { Intent } from "./schema.js";

type Node = { [key: string]: unknown };

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of Object.values((node.properties as Record<string, Node>) ?? {})) walk(child, visit);
  if (node.items) walk(node.items as Node, visit);
}

const schema = INTENT_JSON_SCHEMA as {
  required: string[];
  properties: {
    action: { enum: string[] };
    layers: { items: { enum: string[] }; description: string };
    places: { items: { required: string[]; properties: { kind: { enum: string[] } } } };
  };
};

describe("INTENT_JSON_SCHEMA", () => {
  it("constrains layers to the closed catalog list with a real enum", () => {
    expect(schema.properties.layers.items.enum).toEqual(catalog.layers.map((l) => l.id));
  });

  it("keeps the other enums and the required fields", () => {
    expect(schema.required).toEqual(["action", "layers", "places"]);
    expect(schema.properties.action.enum).toEqual(["explore", "compare", "profile", "clear"]);
    expect(schema.properties.places.items.required).toEqual(["query", "kind"]);
    expect(schema.properties.places.items.properties.kind.enum).toContain("unknown");
  });

  it("closes every object and drops every keyword structured outputs rejects", () => {
    walk(INTENT_JSON_SCHEMA, (node) => {
      if (node.type === "object") expect(node.additionalProperties).toBe(false);
      for (const key of ["$schema", "$ref", "minLength", "maxLength", "maxItems", "minimum", "maximum"]) {
        expect(node).not.toHaveProperty(key);
      }
    });
  });

  it("keeps the dropped limits as description hints", () => {
    expect(schema.properties.layers.description).toBe("{maxItems: 2}");
  });
});

describe("parseIntent", () => {
  const intent: Intent = { action: "explore", layers: ["poverty"], places: [{ query: "Texas", kind: "state" }] };

  it("returns a valid intent", () => {
    expect(parseIntent(JSON.stringify(intent))).toEqual(intent);
  });

  it.each([
    ["no text", undefined],
    ["non-JSON text", "poverty in Texas"],
    ["an unknown layer", JSON.stringify({ ...intent, layers: ["poverty_rate"] })],
    ["an empty place query", JSON.stringify({ ...intent, places: [{ query: "", kind: "state" }] })],
  ])("returns null for %s", (_name, text) => {
    expect(parseIntent(text)).toBeNull();
  });

  it("strips fields outside the schema, so no camera or id can pass through", () => {
    expect(parseIntent(JSON.stringify({ ...intent, camera: { lon: 0, lat: 0, zoom: 3 } }))).toEqual(intent);
  });
});
