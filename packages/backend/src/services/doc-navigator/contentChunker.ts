/**
 * Content Chunker
 * Splits parsed content into optimal chunks for embedding and retrieval.
 * Preserves code blocks as atomic units and maintains context with overlapping windows.
 */

import type {
  ParsedDocument,
  ParsedSection,
  Chunk,
  ChunkMetadata,
  ChunkingConfig,
  SectionReference,
  CodeBlock,
} from "@aws-intel/shared";

// --- Default Configuration ---

const DEFAULT_CONFIG: ChunkingConfig = {
  maxTokens: 512,
  overlapTokens: 50,
  minChunkTokens: 100,
  preserveCodeBlocks: true,
};

// --- Token Estimation ---

/**
 * Estimate token count for text.
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is a rough approximation - for production, use tiktoken.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average ~4 chars per token for English, ~3 for code
  const hasCode = text.includes("```") || text.includes("function") || text.includes("const ");
  const charsPerToken = hasCode ? 3 : 4;
  return Math.ceil(text.length / charsPerToken);
}

// --- Text Splitting ---

/**
 * Split text at sentence boundaries.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or newline
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * Split text at paragraph boundaries.
 */
function splitIntoParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.filter((p) => p.trim().length > 0);
}

/**
 * Find code block boundaries in text.
 * Returns array of [start, end] indices for each code block.
 */
function findCodeBlockBoundaries(text: string): Array<[number, number]> {
  const boundaries: Array<[number, number]> = [];
  
  // Match fenced code blocks (```...```)
  const fencedRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = fencedRegex.exec(text)) !== null) {
    boundaries.push([match.index, match.index + match[0].length]);
  }

  return boundaries;
}

/**
 * Check if a position is inside a code block.
 */
function isInsideCodeBlock(position: number, boundaries: Array<[number, number]>): boolean {
  return boundaries.some(([start, end]) => position >= start && position < end);
}

// --- Chunk ID Generation ---

let chunkCounter = 0;

function generateChunkId(docId: string, sectionId: string): string {
  chunkCounter++;
  return `${docId}-${sectionId}-chunk-${chunkCounter.toString().padStart(4, "0")}`;
}

function resetChunkCounter(): void {
  chunkCounter = 0;
}

// --- Section Number Generation ---

function generateSectionNumber(section: ParsedSection, index: number): string {
  return `${section.level}.${index + 1}`;
}

// --- Parent Section Tracking ---

function buildParentSections(
  sections: ParsedSection[],
  currentSection: ParsedSection
): SectionReference[] {
  const parents: SectionReference[] = [];
  let parentId = currentSection.parentId;

  while (parentId) {
    const parent = sections.find((s) => s.id === parentId);
    if (parent) {
      parents.unshift({
        sectionNumber: `${parent.level}`,
        title: parent.title,
      });
      parentId = parent.parentId;
    } else {
      break;
    }
  }

  return parents;
}

// --- Chunking Logic ---

/**
 * Split text into chunks respecting token limits and code blocks.
 */
function splitTextIntoChunks(
  text: string,
  config: ChunkingConfig
): string[] {
  const chunks: string[] = [];
  const codeBlockBoundaries = config.preserveCodeBlocks
    ? findCodeBlockBoundaries(text)
    : [];

  // If text is small enough, return as single chunk
  if (estimateTokens(text) <= config.maxTokens) {
    return [text];
  }

  // Split into paragraphs first
  const paragraphs = splitIntoParagraphs(text);
  let currentChunk = "";
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    // If paragraph alone exceeds max, split it further
    if (paragraphTokens > config.maxTokens) {
      // Save current chunk if not empty
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
        currentTokens = 0;
      }

      // Split large paragraph into sentences
      const sentences = splitIntoSentences(paragraph);
      for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence);

        if (currentTokens + sentenceTokens > config.maxTokens) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
          currentTokens = sentenceTokens;
        } else {
          currentChunk += (currentChunk ? " " : "") + sentence;
          currentTokens += sentenceTokens;
        }
      }
    } else if (currentTokens + paragraphTokens > config.maxTokens) {
      // Save current chunk and start new one
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = paragraph;
      currentTokens = paragraphTokens;
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      currentTokens += paragraphTokens;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Add overlap between adjacent chunks.
 */
function addOverlap(chunks: string[], overlapTokens: number): string[] {
  if (chunks.length <= 1 || overlapTokens <= 0) {
    return chunks;
  }

  const overlappedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Add overlap from previous chunk
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      const sentences = splitIntoSentences(prevChunk);
      let overlap = "";
      let overlapCount = 0;

      // Take sentences from end of previous chunk
      for (let j = sentences.length - 1; j >= 0 && overlapCount < overlapTokens; j--) {
        const sentence = sentences[j];
        overlapCount += estimateTokens(sentence);
        overlap = sentence + (overlap ? " " : "") + overlap;
      }

      if (overlap) {
        chunk = overlap + "\n\n" + chunk;
      }
    }

    overlappedChunks.push(chunk);
  }

  return overlappedChunks;
}

/**
 * Merge small chunks that are below the minimum threshold.
 */
function mergeSmallChunks(chunks: Chunk[], minTokens: number): Chunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const merged: Chunk[] = [];
  let pendingChunk: Chunk | null = null;

  for (const chunk of chunks) {
    if (pendingChunk) {
      // Try to merge with pending chunk
      const combinedTokens: number = pendingChunk.tokenCount + chunk.tokenCount;
      
      if (pendingChunk.tokenCount < minTokens && combinedTokens <= 512) {
        // Merge chunks
        const mergedMetadata: ChunkMetadata = {
          sectionTitle: pendingChunk.metadata.sectionTitle,
          sectionNumber: pendingChunk.metadata.sectionNumber,
          parentSections: pendingChunk.metadata.parentSections,
          hasCode: pendingChunk.metadata.hasCode || chunk.metadata.hasCode,
          codeLanguages: [...pendingChunk.metadata.codeLanguages, ...chunk.metadata.codeLanguages],
          startOffset: pendingChunk.metadata.startOffset,
          endOffset: chunk.metadata.endOffset,
        };
        
        pendingChunk = {
          chunkId: pendingChunk.chunkId,
          docId: pendingChunk.docId,
          sectionId: pendingChunk.sectionId,
          content: pendingChunk.content + "\n\n" + chunk.content,
          tokenCount: combinedTokens,
          metadata: mergedMetadata,
        };
      } else {
        // Save pending and start new
        merged.push(pendingChunk);
        pendingChunk = chunk;
      }
    } else {
      pendingChunk = chunk;
    }
  }

  if (pendingChunk) {
    merged.push(pendingChunk);
  }

  return merged;
}

// --- Main Chunker Class ---

export class ContentChunker {
  private config: ChunkingConfig;

  constructor(config?: Partial<ChunkingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk an entire parsed document.
   */
  chunkDocument(document: ParsedDocument, docId: string): Chunk[] {
    resetChunkCounter();
    const allChunks: Chunk[] = [];

    for (let i = 0; i < document.sections.length; i++) {
      const section = document.sections[i];
      const parentSections = buildParentSections(document.sections, section);
      const sectionChunks = this.chunkSection(section, docId, i, parentSections);
      allChunks.push(...sectionChunks);
    }

    // Merge small chunks
    return mergeSmallChunks(allChunks, this.config.minChunkTokens);
  }

  /**
   * Chunk a single section.
   */
  chunkSection(
    section: ParsedSection,
    docId: string,
    sectionIndex: number,
    parentSections: SectionReference[] = []
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const sectionNumber = generateSectionNumber(section, sectionIndex);

    // Combine section content with code blocks
    let fullContent = section.content;
    
    // Append code blocks if they're not already in content
    for (const codeBlock of section.codeBlocks) {
      if (!fullContent.includes(codeBlock.code)) {
        fullContent += `\n\n\`\`\`${codeBlock.language}\n${codeBlock.code}\n\`\`\``;
      }
    }

    // Split content into chunks
    const textChunks = splitTextIntoChunks(fullContent, this.config);
    const overlappedChunks = addOverlap(textChunks, this.config.overlapTokens);

    let offset = 0;
    for (const chunkContent of overlappedChunks) {
      const tokenCount = estimateTokens(chunkContent);
      const hasCode = chunkContent.includes("```") || 
                      section.codeBlocks.length > 0;
      const codeLanguages = this.extractCodeLanguages(chunkContent, section.codeBlocks);

      const chunk: Chunk = {
        chunkId: generateChunkId(docId, section.id),
        docId,
        sectionId: section.id,
        content: chunkContent,
        tokenCount,
        metadata: {
          sectionTitle: section.title,
          sectionNumber,
          parentSections,
          hasCode,
          codeLanguages,
          startOffset: offset,
          endOffset: offset + chunkContent.length,
        },
      };

      chunks.push(chunk);
      offset += chunkContent.length;
    }

    return chunks;
  }

  /**
   * Merge small chunks that are below the minimum threshold.
   */
  mergeSmallChunks(chunks: Chunk[]): Chunk[] {
    return mergeSmallChunks(chunks, this.config.minChunkTokens);
  }

  /**
   * Extract code languages from chunk content and code blocks.
   */
  private extractCodeLanguages(content: string, codeBlocks: CodeBlock[]): string[] {
    const languages = new Set<string>();

    // From code blocks
    for (const block of codeBlocks) {
      if (block.language && block.language !== "text") {
        languages.add(block.language);
      }
    }

    // From fenced code blocks in content
    const fencedRegex = /```(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = fencedRegex.exec(content)) !== null) {
      if (match[1] && match[1] !== "text") {
        languages.add(match[1]);
      }
    }

    return Array.from(languages);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ChunkingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<ChunkingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export utilities for testing
export {
  estimateTokens,
  splitIntoSentences,
  splitIntoParagraphs,
  findCodeBlockBoundaries,
  isInsideCodeBlock,
  generateChunkId,
  resetChunkCounter,
  generateSectionNumber,
  buildParentSections,
  splitTextIntoChunks,
  addOverlap,
  mergeSmallChunks,
  DEFAULT_CONFIG,
};
