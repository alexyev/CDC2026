import { describe, expect, it } from "vitest";
import aboutSource from "./about.md?raw";
import { aboutContent, buildAboutContent } from "./about";
import { plainText, type Block } from "./markdown";

function blockText(block: Block): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return plainText(block.children);
    case "list":
      return block.items.map(plainText).join("\n");
    case "directive":
      return "";
  }
}

function sectionText(title: string): string {
  const section = aboutContent.sections.find((s) => plainText(s.title) === title);
  if (!section) throw new Error(`missing section ${title}`);
  return section.blocks.map(blockText).join("\n");
}

describe("About and Data content (SPEC.md 15)", () => {
  it("has the six sections in the specified order", () => {
    expect(aboutContent.title).toBe("About Schoolscape");
    expect(aboutContent.sections.map((s) => plainText(s.title))).toEqual([
      "What this is",
      "How to read it",
      "Data",
      "Method",
      "Known gaps",
      "Built with",
    ]);
    expect(aboutContent.sections.map((s) => s.id)).toEqual([
      "about-what-this-is",
      "about-how-to-read-it",
      "about-data",
      "about-method",
      "about-known-gaps",
      "about-built-with",
    ]);
  });

  it("says what this is in two sentences and mentions CDC 2026", () => {
    const text = sectionText("What this is");
    expect(text.match(/[.!?](\s|$)/g)).toHaveLength(2);
    expect(text).toContain("Carolina Data Challenge 2026");
  });

  it("explains every reading aid", () => {
    const text = sectionText("How to read it");
    for (const topic of [
      "Levels.",
      "bivariate choropleth",
      "Two correlation numbers.",
      "ecological fallacy",
      "County-level measures.",
      "Favorites.",
      "The command bar.",
    ]) {
      expect(text).toContain(topic);
    }
    const directives = aboutContent.sections[1].blocks.filter((b) => b.type === "directive");
    expect(directives).toEqual([{ type: "directive", name: "bivariate-legend" }]);
  });

  it("carries every citation and license line", () => {
    const text = sectionText("Data");
    for (const line of [
      // ODIS v3, exactly as in data/README.md
      'Hawken, Angela; Minar, Nicholas; Choudhary, Raj; Kulick, Jonathan, 2026, "Open Data Index for Schools (ODIS)", https://doi.org/10.7281/T170WN53, Johns Hopkins Research Data Repository, V1.',
      "Creative Commons Attribution 4.0 International (CC BY 4.0)",
      // NCESSCH correction
      "19,154 IDs were restored",
      'data/README.md, "Corrected NCESSCH IDs"',
      // Connecticut fill sources and credit lines
      "American Community Survey 2019-2023",
      "University of Wisconsin Population Health Institute. County Health Rankings & Roadmaps 2025. www.countyhealthrankings.org.",
      "Connecticut Department of Public Health, Vital Statistics Registration Report 2024. Credit: Connecticut Department of Public Health.",
      "CT Data Collaborative, 2022 tract crosswalk",
      "Credit: CT Data Collaborative.",
      // Locations, boundaries, basemap
      "EDGE Public School Geocodes 2022-23",
      "Cartographic Boundary Files 2023",
      "OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors",
      "Open Database License (ODbL)",
    ]) {
      expect(text).toContain(line);
    }
  });

  it("links the data README anchors", () => {
    expect(aboutSource).toContain("https://github.com/alexyev/CDC2026/blob/main/data/README.md#corrected-ncessch-ids");
    expect(aboutSource).toContain("https://github.com/alexyev/CDC2026/blob/main/data/README.md#connecticut-fill");
    expect(aboutSource).toContain("https://doi.org/10.7281/T170WN53");
  });

  it("states the method", () => {
    const text = sectionText("Method");
    for (const phrase of [
      "unweighted mean",
      "fixed nationally",
      "Spearman",
      "bootstrap",
      "Bonett-Wright",
      "Pairwise deletion",
      "No imputation",
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("lists the known gaps and the Connecticut paragraph", () => {
    const section = aboutContent.sections.find((s) => s.id === "about-known-gaps")!;
    const text = sectionText("Known gaps");
    expect(text).toContain("Connecticut and Puerto Rico");
    expect(text).toContain("Lead exposure risk and Park access are missing for about half of schools");
    expect(section.blocks).toContainEqual(expect.objectContaining({ type: "heading", depth: 3, id: "connecticut" }));
    for (const phrase of [
      "2022 planning-region codes",
      "County Health Rankings release ODIS used has only the old counties",
      "recomputes Connecticut's domain scores",
      "Crime, Violent crime rate, and Incarceration rate stay missing because ODIS's crime sources have no per-area Connecticut data",
      "Lead exposure is an approximation recomputed from ACS data",
      "park access is a planning-region proxy",
      'data/README.md, "Connecticut fill"',
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it("ends with the stack and the AI credit line", () => {
    const text = sectionText("Built with");
    for (const name of ["React 19", "MapLibre GL JS", "deck.gl", "Claude Haiku 4.5", "Vercel"])
      expect(text).toContain(name);
    expect(text).toContain(
      "The specification and the code were produced by AI agents (Claude) directed by Alexander Yevchenko for the Carolina Data Challenge 2026.",
    );
  });

  it("puts blocks before the first section into the intro", () => {
    const content = buildAboutContent("# T\nLead.\n## S\nBody.");
    expect(content.title).toBe("T");
    expect(content.intro.map(blockText)).toEqual(["Lead."]);
    expect(content.sections[0].blocks.map(blockText)).toEqual(["Body."]);
  });
});
