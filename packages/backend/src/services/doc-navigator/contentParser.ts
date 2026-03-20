/**
 * Content Parser
 * Parses HTML content from AWS documentation into structured sections.
 * Extracts text, code blocks, and metadata while removing navigation elements.
 */

import type {
  ParsedDocument,
  ParsedSection,
  CodeBlock,
  DocumentMetadata,
} from "@aws-intel/shared";

// --- Configuration ---

const ELEMENTS_TO_REMOVE = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "noscript",
  "iframe",
  ".awsui-app-layout__navigation",
  ".awsui-app-layout__tools",
  "#awsdocs-nav",
  "#aws-nav",
  ".feedback-section",
  ".breadcrumb",
  ".prev-next-links",
  "#main-col-footer",
];

const CODE_LANGUAGE_MAP: Record<string, string> = {
  python: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  java: "java",
  csharp: "csharp",
  "c#": "csharp",
  go: "go",
  golang: "go",
  ruby: "ruby",
  rb: "ruby",
  php: "php",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  sql: "sql",
  cli: "bash",
  "aws-cli": "bash",
};

// --- HTML Parsing Utilities ---

function removeElements(html: string): string {
  let cleaned = html;

  // Remove script and style tags with content
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Remove common navigation elements by tag
  const tagsToRemove = ["nav", "header", "footer", "iframe"];
  for (const tag of tagsToRemove) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    cleaned = cleaned.replace(regex, "");
  }

  // Remove elements by class/id patterns
  const classPatterns = [
    /class="[^"]*awsui-app-layout__navigation[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /class="[^"]*awsui-app-layout__tools[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /class="[^"]*feedback-section[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /class="[^"]*breadcrumb[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /class="[^"]*prev-next[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /id="awsdocs-nav"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /id="aws-nav"[^>]*>[\s\S]*?<\/[^>]+>/gi,
    /id="main-col-footer"[^>]*>[\s\S]*?<\/[^>]+>/gi,
  ];

  for (const pattern of classPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned;
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&ndash;": "–",
    "&mdash;": "—",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, num) =>
    String.fromCharCode(parseInt(num, 10))
  );
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return decoded;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

function cleanText(html: string): string {
  const stripped = stripHtmlTags(html);
  const decoded = decodeHtmlEntities(stripped);
  return normalizeWhitespace(decoded);
}

// --- Code Block Extraction ---

function detectLanguage(codeElement: string): string {
  // Check for language class
  const classMatch = codeElement.match(/class="[^"]*(?:language-|lang-)(\w+)[^"]*"/i);
  if (classMatch) {
    const lang = classMatch[1].toLowerCase();
    return CODE_LANGUAGE_MAP[lang] || lang;
  }

  // Check for data-language attribute
  const dataMatch = codeElement.match(/data-language="(\w+)"/i);
  if (dataMatch) {
    const lang = dataMatch[1].toLowerCase();
    return CODE_LANGUAGE_MAP[lang] || lang;
  }

  // Check for AWS-specific code tabs
  const tabMatch = codeElement.match(/data-tab="(\w+)"/i);
  if (tabMatch) {
    const lang = tabMatch[1].toLowerCase();
    return CODE_LANGUAGE_MAP[lang] || lang;
  }

  return "text";
}

function extractCodeBlocks(html: string): CodeBlock[] {
  const codeBlocks: CodeBlock[] = [];

  // Match <pre><code> blocks
  const preCodeRegex = /<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi;
  let match: RegExpExecArray | null;

  while ((match = preCodeRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const codeContent = match[1];
    const language = detectLanguage(fullMatch);
    const code = cleanText(codeContent);

    if (code.trim()) {
      // Get surrounding context (text before the code block)
      const beforeIndex = Math.max(0, match.index - 200);
      const contextHtml = html.slice(beforeIndex, match.index);
      const context = cleanText(contextHtml).slice(-100);

      codeBlocks.push({
        language,
        code: code.trim(),
        context: context.trim(),
      });
    }
  }

  // Match standalone <code> blocks (not inside <pre>)
  const codeOnlyRegex = /<code[^>]*>([\s\S]*?)<\/code>/gi;
  while ((match = codeOnlyRegex.exec(html)) !== null) {
    const codeContent = match[1];
    // Skip if this is a short inline code
    if (codeContent.length < 50 || !codeContent.includes("\n")) {
      continue;
    }

    const language = detectLanguage(match[0]);
    const code = cleanText(codeContent);

    if (code.trim() && !codeBlocks.some((cb) => cb.code === code.trim())) {
      codeBlocks.push({
        language,
        code: code.trim(),
        context: "",
      });
    }
  }

  return codeBlocks;
}

// --- Section Extraction ---

interface HeadingMatch {
  level: number;
  title: string;
  id: string;
  index: number;
  endIndex: number;
}

function extractHeadings(html: string): HeadingMatch[] {
  const headings: HeadingMatch[] = [];
  const headingRegex = /<h([1-6])[^>]*(?:id="([^"]*)")?[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const id = match[2] || `section-${headings.length}`;
    const title = cleanText(match[3]);

    if (title.trim()) {
      headings.push({
        level,
        title: title.trim(),
        id,
        index: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  return headings;
}

function extractSectionContent(
  html: string,
  startIndex: number,
  endIndex: number
): string {
  const sectionHtml = html.slice(startIndex, endIndex);
  return cleanText(sectionHtml);
}

function buildSectionHierarchy(headings: HeadingMatch[]): Map<string, string | undefined> {
  const parentMap = new Map<string, string | undefined>();
  const stack: HeadingMatch[] = [];

  for (const heading of headings) {
    // Pop headings from stack that are same level or higher
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    // Parent is the top of the stack (if any)
    const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;
    parentMap.set(heading.id, parent?.id);

    stack.push(heading);
  }

  return parentMap;
}

function extractSections(html: string): ParsedSection[] {
  const cleanedHtml = removeElements(html);
  const headings = extractHeadings(cleanedHtml);
  const parentMap = buildSectionHierarchy(headings);
  const sections: ParsedSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const nextHeading = headings[i + 1];

    // Content is between this heading and the next (or end of document)
    const contentStart = heading.endIndex;
    const contentEnd = nextHeading ? nextHeading.index : cleanedHtml.length;

    const content = extractSectionContent(cleanedHtml, contentStart, contentEnd);
    const sectionHtml = cleanedHtml.slice(heading.index, contentEnd);
    const codeBlocks = extractCodeBlocks(sectionHtml);

    sections.push({
      id: heading.id,
      title: heading.title,
      content,
      level: heading.level,
      parentId: parentMap.get(heading.id),
      codeBlocks,
    });
  }

  // If no headings found, create a single section from the whole content
  if (sections.length === 0) {
    const content = cleanText(cleanedHtml);
    const codeBlocks = extractCodeBlocks(cleanedHtml);

    if (content.trim()) {
      sections.push({
        id: "main",
        title: "Main Content",
        content,
        level: 1,
        parentId: undefined,
        codeBlocks,
      });
    }
  }

  return sections;
}

// --- Metadata Extraction ---

function extractMetadata(html: string, url: string): DocumentMetadata {
  // Extract last updated date
  const datePatterns = [
    /Last updated:\s*([^<\n]+)/i,
    /Updated:\s*([^<\n]+)/i,
    /<meta[^>]*name="date"[^>]*content="([^"]+)"/i,
    /<time[^>]*datetime="([^"]+)"/i,
  ];

  let lastUpdated: string | undefined;
  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    if (match) {
      lastUpdated = match[1].trim();
      break;
    }
  }

  // Extract service from URL
  const urlParts = new URL(url).pathname.split("/").filter(Boolean);
  const service = urlParts[0] || "aws";

  // Extract category from breadcrumb or URL
  let category = "General";
  const breadcrumbMatch = html.match(
    /class="[^"]*breadcrumb[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i
  );
  if (breadcrumbMatch) {
    category = cleanText(breadcrumbMatch[1]);
  } else if (urlParts.length > 1) {
    category = urlParts[1].replace(/-/g, " ");
  }

  return {
    lastUpdated,
    service,
    category,
  };
}

// --- Title Extraction ---

function extractTitle(html: string): string {
  // Try <title> tag first
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    let title = titleMatch[1].trim();
    // Remove common suffixes
    title = title
      .replace(/\s*\|.*$/, "")
      .replace(/\s*-\s*AWS.*$/i, "")
      .replace(/\s*-\s*Amazon.*$/i, "");
    return title;
  }

  // Try <h1> tag
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return cleanText(h1Match[1]);
  }

  return "Untitled Document";
}

// --- Main Parser Class ---

export class ContentParser {
  /**
   * Parse HTML content into a structured document.
   */
  parseHtml(html: string, url: string): ParsedDocument {
    const title = extractTitle(html);
    const sections = extractSections(html);
    const codeBlocks = extractCodeBlocks(html);
    const metadata = extractMetadata(html, url);

    return {
      title,
      url,
      sections,
      codeBlocks,
      metadata,
    };
  }

  /**
   * Extract sections from a parsed document.
   */
  extractSections(document: ParsedDocument): ParsedSection[] {
    return document.sections;
  }

  /**
   * Extract code blocks from HTML content.
   */
  extractCodeBlocks(html: string): CodeBlock[] {
    return extractCodeBlocks(html);
  }

  /**
   * Clean and normalize text content.
   */
  cleanText(html: string): string {
    return cleanText(html);
  }

  /**
   * Remove navigation and non-content elements from HTML.
   */
  removeNonContentElements(html: string): string {
    return removeElements(html);
  }
}

// Export utilities for testing
export {
  removeElements,
  decodeHtmlEntities,
  stripHtmlTags,
  normalizeWhitespace,
  cleanText,
  detectLanguage,
  extractCodeBlocks,
  extractHeadings,
  extractSections,
  extractMetadata,
  extractTitle,
  CODE_LANGUAGE_MAP,
  ELEMENTS_TO_REMOVE,
};
