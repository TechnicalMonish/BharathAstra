import type {
  SearchMatch,
  ProcessedQuery,
  ExtractedSection,
  HighlightedSection,
  Highlight,
  SectionReference,
} from "@aws-intel/shared";

import * as dynamodb from "../../lib/dynamodb";
import { TABLES } from "../../config/tables";

// --- Constants ---

const MAX_EXTRACTED_SECTIONS = 5;

// --- Helper: fetch parent sections from DynamoDB ---

async function fetchParentSections(
  docId: string,
  sectionId: string
): Promise<SectionReference[]> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 1000)
    );
    const fetch = dynamodb.get({
      TableName: TABLES.Documents,
      Key: { docId, sectionId },
    });
    const item = await Promise.race([fetch, timeout]);
    if (item && Array.isArray(item.parentSections)) {
      return item.parentSections as SectionReference[];
    }
  } catch {
    // Fallback: return empty
  }
  return [];
}

// --- Helper: fetch section number from DynamoDB ---

async function fetchSectionNumber(
  docId: string,
  sectionId: string
): Promise<string> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 1000)
    );
    const fetch = dynamodb.get({
      TableName: TABLES.Documents,
      Key: { docId, sectionId },
    });
    const item = await Promise.race([fetch, timeout]);
    if (item && typeof item.sectionNumber === "string") {
      return item.sectionNumber;
    }
  } catch {
    // Fallback
  }
  return "1";
}

// --- Helper: compute keyword overlap score ---

function computeKeywordOverlap(
  content: string,
  keywords: string[]
): number {
  if (keywords.length === 0) return 0;
  const lower = content.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      matches++;
    }
  }
  return matches / keywords.length;
}

// --- Helper: find highlight ranges for answer text ---

function findHighlightRanges(
  content: string,
  query: ProcessedQuery
): Highlight[] {
  const highlights: Highlight[] = [];
  const sentences = splitIntoSentences(content);
  const searchTerms = [
    ...query.keywords,
    ...query.awsServices.map((s) => s.toLowerCase()),
    ...query.concepts.map((c) => c.toLowerCase()),
  ];

  for (const sentence of sentences) {
    const relevance = computeSentenceRelevance(sentence.text, searchTerms);
    if (relevance > 0.2) {
      highlights.push({
        text: sentence.text,
        startIndex: sentence.startIndex,
        endIndex: sentence.endIndex,
        relevanceScore: Math.round(relevance * 1000) / 1000,
      });
    }
  }

  // Sort by relevance descending
  highlights.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return highlights;
}

// --- Helper: split content into sentences with positions ---

interface SentenceSpan {
  text: string;
  startIndex: number;
  endIndex: number;
}

function splitIntoSentences(content: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  // Split on sentence-ending punctuation followed by whitespace or end of string
  const regex = /[^.!?\n]+(?:[.!?]+|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const text = match[0].trim();
    if (text.length > 0) {
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;
      spans.push({ text, startIndex, endIndex });
    }
  }

  return spans;
}

// --- Helper: compute relevance of a sentence to search terms ---

function computeSentenceRelevance(
  sentence: string,
  searchTerms: string[]
): number {
  if (searchTerms.length === 0) return 0;
  const lower = sentence.toLowerCase();
  let matches = 0;
  for (const term of searchTerms) {
    if (lower.includes(term.toLowerCase())) {
      matches++;
    }
  }
  return matches / searchTerms.length;
}

// --- SectionExtractor class ---

export class SectionExtractor {
  /**
   * Extract the most relevant sections from search matches.
   * Ranks by relevance score, takes top 5, and enriches with parent context.
   */
  async extractRelevantSections(
    matches: SearchMatch[],
    query: ProcessedQuery
  ): Promise<ExtractedSection[]> {
    if (matches.length === 0) return [];

    // Score and rank matches using both the original relevance score
    // and keyword overlap with the query
    const scored = matches.map((m) => {
      const keywordBoost = computeKeywordOverlap(m.content, query.keywords);
      const conceptBoost = computeKeywordOverlap(m.content, query.concepts);
      const combinedScore =
        m.relevanceScore * 0.6 + keywordBoost * 0.25 + conceptBoost * 0.15;
      return { match: m, combinedScore };
    });

    // Sort by combined score descending
    scored.sort((a, b) => b.combinedScore - a.combinedScore);

    // Take top N
    const topMatches = scored.slice(0, MAX_EXTRACTED_SECTIONS);

    // Build ExtractedSection for each — skip DynamoDB enrichment for speed
    // (DynamoDB won't have data unless docs were explicitly indexed)
    const sections: ExtractedSection[] = [];
    for (const { match, combinedScore } of topMatches) {
      // Use sectionId as fallback section number (e.g., "sec-0" → "0")
      const fallbackNumber = match.sectionId.replace("sec-", "") || "1";

      sections.push({
        docId: match.docId,
        docTitle: match.docTitle,
        sectionId: match.sectionId,
        sectionNumber: fallbackNumber,
        sectionTitle: match.sectionTitle,
        content: match.content,
        relevanceScore: Math.round(combinedScore * 1000) / 1000,
        parentSections: [],
      });
    }

    return sections;
  }

  /**
   * Highlight the exact sentences/paragraphs within a section that answer the query.
   * Generates highlight ranges (startIndex, endIndex) for answer text.
   */
  highlightAnswers(
    section: ExtractedSection,
    query: ProcessedQuery
  ): HighlightedSection {
    const highlights = findHighlightRanges(section.content, query);

    return {
      section,
      highlights,
    };
  }
}

// Export helpers for testing
export {
  computeKeywordOverlap,
  findHighlightRanges,
  splitIntoSentences,
  computeSentenceRelevance,
  fetchParentSections,
  fetchSectionNumber,
  MAX_EXTRACTED_SECTIONS,
  type SentenceSpan,
};
