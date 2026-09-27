// Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, plainText, slugify } from "./markdown";

describe("parseMarkdown", () => {
  it("joins one-sentence-per-line paragraphs and splits blocks on blank lines", () => {
    const blocks = parseMarkdown("First sentence.\nSecond sentence.\n\nNext paragraph.");
    expect(blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "First sentence. Second sentence." }] },
      { type: "paragraph", children: [{ type: "text", value: "Next paragraph." }] },
    ]);
  });

  it("parses headings with slug ids from their plain text", () => {
    const [h1, h2, h3] = parseMarkdown("# About Schoolscape\n## Known gaps\n### **Connecticut**");
    expect(h1).toMatchObject({ type: "heading", depth: 1, id: "about-schoolscape" });
    expect(h2).toMatchObject({ type: "heading", depth: 2, id: "known-gaps" });
    expect(h3).toMatchObject({ type: "heading", depth: 3, id: "connecticut" });
  });

  it("parses list items with indented continuation lines", () => {
    const [list] = parseMarkdown("- One.\n  Still one.\n- Two.");
    expect(list.type).toBe("list");
    if (list.type !== "list") return;
    expect(list.items.map(plainText)).toEqual(["One. Still one.", "Two."]);
  });

  it("ends a list at a non-indented line and a paragraph at a list item", () => {
    const blocks = parseMarkdown("Intro.\n- Item.\nAfter.");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph"]);
  });

  it("turns an HTML comment line into a component directive", () => {
    expect(parseMarkdown("Text.\n\n<!-- bivariate-legend -->\n")).toContainEqual({
      type: "directive",
      name: "bivariate-legend",
    });
  });

  it("accepts CRLF line endings", () => {
    expect(parseMarkdown("## A\r\nB.\r\n").map((b) => b.type)).toEqual(["heading", "paragraph"]);
  });
});

describe("parseInline", () => {
  it("parses links, strong, emphasis, and code in order", () => {
    expect(parseInline("See [the **DOI**](https://doi.org/x), *now*, `county`.")).toEqual([
      { type: "text", value: "See " },
      {
        type: "link",
        href: "https://doi.org/x",
        children: [
          { type: "text", value: "the " },
          { type: "strong", children: [{ type: "text", value: "DOI" }] },
        ],
      },
      { type: "text", value: ", " },
      { type: "em", children: [{ type: "text", value: "now" }] },
      { type: "text", value: ", " },
      { type: "code", value: "county" },
      { type: "text", value: "." },
    ]);
  });

  it("leaves plain text alone", () => {
    expect(parseInline("ρ = 0.17 across states")).toEqual([{ type: "text", value: "ρ = 0.17 across states" }]);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Built with")).toBe("built-with");
    expect(slugify("  What this is?  ")).toBe("what-this-is");
  });
});
