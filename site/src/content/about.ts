import aboutSource from "./about.md?raw";
import { parseMarkdown, plainText, type Block, type Inline } from "./markdown";

/** Prefix for every element id inside the About dialog, so `#about-connecticut` can deep-link a section. */
export const ABOUT_ID_PREFIX = "about-";

export interface AboutSection {
  id: string;
  title: Inline[];
  blocks: Block[];
}

export interface AboutContent {
  title: string;
  intro: Block[];
  sections: AboutSection[];
}

/** Splits the parsed page at its `##` headings; the `#` heading is the dialog title. */
export function buildAboutContent(source: string): AboutContent {
  let title = "About";
  const intro: Block[] = [];
  const sections: AboutSection[] = [];
  for (const block of parseMarkdown(source)) {
    if (block.type === "heading" && block.depth === 1) title = plainText(block.children);
    else if (block.type === "heading" && block.depth === 2)
      sections.push({ id: ABOUT_ID_PREFIX + block.id, title: block.children, blocks: [] });
    else if (sections.length) sections[sections.length - 1].blocks.push(block);
    else intro.push(block);
  }
  return { title, intro, sections };
}

/** The About and Data page (SPEC.md 15), authored in about.md. */
export const aboutContent = buildAboutContent(aboutSource);
