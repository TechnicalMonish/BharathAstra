import type {
  ExtractedSection,
  ProcessedQuery,
  CodeExample,
  Parameter,
} from "@aws-intel/shared";

// --- Constants ---

const MAX_CODE_EXAMPLES = 10;

// --- Helper: detect if a code block looks complete/runnable ---

function isRunnableExample(code: string, language: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length === 0) return false;

  // Language-specific heuristics for completeness
  switch (language) {
    case "python":
      return (
        trimmed.includes("import ") ||
        trimmed.includes("def ") ||
        trimmed.includes("class ") ||
        trimmed.split("\n").length >= 2
      );
    case "javascript":
    case "typescript":
    case "js":
    case "ts":
      return (
        trimmed.includes("import ") ||
        trimmed.includes("require(") ||
        trimmed.includes("const ") ||
        trimmed.includes("function ") ||
        trimmed.split("\n").length >= 2
      );
    case "bash":
    case "sh":
    case "shell":
      return trimmed.includes("aws ") || trimmed.split("\n").length >= 1;
    case "json":
    case "yaml":
    case "yml":
      return trimmed.split("\n").length >= 2;
    default:
      return trimmed.split("\n").length >= 2;
  }
}

// --- Helper: compute relevance of code to query ---

function computeCodeRelevance(
  code: string,
  description: string,
  query: ProcessedQuery
): number {
  const combined = (code + " " + description).toLowerCase();
  const terms = [
    ...query.keywords,
    ...query.awsServices.map((s) => s.toLowerCase()),
    ...query.concepts.map((c) => c.toLowerCase()),
  ];

  if (terms.length === 0) return 0.5;

  let matches = 0;
  for (const term of terms) {
    if (combined.includes(term)) {
      matches++;
    }
  }

  return matches / terms.length;
}

// --- Helper: extract description from surrounding text ---

function extractDescription(
  content: string,
  codeBlockStart: number,
  sectionTitle: string
): string {
  // Look at the text before the code block for a description
  const textBefore = content.slice(Math.max(0, codeBlockStart - 200), codeBlockStart).trim();
  const lines = textBefore.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    // Use the last non-empty line before the code block if it looks like a description
    if (lastLine.length > 10 && lastLine.length < 300) {
      return lastLine;
    }
  }

  return `Code example from ${sectionTitle}`;
}

// --- Identify configurable parameters in code ---

function identifyConfigurableParams(
  code: string,
  language: string
): Parameter[] {
  const params: Parameter[] = [];
  const seen = new Set<string>();

  // Pattern 1: Angle-bracket placeholders like <BUCKET_NAME>
  const angleBracketPattern = /<([A-Z][A-Z0-9_]+)>/g;
  let match: RegExpExecArray | null;
  while ((match = angleBracketPattern.exec(code)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      params.push({
        name,
        description: `Configurable parameter: ${name}`,
      });
    }
  }

  // Pattern 2: ${VAR_NAME} placeholders
  const dollarBracePattern = /\$\{([A-Z][A-Z0-9_]+)\}/g;
  while ((match = dollarBracePattern.exec(code)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      params.push({
        name,
        description: `Configurable parameter: ${name}`,
      });
    }
  }

  // Pattern 3: YOUR_ prefixed placeholders
  const yourPattern = /\b(YOUR_[A-Z][A-Z0-9_]*)\b/g;
  while ((match = yourPattern.exec(code)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      params.push({
        name,
        description: `Configurable parameter: ${name}`,
      });
    }
  }

  // Pattern 4: Language-specific environment variable patterns
  if (["bash", "sh", "shell"].includes(language)) {
    const envVarPattern = /\$([A-Z][A-Z0-9_]+)/g;
    while ((match = envVarPattern.exec(code)) !== null) {
      const name = match[1];
      // Skip if already captured via ${} pattern
      if (!seen.has(name)) {
        seen.add(name);
        params.push({
          name,
          description: `Environment variable: ${name}`,
        });
      }
    }
  }

  // Pattern 5: xxx-placeholder-xxx style (e.g., my-bucket-name, your-account-id)
  const dashPlaceholderPattern = /\b((?:my|your|example)-[a-z][a-z0-9-]+)\b/g;
  while ((match = dashPlaceholderPattern.exec(code)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      params.push({
        name,
        description: `Placeholder value: ${name}`,
      });
    }
  }

  return params;
}

// --- Extract inline code snippets for configuration values ---

function extractInlineCodeSnippets(content: string): CodeExample[] {
  const examples: CodeExample[] = [];
  const inlinePattern = /`([^`]{5,80})`/g;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(content)) !== null) {
    const snippet = match[1].trim();

    // Only extract inline code that looks like configuration values
    const isConfig =
      snippet.includes("=") ||
      snippet.includes("--") ||
      snippet.startsWith("aws ") ||
      /^[A-Z_]+=/.test(snippet) ||
      /^\w+:\s/.test(snippet);

    if (isConfig) {
      examples.push({
        language: "text",
        code: snippet,
        description: "Inline configuration snippet",
        sourceSection: { sectionNumber: "", title: "" },
        configurableParams: identifyConfigurableParams(snippet, "text"),
      });
    }
  }

  return examples;
}

// --- Extract fenced code blocks ---

function extractFencedCodeBlocks(
  section: ExtractedSection,
  query: ProcessedQuery
): CodeExample[] {
  const examples: CodeExample[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(section.content)) !== null) {
    const language = match[1] || "text";
    const code = match[2].trim();

    if (code.length === 0) continue;

    const description = extractDescription(
      section.content,
      match.index,
      section.sectionTitle
    );

    const params = identifyConfigurableParams(code, language);

    examples.push({
      language,
      code,
      description,
      sourceSection: {
        sectionNumber: section.sectionNumber,
        title: section.sectionTitle,
      },
      configurableParams: params,
    });
  }

  return examples;
}

// --- CodeExtractor class ---

export class CodeExtractor {
  /**
   * Extract code examples from documentation sections, ordered by relevance.
   * Detects fenced code blocks and inline configuration snippets.
   * Prioritizes complete, runnable examples.
   */
  extractCodeExamples(
    sections: ExtractedSection[],
    query: ProcessedQuery
  ): CodeExample[] {
    const allExamples: CodeExample[] = [];

    for (const section of sections) {
      // Extract fenced code blocks
      const fenced = extractFencedCodeBlocks(section, query);
      allExamples.push(...fenced);

      // Extract inline configuration snippets
      const inline = extractInlineCodeSnippets(section.content);
      // Attach source section info to inline snippets
      for (const snippet of inline) {
        snippet.sourceSection = {
          sectionNumber: section.sectionNumber,
          title: section.sectionTitle,
        };
      }
      allExamples.push(...inline);
    }

    // Sort: runnable examples first, then by relevance to query
    const scored = allExamples.map((ex) => ({
      example: ex,
      runnable: isRunnableExample(ex.code, ex.language),
      relevance: computeCodeRelevance(ex.code, ex.description, query),
    }));

    scored.sort((a, b) => {
      // Runnable examples first
      if (a.runnable !== b.runnable) return a.runnable ? -1 : 1;
      // Then by relevance
      return b.relevance - a.relevance;
    });

    return scored.slice(0, MAX_CODE_EXAMPLES).map((s) => s.example);
  }

  /**
   * Identify configurable parameters in a code snippet.
   * Detects placeholders, environment variables, and common placeholder patterns.
   */
  identifyConfigurableParams(code: string, language: string): Parameter[] {
    return identifyConfigurableParams(code, language);
  }
}

// Export helpers for testing
export {
  isRunnableExample,
  computeCodeRelevance,
  extractDescription,
  identifyConfigurableParams,
  extractInlineCodeSnippets,
  extractFencedCodeBlocks,
  MAX_CODE_EXAMPLES,
};
